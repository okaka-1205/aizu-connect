# Aizu Connect 運用・障害対応手順

## 目的と対象

この文書は、Aizu Connect本番環境を一人でも安全に運用し、担当者が増えた場合にも同じ判断ができるようにするための手順です。対象はFirebase Hosting、Authentication、Firestore、Storage、Functions、GitHub Actionsです。個人情報や認証情報をIssue、Actionsログ、公開リポジトリへ貼り付けないでください。

## 日常確認

### 毎日

- GitHubの未解決`ops:uptime` Issueがないことを確認する。
- 利用者からの問い合わせ、通報、管理者案件を確認する。
- Firebase ConsoleでFunctionsの失敗急増や想定外の利用量がないことを確認する。

### 毎週

- 月曜日の週次CIが成功していることを確認する。
- Dependabot PRを確認し、CI成功と変更内容を確認したものだけをマージする。メジャー更新は別PRで動作確認する。
- Firestoreの週次バックアップが成功し、直近のバックアップが存在することを確認する。
- Authentication、Firestore、Storage、Functionsの利用量と請求額を確認する。

### 毎月

- 管理者アカウント、不要な権限、認証済み端末を棚卸しする。
- 本番スモーク手順の主要導線を専用アカウントで確認する。
- バックアップから新しい一時データベースへ復元できることを確認する。復元先を本番`(default)`へ向けない。
- 依存関係の重大な脆弱性、Firebaseの廃止予定機能、GitHub Actionsの警告を確認する。

## 管理者の多要素認証

- 本番の管理者は初回ログイン時にTOTP対応の認証アプリを登録する。QRコードと秘密キーをチャット、Issue、画面共有へ残さない。
- 管理者のメール確認が完了していない場合はMFAを登録しない。
- 端末紛失時は、別の管理者またはFirebaseプロジェクト所有者が本人確認を行ってから解除する。通常の問い合わせだけで解除しない。
- 解除前は必ずプレビューモードで対象メール、UID、登録要素数を確認する。

```bash
GCLOUD_PROJECT=aizu-connect-prod \
npm --prefix functions run admin:reset-mfa -- admin@example.com \
  --use-firebase-cli-credentials

GCLOUD_PROJECT=aizu-connect-prod \
npm --prefix functions run admin:reset-mfa -- admin@example.com \
  --use-firebase-cli-credentials \
  --execute --confirm=RESET_ADMIN_MFA
```

解除処理は登録済み要素を削除し、既存のリフレッシュトークンを失効させる。対象管理者はパスワードで再ログインし、新しい認証アプリを登録する。

## リリース手順

1. PRの必須CIがすべて成功していることを確認する。
2. 変更対象を`hosting`、`functions`、`firestore:rules`、`firestore:indexes`、`storage`に分類する。
3. `npm run release:check`を実行する。
4. 変更した対象だけをFirebaseへデプロイする。
5. 公開URLのHTTP 2xx、ログイン画面、変更した主要導線を確認する。
6. デプロイ時刻、GitコミットID、対象、確認結果をPRまたは非公開の運用記録へ残す。

## 障害対応

### 優先度

| レベル | 例 | 初動目標 |
| --- | --- | --- |
| P0 | 個人情報漏えい、不正な管理者権限、全利用者が利用不能 | 即時に影響拡大を止める |
| P1 | ログイン・申込・チャットなど主要機能が広範囲で失敗 | 30分以内に調査開始 |
| P2 | 一部画面や一部利用者だけの不具合、回避策あり | 当日中に記録・優先度判断 |

### 共通フロー

1. 発生時刻、影響範囲、直前のデプロイ、再現条件を記録する。個人情報は記録へ含めない。
2. GitHub Actions、Firebase Status Dashboard、Functionsログ、Hostingリリース履歴を確認する。
3. 情報漏えいや不正アクセスのおそれがある場合は、通常の復旧より先に[法務・個人情報運用手順](./legal-operations-runbook.md)へ切り替える。
4. 直前のHosting変更が原因なら、Firebase ConsoleのHostingリリース履歴から直前の正常リリースへロールバックする。
5. FunctionsまたはRulesが原因なら、正常だったGitコミットを新しい修正PRとして戻し、影響範囲のテスト後に対象だけを再デプロイする。Git履歴を書き換えない。
6. 復旧後、利用者影響、原因、対応、再発防止、検知できなかった理由を記録する。

## 監視

- `.github/workflows/uptime-monitor.yml`がHostingとFunctionsヘルスチェックを15分ごとに確認する。
- 2回の再試行後もHTTP 2xxとサービス固有の応答を得られない場合、`ops:uptime`ラベルのIssueを1件だけ作成する。
- 復旧を検知するとIssueへ時刻を記録して自動クローズする。
- GitHubのスケジュール実行は遅延・停止する場合があるため、厳密なSLA監視ではない。リポジトリ活動が60日以上ない場合は、Actions画面で定期実行が有効か確認する。
- Issue通知を受け取れるよう、GitHubアカウントの通知設定を有効にする。
- 画面描画に失敗した場合は利用者へ問い合わせ番号が表示され、FunctionsのCloud Loggingへ`Client render error`として記録される。問い合わせ番号でログを検索し、エラー本文に個人情報が含まれていないことも確認する。

## バックアップと復元

PITRまたは定期バックアップから作成した一時データベースは、内容を表示せず主要コレクションの件数だけを本番と比較する。

```bash
GCLOUD_PROJECT=aizu-connect-prod npm --prefix functions run backup:verify-restore -- restore-drill-YYYYMMDD --use-firebase-cli-credentials
```

全件数が一致したことを確認してから、一時DBだけ削除する。本番の`(default)`、PITR、定期バックアップは削除しない。

- Firestore `(default)`はPITRを有効にし、直近7日間の任意時点へ復元できる状態を維持する。
- 週次バックアップは毎週日曜日、14日保持とする。バックアップにはFirestoreデータとインデックス構成が含まれるが、TTLポリシーは含まれない。
- バックアップは元DBと同じリージョンに保管され、保存容量と復元には料金が発生する。
- 復元は常に新しいデータベースへ行い、件数、重要ドキュメント、Rules・Index適用計画を確認してから切替を判断する。
- Authenticationユーザー、Storageファイル、Hosting、FunctionsコードはFirestoreバックアップの対象外である。コードはGit、ファイルはStorageの保持方針、認証はFirebaseの運用機能で別途管理する。
- バックアップスケジュールを変更・削除した場合は、理由、実行者、日時を非公開の運用記録へ残す。

## 連絡と記録

- 公開連絡は障害の事実、影響、回避策、次回更新予定だけを簡潔に伝え、推測を書かない。
- セキュリティ・個人情報事故は公開Issueへ記録せず、アクセス制限された運用記録を使う。
- 復旧後24時間以内を目安に振り返りを作成し、再発防止をIssueへ分解する。

## 関連資料

- [本番スモークテスト](./production-smoke-test.md)
- [リリース準備状況](./release-readiness-2026-10-19.md)
- [法務・個人情報運用手順](./legal-operations-runbook.md)
- [法務運用記録テンプレート](./legal-operations-templates.md)
