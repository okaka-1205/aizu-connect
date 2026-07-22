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
const userRef = getFirestore().doc(`users/${user.uid}`);

await userRef.set(
  {
    role: "admin",
    status: "active",
    updatedAt: new Date(),
  },
  { merge: true },
);

console.log(`Admin role granted to ${email} (${user.uid}).`);
