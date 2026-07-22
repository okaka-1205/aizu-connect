# Aizu Connect

会津の学生と地域のイベント、企業・団体をつなぐWebアプリです。

## 開発環境

```bash
npm install
npm run dev
```

Firebase Emulatorを使う場合は、別のターミナルで起動します。

```bash
firebase emulators:start
```

標準URL：

- React: `http://127.0.0.1:5173/`
- Emulator UI: `http://127.0.0.1:4000/`
- Authentication: `127.0.0.1:9099`
- Firestore: `127.0.0.1:8080`
- Hosting Emulator: `http://127.0.0.1:5002/`

`src/lib/firebase.ts`は開発時にAuthとFirestoreへ自動接続します。Auth Emulatorだけを起動する場合は次のコマンドを使えます。

```bash
firebase emulators:start --only auth
```

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

ローカルでEmulatorを使う場合は`true`に設定し、別ターミナルで`firebase emulators:start`を起動してください。設定を省略した場合、ブラウザSDKはEmulatorへ接続しません。

## ロール

- `student`: イベント検索、申請、チャット、Activity Portfolio
- `organization`: イベント作成、審査申請、応募者確認、出欠登録
- `admin`: アカウント審査、イベント承認

最初の管理者は、Firebase Admin SDKなど信頼できるサーバー側の手順で`users/{uid}`に`role: "admin"`、`status: "active"`を設定してください。クライアントから管理者へ変更できないRulesになっています。

### 管理者の初期設定

対象ユーザーを先に通常のメールアドレスで登録した後、Firebase Admin SDKが利用できる環境で実行します。サービスアカウント鍵をリポジトリへ置かず、`GOOGLE_APPLICATION_CREDENTIALS`またはApplication Default Credentialsを使用してください。

```bash
gcloud auth application-default login
GCLOUD_PROJECT=aizu-connect-prod npm --prefix functions run admin:create -- admin@example.com
```

本番環境では、作業後に認証情報を端末から削除し、管理者アカウントへ強いパスワードと多要素認証を設定してください。

## 確認コマンド

```bash
npm run lint
npm run build
npm run check
```

`Firebase: Error (auth/network-request-failed)` が表示された場合は、開発サーバーとは別のターミナルで`firebase emulators:start`を起動し、Auth Emulatorの`9099`番ポートが利用可能か確認してください。すでに別のEmulatorが起動している場合は、二重起動せずそのままViteを再読み込みします。

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
- 企業・学生の個人情報、チャット保存期間、通報対応を利用規約へ明記する
- Emulatorではなく本番Firebaseで学生・主催者・管理者の3導線をE2E確認する
- アプリ内の利用規約・プライバシーポリシーを運営者情報付きの正式版へ差し替える
