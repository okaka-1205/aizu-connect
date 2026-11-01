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
  ) ||
  !/^(localhost|127\.0\.0\.1):\d+$/.test(
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "",
  )
) {
  throw new Error("Use only the isolated local review-fixes emulators.");
}
const require = createRequire(`${root}/package.json`);
const requireFunctions = createRequire(`${root}/functions/package.json`);
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app").default;
require("firebase/compat/firestore");
require("firebase/compat/storage");
firebase.firestore.setLogLevel("silent");
const { db, adminAuth, adminStorage } = require(
  `${root}/functions/lib/lib/firebaseAdmin.js`,
);
const { adminManageResource } = require(
  `${root}/functions/lib/callables/adminManageResource.js`,
);
const { submitApplication, saveEventPlan, createEventChatRoom } = require(
  `${root}/functions/lib/index.js`,
);
const {
  notifyApplicationUpdated,
  notifyApplicationCreated,
  syncEventPublicProfile,
  notifyEventUnavailable,
} = require(`${root}/functions/lib/triggers/notifications.js`);
const { Timestamp } = requireFunctions("firebase-admin/firestore");
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
const [storageHost, storagePort] =
  process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(":");
const env = await initializeTestEnvironment({
  projectId,
  firestore: {
    host,
    port: Number(port),
    rules: fs.readFileSync(`${root}/firestore.rules`, "utf8"),
  },
  storage: {
    host: storageHost,
    port: Number(storagePort),
    rules: fs.readFileSync(`${root}/storage.rules`, "utf8"),
  },
});
// Exercise Firestore workflows without contacting live Auth or Storage services.
adminAuth.deleteUser = async () => {};
let interleave = async () => {};
adminStorage.bucket = () => ({
  deleteFiles: async ({ prefix }) => {
    await interleave(prefix);
    return [];
  },
});
const actor = (uid) => ({ uid, token: { email_verified: true } });
const context = (uid) =>
  env.authenticatedContext(uid, {
    email_verified: true,
    email: `${uid}@u-aizu.ac.jp`,
  });
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
    id,
    title: id,
    summary: "Local fixture",
    feeType: "無料",
    status: "published",
    createdBy: "nov1-organizer",
    organizationId: "nov1-organizer",
    organizationName: "Local organizer",
    capacity: 5,
    applicantCount: 0,
    startAt: Timestamp.fromMillis(Date.now() + 86400000),
    endAt: Timestamp.fromMillis(Date.now() + 90000000),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  });
const apply = (uid, eventId) =>
  submitApplication.run({
    auth: actor(uid),
    data: { eventId, consentAccepted: true },
  });
let sequence = 0;
const deletionRequest = (action, targetId) => ({
  auth: actor("nov1-admin"),
  data: {
    action,
    targetId,
    reason: "Isolated regression verification",
    requestId: `nov1_request_identifier_${++sequence}`,
  },
});
const remove = (action, targetId) =>
  adminManageResource.run(deletionRequest(action, targetId));
let passed = 0;
const check = async (label, fn) => {
  await fn();
  passed++;
  console.log(`PASS ${label}`);
};
const report = (uid, id) => ({
  eventId: id,
  organizationId: uid,
  title: "Local report",
  summary: "Local report text",
  imageUrls: [],
  participantCount: 0,
  status: "draft",
  rightsConfirmed: true,
  createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
});
const plan = {
  title: "Local plan",
  summary: "Local plan summary",
  category: "地域活動",
  location: "Local venue",
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
  capacity: 5,
  imageUrl: "https://example.invalid/test.png",
  templateKey: "交流会",
  beginnerLevel: "初参加歓迎",
  takeaways: ["Learning"],
  organizerDescription: "Local organizer",
  organizerExperience: "Local experience",
  applicationQuestions: [],
};
try {
  await user("nov1-admin", "admin");
  await user("nov1-organizer", "organization");
  await check(
    "saved-event IDs cannot be reserved for another user",
    async () => {
      await user("nov1-attacker");
      await user("nov1-victim");
      const attacker = context("nov1-attacker").firestore();
      const victim = context("nov1-victim").firestore();
      const ref = "savedEvents/nov1-victim_nov1-event";
      await assertFails(
        attacker
          .doc(ref)
          .set({ userId: "nov1-attacker", eventId: "nov1-event" }),
      );
      await assertSucceeds(
        victim.doc(ref).set({ userId: "nov1-victim", eventId: "nov1-event" }),
      );
      await assertFails(attacker.doc(ref).delete());
      await assertSucceeds(victim.doc(ref).delete());
      await assertFails(
        attacker
          .doc("deletionLocks/user_nov1-victim")
          .set({ state: "completed" }),
      );
    },
  );
  await check(
    "deletion locks block survey, preference, image and organizer-reference writes",
    async () => {
      const uid = "nov1-locked-references";
      const id = "nov1-locked-reference-event";
      await user(uid);
      await event(id);
      const result = await apply(uid, id);
      await db
        .doc(`eventApplications/${result.applicationId}`)
        .update({ status: "attended" });
      const client = context(uid).firestore();
      const survey = client.doc(`eventSurveys/${id}/responses/${uid}`);
      const surveyData = {
        eventId: id,
        userId: uid,
        rating: 5,
        comment: "Local comment",
        wouldRecommend: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      await assertSucceeds(survey.set(surveyData));
      const preference = client.doc(`chatPreferences/event_${id}_${uid}`);
      const preferenceData = {
        roomId: `event_${id}`,
        userId: uid,
        muted: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      await assertSucceeds(preference.set(preferenceData));
      const bookmark = client.doc(`savedEvents/${uid}_${id}`);
      await assertSucceeds(bookmark.set({ userId: uid, eventId: id }));
      await assertSucceeds(bookmark.delete());
      const image = (name) =>
        context("nov1-organizer")
          .storage()
          .ref(`event-images/nov1-organizer/${id}/${name}.png`);
      await assertSucceeds(
        image("before").put(new Uint8Array([1, 2, 3]), {
          contentType: "image/png",
        }),
      );
      await db.doc(`deletionLocks/event_${id}`).set({ state: "running" });
      await db.doc(`events/${id}`).update({ status: "deleting" });
      await assertFails(survey.set({ ...surveyData, comment: "Blocked edit" }));
      await assertFails(preference.set({ ...preferenceData, muted: false }));
      await assertFails(bookmark.set({ userId: uid, eventId: id }));
      await assertFails(
        image("after").put(new Uint8Array([1, 2, 3]), {
          contentType: "image/png",
        }),
      );
      const target = "nov1-deleted-organizer";
      await user(target, "organization");
      const favorite = client.doc(`savedOrganizers/${uid}_${target}`);
      const favoriteData = {
        userId: uid,
        organizationId: target,
        organizationName: "Local organizer",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      const block = client.doc(`userBlocks/${uid}_${target}`);
      const blockData = {
        blockerId: uid,
        blockedId: target,
        reason: "Local reason",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      await assertSucceeds(favorite.set(favoriteData));
      await assertSucceeds(block.set(blockData));
      await assertSucceeds(favorite.delete());
      await assertSucceeds(block.delete());
      await db.doc(`deletionLocks/user_${target}`).set({ state: "completed" });
      await db.doc(`users/${target}`).delete();
      await assertFails(favorite.set(favoriteData));
      await assertFails(block.set(blockData));
    },
  );
  await check(
    "student owners can publish reports and images without cross-owner access",
    async () => {
      const uid = "nov1-student-owner";
      const id = "nov1-student-event";
      await user(uid);
      await event(id, { createdBy: uid });
      const student = context(uid);
      const outsider = context("nov1-attacker");
      const ref = student.firestore().doc(`eventReports/${id}`);
      await assertSucceeds(ref.set(report(uid, id)));
      await assertSucceeds(
        ref.update({ status: "published", summary: "Updated report" }),
      );
      await assertFails(
        outsider.firestore().doc(ref.path).set(report("nov1-attacker", id)),
      );
      await assertFails(ref.update({ rightsConfirmed: false }));
      await assertFails(ref.update({ summary: "x".repeat(2001) }));
      await assertSucceeds(
        student
          .storage()
          .ref(`event-reports/${uid}/${id}/image.png`)
          .put(new Uint8Array([1, 2, 3]), { contentType: "image/png" }),
      );
      await assertFails(
        outsider
          .storage()
          .ref(`event-reports/nov1-attacker/${id}/image.png`)
          .put(new Uint8Array([1, 2, 3]), { contentType: "image/png" }),
      );
    },
  );
  await check(
    "event deletion blocks applications after the dependent sweep",
    async () => {
      const id = "nov1-event-deletion";
      const uid = "nov1-event-applicant";
      await user(uid);
      await event(id);
      await apply(uid, id);
      const preferenceId = `event_${id}_${uid}`;
      await assertSucceeds(
        context(uid)
          .firestore()
          .doc(`chatPreferences/${preferenceId}`)
          .set({
            userId: uid,
            roomId: `event_${id}`,
            muted: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          }),
      );
      let blocked = false;
      interleave = async (prefix) => {
        if (prefix === `event-images/nov1-organizer/${id}/`) {
          await assert.rejects(
            apply(uid, id),
            (error) => error.code === "failed-precondition",
          );
          blocked = true;
        }
      };
      await remove("delete_event", id);
      interleave = async () => {};
      assert.equal(blocked, true);
      assert.equal(
        (await db.doc(`chatPreferences/${preferenceId}`).get()).exists,
        false,
      );
      assert.equal(
        (await db.doc(`eventApplications/${id}_${uid}`).get()).exists,
        false,
      );
      assert.equal(
        (await db.doc(`deletionLocks/event_${id}`).get()).data().state,
        "completed",
      );
      await assert.rejects(
        saveEventPlan.run({
          auth: actor("nov1-organizer"),
          data: { eventId: id, mode: "create", event: plan },
        }),
        (error) => error.code === "failed-precondition",
      );
    },
  );
  await check(
    "user deletion blocks new applications and serializes competing deletions",
    async () => {
      const uid = "nov1-deleting-student";
      const id = "nov1-user-deletion";
      await user(uid);
      await event(id);
      let blocked = false;
      interleave = async (prefix) => {
        if (prefix === `profile-images/${uid}/`) {
          await assert.rejects(
            apply(uid, id),
            (error) => error.code === "permission-denied",
          );
          await assert.rejects(
            remove("delete_user", uid),
            (error) => error.code === "aborted",
          );
          blocked = true;
        }
      };
      await remove("delete_user", uid);
      interleave = async () => {};
      assert.equal(blocked, true);
      assert.equal(
        (await db.doc(`eventApplications/${id}_${uid}`).get()).exists,
        false,
      );
      assert.equal(
        (await db.doc(`events/${id}`).get()).data().applicantCount,
        0,
      );
      assert.equal(
        (await db.doc(`deletionLocks/user_${uid}`).get()).data().state,
        "completed",
      );
    },
  );
  await check(
    "interrupted deletion stays closed and can be retried",
    async () => {
      const uid = "nov1-retry-user";
      await user(uid);
      const id = "nov1-retry-membership";
      await event(id);
      await apply(uid, id);
      const request = deletionRequest("delete_user", uid);
      interleave = async (prefix) => {
        if (prefix === `profile-images/${uid}/`)
          throw new Error("Injected storage failure");
      };
      await assert.rejects(adminManageResource.run(request));
      assert.equal(
        (await db.doc(`chatRooms/event_${id}`).get()).data().memberCount,
        1,
      );
      assert.equal(
        (await db.doc(`users/${uid}`).get()).data().status,
        "deleting",
      );
      assert.equal(
        (await db.doc(`deletionLocks/user_${uid}`).get()).data().state,
        "failed",
      );
      interleave = async () => {};
      await adminManageResource.run(request);
      assert.equal(
        (await db.doc(`chatRooms/event_${id}`).get()).data().memberCount,
        1,
      );
      assert.equal((await db.doc(`users/${uid}`).get()).exists, false);
      assert.equal(
        (await db.doc(`deletionLocks/user_${uid}`).get()).data().state,
        "completed",
      );
    },
  );
  await check(
    "cancellation and deletion settle capacity once, including legacy records",
    async () => {
      for (const mode of [
        "queued",
        "processed",
        "legacy-queued",
        "legacy-processed",
        "waitlisted",
      ]) {
        const uid = `nov1-capacity-${mode}`;
        const id = `nov1-capacity-event-${mode}`;
        await user(uid);
        await event(id, {
          capacity: mode === "waitlisted" ? 1 : 5,
          applicantCount: mode === "waitlisted" ? 1 : 2,
        });
        const ref = db.doc(`eventApplications/${id}_${uid}`);
        const original = {
          id: ref.id,
          eventId: id,
          eventTitle: id,
          studentId: uid,
          organizationId: "nov1-organizer",
          organizationName: "Local organizer",
          status: "pending",
        };
        if (mode === "waitlisted") {
          await ref.set({
            ...original,
            status: "waitlisted",
            capacityHeld: false,
            waitlistSequence: 1,
            waitlistPosition: 1,
          });
        } else {
          await ref.set({
            ...original,
            ...(mode.startsWith("legacy") ? {} : { capacityHeld: true }),
          });
        }
        const before = await ref.get();
        await ref.update({ status: "cancelled" });
        const after = await ref.get();
        const payload = {
          params: { applicationId: ref.id },
          data: { before, after },
        };
        if (mode === "processed") await notifyApplicationUpdated.run(payload);
        if (mode === "legacy-processed") {
          await db
            .doc(`functionReceipts/application_${ref.id}_pending_cancelled`)
            .set({ processedAt: Timestamp.now() });
          await db.doc(`events/${id}`).update({ applicantCount: 1 });
        }
        await remove("delete_user", uid);
        await notifyApplicationUpdated.run(payload);
        assert.equal(
          (await db.doc(`events/${id}`).get()).data().applicantCount,
          1,
          mode,
        );
      }
    },
  );
  await check(
    "deleted user IDs cannot register a replacement document",
    async () => {
      const registration = (uid) => ({
        uid,
        role: "student",
        status: "active",
        email: `${uid}@u-aizu.ac.jp`,
        displayName: "Local student",
        university: "会津大学",
        department: "CS",
        grade: 2,
        interests: [],
        termsVersion: "2026-10-23",
        privacyVersion: "2026-10-23",
        legalAcceptedAt: firebase.firestore.Timestamp.now(),
        eligibilityConfirmedAt: firebase.firestore.Timestamp.now(),
        createdAt: firebase.firestore.Timestamp.now(),
        updatedAt: firebase.firestore.Timestamp.now(),
      });
      await assertSucceeds(
        context("nov1-registration-control")
          .firestore()
          .doc("users/nov1-registration-control")
          .set(registration("nov1-registration-control")),
      );
      const uid = "nov1-retry-user";
      await assertFails(
        context(uid).firestore().doc(`users/${uid}`).set(registration(uid)),
      );
    },
  );
  await check(
    "delayed application triggers cannot recreate deleted-user data",
    async () => {
      const uid = "nov1-late-student";
      const id = "nov1-late-event";
      await user(uid);
      await event(id);
      const response = await apply(uid, id);
      const ref = db.doc(`eventApplications/${response.applicationId}`);
      const created = await ref.get();
      await ref.update({ status: "confirmed" });
      const before = await ref.get();
      await ref.update({ status: "attended" });
      const after = await ref.get();
      await remove("delete_user", uid);
      await notifyApplicationUpdated.run({
        params: { applicationId: ref.id },
        data: { before, after },
      });
      await notifyApplicationCreated.run({
        params: { applicationId: ref.id },
        data: created,
      });
      assert.equal((await db.doc(`activities/${ref.id}`).get()).exists, false);
      assert.equal(
        (
          await db
            .doc(`notifications/application_updated_${ref.id}_attended`)
            .get()
        ).exists,
        false,
      );
      assert.equal(
        (await db.doc(`notifications/application_submitted_${ref.id}`).get())
          .exists,
        false,
      );
    },
  );
  await check(
    "delayed chat creation cannot recreate deleted event resources",
    async () => {
      const id = "nov1-late-room";
      await event(id);
      const snapshot = await db.doc(`events/${id}`).get();
      await remove("delete_event", id);
      await createEventChatRoom.run({
        params: { eventId: id },
        data: snapshot,
      });
      assert.equal((await db.doc(`chatRooms/event_${id}`).get()).exists, false);
      assert.equal((await db.doc(`eventCheckIns/${id}`).get()).exists, false);
    },
  );
  await check(
    "canceled events reject attendance and late attendance emits no proof",
    async () => {
      const uid = "nov1-canceled-student";
      const id = "nov1-canceled-event";
      await user(uid);
      await event(id, { startAt: Timestamp.fromMillis(Date.now() + 3600000) });
      const ref = db.doc(`eventApplications/${id}_${uid}`);
      await ref.set({
        id: ref.id,
        eventId: id,
        eventTitle: id,
        studentId: uid,
        organizationId: "nov1-organizer",
        organizationName: "Local organizer",
        status: "confirmed",
      });
      const before = await ref.get();
      const eventBefore = await db.doc(`events/${id}`).get();
      await ref.update({ status: "attended" });
      const attended = await ref.get();
      await db.doc(`events/${id}`).update({ status: "cancelled" });
      await notifyApplicationUpdated.run({
        params: { applicationId: ref.id },
        data: { before, after: attended },
      });
      assert.equal((await db.doc(`activities/${ref.id}`).get()).exists, false);
      await ref.update({ status: "confirmed" });
      const organizer = context("nov1-organizer").firestore();
      await assertFails(organizer.doc(ref.path).update({ status: "attended" }));
      await assertFails(organizer.doc(ref.path).update({ status: "absent" }));
      await notifyEventUnavailable.run({
        params: { eventId: id },
        data: {
          before: eventBefore,
          after: await db.doc(`events/${id}`).get(),
        },
      });
      assert.equal((await ref.get()).data().status, "cancelled");
    },
  );
  await check(
    "valid attendance is idempotent and an existing proof survives cancellation",
    async () => {
      const uid = "nov1-attended-student";
      const id = "nov1-attended-event";
      await user(uid);
      await event(id, { startAt: Timestamp.fromMillis(Date.now() - 3600000) });
      const response = { applicationId: `${id}_${uid}` };
      const ref = db.doc(`eventApplications/${response.applicationId}`);
      await ref.set({
        id: ref.id,
        eventId: id,
        eventTitle: id,
        studentId: uid,
        organizationId: "nov1-organizer",
        organizationName: "Local organizer",
        status: "confirmed",
      });
      const before = await ref.get();
      await assertSucceeds(
        context("nov1-organizer")
          .firestore()
          .doc(ref.path)
          .update({ status: "attended" }),
      );
      const after = await ref.get();
      const payload = {
        params: { applicationId: ref.id },
        data: { before, after },
      };
      await notifyApplicationUpdated.run(payload);
      const proof = await db.doc(`activities/${ref.id}`).get();
      assert.equal(proof.data().verificationStatus, "verified");
      await notifyApplicationUpdated.run(payload);
      assert.ok(
        (await db.doc(`activities/${ref.id}`).get())
          .data()
          .createdAt.isEqual(proof.data().createdAt),
      );
      await db.doc(`events/${id}`).update({ status: "cancelled" });
      await notifyApplicationUpdated.run(payload);
      assert.equal(
        (await db.doc(`activities/${ref.id}`).get()).data().verificationStatus,
        "verified",
      );
    },
  );
  await check(
    "profile counts converge across edits, unpublish, deletion and stale triggers",
    async () => {
      const uid = "nov1-count-owner";
      await user(uid, "organization");
      await event("nov1-count-a", { createdBy: uid });
      await event("nov1-count-b", { createdBy: uid });
      const ref = db.doc("events/nov1-count-a");
      const published = await ref.get();
      const payload = {
        params: { eventId: ref.id },
        data: { before: { data: () => undefined }, after: published },
      };
      const count = async () =>
        (await db.doc(`publicOrganizerProfiles/${uid}`).get()).data()
          .publishedEventCount;
      await syncEventPublicProfile.run(payload);
      assert.equal(await count(), 2);
      for (const status of [
        "unpublished",
        "published",
        "pending_review",
        "published",
      ]) {
        const before = await ref.get();
        await ref.update({ status });
        await syncEventPublicProfile.run({
          params: { eventId: ref.id },
          data: { before, after: await ref.get() },
        });
        assert.equal(await count(), status === "published" ? 2 : 1);
      }
      await db.doc("events/nov1-count-b").delete();
      await syncEventPublicProfile.run(payload);
      assert.equal(await count(), 1);
      await ref.delete();
      await Promise.all([
        syncEventPublicProfile.run(payload),
        syncEventPublicProfile.run(payload),
      ]);
      assert.equal(await count(), 0);
      await db.doc(`users/${uid}`).delete();
      await db.doc(`publicOrganizerProfiles/${uid}`).delete();
      await syncEventPublicProfile.run(payload);
      assert.equal(
        (await db.doc(`publicOrganizerProfiles/${uid}`).get()).exists,
        false,
      );
    },
  );
  console.log(`Additional security regressions: ${passed} passed.`);
} finally {
  await env.cleanup();
  await db.terminate();
}
