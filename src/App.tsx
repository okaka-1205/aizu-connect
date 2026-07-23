import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  Bell,
  CalendarDays,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Compass,
  Eye,
  EyeOff,
  Flag,
  Heart,
  Home,
  Loader2,
  LogOut,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { auth, db, functions } from "./lib/firebase";

type AccountStatus =
  | "active"
  | "pending_approval"
  | "pending"
  | "email_unverified"
  | "profile_incomplete"
  | "rejected"
  | "suspended";
type Tab = "home" | "search" | "activity" | "messages" | "profile";
type UserRole = "student" | "organization" | "admin";
type Filter =
  | "すべて"
  | "交流・コミュニティ"
  | "地域活動"
  | "ボランティア"
  | "学び・制作"
  | "趣味・スポーツ";
type SearchDateFilter = "すべて" | "今週" | "今月";

type AppUser = {
  uid: string;
  role: UserRole;
  status: AccountStatus;
  email: string | null;
  displayName: string;
  university: string;
  department: string;
  grade: number;
  interests: string[];
  currentActivities?: string;
  wantToTry?: string;
  organizationId?: string;
  organizationName?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type AizuEvent = {
  id: string;
  title: string;
  summary: string;
  category: string;
  location: string;
  startAtLabel: string;
  startAt?: Timestamp;
  organizationName: string;
  status: "published" | "pending_review" | "revision_required";
  capacity: number;
  applicantCount: number;
  imageUrl: string;
  tags: string[];
  organizationId?: string;
  organizationVerified?: boolean;
  createdBy?: string;
  createdAt?: Timestamp;
};

type EventApplication = {
  id: string;
  eventId: string;
  eventTitle: string;
  studentId: string;
  studentName: string;
  organizationName: string;
  organizationId?: string;
  status:
    "pending" | "confirmed" | "rejected" | "attended" | "absent" | "cancelled";
  createdAt?: Timestamp;
};

type ChatRoom = {
  id: string;
  applicationId: string;
  eventId: string;
  eventTitle: string;
  studentId: string;
  studentName?: string;
  organizationName: string;
  participantIds: string[];
  status: "active" | "read_only" | "closed";
  lastMessageText: string;
  lastMessageAt?: Timestamp;
};

type ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  type: "text" | "system";
  text: string;
  createdAt?: Timestamp;
};

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  targetType?: string;
  targetId?: string;
  createdAt?: Timestamp;
};

type ReportTarget = {
  targetType: "event" | "message";
  targetId: string;
  title: string;
};

type ReportRecord = {
  id: string;
  targetType: "event" | "message" | "organization" | "user";
  targetId: string;
  targetTitle?: string;
  reason: string;
  description?: string;
  status: "submitted" | "reviewing" | "resolved" | "dismissed";
  createdAt?: Timestamp;
};

type ActivityRecord = {
  id: string;
  userId: string;
  eventId: string;
  title: string;
  organizationName: string;
  activityYear: number;
  activityMonth: number;
  verificationStatus: "verified" | "revoked";
  createdAt?: Timestamp;
};

type NotificationPreferences = {
  userId: string;
  newEvents: boolean;
  applicationUpdates: boolean;
  chatMessages: boolean;
  eventReminders: boolean;
};

const defaultNotificationPreferences = (
  userId: string,
): NotificationPreferences => ({
  userId,
  newEvents: true,
  applicationUpdates: true,
  chatMessages: true,
  eventReminders: true,
});

type LegalDocument = "terms" | "privacy";

const legalDocuments: Record<
  LegalDocument,
  {
    eyebrow: string;
    title: string;
    sections: { heading: string; body: string }[];
  }
> = {
  terms: {
    eyebrow: "TERMS OF USE",
    title: "利用規約",
    sections: [
      {
        heading: "1. サービスの目的",
        body: "Aizu Connectは、学生が会津地域のイベントや活動を探し、人と出会い、新しい経験を得るためのサービスです。参加条件や開催内容は、申請前に必ず確認してください。",
      },
      {
        heading: "2. 禁止事項",
        body: "虚偽の登録、他人へのなりすまし、迷惑行為、無断での個人情報収集、危険または違法な活動の掲載、サービス運営を妨げる行為を禁止します。",
      },
      {
        heading: "3. 参加と連絡",
        body: "イベントへの参加申請後、主催者とのチャットで集合場所や注意事項を確認できます。開催内容の変更や中止が発生した場合は、主催者または運営からの案内を確認してください。",
      },
      {
        heading: "4. 活動実績",
        body: "Activity Portfolioには、主催者が出席を確認した活動のみ反映されます。虚偽の実績登録や不正利用が確認された場合、実績を取り消すことがあります。",
      },
      {
        heading: "5. 運営対応",
        body: "安全上または運営上必要な場合、掲載停止、申請の制限、アカウントの一時停止を行うことがあります。正式公開前に、運営者情報と問い合わせ窓口を追加します。",
      },
    ],
  },
  privacy: {
    eyebrow: "PRIVACY POLICY",
    title: "プライバシーポリシー",
    sections: [
      {
        heading: "1. 取得する情報",
        body: "メールアドレス、表示名、大学・学科・学年、興味分野、今やっていること、やってみたいこと、イベント申請、チャット、活動実績など、サービス提供に必要な情報を取得します。",
      },
      {
        heading: "2. 利用目的",
        body: "ログイン認証、イベント申請、主催者との連絡、参加状況の管理、活動実績の表示、不正利用防止、問い合わせ対応のために利用します。",
      },
      {
        heading: "3. 共有範囲",
        body: "イベント申請を行った場合、主催者に表示名、大学、学科、学年、申請内容など必要な情報を共有します。メールアドレスやチャット内容は、原則として一般公開しません。",
      },
      {
        heading: "4. 保存と削除",
        body: "アカウントの利用に必要な期間、情報を保存します。退会、情報開示、訂正、削除の手続きは、正式公開時に運営窓口を明記します。",
      },
      {
        heading: "5. 重要事項",
        body: "この画面は公開前のドラフトです。正式リリース前に、運営者情報、保存期間、第三者提供、未成年者の利用、問い合わせ窓口を確定し、必要に応じて専門家の確認を受けます。",
      },
    ],
  },
};

const categories: Filter[] = [
  "すべて",
  "交流・コミュニティ",
  "地域活動",
  "ボランティア",
  "学び・制作",
  "趣味・スポーツ",
];

const categoryAliases: Record<Exclude<Filter, "すべて">, string[]> = {
  "交流・コミュニティ": ["交流・コミュニティ", "地域イベント", "企業交流"],
  地域活動: ["地域活動", "地域イベント"],
  ボランティア: ["ボランティア"],
  "学び・制作": ["学び・制作", "キャリア"],
  "趣味・スポーツ": ["趣味・スポーツ"],
};

const matchesCategoryFilter = (category: string, filter: Filter) =>
  filter === "すべて" || categoryAliases[filter].includes(category);

const sampleEvents: Omit<AizuEvent, "id">[] = [
  {
    title: "会津若松まちなか交流ミートアップ",
    summary: "地域の社会人や学生とふらっと話せる、初参加歓迎の交流イベント。",
    category: "交流・コミュニティ",
    location: "會津稽古堂",
    startAtLabel: "8月10日 18:30",
    organizationName: "Aizu Connect 運営",
    status: "published",
    capacity: 40,
    applicantCount: 0,
    imageUrl:
      "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80",
    tags: ["交流", "初心者歓迎", "放課後"],
    startAt: Timestamp.fromDate(new Date("2026-08-10T18:30:00+09:00")),
    organizationVerified: true,
  },
  {
    title: "只見町 夏祭り運営ボランティア",
    summary: "地域イベントの受付・案内を手伝いながら、会津の人とつながる。",
    category: "地域活動",
    location: "只見町 駅前広場",
    startAtLabel: "8月24日 9:00",
    organizationName: "只見町地域プロジェクト",
    status: "published",
    capacity: 20,
    applicantCount: 0,
    imageUrl:
      "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1200&q=80",
    tags: ["ボランティア", "地域", "交通相談可"],
    startAt: Timestamp.fromDate(new Date("2026-08-24T09:00:00+09:00")),
    organizationVerified: true,
  },
  {
    title: "会津でつくる人と話すナイト",
    summary:
      "会津でサービスや活動をつくる人と話しながら、次にやってみたいことを見つける交流会。",
    category: "学び・制作",
    location: "会津大学 UBIC",
    startAtLabel: "9月3日 17:00",
    organizationName: "会津IT企業コミュニティ",
    status: "published",
    capacity: 30,
    applicantCount: 0,
    imageUrl:
      "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80",
    tags: ["学び", "IT", "初参加歓迎"],
    startAt: Timestamp.fromDate(new Date("2026-09-03T17:00:00+09:00")),
    organizationVerified: true,
  },
];

const isAizuUniversityEmail = (email: string) =>
  email.trim().toLowerCase().endsWith("@u-aizu.ac.jp");

const DEV_ADMIN_EMAIL = "admin@aizu-connect.local";
const DEV_ADMIN_PASSWORD = "admin123";

const normalizeLoginEmail = (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  return import.meta.env.DEV && normalizedEmail === "admin"
    ? DEV_ADMIN_EMAIL
    : normalizedEmail;
};

const formatEventStart = (value: string) => {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const toDateTimeInput = (timestamp?: Timestamp) => {
  if (!timestamp) return "";
  const date = timestamp.toDate();
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const getFirebaseErrorMessage = (error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  if (error instanceof Error) {
    if (code === "functions/already-exists")
      return "このイベントにはすでに参加申請済みです。";
    if (code === "functions/resource-exhausted")
      return "このイベントは定員に達しています。";
    if (code === "functions/failed-precondition")
      return "このイベントは現在申し込めません。公開状態と受付期間を確認してください。";
    if (code === "functions/permission-denied")
      return "この操作には承認済みの学生アカウントが必要です。";
    if (
      code === "auth/network-request-failed" ||
      error.message.includes("auth/network-request-failed")
    )
      return import.meta.env.DEV
        ? "Firebase Authenticationに接続できません。開発中は別ターミナルで `firebase emulators:start` を実行し、Auth Emulator（9099）が起動しているか確認してください。"
        : "Firebase Authenticationに接続できません。ネットワーク接続とFirebase設定を確認してください。";
    if (
      code === "auth/operation-not-allowed" ||
      error.message.includes("auth/operation-not-allowed")
    )
      return "このログイン方法はFirebase側で有効になっていません。Authenticationの設定を確認してください。";
    if (
      code === "auth/invalid-email" ||
      error.message.includes("auth/invalid-email")
    )
      return "メールアドレスの形式を確認してください。";
    if (
      code === "permission-denied" ||
      error.message.includes("permission-denied")
    )
      return "この操作を行う権限がありません。アカウントの承認状態を確認してください。";
    if (
      code === "failed-precondition" ||
      error.message.includes("failed-precondition")
    )
      return "Firebaseの設定が未完了です。FirestoreやAuthenticationを有効化してください。";
    if (
      code === "auth/invalid-credential" ||
      error.message.includes("auth/invalid-credential")
    )
      return "メールアドレスまたはパスワードが違います。";
    if (
      code === "auth/user-not-found" ||
      error.message.includes("auth/user-not-found") ||
      code === "auth/wrong-password" ||
      error.message.includes("auth/wrong-password")
    )
      return "メールアドレスまたはパスワードが違います。";
    if (
      code === "auth/email-already-in-use" ||
      error.message.includes("auth/email-already-in-use")
    )
      return "このメールアドレスはすでに登録されています。";
    if (
      code === "auth/weak-password" ||
      error.message.includes("auth/weak-password")
    )
      return "パスワードは6文字以上にしてください。";
    if (
      code === "auth/too-many-requests" ||
      error.message.includes("auth/too-many-requests")
    )
      return "試行回数が多すぎます。少し時間を空けてから再試行してください。";
    if (
      code === "auth/user-disabled" ||
      error.message.includes("auth/user-disabled")
    )
      return "このアカウントは停止されています。運営へお問い合わせください。";
    return error.message;
  }
  return "問題が発生しました。もう一度試してください。";
};

function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [accountType, setAccountType] = useState<"student" | "organization">(
    "student",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [department, setDepartment] = useState("");
  const [grade, setGrade] = useState(1);
  const [interestText, setInterestText] = useState("");
  const [currentActivities, setCurrentActivities] = useState("");
  const [wantToTry, setWantToTry] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [events, setEvents] = useState<AizuEvent[]>([]);
  const [applications, setApplications] = useState<EventApplication[]>([]);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [filter, setFilter] = useState<Filter>("すべて");
  const [searchText, setSearchText] = useState("");
  const [searchDateFilter, setSearchDateFilter] =
    useState<SearchDateFilter>("すべて");
  const [onlyAvailableEvents, setOnlyAvailableEvents] = useState(false);
  const [onlyBeginnerEvents, setOnlyBeginnerEvents] = useState(false);
  const [savedEventIds, setSavedEventIds] = useState<string[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(() => defaultNotificationPreferences(""));

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId),
    [events, selectedEventId],
  );

  const filteredEvents = useMemo(() => {
    const normalized = searchText.trim().toLowerCase();
    const now = new Date();
    const weekLimit = new Date(now);
    weekLimit.setDate(now.getDate() + 7);
    return events.filter((event) => {
      const matchesFilter = matchesCategoryFilter(event.category, filter);
      const matchesSearch =
        !normalized ||
        [
          event.title,
          event.summary,
          event.location,
          event.organizationName,
          ...event.tags,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const eventDate = event.startAt?.toDate();
      const matchesDate =
        searchDateFilter === "すべて" ||
        !eventDate ||
        (searchDateFilter === "今週" &&
          eventDate >= now &&
          eventDate <= weekLimit) ||
        (searchDateFilter === "今月" &&
          eventDate >= now &&
          eventDate.getMonth() === now.getMonth() &&
          eventDate.getFullYear() === now.getFullYear());
      const matchesCapacity =
        !onlyAvailableEvents ||
        Number(event.applicantCount ?? 0) < Number(event.capacity ?? 0);
      const matchesBeginner =
        !onlyBeginnerEvents || event.tags.some((tag) => tag.includes("初心者"));
      return (
        matchesFilter &&
        matchesSearch &&
        matchesDate &&
        matchesCapacity &&
        matchesBeginner
      );
    });
  }, [
    events,
    filter,
    onlyAvailableEvents,
    onlyBeginnerEvents,
    searchDateFilter,
    searchText,
  ]);

  const activityByMonth = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      count: 0,
    }));
    activities.forEach((activity) => {
      if (activity.verificationStatus !== "verified") return;
      const month = Math.max(1, Math.min(12, activity.activityMonth));
      months[month - 1].count += 1;
    });
    return months;
  }, [activities]);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;
      setFirebaseUser(user);
      setAppUser(null);
      if (!user) {
        setIsAuthLoading(false);
        return;
      }
      unsubscribeProfile = onSnapshot(
        doc(db, "users", user.uid),
        (snapshot) => {
          if (snapshot.exists()) {
            setAppUser(snapshot.data() as AppUser);
          } else {
            setMessage(
              "認証は完了しましたが、プロフィール情報が見つかりません。もう一度登録してください。",
            );
            void signOut(auth);
          }
          setIsAuthLoading(false);
        },
        (error) => {
          setMessage(getFirebaseErrorMessage(error));
          setIsAuthLoading(false);
        },
      );
    });
    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (!appUser || appUser.status !== "active" || appUser.role !== "student") {
      setEvents([]);
      setApplications([]);
      setChatRooms([]);
      setActiveRoomId(null);
      return;
    }
    void loadProductData(appUser.uid).catch((error) => {
      setMessage(getFirebaseErrorMessage(error));
    });
  }, [appUser]);

  const loadProductData = async (uid: string) => {
    const eventSnapshot = await getDocs(
      query(
        collection(db, "events"),
        where("status", "==", "published"),
        limit(20),
      ),
    );
    const loadedEvents = eventSnapshot.docs.map((eventDoc) => ({
      id: eventDoc.id,
      ...eventDoc.data(),
    })) as AizuEvent[];
    const visibleEvents =
      loadedEvents.length > 0
        ? loadedEvents
        : import.meta.env.DEV
          ? sampleEvents.map((event, index) => ({
              ...event,
              id: `demo-${index + 1}`,
            }))
          : [];
    setEvents(visibleEvents);
    setSelectedEventId((current) =>
      current && visibleEvents.some((event) => event.id === current)
        ? current
        : null,
    );

    const applicationSnapshot = await getDocs(
      query(
        collection(db, "eventApplications"),
        where("studentId", "==", uid),
        limit(20),
      ),
    );
    setApplications(
      applicationSnapshot.docs.map((applicationDoc) => ({
        id: applicationDoc.id,
        ...applicationDoc.data(),
      })) as EventApplication[],
    );

    const roomSnapshot = await getDocs(
      query(
        collection(db, "chatRooms"),
        where("participantIds", "array-contains", uid),
        limit(20),
      ),
    );
    const rooms = roomSnapshot.docs.map((roomDoc) => ({
      id: roomDoc.id,
      ...roomDoc.data(),
    })) as ChatRoom[];
    setChatRooms(rooms);
    setActiveRoomId((current) => current ?? rooms[0]?.id ?? null);

    const savedSnapshot = await getDocs(
      query(
        collection(db, "savedEvents"),
        where("userId", "==", uid),
        limit(100),
      ),
    );
    setSavedEventIds(
      savedSnapshot.docs.map((savedDoc) => savedDoc.data().eventId as string),
    );

    const notificationSnapshot = await getDocs(
      query(
        collection(db, "notifications"),
        where("recipientId", "==", uid),
        limit(30),
      ),
    );
    const notificationItems = notificationSnapshot.docs.map(
      (notificationDoc) => ({
        id: notificationDoc.id,
        ...notificationDoc.data(),
      }),
    ) as NotificationItem[];
    notificationItems.sort(
      (left, right) =>
        (right.createdAt?.toMillis?.() ?? 0) -
        (left.createdAt?.toMillis?.() ?? 0),
    );
    setNotifications(notificationItems);

    const activitySnapshot = await getDocs(
      query(
        collection(db, "activities"),
        where("userId", "==", uid),
        limit(100),
      ),
    );
    setActivities(
      activitySnapshot.docs.map((activityDoc) => ({
        id: activityDoc.id,
        ...activityDoc.data(),
      })) as ActivityRecord[],
    );

    const preferenceSnapshot = await getDoc(
      doc(db, "notificationPreferences", uid),
    );
    setNotificationPreferences({
      ...defaultNotificationPreferences(uid),
      ...(preferenceSnapshot.exists() ? preferenceSnapshot.data() : {}),
      userId: uid,
    } as NotificationPreferences);
  };

  useEffect(() => {
    if (!activeRoomId) {
      setChatMessages([]);
      return;
    }
    const messagesQuery = query(
      collection(db, "chatRooms", activeRoomId, "messages"),
      orderBy("createdAt", "asc"),
      limit(100),
    );
    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        setChatMessages(
          snapshot.docs.map((messageDoc) => ({
            id: messageDoc.id,
            ...messageDoc.data(),
          })) as ChatMessage[],
        );
      },
      (error) => {
        setMessage(getFirebaseErrorMessage(error));
      },
    );
  }, [activeRoomId]);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const normalizedEmail =
      authMode === "login"
        ? normalizeLoginEmail(email)
        : email.trim().toLowerCase();
    const normalizedPassword =
      import.meta.env.DEV &&
      normalizedEmail === DEV_ADMIN_EMAIL &&
      password === "admin"
        ? DEV_ADMIN_PASSWORD
        : password;
    if (!normalizedEmail || !password) {
      setMessage("メールアドレスとパスワードを入力してください。");
      return;
    }
    if (authMode === "register") {
      if (password.length < 6) {
        setMessage("パスワードは6文字以上にしてください。");
        return;
      }
      if (accountType === "organization" && !organizationName.trim()) {
        setMessage("団体名を入力してください。");
        return;
      }
      if (accountType === "student" && !displayName.trim()) {
        setMessage("表示名を入力してください。");
        return;
      }
    }
    setIsActionLoading(true);
    try {
      if (authMode === "login") {
        await signInWithEmailAndPassword(
          auth,
          normalizedEmail,
          normalizedPassword,
        );
        setMessage("ログインしました。活動を探しにいきましょう。");
        return;
      }
      const credential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password,
      );
      const interests = interestText
        .split(",")
        .map((interest) => interest.trim())
        .filter(Boolean)
        .slice(0, 5);
      const normalizedCurrentActivities = currentActivities
        .trim()
        .slice(0, 240);
      const normalizedWantToTry = wantToTry.trim().slice(0, 240);
      const status: AccountStatus = isAizuUniversityEmail(normalizedEmail)
        ? "active"
        : "pending_approval";
      const isOrganization = accountType === "organization";
      const userData: AppUser = {
        uid: credential.user.uid,
        role: isOrganization ? "organization" : "student",
        status: isOrganization ? "pending_approval" : status,
        email: credential.user.email,
        displayName: isOrganization
          ? organizationName || displayName
          : displayName,
        university: isOrganization
          ? "主催者・団体"
          : isAizuUniversityEmail(normalizedEmail)
            ? "会津大学"
            : "承認待ち大学",
        department,
        grade,
        interests,
        currentActivities: normalizedCurrentActivities,
        wantToTry: normalizedWantToTry,
        ...(isOrganization
          ? {
              organizationId: credential.user.uid,
              organizationName: organizationName || displayName,
            }
          : {}),
      };
      await setDoc(doc(db, "users", credential.user.uid), {
        ...userData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (isOrganization) {
        await setDoc(doc(db, "organizations", credential.user.uid), {
          id: credential.user.uid,
          displayName: organizationName || displayName,
          description: "",
          contactEmail: credential.user.email,
          status: "pending_approval",
          createdBy: credential.user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, "studentProfiles", credential.user.uid), {
          ...userData,
          verificationMethod: isAizuUniversityEmail(email)
            ? "university_email"
            : "manual_review",
          profileCompletionRate: 80,
          activityCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      let registrationMessage = isOrganization
        ? "登録しました。管理者の承認後に活動を掲載できます。"
        : status === "active"
          ? "登録完了。会津で参加できる活動を見つけよう。"
          : "登録しました。管理者の承認後に利用できます。";
      try {
        await sendEmailVerification(credential.user);
      } catch (verificationError) {
        registrationMessage = `登録は完了しましたが、確認メールを送信できませんでした。${getFirebaseErrorMessage(verificationError)}`;
      }
      setAppUser(userData);
      setMessage(registrationMessage);
    } catch (error) {
      if (authMode === "register" && auth.currentUser) {
        await signOut(auth).catch(() => undefined);
      }
      setMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsActionLoading(false);
    }
  };

  const seedEvents = async () => {
    if (!appUser) return;
    setIsActionLoading(true);
    setMessage("");
    try {
      setEvents(
        sampleEvents.map((event, index) => ({
          ...event,
          id: `demo-${index + 1}`,
        })),
      );
      await loadProductData(appUser.uid);
      setMessage(
        "開発用のサンプル表示を読み込みました。公開データはFirestoreから表示されます。",
      );
    } catch (error) {
      setMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsActionLoading(false);
    }
  };

  const applyToEvent = async (eventToApply: AizuEvent) => {
    if (!appUser) return;
    if (!eventToApply.createdBy) {
      setMessage(
        "これはデモイベントです。公開済みイベントから参加申請できます。",
      );
      return;
    }
    setIsActionLoading(true);
    setMessage("");
    try {
      const submitApplication = httpsCallable<
        { eventId: string },
        { applicationId: string }
      >(functions, "submitApplication");
      const result = await submitApplication({ eventId: eventToApply.id });
      const applicationId = result.data.applicationId;
      await loadProductData(appUser.uid);
      setActiveRoomId(applicationId);
      setActiveTab("messages");
      setMessage("参加申請を送信しました。主催者からの連絡を待ちましょう。");
    } catch (error) {
      setMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsActionLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!appUser || !activeRoomId || !messageDraft.trim()) return;
    const text = messageDraft.trim().slice(0, 2000);
    setMessageDraft("");
    try {
      await addDoc(collection(db, "chatRooms", activeRoomId, "messages"), {
        roomId: activeRoomId,
        senderId: appUser.uid,
        senderName: appUser.displayName,
        type: "text",
        text,
        createdAt: serverTimestamp(),
      });
      await setDoc(
        doc(db, "chatRooms", activeRoomId),
        {
          lastMessageText: text,
          lastMessageAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      setMessage(getFirebaseErrorMessage(error));
    }
  };

  const cancelApplication = async (application: EventApplication) => {
    if (!appUser || !["pending", "confirmed"].includes(application.status)) {
      return;
    }
    setIsActionLoading(true);
    setMessage("");
    try {
      await updateDoc(doc(db, "eventApplications", application.id), {
        status: "cancelled",
      });
      await loadProductData(appUser.uid);
      setMessage("参加申請をキャンセルしました。");
    } catch (error) {
      setMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsActionLoading(false);
    }
  };

  const submitReport = async (reason: string, description: string) => {
    if (!appUser || !reportTarget) return;
    setIsActionLoading(true);
    try {
      await addDoc(collection(db, "reports"), {
        reporterId: appUser.uid,
        targetType: reportTarget.targetType,
        targetId: reportTarget.targetId,
        targetTitle: reportTarget.title,
        reason,
        description: description.trim().slice(0, 1000) || null,
        status: "submitted",
        createdAt: serverTimestamp(),
      });
      setReportTarget(null);
      setMessage("通報を受け付けました。運営が確認します。");
    } catch (error) {
      setMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isAuthLoading) return <LoadingScreen />;
  if (!firebaseUser || !appUser)
    return (
      <AuthScreen
        {...{
          authMode,
          setAuthMode,
          accountType,
          setAccountType,
          email,
          setEmail,
          password,
          setPassword,
          showPassword,
          setShowPassword,
          displayName,
          setDisplayName,
          department,
          setDepartment,
          grade,
          setGrade,
          interestText,
          setInterestText,
          currentActivities,
          setCurrentActivities,
          wantToTry,
          setWantToTry,
          organizationName,
          setOrganizationName,
          isActionLoading,
          message,
          handleAuthSubmit,
        }}
      />
    );
  if (import.meta.env.PROD && !firebaseUser.emailVerified)
    return (
      <VerifyEmailScreen
        firebaseUser={firebaseUser}
        onVerified={async () => {
          await reload(firebaseUser);
          setFirebaseUser(auth.currentUser);
        }}
        onLogout={() => void signOut(auth)}
      />
    );
  if (appUser.status === "rejected")
    return (
      <AccountRejectedScreen
        appUser={appUser}
        onLogout={() => void signOut(auth)}
      />
    );
  if (appUser.status !== "active")
    return (
      <PendingScreen appUser={appUser} onLogout={() => void signOut(auth)} />
    );
  if (appUser.role === "organization") {
    return (
      <OrganizationDashboard
        appUser={appUser}
        onLogout={() => void signOut(auth)}
      />
    );
  }
  if (appUser.role === "admin") {
    return <AdminDashboard onLogout={() => void signOut(auth)} />;
  }

  const hasApplied = (eventId: string) =>
    applications.some((application) => application.eventId === eventId);
  const toggleSaved = (eventId: string) => {
    if (!appUser) return;
    const saved = savedEventIds.includes(eventId);
    setSavedEventIds((current) =>
      saved ? current.filter((id) => id !== eventId) : [...current, eventId],
    );
    void (
      saved
        ? deleteDoc(doc(db, "savedEvents", `${appUser.uid}_${eventId}`))
        : setDoc(doc(db, "savedEvents", `${appUser.uid}_${eventId}`), {
            userId: appUser.uid,
            eventId,
            createdAt: serverTimestamp(),
          })
    ).catch((error: unknown) => {
      setSavedEventIds((current) =>
        saved ? [...current, eventId] : current.filter((id) => id !== eventId),
      );
      setMessage(getFirebaseErrorMessage(error));
    });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <button
            className="brand-lockup"
            type="button"
            onClick={() => setActiveTab("home")}
            aria-label="ホームへ戻る"
          >
            <span className="brand-mark">A</span>
            <span>
              <strong>Aizu Connect</strong>
              <small>会津で、何か始める入口</small>
            </span>
          </button>
          <div className="header-location">
            <MapPin size={15} /> 会津若松市 <ChevronRight size={14} />
          </div>
          <div className="header-actions">
            <button
              className="icon-button"
              title="通知"
              type="button"
              onClick={() => setIsNotificationOpen((current) => !current)}
            >
              <Bell size={19} />
              {notifications.some((notification) => !notification.isRead) && (
                <span className="notification-dot" />
              )}
            </button>
            <button
              className="avatar-button"
              title="プロフィール"
              type="button"
              onClick={() => setActiveTab("profile")}
            >
              <UserRound size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="app-content">
        {isNotificationOpen && (
          <NotificationPanel
            notifications={notifications}
            onClose={() => setIsNotificationOpen(false)}
            onRead={async (notification) => {
              try {
                await updateDoc(doc(db, "notifications", notification.id), {
                  isRead: true,
                  readAt: serverTimestamp(),
                });
                setNotifications((current) =>
                  current.map((item) =>
                    item.id === notification.id
                      ? { ...item, isRead: true }
                      : item,
                  ),
                );
                if (
                  notification.targetType === "event" &&
                  notification.targetId
                ) {
                  setSelectedEventId(notification.targetId);
                  setActiveTab("search");
                  setIsNotificationOpen(false);
                } else if (
                  notification.targetType === "chat" &&
                  notification.targetId
                ) {
                  setActiveRoomId(notification.targetId);
                  setActiveTab("messages");
                  setIsNotificationOpen(false);
                } else if (notification.targetType === "application") {
                  await loadProductData(appUser.uid);
                  setActiveTab("activity");
                  setIsNotificationOpen(false);
                }
              } catch (error) {
                setMessage(getFirebaseErrorMessage(error));
              }
            }}
          />
        )}
        {import.meta.env.DEV && (
          <DevStatus
            appUser={appUser}
            firebaseUser={firebaseUser}
            onSeed={() => void seedEvents()}
            isLoading={isActionLoading}
          />
        )}
        <div className="welcome-row">
          <div>
            <p className="eyebrow">WELCOME BACK</p>
            <h1>こんにちは、{appUser.displayName}さん</h1>
            <p>今日は、どんな一歩を踏み出す？</p>
          </div>
          <div className="welcome-stats">
            <span>
              <strong>{applications.length}</strong>申請
            </span>
            <span>
              <strong>{savedEventIds.length}</strong>保存
            </span>
          </div>
        </div>
        {message && (
          <div className="notice">
            <CheckCircle2 size={18} /> {message}
            <button
              type="button"
              onClick={() => setMessage("")}
              aria-label="通知を閉じる"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {activeTab === "home" && (
          <HomeTab
            {...{
              events,
              filteredEvents,
              applications,
              savedEventIds,
              selectedEvent,
              selectedEventId,
              setSelectedEventId,
              toggleSaved,
              hasApplied,
              applyToEvent,
              isActionLoading,
              setActiveTab,
              setFilter,
              onReport: (event) =>
                setReportTarget({
                  targetType: "event",
                  targetId: event.id,
                  title: event.title,
                }),
            }}
          />
        )}
        {activeTab === "search" && (
          <SearchTab
            {...{
              filteredEvents,
              searchText,
              setSearchText,
              filter,
              setFilter,
              savedEventIds,
              toggleSaved,
              selectedEventId,
              setSelectedEventId,
              selectedEvent,
              hasApplied,
              applyToEvent,
              isActionLoading,
              searchDateFilter,
              setSearchDateFilter,
              onlyAvailableEvents,
              setOnlyAvailableEvents,
              onlyBeginnerEvents,
              setOnlyBeginnerEvents,
              onReport: (event) =>
                setReportTarget({
                  targetType: "event",
                  targetId: event.id,
                  title: event.title,
                }),
            }}
          />
        )}
        {activeTab === "activity" && (
          <ActivityTab
            {...{
              applications,
              activities,
              activityByMonth,
              events,
              setSelectedEventId,
              setActiveTab,
              onCancelApplication: (application) =>
                void cancelApplication(application),
            }}
          />
        )}
        {activeTab === "messages" && (
          <MessagesTab
            rooms={chatRooms}
            activeRoomId={activeRoomId}
            messages={chatMessages}
            draft={messageDraft}
            onSelectRoom={setActiveRoomId}
            onDraftChange={setMessageDraft}
            onSend={() => void sendMessage()}
            onReportMessage={(chatMessage) =>
              setReportTarget({
                targetType: "message",
                targetId: chatMessage.id,
                title: `${chatMessage.senderName}さんのメッセージ`,
              })
            }
            currentUserId={appUser.uid}
            currentUserRole="student"
            onOpenActivity={() => setActiveTab("activity")}
          />
        )}
        {activeTab === "profile" && (
          <ProfileTab
            appUser={appUser}
            applications={applications}
            activities={activities}
            activityByMonth={activityByMonth}
            savedEventIds={savedEventIds}
            events={events}
            notificationPreferences={notificationPreferences}
            onSaveProfile={async (updates) => {
              await updateDoc(doc(db, "users", appUser.uid), {
                ...updates,
                updatedAt: serverTimestamp(),
              });
              await setDoc(
                doc(db, "studentProfiles", appUser.uid),
                {
                  ...updates,
                  updatedAt: serverTimestamp(),
                },
                { merge: true },
              );
              setAppUser((current) =>
                current ? { ...current, ...updates } : current,
              );
            }}
            onSaveNotificationPreferences={async (updates) => {
              const nextPreferences = {
                ...notificationPreferences,
                ...updates,
                userId: appUser.uid,
              };
              await setDoc(
                doc(db, "notificationPreferences", appUser.uid),
                { ...nextPreferences, updatedAt: serverTimestamp() },
                { merge: true },
              );
              setNotificationPreferences(nextPreferences);
            }}
            onOpenActivity={() => setActiveTab("activity")}
            onOpenSavedEvent={(eventId) => {
              setSelectedEventId(eventId);
              setActiveTab("search");
            }}
            onLogout={() => void signOut(auth)}
          />
        )}
      </main>
      <nav className="bottom-nav" aria-label="メインナビゲーション">
        <TabButton
          active={activeTab === "home"}
          icon={<Home size={19} />}
          label="ホーム"
          onClick={() => setActiveTab("home")}
        />
        <TabButton
          active={activeTab === "search"}
          icon={<Compass size={19} />}
          label="探す"
          onClick={() => setActiveTab("search")}
        />
        <TabButton
          active={activeTab === "activity"}
          icon={<CalendarDays size={19} />}
          label="活動"
          badge={applications.length || undefined}
          onClick={() => setActiveTab("activity")}
        />
        <TabButton
          active={activeTab === "messages"}
          icon={<MessageSquareText size={19} />}
          label="メッセージ"
          onClick={() => setActiveTab("messages")}
        />
        <TabButton
          active={activeTab === "profile"}
          icon={<CircleUserRound size={19} />}
          label="プロフィール"
          onClick={() => setActiveTab("profile")}
        />
      </nav>
      {reportTarget && (
        <ReportDialog
          target={reportTarget}
          isSubmitting={isActionLoading}
          onClose={() => setReportTarget(null)}
          onSubmit={(reason, description) =>
            void submitReport(reason, description)
          }
        />
      )}
    </div>
  );
}

function HomeTab(props: {
  events: AizuEvent[];
  filteredEvents: AizuEvent[];
  applications: EventApplication[];
  savedEventIds: string[];
  selectedEvent?: AizuEvent;
  selectedEventId: string | null;
  setSelectedEventId: (id: string) => void;
  toggleSaved: (id: string) => void;
  hasApplied: (id: string) => boolean;
  applyToEvent: (event: AizuEvent) => Promise<void>;
  isActionLoading: boolean;
  setActiveTab: (tab: Tab) => void;
  setFilter: (value: Filter) => void;
  onReport: (event: AizuEvent) => void;
}) {
  const {
    events,
    filteredEvents,
    applications,
    savedEventIds,
    selectedEventId,
    setSelectedEventId,
    toggleSaved,
    hasApplied,
    applyToEvent,
    isActionLoading,
    setActiveTab,
    setFilter,
  } = props;
  return (
    <section className="tab-page">
      <div
        className="search-launch"
        onClick={() => setActiveTab("search")}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter") setActiveTab("search");
        }}
      >
        <Search size={18} />
        <span>イベント・活動・地域を探す</span>
        <kbd>⌘ K</kbd>
      </div>
      <div className="category-row">
        {categories.map((category) => (
          <button
            className={
              category === "すべて" ? "category-pill active" : "category-pill"
            }
            key={category}
            type="button"
            onClick={() => {
              setFilter(category);
              setActiveTab("search");
            }}
          >
            {category}
          </button>
        ))}
      </div>
      {applications.some((application) =>
        ["pending", "confirmed"].includes(application.status),
      ) && (
        <section className="upcoming-banner">
          <div className="upcoming-banner-icon">
            <CalendarClock size={19} />
          </div>
          <div>
            <p className="eyebrow">NEXT STEP</p>
            <strong>
              {applications.find((application) =>
                ["confirmed", "pending"].includes(application.status),
              )?.eventTitle ?? "参加予定のイベント"}
            </strong>
            <span>
              {applications.find((application) =>
                ["confirmed", "pending"].includes(application.status),
              )?.status === "confirmed"
                ? "参加確定。開催前に詳細を確認しましょう。"
                : "主催者が申請を確認しています。"}
            </span>
          </div>
          <button type="button" onClick={() => setActiveTab("activity")}>
            活動を見る <ChevronRight size={15} />
          </button>
        </section>
      )}
      {events.length === 0 ? (
        <EmptyEvents />
      ) : (
        <>
          <section className="feature-section">
            <SectionHeading
              eyebrow="TODAY'S PICK"
              title="あなたへのおすすめ"
              action="すべて見る"
              onClick={() => setActiveTab("search")}
            />
            {filteredEvents[0] && (
              <FeaturedEvent
                event={filteredEvents[0]}
                saved={savedEventIds.includes(filteredEvents[0].id)}
                onSave={() => toggleSaved(filteredEvents[0].id)}
                onOpen={() => setSelectedEventId(filteredEvents[0].id)}
              />
            )}
          </section>
          <section>
            <SectionHeading
              eyebrow="DISCOVER"
              title="新着イベント"
              action="探しにいく"
              onClick={() => setActiveTab("search")}
            />
            <div className="event-grid">
              {filteredEvents.slice(0, 4).map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  saved={savedEventIds.includes(event.id)}
                  selected={selectedEventId === event.id}
                  applied={hasApplied(event.id)}
                  onSave={() => toggleSaved(event.id)}
                  onOpen={() => setSelectedEventId(event.id)}
                />
              ))}
            </div>
          </section>
          {props.selectedEvent && (
            <EventDrawer
              event={props.selectedEvent}
              applied={hasApplied(props.selectedEvent.id)}
              onApply={() => void applyToEvent(props.selectedEvent!)}
              isLoading={isActionLoading}
              onReport={() => props.onReport(props.selectedEvent!)}
              onClose={() => setSelectedEventId("")}
            />
          )}
        </>
      )}
    </section>
  );
}

function SearchTab(props: {
  filteredEvents: AizuEvent[];
  searchText: string;
  setSearchText: (value: string) => void;
  filter: Filter;
  setFilter: (value: Filter) => void;
  savedEventIds: string[];
  toggleSaved: (id: string) => void;
  selectedEventId: string | null;
  setSelectedEventId: (id: string) => void;
  selectedEvent?: AizuEvent;
  hasApplied: (id: string) => boolean;
  applyToEvent: (event: AizuEvent) => Promise<void>;
  isActionLoading: boolean;
  searchDateFilter: SearchDateFilter;
  setSearchDateFilter: (value: SearchDateFilter) => void;
  onlyAvailableEvents: boolean;
  setOnlyAvailableEvents: (value: boolean) => void;
  onlyBeginnerEvents: boolean;
  setOnlyBeginnerEvents: (value: boolean) => void;
  onReport: (event: AizuEvent) => void;
}) {
  return (
    <section className="tab-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">DISCOVER</p>
          <h2>気になる活動を探す</h2>
          <p>ふらっと参加できる会津の機会を集めています。</p>
        </div>
        <div className="result-count">
          {props.filteredEvents.length}
          <small>件</small>
        </div>
      </div>
      <div className="search-field large">
        <Search size={19} />
        <input
          autoFocus
          value={props.searchText}
          onChange={(event) => props.setSearchText(event.target.value)}
          placeholder="イベント、活動、地域を検索"
        />
      </div>
      <div className="filter-row">
        {categories.map((category) => (
          <button
            className={
              props.filter === category ? "filter-chip active" : "filter-chip"
            }
            key={category}
            type="button"
            onClick={() => props.setFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="advanced-filter-row" aria-label="追加の絞り込み">
        <div className="advanced-filter-group">
          <CalendarClock size={15} />
          {(["すべて", "今週", "今月"] as SearchDateFilter[]).map((value) => (
            <button
              className={props.searchDateFilter === value ? "active" : ""}
              key={value}
              type="button"
              onClick={() => props.setSearchDateFilter(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <label className="toggle-filter">
          <input
            type="checkbox"
            checked={props.onlyAvailableEvents}
            onChange={(event) =>
              props.setOnlyAvailableEvents(event.target.checked)
            }
          />
          残り枠あり
        </label>
        <label className="toggle-filter">
          <input
            type="checkbox"
            checked={props.onlyBeginnerEvents}
            onChange={(event) =>
              props.setOnlyBeginnerEvents(event.target.checked)
            }
          />
          初心者歓迎
        </label>
      </div>
      {props.filteredEvents.length === 0 ? (
        <EmptyEvents />
      ) : (
        <div className="event-grid search-grid">
          {props.filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              saved={props.savedEventIds.includes(event.id)}
              selected={props.selectedEventId === event.id}
              applied={props.hasApplied(event.id)}
              onSave={() => props.toggleSaved(event.id)}
              onOpen={() => props.setSelectedEventId(event.id)}
            />
          ))}
        </div>
      )}
      {props.selectedEvent && (
        <EventDrawer
          event={props.selectedEvent}
          applied={props.hasApplied(props.selectedEvent.id)}
          onApply={() => void props.applyToEvent(props.selectedEvent!)}
          isLoading={props.isActionLoading}
          onReport={() => props.onReport(props.selectedEvent!)}
          onClose={() => props.setSelectedEventId("")}
        />
      )}
    </section>
  );
}

const applicationStatusLabel = (status: EventApplication["status"]) => {
  const labels: Record<EventApplication["status"], string> = {
    pending: "主催者確認中",
    confirmed: "参加確定",
    rejected: "見送り",
    attended: "出席確認済み",
    absent: "欠席扱い",
    cancelled: "キャンセル済み",
  };
  return labels[status];
};

function ApplicationStatusTimeline({
  status,
}: {
  status: EventApplication["status"];
}) {
  const terminal = status === "rejected" || status === "cancelled";
  const currentStep = status === "pending" ? 1 : status === "confirmed" ? 2 : 3;
  return (
    <div className={`application-timeline ${terminal ? "terminal" : ""}`}>
      {[
        ["申請", 1],
        ["参加確定", 2],
        ["活動実績", 3],
      ].map(([label, step]) => (
        <span
          className={Number(step) <= currentStep && !terminal ? "done" : ""}
          key={label}
        >
          <i>
            {Number(step) < currentStep && !terminal ? (
              <Check size={11} />
            ) : (
              step
            )}
          </i>
          {label}
        </span>
      ))}
      {terminal && <strong>{applicationStatusLabel(status)}</strong>}
    </div>
  );
}

function ActivityTab(props: {
  applications: EventApplication[];
  activities: ActivityRecord[];
  activityByMonth: { month: number; count: number }[];
  events: AizuEvent[];
  setSelectedEventId: (id: string) => void;
  setActiveTab: (tab: Tab) => void;
  onCancelApplication: (application: EventApplication) => void;
}) {
  return (
    <section className="tab-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">YOUR ACTIVITY</p>
          <h2>活動</h2>
          <p>参加予定も、参加してきたこともここに残ります。</p>
        </div>
        <div className="activity-total">
          <strong>{props.applications.length}</strong>
          <span>申請</span>
        </div>
      </div>
      <div className="activity-card">
        <div className="activity-card-head">
          <div>
            <p className="eyebrow">ACTIVITY PORTFOLIO</p>
            <h3>2026年の活動</h3>
          </div>
          <Sparkles size={20} />
        </div>
        <div className="month-grid">
          {props.activityByMonth.map((item) => (
            <div
              className={`month-cell level-${Math.min(item.count, 3)}`}
              key={item.month}
            >
              <span>{item.month}月</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
        <div className="legend">
          <span>
            <i className="level-0" /> 参加なし
          </span>
          <span>
            <i className="level-1" /> 1件
          </span>
          <span>
            <i className="level-2" /> 2件
          </span>
          <span>
            <i className="level-3" /> 3件以上
          </span>
        </div>
      </div>
      <SectionHeading
        eyebrow="UPCOMING"
        title="参加予定"
        action="イベントを探す"
        onClick={() => props.setActiveTab("search")}
      />
      <div className="application-list">
        {props.applications.length === 0 ? (
          <div className="empty-inline">
            <CalendarDays size={26} />
            <p>まだ参加予定はありません。</p>
            <button type="button" onClick={() => props.setActiveTab("search")}>
              イベントを探す
            </button>
          </div>
        ) : (
          props.applications.map((application) => (
            <div className="application-item" key={application.id}>
              <div className="date-block">
                {(() => {
                  const event = props.events.find(
                    (item) => item.id === application.eventId,
                  );
                  const eventDate = event?.startAt?.toDate();
                  return (
                    <>
                      <strong>{eventDate?.getDate() ?? "--"}</strong>
                      <span>
                        {eventDate ? `${eventDate.getMonth() + 1}月` : "予定"}
                      </span>
                    </>
                  );
                })()}
              </div>
              <div className="application-copy">
                <strong>{application.eventTitle}</strong>
                <span>{application.organizationName}</span>
                <small>
                  {application.status === "confirmed"
                    ? "参加確定。開催前にメッセージで詳細を確認しましょう。"
                    : application.status === "attended"
                      ? "出席が確認され、活動実績に反映されています。"
                      : application.status === "rejected"
                        ? "今回は参加できませんでした。別の活動を探してみましょう。"
                        : "申請後の連絡はメッセージから確認できます。"}
                </small>
                <ApplicationStatusTimeline status={application.status} />
              </div>
              <span className="status-chip">
                {applicationStatusLabel(application.status)}
              </span>
              {["pending", "confirmed"].includes(application.status) && (
                <button
                  className="text-button application-cancel"
                  type="button"
                  onClick={() => props.onCancelApplication(application)}
                >
                  キャンセル
                </button>
              )}
            </div>
          ))
        )}
      </div>
      <SectionHeading eyebrow="VERIFIED HISTORY" title="活動実績" />
      <div className="activity-history">
        {props.activities.length === 0 ? (
          <div className="empty-inline">
            <Sparkles size={24} />
            <p>出席確認された活動がここに表示されます。</p>
          </div>
        ) : (
          props.activities.map((activity) => (
            <article className="activity-history-item" key={activity.id}>
              <div className="activity-history-icon">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <strong>{activity.title}</strong>
                <span>{activity.organizationName}</span>
                <small>
                  {activity.activityYear}年{activity.activityMonth}月 ·{" "}
                  {activity.verificationStatus === "verified"
                    ? "主催者確認済み"
                    : "無効"}
                </small>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function MessagesTab({
  rooms,
  activeRoomId,
  messages,
  draft,
  onSelectRoom,
  onDraftChange,
  onSend,
  onReportMessage,
  currentUserId,
  currentUserRole,
  onOpenActivity,
}: {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  messages: ChatMessage[];
  draft: string;
  onSelectRoom: (roomId: string) => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onReportMessage?: (message: ChatMessage) => void;
  currentUserId: string;
  currentUserRole: "student" | "organization";
  onOpenActivity?: () => void;
}) {
  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const getCounterpartName = (room: ChatRoom) =>
    currentUserRole === "organization"
      ? room.studentName || "参加学生"
      : room.organizationName;
  return (
    <section className="tab-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">MESSAGES</p>
          <h2>メッセージ</h2>
          <p>参加するイベントごとに主催者とつながります。</p>
        </div>
        <div className="message-count">
          <MessageCircle size={20} />
          <strong>{rooms.length}</strong>
        </div>
      </div>
      {rooms.length === 0 ? (
        <div className="message-empty">
          <MessageSquareText size={32} />
          <h3>まだメッセージはありません</h3>
          <p>
            イベントに参加申請すると、主催者との連絡スペースがここにできます。
          </p>
        </div>
      ) : (
        <div className="conversation-layout">
          <div className="conversation-list">
            {rooms.map((room) => (
              <button
                className={`conversation-item ${room.id === activeRoomId ? "active" : ""}`}
                key={room.id}
                type="button"
                onClick={() => onSelectRoom(room.id)}
              >
                <div className="conversation-avatar">
                  <UsersRound size={19} />
                </div>
                <div>
                  <strong>{getCounterpartName(room)}</strong>
                  <span>{room.eventTitle}</span>
                  <small>{room.lastMessageText}</small>
                </div>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
          {activeRoom && (
            <div className="chat-panel">
              <div className="chat-panel-head">
                <div>
                  <span>イベントチャット</span>
                  <strong>{activeRoom.eventTitle}</strong>
                </div>
                <small>{getCounterpartName(activeRoom)}</small>
              </div>
              {onOpenActivity && (
                <button
                  className="chat-activity-link"
                  type="button"
                  onClick={onOpenActivity}
                >
                  参加予定・活動実績を確認する
                  <ChevronRight size={15} />
                </button>
              )}
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <p className="chat-placeholder">
                    最初のメッセージを送ってみましょう。
                  </p>
                ) : (
                  messages.map((chatMessage) => (
                    <div
                      className={`chat-message ${chatMessage.type === "system" ? "system" : chatMessage.senderId === currentUserId ? "mine" : "theirs"}`}
                      key={chatMessage.id}
                    >
                      <span>{chatMessage.senderName}</span>
                      <p>{chatMessage.text}</p>
                      {chatMessage.senderId !== currentUserId &&
                        onReportMessage &&
                        chatMessage.type !== "system" && (
                          <button
                            className="message-report-button"
                            type="button"
                            title="メッセージを通報"
                            onClick={() => onReportMessage(chatMessage)}
                          >
                            <Flag size={12} />
                          </button>
                        )}
                    </div>
                  ))
                )}
              </div>
              <form
                className="chat-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSend();
                }}
              >
                <input
                  value={draft}
                  maxLength={2000}
                  disabled={activeRoom.status !== "active"}
                  placeholder={
                    activeRoom.status === "active"
                      ? "主催者にメッセージを送る"
                      : "このチャットは終了しています"
                  }
                  onChange={(event) => onDraftChange(event.target.value)}
                />
                <button
                  type="submit"
                  disabled={activeRoom.status !== "active" || !draft.trim()}
                  title="送信"
                >
                  <MessageSquareText size={17} />
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ProfileTab({
  appUser,
  applications,
  activities,
  activityByMonth,
  savedEventIds,
  events,
  notificationPreferences,
  onSaveProfile,
  onSaveNotificationPreferences,
  onOpenActivity,
  onOpenSavedEvent,
  onLogout,
}: {
  appUser: AppUser;
  applications: EventApplication[];
  activities: ActivityRecord[];
  activityByMonth: { month: number; count: number }[];
  savedEventIds: string[];
  events: AizuEvent[];
  notificationPreferences: NotificationPreferences;
  onSaveProfile: (updates: {
    displayName: string;
    department: string;
    grade: number;
    interests: string[];
    currentActivities: string;
    wantToTry: string;
  }) => Promise<void>;
  onSaveNotificationPreferences: (
    updates: Partial<Omit<NotificationPreferences, "userId">>,
  ) => Promise<void>;
  onOpenActivity: () => void;
  onOpenSavedEvent: (eventId: string) => void;
  onLogout: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(appUser.displayName);
  const [department, setDepartment] = useState(appUser.department);
  const [grade, setGrade] = useState(appUser.grade);
  const [interestText, setInterestText] = useState(
    appUser.interests.join(", "),
  );
  const [currentActivities, setCurrentActivities] = useState(
    appUser.currentActivities ?? "",
  );
  const [wantToTry, setWantToTry] = useState(appUser.wantToTry ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(
    null,
  );
  const [isNotificationSettingsOpen, setIsNotificationSettingsOpen] =
    useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const totalActivities = activityByMonth.reduce(
    (sum, item) => sum + item.count,
    0,
  );
  const earnedBadges = [
    activities.length >= 1 ? "はじめの一歩" : null,
    activities.length >= 3 ? "地域と接続" : null,
    activities.length >= 5 ? "アクティブメンバー" : null,
  ].filter(Boolean) as string[];

  const startEditing = () => {
    setDisplayName(appUser.displayName);
    setDepartment(appUser.department);
    setGrade(appUser.grade);
    setInterestText(appUser.interests.join(", "));
    setCurrentActivities(appUser.currentActivities ?? "");
    setWantToTry(appUser.wantToTry ?? "");
    setProfileMessage("");
    setIsEditing(true);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const interests = interestText
      .split(",")
      .map((interest) => interest.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (!displayName.trim() || !department.trim() || interests.length === 0) {
      setProfileMessage("表示名、学科、興味分野を入力してください。");
      return;
    }
    setIsSaving(true);
    setProfileMessage("");
    try {
      await onSaveProfile({
        displayName: displayName.trim().slice(0, 60),
        department: department.trim().slice(0, 80),
        grade: Math.max(1, Math.min(6, grade)),
        interests,
        currentActivities: currentActivities.trim().slice(0, 240),
        wantToTry: wantToTry.trim().slice(0, 240),
      });
      setIsEditing(false);
      setProfileMessage("プロフィールを更新しました。");
    } catch (error) {
      setProfileMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="tab-page">
      <div className="profile-hero">
        <div className="profile-avatar">
          <CircleUserRound size={35} />
        </div>
        <div className="profile-copy">
          <p className="eyebrow">MY PROFILE</p>
          <h2>{appUser.displayName}</h2>
          <p>
            {appUser.university} · {appUser.department} · {appUser.grade}年
          </p>
          <div className="interest-list">
            {appUser.interests.map((interest) => (
              <span key={interest}>{interest}</span>
            ))}
          </div>
          <div className="profile-intentions">
            <div>
              <span>今やっていること</span>
              <strong>{appUser.currentActivities || "これから見つける"}</strong>
            </div>
            <div>
              <span>やってみたいこと</span>
              <strong>{appUser.wantToTry || "気になる活動を探してみる"}</strong>
            </div>
          </div>
        </div>
        <button
          className="profile-edit-button"
          title="プロフィールを編集"
          type="button"
          onClick={startEditing}
        >
          <Settings size={16} />
          編集
        </button>
      </div>
      {profileMessage && <div className="notice">{profileMessage}</div>}
      {isEditing && (
        <form
          className="profile-edit-panel"
          onSubmit={(event) => void saveProfile(event)}
        >
          <div className="profile-edit-head">
            <div>
              <p className="eyebrow">EDIT PROFILE</p>
              <h3>プロフィールを設定</h3>
            </div>
            <button
              className="icon-button"
              title="閉じる"
              type="button"
              onClick={() => setIsEditing(false)}
            >
              <X size={17} />
            </button>
          </div>
          <Field label="表示名">
            <input
              value={displayName}
              maxLength={60}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="学科">
              <input
                value={department}
                maxLength={80}
                onChange={(event) => setDepartment(event.target.value)}
              />
            </Field>
            <Field label="学年">
              <input
                type="number"
                min={1}
                max={6}
                value={grade}
                onChange={(event) => setGrade(Number(event.target.value))}
              />
            </Field>
          </div>
          <Field label="興味分野（カンマ区切り）">
            <input
              value={interestText}
              maxLength={200}
              onChange={(event) => setInterestText(event.target.value)}
            />
          </Field>
          <Field label="今やっていること（任意）">
            <textarea
              value={currentActivities}
              maxLength={240}
              placeholder="例：学生団体の運営、英語の勉強"
              onChange={(event) => setCurrentActivities(event.target.value)}
            />
          </Field>
          <Field label="やってみたいこと（任意）">
            <textarea
              value={wantToTry}
              maxLength={240}
              placeholder="例：地域イベントの運営、ものづくり"
              onChange={(event) => setWantToTry(event.target.value)}
            />
          </Field>
          <button className="primary-action" type="submit" disabled={isSaving}>
            {isSaving ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <Check size={17} />
            )}
            保存する
          </button>
        </form>
      )}
      <div className="profile-stats">
        <span>
          <strong>{totalActivities}</strong>
          <small>参加回数</small>
        </span>
        <span>
          <strong>{applications.length}</strong>
          <small>申請数</small>
        </span>
        <span>
          <strong>{earnedBadges.length}</strong>
          <small>バッジ</small>
        </span>
      </div>
      <div className="profile-section">
        <SectionHeading
          eyebrow="PORTFOLIO"
          title="活動実績"
          action="詳しく見る"
          onClick={onOpenActivity}
        />
        <div className="mini-month-grid">
          {activityByMonth.map((item) => (
            <div
              className={`mini-month level-${Math.min(item.count, 3)}`}
              key={item.month}
            >
              <span>{item.month}月</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="profile-section saved-events-section">
        <SectionHeading eyebrow="SAVED" title="保存したイベント" />
        {savedEventIds.length === 0 ? (
          <div className="empty-inline">
            <Heart size={22} />
            <p>気になるイベントを保存すると、ここからすぐ開けます。</p>
          </div>
        ) : (
          <div className="saved-event-list">
            {savedEventIds.map((eventId) => {
              const event = events.find((item) => item.id === eventId);
              if (!event) return null;
              return (
                <button
                  className="saved-event-item"
                  key={event.id}
                  type="button"
                  onClick={() => onOpenSavedEvent(event.id)}
                >
                  <img src={event.imageUrl} alt="" />
                  <span>
                    <strong>{event.title}</strong>
                    <small>
                      {event.startAtLabel} · {event.location}
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="settings-list">
        <div>
          <div className="settings-icon">
            <ShieldCheck size={18} />
          </div>
          <span>
            <strong>学生確認済み</strong>
            <small>会津大学メールで確認しています</small>
          </span>
          <Check size={17} />
        </div>
        <button
          className="settings-row"
          type="button"
          onClick={() => setIsNotificationSettingsOpen((current) => !current)}
        >
          <div className="settings-icon">
            <Bell size={18} />
          </div>
          <span>
            <strong>通知設定</strong>
            <small>新着イベントを受け取る</small>
          </span>
          <ChevronRight
            size={17}
            className={isNotificationSettingsOpen ? "rotate-90" : ""}
          />
        </button>
        {isNotificationSettingsOpen && (
          <div className="notification-settings-panel">
            <div>
              <strong>通知を受け取る</strong>
              <small>新着・申請・メッセージの通知を管理します。</small>
            </div>
            {(
              [
                ["newEvents", "新着イベント"],
                ["applicationUpdates", "申請状況の更新"],
                ["chatMessages", "メッセージ"],
                ["eventReminders", "開催前のリマインド"],
              ] as const
            ).map(([key, label]) => (
              <label className="preference-row" key={key}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={notificationPreferences[key]}
                  disabled={isSavingNotifications}
                  onChange={async (event) => {
                    setIsSavingNotifications(true);
                    try {
                      await onSaveNotificationPreferences({
                        [key]: event.target.checked,
                      });
                    } catch (error) {
                      setProfileMessage(getFirebaseErrorMessage(error));
                    } finally {
                      setIsSavingNotifications(false);
                    }
                  }}
                />
              </label>
            ))}
          </div>
        )}
        <button
          className="settings-row"
          type="button"
          onClick={() => setLegalDocument("terms")}
        >
          <div className="settings-icon">
            <ShieldCheck size={18} />
          </div>
          <span>
            <strong>利用規約</strong>
            <small>サービスの利用条件を確認する</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button
          className="settings-row"
          type="button"
          onClick={() => setLegalDocument("privacy")}
        >
          <div className="settings-icon">
            <ShieldCheck size={18} />
          </div>
          <span>
            <strong>プライバシーポリシー</strong>
            <small>個人情報の取り扱いを確認する</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <div>
          <div className="settings-icon">
            <LogOut size={18} />
          </div>
          <button type="button" onClick={onLogout}>
            <strong>ログアウト</strong>
            <small>この端末からログアウト</small>
          </button>
          <ChevronRight size={17} />
        </div>
      </div>
      {legalDocument && (
        <LegalDialog
          document={legalDocument}
          onClose={() => setLegalDocument(null)}
        />
      )}
    </section>
  );
}

function EventCard({
  event,
  saved,
  selected,
  applied,
  onSave,
  onOpen,
}: {
  event: AizuEvent;
  saved: boolean;
  selected: boolean;
  applied: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  return (
    <article className={`event-card ${selected ? "selected" : ""}`}>
      <div
        className="event-card-main"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onOpen();
        }}
      >
        <div className="event-image-wrap">
          <img src={event.imageUrl} alt="" />
          <span className="event-category">{event.category}</span>
          <button
            className={`save-button ${saved ? "saved" : ""}`}
            title="保存"
            type="button"
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              onSave();
            }}
          >
            <Heart size={17} fill={saved ? "currentColor" : "none"} />
          </button>
        </div>
        <div className="event-card-body">
          <h3>{event.title}</h3>
          <p>{event.summary}</p>
          <div className="event-meta">
            <span>
              <CalendarDays size={14} /> {event.startAtLabel}
            </span>
            <span>
              <MapPin size={14} /> {event.location}
            </span>
          </div>
          <div className="tag-row">
            {event.tags.slice(0, 2).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="event-card-foot">
            <span className="organizer">{event.organizationName}</span>
            <span className={applied ? "applied-label" : "capacity-label"}>
              {applied
                ? "申請済み"
                : `残り ${Math.max(Number(event.capacity ?? 0) - Number(event.applicantCount ?? 0), 0)}名`}
            </span>
          </div>
          <button
            className="event-detail-link"
            type="button"
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              onOpen();
            }}
          >
            詳細を見る <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

function FeaturedEvent({
  event,
  saved,
  onSave,
  onOpen,
}: {
  event: AizuEvent;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="featured-event">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onOpen();
        }}
      >
        <img src={event.imageUrl} alt="" />
        <div className="featured-overlay" />
        <div className="featured-content">
          <span className="featured-label">今週のおすすめ</span>
          <h3>{event.title}</h3>
          <p>
            <MapPin size={14} /> {event.location} · {event.startAtLabel}
          </p>
          <div className="featured-action">
            <span>
              詳細を見る <ChevronRight size={15} />
            </span>
            <button
              className={`save-button ${saved ? "saved" : ""}`}
              title="保存"
              type="button"
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                onSave();
              }}
            >
              <Heart size={17} fill={saved ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function EventDrawer({
  event,
  applied,
  onApply,
  onReport,
  isLoading,
  onClose,
}: {
  event: AizuEvent;
  applied: boolean;
  onApply: () => void;
  onReport: () => void;
  isLoading: boolean;
  onClose: () => void;
}) {
  const canApply = Boolean(event.createdBy);
  const capacity = Number(event.capacity ?? 0);
  const applicantCount = Number(event.applicantCount ?? 0);
  const remainingSlots = Math.max(0, capacity - applicantCount);
  const organizerVerified =
    event.organizationVerified ?? Boolean(event.createdBy);

  useEffect(() => {
    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="detail-overlay" role="presentation" onClick={onClose}>
      <section
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-detail-title"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="detail-panel-head">
          <span>イベント詳細</span>
          <button
            className="icon-button"
            title="閉じる"
            type="button"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="detail-visual" aria-hidden="true">
          <img src={event.imageUrl} alt="" />
          <div className="detail-visual-shade" />
          <div className="detail-visual-copy">
            <span className="detail-visual-badge">{event.category}</span>
            <strong>{event.organizationName}</strong>
            <span>
              <MapPin size={14} /> {event.location}
            </span>
            <span>
              <CalendarDays size={14} /> {event.startAtLabel}
            </span>
          </div>
        </div>
        <div className="detail-panel-content">
          <p className="eyebrow">{event.category}</p>
          <h2 id="event-detail-title">{event.title}</h2>
          <p className="detail-summary">{event.summary}</p>
          <section className="detail-section">
            <h3>このイベントについて</h3>
            <p>
              会津で新しい人や地域と出会える活動です。初めてでも参加しやすいように、
              主催者とメッセージで事前に確認できます。
            </p>
          </section>
          <div className="detail-facts">
            <span>
              <CalendarDays size={16} /> {event.startAtLabel}
            </span>
            <span>
              <MapPin size={16} /> {event.location}
            </span>
            <span>
              <UsersRound size={16} /> 定員 {capacity}名
            </span>
          </div>
          <section className="detail-section">
            <h3>参加前に確認</h3>
            <ul>
              <li>開催日時と集合場所を確認してください</li>
              <li>参加申請後はメッセージで主催者と連絡できます</li>
              <li>参加後、出席確認された活動が実績に反映されます</li>
            </ul>
          </section>
          <div className="tag-row detail-tags">
            {event.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="organizer-card">
            <div className="organizer-icon">
              <UsersRound size={17} />
            </div>
            <div>
              <small>主催</small>
              <strong>{event.organizationName}</strong>
              {organizerVerified && (
                <span className="verified-organizer">
                  <ShieldCheck size={13} /> 承認済み主催者
                </span>
              )}
            </div>
          </div>
          <div className="detail-trust-row">
            <span>
              <UsersRound size={15} />
              {remainingSlots > 0
                ? `残り${remainingSlots}名`
                : "定員に達しています"}
            </span>
            <button className="text-button" type="button" onClick={onReport}>
              <Flag size={14} /> 掲載を通報
            </button>
          </div>
          <button
            className="primary-action"
            type="button"
            disabled={applied || isLoading || !canApply || remainingSlots === 0}
            onClick={onApply}
          >
            {isLoading && <Loader2 size={17} className="spin" />}
            {applied
              ? "申請済み"
              : canApply
                ? remainingSlots > 0
                  ? "このイベントに参加する"
                  : "定員に達しています"
                : "デモイベント（閲覧のみ）"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
  onClick,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action && (
        <button type="button" onClick={onClick}>
          {action}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}

function EmptyEvents() {
  return (
    <div className="empty-state">
      <Compass size={30} />
      <h3>公開中のイベントはありません</h3>
      <p>新しいイベントが公開されると、ここから参加できます。</p>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      className={`tab-button ${active ? "active" : ""}`}
      type="button"
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {badge ? <b>{badge}</b> : null}
    </button>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <div className="brand-mark large">A</div>
      <Loader2 size={20} className="spin" />
      <span>Aizu Connectを準備しています</span>
    </main>
  );
}

function AuthScreen(props: {
  authMode: "login" | "register";
  setAuthMode: (mode: "login" | "register") => void;
  accountType: "student" | "organization";
  setAccountType: (type: "student" | "organization") => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  displayName: string;
  setDisplayName: (value: string) => void;
  department: string;
  setDepartment: (value: string) => void;
  grade: number;
  setGrade: (value: number) => void;
  interestText: string;
  setInterestText: (value: string) => void;
  currentActivities: string;
  setCurrentActivities: (value: string) => void;
  wantToTry: string;
  setWantToTry: (value: string) => void;
  organizationName: string;
  setOrganizationName: (value: string) => void;
  isActionLoading: boolean;
  message: string;
  handleAuthSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(
    null,
  );
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState(props.email);
  const [resetMessage, setResetMessage] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const submitPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetEmail.trim()) {
      setResetMessage("メールアドレスを入力してください。");
      return;
    }
    setIsResetting(true);
    setResetMessage("");
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setResetMessage(
        "パスワード再設定メールを送信しました。メールを確認してください。",
      );
    } catch (error) {
      setResetMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-visual">
        <div className="auth-brand">
          <span className="brand-mark">A</span>
          <strong>Aizu Connect</strong>
        </div>
        <div>
          <p className="eyebrow">START SOMETHING IN AIZU</p>
          <h1>
            会津で、
            <br />
            <em>何か始める。</em>
          </h1>
          <p>
            人との出会い、新しい経験、地域とのつながり。
            <br />
            ふらっと参加した経験が、あなたの実績になる。
          </p>
        </div>
        <div className="auth-visual-note">
          <Sparkles size={17} /> 参加するほど、会津とのつながりが増えていく
        </div>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form-card">
          <div className="auth-mobile-brand">
            <span className="brand-mark">A</span>
            <strong>Aizu Connect</strong>
          </div>
          <p className="eyebrow">WELCOME</p>
          <h2>
            {props.authMode === "register"
              ? "活動をはじめよう"
              : "おかえりなさい"}
          </h2>
          <p className="auth-lede">会津でできることを見つけてみよう。</p>
          <div className="auth-switch">
            <button
              className={props.authMode === "register" ? "active" : ""}
              type="button"
              onClick={() => props.setAuthMode("register")}
            >
              新規登録
            </button>
            <button
              className={props.authMode === "login" ? "active" : ""}
              type="button"
              onClick={() => props.setAuthMode("login")}
            >
              ログイン
            </button>
          </div>
          {props.authMode === "register" && (
            <div className="account-type-switch">
              <button
                className={props.accountType === "student" ? "active" : ""}
                type="button"
                onClick={() => props.setAccountType("student")}
              >
                学生として登録
              </button>
              <button
                className={props.accountType === "organization" ? "active" : ""}
                type="button"
                onClick={() => props.setAccountType("organization")}
              >
                主催者・団体として登録
              </button>
            </div>
          )}
          <form onSubmit={props.handleAuthSubmit}>
            <Field label="メールアドレス">
              <input
                type={
                  props.authMode === "login" && import.meta.env.DEV
                    ? "text"
                    : "email"
                }
                autoComplete="email"
                placeholder={
                  props.authMode === "login" && import.meta.env.DEV
                    ? "you@example.com または admin"
                    : "you@example.com"
                }
                value={props.email}
                onChange={(event) => props.setEmail(event.target.value)}
              />
            </Field>
            <Field label="パスワード">
              <div className="password-input-wrap">
                <input
                  type={props.showPassword ? "text" : "password"}
                  autoComplete={
                    props.authMode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                  placeholder="6文字以上"
                  value={props.password}
                  onChange={(event) => props.setPassword(event.target.value)}
                />
                <button
                  className="password-toggle icon-button"
                  type="button"
                  title={
                    props.showPassword ? "パスワードを隠す" : "パスワードを見る"
                  }
                  aria-label={
                    props.showPassword ? "パスワードを隠す" : "パスワードを見る"
                  }
                  aria-pressed={props.showPassword}
                  onClick={() => props.setShowPassword(!props.showPassword)}
                >
                  {props.showPassword ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </div>
            </Field>
            {props.authMode === "login" && (
              <button
                className="text-button password-reset-link"
                type="button"
                onClick={() => {
                  setResetEmail(props.email);
                  setResetMessage("");
                  setIsResetOpen((current) => !current);
                }}
              >
                パスワードを忘れた方
              </button>
            )}
            {props.authMode === "register" && (
              <>
                <Field
                  label={
                    props.accountType === "organization" ? "団体名" : "表示名"
                  }
                >
                  <input
                    value={
                      props.accountType === "organization"
                        ? props.organizationName
                        : props.displayName
                    }
                    onChange={(event) =>
                      props.accountType === "organization"
                        ? props.setOrganizationName(event.target.value)
                        : props.setDisplayName(event.target.value)
                    }
                  />
                </Field>
                {props.accountType === "student" && (
                  <div className="form-grid">
                    <Field label="学科">
                      <input
                        value={props.department}
                        onChange={(event) =>
                          props.setDepartment(event.target.value)
                        }
                      />
                    </Field>
                    <Field label="学年">
                      <input
                        min={1}
                        max={6}
                        type="number"
                        value={props.grade}
                        onChange={(event) =>
                          props.setGrade(Number(event.target.value))
                        }
                      />
                    </Field>
                  </div>
                )}
                {props.accountType === "student" && (
                  <Field label="興味分野">
                    <input
                      value={props.interestText}
                      onChange={(event) =>
                        props.setInterestText(event.target.value)
                      }
                    />
                  </Field>
                )}
                {props.accountType === "student" && (
                  <>
                    <Field label="今やっていること（任意）">
                      <textarea
                        value={props.currentActivities}
                        maxLength={240}
                        placeholder="例：学生団体の運営、英語の勉強"
                        onChange={(event) =>
                          props.setCurrentActivities(event.target.value)
                        }
                      />
                    </Field>
                    <Field label="やってみたいこと（任意）">
                      <textarea
                        value={props.wantToTry}
                        maxLength={240}
                        placeholder="例：地域イベントの運営、ものづくり"
                        onChange={(event) =>
                          props.setWantToTry(event.target.value)
                        }
                      />
                    </Field>
                  </>
                )}
              </>
            )}
            <button
              className="primary-action auth-submit"
              disabled={props.isActionLoading}
              type="submit"
            >
              {props.isActionLoading ? (
                <Loader2 size={17} className="spin" />
              ) : (
                <Check size={17} />
              )}
              {props.authMode === "register"
                ? props.accountType === "organization"
                  ? "主催者・団体として申請"
                  : "学生として始める"
                : "ログインする"}
            </button>
          </form>
          {props.authMode === "login" && isResetOpen && (
            <form
              className="password-reset-panel"
              onSubmit={(event) => void submitPasswordReset(event)}
            >
              <p className="eyebrow">RESET PASSWORD</p>
              <h3>パスワードを再設定</h3>
              <p>登録済みのメールアドレスへ再設定リンクを送ります。</p>
              <input
                type="email"
                value={resetEmail}
                placeholder="you@example.com"
                onChange={(event) => setResetEmail(event.target.value)}
              />
              <button
                className="secondary-action"
                type="submit"
                disabled={isResetting}
              >
                {isResetting && <Loader2 size={16} className="spin" />}
                メールを送る
              </button>
              {resetMessage && <small>{resetMessage}</small>}
            </form>
          )}
          {props.message && <div className="form-message">{props.message}</div>}
          {import.meta.env.DEV && (
            <p className="auth-environment-note">
              開発環境：Firebase Emulatorを起動してから操作してください。
            </p>
          )}
          <p className="form-footnote">
            {props.accountType === "organization"
              ? "主催者・団体の登録は管理者の確認後に利用できます。"
              : "会津大学メール以外の学生は、登録後に管理者が確認します。"}
          </p>
          <p className="legal-links">
            登録・利用にあたり、
            <button type="button" onClick={() => setLegalDocument("terms")}>
              利用規約
            </button>
            と
            <button type="button" onClick={() => setLegalDocument("privacy")}>
              プライバシーポリシー
            </button>
            を確認してください。
          </p>
        </div>
      </div>
      {legalDocument && (
        <LegalDialog
          document={legalDocument}
          onClose={() => setLegalDocument(null)}
        />
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function VerifyEmailScreen({
  firebaseUser,
  onVerified,
  onLogout,
}: {
  firebaseUser: User;
  onVerified: () => Promise<void>;
  onLogout: () => void;
}) {
  const [notice, setNotice] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const resend = async () => {
    setIsSending(true);
    setNotice("");
    try {
      await sendEmailVerification(firebaseUser);
      setNotice("確認メールを再送しました。メール内のリンクを開いてください。");
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  };

  const checkVerification = async () => {
    setIsChecking(true);
    setNotice("");
    try {
      await onVerified();
      setNotice(
        auth.currentUser?.emailVerified
          ? "メール認証が完了しました。"
          : "まだ認証を確認できません。メールのリンクを開いてから再確認してください。",
      );
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error));
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <main className="loading-screen">
      <div className="pending-card verify-card">
        <div className="brand-mark">A</div>
        <p className="eyebrow">EMAIL VERIFICATION</p>
        <h1>メールを確認してください</h1>
        <p>
          <strong>{firebaseUser.email}</strong> に確認メールを送信しました。
          リンクを開いたあと、この画面で認証状態を確認してください。
        </p>
        {notice && <div className="notice">{notice}</div>}
        <button
          className="primary-action"
          type="button"
          onClick={() => void checkVerification()}
          disabled={isChecking}
        >
          {isChecking && <Loader2 size={17} className="spin" />}
          認証状態を確認
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={() => void resend()}
          disabled={isSending}
        >
          {isSending && <Loader2 size={17} className="spin" />}
          確認メールを再送
        </button>
        <button className="text-button" type="button" onClick={onLogout}>
          ログアウト
        </button>
      </div>
    </main>
  );
}

function PendingScreen({
  appUser,
  onLogout,
}: {
  appUser: AppUser;
  onLogout: () => void;
}) {
  return (
    <main className="loading-screen">
      <div className="pending-card">
        <div className="brand-mark">A</div>
        <p className="eyebrow">ACCOUNT REVIEW</p>
        <h1>承認をお待ちください</h1>
        <p>
          {appUser.displayName}
          さんの登録情報を管理者が確認しています。
          {appUser.role === "organization"
            ? "確認が完了したら、活動を掲載できます。"
            : "確認が完了したら、イベントへの参加を始められます。"}
        </p>
        <div className="pending-help">
          <CheckCircle2 size={17} />
          <span>
            承認されると、この画面から自動的に利用を開始できます。再ログインは不要です。
          </span>
        </div>
        <button className="secondary-action" type="button" onClick={onLogout}>
          <LogOut size={17} /> ログアウト
        </button>
      </div>
    </main>
  );
}

function AccountRejectedScreen({
  appUser,
  onLogout,
}: {
  appUser: AppUser;
  onLogout: () => void;
}) {
  return (
    <main className="loading-screen">
      <div className="pending-card">
        <div className="brand-mark">A</div>
        <p className="eyebrow">ACCOUNT REVIEW</p>
        <h1>登録内容を確認してください</h1>
        <p>
          {appUser.displayName}
          さんの登録は、現在の内容では承認されませんでした。
          運営へ問い合わせる場合は、登録したメールアドレスからご連絡ください。
        </p>
        <button className="secondary-action" type="button" onClick={onLogout}>
          <LogOut size={17} /> ログアウト
        </button>
      </div>
    </main>
  );
}

function OrganizationDashboard({
  appUser,
  onLogout,
}: {
  appUser: AppUser;
  onLogout: () => void;
}) {
  const [events, setEvents] = useState<AizuEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [applications, setApplications] = useState<EventApplication[]>([]);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [location, setLocation] = useState("会津若松市");
  const [startAtInput, setStartAtInput] = useState("");
  const [capacity, setCapacity] = useState(20);
  const [category, setCategory] = useState("交流・コミュニティ");
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");

  const organizationName = appUser.organizationName || appUser.displayName;

  const beginEditEvent = (event: AizuEvent) => {
    setEditingEventId(event.id);
    setTitle(event.title);
    setSummary(event.summary);
    setLocation(event.location);
    setStartAtInput(toDateTimeInput(event.startAt));
    setCapacity(event.capacity);
    setCategory(event.category);
    setNotice("イベントを修正して再申請できます。");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearEventForm = () => {
    setEditingEventId(null);
    setTitle("");
    setSummary("");
    setLocation("会津若松市");
    setStartAtInput("");
    setCapacity(20);
    setCategory("交流・コミュニティ");
  };

  const loadEvents = useCallback(async () => {
    const snapshot = await getDocs(
      query(
        collection(db, "events"),
        where("createdBy", "==", appUser.uid),
        limit(50),
      ),
    );
    setEvents(
      snapshot.docs.map((eventDoc) => ({
        id: eventDoc.id,
        ...eventDoc.data(),
      })) as AizuEvent[],
    );
  }, [appUser.uid]);

  useEffect(() => {
    const eventsQuery = query(
      collection(db, "events"),
      where("createdBy", "==", appUser.uid),
      limit(50),
    );
    return onSnapshot(
      eventsQuery,
      (snapshot) =>
        setEvents(
          snapshot.docs.map((eventDoc) => ({
            id: eventDoc.id,
            ...eventDoc.data(),
          })) as AizuEvent[],
        ),
      () => setNotice("掲載した活動を取得できませんでした。"),
    );
  }, [appUser.uid]);

  useEffect(() => {
    if (!selectedEventId) {
      setApplications([]);
      return;
    }
    const applicationsQuery = query(
      collection(db, "eventApplications"),
      where("organizationId", "==", appUser.uid),
      limit(100),
    );
    return onSnapshot(
      applicationsQuery,
      (snapshot) =>
        setApplications(
          snapshot.docs
            .filter(
              (applicationDoc) =>
                applicationDoc.data().eventId === selectedEventId,
            )
            .map((applicationDoc) => ({
              id: applicationDoc.id,
              ...applicationDoc.data(),
            })) as EventApplication[],
        ),
      () => setNotice("参加者情報を取得できませんでした。"),
    );
  }, [appUser.uid, selectedEventId]);

  useEffect(() => {
    const roomsQuery = query(
      collection(db, "chatRooms"),
      where("participantIds", "array-contains", appUser.uid),
      limit(100),
    );
    return onSnapshot(
      roomsQuery,
      (snapshot) => {
        const rooms = snapshot.docs.map((roomDoc) => ({
          id: roomDoc.id,
          ...roomDoc.data(),
        })) as ChatRoom[];
        setChatRooms(rooms);
        setActiveRoomId((current) => current ?? rooms[0]?.id ?? null);
      },
      () => setNotice("メッセージを取得できませんでした。"),
    );
  }, [appUser.uid]);

  useEffect(() => {
    if (!activeRoomId) {
      setChatMessages([]);
      return;
    }
    return onSnapshot(
      query(
        collection(db, "chatRooms", activeRoomId, "messages"),
        orderBy("createdAt", "asc"),
        limit(100),
      ),
      (snapshot) =>
        setChatMessages(
          snapshot.docs.map((messageDoc) => ({
            id: messageDoc.id,
            ...messageDoc.data(),
          })) as ChatMessage[],
        ),
      () => setNotice("チャットを取得できませんでした。"),
    );
  }, [activeRoomId]);

  const sendOrganizationMessage = async () => {
    if (!activeRoomId || !messageDraft.trim()) return;
    const text = messageDraft.trim().slice(0, 2000);
    setMessageDraft("");
    try {
      await addDoc(collection(db, "chatRooms", activeRoomId, "messages"), {
        roomId: activeRoomId,
        senderId: appUser.uid,
        senderName: organizationName,
        type: "text",
        text,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "chatRooms", activeRoomId), {
        lastMessageText: text,
        lastMessageAt: serverTimestamp(),
      });
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error));
    }
  };

  const createEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !summary.trim() || !startAtInput.trim()) {
      setNotice("タイトル、概要、開催日時を入力してください。");
      return;
    }
    const startAtDate = new Date(startAtInput);
    if (Number.isNaN(startAtDate.getTime())) {
      setNotice("開催日時の形式を確認してください。");
      return;
    }
    setIsLoading(true);
    setNotice("");
    try {
      const eventData = {
        title: title.trim().slice(0, 80),
        summary: summary.trim().slice(0, 220),
        category,
        location: location.trim().slice(0, 80),
        startAtLabel: formatEventStart(startAtInput),
        startAt: Timestamp.fromDate(startAtDate),
        organizationName,
        organizationId: appUser.uid,
        organizationVerified: true,
        status: "pending_review",
        capacity: Math.max(1, Math.min(capacity, 1000)),
        applicantCount: 0,
        imageUrl:
          "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80",
        tags: [category, "学生歓迎"],
        createdBy: appUser.uid,
        updatedAt: serverTimestamp(),
      };
      if (editingEventId) {
        await updateDoc(doc(db, "events", editingEventId), {
          ...eventData,
          status: "pending_review",
        });
      } else {
        await addDoc(collection(db, "events"), {
          ...eventData,
          createdAt: serverTimestamp(),
        });
      }
      clearEventForm();
      await loadEvents();
      setNotice(
        editingEventId
          ? "活動を修正して再申請しました。"
          : "活動を審査へ申請しました。管理者の確認をお待ちください。",
      );
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const updateApplicationStatus = async (
    application: EventApplication,
    status: EventApplication["status"],
  ) => {
    try {
      await updateDoc(doc(db, "eventApplications", application.id), { status });
      if (status === "attended") {
        const eventStartAt = events.find(
          (event) => event.id === application.eventId,
        )?.startAt;
        const occurredDate = eventStartAt?.toDate() ?? new Date();
        await setDoc(doc(db, "activities", application.id), {
          id: application.id,
          userId: application.studentId,
          eventId: application.eventId,
          title: application.eventTitle,
          organizationId: appUser.uid,
          organizationName,
          verificationStatus: "verified",
          verifiedBy: appUser.uid,
          occurredAt: eventStartAt ?? serverTimestamp(),
          activityMonth: occurredDate.getMonth() + 1,
          activityYear: occurredDate.getFullYear(),
          createdAt: serverTimestamp(),
        });
      }
      setApplications((current) =>
        current.map((item) =>
          item.id === application.id ? { ...item, status } : item,
        ),
      );
      setNotice("参加者の状態を更新しました。");
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error));
    }
  };

  return (
    <RoleShell
      title={organizationName}
      subtitle="主催者ダッシュボード"
      icon={<UsersRound size={19} />}
      onLogout={onLogout}
    >
      {notice && <div className="notice">{notice}</div>}
      <div className="role-grid">
        <section className="role-card">
          <div className="role-card-head">
            <div>
              <p className="eyebrow">NEW EVENT</p>
              <h2>{editingEventId ? "活動を修正する" : "活動を掲載する"}</h2>
            </div>
            {editingEventId ? (
              <button
                className="icon-button"
                type="button"
                title="編集をやめる"
                onClick={clearEventForm}
              >
                <X size={18} />
              </button>
            ) : (
              <Plus size={20} />
            )}
          </div>
          <form
            className="role-form"
            onSubmit={(event) => void createEvent(event)}
          >
            <Field label="活動名">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field label="活動の概要">
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </Field>
            <div className="form-grid">
              <Field label="カテゴリ">
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {categories
                    .filter((item) => item !== "すべて")
                    .map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                </select>
              </Field>
              <Field label="定員">
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={capacity}
                  onChange={(event) => setCapacity(Number(event.target.value))}
                />
              </Field>
            </div>
            <Field label="開催日時">
              <input
                type="datetime-local"
                value={startAtInput}
                min={new Date().toISOString().slice(0, 16)}
                onChange={(event) => setStartAtInput(event.target.value)}
                onInput={(event) => setStartAtInput(event.currentTarget.value)}
              />
            </Field>
            <Field label="場所">
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </Field>
            <button
              className="primary-action"
              disabled={isLoading}
              type="submit"
            >
              {isLoading ? (
                <Loader2 size={17} className="spin" />
              ) : (
                <Check size={17} />
              )}
              {editingEventId ? "修正して再申請する" : "審査へ申請する"}
            </button>
          </form>
        </section>
        <section className="role-card">
          <div className="role-card-head">
            <div>
              <p className="eyebrow">YOUR EVENTS</p>
              <h2>掲載した活動</h2>
            </div>
            <strong>{events.length}件</strong>
          </div>
          <div className="role-list">
            {events.length === 0 ? (
              <EmptyRoleState text="まだ活動がありません。" />
            ) : (
              events.map((event) => (
                <button
                  className={`role-list-item ${selectedEventId === event.id ? "active" : ""}`}
                  key={event.id}
                  type="button"
                  onClick={() => setSelectedEventId(event.id)}
                >
                  <span>
                    <strong>{event.title}</strong>
                    <small>
                      {event.startAtLabel} · {event.location}
                    </small>
                  </span>
                  <em className={`status-label ${event.status}`}>
                    {event.status === "published"
                      ? "公開中"
                      : event.status === "pending_review"
                        ? "審査中"
                        : "修正依頼"}
                  </em>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
      {selectedEventId && (
        <section className="role-card applicant-card">
          <div className="role-card-head">
            <div>
              <p className="eyebrow">APPLICANTS</p>
              <h2>参加者を確認</h2>
            </div>
            <div className="row-actions">
              {events.find((event) => event.id === selectedEventId)?.status ===
                "revision_required" && (
                <button
                  type="button"
                  onClick={() => {
                    const event = events.find(
                      (item) => item.id === selectedEventId,
                    );
                    if (event) beginEditEvent(event);
                  }}
                >
                  編集する
                </button>
              )}
              <UsersRound size={20} />
            </div>
          </div>
          {applications.length === 0 ? (
            <EmptyRoleState text="この活動にはまだ参加申請がありません。" />
          ) : (
            <div className="applicant-list">
              {applications.map((application) => (
                <div className="applicant-row" key={application.id}>
                  <div>
                    <strong>{application.studentName}</strong>
                    <small>参加申請 · {application.status}</small>
                  </div>
                  <div className="row-actions">
                    {application.status === "pending" && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void updateApplicationStatus(
                              application,
                              "confirmed",
                            )
                          }
                        >
                          承認
                        </button>
                        <button
                          className="muted"
                          type="button"
                          onClick={() =>
                            void updateApplicationStatus(
                              application,
                              "rejected",
                            )
                          }
                        >
                          見送り
                        </button>
                      </>
                    )}
                    {application.status === "confirmed" && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void updateApplicationStatus(
                              application,
                              "attended",
                            )
                          }
                        >
                          出席にする
                        </button>
                        <button
                          className="muted"
                          type="button"
                          onClick={() =>
                            void updateApplicationStatus(application, "absent")
                          }
                        >
                          欠席にする
                        </button>
                      </>
                    )}
                    {application.status === "attended" && <em>活動実績済み</em>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <MessagesTab
        rooms={chatRooms}
        activeRoomId={activeRoomId}
        messages={chatMessages}
        draft={messageDraft}
        onSelectRoom={setActiveRoomId}
        onDraftChange={setMessageDraft}
        onSend={() => void sendOrganizationMessage()}
        currentUserId={appUser.uid}
        currentUserRole="organization"
      />
    </RoleShell>
  );
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [pendingEvents, setPendingEvents] = useState<AizuEvent[]>([]);
  const [pendingUsers, setPendingUsers] = useState<AppUser[]>([]);
  const [pendingReports, setPendingReports] = useState<ReportRecord[]>([]);
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadReviewQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const [eventSnapshot, reportSnapshot, userSnapshot] = await Promise.all([
        getDocs(
          query(
            collection(db, "events"),
            where("status", "==", "pending_review"),
            limit(50),
          ),
        ),
        getDocs(
          query(
            collection(db, "reports"),
            where("status", "==", "submitted"),
            limit(50),
          ),
        ),
        getDocs(
          query(
            collection(db, "users"),
            where("status", "in", ["pending_approval", "pending"]),
            limit(100),
          ),
        ),
      ]);
      setPendingEvents(
        eventSnapshot.docs.map((eventDoc) => ({
          id: eventDoc.id,
          ...eventDoc.data(),
        })) as AizuEvent[],
      );
      setPendingUsers(
        userSnapshot.docs
          .map((userDoc) => ({
            uid: userDoc.id,
            ...(userDoc.data() as Omit<AppUser, "uid">),
          }))
          .filter((user) => user.role !== "admin") as AppUser[],
      );
      setPendingReports(
        reportSnapshot.docs.map((reportDoc) => ({
          id: reportDoc.id,
          ...reportDoc.data(),
        })) as ReportRecord[],
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const eventUnsubscribe = onSnapshot(
      query(
        collection(db, "events"),
        where("status", "==", "pending_review"),
        limit(50),
      ),
      (snapshot) =>
        setPendingEvents(
          snapshot.docs.map((eventDoc) => ({
            id: eventDoc.id,
            ...eventDoc.data(),
          })) as AizuEvent[],
        ),
      () => setNotice("イベント審査キューを取得できませんでした。"),
    );
    const userUnsubscribe = onSnapshot(
      query(
        collection(db, "users"),
        where("status", "in", ["pending_approval", "pending"]),
        limit(100),
      ),
      (snapshot) =>
        setPendingUsers(
          snapshot.docs
            .map((userDoc) => ({
              uid: userDoc.id,
              ...(userDoc.data() as Omit<AppUser, "uid">),
            }))
            .filter((user) => user.role !== "admin") as AppUser[],
        ),
      () => setNotice("アカウント審査キューを取得できませんでした。"),
    );
    const reportUnsubscribe = onSnapshot(
      query(
        collection(db, "reports"),
        where("status", "==", "submitted"),
        limit(50),
      ),
      (snapshot) =>
        setPendingReports(
          snapshot.docs.map((reportDoc) => ({
            id: reportDoc.id,
            ...reportDoc.data(),
          })) as ReportRecord[],
        ),
      () => setNotice("通報キューを取得できませんでした。"),
    );
    return () => {
      eventUnsubscribe();
      userUnsubscribe();
      reportUnsubscribe();
    };
  }, []);

  const approveEvent = async (event: AizuEvent) => {
    try {
      await updateDoc(doc(db, "events", event.id), {
        status: "published",
        updatedAt: serverTimestamp(),
      });
      setPendingEvents((current) =>
        current.filter((item) => item.id !== event.id),
      );
      setNotice("イベントを公開しました。");
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error));
    }
  };

  const requestEventRevision = async (event: AizuEvent) => {
    try {
      await updateDoc(doc(db, "events", event.id), {
        status: "revision_required",
        updatedAt: serverTimestamp(),
      });
      setPendingEvents((current) =>
        current.filter((item) => item.id !== event.id),
      );
      setNotice("イベントを差し戻しました。主催者に修正を依頼してください。");
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error));
    }
  };

  const approveUser = async (user: AppUser) => {
    try {
      await updateDoc(doc(db, "users", user.uid), {
        status: "active",
        updatedAt: serverTimestamp(),
      });
      if (user.role === "organization")
        await updateDoc(doc(db, "organizations", user.uid), {
          status: "approved",
          updatedAt: serverTimestamp(),
        });
      setPendingUsers((current) =>
        current.filter((item) => item.uid !== user.uid),
      );
      setNotice("アカウントを承認しました。");
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error));
    }
  };

  const rejectUser = async (user: AppUser) => {
    try {
      await updateDoc(doc(db, "users", user.uid), {
        status: "rejected",
        updatedAt: serverTimestamp(),
      });
      if (user.role === "organization") {
        await updateDoc(doc(db, "organizations", user.uid), {
          status: "rejected",
          updatedAt: serverTimestamp(),
        });
      }
      setPendingUsers((current) =>
        current.filter((item) => item.uid !== user.uid),
      );
      setNotice("アカウントを見送りました。");
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error));
    }
  };

  const resolveReport = async (
    report: ReportRecord,
    status: "resolved" | "dismissed",
  ) => {
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status,
        resolution: status === "resolved" ? "reviewed" : "no_violation",
        resolvedAt: serverTimestamp(),
      });
      setPendingReports((current) =>
        current.filter((item) => item.id !== report.id),
      );
      setNotice(
        status === "resolved"
          ? "通報を対応済みにしました。"
          : "通報を棄却しました。",
      );
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error));
    }
  };

  return (
    <RoleShell
      title="Aizu Connect運営"
      subtitle="管理者コンソール"
      icon={<ShieldCheck size={19} />}
      onLogout={onLogout}
    >
      {notice && <div className="notice">{notice}</div>}
      <div className="role-metrics">
        <div>
          <strong>{pendingEvents.length}</strong>
          <span>イベント審査</span>
        </div>
        <div>
          <strong>{pendingUsers.length}</strong>
          <span>アカウント審査</span>
        </div>
        <div>
          <strong>{pendingReports.length}</strong>
          <span>通報対応</span>
        </div>
        <div>
          <strong>原則拒否</strong>
          <span>Security Rules</span>
        </div>
      </div>
      <div className="role-grid">
        <section className="role-card">
          <div className="role-card-head">
            <div>
              <p className="eyebrow">EVENT REVIEW</p>
              <h2>イベント審査</h2>
            </div>
            <CalendarDays size={20} />
          </div>
          <div className="role-list">
            {pendingEvents.length === 0 ? (
              <EmptyRoleState text="審査待ちのイベントはありません。" />
            ) : (
              pendingEvents.map((event) => (
                <div className="review-row" key={event.id}>
                  <div>
                    <strong>{event.title}</strong>
                    <small>
                      {event.organizationName} · {event.startAtLabel}
                    </small>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      onClick={() => void approveEvent(event)}
                    >
                      公開する
                    </button>
                    <button
                      className="muted"
                      type="button"
                      onClick={() => void requestEventRevision(event)}
                    >
                      差し戻す
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
        <section className="role-card">
          <div className="role-card-head">
            <div>
              <p className="eyebrow">ACCOUNT REVIEW</p>
              <h2>アカウント審査</h2>
            </div>
            <button
              className="icon-button"
              title="審査キューを更新"
              type="button"
              onClick={() =>
                void loadReviewQueue().catch((error) =>
                  setNotice(getFirebaseErrorMessage(error)),
                )
              }
              disabled={isLoading}
            >
              <RefreshCw size={17} className={isLoading ? "spin" : ""} />
            </button>
          </div>
          <div className="role-list">
            {pendingUsers.length === 0 ? (
              <EmptyRoleState text="審査待ちはありません。会津大学メールの学生は自動承認されます。" />
            ) : (
              pendingUsers.map((user) => (
                <div className="review-row" key={user.uid}>
                  <div>
                    <strong>{user.displayName}</strong>
                    <small>
                      {user.role === "organization" ? "主催者・団体" : "学生"} ·{" "}
                      {user.email}
                    </small>
                    <small>
                      {user.university} · {user.department} · {user.status}
                    </small>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      onClick={() => void approveUser(user)}
                    >
                      承認する
                    </button>
                    <button
                      className="muted"
                      type="button"
                      onClick={() => void rejectUser(user)}
                    >
                      見送る
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <section className="role-card admin-report-card">
        <div className="role-card-head">
          <div>
            <p className="eyebrow">SAFETY QUEUE</p>
            <h2>通報・安全確認</h2>
          </div>
          <Flag size={20} />
        </div>
        {pendingReports.length === 0 ? (
          <EmptyRoleState text="確認が必要な通報はありません。" />
        ) : (
          <div className="role-list">
            {pendingReports.map((report) => (
              <div className="review-row" key={report.id}>
                <div>
                  <strong>{report.targetTitle || "対象コンテンツ"}</strong>
                  <small>
                    {report.targetType === "event" ? "イベント" : "メッセージ"}{" "}
                    · {report.reason}
                  </small>
                  {report.description && <small>{report.description}</small>}
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    onClick={() => void resolveReport(report, "resolved")}
                  >
                    対応済み
                  </button>
                  <button
                    className="muted"
                    type="button"
                    onClick={() => void resolveReport(report, "dismissed")}
                  >
                    問題なし
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </RoleShell>
  );
}

function RoleShell({
  title,
  subtitle,
  icon,
  onLogout,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  onLogout: () => void;
  children: ReactNode;
}) {
  return (
    <main className="role-shell">
      <header className="role-header">
        <div className="brand-lockup">
          <span className="brand-mark">A</span>
          <span>
            <strong>Aizu Connect</strong>
            <small>{subtitle}</small>
          </span>
        </div>
        <div className="role-header-user">
          {icon}
          <strong>{title}</strong>
          <button
            className="icon-button"
            title="ログアウト"
            type="button"
            onClick={onLogout}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <div className="role-content">{children}</div>
    </main>
  );
}

function EmptyRoleState({ text }: { text: string }) {
  return (
    <div className="empty-role-state">
      <Compass size={22} />
      <span>{text}</span>
    </div>
  );
}

function NotificationPanel({
  notifications,
  onClose,
  onRead,
}: {
  notifications: NotificationItem[];
  onClose: () => void;
  onRead: (notification: NotificationItem) => Promise<void>;
}) {
  return (
    <aside className="notification-panel" aria-label="通知">
      <div className="notification-panel-head">
        <div>
          <p className="eyebrow">NOTIFICATIONS</p>
          <h2>通知</h2>
        </div>
        <button
          className="icon-button"
          title="通知を閉じる"
          type="button"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      {notifications.length === 0 ? (
        <EmptyRoleState text="新しい通知はありません。" />
      ) : (
        <div className="notification-list">
          {notifications.map((notification) => (
            <button
              className={`notification-item ${notification.isRead ? "" : "unread"}`}
              key={notification.id}
              type="button"
              onClick={() => void onRead(notification)}
            >
              <span className="notification-icon">
                <Bell size={15} />
              </span>
              <span>
                <strong>{notification.title}</strong>
                <small>{notification.body}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

function ReportDialog({
  target,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  target: ReportTarget;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (reason: string, description: string) => void;
}) {
  const [reason, setReason] = useState("不適切な内容");
  const [description, setDescription] = useState("");
  return createPortal(
    <div className="report-backdrop" role="presentation" onClick={onClose}>
      <form
        className="report-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(reason, description);
        }}
      >
        <div className="report-dialog-head">
          <div>
            <p className="eyebrow">SAFETY</p>
            <h2>通報する</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="閉じる"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <p className="report-target">対象：{target.title}</p>
        <Field label="理由">
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            <option>不適切な内容</option>
            <option>迷惑行為・スパム</option>
            <option>個人情報が含まれている</option>
            <option>詐欺・危険な勧誘</option>
            <option>その他</option>
          </select>
        </Field>
        <Field label="詳細（任意）">
          <textarea
            value={description}
            maxLength={1000}
            placeholder="気になった点を入力してください"
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="report-dialog-actions">
          <button className="text-button" type="button" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="primary-action"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Flag size={16} />
            )}
            通報を送信
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function LegalDialog({
  document,
  onClose,
}: {
  document: LegalDocument;
  onClose: () => void;
}) {
  const content = legalDocuments[document];

  return (
    <div className="legal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="legal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="legal-dialog-head">
          <div>
            <p className="eyebrow">{content.eyebrow}</p>
            <h2 id="legal-dialog-title">{content.title}</h2>
          </div>
          <button
            className="icon-button"
            title="閉じる"
            type="button"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="legal-dialog-body">
          {content.sections.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function DevStatus({
  appUser,
  firebaseUser,
  onSeed,
  isLoading,
}: {
  appUser: AppUser;
  firebaseUser: User;
  onSeed: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="dev-status">
      <span>
        <ShieldCheck size={14} /> 開発環境
      </span>
      <i /> Auth接続済み <i /> Firestore接続済み{" "}
      <button type="button" onClick={onSeed} disabled={isLoading}>
        <Plus size={14} /> サンプルを追加
      </button>
      <small>
        {firebaseUser.email} · {appUser.status}
      </small>
    </div>
  );
}

export default App;
