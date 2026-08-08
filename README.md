# Aizu Connect

学生が人と出会い、新しい経験や挑戦のきっかけを見つける、会津の活動プラットフォームです。

利益を目的とするのではなく、まだやりたいことが見つかっていない人や、何かに挑戦したい人が、気軽に活動へ参加できる場所を目指します。

## 開発環境

Node.js 24を使用します（`.nvmrc`対応環境では`nvm use`で切り替え）。

```bash
npm install
npm run dev
```

`npm run dev`は`npm run dev:local`を呼び出し、端末内のFirebase Emulatorだけを使用します。Functionsのビルド、Auth・Firestore・Storage・Functions Emulatorの起動、確認用データの投入、Viteの起動までをまとめて行います。

```bash
npm run dev:local
```

ローカル確認用URL：

- React: `http://127.0.0.1:5173/`
- Authentication: `127.0.0.1:19099`
- Firestore: `127.0.0.1:18082`
- Functions: `127.0.0.1:15001`
- Storage: `127.0.0.1:19197`

確認用アカウント：

| ロール       | メールアドレス             | パスワード    |
| ------------ | -------------------------- | ------------- |
| 学生         | `student-e2e@u-aizu.ac.jp` | `password123` |
| 主催者・団体 | `org-e2e@example.com`      | `password123` |
| 管理者       | `admin@aizu-connect.local` | `admin123`    |
| 承認待ち     | `pending-e2e@example.com`  | `password123` |

## Firebase設定

本番用設定は、プロジェクトのルートにある`.env.production`で管理します。このファイルはGitへ追加しません。設定項目は`.env.example`を参照してください。

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_APP_CHECK_SITE_KEY=...
VITE_LEGAL_OPERATOR_NAME=...
VITE_LEGAL_OPERATOR_ADDRESS=...
VITE_LEGAL_REPRESENTATIVE=...
VITE_LEGAL_CONTACT_EMAIL=...
```

本番ビルドでは次を設定します。

```env
VITE_USE_FIREBASE_EMULATORS=false
```

ローカル開発から本番Firebaseへ直接接続する運用は禁止します。クラウド上の確認はデプロイ後の本番URLで行ってください。

## ロール

- `student`: イベント検索、申請、チャット、Activity Portfolio
- `organization`: 活動の作成、審査申請、参加者確認、出欠登録
- `admin`: アカウント審査、イベント承認

最初の管理者は、Firebase Admin SDKなど信頼できるサーバー側の手順で`users/{uid}`に`role: "admin"`、`status: "active"`を設定してください。クライアントから管理者へ変更できないRulesになっています。

### 管理者の初期設定

対象ユーザーを先に通常のメールアドレスで登録し、メール確認を完了した後、Firebase Admin SDKが利用できる環境で実行します。サービスアカウント鍵をリポジトリへ置かず、`GOOGLE_APPLICATION_CREDENTIALS`またはApplication Default Credentialsを使用してください。

```bash
gcloud auth application-default login
GCLOUD_PROJECT=aizu-connect-prod npm --prefix functions run admin:create -- admin@example.com
```

コマンドが成功したら、Authenticationの対象UIDとFirestoreの
`users/{uid}`が一致し、`role: "admin"`、`status: "active"`になっていることを
確認します。本番環境では、作業後に認証情報を端末から削除し、管理者アカウントへ
強い固有パスワードと多要素認証を設定してください。

### Emulatorでの管理者ログイン

開発中のFirebase Emulatorには、次のコマンドで運営アカウントを作成できます。

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
GCLOUD_PROJECT=demo-aizu-connect-local \
npm --prefix functions run admin:seed-emulator
```

開発画面のログインフォームでは、メールアドレスに`admin`、パスワードに`admin`と入力できます。これは開発環境だけのショートカットで、Firebase Authenticationの最低文字数制限を満たす実体アカウントへ内部変換します。本番ビルドでは有効になりません。

登録した学生をEmulator上でメール確認済みにして、参加申請のFunctions処理を確認する場合は次を使います。

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=demo-aizu-connect-local \
npm --prefix functions run emulator:verify-user -- student@example.com
```

基本の運営確認フローは、主催者登録 → 管理者でアカウント承認 → 主催者でイベント申請 → 管理者でイベント公開 → 学生で参加申請 → 主催者で参加承認 → 学生の活動実績確認です。

## 確認コマンド

```bash
npm run lint
npm run build
npm run check
```

`Firebase: Error (auth/network-request-failed)` が表示された場合は、クラウド接続が制限されている可能性があります。起動中の通常開発サーバーを終了して`npm run dev:local`を使用してください。

Functionsを使う場合：

```bash
npm --prefix functions install
npm --prefix functions run build
```

## Hostingへの公開

Firebaseプロジェクト`aizu-connect-prod`を正式な本番環境として使用します。
旧`aizu-connect-dev`は移行確認とロールバックのためだけに保持します。
通常の開発と自動テストには`npm run dev:local`とEmulatorを使用し、本番データへ
テストデータを投入しないでください。

本番用設定は`.env.production`で管理し、`VITE_USE_FIREBASE_EMULATORS=false`を必須にします。`npm run build`は設定値と生成物を検査し、テストアカウント・Emulator接続先・仮画像サービスが混ざっている場合は失敗します。

利用規約とプライバシーポリシーには、公開可能な正式情報として
`VITE_LEGAL_OPERATOR_NAME`、`VITE_LEGAL_OPERATOR_ADDRESS`、
`VITE_LEGAL_REPRESENTATIVE`、`VITE_LEGAL_CONTACT_EMAIL`を設定します。
未入力、仮メールアドレス、プレースホルダーを含む場合、本番ビルドは失敗します。
登録時と重要改定後の再ログイン時には規約同意が必須で、同意日時、規約版、
年齢・法定代理人同意の確認をFirestoreの変更不可な同意記録へ保存します。
参加申請時の主催者への第三者提供記録は原則3年間保存し、期限後は
`purgeExpiredLegalRecords`が削除します。

管理者Callable FunctionsでApp Checkを強制する場合は、Firebase Consoleで
reCAPTCHA Enterpriseを登録し、`.env.production`へ
`VITE_FIREBASE_APP_CHECK_SITE_KEY`を設定します。Functions側には
`ENFORCE_ADMIN_APP_CHECK=true`を設定してください。クライアント設定前に
Functions側だけを有効化すると管理者操作が拒否されるため、同じリリースで
反映します。

```bash
npm run release:check
npx -y firebase-tools@latest deploy \
  --project aizu-connect-prod \
  --only hosting,functions,firestore:rules,firestore:indexes,storage
```

デプロイ前に、Firebase ConsoleでAuthentication、Firestore、Storage、必要なBlazeプラン、承認済みドメインを確認してください。

## リリース前チェック

- 開発・E2EテストはEmulatorだけで行い、`aizu-connect-prod`へテストデータを投入しない
- 本番Authenticationに初期管理者を作成し、メール確認とMFAを完了する
- `.env.production`と`functions/.env.*`をGitへ追加しない
- Firestore Rulesを本番データで検証する
- Authenticationのメール認証とパスワード再設定を確認する
- Storageを使う場合はStorage Rulesを追加する
- 運営者名、住所、代表者、問い合わせ先を本番環境変数へ設定する
- 主催者契約・審査手順に、参加者情報の目的外利用禁止と事故・漏えい時の連絡義務を定める
- 有料イベントの販売主体、住所、電話番号、責任者、支払・返金条件を実在情報で確認する
- Cloud Schedulerで`purgeExpiredLegalRecords`が有効であることを確認する
- Emulatorではなく本番Firebaseで学生・主催者・管理者の3導線をE2E確認する
- 個人情報の開示等請求、漏えい等報告、委託先管理の社内手順を整備する
