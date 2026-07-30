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
  ensureUser({
    uid: "student-late-desktop",
    email: "student-late-desktop@u-aizu.ac.jp",
    displayName: "E2E 後参加 Desktop",
  }),
  ensureUser({
    uid: "student-late-mobile",
    email: "student-late-mobile@u-aizu.ac.jp",
    displayName: "E2E 後参加 Mobile",
  }),
  ensureUser({
    uid: "student-late-tablet",
    email: "student-late-tablet@u-aizu.ac.jp",
    displayName: "E2E 後参加 Tablet",
  }),
]);

await Promise.all(
  ["desktop", "mobile", "tablet"].flatMap((variant) => [
    ensureUser({
      uid: `student-profile-${variant}`,
      email: `student-profile-${variant}@u-aizu.ac.jp`,
      displayName: `E2E プロフィール ${variant}`,
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
    ensureUser({
      uid: `student-auto-approve-${variant}`,
      email: `student-auto-approve-${variant}@u-aizu.ac.jp`,
      displayName: `E2E 自動承認 ${variant}`,
    }),
  ]),
);

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
batch.set(
  db.doc("users/student-late-desktop"),
  userDoc({
    uid: "student-late-desktop",
    email: "student-late-desktop@u-aizu.ac.jp",
    displayName: "E2E 後参加 Desktop",
  }),
);
batch.set(db.doc("studentProfiles/student-late-desktop"), {
  ...userDoc({
    uid: "student-late-desktop",
    email: "student-late-desktop@u-aizu.ac.jp",
    displayName: "E2E 後参加 Desktop",
  }),
  verificationMethod: "university_email",
  profileCompletionRate: 80,
  activityCount: 0,
});
batch.set(
  db.doc("users/student-late-mobile"),
  userDoc({
    uid: "student-late-mobile",
    email: "student-late-mobile@u-aizu.ac.jp",
    displayName: "E2E 後参加 Mobile",
  }),
);
batch.set(db.doc("studentProfiles/student-late-mobile"), {
  ...userDoc({
    uid: "student-late-mobile",
    email: "student-late-mobile@u-aizu.ac.jp",
    displayName: "E2E 後参加 Mobile",
  }),
  verificationMethod: "university_email",
  profileCompletionRate: 80,
  activityCount: 0,
});
batch.set(
  db.doc("users/student-late-tablet"),
  userDoc({
    uid: "student-late-tablet",
    email: "student-late-tablet@u-aizu.ac.jp",
    displayName: "E2E 後参加 Tablet",
  }),
);
batch.set(db.doc("studentProfiles/student-late-tablet"), {
  ...userDoc({
    uid: "student-late-tablet",
    email: "student-late-tablet@u-aizu.ac.jp",
    displayName: "E2E 後参加 Tablet",
  }),
  verificationMethod: "university_email",
  profileCompletionRate: 80,
  activityCount: 0,
});

batch.set(db.doc("events/event-e2e-published"), eventDoc());
batch.set(
  db.doc("events/event-e2e-open-chromium"),
  eventDoc({
    title: "E2E 追加募集イベント Desktop",
    applicantCount: 0,
  }),
);
batch.set(
  db.doc("events/event-e2e-open-mobile"),
  eventDoc({
    title: "E2E 追加募集イベント Mobile",
    applicantCount: 0,
  }),
);
batch.set(
  db.doc("events/event-e2e-open-tablet"),
  eventDoc({
    title: "E2E 追加募集イベント Tablet",
    applicantCount: 0,
  }),
);
batch.set(
  db.doc("events/event-e2e-pending"),
  eventDoc({
    title: "E2E 審査待ちイベント",
    status: "pending_review",
    applicantCount: 0,
  }),
);
for (const variant of ["desktop", "mobile", "tablet"]) {
  const displayVariant =
    variant === "desktop"
      ? "Desktop"
      : variant === "mobile"
        ? "Mobile"
        : "Tablet";
  const profileUserId = `student-profile-${variant}`;
  const autoApproveUserId = `student-auto-approve-${variant}`;
  const profileEventId = `event-e2e-open-${variant === "desktop" ? "chromium" : variant}`;
  batch.set(
    db.doc(`users/${autoApproveUserId}`),
    userDoc({
      uid: autoApproveUserId,
      email: `${autoApproveUserId}@u-aizu.ac.jp`,
      displayName: `E2E 自動承認 ${displayVariant}`,
      status: "pending_approval",
    }),
  );
  batch.set(db.doc(`studentProfiles/${autoApproveUserId}`), {
    ...userDoc({
      uid: autoApproveUserId,
      email: `${autoApproveUserId}@u-aizu.ac.jp`,
      displayName: `E2E 自動承認 ${displayVariant}`,
      status: "pending_approval",
    }),
    verificationMethod: "university_email",
    profileCompletionRate: 80,
    activityCount: 0,
  });
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
    organizationName: "E2E主催団体",
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
    targetId: eventId,
    targetTitle: `E2E 管理削除イベント ${displayVariant}`,
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
batch.set(
  db.doc("events/event-e2e-chat-history-desktop"),
  eventDoc({
    title: "E2E 全体チャットイベント Desktop",
    applicantCount: 0,
  }),
);
batch.set(
  db.doc("events/event-e2e-chat-history-mobile"),
  eventDoc({
    title: "E2E 全体チャットイベント Mobile",
    applicantCount: 0,
  }),
);
batch.set(
  db.doc("events/event-e2e-chat-history-tablet"),
  eventDoc({
    title: "E2E 全体チャットイベント Tablet",
    applicantCount: 0,
  }),
);
for (const variant of ["desktop", "mobile", "tablet"]) {
  const displayVariant =
    variant === "desktop"
      ? "Desktop"
      : variant === "mobile"
        ? "Mobile"
        : "Tablet";
  batch.set(
    db.doc(`events/event-e2e-waitlist-${variant}`),
    eventDoc({
      title: `E2E 満員イベント ${displayVariant}`,
      capacity: 1,
      applicantCount: 1,
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
    organizationId: "org-e2e",
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
    organizationId: "org-e2e",
    status: "confirmed",
    participantMessage: "当日の受付動線を確認します。",
    accessibilityNeeds: "",
    emergencyContact: "",
    consentAccepted: true,
    createdAt: timestamp,
  });
  batch.set(db.doc(`eventCheckIns/event-e2e-checkin-${variant}`), {
    eventId: `event-e2e-checkin-${variant}`,
    organizerId: "org-e2e",
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
      applicantCount: 1,
    }),
  );
  batch.set(db.doc(`eventApplications/${participantApplicationId}`), {
    id: participantApplicationId,
    eventId: participantEventId,
    eventTitle: `E2E 参加者管理 ${displayVariant}`,
    studentId: `student-late-${variant}`,
    studentName: `E2E 後参加 ${displayVariant}`,
    organizationName: "E2E主催団体",
    organizationId: "org-e2e",
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
    organizationId: "org-e2e",
    participantIds: [`student-late-${variant}`, "org-e2e"],
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
      createdAt: timestamp,
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
for (const [eventId, title] of [
  ["event-e2e-chat-history-desktop", "E2E 全体チャットイベント Desktop"],
  ["event-e2e-chat-history-mobile", "E2E 全体チャットイベント Mobile"],
  ["event-e2e-chat-history-tablet", "E2E 全体チャットイベント Tablet"],
]) {
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
    organizationId: "org-e2e",
    participantIds: ["org-e2e", "student-e2e"],
    status: "active",
    lastMessageText: "参加前からある全体チャットログ",
    lastMessageAt: timestamp,
    createdAt: timestamp,
  });
  batch.set(db.doc(`chatRooms/${roomId}/messages/history-message`), {
    roomId,
    senderId: "student-e2e",
    senderName: "E2E 学生",
    type: "text",
    text: "参加前からある全体チャットログ",
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

for (const variant of ["desktop", "mobile", "tablet"]) {
  const historyBatch = db.batch();
  const roomId = `event_event-e2e-chat-history-${variant}`;
  for (let index = 1; index <= 120; index += 1) {
    const messageNumber = String(index).padStart(3, "0");
    historyBatch.set(
      db.doc(`chatRooms/${roomId}/messages/history-${messageNumber}`),
      {
        roomId,
        senderId: "student-e2e",
        senderName: "E2E 学生",
        type: "text",
        text: `履歴メッセージ ${messageNumber}`,
        createdAt: Timestamp.fromMillis(
          now.getTime() - (121 - index) * 60 * 1000,
        ),
      },
    );
  }
  await historyBatch.commit();
}

await Promise.all(
  ["desktop", "mobile", "tablet"].flatMap((variant) => {
    const userId = `admin-delete-user-${variant}`;
    const eventId = `admin-delete-event-${variant}`;
    return [
      bucket
        .file(`profile-images/${userId}/profile-seed.png`)
        .save(Buffer.from("profile-image")),
      bucket
        .file(`event-images/org-e2e/${eventId}/cover-seed.png`)
        .save(Buffer.from("event-image")),
      bucket
        .file(
          `chat-attachments/${eventId}_${userId}/${userId}/attachment-seed.txt`,
        )
        .save(Buffer.from("chat-attachment")),
    ];
  }),
);

await db.doc("seedStatus/e2e").set({
  seededAt: FieldValue.serverTimestamp(),
  projectId,
});

console.log("E2E emulator seed complete.");
