# Aizu Connect リリース準備最終確認（2026年10月19日）

## 判定

**少人数のクローズドβは開始可能**。コード、Rules、CI、依存関係、本番インフラに公開を止める不具合は確認されていない。

正式な一般公開前には、管理者MFA対応と、専用3ロールアカウントによる本番一連動線の手動確認を完了する。これらは認証アプリ、実メール、カメラを使うため、本資料では実機確認項目として分離する。

## 完了した確認

- `main`の通常CIと手動`release-gates`が成功。
- ローカル`npm run release:check`が成功（明示的テスト277件、Playwright 190件）。
- フロントエンドとFunctionsの本番依存パッケージに、`npm audit --omit=dev --audit-level=high`で既知脆弱性0件。
- 本番URLはHTTP 200。HSTS、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、`X-Frame-Options`を確認。
- App CheckはFirestore、Storage、Authenticationで適用済み。Functionsの管理系callableも本番環境変数で強制。
- 本番FunctionsはNode.js 24で13個稼働。
- `purgeExpiredLegalRecords`は毎日03:00（Asia/Tokyo）、`sendEventReminders`は毎時でEnabled。2026-10-19の直近実行はいずれも成功。
- FirestoreはStandard / Native、asia-northeast1。削除保護と7日間のPoint-in-Time Recoveryが有効。
- 本番Authのメール探索対策は有効。新規パスワードは10文字以上を必須化し、既存ユーザーへの即時変更強制は行っていない。
- 有効な管理者2件はどちらもAuthenticationと一致し、メール確認済み、無効化なし。
- 本番申込4件を読み取り専用監査。1件は`eventStartAt`/`eventEndAt`を内包していないが、関連イベントが存在し日時を取得できるため移行不要。
- 本番チャット6室を監査。membersサブコレクションは10/10件揃っていた。2室の`memberCount`だけを実数へ修正し、`adminOperations`へ監査記録を残した。再監査で不一致0件。
- 本番Gmailへの確認メール・パスワード再設定メール到達を確認。

## 外部制約で保留中

### Firebase認証メールのブランド表記

表示名`Aizu Connect`、日本語件名・本文、返信先をFirebase Consoleから保存しようとすると、プロジェクト側でメールテンプレート更新不可のエラーになる。APIでも更新が拒否される。現状の配送自体は成功している。

2026年10月19日、プロジェクト`aizu-connect-prod`、Authentication、Console UIのTroubleshootingとしてFirebase公式サポートへ解除依頼を送信した。受付画面で送信完了を確認済み。通常は2営業日以内の回答予定で、回答後に再設定・再受信確認する。

独自ドメイン購入、外部メール配信サービス、有料監視サービスは導入しない。

## 実機でのみ残す確認

1. 管理者向けTOTP MFAのクライアント対応後、各管理者本人が認証アプリへ登録し、復旧手順を保管する。
2. 専用の学生・主催者・管理者アカウントで、メール認証からイベント作成、承認、申込、キャンセル待ち、チャット、受付、アンケート、活動報告まで通す。
3. 実メールのリンク遷移、迷惑メール判定、App Checkの通常ブラウザトークンを確認する。
4. 実カメラでQR受付を確認する。
5. スマートフォン実機でSafari/Chromeの主要画面、キーボード、画像アップロードを確認する。

## 公開後の運用

- 最初の3〜5日は少人数で利用し、管理者が問い合わせ、審査待ち、Functionsエラー、Firestore使用量を毎日確認する。
- 有料イベントは、販売主体、責任者、住所、電話番号、総額、支払時期、キャンセル・返金条件が実在情報であることを公開前に審査する。
- 法務対応は`docs/legal-operations-runbook.md`と`docs/legal-operations-templates.md`に従って記録する。
- 本番データの移行は、読み取り監査で必要性と対象件数を確認し、PITR期間内にロールバック方針を決めてから実行する。
