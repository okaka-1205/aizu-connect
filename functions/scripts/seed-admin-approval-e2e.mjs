import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST
) {
  console.error(
    "seed-admin-approval-e2e.mjs requires Auth and Firestore emulators.",
  );
  process.exit(1);
}

const projectId =
  process.env.GCLOUD_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  "demo-aizu-connect-admin-approval";

initializeApp({ projectId });

const auth = getAuth();
const db = getFirestore();
const timestamp = Timestamp.now();
const password = "password123";

await auth.createUser({
  uid: "admin-approval-e2e",
  email: "admin-approval@aizu-connect.local",
  password,
  emailVerified: true,
  displayName: "Aizu Connect 運営",
});
await auth.setCustomUserClaims("admin-approval-e2e", {test_admin_mfa: true});

await db.doc("users/admin-approval-e2e").set({
  uid: "admin-approval-e2e",
  role: "admin",
  status: "active",
  email: "admin-approval@aizu-connect.local",
  displayName: "Aizu Connect 運営",
  university: "Aizu Connect運営",
  department: "運営",
  grade: 1,
  interests: [],
  termsVersion: "2026-10-23",
  privacyVersion: "2026-10-23",
  legalAcceptedAt: timestamp,
  eligibilityConfirmedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
});

for (const variant of ["desktop", "mobile", "tablet", "firefox", "webkit"]) {
  const uid = `approval-sync-${variant}`;
  const email = `${uid}@example.com`;
  const displayName = `承認同期テスト ${variant}`;
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
    termsVersion: "2026-10-23",
    privacyVersion: "2026-10-23",
    legalAcceptedAt: timestamp,
    eligibilityConfirmedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const batch = db.batch();
  batch.set(db.doc(`users/${uid}`), userData);
  batch.set(db.doc(`studentProfiles/${uid}`), {
    ...userData,
    verificationMethod: "manual_review",
    profileCompletionRate: 80,
    activityCount: 0,
  });
  await batch.commit();
}

console.log("Admin approval E2E seed complete.");
