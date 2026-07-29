import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST
) {
  console.error("verify-admin-cleanup.mjs requires Firebase emulators.");
  process.exit(1);
}

const projectId =
  process.env.GCLOUD_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  "demo-aizu-connect-e2e";
const storageBucket = `${projectId}.appspot.com`;

initializeApp({ projectId, storageBucket });

const auth = getAuth();
const db = getFirestore();
const bucket = getStorage().bucket();

for (const variant of ["desktop", "mobile", "tablet"]) {
  const userId = `admin-delete-user-${variant}`;
  const eventId = `admin-delete-event-${variant}`;
  const roomId = `${eventId}_${userId}`;

  assert.equal((await db.doc(`users/${userId}`).get()).exists, false);
  await assert.rejects(
    auth.getUser(userId),
    (error) => error?.code === "auth/user-not-found",
  );
  assert.equal((await db.doc(`events/${eventId}`).get()).exists, false);
  assert.equal(
    (await db.doc(`eventApplications/${roomId}`).get()).exists,
    false,
  );
  assert.equal((await db.doc(`chatRooms/${roomId}`).get()).exists, false);
  assert.equal((await db.doc(`eventCheckIns/${eventId}`).get()).exists, false);
  assert.equal(
    (await db.doc(`accountDeletionRequests/${userId}`).get()).exists,
    false,
  );
  const remainingSavedEvents = await db
    .collection("savedEvents")
    .where("userId", "==", userId)
    .get();
  assert.equal(remainingSavedEvents.size, 0);

  const deletionReport = await db
    .doc(`reports/admin-delete-report-${variant}`)
    .get();
  assert.equal(deletionReport.data()?.status, "resolved");

  const anonymizedReport = await db
    .doc(`reports/admin-user-report-${variant}`)
    .get();
  assert.equal(anonymizedReport.data()?.reporterId, "deleted_user");
  assert.ok(anonymizedReport.data()?.reporterDeletedAt);

  const eventOperation = await db
    .doc(`adminOperations/delete_event_${eventId}`)
    .get();
  const userOperation = await db
    .doc(`adminOperations/delete_user_${userId}`)
    .get();
  assert.equal(eventOperation.data()?.status, "completed");
  assert.equal(userOperation.data()?.status, "completed");

  const deletionNotices = await db
    .collection("notifications")
    .where("targetId", "==", `delete_event_${eventId}`)
    .get();
  assert.ok(deletionNotices.size >= 1);

  for (const prefix of [
    `profile-images/${userId}/`,
    `event-images/org-e2e/${eventId}/`,
    `chat-attachments/${roomId}/`,
  ]) {
    const [files] = await bucket.getFiles({ prefix });
    assert.equal(files.length, 0, `Storage prefix was not deleted: ${prefix}`);
  }
}

console.log("Admin cleanup verification complete.");
