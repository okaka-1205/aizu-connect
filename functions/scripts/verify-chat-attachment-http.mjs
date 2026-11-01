import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp as initializeAdmin } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";

const projectId = "demo-aizu-connect-attachments";
assert.equal(process.env.GCLOUD_PROJECT, projectId);
for (const key of [
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
]) {
  assert.match(process.env[key] ?? "", /^(localhost|127\.0\.0\.1):\d+$/);
}
const admin = initializeAdmin({
  projectId,
  storageBucket: `${projectId}.appspot.com`,
});
const db = getFirestore(admin);
const authAdmin = getAdminAuth(admin);
const uid = "attachment-http-student";
const email = "attachment-http@example.invalid";
const password = "local-test-password-only";
await authAdmin.createUser({ uid, email, password, emailVerified: true });
await db
  .doc(`users/${uid}`)
  .set({ role: "student", status: "active", displayName: "HTTPテスト" });
await db
  .doc("users/attachment-http-owner")
  .set({ role: "organization", status: "active" });
await db
  .doc("events/attachment-http-event")
  .set({
    status: "published",
    createdBy: "attachment-http-owner",
    title: "HTTP添付テスト",
    organizationName: "HTTP主催者",
  });
const room = db.doc("chatRooms/attachment-http-room");
await room.set({
  eventId: "attachment-http-event",
  status: "active",
  participantIds: [uid],
});
const app = initializeApp({
  projectId,
  apiKey: "demo",
  authDomain: `${projectId}.firebaseapp.com`,
});
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {
  disableWarnings: true,
});
const functions = getFunctions(app, "asia-northeast1");
connectFunctionsEmulator(functions, "127.0.0.1", 15001);
const call = httpsCallable(functions, "sendChatAttachment", {
  timeout: 360000,
});
const bytes = Buffer.alloc(10 * 1024 * 1024 - 1, 65);
const data = {
  roomId: room.id,
  expectedUserId: uid,
  requestId: randomUUID(),
  name: "boundary.txt",
  contentType: "text/plain",
  size: bytes.length,
  contentBase64: bytes.toString("base64"),
};
try {
  await assert.rejects(
    call({ ...data, contentBase64: "", size: 0 }),
    (error) => error.code === "functions/unauthenticated",
  );
  console.log("PASS HTTP rejects unauthenticated caller");
  await signInWithEmailAndPassword(auth, email, password);
  const result = await call(data);
  const message = (
    await room.collection("messages").doc(result.data.messageId).get()
  ).data();
  assert.equal(message.attachmentSize, bytes.length);
  const [stored] = await getStorage(admin)
    .bucket()
    .file(message.attachmentPath)
    .download();
  assert.deepEqual(stored, bytes);
  assert.equal((await room.get()).data().lastMessageId, result.data.messageId);
  console.log(
    `PASS HTTP callable transfers ${bytes.length} bytes through real Auth and Functions emulators`,
  );
  assert.equal((await call(data)).data.messageId, result.data.messageId);
  console.log("PASS HTTP retry returns the same message ID");
  await assert.rejects(
    call({ ...data, size: 10 * 1024 * 1024 }),
    (error) => error.code === "functions/invalid-argument",
  );
  console.log("PASS HTTP rejects the size limit itself");
  console.log("Chat attachment HTTP boundary: 4 cases passed");
} finally {
  await deleteApp(app);
  await db.terminate();
}
