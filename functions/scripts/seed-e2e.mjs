import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST
) {
  console.error("seed-e2e.mjs requires Auth and Firestore emulators.");
  process.exit(1);
}

const projectId =
  process.env.GCLOUD_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  "demo-aizu-connect-e2e";

initializeApp({ projectId });

const auth = getAuth();
const db = getFirestore();

const now = new Date();
const timestamp = Timestamp.fromDate(now);
const eventStartDate = new Date(now);
eventStartDate.setDate(eventStartDate.getDate() + 14);
eventStartDate.setHours(18, 0, 0, 0);
const eventStartTimestamp = Timestamp.fromDate(eventStartDate);
const eventStartLabel = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
}).format(eventStartDate);
const activityDate = new Date(now);
activityDate.setDate(activityDate.getDate() - 30);
const activityTimestamp = Timestamp.fromDate(activityDate);
const defaultPassword = "password123";

const ensureUser = async ({
  uid,
  email,
  displayName,
  password = defaultPassword,
}) => {
  try {
    await auth.updateUser(uid, {
      email,
      password,
      emailVerified: true,
      disabled: false,
      displayName,
    });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    await auth.createUser({
      uid,
      email,
      password,
      emailVerified: true,
      displayName,
    });
  }
};

const userDoc = (overrides) => ({
  uid: overrides.uid,
  role: overrides.role ?? "student",
  status: overrides.status ?? "active",
  email: overrides.email,
  displayName: overrides.displayName,
  university: overrides.university ?? "会津大学",
  department: overrides.department ?? "Computer Science",
  grade: overrides.grade ?? 2,
  interests: overrides.interests ?? ["地域活動", "交流・コミュニティ"],
  currentActivities: overrides.currentActivities ?? "E2E seed activity",
  wantToTry: overrides.wantToTry ?? "E2E seed challenge",
  ...(overrides.organizationId
    ? {
        organizationId: overrides.organizationId,
        organizationName: overrides.organizationName,
      }
    : {}),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const eventDoc = (overrides = {}) => ({
  title: "E2E 地域交流会",
  summary: "E2Eで確認する学生歓迎の地域イベントです。",
  category: "地域活動",
  location: "会津若松市",
  startAtLabel: eventStartLabel,
  startAt: eventStartTimestamp,
  organizationName: "E2E主催団体",
  status: "published",
  capacity: 20,
  applicantCount: 1,
  imageUrl: "https://placehold.co/1200x675/png?text=Aizu+Connect+E2E",
  tags: ["地域活動", "学生歓迎"],
  organizationId: "org-e2e",
  organizationVerified: true,
  createdBy: "org-e2e",
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

await Promise.all([
  ensureUser({
    uid: "student-e2e",
    email: "student-e2e@u-aizu.ac.jp",
    displayName: "E2E 学生",
  }),
  ensureUser({
    uid: "org-e2e",
    email: "org-e2e@example.com",
    displayName: "E2E主催団体",
  }),
  ensureUser({
    uid: "admin-e2e",
    email: "admin@aizu-connect.local",
    displayName: "Aizu Connect 運営",
    password: "admin123",
  }),
  ensureUser({
    uid: "pending-e2e",
    email: "pending-e2e@example.com",
    displayName: "E2E 承認待ち",
  }),
]);

const batch = db.batch();

batch.set(
  db.doc("users/student-e2e"),
  userDoc({
    uid: "student-e2e",
    email: "student-e2e@u-aizu.ac.jp",
    displayName: "E2E 学生",
  }),
);
batch.set(db.doc("studentProfiles/student-e2e"), {
  ...userDoc({
    uid: "student-e2e",
    email: "student-e2e@u-aizu.ac.jp",
    displayName: "E2E 学生",
  }),
  verificationMethod: "university_email",
  profileCompletionRate: 80,
  activityCount: 1,
});
batch.set(
  db.doc("users/org-e2e"),
  userDoc({
    uid: "org-e2e",
    role: "organization",
    email: "org-e2e@example.com",
    displayName: "E2E主催団体",
    university: "主催者・団体",
    department: "",
    grade: 0,
    organizationId: "org-e2e",
    organizationName: "E2E主催団体",
  }),
);
batch.set(db.doc("organizations/org-e2e"), {
  id: "org-e2e",
  displayName: "E2E主催団体",
  description: "E2Eで確認する団体です。",
  contactEmail: "org-e2e@example.com",
  status: "active",
  createdBy: "org-e2e",
  createdAt: timestamp,
  updatedAt: timestamp,
});
batch.set(db.doc("users/admin-e2e"), {
  uid: "admin-e2e",
  role: "admin",
  status: "active",
  email: "admin@aizu-connect.local",
  displayName: "Aizu Connect 運営",
  university: "Aizu Connect運営",
  department: "運営",
  grade: 1,
  interests: [],
  createdAt: timestamp,
  updatedAt: timestamp,
});
batch.set(
  db.doc("users/pending-e2e"),
  userDoc({
    uid: "pending-e2e",
    status: "pending_approval",
    email: "pending-e2e@example.com",
    displayName: "E2E 承認待ち",
  }),
);

batch.set(db.doc("events/event-e2e-published"), eventDoc());
batch.set(
  db.doc("events/event-e2e-pending"),
  eventDoc({
    title: "E2E 審査待ちイベント",
    status: "pending_review",
    applicantCount: 0,
  }),
);
batch.set(db.doc("eventApplications/app-e2e"), {
  id: "app-e2e",
  eventId: "event-e2e-published",
  eventTitle: "E2E 地域交流会",
  studentId: "student-e2e",
  studentName: "E2E 学生",
  organizationName: "E2E主催団体",
  organizationId: "org-e2e",
  status: "pending",
  createdAt: timestamp,
});
batch.set(db.doc("chatRooms/app-e2e"), {
  id: "app-e2e",
  applicationId: "app-e2e",
  eventId: "event-e2e-published",
  eventTitle: "E2E 地域交流会",
  studentId: "student-e2e",
  studentName: "E2E 学生",
  organizationName: "E2E主催団体",
  participantIds: ["student-e2e", "org-e2e"],
  status: "active",
  lastMessageText: "E2E 初期メッセージ",
  lastMessageAt: timestamp,
  createdAt: timestamp,
});
batch.set(db.doc("chatRooms/app-e2e/messages/seed-message"), {
  roomId: "app-e2e",
  senderId: "org-e2e",
  senderName: "E2E主催団体",
  type: "text",
  text: "E2E 初期メッセージ",
  createdAt: timestamp,
});
batch.set(db.doc("activities/app-e2e"), {
  id: "app-e2e",
  userId: "student-e2e",
  eventId: "event-e2e-published",
  title: "E2E 地域交流会",
  organizationId: "org-e2e",
  organizationName: "E2E主催団体",
  verificationStatus: "verified",
  verifiedBy: "org-e2e",
  occurredAt: activityTimestamp,
  activityMonth: activityDate.getMonth() + 1,
  activityYear: activityDate.getFullYear(),
  createdAt: timestamp,
});
batch.set(db.doc("notifications/notification-e2e"), {
  recipientId: "student-e2e",
  type: "new_event",
  title: "E2E 通知",
  body: "E2E通知本文",
  targetType: "event",
  targetId: "event-e2e-published",
  isRead: false,
  createdAt: timestamp,
});
batch.set(db.doc("notificationPreferences/student-e2e"), {
  userId: "student-e2e",
  newEvents: true,
  applicationUpdates: true,
  chatMessages: true,
  eventReminders: true,
  updatedAt: timestamp,
});
batch.set(db.doc("reports/report-e2e"), {
  reporterId: "student-e2e",
  targetType: "event",
  targetId: "event-e2e-published",
  targetTitle: "E2E 地域交流会",
  reason: "不適切な内容",
  description: "E2Eで確認する通報です。",
  status: "submitted",
  createdAt: timestamp,
});
batch.set(db.doc("savedEvents/student-e2e_event-e2e-published"), {
  userId: "student-e2e",
  eventId: "event-e2e-published",
  createdAt: timestamp,
});

await batch.commit();

await db.doc("seedStatus/e2e").set({
  seededAt: FieldValue.serverTimestamp(),
  projectId,
});

console.log("E2E emulator seed complete.");
