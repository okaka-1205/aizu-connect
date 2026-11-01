import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";

const projectId = "demo-aizu-connect-attachments";
for (const key of [
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
]) {
  assert.match(process.env[key] ?? "", /^(localhost|127\.0\.0\.1):\d+$/);
}
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.equal(process.env.FUNCTIONS_EMULATOR, "true");
initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` });
const { db, adminStorage } = await import("../lib/lib/firebaseAdmin.js");
const { sendChatAttachment } =
  await import("../lib/callables/sendChatAttachment.js");
const { adminManageResource } =
  await import("../lib/callables/adminManageResource.js");
const { cleanupChatAttachmentAttempt, runCleanupExpiredChatAttachments } =
  await import("../lib/services/chatAttachmentCleanup.js");
const bucket = adminStorage.bucket();
const originalBucket = adminStorage.bucket.bind(adminStorage);
const originalTransaction = db.runTransaction.bind(db);
const auth = (uid = "attachment-student") => ({
  uid,
  token: { email_verified: true },
});
const payload = (overrides = {}) => ({
  roomId: "attachment-room",
  expectedUserId: "attachment-student",
  requestId: randomUUID(),
  name: "資料.txt",
  contentType: "text/plain",
  size: 4,
  contentBase64: Buffer.from("note").toString("base64"),
  ...overrides,
});
const send = (data, identity = auth()) =>
  sendChatAttachment.run({ data, auth: identity });
const userRef = db.doc("users/attachment-student");
const roomRef = db.doc("chatRooms/attachment-room");
const memberRef = roomRef.collection("members").doc("attachment-student");
const eventRef = db.doc("events/attachment-event");
const attempts = () => db.collection("chatAttachmentUploads").get();
const objects = () =>
  bucket.getFiles({ prefix: "chat-attachments/" }).then(([files]) => files);
const reject = (promise, code) =>
  assert.rejects(promise, (error) => error.code === code);
let passed = 0;
const test = async (label, action) => {
  try {
    await action();
    passed++;
    console.log(`PASS attachment ${label}`);
  } finally {
    adminStorage.bucket = originalBucket;
    db.runTransaction = originalTransaction;
  }
};
const fixtures = async () => {
  const batch = db.batch();
  batch.set(userRef, {
    role: "student",
    status: "active",
    displayName: "正しい表示名",
  });
  batch.set(db.doc("users/attachment-organizer"), {
    role: "organization",
    status: "active",
    displayName: "担当者名",
    organizationName: "団体名",
  });
  batch.set(roomRef, {
    eventId: eventRef.id,
    status: "active",
    participantIds: [],
  });
  batch.set(memberRef, { userId: userRef.id });
  batch.set(eventRef, {
    title: "添付テストイベント",
    organizationName: "団体名",
    status: "published",
    createdBy: "attachment-organizer",
  });
  batch.delete(db.doc(`deletionLocks/user_${userRef.id}`));
  batch.delete(db.doc(`deletionLocks/event_${eventRef.id}`));
  await batch.commit();
};
// Inject faults only around real Storage saves; all document/transaction and
// object operations still use the isolated emulators.
const afterSave = (action) => {
  adminStorage.bucket = () => ({
    file: (name) => {
      const file = bucket.file(name);
      const save = file.save.bind(file);
      file.save = async (...args) => {
        await save(...args);
        await action();
      };
      return file;
    },
  });
};
await fixtures();
await test("stores content and commits a trusted message with its preview", async () => {
  const { messageId } = await send(payload({ name: "資料'()*.txt" }));
  const message = (
    await roomRef.collection("messages").doc(messageId).get()
  ).data();
  assert.equal(message.senderName, "正しい表示名");
  assert.equal(message.type, "file");
  assert.equal(message.attachmentName, "資料'()*.txt");
  assert.equal(message.attachmentSize, 4);
  assert.equal(
    (await bucket.file(message.attachmentPath).download())[0].toString(),
    "note",
  );
  const response = await fetch(message.attachmentUrl);
  assert.ok(response.ok);
  assert.ok(
    response.headers
      .get("content-disposition")
      .includes("filename*=UTF-8''%E8%B3%87%E6%96%99%27%28%29%2A.txt"),
  );
  assert.equal(await response.text(), "note");
  const room = (await roomRef.get()).data();
  assert.equal(room.lastMessageId, messageId);
  assert.equal(room.lastMessageText, "ファイルを送信しました");
  assert.equal(room.lastMessageAt.toMillis(), message.createdAt.toMillis());
  assert.equal((await attempts()).size, 0);
});
await test("accepts legacy room membership and the organization display name", async () => {
  await roomRef.update({ participantIds: ["attachment-organizer"] });
  const { messageId } = await send(
    payload({
      expectedUserId: "attachment-organizer",
      contentType: "image/png",
    }),
    auth("attachment-organizer"),
  );
  const message = (
    await roomRef.collection("messages").doc(messageId).get()
  ).data();
  assert.equal(message.senderName, "団体名");
  assert.equal(message.type, "image");
  const longName = "団".repeat(100);
  await db
    .doc("users/attachment-organizer")
    .update({ organizationName: longName });
  const sent = await send(
    payload({ expectedUserId: "attachment-organizer" }),
    auth("attachment-organizer"),
  );
  assert.equal(
    (await roomRef.collection("messages").doc(sent.messageId).get()).data()
      .senderName,
    longName,
  );
});
await test("rejects missing auth, unverified email and a changed account", async () => {
  await reject(send(payload(), null), "unauthenticated");
  await reject(
    send(payload(), { uid: userRef.id, token: { email_verified: false } }),
    "permission-denied",
  );
  await reject(
    send(payload({ expectedUserId: "other-account" })),
    "permission-denied",
  );
});
for (const [label, change, code] of [
  [
    "inactive account",
    () => userRef.update({ status: "suspended" }),
    "permission-denied",
  ],
  ["nonmember", () => memberRef.delete(), "permission-denied"],
  [
    "readonly room",
    () => roomRef.update({ status: "read_only" }),
    "failed-precondition",
  ],
  [
    "cancelled event",
    () => eventRef.update({ status: "cancelled" }),
    "failed-precondition",
  ],
  [
    "deleting account",
    () => db.doc(`deletionLocks/user_${userRef.id}`).set({ state: "running" }),
    "permission-denied",
  ],
  ["deleted event", () => eventRef.delete(), "failed-precondition"],
]) {
  await test(`rejects ${label} before saving`, async () => {
    await fixtures();
    await change();
    const count = (await objects()).length;
    await reject(send(payload()), code);
    assert.equal((await objects()).length, count);
    assert.equal((await attempts()).size, 0);
  });
}
for (const [label, change, code] of [
  ["membership revoked", () => memberRef.delete(), "permission-denied"],
  [
    "account suspended",
    () => userRef.update({ status: "suspended" }),
    "permission-denied",
  ],
  [
    "room made readonly",
    () => roomRef.update({ status: "read_only" }),
    "failed-precondition",
  ],
  [
    "event deletion started",
    () =>
      db.doc(`deletionLocks/event_${eventRef.id}`).set({ state: "running" }),
    "failed-precondition",
  ],
]) {
  await test(`rechecks ${label} after the real upload`, async () => {
    await fixtures();
    const count = (await objects()).length;
    afterSave(change);
    await reject(send(payload()), code);
    assert.equal((await objects()).length, count);
    assert.equal((await attempts()).size, 0);
    assert.equal((await roomRef.get()).data().lastMessageId, undefined);
  });
}
await fixtures();
await test("coalesces concurrent retries without duplicate messages or objects", async () => {
  const data = payload();
  const before = (await objects()).length;
  const results = await Promise.all(
    Array.from({ length: 4 }, () => send(data)),
  );
  assert.equal(new Set(results.map((item) => item.messageId)).size, 1);
  assert.equal((await objects()).length, before + 1);
  assert.equal((await attempts()).size, 0);
  await roomRef.update({ status: "read_only" });
  assert.equal((await send(data)).messageId, results[0].messageId);
  assert.equal((await objects()).length, before + 1);
  await roomRef.update({ status: "active" });
  await reject(
    send({ ...data, contentBase64: Buffer.from("next").toString("base64") }),
    "already-exists",
  );
});
await test("recovers a lost commit acknowledgement without deleting its attachment", async () => {
  const data = payload();
  let calls = 0;
  db.runTransaction = async (...args) => {
    const result = await originalTransaction(...args);
    if (++calls === 2) throw new Error("Synthetic lost commit acknowledgement");
    return result;
  };
  const { messageId } = await send(data);
  const message = (
    await roomRef.collection("messages").doc(messageId).get()
  ).data();
  assert.ok((await bucket.file(message.attachmentPath).exists())[0]);
  assert.equal((await attempts()).size, 0);
});
await test("reconciles an ambiguous storage result and preserves committed retries", async () => {
  const data = payload();
  const before = (await objects()).length;
  afterSave(async () => {
    throw new Error("Synthetic lost Storage response");
  });
  await assert.rejects(send(data), /Synthetic lost Storage response/);
  assert.equal((await attempts()).size, 1);
  assert.equal((await objects()).length, before + 1);
  adminStorage.bucket = originalBucket;
  const { messageId } = await send(data);
  assert.equal((await objects()).length, before + 2);
  await runCleanupExpiredChatAttachments(
    Timestamp.fromMillis(Date.now() + 3600000),
  );
  assert.equal((await objects()).length, before + 1);
  assert.equal((await attempts()).size, 0);
  const messageRef = roomRef.collection("messages").doc(messageId);
  const message = (await messageRef.get()).data();
  // A stale receipt must never remove the committed file.
  const attemptId = message.attachmentPath.split("/").at(-1);
  const attemptRef = db.doc(`chatAttachmentUploads/${attemptId}`);
  await attemptRef.set({
    userId: userRef.id,
    roomId: roomRef.id,
    messageId,
    objectPath: message.attachmentPath,
    fingerprint: message.uploadFingerprint,
  });
  await cleanupChatAttachmentAttempt(attemptRef);
  assert.ok((await bucket.file(message.attachmentPath).exists())[0]);
  await messageRef.update({
    deletedAt: Timestamp.now(),
    text: "",
    attachmentUrl: "",
  });
  assert.equal((await send(data)).messageId, messageId);
  assert.equal((await messageRef.get()).data().attachmentUrl, "");
});
await test("retains uncertain Firestore failures for safe later cleanup", async () => {
  const before = (await objects()).length;
  let calls = 0;
  db.runTransaction = (...args) => {
    if (++calls === 2)
      return Promise.reject(new Error("Synthetic uncertain commit"));
    return originalTransaction(...args);
  };
  await assert.rejects(send(payload()), /Synthetic uncertain commit/);
  assert.equal((await attempts()).size, 1);
  assert.equal((await objects()).length, before + 1);
  db.runTransaction = originalTransaction;
  await runCleanupExpiredChatAttachments(
    Timestamp.fromMillis(Date.now() + 3600000),
  );
  assert.equal((await attempts()).size, 0);
  assert.equal((await objects()).length, before);
});
await test("accepts an empty text attachment", async () => {
  const { messageId } = await send(payload({ size: 0, contentBase64: "" }));
  const message = (
    await roomRef.collection("messages").doc(messageId).get()
  ).data();
  assert.equal(message.attachmentSize, 0);
  assert.equal(
    (await bucket.file(message.attachmentPath).download())[0].length,
    0,
  );
});
await test("rejects conflicting content racing on the same retry ID", async () => {
  const data = payload();
  const before = (await objects()).length;
  const result = await Promise.allSettled([
    send(data),
    send({ ...data, contentBase64: Buffer.from("next").toString("base64") }),
  ]);
  assert.equal(result.filter((item) => item.status === "fulfilled").length, 1);
  const rejected = result.find((item) => item.status === "rejected");
  assert.equal(rejected.reason.code, "already-exists");
  assert.equal((await objects()).length, before + 1);
  assert.equal((await attempts()).size, 0);
});
await test("never deletes an object owned by a different upload", async () => {
  const { messageId } = await send(payload());
  const message = (
    await roomRef.collection("messages").doc(messageId).get()
  ).data();
  const attemptId = message.attachmentPath.split("/").at(-1);
  const receipt = db.doc(`chatAttachmentUploads/${attemptId}`);
  await receipt.set({
    userId: userRef.id,
    roomId: roomRef.id,
    messageId: "uncommitted-message",
    objectPath: message.attachmentPath,
    fingerprint: "different-upload",
  });
  await assert.rejects(
    cleanupChatAttachmentAttempt(receipt),
    /does not own the object/,
  );
  assert.ok((await bucket.file(message.attachmentPath).exists())[0]);
  await receipt.delete();
});
await test("account deletion removes internal attachment identifiers and files", async () => {
  await roomRef.update({ roomType: "event" });
  const { messageId } = await send(payload());
  const ref = roomRef.collection("messages").doc(messageId);
  const before = (await ref.get()).data();
  await db.doc("users/attachment-admin").set({
    role: "admin",
    status: "active",
    displayName: "管理者",
  });
  await adminManageResource.run({
    auth: auth("attachment-admin"),
    data: {
      action: "delete_user",
      targetId: userRef.id,
      reason: "Local attachment deletion verification",
      requestId: randomUUID(),
    },
  });
  const after = (await ref.get()).data();
  assert.equal(after.senderId, "deleted_user");
  for (const key of [
    "attachmentUrl",
    "attachmentName",
    "attachmentPath",
    "uploadFingerprint",
  ]) {
    assert.equal(after[key], undefined, key);
  }
  assert.equal((await bucket.file(before.attachmentPath).exists())[0], false);
});
console.log(`Chat attachment integration: ${passed} cases passed`);
await db.terminate();
