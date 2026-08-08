import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

if (!authEmulatorHost || !firestoreEmulatorHost) {
  console.error(
    "このスクリプトはFirebase Emulator専用です。FIREBASE_AUTH_EMULATOR_HOSTとFIRESTORE_EMULATOR_HOSTを設定して実行してください。",
  );
  process.exit(1);
}

initializeApp({
  projectId:
    process.env.GCLOUD_PROJECT ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    "demo-aizu-connect-local",
});

const email = "admin@aizu-connect.local";
const password = "admin123";
const auth = getAuth();
const db = getFirestore();

let user;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, {
    password,
    emailVerified: true,
    disabled: false,
    displayName: "Aizu Connect 運営",
  });
} catch (error) {
  if (error.code !== "auth/user-not-found") throw error;
  user = await auth.createUser({
    email,
    password,
    emailVerified: true,
    displayName: "Aizu Connect 運営",
  });
}

await db.doc(`users/${user.uid}`).set(
  {
    uid: user.uid,
    role: "admin",
    status: "active",
    email,
    displayName: "Aizu Connect 運営",
    university: "Aizu Connect運営",
    department: "運営",
    grade: 1,
    interests: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  { merge: true },
);

console.log(
  `Emulator admin ready: type admin / admin in the DEV login form (${email} / ${password}, ${user.uid})`,
);
