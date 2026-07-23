# Aizu Connect

学生が人と出会い、新しい経験や挑戦のきっかけを見つける、会津の活動プラットフォームです。

利益を目的とするのではなく、まだやりたいことが見つかっていない人や、何かに挑戦したい人が、気軽に活動へ参加できる場所を目指します。

## 開発環境

```bash
npm install
npm run dev
```

`.env.local`のFirebaseプロジェクトへ接続せず、端末内だけで全ロールを確認する場合は次のコマンドを使います。Functionsのビルド、Auth・Firestore・Storage・Functions Emulatorの起動、確認用データの投入、Viteの起動までをまとめて行います。

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

| ロール | メールアドレス | パスワード |
| --- | --- | --- |
| 学生 | `student-e2e@u-aizu.ac.jp` | `password123` |
| 主催者・団体 | `org-e2e@example.com` | `password123` |
| 管理者 | `admin@aizu-connect.local` | `admin123` |
| 承認待ち | `pending-e2e@example.com` | `password123` |

## Firebase設定

プロジェクトのルートに`.env.local`を作成します。

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

本番Firebaseへ接続して確認する場合だけ、次を設定します。

```env
VITE_USE_FIREBASE_EMULATORS=false
```

通常の`npm run dev`では、設定を省略するとブラウザSDKはEmulatorへ接続しません。Emulatorを使う場合は、接続設定を含む`npm run dev:local`を使用してください。

## ロール

- `student`: イベント検索、申請、チャット、Activity Portfolio
- `organization`: 活動の作成、審査申請、参加者確認、出欠登録
- `admin`: アカウント審査、イベント承認

最初の管理者は、Firebase Admin SDKなど信頼できるサーバー側の手順で`users/{uid}`に`role: "admin"`、`status: "active"`を設定してください。クライアントから管理者へ変更できないRulesになっています。

### 管理者の初期設定

対象ユーザーを先に通常のメールアドレスで登録した後、Firebase Admin SDKが利用できる環境で実行します。サービスアカウント鍵をリポジトリへ置かず、`GOOGLE_APPLICATION_CREDENTIALS`またはApplication Default Credentialsを使用してください。

```bash
gcloud auth application-default login
GCLOUD_PROJECT=aizu-connect-prod npm --prefix functions run admin:create -- admin@example.com
```

本番環境では、作業後に認証情報を端末から削除し、管理者アカウントへ強いパスワードと多要素認証を設定してください。

### Emulatorでの管理者ログイン

開発中のFirebase Emulatorには、次のコマンドで運営アカウントを作成できます。

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
GCLOUD_PROJECT=aizu-connect-dev \
npm --prefix functions run admin:seed-emulator
```

開発画面のログインフォームでは、メールアドレスに`admin`、パスワードに`admin`と入力できます。これは開発環境だけのショートカットで、Firebase Authenticationの最低文字数制限を満たす実体アカウントへ内部変換します。本番ビルドでは有効になりません。

登録した学生をEmulator上でメール確認済みにして、参加申請のFunctions処理を確認する場合は次を使います。

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=aizu-connect-dev \
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

本番用`.env.local`を設定し、Emulatorを使わないことを確認してからビルド・デプロイします。

```bash
VITE_USE_FIREBASE_EMULATORS=false npm run build
firebase use aizu-connect-prod
firebase deploy --only hosting,firestore,functions
```

デプロイ前に、Firebase ConsoleでAuthentication、Firestore、Storage、必要なBlazeプラン、承認済みドメインを確認してください。

## リリース前チェック

- 本番プロジェクトと開発プロジェクトを分離する
- `.env.local`をGitへ追加しない
- Firestore Rulesを本番データで検証する
- Authenticationのメール認証とパスワード再設定を確認する
- Storageを使う場合はStorage Rulesを追加する
- 主催者・学生の個人情報、チャット保存期間、通報対応を利用規約へ明記する
- Emulatorではなく本番Firebaseで学生・主催者・管理者の3導線をE2E確認する
- アプリ内の利用規約・プライバシーポリシーを運営者情報付きの正式版へ差し替える
