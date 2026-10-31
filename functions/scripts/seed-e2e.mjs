import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

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

const storageBucket = `${projectId}.appspot.com`;
initializeApp({ projectId, storageBucket });

const auth = getAuth();
const db = getFirestore();
const bucket = getStorage().bucket();

const now = new Date();
const timestamp = Timestamp.fromDate(now);
const eventStartDate = new Date(now);
eventStartDate.setDate(eventStartDate.getDate() + 14);
eventStartDate.setHours(18, 0, 0, 0);
const eventStartTimestamp = Timestamp.fromDate(eventStartDate);
const eventEndDate = new Date(eventStartDate.getTime() + 2 * 60 * 60 * 1000);
const eventEndTimestamp = Timestamp.fromDate(eventEndDate);
const eventStartLabel = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
}).format(eventStartDate);
const eventEndLabel = new Intl.DateTimeFormat("ja-JP", {
  hour: "numeric",
  minute: "2-digit",
}).format(eventEndDate);
const accessibilityApplicationStartDate = new Date(eventStartDate);
accessibilityApplicationStartDate.setDate(
  accessibilityApplicationStartDate.getDate() + 60,
);
const accessibilityApplicationEndDate = new Date(
  accessibilityApplicationStartDate.getTime() + 2 * 60 * 60 * 1000,
);
const accessibilityApplicationStartTimestamp = Timestamp.fromDate(
  accessibilityApplicationStartDate,
);
const accessibilityApplicationEndTimestamp = Timestamp.fromDate(
  accessibilityApplicationEndDate,
);
const accessibilityApplicationStartLabel = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
}).format(accessibilityApplicationStartDate);
const accessibilityApplicationEndLabel = new Intl.DateTimeFormat("ja-JP", {
  hour: "numeric",
  minute: "2-digit",
}).format(accessibilityApplicationEndDate);
const checkInStartDate = new Date(now.getTime() - 30 * 60 * 1000);
const checkInEndDate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
const checkInStartTimestamp = Timestamp.fromDate(checkInStartDate);
const checkInEndTimestamp = Timestamp.fromDate(checkInEndDate);
const checkInStartLabel = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
}).format(checkInStartDate);
const checkInEndLabel = new Intl.DateTimeFormat("ja-JP", {
  hour: "numeric",
  minute: "2-digit",
}).format(checkInEndDate);
const activityDate = new Date(now);
activityDate.setDate(activityDate.getDate() - 30);
const activityTimestamp = Timestamp.fromDate(activityDate);
const completedEventStartDate = new Date(activityDate);
completedEventStartDate.setHours(10, 0, 0, 0);
const completedEventEndDate = new Date(
  completedEventStartDate.getTime() + 2 * 60 * 60 * 1000,
);
const completedEventStartTimestamp = Timestamp.fromDate(
  completedEventStartDate,
);
const completedEventEndTimestamp = Timestamp.fromDate(completedEventEndDate);
const completedEventStartLabel = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
}).format(completedEventStartDate);
const completedEventEndLabel = new Intl.DateTimeFormat("ja-JP", {
  hour: "numeric",
  minute: "2-digit",
}).format(completedEventEndDate);
const defaultPassword = "password123";
const testVariants = [
  ["desktop", "Desktop"],
  ["mobile", "Mobile"],
  ["tablet", "Tablet"],
  ["firefox", "Firefox"],
  ["webkit", "WebKit"],
];
const variantKeys = testVariants.map(([variant]) => variant);
const displayVariantFor = (variant) =>
  testVariants.find(([key]) => key === variant)?.[1] ?? variant;

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
  createdAt: overrides.createdAt ?? timestamp,
  updatedAt: overrides.updatedAt ?? timestamp,
});

const eventDoc = (overrides = {}) => ({
  title: "E2E 地域交流会",
  summary: "E2Eで確認する学生歓迎の地域イベントです。",
  category: "地域活動",
  location: "会津若松市",
  startAtLabel: eventStartLabel,
  startAt: eventStartTimestamp,
  endAtLabel: eventEndLabel,
  endAt: eventEndTimestamp,
  feeType: "無料",
  feeAmount: 0,
  eventFormat: "現地",
  meetingPoint: "会津大学 正門前",
  accessInfo: "会津大学前駅から徒歩約5分。駐車場は主催者へご相談ください。",
  bringItems: "学生証、飲み物",
  cancellationPolicy:
    "参加できなくなった場合は、開催前日までに活動ページからキャンセルしてください。",
  weatherPolicy: "変更・中止の場合は通知と全体チャットで案内します。",
  accessibility: "必要な配慮は参加申請時にお知らせください。",
  contactMethod: "申請後の個別チャットでお問い合わせください。",
  organizationName: "E2E主催団体",
  status: "published",
  capacity: 20,
  applicantCount: 1,
  imageUrl: "https://placehold.co/1200x675/png?text=Aizu+Connect+E2E",
  tags: ["地域活動", "学生歓迎", "初心者歓迎"],
  templateKey: "交流会",
  beginnerLevel: "初参加歓迎",
  takeaways: ["地域の人とつながる", "話すきっかけを作る", "活動実績として残す"],
  atmosphere: "少人数で話しやすく、初参加の学生にも主催者が声をかけます。",
  organizerDescription:
    "学生と地域が安心して交流できる場を継続的に運営しています。",
  organizerExperience: "地域交流イベントを10回以上開催",
  organizationId: "org-e2e",
  organizationVerified: true,
  createdBy: "org-e2e",
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const organizationFields = (variant) => ({
  organizationId: `org-e2e-${variant}`,
  organizationName: "E2E主催団体",
  createdBy: `org-e2e-${variant}`,
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

await Promise.all(
  variantKeys.flatMap((variant) => [
    ensureUser({
      uid: `student-late-${variant}`,
      email: `student-late-${variant}@u-aizu.ac.jp`,
      displayName: `E2E 後参加 ${displayVariantFor(variant)}`,
    }),
    ensureUser({
      uid: `student-e2e-${variant}`,
      email: `student-e2e-${variant}@u-aizu.ac.jp`,
      displayName: `E2E 学生 ${variant}`,
    }),
    ensureUser({
      uid: `org-e2e-${variant}`,
      email: `org-e2e-${variant}@example.com`,
      displayName: `E2E主催団体 ${variant}`,
    }),
    ensureUser({
      uid: `admin-e2e-${variant}`,
      email: `admin-e2e-${variant}@aizu-connect.local`,
      displayName: `Aizu Connect 運営 ${variant}`,
      password: "admin123",
    }),
    ensureUser({
      uid: `student-profile-${variant}`,
      email: `student-profile-${variant}@u-aizu.ac.jp`,
      displayName: `E2E プロフィール ${variant}`,
    }),
    ensureUser({
      uid: `student-account-${variant}`,
      email: `student-account-${variant}@u-aizu.ac.jp`,
      displayName: `E2E アカウント ${variant}`,
    }),
    ensureUser({
      uid: `student-suspended-checkin-${variant}`,
      email: `student-suspended-checkin-${variant}@u-aizu.ac.jp`,
      displayName: `E2E 停止中受付 ${variant}`,
    }),
    ensureUser({
      uid: `student-message-delete-${variant}`,
      email: `student-message-delete-${variant}@u-aizu.ac.jp`,
      displayName: `E2E メッセージ削除 ${variant}`,
    }),
    ensureUser({
      uid: `admin-delete-user-${variant}`,
      email: `admin-delete-${variant}@u-aizu.ac.jp`,
      displayName: `E2E 削除対象 ${variant}`,
    }),
    ensureUser({
      uid: `admin-review-user-${variant}`,
      email: `admin-review-${variant}@example.com`,
      displayName: `E2E 審査対象 ${variant}`,
    }),
  ]),
);

await Promise.all([
  auth.setCustomUserClaims("admin-e2e", {test_admin_mfa: true}),
  ...variantKeys.map((variant) =>
    auth.setCustomUserClaims(`admin-e2e-${variant}`, {
      test_admin_mfa: true,
    }),
  ),
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
for (let index = 0; index < 55; index += 1) {
  const suffix = String(index).padStart(2, "0");
  batch.set(
    db.doc(`users/zz-admin-page-user-${suffix}`),
    userDoc({
      uid: `zz-admin-page-user-${suffix}`,
      email: `page-user-${suffix}@u-aizu.ac.jp`,
      displayName: `E2E ページング対象 ${suffix}`,
    }),
  );
}
for (const [variant, displayVariant] of testVariants) {
  const studentId = `student-late-${variant}`;
  const studentData = userDoc({
    uid: studentId,
    email: `${studentId}@u-aizu.ac.jp`,
    displayName: `E2E 後参加 ${displayVariant}`,
  });
  batch.set(db.doc(`users/${studentId}`), studentData);
  batch.set(db.doc(`studentProfiles/${studentId}`), {
    ...studentData,
    verificationMethod: "university_email",
    profileCompletionRate: 80,
    activityCount: 0,
  });
}

batch.set(db.doc("events/event-e2e-published"), eventDoc());
for (const [variant, displayVariant] of testVariants) {
  batch.set(
    db.doc(`events/event-e2e-open-${variant}`),
    eventDoc({
      title: `E2E 追加募集イベント ${displayVariant}`,
      applicantCount: 0,
      ...organizationFields(variant),
    }),
  );
  batch.set(
    db.doc(`events/event-e2e-recovery-${variant}`),
    eventDoc({
      title: `E2E 通信確認イベント ${displayVariant}`,
      applicantCount: 0,
      ...organizationFields(variant),
    }),
  );
}
batch.set(
  db.doc("events/event-e2e-pending"),
  eventDoc({
    title: "E2E 審査待ちイベント",
    status: "pending_review",
    applicantCount: 0,
  }),
);
for (const variant of variantKeys) {
  const displayVariant = displayVariantFor(variant);
  const profileUserId = `student-profile-${variant}`;
  const accountUserId = `student-account-${variant}`;
  const isolatedStudentId = `student-e2e-${variant}`;
  const isolatedOrganizationId = `org-e2e-${variant}`;
  const isolatedAdminId = `admin-e2e-${variant}`;
  const profileEventId = `event-e2e-open-${variant}`;
  const suspendedStudentId = `student-suspended-checkin-${variant}`;
  const deleteMessageStudentId = `student-message-delete-${variant}`;
  const suspendedStudent = userDoc({
    uid: suspendedStudentId,
    email: `${suspendedStudentId}@u-aizu.ac.jp`,
    displayName: `E2E 停止中受付 ${displayVariant}`,
    status: "suspended",
    createdAt: Timestamp.fromMillis(timestamp.toMillis() - 86_400_000),
  });
  const deleteMessageStudent = userDoc({
    uid: deleteMessageStudentId,
    email: `${deleteMessageStudentId}@u-aizu.ac.jp`,
    displayName: `E2E メッセージ削除 ${displayVariant}`,
    createdAt: Timestamp.fromMillis(timestamp.toMillis() - 86_400_000),
  });
  batch.set(db.doc(`users/${suspendedStudentId}`), suspendedStudent);
  batch.set(db.doc(`studentProfiles/${suspendedStudentId}`), {
    ...suspendedStudent,
    verificationMethod: "university_email",
    profileCompletionRate: 80,
    activityCount: 0,
  });
  batch.set(db.doc(`users/${deleteMessageStudentId}`), deleteMessageStudent);
  batch.set(db.doc(`studentProfiles/${deleteMessageStudentId}`), {
    ...deleteMessageStudent,
    verificationMethod: "university_email",
    profileCompletionRate: 80,
    activityCount: 0,
  });
  const suspendedCheckInEventId = `event-suspended-checkin-${variant}`;
  const suspendedApplicationId =
    `${suspendedCheckInEventId}_${suspendedStudentId}`;
  batch.set(
    db.doc(`events/${suspendedCheckInEventId}`),
    eventDoc({
      title: `E2E 停止中受付 ${displayVariant}`,
      startAtLabel: checkInStartLabel,
      startAt: checkInStartTimestamp,
      endAtLabel: checkInEndLabel,
      endAt: checkInEndTimestamp,
      ...organizationFields(variant),
    }),
  );
  batch.set(db.doc(`eventApplications/${suspendedApplicationId}`), {
    id: suspendedApplicationId,
    eventId: suspendedCheckInEventId,
    eventTitle: `E2E 停止中受付 ${displayVariant}`,
    studentId: suspendedStudentId,
    studentName: `E2E 停止中受付 ${displayVariant}`,
    organizationName: "E2E主催団体",
    organizationId: isolatedOrganizationId,
    status: "confirmed",
    consentAccepted: true,
    createdAt: timestamp,
  });
  batch.set(db.doc(`eventCheckIns/${suspendedCheckInEventId}`), {
    eventId: suspendedCheckInEventId,
    organizerId: isolatedOrganizationId,
    code: "112233",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const deleteMessageRoomId = `message-delete-${variant}`;
  batch.set(db.doc(`chatRooms/${deleteMessageRoomId}`), {
    id: deleteMessageRoomId,
    roomType: "application",
    applicationId: deleteMessageRoomId,
    eventId: `event-message-delete-${variant}`,
    eventTitle: `E2E メッセージ削除 ${displayVariant}`,
    studentId: deleteMessageStudentId,
    studentName: `E2E メッセージ削除 ${displayVariant}`,
    organizationName: "E2E主催団体",
    organizationId: isolatedOrganizationId,
    status: "active",
    createdAt: timestamp,
  });
  batch.set(
    db.doc(`chatRooms/${deleteMessageRoomId}/members/${deleteMessageStudentId}`),
    {
      userId: deleteMessageStudentId,
      role: "student",
      displayName: `E2E メッセージ削除 ${displayVariant}`,
      joinedAt: timestamp,
    },
  );
  batch.set(
    db.doc(`chatRooms/${deleteMessageRoomId}/messages/delete-target`),
    {
      roomId: deleteMessageRoomId,
      senderId: deleteMessageStudentId,
      senderName: `E2E メッセージ削除 ${displayVariant}`,
      type: "text",
      text: "現在の本文",
      editedAt: timestamp,
      editHistory: [{text: "削除前の秘密の本文", editedAt: timestamp}],
      createdAt: timestamp,
    },
  );
  batch.set(
    db.doc(`users/${isolatedStudentId}`),
    userDoc({
      uid: isolatedStudentId,
      email: `student-e2e-${variant}@u-aizu.ac.jp`,
      displayName: `E2E 学生 ${displayVariant}`,
    }),
  );
  batch.set(db.doc(`studentProfiles/${isolatedStudentId}`), {
    ...userDoc({
      uid: isolatedStudentId,
      email: `student-e2e-${variant}@u-aizu.ac.jp`,
      displayName: `E2E 学生 ${displayVariant}`,
    }),
    verificationMethod: "university_email",
    profileCompletionRate: 80,
    activityCount: 0,
  });
  batch.set(db.doc(`notificationPreferences/${isolatedStudentId}`), {
    userId: isolatedStudentId,
    newEvents: true,
    applicationUpdates: true,
    chatMessages: true,
    eventReminders: true,
    updatedAt: timestamp,
  });
  batch.set(db.doc(`activities/core-activity-${variant}`), {
    id: `core-activity-${variant}`,
    userId: isolatedStudentId,
    eventId: `event-e2e-published-${variant}`,
    title: `E2E 地域交流会 ${displayVariant}`,
    organizationName: `E2E主催団体 ${displayVariant}`,
    certificateId: `AC-app-e2e-${variant}`,
    participantRole: "参加者",
    takeaways: ["地域の人とつながる", "話すきっかけを作る"],
    verificationStatus: "verified",
    verifiedBy: isolatedOrganizationId,
    occurredAt: activityTimestamp,
    activityMonth: activityDate.getMonth() + 1,
    activityYear: activityDate.getFullYear(),
    hours: 2,
    createdAt: timestamp,
  });
  batch.set(
    db.doc(`users/${isolatedOrganizationId}`),
    userDoc({
      uid: isolatedOrganizationId,
      role: "organization",
      email: `org-e2e-${variant}@example.com`,
      displayName: `E2E主催団体 ${displayVariant}`,
      university: "主催者・団体",
      department: "",
      grade: 0,
      organizationId: isolatedOrganizationId,
      organizationName: `E2E主催団体 ${displayVariant}`,
    }),
  );
  batch.set(db.doc(`organizations/${isolatedOrganizationId}`), {
    id: isolatedOrganizationId,
    displayName: `E2E主催団体 ${displayVariant}`,
    description: `E2E ${displayVariant}専用の団体です。`,
    contactEmail: `org-e2e-${variant}@example.com`,
    status: "active",
    createdBy: isolatedOrganizationId,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  batch.set(db.doc(`users/${isolatedAdminId}`), {
    uid: isolatedAdminId,
    role: "admin",
    status: "active",
    email: `admin-e2e-${variant}@aizu-connect.local`,
    displayName: `Aizu Connect 運営 ${displayVariant}`,
    university: "Aizu Connect運営",
    department: "運営",
    grade: 1,
    interests: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const organization = organizationFields(variant);
  const dashboardEventId = `event-e2e-published-${variant}`;
  const dashboardApplicationId = `${dashboardEventId}_${isolatedStudentId}`;
  const dashboardEventTitle = `E2E 地域交流会 ${displayVariant}`;
  batch.set(
    db.doc(`events/${dashboardEventId}`),
    eventDoc({
      title: dashboardEventTitle,
      applicantCount: 1,
      ...organization,
    }),
  );
  const accessibilityApplicationEventId = `event-e2e-a11y-application-${variant}`;
  const accessibilityApplicationTitle = `E2E 申込質問イベント ${displayVariant}`;
  batch.set(
    db.doc(`events/${accessibilityApplicationEventId}`),
    eventDoc({
      title: accessibilityApplicationTitle,
      applicantCount: 0,
      startAt: accessibilityApplicationStartTimestamp,
      startAtLabel: accessibilityApplicationStartLabel,
      endAt: accessibilityApplicationEndTimestamp,
      endAtLabel: accessibilityApplicationEndLabel,
      applicationQuestions: [
        {
          id: "motivation",
          label: "参加目的",
          type: "textarea",
          required: true,
          containsSensitiveInfo: true,
        },
        {
          id: "experience",
          label: "参加経験",
          type: "select",
          required: true,
          options: ["初めて", "参加経験あり"],
        },
        {
          id: "guidelines",
          label: "参加ルールの確認",
          type: "checkbox",
          required: true,
        },
      ],
      ...organization,
    }),
  );
  const paidDisclosureEventId = `event-e2e-paid-disclosure-${variant}`;
  const paidDisclosureTitle = `E2E 有料イベント ${displayVariant}`;
  batch.set(
    db.doc(`events/${paidDisclosureEventId}`),
    eventDoc({
      title: paidDisclosureTitle,
      feeType: "有料",
      feeAmount: 1500,
      commercialSellerName: "E2E主催団体",
      commercialSellerAddress: "福島県会津若松市一箕町鶴賀",
      commercialSellerPhone: "0242-00-0000",
      commercialResponsiblePerson: "テスト責任者",
      paymentMethod: "当日会場で現金払い",
      paymentTiming: "イベント当日の受付時",
      additionalFees: "会場までの交通費は参加者負担",
      applicantCount: 0,
      ...organization,
    }),
  );
  batch.set(db.doc(`eventApplications/${dashboardApplicationId}`), {
    id: dashboardApplicationId,
    eventId: dashboardEventId,
    eventTitle: dashboardEventTitle,
    studentId: isolatedStudentId,
    studentName: "E2E 学生",
    organizationName: organization.organizationName,
    organizationId: organization.organizationId,
    status: "pending",
    participantMessage: "地域の方と交流したいです。",
    accessibilityNeeds: "",
    emergencyContact: "",
    consentAccepted: true,
    createdAt: timestamp,
  });
  batch.set(db.doc(`chatRooms/${dashboardApplicationId}`), {
    id: dashboardApplicationId,
    roomType: "event",
    applicationId: dashboardApplicationId,
    eventId: dashboardEventId,
    eventTitle: dashboardEventTitle,
    studentId: isolatedStudentId,
    studentName: "E2E 学生",
    organizationName: organization.organizationName,
    organizationId: organization.organizationId,
    participantIds: [isolatedStudentId, isolatedOrganizationId],
    status: "active",
    lastMessageText: "E2E 初期メッセージ",
    lastMessageAt: timestamp,
    createdAt: timestamp,
  });
  batch.set(
    db.doc(`chatRooms/${dashboardApplicationId}/messages/seed-message`),
    {
      roomId: dashboardApplicationId,
      senderId: isolatedOrganizationId,
      senderName: organization.organizationName,
      type: "text",
      text: "E2E 初期メッセージ",
      suppressNotification: true,
      createdAt: timestamp,
    },
  );
  batch.set(
    db.doc(`chatRooms/${dashboardApplicationId}/messages/student-seed-message`),
    {
      roomId: dashboardApplicationId,
      senderId: isolatedStudentId,
      senderName: `E2E 学生 ${displayVariant}`,
      type: "text",
      text: "E2E 学生からの編集・削除確認用メッセージ",
      suppressNotification: true,
      createdAt: Timestamp.fromMillis(now.getTime() + 1_000),
    },
  );
  batch.set(
    db.doc(`chatRooms/${dashboardApplicationId}/members/${isolatedStudentId}`),
    {
      userId: isolatedStudentId,
      role: "student",
      displayName: `E2E 学生 ${displayVariant}`,
      joinedAt: timestamp,
    },
  );
  const accessibilityCheckInEventId = `event-e2e-a11y-checkin-${variant}`;
  const accessibilityCheckInTitle = `E2E QR受付確認 ${displayVariant}`;
  batch.set(
    db.doc(`events/${accessibilityCheckInEventId}`),
    eventDoc({
      title: accessibilityCheckInTitle,
      startAtLabel: checkInStartLabel,
      startAt: checkInStartTimestamp,
      endAtLabel: checkInEndLabel,
      endAt: checkInEndTimestamp,
      applicantCount: 1,
      ...organization,
    }),
  );
  batch.set(
    db.doc(
      `eventApplications/${accessibilityCheckInEventId}_${isolatedStudentId}`,
    ),
    {
      id: `${accessibilityCheckInEventId}_${isolatedStudentId}`,
      eventId: accessibilityCheckInEventId,
      eventTitle: accessibilityCheckInTitle,
      eventStartAt: checkInStartTimestamp,
      eventEndAt: checkInEndTimestamp,
      studentId: isolatedStudentId,
      studentName: `E2E 学生 ${displayVariant}`,
      organizationName: organization.organizationName,
      organizationId: organization.organizationId,
      status: "confirmed",
      consentAccepted: true,
      createdAt: Timestamp.fromMillis(now.getTime() + 2_000),
    },
  );
  batch.set(db.doc(`eventCheckIns/${accessibilityCheckInEventId}`), {
    eventId: accessibilityCheckInEventId,
    organizerId: organization.organizationId,
    code: "246810",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const accessibilitySurveyEventId = `event-e2e-a11y-survey-${variant}`;
  const accessibilitySurveyTitle = `E2E 開催後アンケート ${displayVariant}`;
  batch.set(
    db.doc(`events/${accessibilitySurveyEventId}`),
    eventDoc({
      title: accessibilitySurveyTitle,
      startAtLabel: completedEventStartLabel,
      startAt: completedEventStartTimestamp,
      endAtLabel: completedEventEndLabel,
      endAt: completedEventEndTimestamp,
      applicantCount: 1,
      ...organization,
    }),
  );
  batch.set(
    db.doc(
      `eventApplications/${accessibilitySurveyEventId}_${isolatedStudentId}`,
    ),
    {
      id: `${accessibilitySurveyEventId}_${isolatedStudentId}`,
      eventId: accessibilitySurveyEventId,
      eventTitle: accessibilitySurveyTitle,
      eventStartAt: completedEventStartTimestamp,
      eventEndAt: completedEventEndTimestamp,
      studentId: isolatedStudentId,
      studentName: `E2E 学生 ${displayVariant}`,
      organizationName: organization.organizationName,
      organizationId: organization.organizationId,
      status: "attended",
      consentAccepted: true,
      createdAt: Timestamp.fromMillis(now.getTime() + 3_000),
    },
  );
  batch.set(
    db.doc(
      `chatRooms/${dashboardApplicationId}/members/${isolatedOrganizationId}`,
    ),
    {
      userId: isolatedOrganizationId,
      role: "organization",
      displayName: organization.organizationName,
      joinedAt: timestamp,
    },
  );
  batch.set(
    db.doc(`users/${profileUserId}`),
    userDoc({
      uid: profileUserId,
      email: `student-profile-${variant}@u-aizu.ac.jp`,
      displayName: `E2E プロフィール ${displayVariant}`,
    }),
  );
  batch.set(db.doc(`studentProfiles/${profileUserId}`), {
    ...userDoc({
      uid: profileUserId,
      email: `student-profile-${variant}@u-aizu.ac.jp`,
      displayName: `E2E プロフィール ${displayVariant}`,
    }),
    verificationMethod: "university_email",
    profileCompletionRate: 80,
    activityCount: 1,
  });
  batch.set(db.doc(`notifications/profile-notification-${variant}`), {
    recipientId: profileUserId,
    type: "new_event",
    title: "E2E 通知",
    body: "E2E通知本文",
    targetType: "event",
    targetId: profileEventId,
    isRead: false,
    createdAt: timestamp,
  });
  batch.set(db.doc(`notificationPreferences/${profileUserId}`), {
    userId: profileUserId,
    newEvents: true,
    applicationUpdates: true,
    chatMessages: true,
    eventReminders: true,
    updatedAt: timestamp,
  });
  batch.set(db.doc(`activities/profile-activity-${variant}`), {
    id: `profile-activity-${variant}`,
    userId: profileUserId,
    eventId: profileEventId,
    title: `E2E 追加募集イベント ${displayVariant}`,
    organizationId: "org-e2e",
    organizationName: `E2E主催団体 ${displayVariant}`,
    certificateId: `AC-profile-${variant}`,
    participantRole: "参加者",
    takeaways: ["地域の人とつながる", "活動実績として残す"],
    verificationStatus: "verified",
    verifiedBy: "org-e2e",
    occurredAt: activityTimestamp,
    activityMonth: activityDate.getMonth() + 1,
    activityYear: activityDate.getFullYear(),
    createdAt: timestamp,
  });
  batch.set(
    db.doc(`users/${accountUserId}`),
    userDoc({
      uid: accountUserId,
      email: `student-account-${variant}@u-aizu.ac.jp`,
      displayName: `E2E アカウント ${displayVariant}`,
    }),
  );
  batch.set(db.doc(`studentProfiles/${accountUserId}`), {
    ...userDoc({
      uid: accountUserId,
      email: `student-account-${variant}@u-aizu.ac.jp`,
      displayName: `E2E アカウント ${displayVariant}`,
    }),
    verificationMethod: "university_email",
    profileCompletionRate: 80,
    activityCount: 1,
  });
  batch.set(db.doc(`notificationPreferences/${accountUserId}`), {
    userId: accountUserId,
    newEvents: true,
    applicationUpdates: true,
    chatMessages: true,
    eventReminders: true,
    updatedAt: timestamp,
  });
  batch.set(db.doc(`activities/account-activity-${variant}`), {
    id: `account-activity-${variant}`,
    userId: accountUserId,
    eventId: profileEventId,
    title: `E2E 追加募集イベント ${displayVariant}`,
    organizationId: "org-e2e",
    organizationName: `E2E主催団体 ${displayVariant}`,
    certificateId: `AC-account-${variant}`,
    participantRole: "参加者",
    takeaways: ["活動証明を確認する", "退会申請を確認する"],
    verificationStatus: "verified",
    verifiedBy: "org-e2e",
    occurredAt: activityTimestamp,
    activityMonth: activityDate.getMonth() + 1,
    activityYear: activityDate.getFullYear(),
    hours: 2,
    createdAt: timestamp,
  });
  const userId = `admin-delete-user-${variant}`;
  const eventId = `admin-delete-event-${variant}`;
  const reviewUserId = `admin-review-user-${variant}`;
  const reviewEventId = `admin-review-event-${variant}`;
  batch.set(
    db.doc(`users/${userId}`),
    userDoc({
      uid: userId,
      email: `admin-delete-${variant}@u-aizu.ac.jp`,
      displayName: `E2E 削除対象 ${displayVariant}`,
    }),
  );
  batch.set(db.doc(`studentProfiles/${userId}`), {
    ...userDoc({
      uid: userId,
      email: `admin-delete-${variant}@u-aizu.ac.jp`,
      displayName: `E2E 削除対象 ${displayVariant}`,
    }),
    verificationMethod: "university_email",
    profileCompletionRate: 80,
    activityCount: 0,
  });
  batch.set(
    db.doc(`users/${reviewUserId}`),
    userDoc({
      uid: reviewUserId,
      status: "pending_approval",
      email: `admin-review-${variant}@example.com`,
      displayName: `E2E 審査対象 ${displayVariant}`,
    }),
  );
  batch.set(db.doc(`studentProfiles/${reviewUserId}`), {
    ...userDoc({
      uid: reviewUserId,
      status: "pending_approval",
      email: `admin-review-${variant}@example.com`,
      displayName: `E2E 審査対象 ${displayVariant}`,
    }),
    verificationMethod: "manual_review",
    profileCompletionRate: 80,
    activityCount: 0,
  });
  batch.set(
    db.doc(`events/${reviewEventId}`),
    eventDoc({
      title: `E2E 管理審査イベント ${displayVariant}`,
      status: "pending_review",
      applicantCount: 0,
    }),
  );
  batch.set(
    db.doc(`events/${eventId}`),
    eventDoc({
      title: `E2E 管理削除イベント ${displayVariant}`,
      applicantCount: 1,
    }),
  );
  batch.set(
    db.doc(`events/admin-reported-event-${variant}`),
    eventDoc({
      title: `E2E 管理通報イベント ${displayVariant}`,
      applicantCount: 0,
    }),
  );
  batch.set(
    db.doc(`events/admin-direct-event-${variant}`),
    eventDoc({
      title: `E2E 直接削除イベント ${displayVariant}`,
      applicantCount: 0,
    }),
  );
  batch.set(db.doc(`eventApplications/${eventId}_${userId}`), {
    id: `${eventId}_${userId}`,
    eventId,
    eventTitle: `E2E 管理削除イベント ${displayVariant}`,
    studentId: userId,
    studentName: `E2E 削除対象 ${displayVariant}`,
    organizationName: "E2E主催団体",
    organizationId: "org-e2e",
    status: "pending",
    participantMessage: "管理者削除の関連データ確認用です。",
    accessibilityNeeds: "",
    emergencyContact: "",
    consentAccepted: true,
    createdAt: timestamp,
  });
  batch.set(db.doc(`chatRooms/${eventId}_${userId}`), {
    id: `${eventId}_${userId}`,
    roomType: "application",
    applicationId: `${eventId}_${userId}`,
    eventId,
    eventTitle: `E2E 管理削除イベント ${displayVariant}`,
    studentId: userId,
    studentName: `E2E 削除対象 ${displayVariant}`,
    organizationName: "E2E主催団体",
    organizationId: "org-e2e",
    participantIds: [userId, "org-e2e"],
    status: "active",
    lastMessageText: "削除確認用",
    lastMessageAt: timestamp,
    createdAt: timestamp,
  });
  batch.set(db.doc(`reports/admin-delete-report-${variant}`), {
    reporterId: "student-e2e",
    targetType: "event",
    targetId: `admin-reported-event-${variant}`,
    targetTitle: `E2E 管理通報イベント ${displayVariant}`,
    reason: "不適切な内容",
    description: `E2E管理削除通報 ${displayVariant}`,
    status: "submitted",
    createdAt: timestamp,
  });
  batch.set(db.doc(`reports/admin-user-report-${variant}`), {
    reporterId: userId,
    targetType: "event",
    targetId: "event-e2e-published",
    targetTitle: "E2E 地域交流会",
    reason: "その他",
    description: `削除ユーザー通報の匿名化確認 ${displayVariant}`,
    status: "submitted",
    createdAt: timestamp,
  });
  batch.set(db.doc(`reports/admin-moderation-report-${variant}`), {
    reporterId: "student-e2e",
    targetType: "event",
    targetId: "event-e2e-published",
    targetTitle: "E2E 地域交流会",
    reason: "その他",
    description: `E2E モデレーション通報 ${displayVariant}`,
    status: "submitted",
    createdAt: timestamp,
  });
  batch.set(db.doc(`savedEvents/${userId}_${eventId}`), {
    userId,
    eventId,
    createdAt: timestamp,
  });
  batch.set(db.doc(`accountDeletionRequests/${userId}`), {
    userId,
    status: "submitted",
    reason: `E2E ${displayVariant}の退会・データ削除申請です。`,
    requestedAt: timestamp,
    updatedAt: timestamp,
  });
  batch.set(db.doc(`eventCheckIns/${eventId}`), {
    eventId,
    organizerId: "org-e2e",
    code: "999999",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
for (let index = 0; index < 120; index += 1) {
  batch.set(db.doc(`savedEvents/admin-delete-bulk-${index}`), {
    userId: "admin-delete-user-desktop",
    eventId: `bulk-event-${index}`,
    createdAt: timestamp,
  });
}
for (const [variant, displayVariant] of testVariants) {
  batch.set(
    db.doc(`events/event-e2e-chat-history-${variant}`),
    eventDoc({
      title: `E2E 全体チャットイベント ${displayVariant}`,
      applicantCount: 0,
      ...organizationFields(variant),
    }),
  );
}
for (const variant of variantKeys) {
  const displayVariant = displayVariantFor(variant);
  batch.set(
    db.doc(`events/event-e2e-waitlist-${variant}`),
    eventDoc({
      title: `E2E 満員イベント ${displayVariant}`,
      capacity: 1,
      applicantCount: 1,
      ...organizationFields(variant),
    }),
  );
  const waitlistOccupantId = `student-late-${variant}`;
  const waitlistOccupantApplicationId = `event-e2e-waitlist-${variant}_${waitlistOccupantId}`;
  batch.set(db.doc(`eventApplications/${waitlistOccupantApplicationId}`), {
    id: waitlistOccupantApplicationId,
    eventId: `event-e2e-waitlist-${variant}`,
    eventTitle: `E2E 満員イベント ${displayVariant}`,
    studentId: waitlistOccupantId,
    studentName: `E2E 後参加 ${displayVariant}`,
    organizationName: "E2E主催団体",
    organizationId: `org-e2e-${variant}`,
    status: "confirmed",
    participantMessage: "満員状態を作るための参加者です。",
    accessibilityNeeds: "",
    emergencyContact: "",
    consentAccepted: true,
    createdAt: timestamp,
  });
  batch.set(
    db.doc(`events/event-e2e-checkin-${variant}`),
    eventDoc({
      title: `E2E 当日受付 ${displayVariant}`,
      startAtLabel: checkInStartLabel,
      startAt: checkInStartTimestamp,
      endAtLabel: checkInEndLabel,
      endAt: checkInEndTimestamp,
      applicantCount: 1,
      ...organizationFields(variant),
    }),
  );
  const studentId = `student-late-${variant}`;
  const applicationId = `event-e2e-checkin-${variant}_${studentId}`;
  batch.set(db.doc(`eventApplications/${applicationId}`), {
    id: applicationId,
    eventId: `event-e2e-checkin-${variant}`,
    eventTitle: `E2E 当日受付 ${displayVariant}`,
    studentId,
    studentName: `E2E 後参加 ${displayVariant}`,
    organizationName: "E2E主催団体",
    organizationId: `org-e2e-${variant}`,
    status: "confirmed",
    participantMessage: "当日の受付動線を確認します。",
    accessibilityNeeds: "",
    emergencyContact: "",
    consentAccepted: true,
    createdAt: timestamp,
  });
  batch.set(db.doc(`eventCheckIns/event-e2e-checkin-${variant}`), {
    eventId: `event-e2e-checkin-${variant}`,
    organizerId: `org-e2e-${variant}`,
    code: "654321",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const participantEventId = `event-e2e-participant-management-${variant}`;
  const participantApplicationId = `${participantEventId}_student-late-${variant}`;
  batch.set(
    db.doc(`events/${participantEventId}`),
    eventDoc({
      title: `E2E 参加者管理 ${displayVariant}`,
      startAtLabel: checkInStartLabel,
      startAt: checkInStartTimestamp,
      endAtLabel: checkInEndLabel,
      endAt: checkInEndTimestamp,
      applicantCount: 1,
      ...organizationFields(variant),
    }),
  );
  batch.set(db.doc(`eventApplications/${participantApplicationId}`), {
    id: participantApplicationId,
    eventId: participantEventId,
    eventTitle: `E2E 参加者管理 ${displayVariant}`,
    studentId: `student-late-${variant}`,
    studentName: `E2E 後参加 ${displayVariant}`,
    organizationName: "E2E主催団体",
    organizationId: `org-e2e-${variant}`,
    status: "pending",
    participantMessage: "参加者管理の完了動線を確認します。",
    accessibilityNeeds: "席の場所を事前に確認したいです。",
    emergencyContact: "E2E緊急連絡先",
    consentAccepted: true,
    createdAt: timestamp,
  });
  batch.set(db.doc(`chatRooms/${participantApplicationId}`), {
    id: participantApplicationId,
    roomType: "application",
    applicationId: participantApplicationId,
    eventId: participantEventId,
    eventTitle: `E2E 参加者管理 ${displayVariant}`,
    studentId: `student-late-${variant}`,
    studentName: `E2E 後参加 ${displayVariant}`,
    organizationName: "E2E主催団体",
    organizationId: `org-e2e-${variant}`,
    participantIds: [`student-late-${variant}`, `org-e2e-${variant}`],
    status: "active",
    lastMessageText: "参加者管理の個別連絡です。",
    lastMessageAt: timestamp,
    createdAt: timestamp,
  });
  batch.set(
    db.doc(
      `chatRooms/${participantApplicationId}/messages/participant-seed-message`,
    ),
    {
      roomId: participantApplicationId,
      senderId: `student-late-${variant}`,
      senderName: `E2E 後参加 ${displayVariant}`,
      type: "text",
      text: "参加者管理の個別連絡です。",
      suppressNotification: true,
      createdAt: timestamp,
    },
  );
  batch.set(
    db.doc(
      `chatRooms/${participantApplicationId}/members/student-late-${variant}`,
    ),
    {
      userId: `student-late-${variant}`,
      role: "student",
      displayName: `E2E 後参加 ${displayVariant}`,
      joinedAt: timestamp,
    },
  );
  batch.set(
    db.doc(`chatRooms/${participantApplicationId}/members/org-e2e-${variant}`),
    {
      userId: `org-e2e-${variant}`,
      role: "organization",
      displayName: `E2E主催団体 ${displayVariant}`,
      joinedAt: timestamp,
    },
  );
}
batch.set(db.doc("eventApplications/app-e2e"), {
  id: "app-e2e",
  eventId: "event-e2e-published",
  eventTitle: "E2E 地域交流会",
  studentId: "student-e2e",
  studentName: "E2E 学生",
  organizationName: "E2E主催団体",
  organizationId: "org-e2e",
  status: "pending",
  participantMessage: "地域の方と交流したいです。",
  accessibilityNeeds: "",
  emergencyContact: "",
  consentAccepted: true,
  createdAt: timestamp,
});
batch.set(db.doc("chatRooms/app-e2e"), {
  id: "app-e2e",
  roomType: "application",
  applicationId: "app-e2e",
  eventId: "event-e2e-published",
  eventTitle: "E2E 地域交流会",
  studentId: "student-e2e",
  studentName: "E2E 学生",
  organizationName: "E2E主催団体",
  organizationId: "org-e2e",
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
  suppressNotification: true,
  createdAt: timestamp,
});
batch.set(db.doc("chatRooms/event_event-e2e-published"), {
  id: "event_event-e2e-published",
  roomType: "event",
  applicationId: "event_event-e2e-published",
  eventId: "event-e2e-published",
  eventTitle: "E2E 地域交流会",
  studentId: "",
  studentName: "",
  organizationName: "E2E主催団体",
  organizationId: "org-e2e",
  participantIds: ["org-e2e", "student-e2e"],
  status: "active",
  lastMessageText: "イベント全体チャットを作成しました。",
  pinnedMessage: "集合場所は大学正門前です。",
  organizerNotice: "当日は学生証を持参してください。",
  lastMessageAt: timestamp,
  createdAt: timestamp,
});
batch.set(db.doc("chatRooms/event_event-e2e-published/messages/welcome"), {
  roomId: "event_event-e2e-published",
  senderId: "system",
  senderName: "Aizu Connect",
  type: "system",
  text: "イベント全体チャットです。参加者は参加前のやり取りも確認できます。",
  createdAt: timestamp,
});
for (const [variant, displayVariant] of testVariants) {
  const eventId = `event-e2e-chat-history-${variant}`;
  const title = `E2E 全体チャットイベント ${displayVariant}`;
  const roomId = `event_${eventId}`;
  batch.set(db.doc(`chatRooms/${roomId}`), {
    id: roomId,
    roomType: "event",
    applicationId: roomId,
    eventId,
    eventTitle: title,
    studentId: "",
    studentName: "",
    organizationName: "E2E主催団体",
    organizationId: `org-e2e-${variant}`,
    participantIds: [`org-e2e-${variant}`, `student-late-${variant}`],
    status: "active",
    lastMessageText: "参加前からある全体チャットログ",
    lastMessageAt: timestamp,
    createdAt: timestamp,
  });
  batch.set(db.doc(`chatRooms/${roomId}/messages/history-message`), {
    roomId,
    senderId: `student-late-${variant}`,
    senderName: `E2E 後参加 ${variant}`,
    type: "text",
    text: "参加前からある全体チャットログ",
    suppressNotification: true,
    createdAt: timestamp,
  });
}
batch.set(db.doc("activities/app-e2e"), {
  id: "app-e2e",
  userId: "student-e2e",
  eventId: "event-e2e-published",
  title: "E2E 地域交流会",
  organizationId: "org-e2e",
  organizationName: "E2E主催団体",
  certificateId: "AC-app-e2e",
  participantRole: "参加者",
  takeaways: ["地域の人とつながる", "話すきっかけを作る", "活動実績として残す"],
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
batch.set(db.doc("eventCheckIns/event-e2e-published"), {
  eventId: "event-e2e-published",
  organizerId: "org-e2e",
  code: "123456",
  createdAt: timestamp,
  updatedAt: timestamp,
});

await batch.commit();
const surveyBatch = db.batch();
for (const [variant] of testVariants) {
  const eventId = `event-e2e-a11y-survey-${variant}`;
  for (let index = 0; index < 51; index += 1) {
    const userId = `survey-fixture-${variant}-${String(index).padStart(2, "0")}`;
    surveyBatch.set(db.doc(`eventSurveys/${eventId}/responses/${userId}`), {
      eventId, userId, rating: 3,
      comment: index === 50 ? "追加ページのアンケート回答" : `確認回答 ${index + 1}`,
      wouldRecommend: false,
      createdAt: Timestamp.fromMillis(now.getTime() - (index + 1) * 1000),
      updatedAt: timestamp,
    });
  }
}
await surveyBatch.commit();

const paginationBatch = db.batch();
for (let index = 0; index < 30; index += 1) {
  const paginationStartDate = new Date(now);
  paginationStartDate.setDate(paginationStartDate.getDate() + 1);
  paginationStartDate.setHours(9 + index, 0, 0, 0);
  const paginationEndDate = new Date(
    paginationStartDate.getTime() + 2 * 60 * 60 * 1000,
  );
  const eventId = `event-e2e-pagination-${String(index).padStart(2, "0")}`;
  paginationBatch.set(
    db.doc(`events/${eventId}`),
    eventDoc({
      title: `E2E ページングイベント ${String(index + 1).padStart(2, "0")}`,
      startAt: Timestamp.fromDate(paginationStartDate),
      endAt: Timestamp.fromDate(paginationEndDate),
      startAtLabel: new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(paginationStartDate),
      endAtLabel: new Intl.DateTimeFormat("ja-JP", {
        hour: "numeric",
        minute: "2-digit",
      }).format(paginationEndDate),
      applicantCount: 0,
    }),
  );
}
for (let index = 0; index < 55; index += 1) {
  const reportNumber = String(index + 1).padStart(2, "0");
  paginationBatch.set(db.doc(`reports/pagination-report-${reportNumber}`), {
    reporterId: "student-e2e",
    targetType: "message",
    targetId: `pagination-target-${reportNumber}`,
    targetTitle: `E2E ページング通報 ${reportNumber}`,
    reason: "ページング確認",
    description: `管理画面の${reportNumber}件目を確認します。`,
    status: "submitted",
    createdAt: Timestamp.fromMillis(now.getTime() - (index + 1) * 60_000),
  });
}
await paginationBatch.commit();

for (const variant of variantKeys) {
  const historyBatch = db.batch();
  const roomId = `event_event-e2e-chat-history-${variant}`;
  for (let index = 1; index <= 120; index += 1) {
    const messageNumber = String(index).padStart(3, "0");
    historyBatch.set(
      db.doc(`chatRooms/${roomId}/messages/history-${messageNumber}`),
      {
        roomId,
        senderId: `student-late-${variant}`,
        senderName: `E2E 後参加 ${variant}`,
        type: "text",
        text: `履歴メッセージ ${messageNumber}`,
        suppressNotification: true,
        createdAt: Timestamp.fromMillis(
          now.getTime() - (121 - index) * 60 * 1000,
        ),
      },
    );
  }
  await historyBatch.commit();
}

await Promise.all(
  variantKeys.flatMap((variant) => {
    const userId = `admin-delete-user-${variant}`;
    const eventId = `admin-delete-event-${variant}`;
    const reportedEventId = `admin-reported-event-${variant}`;
    return [
      bucket
        .file(`profile-images/${userId}/profile-seed.png`)
        .save(Buffer.from("profile-image")),
      bucket
        .file(`event-images/org-e2e/${reportedEventId}/cover-seed.png`)
        .save(Buffer.from("event-image")),
      bucket
        .file(
          `chat-attachments/${eventId}_${userId}/${userId}/attachment-seed.txt`,
        )
        .save(Buffer.from("chat-attachment")),
    ];
  }),
);

const eventRoomRefs = [
  ...variantKeys.flatMap((variant) => [
    db.doc(`chatRooms/event_event-e2e-open-${variant}`),
    db.doc(`chatRooms/event_event-e2e-published-${variant}`),
  ]),
  ...Array.from({ length: 30 }, (_, index) =>
    db.doc(
      `chatRooms/event_event-e2e-pagination-${String(index).padStart(2, "0")}`,
    ),
  ),
];
const eventRoomDeadline = Date.now() + 30_000;
while (true) {
  const roomSnapshots = await db.getAll(...eventRoomRefs);
  if (roomSnapshots.every((snapshot) => snapshot.exists)) break;
  if (Date.now() >= eventRoomDeadline) {
    throw new Error("Timed out waiting for event chat room triggers.");
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

await db.doc("seedStatus/e2e").set({
  seededAt: FieldValue.serverTimestamp(),
  projectId,
});

console.log("E2E emulator seed complete.");
