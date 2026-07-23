import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error(
    "このスクリプトはFirebase Auth Emulator専用です。FIREBASE_AUTH_EMULATOR_HOSTを設定して実行してください。",
  );
  process.exit(1);
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run emulator:verify-user -- user@example.com");
  process.exit(1);
}

initializeApp({
  projectId:
    process.env.GCLOUD_PROJECT ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    "aizu-connect-dev",
});

const user = await getAuth().getUserByEmail(email);
await getAuth().updateUser(user.uid, { emailVerified: true });
console.log(`Email verified in emulator: ${email} (${user.uid})`);
