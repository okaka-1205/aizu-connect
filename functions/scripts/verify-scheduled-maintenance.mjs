import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("verify-scheduled-maintenance.mjs requires Firestore Emulator.");
  process.exit(1);
}

const projectId =
  process.env.GCLOUD_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  "demo-aizu-connect-scheduled";
initializeApp({ projectId });
const db = getFirestore();
const { runPurgeExpiredLegalRecords, runSendEventReminders } = await import(
  "../lib/scheduled/maintenance.js"
);

const now = Timestamp.fromMillis(Date.UTC(2026, 9, 15, 3, 0, 0));
const hoursFromNow = (hours) =>
  Timestamp.fromMillis(now.toMillis() + hours * 60 * 60 * 1000);

const batch = db.batch();
for (const [eventId, status, startAt, title] of [
  ["event-24h", "published", hoursFromNow(23), "24時間前イベント"],
  ["event-2h", "published", hoursFromNow(1.5), "2時間前イベント"],
  ["event-outside", "published", hoursFromNow(25), "対象期間外イベント"],
  ["event-past", "published", hoursFromNow(-1), "開催済みイベント"],
  ["event-draft", "pending_review", hoursFromNow(1), "未公開イベント"],
]) {
  batch.set(db.doc(`events/${eventId}`), { status, startAt, title });
}
for (const [applicationId, eventId, studentId, status] of [
  ["app-enabled-24h", "event-24h", "student-enabled", "confirmed"],
  ["app-disabled-24h", "event-24h", "student-disabled", "confirmed"],
  ["app-pending-24h", "event-24h", "student-pending", "pending"],
  ["app-enabled-2h", "event-2h", "student-enabled", "confirmed"],
  ["app-outside", "event-outside", "student-outside", "confirmed"],
  ["app-past", "event-past", "student-past", "confirmed"],
  ["app-draft", "event-draft", "student-draft", "confirmed"],
]) {
  batch.set(db.doc(`eventApplications/${applicationId}`), {
    eventId,
    studentId,
    status,
  });
}
batch.set(db.doc("notificationPreferences/student-disabled"), {
  eventReminders: false,
});
batch.set(db.doc("thirdPartyProvisionLogs/expired"), {
  expiresAt: hoursFromNow(-1),
});
batch.set(db.doc("thirdPartyProvisionLogs/future"), {
  expiresAt: hoursFromNow(1),
});
batch.set(db.doc("checkInAttempts/expired"), {
  expiresAt: hoursFromNow(-1),
});
batch.set(db.doc("checkInAttempts/future"), {
  expiresAt: hoursFromNow(1),
});
batch.set(db.doc("reports/unrelated"), { expiresAt: hoursFromNow(-1) });
await batch.commit();

const firstReminderRun = await runSendEventReminders(now);
assert.deepEqual(firstReminderRun, {
  eventsScanned: 2,
  confirmedApplicationsScanned: 3,
  notificationsAttempted: 2,
});
assert.equal((await db.collection("notifications").get()).size, 2);
assert.equal(
  (await db.doc("notifications/reminder_event-24h_student-enabled_24h").get())
    .data()?.recipientId,
  "student-enabled",
);
assert.equal(
  (await db.doc("notifications/reminder_event-2h_student-enabled_2h").get())
    .data()?.title,
  "まもなく開催です",
);
assert.equal(
  (await db.doc("notifications/reminder_event-24h_student-disabled_24h").get())
    .exists,
  false,
);

await runSendEventReminders(now);
assert.equal(
  (await db.collection("notifications").get()).size,
  2,
  "reminder reruns must be idempotent",
);

assert.deepEqual(await runPurgeExpiredLegalRecords(now), {
  deletedProvisionLogs: 1,
  deletedCheckInAttempts: 1,
});
assert.equal((await db.doc("thirdPartyProvisionLogs/expired").get()).exists, false);
assert.equal((await db.doc("thirdPartyProvisionLogs/future").get()).exists, true);
assert.equal((await db.doc("checkInAttempts/expired").get()).exists, false);
assert.equal((await db.doc("checkInAttempts/future").get()).exists, true);
assert.equal((await db.doc("reports/unrelated").get()).exists, true);

console.log("Scheduled reminder and retention integration checks passed.");
