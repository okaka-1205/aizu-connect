import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { deleteApp as deleteClientApp, initializeApp as initializeClientApp } from "firebase/app";
import { connectAuthEmulator, getAuth as getClientAuth, signInWithCustomToken } from "firebase/auth";
import { connectFirestoreEmulator, doc, getFirestore as getClientFirestore, serverTimestamp, terminate, updateDoc } from "firebase/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FUNCTIONS_EMULATOR) {
  throw new Error("This verification requires Firestore, Auth and Functions emulators.");
}
for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error("Emulators must run locally.");
}
const projectId = process.env.GCLOUD_PROJECT ?? "demo-aizu-connect-concurrency";
if (!projectId.startsWith("demo-")) throw new Error("A demo project is required.");
initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();
const eventId = "concurrent-event";
const students = Array.from({ length: 4 }, (_, i) => `concurrent-student-${i}`);
const batch = db.batch();
batch.set(db.doc(`events/${eventId}`), {
  title: "Concurrency test", status: "published", capacity: 1, applicantCount: 0,
  waitlistNextSequence: 1, createdBy: "concurrent-organizer", organizationName: "Test organizer",
  startAt: Timestamp.fromMillis(Date.now() + 86400000),
});
for (const uid of students) batch.set(db.doc(`users/${uid}`), { uid, role: "student", status: "active", displayName: uid });
batch.set(db.doc("users/concurrent-suspended"), { uid: "concurrent-suspended", role: "student", status: "suspended" });
batch.set(db.doc("users/concurrent-organizer"), { uid: "concurrent-organizer", role: "organization", status: "active" });
await batch.commit();

async function token(uid) {
  await auth.createUser({ uid, email: `${uid}@example.test`, emailVerified: true });
  const customToken = await auth.createCustomToken(uid);
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const body = await response.json();
  assert.ok(response.ok, `Auth emulator error: ${response.status}`);
  return body.idToken;
}
const url = `http://127.0.0.1:15001/${projectId}/asia-northeast1/submitApplication`;
async function submit(idToken, data = { eventId, consentAccepted: true }) {
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ data }),
  });
  return { status: response.status, body: await response.json() };
}
const tokens = await Promise.all([...students, "concurrent-suspended", "concurrent-organizer"].map(token));
const results = await Promise.all(tokens.slice(0, 4).map((idToken) => submit(idToken)));
assert.ok(results.every((result) => result.status === 200), JSON.stringify(results));
assert.equal(results.filter((result) => result.body.result.status === "pending").length, 1);
assert.deepEqual(results.filter((result) => result.body.result.status === "waitlisted").map((result) => result.body.result.waitlistPosition).sort((a, b) => a - b), [1, 2, 3]);
assert.equal((await db.doc(`events/${eventId}`).get()).data().applicantCount, 1);
assert.equal((await db.collection("eventApplications").where("eventId", "==", eventId).get()).size, 4);
const [duplicate, anonymous, suspended, organizer] = await Promise.all([
  submit(tokens[0]), submit(null), submit(tokens[4]), submit(tokens[5]),
]);
assert.equal(duplicate.body.error?.status, "ALREADY_EXISTS");
assert.equal(anonymous.body.error?.status, "UNAUTHENTICATED");
assert.equal(suspended.body.error?.status, "PERMISSION_DENIED");
assert.equal(organizer.body.error?.status, "PERMISSION_DENIED");
assert.equal((await db.collection("eventApplications").where("eventId", "==", eventId).get()).size, 4);
const duplicateEventId = "concurrent-duplicate-event";
await db.doc(`events/${duplicateEventId}`).set({
  title: "Duplicate test", status: "published", capacity: 1, applicantCount: 0,
  createdBy: "concurrent-organizer", organizationName: "Test organizer",
  startAt: Timestamp.fromMillis(Date.now() + 86400000),
});
const duplicates = await Promise.all([submit(tokens[0], { eventId: duplicateEventId, consentAccepted: true }), submit(tokens[0], { eventId: duplicateEventId, consentAccepted: true })]);
assert.equal(duplicates.filter((result) => result.status === 200).length, 1);
assert.equal(duplicates.filter((result) => result.body.error?.status === "ALREADY_EXISTS").length, 1);
assert.equal((await db.doc(`events/${duplicateEventId}`).get()).data().applicantCount, 1);
assert.equal((await db.collection("eventApplications").where("eventId", "==", duplicateEventId).get()).size, 1);

// Make the final create in the transaction fail at commit time. Every earlier
// application, event and chat write must then be rolled back atomically.
const rollbackEventId = "commit-precondition-event";
const rollbackStudent = "commit-precondition-student";
const rollbackApplicationId = `${rollbackEventId}_${rollbackStudent}`;
const rollbackRoomRef = db.doc(`chatRooms/event_${rollbackEventId}`);
const rollbackLogRef = db.doc(`thirdPartyProvisionLogs/${rollbackApplicationId}`);
await db.doc(`events/${rollbackEventId}`).set({
  title: "Commit precondition test", status: "published", capacity: 1,
  applicantCount: 0, popularityScore: 0,
  createdBy: "concurrent-organizer", organizationName: "Test organizer",
  startAt: Timestamp.fromMillis(Date.now() + 86400000),
});
await db.doc(`users/${rollbackStudent}`).set({
  uid: rollbackStudent, role: "student", status: "active", displayName: "Test student",
});
const rollbackToken = await token(rollbackStudent);
const roomDeadline = Date.now() + 15000;
while (!(await rollbackRoomRef.get()).exists && Date.now() < roomDeadline) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.equal((await rollbackRoomRef.get()).data()?.memberCount, 1, "Event room trigger must finish before the rollback check");
await rollbackLogRef.create({ marker: "preexisting conflict" });
const rejectedCommit = await submit(rollbackToken, { eventId: rollbackEventId, consentAccepted: true });
assert.notEqual(rejectedCommit.status, 200, "A preexisting provision log must reject the commit");
assert.equal((await db.doc(`eventApplications/${rollbackApplicationId}`).get()).exists, false);
assert.equal((await db.doc(`events/${rollbackEventId}`).get()).data().applicantCount, 0);
assert.equal((await db.doc(`events/${rollbackEventId}`).get()).data().popularityScore, 0);
assert.equal((await rollbackRoomRef.get()).data().memberCount, 1);
assert.equal((await rollbackRoomRef.collection("members").doc(rollbackStudent).get()).exists, false);
assert.equal((await rollbackRoomRef.collection("members").get()).size, 1);
assert.deepEqual((await rollbackLogRef.get()).data(), { marker: "preexisting conflict" });

await rollbackLogRef.delete();
const retryAfterRollback = await submit(rollbackToken, { eventId: rollbackEventId, consentAccepted: true });
assert.equal(retryAfterRollback.status, 200, JSON.stringify(retryAfterRollback));
assert.equal(retryAfterRollback.body.result.status, "pending");
assert.equal((await db.doc(`eventApplications/${rollbackApplicationId}`).get()).data().status, "pending");
assert.equal((await db.doc(`events/${rollbackEventId}`).get()).data().applicantCount, 1);
assert.equal((await db.doc(`events/${rollbackEventId}`).get()).data().popularityScore, 1);
assert.equal((await rollbackRoomRef.get()).data().memberCount, 2);
assert.equal((await rollbackRoomRef.collection("members").get()).size, 2);
assert.equal((await rollbackLogRef.get()).data().applicationId, rollbackApplicationId);

// Forward the request but drop the response after the server has completed it.
const lostResponseEventId = "lost-response-event";
await db.doc(`events/${lostResponseEventId}`).set({
  title: "Lost response test", status: "published", capacity: 1, applicantCount: 0,
  createdBy: "concurrent-organizer", organizationName: "Test organizer",
  startAt: Timestamp.fromMillis(Date.now() + 86400000),
});
let forwardedStatus;
const proxy = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const upstream = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: request.headers.authorization },
      body: Buffer.concat(chunks),
    });
    await upstream.arrayBuffer();
    forwardedStatus = upstream.status;
    response.destroy();
  } catch (error) {
    response.destroy(error);
  }
});
proxy.listen(0, "127.0.0.1");
await once(proxy, "listening");
try {
  await assert.rejects(fetch(`http://127.0.0.1:${proxy.address().port}/`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens[1]}` },
    body: JSON.stringify({ data: { eventId: lostResponseEventId, consentAccepted: true } }),
  }));
  assert.equal(forwardedStatus, 200, "The server must commit before the response is lost");
} finally {
  await new Promise((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
}
const lostResponseRetry = await submit(tokens[1], { eventId: lostResponseEventId, consentAccepted: true });
assert.equal(lostResponseRetry.body.error?.status, "ALREADY_EXISTS");
assert.equal((await db.doc(`events/${lostResponseEventId}`).get()).data().applicantCount, 1);
assert.equal((await db.collection("eventApplications").where("eventId", "==", lostResponseEventId).get()).size, 1);

const beforeCancellation = await db.collection("eventApplications").where("eventId", "==", eventId).get();
const occupant = beforeCancellation.docs.find((item) => item.data().status === "pending");
const firstWaiter = beforeCancellation.docs.find((item) => item.data().waitlistSequence === 1);
assert.ok(occupant && firstWaiter);
const lateStudent = "concurrent-late-student";
await db.doc(`users/${lateStudent}`).set({ uid: lateStudent, role: "student", status: "active" });
const lateToken = await token(lateStudent);
const client = initializeClientApp({ projectId, apiKey: "demo" }, "cancellation-client");
const clientAuth = getClientAuth(client);
connectAuthEmulator(clientAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
const clientDb = getClientFirestore(client);
const [firestoreHost, firestorePort] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
connectFirestoreEmulator(clientDb, firestoreHost, Number(firestorePort));
await signInWithCustomToken(clientAuth, await auth.createCustomToken(occupant.data().studentId));
const [, lateResult] = await Promise.all([
  updateDoc(doc(clientDb, "eventApplications", occupant.id), {
    status: "cancelled", cancellationReason: "Concurrent cancellation test", cancelledAt: serverTimestamp(),
  }),
  submit(lateToken),
]);
assert.equal(lateResult.status, 200, JSON.stringify(lateResult));
const deadline = Date.now() + 15000;
let promoted;
while (Date.now() < deadline) {
  promoted = (await firstWaiter.ref.get()).data();
  if (promoted?.status === "pending") break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.equal(promoted?.status, "pending", "First waiter was not promoted");
const afterCancellation = await db.collection("eventApplications").where("eventId", "==", eventId).get();
assert.equal(afterCancellation.docs.filter((item) => item.data().status === "pending").length, 1);
assert.equal(afterCancellation.docs.filter((item) => item.data().status === "waitlisted").length, 3);
assert.equal((await db.doc(`events/${eventId}`).get()).data().applicantCount, 1);
assert.equal((await db.doc(`eventApplications/${eventId}_${lateStudent}`).get()).data().status, "waitlisted");
const receiptId = `application_${occupant.id}_pending_cancelled`;
assert.ok((await db.doc(`functionReceipts/${receiptId}`).get()).exists);
const beforeReplay = Object.fromEntries(afterCancellation.docs.map((item) => [item.id, item.data().status]));
const { notifyApplicationUpdated } = await import("../lib/triggers/notifications.js");
const replayEvent = {
  params: { applicationId: occupant.id },
  data: { before: { data: () => occupant.data() }, after: { data: () => ({ ...occupant.data(), status: "cancelled" }) } },
};
await Promise.all(Array.from({ length: 3 }, () => notifyApplicationUpdated.run(replayEvent)));
const afterReplay = await db.collection("eventApplications").where("eventId", "==", eventId).get();
assert.deepEqual(Object.fromEntries(afterReplay.docs.map((item) => [item.id, item.data().status])), beforeReplay);
assert.equal((await db.doc(`events/${eventId}`).get()).data().applicantCount, 1);
const retriedLate = await submit(lateToken);
assert.equal(retriedLate.body.error?.status, "ALREADY_EXISTS");
assert.equal((await db.collection("eventApplications").where("eventId", "==", eventId).get()).size, 5);
console.log("Concurrent applications, commit rollback and retry, cancellation, repeated trigger delivery and request retry preserved capacity and queue state.");
await terminate(clientDb);
await deleteClientApp(client);
