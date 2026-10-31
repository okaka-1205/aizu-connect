import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const root = process.cwd();
const projectId = "demo-aizu-connect-review-fixes";
if (
  process.env.GCLOUD_PROJECT !== projectId ||
  process.env.FUNCTIONS_EMULATOR !== "true" ||
  !/^(localhost|127\.0\.0\.1):\d+$/.test(
    process.env.FIRESTORE_EMULATOR_HOST ?? "",
  )
) {
  throw new Error("Run only with the isolated local review-fixes emulator.");
}
const require = createRequire(`${root}/package.json`);
const requireFunctions = createRequire(`${root}/functions/package.json`);
const {
  initializeTestEnvironment,
  assertFails,
} = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app").default;
require("firebase/compat/firestore");
firebase.firestore.setLogLevel("silent");
const { db, adminAuth, adminStorage } = require(
  `${root}/functions/lib/lib/firebaseAdmin.js`,
);
const { adminManageResource } = require(
  `${root}/functions/lib/callables/adminManageResource.js`,
);
const { saveEventPlan, submitApplication, manageChatMessage } = require(
  `${root}/functions/lib/index.js`,
);
const { Timestamp } = requireFunctions("firebase-admin/firestore");
// These tests exercise Firestore workflows, not live Auth or Storage services.
adminAuth.deleteUser = async () => {};
adminStorage.bucket = () => ({ deleteFiles: async () => [] });
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
const env = await initializeTestEnvironment({
  projectId,
  firestore: {
    host,
    port: Number(port),
    rules: fs.readFileSync(`${root}/firestore.rules`, "utf8"),
  },
});
const originalTransaction = db.runTransaction.bind(db);
const originalDelete = db.recursiveDelete.bind(db);
const actor = (uid) => ({ uid, token: { email_verified: true } });
const version = (value) =>
  value ? { seconds: value.seconds, nanoseconds: value.nanoseconds } : null;
const request = (action, targetId, requestId, expectedUpdatedAt) => ({
  auth: actor("review-admin"),
  data: {
    action,
    targetId,
    requestId,
    reason: "Local regression verification",
    expectedUpdatedAt,
  },
});
let passed = 0;
const check = async (label, fn) => {
  await fn();
  passed++;
  console.log(`PASS ${label}`);
};
const user = (uid, role = "student") =>
  db.doc(`users/${uid}`).set({
    uid,
    role,
    status: "active",
    displayName: uid,
    organizationName: uid,
  });
const event = (id, overrides = {}) =>
  db.doc(`events/${id}`).set({
    title: id,
    summary: "Reviewed content",
    feeType: "無料",
    status: "pending_review",
    createdBy: "review-organizer",
    organizationId: "review-organizer",
    organizationName: "review-organizer",
    capacity: 2,
    applicantCount: 0,
    startAt: Timestamp.fromMillis(Date.now() + 86400000),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  });
const plan = (title) => ({
  title,
  summary: "Changed content",
  category: "地域活動",
  location: "Local test",
  startAtMillis: Date.now() + 86400000,
  endAtMillis: Date.now() + 90000000,
  feeType: "無料",
  feeAmount: 0,
  eventFormat: "現地",
  meetingPoint: "Local meeting",
  accessInfo: "",
  bringItems: "Nothing",
  cancellationPolicy: "Local policy",
  weatherPolicy: "Local policy",
  accessibility: "Local policy",
  contactMethod: "Chat",
  capacity: 2,
  imageUrl: "https://example.invalid/test.png",
  templateKey: "交流会",
  beginnerLevel: "初参加歓迎",
  takeaways: ["Learning"],
  organizerDescription: "Local organizer",
  organizerExperience: "Local experience",
  applicationQuestions: [],
});

try {
  await user("review-admin", "admin");
  await user("review-organizer", "organization");
  await check(
    "rejects missing/stale review versions, including nanoseconds",
    async () => {
      await event("versioned");
      const before = (await db.doc("events/versioned").get()).data().updatedAt;
      await assert.rejects(
        adminManageResource.run(
          request("approve_event", "versioned", "missing_version_0001"),
        ),
        (e) => e.code === "invalid-argument",
      );
      await saveEventPlan.run({
        auth: actor("review-organizer"),
        data: {
          eventId: "versioned",
          mode: "update",
          event: plan("New unreviewed content"),
        },
      });
      await assert.rejects(
        adminManageResource.run(
          request(
            "approve_event",
            "versioned",
            "stale_version_00001",
            version(before),
          ),
        ),
        (e) => e.code === "failed-precondition",
      );
      const current = (await db.doc("events/versioned").get()).data();
      const wrong = version(current.updatedAt);
      wrong.nanoseconds = (wrong.nanoseconds + 1) % 1000000000;
      await assert.rejects(
        adminManageResource.run(
          request("approve_event", "versioned", "wrong_nanos_0000001", wrong),
        ),
        (e) => e.code === "failed-precondition",
      );
      assert.equal(
        (await db.doc("events/versioned").get()).data().status,
        "pending_review",
      );
      await adminManageResource.run(
        request(
          "approve_event",
          "versioned",
          "fresh_version_00001",
          version(current.updatedAt),
        ),
      );
      assert.equal(
        (await db.doc("events/versioned").get()).data().status,
        "published",
      );
    },
  );

  await check(
    "concurrent creator edit cannot publish unseen content",
    async () => {
      await event("concurrent-review");
      const expected = version(
        (await db.doc("events/concurrent-review").get()).data().updatedAt,
      );
      let edit;
      let started = false;
      db.runTransaction = (fn, ...args) =>
        originalTransaction(
          async (transaction) => {
            const get = transaction.get.bind(transaction);
            transaction.get = async (ref, ...rest) => {
              const result = await get(ref, ...rest);
              if (ref.path === "events/concurrent-review" && !started) {
                started = true;
                edit = saveEventPlan.run({
                  auth: actor("review-organizer"),
                  data: {
                    eventId: "concurrent-review",
                    mode: "update",
                    event: plan("Concurrent new content"),
                  },
                });
              }
              return result;
            };
            return fn(transaction);
          },
          ...args,
        );
      try {
        await adminManageResource.run(
          request(
            "approve_event",
            "concurrent-review",
            "concurrent_review_01",
            expected,
          ),
        );
        await edit;
      } finally {
        db.runTransaction = originalTransaction;
      }
      const after = (await db.doc("events/concurrent-review").get()).data();
      assert.equal(after.title, "Concurrent new content");
      assert.equal(after.status, "pending_review");
    },
  );

  await check(
    "audit failure rolls back publication; retry is atomic and idempotent",
    async () => {
      await event("audit-retry");
      const expected = version(
        (await db.doc("events/audit-retry").get()).data().updatedAt,
      );
      const req = request(
        "approve_event",
        "audit-retry",
        "atomic_audit_retry_01",
        expected,
      );
      let fail = true;
      db.runTransaction = (fn, ...args) =>
        originalTransaction(
          async (transaction) => {
            const set = transaction.set.bind(transaction);
            transaction.set = (ref, ...rest) => {
              if (ref.path.startsWith("auditLogs/") && fail) {
                fail = false;
                throw new Error("Injected audit failure");
              }
              return set(ref, ...rest);
            };
            return fn(transaction);
          },
          ...args,
        );
      try {
        await assert.rejects(
          adminManageResource.run(req),
          /Injected audit failure/,
        );
      } finally {
        db.runTransaction = originalTransaction;
      }
      assert.equal(
        (await db.doc("events/audit-retry").get()).data().status,
        "pending_review",
      );
      const result = await adminManageResource.run(req);
      const completed = (
        await db.doc(`adminOperations/${result.operationId}`).get()
      ).data().completedAt;
      assert.equal(
        (await db.doc(`auditLogs/${result.operationId}`).get()).exists,
        true,
      );
      assert.equal(
        (await db.doc("events/audit-retry").get()).data().status,
        "published",
      );
      await adminManageResource.run(req);
      assert.equal(
        (await db.doc(`adminOperations/${result.operationId}`).get())
          .data()
          .completedAt.isEqual(completed),
        true,
      );
    },
  );

  await check(
    "lost commit acknowledgment preserves a completed operation",
    async () => {
      await event("lost-ack");
      const expected = version(
        (await db.doc("events/lost-ack").get()).data().updatedAt,
      );
      let loseAck = true;
      db.runTransaction = async (fn, ...args) => {
        let completes = false;
        const result = await originalTransaction(
          async (transaction) => {
            const set = transaction.set.bind(transaction);
            transaction.set = (ref, data, ...rest) => {
              if (
                ref.path.startsWith("adminOperations/") &&
                data.status === "completed"
              )
                completes = true;
              return set(ref, data, ...rest);
            };
            return fn(transaction);
          },
          ...args,
        );
        if (completes && loseAck) {
          loseAck = false;
          throw new Error("Injected lost commit acknowledgment");
        }
        return result;
      };
      try {
        const result = await adminManageResource.run(
          request(
            "approve_event",
            "lost-ack",
            "lost_acknowledgment_01",
            expected,
          ),
        );
        assert.equal(result.status, "published");
        assert.equal(
          (await db.doc(`adminOperations/${result.operationId}`).get()).data()
            .status,
          "completed",
        );
      } finally {
        db.runTransaction = originalTransaction;
      }
    },
  );

  await check(
    "deletion retry recovers the audit after the account is gone",
    async () => {
      await user("deleted-before-audit");
      const req = request(
        "delete_user",
        "deleted-before-audit",
        "delete_final_audit_01",
      );
      let fail = true;
      db.runTransaction = (fn, ...args) =>
        originalTransaction(
          async (transaction) => {
            const set = transaction.set.bind(transaction);
            transaction.set = (ref, ...rest) => {
              if (ref.path.startsWith("auditLogs/") && fail) {
                fail = false;
                throw new Error("Injected final deletion audit failure");
              }
              return set(ref, ...rest);
            };
            return fn(transaction);
          },
          ...args,
        );
      try {
        await assert.rejects(
          adminManageResource.run(req),
          /Injected final deletion audit failure/,
        );
      } finally {
        db.runTransaction = originalTransaction;
      }
      assert.equal(
        (await db.doc("users/deleted-before-audit").get()).exists,
        false,
      );
      const result = await adminManageResource.run(req);
      assert.equal(
        (await db.doc(`auditLogs/${result.operationId}`).get()).data()
          .targetTitle,
        "deleted-before-audit",
      );
      assert.equal(
        (await db.doc(`adminOperations/${result.operationId}`).get()).data()
          .status,
        "completed",
      );
    },
  );

  await check(
    "deletion retry releases capacity only once and cannot overbook",
    async () => {
      const uid = "deleted-student",
        id = "delete-retry",
        applicationId = `${id}_${uid}`;
      await user(uid);
      await event(id, { status: "published", applicantCount: 2 });
      await db.doc(`eventApplications/${applicationId}`).set({
        eventId: id,
        studentId: uid,
        organizationId: "review-organizer",
        status: "pending",
      });
      await db
        .doc(`eventApplications/${id}_remaining`)
        .set({ eventId: id, studentId: "remaining", status: "pending" });
      let fail = true;
      db.recursiveDelete = async (ref, ...args) => {
        if (ref.path === `eventApplications/${applicationId}` && fail) {
          fail = false;
          throw new Error("Injected deletion failure");
        }
        return originalDelete(ref, ...args);
      };
      const req = request("delete_user", uid, "delete_capacity_retry_01");
      try {
        await assert.rejects(
          adminManageResource.run(req),
          /Injected deletion failure/,
        );
        assert.equal(
          (await db.doc(`events/${id}`).get()).data().applicantCount,
          1,
        );
        await adminManageResource.run(req);
      } finally {
        db.recursiveDelete = originalDelete;
      }
      assert.equal(
        (await db.doc(`events/${id}`).get()).data().applicantCount,
        1,
      );
      const statuses = [];
      for (const newUid of ["new-student-1", "new-student-2"]) {
        await user(newUid);
        statuses.push(
          (
            await submitApplication.run({
              auth: actor(newUid),
              data: { eventId: id, consentAccepted: true },
            })
          ).status,
        );
      }
      assert.deepEqual(statuses, ["pending", "waitlisted"]);
      assert.equal(
        (
          await db
            .collection("eventApplications")
            .where("eventId", "==", id)
            .where("status", "==", "pending")
            .get()
        ).size,
        2,
      );
    },
  );

  await check(
    "account deletion promotes a waiting participant exactly once",
    async () => {
      const uid = "deleted-with-waitlist",
        id = "deletion-waitlist";
      await user(uid);
      await event(id, { status: "published", capacity: 1, applicantCount: 1 });
      await db
        .doc(`eventApplications/${id}_${uid}`)
        .set({ eventId: id, studentId: uid, status: "confirmed" });
      await db.doc(`eventApplications/${id}_waiting`).set({
        eventId: id,
        studentId: "waiting",
        status: "waitlisted",
        waitlistSequence: 1,
        createdAt: Timestamp.now(),
      });
      await adminManageResource.run(
        request("delete_user", uid, "delete_waitlist_0001"),
      );
      assert.equal(
        (await db.doc(`eventApplications/${id}_waiting`).get()).data().status,
        "pending",
      );
      assert.equal(
        (await db.doc(`events/${id}`).get()).data().applicantCount,
        1,
      );
    },
  );

  const uid = "chat-student";
  await user(uid);
  const client = env
    .authenticatedContext(uid, { email_verified: true })
    .firestore();
  const message = (roomId, text) => ({
    roomId,
    senderId: uid,
    senderName: uid,
    type: "text",
    text,
    createdAt: Timestamp.now(),
  });
  await check(
    "read-only chat blocks edits, permits owner deletion, clears legacy preview",
    async () => {
      await db.doc("chatRooms/closed").set({
        roomType: "event",
        status: "read_only",
        participantIds: [uid],
        lastMessageText: "private text",
      });
      await db
        .doc("chatRooms/closed/messages/latest")
        .set(message("closed", "private text"));
      const req = {
        auth: actor(uid),
        data: {
          roomId: "closed",
          messageId: "latest",
          action: "edit",
          text: "Changed",
        },
      };
      await assert.rejects(
        manageChatMessage.run(req),
        (e) => e.code === "failed-precondition",
      );
      await manageChatMessage.run({
        ...req,
        data: { ...req.data, action: "delete" },
      });
      assert.equal(
        (await db.doc("chatRooms/closed").get()).data().lastMessageText,
        "このメッセージは削除されました。",
      );
    },
  );

  await check(
    "editing/deleting an older message preserves the newest preview",
    async () => {
      await db.doc("chatRooms/active").set({
        roomType: "event",
        status: "active",
        participantIds: [uid],
        lastMessageId: "new",
        lastMessageText: "Newest",
      });
      await db
        .doc("chatRooms/active/messages/old")
        .set(message("active", "Old"));
      await db
        .doc("chatRooms/active/messages/new")
        .set(message("active", "Newest"));
      for (const action of ["edit", "delete"])
        await manageChatMessage.run({
          auth: actor(uid),
          data: {
            roomId: "active",
            messageId: "old",
            action,
            text: "Edited old",
          },
        });
      assert.equal(
        (await db.doc("chatRooms/active").get()).data().lastMessageText,
        "Newest",
      );
      await manageChatMessage.run({
        auth: actor(uid),
        data: {
          roomId: "active",
          messageId: "new",
          action: "edit",
          text: "Edited latest",
        },
      });
      assert.equal(
        (await db.doc("chatRooms/active").get()).data().lastMessageText,
        "Edited latest",
      );
    },
  );

  await check(
    "joining an existing room preserves its conversation and creation time",
    async () => {
      await user("joining-student");
      await event("join-event", { status: "published" });
      const createdAt = Timestamp.fromMillis(1000);
      await db.doc("chatRooms/event_join-event").set({
        roomType: "event",
        status: "active",
        memberCount: 1,
        lastMessageId: "last",
        lastMessageText: "Existing conversation",
        lastMessageAt: createdAt,
        createdAt,
      });
      await submitApplication.run({
        auth: actor("joining-student"),
        data: { eventId: "join-event", consentAccepted: true },
      });
      const after = (await db.doc("chatRooms/event_join-event").get()).data();
      assert.equal(after.lastMessageText, "Existing conversation");
      assert.equal(after.lastMessageId, "last");
      assert.equal(after.createdAt.toMillis(), 1000);
      assert.equal(after.memberCount, 2);
    },
  );

  await check(
    "bounded room queries fit the Rules budget and deny a mixed unauthorized ID",
    async () => {
      const ids = Array.from({ length: 8 }, (_, i) => `member-room-${i}`);
      for (const id of ids) {
        await db
          .doc(`chatRooms/${id}`)
          .set({ roomType: "event", status: "active" });
        await db.doc(`chatRooms/${id}/members/${uid}`).set({ userId: uid });
      }
      const get = (values) =>
        client
          .collection("chatRooms")
          .where(firebase.firestore.FieldPath.documentId(), "in", values)
          .limit(8)
          .get();
      assert.equal((await get(ids)).size, 8);
      await db
        .doc("chatRooms/not-a-member")
        .set({ roomType: "event", status: "active" });
      await assertFails(get([...ids.slice(0, 7), "not-a-member"]));
    },
  );

  await check(
    "server-side upcoming filters support popularity and newest pagination",
    async () => {
      const now = firebase.firestore.Timestamp.now();
      for (const [id, start, popularity] of [
        ["expired-popular", -10000, 100],
        ["future-lower", 20000, 1],
        ["future-higher", 10000, 2],
      ]) {
        await event(id, {
          status: "published",
          startAt: Timestamp.fromMillis(now.toMillis() + start),
          applicantCount: popularity,
        });
      }
      for (const field of ["applicantCount", "createdAt"]) {
        const lower =
          field === "applicantCount"
            ? 0
            : firebase.firestore.Timestamp.fromMillis(0);
        const page = await client
          .collection("events")
          .where("status", "==", "published")
          .where(field, ">=", lower)
          .where("startAt", ">=", now)
          .orderBy(field, "desc")
          .orderBy("startAt", "asc")
          .limit(30)
          .get();
        assert.equal(
          page.docs.some((doc) => doc.id === "expired-popular"),
          false,
        );
        assert.ok(page.docs.some((doc) => doc.id === "future-higher"));
      }
    },
  );
  console.log(`Review regressions: ${passed} passed.`);
} finally {
  db.runTransaction = originalTransaction;
  db.recursiveDelete = originalDelete;
  await env.cleanup();
  await db.terminate();
}
