import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST
) {
  console.error("seed-auth-e2e.mjs requires Auth and Firestore emulators.");
  process.exit(1);
}

const projectId =
  process.env.GCLOUD_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  "demo-aizu-connect-auth-e2e";

initializeApp({ projectId });

const auth = getAuth();
const db = getFirestore();
const timestamp = Timestamp.now();
const password = "password123";

for (const variant of ["desktop", "mobile", "tablet"]) {
  const uid = `student-auth-${variant}`;
  const email = `${uid}@example.com`;
  const displayName = `認証テスト学生 ${variant}`;

  await auth.createUser({
    uid,
    email,
    password,
    emailVerified: true,
    displayName,
  });

  const userData = {
    uid,
    role: "student",
    status: "pending_approval",
    email,
    displayName,
    university: "その他",
    department: "",
    grade: 1,
    interests: [],
    currentActivities: "",
    wantToTry: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const batch = db.batch();
  batch.set(db.doc(`users/${uid}`), {
    ...userData,
    termsVersion: "2026-08-01",
    privacyVersion: "2026-08-01",
    legalAcceptedAt: timestamp,
    eligibilityConfirmedAt: timestamp,
  });
  batch.set(db.doc(`studentProfiles/${uid}`), {
    ...userData,
    verificationMethod: "email_verification",
    profileCompletionRate: 80,
    activityCount: 0,
  });
  await batch.commit();
}

console.log("Lightweight auth E2E seed complete.");
