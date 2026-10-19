# Firestore Security Rules 差分監査（2026-10-19）

## 対象と前提

- データベース: `(default)` / Firestore Native / Standard edition
- 対象差分: 利用規約・プライバシーポリシーの必須版を `2026-10-19` へ更新
- データモデル、collection path、read/write 権限、validator の条件は変更しない
- 既存の deny-by-default と管理者・本人・主催者ごとの権限分離を維持する

## フェーズ1・2: アクセス制御と検証

- `users`: 本人または管理者のみ read。create/update は既存の厳格な schema、本人性、状態遷移、権限フィールド固定を継続。
- `legalConsents`: 本人または管理者のみ read。create のみ許可し、ID・本人UID・必須版・同意時刻を固定。update/delete は拒否。
- `studentProfiles`: 本人または管理者のみ read。本人編集、初回有効化、規約再同意、管理者審査は既存の別条件を継続。
- イベント、申請、チャット、通知、通報、チェックイン等: 今回の差分なし。
- 最終 catch-all は read/write とも拒否。

## フェーズ3: Devil's Advocate

今回の版番号差分に対し、以下を Security Rules テストで確認する。

| 攻撃・誤操作 | 期待結果 |
| --- | --- |
| 古い版または任意の版でユーザーを作成・再同意 | 拒否 |
| 別ユーザーIDを含む同意記録を作成 | 拒否 |
| 同意記録IDと本文の版を不一致にする | 拒否 |
| 同意記録を更新・削除 | 拒否 |
| 規約再同意に権限昇格用フィールドを混在 | 拒否 |
| 他人のユーザー・プロフィール・同意記録を読む | 拒否（管理者を除く） |
| schema外フィールド、型不一致、巨大値を追加 | 既存validatorで拒否 |
| 所有者・作成日時・ロール等の不変フィールドを変更 | 既存validatorで拒否 |
| 未定義collectionへアクセス | catch-allで拒否 |

版番号以外の式は変更していないため、公開list、状態遷移、counter、path scoping、subcollection、query整合性に新しい攻撃面は追加されない。全Rulesテストとdry-run相当の構文検証を実施して確認する。

## フェーズ4: 検証結果

- Security Rulesテスト: Firestore・Storage 34件成功。認証なし、他人操作、権限昇格、schema汚染、同意記録改ざんを拒否することを確認。
- dry-run相当の構文検証: `firebase deploy --only firestore:rules --dry-run` 成功。`firestore.rules` のコンパイルエラーなし。
