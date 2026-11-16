import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const projectId = "demo-aizu-connect-readme";
if (
  process.env.GCLOUD_PROJECT !== projectId ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:19099" ||
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:18082"
) {
  throw new Error(
    "README fixtures require the dedicated local demo emulators.",
  );
}

initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();
const at = (value) => Timestamp.fromDate(new Date(value));
const now = at("2026-11-13T12:00:00+09:00");
const organizationId = "readme-organization";
const organizationName = "会津まちのつながり";
const studentId = "readme-student";
const password = "readme-demo-password";
const people = [
  {
    uid: studentId,
    displayName: "会津 はる",
    email: "readme-student@u-aizu.ac.jp",
  },
  {
    uid: "readme-sato",
    displayName: "佐藤 はるか",
    email: "readme-sato@example.com",
  },
  {
    uid: "readme-takahashi",
    displayName: "高橋 りく",
    email: "readme-takahashi@example.com",
  },
  {
    uid: "readme-kobayashi",
    displayName: "小林 あおい",
    email: "readme-kobayashi@example.com",
  },
  {
    uid: organizationId,
    displayName: organizationName,
    email: "readme-org@example.com",
  },
];

const batch = db.batch();
for (const person of people) {
  try {
    await auth.createUser({ ...person, password, emailVerified: true });
  } catch (error) {
    if (error.code !== "auth/uid-already-exists") throw error;
  }
  const user = {
    ...person,
    role: person.uid === organizationId ? "organization" : "student",
    status: "active",
    university: "会津大学",
    department: "コンピュータ理工学部",
    grade: 2,
    interests: ["交流・コミュニティ", "地域活動", "学び・制作"],
    currentActivities:
      "大学でプログラミングを学びながら、地域の活動に参加しています。",
    wantToTry: "地域の人と一緒に、まちの魅力を伝えるものづくり。",
    termsVersion: "2026-10-23",
    privacyVersion: "2026-10-23",
    legalAcceptedAt: now,
    eligibilityConfirmedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  batch.set(db.doc(`users/${person.uid}`), user);
  if (user.role === "student") {
    batch.set(db.doc(`studentProfiles/${person.uid}`), {
      ...user,
      verificationMethod: "university_email",
      activityCount: 1,
    });
  }
  batch.set(db.doc(`notificationPreferences/${person.uid}`), {
    userId: person.uid,
    newEvents: false,
    applicationUpdates: false,
    chatMessages: false,
    eventReminders: false,
    updatedAt: now,
  });
}
batch.set(db.doc(`organizations/${organizationId}`), {
  id: organizationId,
  displayName: organizationName,
  status: "active",
  description: "学生と地域の人が、気軽につながるきっかけをつくっています。",
  contactEmail: "readme-org@example.com",
  createdBy: organizationId,
  createdAt: now,
  updatedAt: now,
});

const eventSeeds = [
  [
    "community",
    "はじめての地域交流カフェ",
    "交流・コミュニティ",
    "2026-11-21T14:00:00+09:00",
    "交流スペース・まちのリビング",
    "community",
    "お茶を飲みながら、学生と地域の人でゆっくり話す午後。ひとりでの参加も歓迎です。",
  ],
  [
    "river",
    "朝のまち歩きと清掃ボランティア",
    "ボランティア",
    "2026-11-22T09:00:00+09:00",
    "阿賀川・河川敷広場",
    "volunteer",
    "まちを歩いて、少しだけきれいにする朝の活動。会津の新しい景色を一緒に見つけましょう。",
  ],
  [
    "coding",
    "つくって学ぶ、Webサイト制作会",
    "学び・制作",
    "2026-11-23T13:00:00+09:00",
    "会津大学・学習スペース",
    "learning",
    "自分の好きなものを紹介するWebサイトを作ります。コードを書くのが初めてでも大丈夫。",
  ],
  [
    "ideas",
    "学生と地域で考える、まちのアイデア会議",
    "地域活動",
    "2026-11-28T14:00:00+09:00",
    "交流スペース・まちのリビング",
    "community",
    "こんな場所や活動があったらいいな。学生と地域の人で、まちの小さなアイデアを持ち寄ります。",
  ],
  [
    "garden",
    "花壇づくりの地域ボランティア",
    "ボランティア",
    "2026-11-29T10:00:00+09:00",
    "会津若松市・地域の花壇",
    "volunteer",
    "地域の皆さんと、季節の花を植える週末。道具は会場で用意しています。",
  ],
  [
    "study",
    "はじめてのプログラミング相談室",
    "学び・制作",
    "2026-12-05T13:00:00+09:00",
    "会津大学・学習スペース",
    "learning",
    "授業や個人制作で気になったことを、気軽に相談できる勉強会です。",
  ],
  [
    "past",
    "秋のまち歩き交流会",
    "交流・コミュニティ",
    "2026-10-24T10:00:00+09:00",
    "会津若松市・市街地",
    "community",
    "まちの風景を楽しみながら、地域の皆さんと交流しました。",
  ],
];
const events = new Map();
for (const [
  index,
  [key, title, category, date, location, image, summary],
] of eventSeeds.entries()) {
  const startAt = at(date);
  const event = {
    title,
    summary,
    category,
    location,
    startAt,
    endAt: Timestamp.fromMillis(startAt.toMillis() + 7_200_000),
    startAtLabel: new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(startAt.toDate()),
    endAtLabel: new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(startAt.toMillis() + 7_200_000)),
    feeType: "無料",
    feeAmount: 0,
    eventFormat: "現地",
    status: "published",
    capacity: 20,
    applicantCount: key === "community" ? 8 : 4,
    imageUrl: `/src/assets/event-${image}.jpg`,
    tags: ["学生歓迎", "地域とつながる"],
    beginnerLevel: "初参加歓迎",
    organizationId,
    organizationName,
    createdBy: organizationId,
    meetingPoint: `${location}の入口`,
    bringItems: "飲み物、筆記用具",
    accessInfo:
      "詳しい集合場所は、参加確定後に全体チャットでもお知らせします。",
    cancellationPolicy:
      "参加できなくなった場合は、前日までに活動ページからキャンセルしてください。",
    weatherPolicy: "変更がある場合は全体チャットでお知らせします。",
    accessibility: "必要な配慮がある方は、申請時にお知らせください。",
    takeaways: ["地域の人とつながる", "新しい活動のきっかけを見つける"],
    atmosphere:
      "少人数でゆっくり話せる雰囲気です。初めての方にはスタッフが声をかけます。",
    organizerDescription:
      "学生と地域の人が、気軽につながるきっかけをつくっています。",
    createdAt: Timestamp.fromMillis(now.toMillis() - index * 60_000),
    updatedAt: now,
  };
  const eventId = `readme-${key}`;
  events.set(key, { id: eventId, ...event });
  batch.set(db.doc(`events/${eventId}`), event);
  batch.set(db.doc(`eventCheckIns/${eventId}`), {
    eventId,
    organizerId: organizationId,
    code: "482615",
    createdAt: now,
    updatedAt: now,
  });
  const roomId = `event_${eventId}`;
  const members =
    key === "community" || key === "coding" ? people : [people.at(-1)];
  batch.set(db.doc(`chatRooms/${roomId}`), {
    id: roomId,
    roomType: "event",
    applicationId: roomId,
    eventId,
    eventTitle: title,
    studentId: "",
    organizationId,
    organizationName,
    status: "active",
    participantIds: members.map(({ uid }) => uid),
    memberCount: members.length,
    lastMessageText: "当日はよろしくお願いします！",
    lastMessageAt: Timestamp.fromMillis(now.toMillis() - index * 60_000),
    createdAt: now,
  });
  for (const person of members) {
    batch.set(db.doc(`chatRooms/${roomId}/members/${person.uid}`), {
      userId: person.uid,
      displayName: person.displayName,
      role: person.uid === organizationId ? "organization" : "student",
      joinedAt: now,
    });
  }
  batch.set(db.doc(`chatRooms/${roomId}/messages/welcome`), {
    roomId,
    senderId: key === "community" ? organizationId : "system",
    senderName: key === "community" ? organizationName : "Aizu Connect",
    type: key === "community" ? "text" : "system",
    text:
      key === "community"
        ? "もちろんです。初参加の方も歓迎です！"
        : "イベント全体チャットを作成しました。",
    suppressNotification: true,
    createdAt: Timestamp.fromMillis(
      now.toMillis() - (key === "community" ? 60_000 : 3_600_000),
    ),
  });
}

for (const [key, person, status] of [
  ["community", people[0], "confirmed"],
  ["community", people[1], "pending"],
  ["community", people[2], "confirmed"],
  ["community", people[3], "pending"],
  ["river", people[0], "pending"],
  ["coding", people[0], "waitlisted"],
  ["past", people[0], "attended"],
]) {
  const event = events.get(key);
  const id = `${event.id}_${person.uid}`;
  batch.set(db.doc(`eventApplications/${id}`), {
    id,
    eventId: event.id,
    eventTitle: event.title,
    studentId: person.uid,
    studentName: person.displayName,
    studentNameLower: person.displayName.toLocaleLowerCase("ja-JP"),
    organizationId,
    organizationName,
    status,
    consentAccepted: true,
    eventStartAt: event.startAt,
    eventEndAt: event.endAt,
    participantMessage: "地域の皆さんと交流してみたいと思い、申し込みました。",
    accessibilityNeeds: "",
    emergencyContact: "",
    createdAt: now,
    ...(status === "waitlisted" ? { waitlistPosition: 2 } : {}),
  });
}

const roomId = "event_readme-community";
for (const [index, [sender, text]] of [
  [people[0], "ひとりでも参加できますか？"],
].entries()) {
  batch.set(db.doc(`chatRooms/${roomId}/messages/demo-${index}`), {
    roomId,
    senderId: sender.uid,
    senderName: sender.displayName,
    type: "text",
    text,
    suppressNotification: true,
    createdAt: Timestamp.fromMillis(now.toMillis() - (4 - index) * 60_000),
  });
}
for (const key of ["community", "coding"]) {
  batch.set(db.doc(`savedEvents/${studentId}_readme-${key}`), {
    userId: studentId,
    eventId: `readme-${key}`,
    createdAt: now,
  });
}
batch.set(db.doc("activities/readme-activity"), {
  id: "readme-activity",
  userId: studentId,
  eventId: "readme-past",
  title: "秋のまち歩き交流会",
  organizationId,
  organizationName,
  certificateId: "AC-DEMO-2026-001",
  participantRole: "参加者",
  takeaways: ["地域の人とつながる", "会津の魅力を知る"],
  verificationStatus: "verified",
  verifiedBy: organizationId,
  occurredAt: events.get("past").startAt,
  activityMonth: 10,
  activityYear: 2026,
  createdAt: now,
});
await batch.commit();
console.log("README demo data ready (local emulators only).");
