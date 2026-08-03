import fs from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import "firebase/compat/storage";

const PROJECT_ID = "demo-aizu-connect-rules";
const timestamp = firebase.firestore.Timestamp.fromDate(
  new Date("2026-01-01T00:00:00.000Z"),
);
const legalConsent = {
  termsVersion: "2026-08-01",
  privacyVersion: "2026-08-01",
  legalAcceptedAt: timestamp,
  eligibilityConfirmedAt: timestamp,
};

let testEnv;

const userDoc = (overrides = {}) => ({
  uid: "student-1",
  role: "student",
  status: "active",
  email: "student-1@u-aizu.ac.jp",
  displayName: "Student One",
  university: "会津大学",
  department: "Computer Science",
  grade: 2,
  interests: ["地域活動"],
  currentActivities: "Campus guide",
  wantToTry: "Volunteer",
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const studentProfile = (overrides = {}) => ({
  ...userDoc(),
  verificationMethod: "university_email",
  profileCompletionRate: 80,
  activityCount: 0,
  ...overrides,
});

const organizationDoc = (overrides = {}) => ({
  id: "org-1",
  displayName: "Aizu Org",
  description: "Local activities",
  contactEmail: "org@example.com",
  status: "active",
  createdBy: "org-1",
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const eventDoc = (overrides = {}) => ({
  title: "Aizu Event",
  summary: "A student-friendly event in Aizu.",
  category: "地域活動",
  location: "Aizuwakamatsu",
  startAtLabel: "1/1",
  startAt: timestamp,
  endAtLabel: "2:00",
  endAt: firebase.firestore.Timestamp.fromDate(
    new Date("2026-01-01T02:00:00.000Z"),
  ),
  feeType: "無料",
  feeAmount: 0,
  eventFormat: "現地",
  meetingPoint: "会津大学正門前",
  accessInfo: "",
  bringItems: "学生証",
  cancellationPolicy: "前日までにキャンセルしてください。",
  weatherPolicy: "中止時はチャットで連絡します。",
  accessibility: "必要な配慮を申請時にお知らせください。",
  contactMethod: "個別チャット",
  organizationName: "Aizu Org",
  status: "published",
  capacity: 20,
  applicantCount: 0,
  imageUrl: "https://example.com/event.png",
  tags: ["地域活動", "学生歓迎"],
  templateKey: "交流会",
  beginnerLevel: "初参加歓迎",
  takeaways: ["地域とつながる"],
  atmosphere: "少人数で話しやすい雰囲気です。",
  organizerDescription: "地域交流を企画する団体です。",
  organizerExperience: "地域イベントを10回開催",
  organizationId: "org-1",
  organizationVerified: true,
  createdBy: "org-1",
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const applicationDoc = (overrides = {}) => ({
  id: "app-1",
  eventId: "event-published",
  eventTitle: "Aizu Event",
  studentId: "student-1",
  studentName: "Student One",
  organizationName: "Aizu Org",
  organizationId: "org-1",
  status: "pending",
  createdAt: timestamp,
  ...overrides,
});

const roomDoc = (overrides = {}) => ({
  id: "room-1",
  applicationId: "app-1",
  eventId: "event-published",
  eventTitle: "Aizu Event",
  studentId: "student-1",
  studentName: "Student One",
  organizationName: "Aizu Org",
  participantIds: ["student-1", "org-1"],
  status: "active",
  lastMessageText: "Hello",
  lastMessageAt: timestamp,
  createdAt: timestamp,
  ...overrides,
});

const messageDoc = (overrides = {}) => ({
  roomId: "room-1",
  senderId: "student-1",
  senderName: "Student One",
  type: "text",
  text: "Hello",
  createdAt: timestamp,
  ...overrides,
});

const activityDoc = (overrides = {}) => ({
  id: "app-1",
  userId: "student-1",
  eventId: "event-published",
  title: "Aizu Event",
  organizationId: "org-1",
  organizationName: "Aizu Org",
  verificationStatus: "verified",
  verifiedBy: "org-1",
  occurredAt: timestamp,
  activityMonth: 1,
  activityYear: 2026,
  createdAt: timestamp,
  ...overrides,
});

const notificationDoc = (overrides = {}) => ({
  recipientId: "student-1",
  type: "new_event",
  title: "新しいイベントが公開されました",
  body: "Aizu Event",
  targetType: "event",
  targetId: "event-published",
  isRead: false,
  createdAt: timestamp,
  ...overrides,
});

const preferencesDoc = (userId = "student-1", overrides = {}) => ({
  userId,
  newEvents: true,
  applicationUpdates: true,
  chatMessages: true,
  eventReminders: true,
  updatedAt: timestamp,
  ...overrides,
});

const reportDoc = (overrides = {}) => ({
  reporterId: "student-1",
  targetType: "event",
  targetId: "event-published",
  targetTitle: "Aizu Event",
  reason: "不適切な内容",
  description: "Please review.",
  status: "submitted",
  createdAt: timestamp,
  ...overrides,
});

const deletionRequestDoc = (userId = "student-1", overrides = {}) => ({
  userId,
  status: "submitted",
  reason: "サービス利用を終了するため削除を希望します。",
  requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
  updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  ...overrides,
});

const savedEventDoc = (userId = "student-1", overrides = {}) => ({
  userId,
  eventId: "event-published",
  createdAt: timestamp,
  ...overrides,
});

const savedSearchDoc = (userId = "student-1", overrides = {}) => ({
  userId,
  searchText: "地域",
  category: "すべて",
  dateFilter: "今月",
  dayFilter: "すべて",
  timeFilter: "すべて",
  feeFilter: "無料",
  formatFilter: "現地",
  onlyAvailable: true,
  onlyBeginner: false,
  updatedAt: timestamp,
  ...overrides,
});

const chatPreferenceDoc = (userId = "student-1", overrides = {}) => ({
  userId,
  roomId: "room-1",
  muted: false,
  updatedAt: timestamp,
  ...overrides,
});

const auditLogDoc = (overrides = {}) => ({
  actorId: "admin-1",
  actorName: "Admin",
  action: "event_publish",
  targetType: "event",
  targetId: "event-published",
  targetTitle: "Aizu Event",
  reason: "公開基準を満たしていることを確認",
  createdAt: timestamp,
  ...overrides,
});

const contexts = () => ({
  anon: testEnv.unauthenticatedContext(),
  student: testEnv.authenticatedContext("student-1", {
    email: "student-1@u-aizu.ac.jp",
    email_verified: true,
  }),
  otherStudent: testEnv.authenticatedContext("student-2", {
    email: "student-2@u-aizu.ac.jp",
    email_verified: true,
  }),
  pendingStudent: testEnv.authenticatedContext("student-pending", {
    email: "pending@example.com",
    email_verified: true,
  }),
  organization: testEnv.authenticatedContext("org-1", {
    email: "org@example.com",
    email_verified: true,
  }),
  unverifiedOrganization: testEnv.authenticatedContext("org-1", {
    email: "org@example.com",
    email_verified: false,
  }),
  otherOrganization: testEnv.authenticatedContext("org-2", {
    email: "org-2@example.com",
    email_verified: true,
  }),
  admin: testEnv.authenticatedContext("admin-1", {
    email: "admin@example.com",
    email_verified: true,
  }),
});

const seedData = async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      db.doc("users/student-1").set(userDoc()),
      db.doc("users/student-2").set(
        userDoc({
          uid: "student-2",
          email: "student-2@u-aizu.ac.jp",
          displayName: "Student Two",
        }),
      ),
      db.doc("users/student-pending").set(
        userDoc({
          uid: "student-pending",
          status: "pending_approval",
          email: "pending@example.com",
        }),
      ),
      db.doc("users/org-1").set(
        userDoc({
          uid: "org-1",
          role: "organization",
          status: "active",
          email: "org@example.com",
          displayName: "Aizu Org",
          university: "主催者・団体",
          organizationId: "org-1",
          organizationName: "Aizu Org",
        }),
      ),
      db.doc("users/org-2").set(
        userDoc({
          uid: "org-2",
          role: "organization",
          status: "active",
          email: "org-2@example.com",
          displayName: "Other Org",
          university: "主催者・団体",
          organizationId: "org-2",
          organizationName: "Other Org",
        }),
      ),
      db.doc("users/admin-1").set({
        uid: "admin-1",
        role: "admin",
        status: "active",
        email: "admin@example.com",
        displayName: "Admin",
      }),
      db.doc("studentProfiles/student-1").set(studentProfile()),
      db.doc("studentProfiles/student-2").set(
        studentProfile({
          uid: "student-2",
          email: "student-2@u-aizu.ac.jp",
          displayName: "Student Two",
        }),
      ),
      db.doc("organizations/org-1").set(organizationDoc()),
      db.doc("organizations/org-2").set(
        organizationDoc({
          id: "org-2",
          displayName: "Other Org",
          contactEmail: "org-2@example.com",
          createdBy: "org-2",
        }),
      ),
      db.doc("events/event-published").set(eventDoc()),
      db.doc("events/event-pending").set(
        eventDoc({
          status: "pending_review",
          title: "Pending Event",
        }),
      ),
      db.doc("events/event-revision").set(
        eventDoc({
          status: "revision_required",
          title: "Revision Event",
        }),
      ),
      db.doc("events/event-other-org").set(
        eventDoc({
          title: "Other Org Event",
          organizationId: "org-2",
          organizationName: "Other Org",
          createdBy: "org-2",
        }),
      ),
      db.doc("eventApplications/app-1").set(applicationDoc()),
      db.doc("eventApplications/app-confirmed").set(
        applicationDoc({
          id: "app-confirmed",
          status: "confirmed",
        }),
      ),
      db.doc("eventApplications/app-waitlisted").set(
        applicationDoc({
          id: "app-waitlisted",
          status: "waitlisted",
          waitlistPosition: 1,
        }),
      ),
      db.doc("eventApplications/app-other-student").set(
        applicationDoc({
          id: "app-other-student",
          studentId: "student-2",
          studentName: "Student Two",
        }),
      ),
      db.doc("chatRooms/room-1").set(roomDoc()),
      db.doc("chatRooms/room-readonly").set(
        roomDoc({
          id: "room-readonly",
          status: "read_only",
        }),
      ),
      db.doc("chatRooms/room-1/messages/message-1").set(messageDoc()),
      db.doc("activities/app-1").set(activityDoc()),
      db.doc("notifications/notification-1").set(notificationDoc()),
      db.doc("notificationPreferences/student-1").set(preferencesDoc()),
      db.doc("reports/report-1").set(reportDoc()),
      db.doc("savedEvents/student-1_event-published").set(savedEventDoc()),
      db.doc("savedSearches/student-1_default").set(savedSearchDoc()),
      db.doc("chatPreferences/room-1_student-1").set(chatPreferenceDoc()),
      db.doc("publicOrganizerProfiles/org-1").set({
        userId: "org-1",
        displayName: "Aizu Org",
        description: "Local activities",
        experience: "10 events",
        publishedEventCount: 1,
        verified: true,
        updatedAt: timestamp,
      }),
      db.doc("auditLogs/audit-1").set(auditLogDoc()),
      db.doc("thirdPartyProvisionLogs/app-1").set({
        applicationId: "app-1",
        userId: "student-1",
        userDisplayName: "Student One",
        recipientId: "org-1",
        recipientName: "Aizu Org",
        eventId: "event-published",
        legalBasis: "本人同意",
        consentAccepted: true,
        sensitiveInfoConsent: false,
        dataCategories: ["表示名", "参加申請情報"],
        providedAt: timestamp,
        expiresAt: firebase.firestore.Timestamp.fromDate(
          new Date("2029-01-01T00:00:00.000Z"),
        ),
      }),
      db.doc("eventCheckIns/event-published").set({
        eventId: "event-published",
        organizerId: "org-1",
        code: "123456",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ]);

    await context
      .storage()
      .ref("profile-images/student-1/avatar.png")
      .putString("image", "raw", { contentType: "image/png" });
    await context
      .storage()
      .ref("event-images/org-1/event-published/cover.png")
      .putString("image", "raw", { contentType: "image/png" });
    await context
      .storage()
      .ref("chat-attachments/room-1/student-1/guide.txt")
      .putString("guide", "raw", { contentType: "text/plain" });
  });
};

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
    storage: {
      rules: fs.readFileSync("storage.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await seedData();
});

after(async () => {
  await testEnv.cleanup();
});

describe("users and profiles", () => {
  it("allows only self or admin to read private user and profile documents", async () => {
    const { anon, student, otherStudent, admin } = contexts();
    await assertFails(anon.firestore().doc("users/student-1").get());
    await assertSucceeds(student.firestore().doc("users/student-1").get());
    await assertFails(otherStudent.firestore().doc("users/student-1").get());
    await assertSucceeds(admin.firestore().doc("users/student-1").get());
    await assertSucceeds(
      student.firestore().doc("studentProfiles/student-1").get(),
    );
    await assertFails(
      otherStudent.firestore().doc("studentProfiles/student-1").get(),
    );
  });

  it("allows valid self-registration but blocks role escalation", async () => {
    const newStudent = testEnv.authenticatedContext("student-new", {
      email: "student-new@u-aizu.ac.jp",
      email_verified: true,
    });
    await assertSucceeds(
      newStudent
        .firestore()
        .doc("users/student-new")
        .set(
          userDoc({
            uid: "student-new",
            email: "student-new@u-aizu.ac.jp",
            status: "pending_approval",
            ...legalConsent,
          }),
        ),
    );
    const directActiveStudent = testEnv.authenticatedContext(
      "student-new-active",
      {
        email: "student-new-active@u-aizu.ac.jp",
        email_verified: true,
      },
    );
    await assertFails(
      directActiveStudent
        .firestore()
        .doc("users/student-new-active")
        .set(
          userDoc({
            uid: "student-new-active",
            email: "student-new-active@u-aizu.ac.jp",
            status: "active",
            ...legalConsent,
          }),
        ),
    );
    await assertFails(
      newStudent
        .firestore()
        .doc("users/student-new-without-consent")
        .set(
          userDoc({
            uid: "student-new-without-consent",
            email: "student-new@u-aizu.ac.jp",
          }),
        ),
    );
    await assertFails(
      newStudent
        .firestore()
        .doc("users/student-new-old-terms")
        .set(
          userDoc({
            uid: "student-new-old-terms",
            email: "student-new@u-aizu.ac.jp",
            ...legalConsent,
            termsVersion: "draft",
          }),
        ),
    );
    await assertFails(
      newStudent
        .firestore()
        .doc("users/student-new-admin")
        .set(
          userDoc({
            uid: "student-new-admin",
            role: "admin",
            email: "student-new@u-aizu.ac.jp",
            ...legalConsent,
          }),
        ),
    );
    await assertFails(
      newStudent
        .firestore()
        .doc("users/student-new-polluted")
        .set(
          userDoc({
            uid: "student-new-polluted",
            email: "student-new@u-aizu.ac.jp",
            organizationId: "org-1",
            organizationName: "Injected organization",
            ...legalConsent,
          }),
        ),
    );
    await assertFails(
      newStudent
        .firestore()
        .doc("users/student-new-invalid-time")
        .set(
          userDoc({
            uid: "student-new-invalid-time",
            email: "student-new@u-aizu.ac.jp",
            createdAt: "not-a-timestamp",
            ...legalConsent,
          }),
        ),
    );

    const externalStudent = testEnv.authenticatedContext("student-external", {
      email: "student@example.com",
      email_verified: true,
    });
    await assertFails(
      externalStudent
        .firestore()
        .doc("users/student-external")
        .set(
          userDoc({
            uid: "student-external",
            email: "student@example.com",
            status: "active",
            ...legalConsent,
          }),
        ),
    );
    const mismatchedStudent = testEnv.authenticatedContext(
      "student-email-mismatch",
      {
        email: "actual@example.com",
        email_verified: true,
      },
    );
    await assertFails(
      mismatchedStudent
        .firestore()
        .doc("users/student-email-mismatch")
        .set(
          userDoc({
            uid: "student-email-mismatch",
            email: "claimed@example.com",
            status: "pending_approval",
            ...legalConsent,
          }),
        ),
    );

    const unverifiedAizuStudent = testEnv.authenticatedContext(
      "student-unverified",
      {
        email: "student-unverified@u-aizu.ac.jp",
        email_verified: false,
      },
    );
    await assertFails(
      unverifiedAizuStudent
        .firestore()
        .doc("users/student-unverified")
        .set(
          userDoc({
            uid: "student-unverified",
            email: "student-unverified@u-aizu.ac.jp",
            status: "active",
            ...legalConsent,
          }),
        ),
    );
    await assertSucceeds(
      unverifiedAizuStudent
        .firestore()
        .doc("users/student-unverified")
        .set(
          userDoc({
            uid: "student-unverified",
            email: "student-unverified@u-aizu.ac.jp",
            status: "pending_approval",
            ...legalConsent,
          }),
        ),
    );
    await assertFails(
      unverifiedAizuStudent.firestore().doc("events/event-published").get(),
    );
  });

  it("allows only a verified Aizu student to self-approve from pending", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        db.doc("users/student-auto-approve").set(
          userDoc({
            uid: "student-auto-approve",
            email: "student-auto-approve@u-aizu.ac.jp",
            status: "pending_approval",
          }),
        ),
        db.doc("studentProfiles/student-auto-approve").set(
          studentProfile({
            uid: "student-auto-approve",
            email: "student-auto-approve@u-aizu.ac.jp",
            status: "pending_approval",
          }),
        ),
        db.doc("users/student-auto-unverified").set(
          userDoc({
            uid: "student-auto-unverified",
            email: "student-auto-unverified@u-aizu.ac.jp",
            status: "pending_approval",
          }),
        ),
        db.doc("users/student-auto-external").set(
          userDoc({
            uid: "student-auto-external",
            email: "student-auto-external@example.com",
            status: "pending_approval",
          }),
        ),
      ]);
    });

    const verifiedAizu = testEnv.authenticatedContext("student-auto-approve", {
      email: "student-auto-approve@u-aizu.ac.jp",
      email_verified: true,
    });
    await assertFails(
      verifiedAizu.firestore().doc("users/student-auto-approve").update({
        status: "active",
        displayName: "Changed during approval",
        updatedAt: timestamp,
      }),
    );
    await assertSucceeds(
      verifiedAizu.firestore().doc("users/student-auto-approve").update({
        status: "active",
        updatedAt: timestamp,
      }),
    );
    await assertSucceeds(
      verifiedAizu
        .firestore()
        .doc("studentProfiles/student-auto-approve")
        .update({
          status: "active",
          updatedAt: timestamp,
        }),
    );

    const unverifiedAizu = testEnv.authenticatedContext(
      "student-auto-unverified",
      {
        email: "student-auto-unverified@u-aizu.ac.jp",
        email_verified: false,
      },
    );
    await assertFails(
      unverifiedAizu.firestore().doc("users/student-auto-unverified").update({
        status: "active",
        updatedAt: timestamp,
      }),
    );

    const verifiedExternal = testEnv.authenticatedContext(
      "student-auto-external",
      {
        email: "student-auto-external@example.com",
        email_verified: true,
      },
    );
    await assertFails(
      verifiedExternal.firestore().doc("users/student-auto-external").update({
        status: "active",
        updatedAt: timestamp,
      }),
    );
  });

  it("allows student edits without allowing role or ownership changes", async () => {
    const { student, admin } = contexts();
    await assertSucceeds(
      student.firestore().doc("users/student-1").update({
        displayName: "Updated Student",
        updatedAt: timestamp,
      }),
    );
    await assertFails(
      student.firestore().doc("users/student-1").update({
        role: "admin",
      }),
    );
    await assertFails(
      student.firestore().doc("users/student-1").update({
        termsVersion: "tampered",
        legalAcceptedAt: timestamp,
      }),
    );
    await assertSucceeds(
      student.firestore().doc("studentProfiles/student-1").update({
        displayName: "Updated Student",
        updatedAt: timestamp,
      }),
    );
    await assertFails(
      student.firestore().doc("studentProfiles/student-1").update({
        uid: "student-2",
      }),
    );
    await assertFails(
      student
        .firestore()
        .doc("users/student-1")
        .update({
          interests: ["地域活動", { polluted: true }],
          updatedAt: timestamp,
        }),
    );
    await assertFails(
      admin.firestore().doc("users/student-1").update({
        status: "owner",
        updatedAt: timestamp,
      }),
    );
  });

  it("records current-document reconsent atomically and prevents tampering", async () => {
    const { student, otherStudent, admin } = contexts();
    const db = student.firestore();
    const acceptedAt = firebase.firestore.FieldValue.serverTimestamp();
    const consentRef = db.doc("legalConsents/student-1_2026-08-01_2026-08-01");
    const batch = db.batch();
    batch.update(db.doc("users/student-1"), {
      termsVersion: "2026-08-01",
      privacyVersion: "2026-08-01",
      legalAcceptedAt: acceptedAt,
      eligibilityConfirmedAt: acceptedAt,
      updatedAt: acceptedAt,
    });
    batch.set(consentRef, {
      userId: "student-1",
      termsVersion: "2026-08-01",
      privacyVersion: "2026-08-01",
      acceptedAt,
      eligibilityConfirmedAt: acceptedAt,
      source: "reconsent",
    });
    await assertSucceeds(batch.commit());
    await assertSucceeds(consentRef.get());
    await assertSucceeds(
      admin
        .firestore()
        .doc("legalConsents/student-1_2026-08-01_2026-08-01")
        .get(),
    );
    await assertFails(
      otherStudent
        .firestore()
        .doc("legalConsents/student-1_2026-08-01_2026-08-01")
        .get(),
    );
    await assertFails(consentRef.update({ source: "registration" }));
    await assertFails(
      student.firestore().doc("legalConsents/arbitrary-id").set({
        userId: "student-1",
        termsVersion: "2026-08-01",
        privacyVersion: "2026-08-01",
        acceptedAt: firebase.firestore.FieldValue.serverTimestamp(),
        eligibilityConfirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
        source: "reconsent",
      }),
    );
  });

  it("denies deletion of identity documents", async () => {
    const { student, admin } = contexts();
    await assertFails(student.firestore().doc("users/student-1").delete());
    await assertFails(
      admin.firestore().doc("studentProfiles/student-1").delete(),
    );
  });
});

describe("organizations", () => {
  it("allows admins and owners to read organizations while blocking unrelated users", async () => {
    const { student, organization, otherOrganization, admin } = contexts();
    await assertFails(student.firestore().doc("organizations/org-1").get());
    await assertSucceeds(
      organization.firestore().doc("organizations/org-1").get(),
    );
    await assertFails(
      otherOrganization.firestore().doc("organizations/org-1").get(),
    );
    await assertSucceeds(admin.firestore().doc("organizations/org-1").get());
  });

  it("allows pending organization registration and blocks polluted updates", async () => {
    const orgNew = testEnv.authenticatedContext("org-new", {
      email: "org-new@example.com",
      email_verified: true,
    });
    await assertSucceeds(
      orgNew
        .firestore()
        .doc("organizations/org-new")
        .set(
          organizationDoc({
            id: "org-new",
            status: "pending_approval",
            createdBy: "org-new",
            contactEmail: "org-new@example.com",
          }),
        ),
    );
    const { organization, admin } = contexts();
    await assertSucceeds(
      organization.firestore().doc("organizations/org-1").update({
        description: "Updated",
        updatedAt: timestamp,
      }),
    );
    await assertFails(
      organization
        .firestore()
        .doc("organizations/org-1")
        .update({
          description: "x".repeat(1001),
          updatedAt: timestamp,
        }),
    );
    await assertSucceeds(
      admin.firestore().doc("organizations/org-1").update({
        status: "active",
        updatedAt: timestamp,
      }),
    );
    await assertFails(
      admin.firestore().doc("organizations/org-1").update({
        contactEmail: "takeover@example.com",
      }),
    );
  });
});

describe("account deletion requests", () => {
  it("allows active users to submit and cancel only their own request", async () => {
    const { student, otherStudent, pendingStudent } = contexts();
    const requestRef = student
      .firestore()
      .doc("accountDeletionRequests/student-1");
    await assertSucceeds(requestRef.set(deletionRequestDoc()));
    await assertSucceeds(requestRef.get());
    await assertFails(
      otherStudent.firestore().doc("accountDeletionRequests/student-1").get(),
    );
    await assertFails(
      otherStudent
        .firestore()
        .doc("accountDeletionRequests/student-1")
        .set(deletionRequestDoc("student-1")),
    );
    await assertFails(
      pendingStudent
        .firestore()
        .doc("accountDeletionRequests/student-pending")
        .set(deletionRequestDoc("student-pending")),
    );
    await assertSucceeds(
      requestRef.update({
        status: "cancelled",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }),
    );
  });

  it("blocks malformed transitions while allowing admins to list requests", async () => {
    const { student, admin } = contexts();
    const requestRef = student
      .firestore()
      .doc("accountDeletionRequests/student-1");
    await assertFails(
      requestRef.set(
        deletionRequestDoc("student-1", {
          reason: "短い",
          unexpected: true,
        }),
      ),
    );
    await assertSucceeds(requestRef.set(deletionRequestDoc()));
    await assertFails(
      requestRef.update({
        reason: "申請後に理由だけを書き換えることはできません。",
        status: "cancelled",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }),
    );
    await assertFails(requestRef.delete());
    await assertSucceeds(
      admin
        .firestore()
        .collection("accountDeletionRequests")
        .where("status", "==", "submitted")
        .get(),
    );
  });
});

describe("events", () => {
  it("enforces event read visibility by role and status", async () => {
    const {
      anon,
      student,
      pendingStudent,
      organization,
      otherOrganization,
      admin,
    } = contexts();
    await assertFails(anon.firestore().doc("events/event-published").get());
    await assertSucceeds(
      student.firestore().doc("events/event-published").get(),
    );
    await assertFails(
      pendingStudent.firestore().doc("events/event-published").get(),
    );
    await assertFails(student.firestore().doc("events/event-pending").get());
    await assertSucceeds(
      organization.firestore().doc("events/event-pending").get(),
    );
    await assertFails(
      otherOrganization.firestore().doc("events/event-pending").get(),
    );
    await assertSucceeds(admin.firestore().doc("events/event-pending").get());
  });

  it("denies direct event creation because the callable owns writes", async () => {
    const { organization, student } = contexts();
    await assertFails(
      organization
        .firestore()
        .doc("events/event-new")
        .set(
          eventDoc({
            title: "New Event",
            status: "pending_review",
          }),
        ),
    );
    await assertFails(
      student
        .firestore()
        .doc("events/event-student")
        .set(
          eventDoc({
            createdBy: "student-1",
            organizationId: "student-1",
            organizationName: "Student One",
            organizationVerified: false,
            status: "pending_review",
          }),
        ),
    );
  });

  it("allows admin review and creator cancellation only", async () => {
    const { organization, admin } = contexts();
    await assertSucceeds(
      admin.firestore().doc("events/event-pending").update({
        status: "published",
        updatedAt: timestamp,
      }),
    );
    await assertFails(
      admin.firestore().doc("events/event-pending").update({
        title: "Admin rewrite",
      }),
    );
    await assertFails(
      organization.firestore().doc("events/event-revision").update({
        title: "",
        summary: "A student-friendly event in Aizu.",
        location: "Aizuwakamatsu",
        startAtLabel: "1/1",
        startAt: timestamp,
        capacity: 30,
        status: "pending_review",
        updatedAt: timestamp,
      }),
    );
    await assertFails(
      organization.firestore().doc("events/event-revision").update({
        title: "Revised Event",
        summary: "A student-friendly event in Aizu.",
        location: "Aizuwakamatsu",
        startAtLabel: "1/1",
        startAt: timestamp,
        capacity: 30,
        status: "pending_review",
        updatedAt: timestamp,
      }),
    );
    await assertSucceeds(
      organization.firestore().doc("events/event-published").update({
        status: "cancelled",
        cancellationReason: "主催者都合により中止します。",
        cancelledAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    await assertFails(
      organization.firestore().doc("events/event-pending").update({
        status: "cancelled",
        cancellationReason: "",
        cancelledAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    await assertFails(admin.firestore().doc("events/event-published").delete());
  });
});

describe("event applications and activities", () => {
  it("allows application reads only for admin, the student, or the organization", async () => {
    const { student, otherStudent, organization, otherOrganization, admin } =
      contexts();
    await assertSucceeds(
      student.firestore().doc("eventApplications/app-1").get(),
    );
    await assertFails(
      otherStudent.firestore().doc("eventApplications/app-1").get(),
    );
    await assertSucceeds(
      organization.firestore().doc("eventApplications/app-1").get(),
    );
    await assertFails(
      otherOrganization.firestore().doc("eventApplications/app-1").get(),
    );
    await assertSucceeds(
      admin.firestore().doc("eventApplications/app-1").get(),
    );
  });

  it("enforces application status transitions by role", async () => {
    const { student, organization, admin } = contexts();
    await assertFails(
      student
        .firestore()
        .doc("eventApplications/new-app")
        .set(
          applicationDoc({
            id: "new-app",
          }),
        ),
    );
    await assertFails(
      organization.firestore().doc("eventApplications/app-1").update({
        status: "attended",
      }),
    );
    await assertSucceeds(
      organization.firestore().doc("eventApplications/app-1").update({
        status: "confirmed",
      }),
    );
    await assertFails(
      organization.firestore().doc("eventApplications/app-waitlisted").update({
        status: "confirmed",
      }),
    );
    await assertSucceeds(
      organization.firestore().doc("eventApplications/app-waitlisted").update({
        status: "rejected",
      }),
    );
    await assertSucceeds(
      student.firestore().doc("eventApplications/app-confirmed").update({
        status: "cancelled",
      }),
    );
    await assertFails(
      admin.firestore().doc("eventApplications/app-1").delete(),
    );
  });

  it("allows activity reads by related roles and denies all client writes", async () => {
    const { student, otherStudent, organization, otherOrganization, admin } =
      contexts();
    await assertSucceeds(student.firestore().doc("activities/app-1").get());
    await assertFails(otherStudent.firestore().doc("activities/app-1").get());
    await assertSucceeds(
      organization.firestore().doc("activities/app-1").get(),
    );
    await assertFails(
      otherOrganization.firestore().doc("activities/app-1").get(),
    );
    await assertSucceeds(admin.firestore().doc("activities/app-1").get());
    await assertFails(
      organization
        .firestore()
        .doc("activities/app-client")
        .set(
          activityDoc({
            id: "app-client",
          }),
        ),
    );
  });
});

describe("chat rooms and messages", () => {
  it("allows only participants to read and update active room summaries", async () => {
    const { student, otherStudent, organization } = contexts();
    await assertSucceeds(student.firestore().doc("chatRooms/room-1").get());
    await assertSucceeds(
      organization.firestore().doc("chatRooms/room-1").get(),
    );
    await assertFails(otherStudent.firestore().doc("chatRooms/room-1").get());
    await assertSucceeds(
      student.firestore().doc("chatRooms/room-1").update({
        lastMessageText: "Updated message",
        lastMessageAt: timestamp,
      }),
    );
    await assertFails(
      student
        .firestore()
        .doc("chatRooms/room-1")
        .update({
          participantIds: ["student-1"],
        }),
    );
  });

  it("allows only active-room participants to create messages", async () => {
    const { student, otherStudent, organization } = contexts();
    await assertSucceeds(
      organization
        .firestore()
        .doc("chatRooms/room-1/messages/message-org")
        .set(
          messageDoc({
            senderId: "org-1",
            senderName: "Aizu Org",
            text: "Welcome",
          }),
        ),
    );
    await assertFails(
      otherStudent
        .firestore()
        .doc("chatRooms/room-1/messages/message-other")
        .set(
          messageDoc({
            senderId: "student-2",
            senderName: "Student Two",
          }),
        ),
    );
    await assertFails(
      student
        .firestore()
        .doc("chatRooms/room-readonly/messages/message-2")
        .set(
          messageDoc({
            roomId: "room-readonly",
          }),
        ),
    );
    await assertFails(
      student.firestore().doc("chatRooms/room-1/messages/message-1").update({
        text: "edited",
      }),
    );
  });
});

describe("notifications, preferences, reports, and saved events", () => {
  it("allows notification reads and read-state updates for recipients", async () => {
    const { student, otherStudent, admin } = contexts();
    await assertSucceeds(
      student.firestore().doc("notifications/notification-1").get(),
    );
    await assertFails(
      otherStudent.firestore().doc("notifications/notification-1").get(),
    );
    await assertSucceeds(
      admin.firestore().doc("notifications/notification-1").get(),
    );
    await assertSucceeds(
      student.firestore().doc("notifications/notification-1").update({
        isRead: true,
        readAt: timestamp,
      }),
    );
    await assertFails(
      student.firestore().doc("notifications/notification-1").update({
        isRead: "yes",
      }),
    );
    await assertSucceeds(
      admin.firestore().doc("notifications/new").set(notificationDoc()),
    );
    await assertFails(
      admin
        .firestore()
        .doc("notifications/invalid")
        .set(notificationDoc({ recipientId: "", isRead: true })),
    );
  });

  it("allows users to manage only their own notification preferences", async () => {
    const { student, otherStudent } = contexts();
    await assertSucceeds(
      student.firestore().doc("notificationPreferences/student-1").get(),
    );
    await assertSucceeds(
      student.firestore().doc("notificationPreferences/student-1").update({
        newEvents: false,
        updatedAt: timestamp,
      }),
    );
    await assertFails(
      otherStudent.firestore().doc("notificationPreferences/student-1").update({
        newEvents: true,
        updatedAt: timestamp,
      }),
    );
    await assertFails(
      student.firestore().doc("notificationPreferences/student-1").update({
        newEvents: "false",
        updatedAt: timestamp,
      }),
    );
  });

  it("allows signed-in report submission and admin-only review", async () => {
    const { anon, student, organization, admin } = contexts();
    await assertSucceeds(
      student
        .firestore()
        .doc("reports/report-new")
        .set(
          reportDoc({
            targetId: "event-published",
          }),
        ),
    );
    await assertFails(
      anon
        .firestore()
        .doc("reports/report-anon")
        .set(
          reportDoc({
            reporterId: "anon",
          }),
        ),
    );
    await assertFails(
      student
        .firestore()
        .doc("reports/report-bad")
        .set(
          reportDoc({
            reason: "unknown",
          }),
        ),
    );
    await assertFails(student.firestore().doc("reports/report-1").get());
    await assertSucceeds(admin.firestore().doc("reports/report-1").get());
    await assertSucceeds(
      admin.firestore().doc("reports/report-1").update({
        status: "resolved",
        resolution: "Handled",
        resolvedAt: timestamp,
      }),
    );
    await assertFails(
      organization.firestore().doc("reports/report-1").update({
        status: "resolved",
      }),
    );
  });

  it("allows active students to save only their own events without schema pollution", async () => {
    const { student, organization, otherStudent } = contexts();
    await assertSucceeds(
      student
        .firestore()
        .doc("savedEvents/student-1_event-new")
        .set(
          savedEventDoc("student-1", {
            eventId: "event-new",
          }),
        ),
    );
    await assertFails(
      student
        .firestore()
        .doc("savedEvents/student-1_polluted")
        .set(
          savedEventDoc("student-1", {
            extra: "polluted",
          }),
        ),
    );
    await assertFails(
      student
        .firestore()
        .doc("savedEvents/student-1_too-long")
        .set(
          savedEventDoc("student-1", {
            eventId: "x".repeat(201),
          }),
        ),
    );
    await assertFails(
      organization
        .firestore()
        .doc("savedEvents/org-1_event")
        .set(savedEventDoc("org-1")),
    );
    await assertFails(
      otherStudent
        .firestore()
        .doc("savedEvents/student-1_event-published")
        .delete(),
    );
    await assertSucceeds(
      student.firestore().doc("savedEvents/student-1_event-published").delete(),
    );
  });
});

describe("saved searches and operational records", () => {
  it("allows students to manage only their own valid saved search", async () => {
    const { student, otherStudent, organization } = contexts();
    await assertSucceeds(
      student.firestore().doc("savedSearches/student-1_default").get(),
    );
    await assertFails(
      otherStudent.firestore().doc("savedSearches/student-1_default").get(),
    );
    await assertSucceeds(
      student.firestore().doc("savedSearches/student-1_default").update({
        searchText: "ボランティア",
        updatedAt: timestamp,
      }),
    );
    await assertFails(
      student.firestore().doc("savedSearches/student-1_default").update({
        dateFilter: "来年",
        updatedAt: timestamp,
      }),
    );
    await assertFails(
      organization
        .firestore()
        .doc("savedSearches/org-1_default")
        .set(savedSearchDoc("org-1")),
    );
  });

  it("limits chat preferences to active room participants", async () => {
    const { student, otherStudent, organization } = contexts();
    await assertSucceeds(
      student.firestore().doc("chatPreferences/room-1_student-1").get(),
    );
    await assertSucceeds(
      organization
        .firestore()
        .doc("chatPreferences/room-1_org-1")
        .set(chatPreferenceDoc("org-1")),
    );
    await assertFails(
      otherStudent
        .firestore()
        .doc("chatPreferences/room-1_student-2")
        .set(chatPreferenceDoc("student-2")),
    );
  });

  it("restricts third-party provision records to the data subject and admins", async () => {
    const { student, otherStudent, organization, admin } = contexts();
    const path = "thirdPartyProvisionLogs/app-1";
    await assertSucceeds(student.firestore().doc(path).get());
    await assertSucceeds(admin.firestore().doc(path).get());
    await assertFails(otherStudent.firestore().doc(path).get());
    await assertFails(organization.firestore().doc(path).get());
    await assertFails(
      student.firestore().doc("thirdPartyProvisionLogs/forged").set({
        userId: "student-1",
        recipientId: "org-1",
      }),
    );
    await assertFails(student.firestore().doc(path).delete());
  });

  it("exposes public organizer profiles but protects audits and check-in codes", async () => {
    const { anon, student, organization, otherOrganization, admin } =
      contexts();
    await assertSucceeds(
      student.firestore().doc("publicOrganizerProfiles/org-1").get(),
    );
    await assertFails(
      anon.firestore().doc("publicOrganizerProfiles/org-1").get(),
    );
    await assertFails(student.firestore().doc("auditLogs/audit-1").get());
    await assertSucceeds(admin.firestore().doc("auditLogs/audit-1").get());
    await assertSucceeds(
      admin.firestore().doc("auditLogs/audit-new").set(auditLogDoc()),
    );
    await assertFails(
      admin.firestore().doc("auditLogs/audit-1").update({ reason: "edited" }),
    );
    await assertSucceeds(
      organization.firestore().doc("eventCheckIns/event-published").get(),
    );
    await assertFails(
      otherOrganization.firestore().doc("eventCheckIns/event-published").get(),
    );
    await assertFails(
      student.firestore().doc("eventCheckIns/event-published").get(),
    );
    await assertFails(
      organization.firestore().doc("eventCheckIns/event-published").update({
        code: "000000",
      }),
    );
  });
});

describe("storage rules", () => {
  it("allows signed-in reads but blocks public reads", async () => {
    const { anon, student, organization } = contexts();
    await assertFails(
      anon.storage().ref("profile-images/student-1/avatar.png").getMetadata(),
    );
    await assertSucceeds(
      student
        .storage()
        .ref("profile-images/student-1/avatar.png")
        .getMetadata(),
    );
    await assertSucceeds(
      organization
        .storage()
        .ref("event-images/org-1/event-published/cover.png")
        .getMetadata(),
    );
  });

  it("allows only active owners to upload valid images in scoped folders", async () => {
    const {
      student,
      pendingStudent,
      organization,
      unverifiedOrganization,
      otherOrganization,
    } = contexts();
    await assertSucceeds(
      student
        .storage()
        .ref("profile-images/student-1/new.png")
        .putString("image", "raw", { contentType: "image/png" }),
    );
    await assertFails(
      student
        .storage()
        .ref("profile-images/student-2/new.png")
        .putString("image", "raw", { contentType: "image/png" }),
    );
    await assertFails(
      pendingStudent
        .storage()
        .ref("profile-images/student-pending/new.png")
        .putString("image", "raw", { contentType: "image/png" }),
    );
    await assertSucceeds(
      organization
        .storage()
        .ref("profile-images/org-1/new.webp")
        .putString("image", "raw", { contentType: "image/webp" }),
    );
    await assertFails(
      unverifiedOrganization
        .storage()
        .ref("profile-images/org-1/unverified.webp")
        .putString("image", "raw", { contentType: "image/webp" }),
    );
    await assertSucceeds(
      organization
        .storage()
        .ref("event-images/org-1/event-new/cover.webp")
        .putString("image", "raw", { contentType: "image/webp" }),
    );
    await assertFails(
      unverifiedOrganization
        .storage()
        .ref("event-images/org-1/event-new/unverified.webp")
        .putString("image", "raw", { contentType: "image/webp" }),
    );
    await assertSucceeds(
      student
        .storage()
        .ref("event-images/student-1/event-new/cover.webp")
        .putString("image", "raw", { contentType: "image/webp" }),
    );
    await assertFails(
      otherOrganization
        .storage()
        .ref("event-images/org-1/event-new/cover.webp")
        .putString("image", "raw", { contentType: "image/webp" }),
    );
    await assertFails(
      organization
        .storage()
        .ref("event-images/org-1/event-new/cover.gif")
        .putString("image", "raw", { contentType: "image/gif" }),
    );
  });

  it("limits chat attachments to active participants and writable rooms", async () => {
    const { student, otherStudent, organization } = contexts();
    await assertSucceeds(
      student
        .storage()
        .ref("chat-attachments/room-1/student-1/guide.txt")
        .getMetadata(),
    );
    await assertSucceeds(
      organization
        .storage()
        .ref("chat-attachments/room-1/student-1/guide.txt")
        .getMetadata(),
    );
    await assertFails(
      otherStudent
        .storage()
        .ref("chat-attachments/room-1/student-1/guide.txt")
        .getMetadata(),
    );
    await assertSucceeds(
      student
        .storage()
        .ref("chat-attachments/room-1/student-1/notes.pdf")
        .putString("notes", "raw", { contentType: "application/pdf" }),
    );
    await assertFails(
      student
        .storage()
        .ref("chat-attachments/room-1/student-2/spoof.txt")
        .putString("spoof", "raw", { contentType: "text/plain" }),
    );
    await assertFails(
      student
        .storage()
        .ref("chat-attachments/room-readonly/student-1/late.txt")
        .putString("late", "raw", { contentType: "text/plain" }),
    );
    await assertFails(
      student
        .storage()
        .ref("chat-attachments/room-1/student-1/archive.zip")
        .putString("zip", "raw", { contentType: "application/zip" }),
    );
  });
});
