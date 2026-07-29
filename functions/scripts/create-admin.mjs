import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const email = process.argv[2]?.trim();

if (!email) {
  console.error("Usage: npm run admin:create -- admin@example.com");
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT,
});

const user = await getAuth().getUserByEmail(email);
if (user.disabled) {
  throw new Error("The target Authentication user is disabled.");
}
if (!user.emailVerified) {
  throw new Error(
    "Verify the target email address before granting administrator access.",
  );
}

const userRef = getFirestore().doc(`users/${user.uid}`);
const userSnapshot = await userRef.get();

if (!userSnapshot.exists) {
  throw new Error(
    "The target user has no Firestore profile. Register through the app first.",
  );
}
if (userSnapshot.get("uid") !== user.uid) {
  throw new Error(
    "The Authentication UID does not match the Firestore profile.",
  );
}

await userRef.update({
  role: "admin",
  status: "active",
  email: user.email ?? null,
  updatedAt: new Date(),
});

console.log(`Admin role granted to ${email} (${user.uid}).`);
