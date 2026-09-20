import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("verify-notification-pagination.mjs requires Firestore Emulator.");
  process.exit(1);
}

const projectId =
  process.env.GCLOUD_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  "demo-aizu-connect-pagination";
initializeApp({ projectId });

const db = getFirestore();
const studentCount = 1000;
const seedBatchSize = 400;
const eventId = "notification-pagination-event";
const organizerId = "notification-pagination-organizer";
const now = Date.now();
const metadataBatch = db.batch();

metadataBatch.set(db.doc(`users/${organizerId}`), {
  uid: organizerId,
  role: "organization",
  status: "active",
  displayName: "通知ページング主催者",
  createdAt: Timestamp.fromMillis(now),
  updatedAt: Timestamp.fromMillis(now),
});

metadataBatch.set(db.doc(`events/${eventId}`), {
  title: "通知ページング確認イベント",
  summary: "1000人の対象へ通知が届くことを確認します。",
  organizationName: "通知ページング主催者",
  createdBy: organizerId,
  status: "pending_review",
  startAt: Timestamp.fromMillis(now + 7 * 24 * 60 * 60 * 1000),
  createdAt: Timestamp.fromMillis(now),
  updatedAt: Timestamp.fromMillis(now),
});

await metadataBatch.commit();

for (let offset = 0; offset < studentCount; offset += seedBatchSize) {
  const studentBatch = db.batch();
  const end = Math.min(offset + seedBatchSize, studentCount);
  for (let index = offset; index < end; index += 1) {
    const studentId = `notification-student-${String(index).padStart(4, "0")}`;
    studentBatch.set(db.doc(`users/${studentId}`), {
      uid: studentId,
      role: "student",
      status: "active",
      displayName: `通知確認学生 ${index + 1}`,
      createdAt: Timestamp.fromMillis(now + index),
      updatedAt: Timestamp.fromMillis(now + index),
    });
  }
  await studentBatch.commit();
}

await db.doc(`events/${eventId}`).update({
  status: "published",
  updatedAt: FieldValue.serverTimestamp(),
});

const deadline = Date.now() + 90_000;
let deliveredCount = 0;
while (Date.now() < deadline) {
  const notifications = await db
    .collection("notifications")
    .where("targetId", "==", eventId)
    .get();
  deliveredCount = notifications.docs.filter(
    (notification) => notification.data().type === "new_event",
  ).length;
  if (deliveredCount === studentCount) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}

if (deliveredCount !== studentCount) {
  console.error(
    `Expected ${studentCount} student notifications, received ${deliveredCount}.`,
  );
  process.exit(1);
}

console.log(
  `Notification pagination verified for ${deliveredCount} active students.`,
);
