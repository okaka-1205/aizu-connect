# チャット添付の認可修正（2026年11月1日）

## 修正内容

チャット添付を`sendChatAttachment` callable経由に変更した。Storage Rulesでユーザー・メンバー・部屋の3文書を参照する経路をなくし、現在の権限をFunctions側で確認する。調査で判明した仕様との不整合への修正であり、本番でアップロード拒否を再現したという意味ではない。[調査記録](./storage-rule-investigation-2026-11-01.md)

- 認証済み・メール認証済みで、現在有効な学生・団体だけが送信できる。本番の既存設定に従ってApp Checkを要求する。
- 現在のメンバー文書と旧`participantIds`方式の双方に対応する。部屋が投稿可能で、関連イベントと所有者が存在し、削除中でないことを確認する。中止イベントへの新規送信も拒否する。
- 保存前と保存後のFirestoreトランザクションで権限を確認する。後半でメッセージと一覧プレビューを同時に登録する。
- 送信者ID・学生の表示名・団体名はサーバーの保存済み情報を使う。取得時の`Content-Disposition`にも日本語・記号を安全にエンコードしたファイル名を設定する。ファイル名は200文字、学生の表示名は80文字、団体名は登録仕様に沿う100文字までとする。
- 従来どおり10MiB未満、JPEG・PNG・WebP・PDF・テキスト・CSVを受け付ける。空のテキストファイルにも対応する。
- クライアントのStorage RPCと、添付情報を持つメッセージの直接作成は拒否する。テキスト送信は既存のFirestore経路を維持する。

既存・新規の添付は、これまでと同じトークン付きURLで表示・ダウンロードする。新しいStorageルールでも既存URLを無効化する処理は行わない。URLを知る人が取得できるという従来の性質も変えていない。URLからの取得はStorage Rulesによる利用停止時の即時失効を保証する方式ではない。[Admin Storage公式説明](https://firebase.google.com/docs/storage/admin/start)

プロフィール・イベント・活動報告の画像は既存の直接アップロードを維持し、共通のユーザー参照を整理した。評価器が要求する異なる文書パスを計測した結果、チャット添付は0件、その他は最大2件となる。エミュレーターの許可判定だけに依存せず、参照数そのものを回帰テストする。[Storage Rules公式制限](https://firebase.google.com/docs/storage/security/rules-conditions)

## 再送・中断・削除との競合

ブラウザーはファイル内容・部屋・アカウント・ファイル名・形式を照合し、送信失敗から15分間は同じ要求IDを再利用する。同時送信もまとめる。成功後に同じファイルを選び直した場合は新規投稿になる。再読み込み・別端末・15分経過後までの重複排除は保証しない。

サーバーはアカウント・部屋・要求IDから投稿IDを決め、要求IDに紐づく内容の変更を拒否する。ファイルは試行ごとのUUIDで保存し、競合した試行の余分なファイルを回収する。投稿IDと内容照合情報はソフト削除後も残り、失われた応答の再試行で削除済みメッセージが復活しない。

保存前にサーバー専用`chatAttachmentUploads`記録を作る。通常成功時にはメッセージ登録と同時に削除する。確実な権限拒否などではその試行のファイルを回収し、保存・コミット結果が不明な通信障害では記録を残す。

既存の日次`purgeExpiredLegalRecords`に、15分を過ぎた試行の照合・回収を追加した。投稿が参照しているファイルは維持し、余分なファイルは試行ID・内容照合情報・Storage generationが一致した場合だけ削除する。通常は次の日次実行で回収するが、処理失敗時は記録を保持して後続の実行で再試行する。15分で必ず削除されるTTLではない。管理者を保持するアカウント一括初期化も、この試行記録を清掃対象に追加した。

## 通信・実行の制約

ブラウザーからFunctionsへはbase64で送るため、添付本体より約33%大きい送信量になる。上限直前の10,485,759バイトはbase64で13,981,012文字となる。2世代Functionsの非圧縮HTTP要求上限32MBには収まるが、実機回線での速度改善を示す変更ではない。[Functions公式割り当て](https://firebase.google.com/docs/functions/quotas)

サーバーは512MiB、1インスタンス同時実行2、最大5インスタンス、300秒上限。Storage保存は60秒のタイムアウトと作成専用条件を指定する。クライアントのcallable待機は360秒。URLは保存時に発行したトークンから組み立て、追加のメタデータ取得を行わない。

## 検証

自動確認は`npm run test:attachments:emulator`で再実行でき、CIと`release:check`にも追加した。合成データと`demo-aizu-connect-attachments`のみを使用する。

- 文書参照予算10件：通常画像・管理者MFA・停止アカウント・メール未認証・直接添付操作。許可判定に加え、Firestoreアクセス先が2件以内であることを検査する。
- 添付統合21件：通常の添付、団体名と旧メンバー方式、認証・停止・参加権限・閲覧専用・削除・中止の拒否、保存後の権限変更、同時再送、内容の衝突、失われたStorage応答・Firestoreコミット応答、回収処理による別ファイルの削除防止、空ファイル、退会時の匿名化と内部保存先情報の削除を検証する。
- 実HTTP境界4件：未認証拒否、Authでログイン後に10,485,759バイトを実送信して内容一致を確認、同じ要求の再送、10MiBちょうどの拒否。
- 既存のFirestore・Storage Rulesテストに、添付情報とサーバー専用試行記録の直接作成・読み取りの拒否を追加した。

`CI=true npm run release:check`は終了コード0で完了した。フロント86件＋本番App Check構成1件、Functions50件、Rules43件、既存回帰25件、添付の追加確認35件が成功。本番ビルド・型検査・Lint、通知ページング、定期清掃、管理者を保持する一括初期化も成功した。ブラウザー240件の最終失敗は0件（25＋20＋5＋135＋55）。アクセシビリティのWebKitでログイン待ちの再試行が1回発生し、再試行では成功した。初回の主要操作135件では、キャンセル待ち繰上げの画面遷移でChromiumが1件失敗、Mobileが1件再試行となった。テスト実行中のファイル更新による画面再読み込みの影響が疑われるため、更新を止めて再検証し、主要操作135件は再試行なしですべて成功した。再実行中は171入力のソースハッシュが開始時から変化していないことを確認した。総合確認後に、元のファイル名を返すHTTPヘッダーを追加し、日本語・記号を含む名前と本文の取得、添付の35件を再検証した。検証ログは`/private/tmp/aizu-attachments-release-final.log`と`/private/tmp/aizu-attachments-download-final.log`。再試行があった管理画面のキーボード操作は、5構成で各3回、計15回を`--retries=0`で追加確認し、すべて成功した。ログは`/private/tmp/aizu-attachments-a11y-focused.log`。本番の認証済み利用者としての送信や、実機回線での負荷・遅延測定は行っていない。

## 本番反映時

本修正は2026年11月2日に本番反映済み。[反映記録](./deployment-security-2026-11-02.md)を参照。Functions、Hosting、Firestore Rules、Storage Rulesを合わせて反映する。新しい`sendChatAttachment`と既存の清掃関数の更新が必要。試行記録の期限検索は単一フィールドで、新しい複合インデックスは不要。

移行時はFunctionsを先に反映し、新しいフロントを公開してから直接添付経路を閉じる。古い画面を開いたままの利用者は再読み込みが必要になる。旧フロントだけに戻しても添付送信は復旧しないため、ロールバックは関係するルールとセットで判断する。既存の7件の未反映修正もあるため、[修正記録](./code-review-fixes-2026-11-01.md)と合わせて扱う。

Rulesの評価は今回の差分に限定した[監査JSON](./security-rules-audit-chat-2026-11-01.json)を参照。テストでアプリ全体・将来の変更までの安全性を保証するものではない。

> I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for server-authorized attachments, owner-scoped text messages, and private upload reconciliation records. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

総合チェック時の171入力は`.codex-artifacts/chat-attachment-fixes-2026-11-01/source-manifest.json`、ファイル名ヘッダーとそのテストの追加後は`source-manifest-final.json`に記録した。後者のソース指紋は`a7e9d213ac93e7fb5c75d2e66440a731ee7e390be51db5bc9173e6f97b1acf63`。
