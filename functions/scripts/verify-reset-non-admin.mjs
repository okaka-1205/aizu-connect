import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const projectId = "demo-aizu-connect-reset";
const storageBucket = `${projectId}.appspot.com`;
const requiredEmulators = [
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
];

if (requiredEmulators.some((name) => !process.env[name])) {
  throw new Error("The reset verification requires Auth, Firestore and Storage emulators.");
}

initializeApp({ projectId, storageBucket });
const auth = getAuth();
const db = getFirestore();
const bucket = getStorage().bucket();

await Promise.all([
  auth.createUser({
    uid: "admin-reset-test",
    email: "admin-reset@example.com",
    emailVerified: true,
  }),
  auth.createUser({
    uid: "student-reset-test",
    email: "student-reset@u-aizu.ac.jp",
    emailVerified: true,
  }),
  auth.createUser({
    uid: "orphan-auth-reset-test",
    email: "orphan-reset@example.com",
    emailVerified: true,
  }),
]);

await Promise.all([
  db.doc("users/admin-reset-test").set({
    uid: "admin-reset-test",
    role: "admin",
    status: "active",
  }),
  db.doc("users/student-reset-test").set({
    uid: "student-reset-test",
    role: "student",
    status: "active",
  }),
  db.doc("legalConsents/admin-reset-test_legal").set({
    userId: "admin-reset-test",
  }),
  db.doc("legalConsents/student-reset-test_legal").set({
    userId: "student-reset-test",
  }),
  db.doc("notifications/admin-reset-test_notice").set({
    recipientId: "admin-reset-test",
  }),
  db.doc("notifications/student-reset-test_notice").set({
    recipientId: "student-reset-test",
  }),
  db.doc("notificationPreferences/admin-reset-test").set({
    userId: "admin-reset-test",
  }),
  db.doc("notificationPreferences/student-reset-test").set({
    userId: "student-reset-test",
  }),
  db.doc("studentProfiles/student-reset-test").set({
    uid: "student-reset-test",
  }),
  db.doc("events/student-reset-event").set({
    createdBy: "student-reset-test",
  }),
  db.doc("chatRooms/student-reset-room/messages/message-1").set({
    senderId: "student-reset-test",
  }),
  db.doc("auditLogs/reset-audit-preserved").set({
    actorId: "admin-reset-test",
  }),
]);

await Promise.all([
  bucket.file("profile-images/admin-reset-test/avatar.png").save("admin"),
  bucket.file("profile-images/student-reset-test/avatar.png").save("student"),
  bucket.file("event-images/student-reset-test/event/image.png").save("event"),
  bucket.file("chat-attachments/student-reset-room/file.txt").save("chat"),
]);

execFileSync(
  process.execPath,
  [
    "functions/scripts/reset-non-admin-accounts.mjs",
    "--execute",
    "--confirm=RESET_NON_ADMIN_ACCOUNTS",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GCLOUD_PROJECT: projectId,
    },
    stdio: "inherit",
  },
);

assert.equal((await auth.getUser("admin-reset-test")).uid, "admin-reset-test");
await assert.rejects(
  auth.getUser("student-reset-test"),
  (error) => error?.code === "auth/user-not-found",
);
await assert.rejects(
  auth.getUser("orphan-auth-reset-test"),
  (error) => error?.code === "auth/user-not-found",
);
assert.equal((await db.doc("users/admin-reset-test").get()).exists, true);
assert.equal((await db.doc("users/student-reset-test").get()).exists, false);
assert.equal(
  (await db.doc("legalConsents/admin-reset-test_legal").get()).exists,
  true,
);
assert.equal(
  (await db.doc("legalConsents/student-reset-test_legal").get()).exists,
  false,
);
assert.equal(
  (await db.doc("notifications/admin-reset-test_notice").get()).exists,
  true,
);
assert.equal(
  (await db.doc("notificationPreferences/admin-reset-test").get()).exists,
  true,
);
assert.equal((await db.doc("studentProfiles/student-reset-test").get()).exists, false);
assert.equal((await db.doc("events/student-reset-event").get()).exists, false);
assert.equal((await db.doc("chatRooms/student-reset-room").get()).exists, false);
assert.equal((await db.doc("auditLogs/reset-audit-preserved").get()).exists, true);
assert.equal((await bucket.file("profile-images/admin-reset-test/avatar.png").exists())[0], true);
assert.equal((await bucket.file("profile-images/student-reset-test/avatar.png").exists())[0], false);
assert.equal((await bucket.getFiles({ prefix: "event-images/" }))[0].length, 0);
assert.equal((await bucket.getFiles({ prefix: "chat-attachments/" }))[0].length, 0);

console.log("Non-admin reset verification complete.");
