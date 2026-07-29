import {
  addDoc,
  collection,
  deleteDoc,
  documentId,
  doc,
  getDoc,
  getDocs,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getIdToken,
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
  CalendarPlus,
  CalendarDays,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
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
  Pin,
  Download,
  ExternalLink,
  FileText,
  Filter as FilterIcon,
  History,
  Link as LinkIcon,
  List,
  Map,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Field } from "./components/Field";
import { LegalDialog } from "./components/LegalDialog";
import {
  PRIVACY_VERSION,
  TERMS_VERSION,
  type LegalDocument,
} from "./content/legalDocuments";
import { useDialogAccessibility } from "./hooks/useDialogAccessibility";
import communityEventImage from "./assets/event-community.jpg";
import learningEventImage from "./assets/event-learning.jpg";
import volunteerEventImage from "./assets/event-volunteer.jpg";
import { auth, db, functions, storage } from "./lib/firebase";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  categories,
  formatEventStart,
  getFirebaseErrorMessage,
  isAizuUniversityEmail,
  isFutureEventStart,
  matchesCategoryFilter,
  normalizeLoginEmail,
  resolveAccountAccessGate,
  toCalendarFile,
  toDateTimeInput,
  toDateTimeLocalValue,
  validateChatAttachment,
  validateImageFile,
  type Filter,
} from "./lib/appLogic";

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
type SearchDateFilter = "すべて" | "今週" | "今月";
type SearchSort = "開催が近い順" | "人気順" | "新着順";
type SearchDayFilter = "すべて" | "平日" | "土日";
type SearchTimeFilter = "すべて" | "午前" | "午後" | "夜";
type SearchFeeFilter = "すべて" | "無料" | "有料";
type SearchFormatFilter = "すべて" | "現地" | "オンライン" | "ハイブリッド";
type SearchView = "list" | "calendar";

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
  profileImageUrl?: string;
  organizationId?: string;
  organizationName?: string;
  reviewReason?: string;
  moderationReason?: string;
  termsVersion?: string;
  privacyVersion?: string;
  legalAcceptedAt?: Timestamp;
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
  endAtLabel?: string;
  endAt?: Timestamp;
  feeType?: "無料" | "有料";
  feeAmount?: number;
  eventFormat?: "現地" | "オンライン" | "ハイブリッド";
  meetingPoint?: string;
  accessInfo?: string;
  bringItems?: string;
  cancellationPolicy?: string;
  weatherPolicy?: string;
  accessibility?: string;
  contactMethod?: string;
  organizationName: string;
  status:
    | "published"
    | "pending_review"
    | "revision_required"
    | "cancelled"
    | "unpublished";
  capacity: number;
  applicantCount: number;
  imageUrl: string;
  tags: string[];
  templateKey?: string;
  beginnerLevel?: "初参加歓迎" | "少し経験者向け" | "誰でも歓迎";
  takeaways?: string[];
  atmosphere?: string;
  organizerDescription?: string;
  organizerExperience?: string;
  revisionReason?: string;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  cancellationReason?: string;
  cancelledAt?: Timestamp;
  moderationReason?: string;
  organizationId?: string;
  organizationVerified?: boolean;
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type EventApplication = {
  id: string;
  eventId: string;
  eventTitle: string;
  studentId: string;
  studentName: string;
  studentProfileImageUrl?: string;
  organizationName: string;
  organizationId?: string;
  status:
    | "pending"
    | "waitlisted"
    | "confirmed"
    | "rejected"
    | "attended"
    | "absent"
    | "cancelled";
  participantMessage?: string;
  accessibilityNeeds?: string;
  emergencyContact?: string;
  consentAccepted?: boolean;
  organizerNote?: string;
  waitlistPosition?: number;
  createdAt?: Timestamp;
};

type ChatRoom = {
  id: string;
  roomType?: "application" | "event";
  applicationId: string;
  eventId: string;
  eventTitle: string;
  studentId: string;
  studentName?: string;
  organizationName: string;
  organizationId?: string;
  participantIds: string[];
  status: "active" | "read_only" | "closed";
  lastMessageText: string;
  lastMessageAt?: Timestamp;
  pinnedMessage?: string;
  organizerNotice?: string;
  updatedAt?: Timestamp;
};

type ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  type: "text" | "system" | "image" | "file";
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  createdAt?: Timestamp;
};

type ChatReadReceipt = {
  userId: string;
  readAt?: Timestamp;
};

type ChatPreference = {
  userId: string;
  roomId: string;
  muted: boolean;
  updatedAt?: Timestamp;
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
  resolution?: string;
  resolvedAt?: Timestamp;
  createdAt?: Timestamp;
};

type ActivityRecord = {
  id: string;
  userId: string;
  eventId: string;
  title: string;
  organizationName: string;
  certificateId?: string;
  participantRole?: string;
  takeaways?: string[];
  activityYear: number;
  activityMonth: number;
  verificationStatus: "verified" | "revoked";
  createdAt?: Timestamp;
};

type SavedSearch = {
  userId: string;
  searchText: string;
  category: Filter;
  dateFilter: SearchDateFilter;
  dayFilter: SearchDayFilter;
  timeFilter: SearchTimeFilter;
  feeFilter: SearchFeeFilter;
  formatFilter: SearchFormatFilter;
  onlyAvailable: boolean;
  onlyBeginner: boolean;
  updatedAt?: Timestamp;
};

type PublicOrganizerProfile = {
  userId: string;
  displayName: string;
  description: string;
  experience: string;
  publishedEventCount: number;
  verified: boolean;
  updatedAt?: Timestamp;
};

type AuditLog = {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: "event" | "user" | "report";
  targetId: string;
  targetTitle: string;
  reason: string;
  createdAt?: Timestamp;
};

type AccountDeletionRequest = {
  userId: string;
  status: "submitted" | "cancelled";
  reason: string;
  requestedAt?: Timestamp;
  updatedAt?: Timestamp;
};

type ApplicationDetails = {
  participantMessage: string;
  accessibilityNeeds: string;
  emergencyContact: string;
  consentAccepted: boolean;
};

const eventTemplates = [
  {
    key: "交流会",
    label: "交流会",
    category: "交流・コミュニティ",
    title: "学生と地域の交流会",
    summary:
      "初めての人も入りやすい少人数の交流会です。会津で活動する人と話しながら、次の一歩を見つけます。",
    takeaways: [
      "地域の人とつながる",
      "話すきっかけを作る",
      "次に参加したい活動を見つける",
    ],
    beginnerLevel: "初参加歓迎" as const,
    imageUrl: communityEventImage,
  },
  {
    key: "勉強会",
    label: "勉強会",
    category: "学び・制作",
    title: "はじめての学び合い会",
    summary:
      "テーマに興味がある人が集まり、短いインプットと作業時間で学びを形にするイベントです。",
    takeaways: [
      "新しいテーマを学ぶ",
      "小さな成果物を作る",
      "一緒に学ぶ仲間を見つける",
    ],
    beginnerLevel: "誰でも歓迎" as const,
    imageUrl: learningEventImage,
  },
  {
    key: "ボランティア",
    label: "地域ボランティア",
    category: "ボランティア",
    title: "地域を手伝うボランティア",
    summary:
      "地域の現場でできることを一緒に手伝い、活動後に振り返りまで行うイベントです。",
    takeaways: ["地域課題を知る", "現場で動く経験を得る", "活動実績として残す"],
    beginnerLevel: "初参加歓迎" as const,
    imageUrl: volunteerEventImage,
  },
] as const;

const defaultTakeaways = [
  "地域とつながる",
  "新しい経験を得る",
  "活動実績として残す",
];

const csvEscape = (value: string | number | undefined | null) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

const timestampMillis = (value?: Timestamp) => value?.toMillis?.() ?? 0;

const formatChatTime = (value?: Timestamp) =>
  value
    ? new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(value.toDate())
    : "";

const formatChatDay = (value?: Timestamp) =>
  value
    ? new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(value.toDate())
    : "";

const downloadEventCalendar = (event: AizuEvent) => {
  const startAt = event.startAt?.toDate();
  if (!startAt) return;
  const calendar = toCalendarFile({
    id: event.id,
    title: event.title,
    summary: event.summary,
    location: event.meetingPoint || event.location,
    startAt,
    endAt: event.endAt?.toDate(),
  });
  const url = URL.createObjectURL(
    new Blob([calendar], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title}.ics`;
  link.click();
  URL.revokeObjectURL(url);
};

const googleCalendarUrl = (event: AizuEvent) => {
  const startAt = event.startAt?.toDate();
  if (!startAt) return "";
  const endAt =
    event.endAt?.toDate() ?? new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
  const formatTimestamp = (value: Date) =>
    value
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatTimestamp(startAt)}/${formatTimestamp(endAt)}`,
    details: event.summary,
    location: event.meetingPoint || event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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

const uploadImage = async (file: File, path: string) => {
  const imageRef = ref(storage, path);
  const snapshot = await uploadBytes(imageRef, file, {
    contentType: file.type,
    cacheControl: "public,max-age=3600",
  });
  return getDownloadURL(snapshot.ref);
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
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false);
  const [events, setEvents] = useState<AizuEvent[]>([]);
  const [applications, setApplications] = useState<EventApplication[]>([]);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatMessageLimit, setChatMessageLimit] = useState(100);
  const [hasOlderChatMessages, setHasOlderChatMessages] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [filter, setFilter] = useState<Filter>("すべて");
  const [searchText, setSearchText] = useState("");
  const [searchDateFilter, setSearchDateFilter] =
    useState<SearchDateFilter>("すべて");
  const [searchSort, setSearchSort] = useState<SearchSort>("開催が近い順");
  const [searchDayFilter, setSearchDayFilter] =
    useState<SearchDayFilter>("すべて");
  const [searchTimeFilter, setSearchTimeFilter] =
    useState<SearchTimeFilter>("すべて");
  const [searchFeeFilter, setSearchFeeFilter] =
    useState<SearchFeeFilter>("すべて");
  const [searchFormatFilter, setSearchFormatFilter] =
    useState<SearchFormatFilter>("すべて");
  const [searchView, setSearchView] = useState<SearchView>("list");
  const [onlyAvailableEvents, setOnlyAvailableEvents] = useState(false);
  const [onlyBeginnerEvents, setOnlyBeginnerEvents] = useState(false);
  const [savedSearch, setSavedSearch] = useState<SavedSearch | null>(null);
  const [savedEventIds, setSavedEventIds] = useState<string[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [accountDeletionRequest, setAccountDeletionRequest] =
    useState<AccountDeletionRequest | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [applicationToCancel, setApplicationToCancel] =
    useState<EventApplication | null>(null);
  const [applicationEvent, setApplicationEvent] = useState<AizuEvent | null>(
    null,
  );
  const [chatReadReceipts, setChatReadReceipts] = useState<ChatReadReceipt[]>(
    [],
  );
  const [chatPreferences, setChatPreferences] = useState<ChatPreference[]>([]);
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(() => defaultNotificationPreferences(""));
  const [isCreatorDashboardOpen, setIsCreatorDashboardOpen] = useState(false);
  const authenticatedUidRef = useRef<string | null>(null);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId),
    [events, selectedEventId],
  );

  const upcomingEvents = useMemo(
    () => events.filter((event) => isFutureEventStart(event.startAt?.toDate())),
    [events],
  );

  useEffect(() => {
    if (!(["home", "search"] as Tab[]).includes(activeTab) && selectedEventId) {
      setSelectedEventId(null);
    }
  }, [activeTab, selectedEventId]);

  const filteredEvents = useMemo(() => {
    const normalized = searchText.trim().toLowerCase();
    const now = new Date();
    const weekLimit = new Date(now);
    weekLimit.setDate(now.getDate() + 7);
    const filtered = upcomingEvents.filter((event) => {
      const matchesFilter = matchesCategoryFilter(event.category, filter);
      const matchesSearch =
        !normalized ||
        [
          event.title,
          event.summary,
          event.location,
          event.organizationName,
          event.beginnerLevel ?? "",
          ...(event.takeaways ?? []),
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
        !onlyBeginnerEvents ||
        event.beginnerLevel === "初参加歓迎" ||
        event.tags.some((tag) => tag.includes("初心者"));
      const eventDay = eventDate?.getDay();
      const matchesDay =
        searchDayFilter === "すべて" ||
        eventDay === undefined ||
        (searchDayFilter === "土日"
          ? eventDay === 0 || eventDay === 6
          : eventDay >= 1 && eventDay <= 5);
      const eventHour = eventDate?.getHours();
      const matchesTime =
        searchTimeFilter === "すべて" ||
        eventHour === undefined ||
        (searchTimeFilter === "午前"
          ? eventHour < 12
          : searchTimeFilter === "午後"
            ? eventHour >= 12 && eventHour < 18
            : eventHour >= 18);
      const matchesFee =
        searchFeeFilter === "すべて" ||
        (event.feeType ?? "無料") === searchFeeFilter;
      const matchesFormat =
        searchFormatFilter === "すべて" ||
        (event.eventFormat ?? "現地") === searchFormatFilter;
      return (
        matchesFilter &&
        matchesSearch &&
        matchesDate &&
        matchesCapacity &&
        matchesBeginner &&
        matchesDay &&
        matchesTime &&
        matchesFee &&
        matchesFormat
      );
    });
    return filtered.sort((left, right) => {
      if (searchSort === "人気順") {
        return (
          Number(right.applicantCount ?? 0) - Number(left.applicantCount ?? 0)
        );
      }
      if (searchSort === "新着順") {
        return (
          timestampMillis(right.createdAt) - timestampMillis(left.createdAt)
        );
      }
      return timestampMillis(left.startAt) - timestampMillis(right.startAt);
    });
  }, [
    filter,
    onlyAvailableEvents,
    onlyBeginnerEvents,
    searchDayFilter,
    searchDateFilter,
    searchFeeFilter,
    searchFormatFilter,
    searchSort,
    searchText,
    searchTimeFilter,
    upcomingEvents,
  ]);

  const recommendedEvent = useMemo(() => {
    const interests = appUser?.interests ?? [];
    return [...upcomingEvents].sort((left, right) => {
      const score = (event: AizuEvent) => {
        const searchable = [
          event.category,
          event.title,
          ...event.tags,
          ...(event.takeaways ?? []),
        ].join(" ");
        const interestScore = interests.filter((interest) =>
          searchable.includes(interest),
        ).length;
        const daysUntil = Math.max(
          0,
          (timestampMillis(event.startAt) - Date.now()) / 86_400_000,
        );
        return interestScore * 100 - daysUntil;
      };
      return score(right) - score(left);
    })[0];
  }, [appUser?.interests, upcomingEvents]);

  const recommendationLabel = useMemo(() => {
    if (!recommendedEvent) return "開催日が近いイベント";
    const searchable = [
      recommendedEvent.category,
      recommendedEvent.title,
      ...recommendedEvent.tags,
    ].join(" ");
    if (appUser?.interests.some((interest) => searchable.includes(interest))) {
      return "興味に合うおすすめ";
    }
    const daysUntil =
      (timestampMillis(recommendedEvent.startAt) - Date.now()) / 86_400_000;
    return daysUntil <= 7 ? "7日以内に開催" : "開催日が近いイベント";
  }, [appUser?.interests, recommendedEvent]);

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActiveTab("search");
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

  const activityYear = new Date().getFullYear();
  const activityByMonth = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      count: 0,
    }));
    activities.forEach((activity) => {
      if (
        activity.verificationStatus !== "verified" ||
        activity.activityYear !== activityYear
      ) {
        return;
      }
      const month = Math.max(1, Math.min(12, activity.activityMonth));
      months[month - 1].count += 1;
    });
    return months;
  }, [activities, activityYear]);

  const unreadChatCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    notifications.forEach((notification) => {
      if (
        !notification.isRead &&
        notification.targetType === "chat" &&
        notification.targetId
      ) {
        counts[notification.targetId] =
          (counts[notification.targetId] ?? 0) + 1;
      }
    });
    return counts;
  }, [notifications]);
  const unreadChatTotal = Object.values(unreadChatCounts).reduce(
    (total, count) => total + count,
    0,
  );

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;
      if (authenticatedUidRef.current !== (user?.uid ?? null)) {
        authenticatedUidRef.current = user?.uid ?? null;
        setActiveTab("home");
        setSelectedEventId(null);
        setActiveRoomId(null);
        setMessageDraft("");
        setSearchText("");
        setFilter("すべて");
        setSearchDateFilter("すべて");
        setSearchDayFilter("すべて");
        setSearchTimeFilter("すべて");
        setSearchFeeFilter("すべて");
        setSearchFormatFilter("すべて");
        setSearchSort("開催が近い順");
        setSearchView("list");
        setOnlyAvailableEvents(false);
        setOnlyBeginnerEvents(false);
        setIsNotificationOpen(false);
        setIsCreatorDashboardOpen(false);
        setApplicationEvent(null);
        setApplicationToCancel(null);
        setReportTarget(null);
        setEvents([]);
        setApplications([]);
        setChatRooms([]);
        setChatMessages([]);
        setChatMessageLimit(100);
        setHasOlderChatMessages(false);
        setChatReadReceipts([]);
        setChatPreferences([]);
        setNotifications([]);
        setActivities([]);
        setSavedEventIds([]);
        setSavedSearch(null);
      }
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
          setMessage(
            `アカウント情報を読み込めませんでした。再ログインしてください。${getFirebaseErrorMessage(error)}`,
          );
          setIsAuthLoading(false);
          void signOut(auth);
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
      setChatPreferences([]);
      setChatReadReceipts([]);
      return;
    }
    void loadProductData(appUser.uid).catch((error) => {
      setMessage(getFirebaseErrorMessage(error));
    });
  }, [appUser]);

  useEffect(() => {
    if (!appUser || appUser.status !== "active" || appUser.role === "admin") {
      setAccountDeletionRequest(null);
      return;
    }
    return onSnapshot(
      doc(db, "accountDeletionRequests", appUser.uid),
      (snapshot) =>
        setAccountDeletionRequest(
          snapshot.exists()
            ? (snapshot.data() as AccountDeletionRequest)
            : null,
        ),
      (error) => setMessage(getFirebaseErrorMessage(error)),
    );
  }, [appUser]);

  const requestAccountDeletion = async (reason: string) => {
    if (!appUser) return;
    await setDoc(doc(db, "accountDeletionRequests", appUser.uid), {
      userId: appUser.uid,
      status: "submitted",
      reason: reason.trim().slice(0, 500),
      requestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const cancelAccountDeletion = async () => {
    if (!appUser) return;
    await updateDoc(doc(db, "accountDeletionRequests", appUser.uid), {
      status: "cancelled",
      updatedAt: serverTimestamp(),
    });
  };

  useEffect(() => {
    if (!appUser || appUser.status !== "active" || appUser.role !== "student") {
      return;
    }
    const applicationsQuery = query(
      collection(db, "eventApplications"),
      where("studentId", "==", appUser.uid),
      limit(100),
    );
    return onSnapshot(
      applicationsQuery,
      (snapshot) =>
        setApplications(
          snapshot.docs.map((applicationDoc) => ({
            id: applicationDoc.id,
            ...applicationDoc.data(),
          })) as EventApplication[],
        ),
      (error) => setMessage(getFirebaseErrorMessage(error)),
    );
  }, [appUser]);

  const loadProductData = async (uid: string) => {
    const eventSnapshot = await getDocs(
      query(
        collection(db, "events"),
        where("status", "==", "published"),
        where("startAt", ">=", Timestamp.now()),
        orderBy("startAt", "asc"),
        limit(50),
      ),
    );
    const loadedEvents = eventSnapshot.docs.map((eventDoc) => ({
      id: eventDoc.id,
      ...eventDoc.data(),
    })) as AizuEvent[];
    setEvents(loadedEvents);
    setSelectedEventId((current) =>
      current && loadedEvents.some((event) => event.id === current)
        ? current
        : null,
    );

    const applicationSnapshot = await getDocs(
      query(
        collection(db, "eventApplications"),
        where("studentId", "==", uid),
        limit(100),
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
        limit(100),
      ),
    );
    const rooms = roomSnapshot.docs.map((roomDoc) => ({
      id: roomDoc.id,
      ...roomDoc.data(),
    })) as ChatRoom[];
    setChatRooms(rooms);
    setActiveRoomId((current) => current ?? rooms[0]?.id ?? null);

    const chatPreferenceSnapshot = await getDocs(
      query(
        collection(db, "chatPreferences"),
        where("userId", "==", uid),
        limit(100),
      ),
    );
    setChatPreferences(
      chatPreferenceSnapshot.docs.map((preferenceDoc) => ({
        ...(preferenceDoc.data() as ChatPreference),
      })),
    );

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

    const savedSearchSnapshot = await getDoc(
      doc(db, "savedSearches", `${uid}_default`),
    );
    setSavedSearch(
      savedSearchSnapshot.exists()
        ? (savedSearchSnapshot.data() as SavedSearch)
        : null,
    );
  };

  useEffect(() => {
    if (!activeRoomId) {
      setChatMessages([]);
      setHasOlderChatMessages(false);
      return;
    }
    const messagesQuery = query(
      collection(db, "chatRooms", activeRoomId, "messages"),
      orderBy("createdAt", "asc"),
      limitToLast(chatMessageLimit),
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
        setHasOlderChatMessages(snapshot.size === chatMessageLimit);
      },
      (error) => {
        setMessage(getFirebaseErrorMessage(error));
      },
    );
  }, [activeRoomId, chatMessageLimit]);

  useEffect(() => {
    if (!activeRoomId || !appUser) {
      setChatReadReceipts([]);
      return;
    }
    void setDoc(
      doc(db, "chatRooms", activeRoomId, "reads", appUser.uid),
      {
        userId: appUser.uid,
        readAt: serverTimestamp(),
      },
      { merge: true },
    ).catch((error: unknown) => setMessage(getFirebaseErrorMessage(error)));
    return onSnapshot(
      collection(db, "chatRooms", activeRoomId, "reads"),
      (snapshot) =>
        setChatReadReceipts(
          snapshot.docs.map((receiptDoc) => ({
            ...(receiptDoc.data() as ChatReadReceipt),
          })),
        ),
      (error) => setMessage(getFirebaseErrorMessage(error)),
    );
  }, [activeRoomId, appUser]);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const devAdminEmail = import.meta.env.DEV
      ? (import.meta.env.VITE_DEV_ADMIN_EMAIL ?? "").trim().toLowerCase()
      : "";
    const devAdminPassword = import.meta.env.DEV
      ? (import.meta.env.VITE_DEV_ADMIN_PASSWORD ?? "")
      : "";
    const normalizedEmail =
      authMode === "login"
        ? normalizeLoginEmail(email, devAdminEmail)
        : email.trim().toLowerCase();
    const normalizedPassword =
      devAdminEmail && normalizedEmail === devAdminEmail && password === "admin"
        ? devAdminPassword
        : password;
    if (!normalizedEmail || !password) {
      setMessage("メールアドレスとパスワードを入力してください。");
      return;
    }
    if (authMode === "register") {
      if (!hasAcceptedLegal) {
        setMessage(
          "利用規約とプライバシーポリシーを確認し、同意してください。",
        );
        return;
      }
      if (password.length < 10) {
        setMessage("パスワードは10文字以上にしてください。");
        return;
      }
      if (accountType === "student" && !displayName.trim()) {
        setMessage("表示名を入力してください。");
        return;
      }
      if (accountType === "organization" && !organizationName.trim()) {
        setMessage("団体・自治体名を入力してください。");
        return;
      }
    }
    setIsActionLoading(true);
    let createdUser: User | null = null;
    try {
      if (authMode === "login") {
        await signInWithEmailAndPassword(
          auth,
          normalizedEmail,
          normalizedPassword,
        );
        setMessage("");
        return;
      }
      const credential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password,
      );
      createdUser = credential.user;
      const interests = interestText
        .split(",")
        .map((interest) => interest.trim())
        .filter(Boolean)
        .slice(0, 5);
      const normalizedCurrentActivities = currentActivities
        .trim()
        .slice(0, 240);
      const normalizedWantToTry = wantToTry.trim().slice(0, 240);
      const isStudent = accountType === "student";
      const isAizuStudent = isStudent && isAizuUniversityEmail(normalizedEmail);
      const status: AccountStatus = isAizuStudent
        ? "active"
        : "pending_approval";
      const normalizedOrganizationName = organizationName.trim().slice(0, 100);
      const normalizedDisplayName = isStudent
        ? displayName.trim().slice(0, 80)
        : normalizedOrganizationName.slice(0, 80);
      const userData: AppUser = {
        uid: credential.user.uid,
        role: accountType,
        status,
        email: credential.user.email,
        displayName: normalizedDisplayName,
        university: isStudent
          ? isAizuStudent
            ? "会津大学"
            : "承認待ち大学"
          : "主催者・団体",
        department: isStudent ? department.trim().slice(0, 80) : "",
        grade: isStudent ? grade : 0,
        interests: isStudent ? interests : [],
        ...(isStudent
          ? {
              currentActivities: normalizedCurrentActivities,
              wantToTry: normalizedWantToTry,
            }
          : {
              organizationId: credential.user.uid,
              organizationName: normalizedOrganizationName,
            }),
      };
      const batch = writeBatch(db);
      batch.set(doc(db, "users", credential.user.uid), {
        ...userData,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        legalAcceptedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (isStudent) {
        batch.set(doc(db, "studentProfiles", credential.user.uid), {
          ...userData,
          verificationMethod: isAizuStudent
            ? "university_email"
            : "manual_review",
          profileCompletionRate: 80,
          activityCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(doc(db, "organizations", credential.user.uid), {
          id: credential.user.uid,
          displayName: normalizedOrganizationName,
          description: "",
          contactEmail: normalizedEmail,
          status: "pending_approval",
          createdBy: credential.user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      let registrationMessage =
        status === "active"
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
      if (createdUser) {
        await deleteUser(createdUser).catch(async () => {
          await signOut(auth).catch(() => undefined);
        });
      }
      setMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsActionLoading(false);
    }
  };

  const applyToEvent = async (
    eventToApply: AizuEvent,
    details: ApplicationDetails,
  ) => {
    if (!appUser) return;
    if (!eventToApply.createdBy) {
      setMessage(
        "この活動は現在申請できません。公開済みの活動を選択してください。",
      );
      return;
    }
    setIsActionLoading(true);
    setMessage("");
    try {
      const submitApplication = httpsCallable<
        { eventId: string } & ApplicationDetails,
        { applicationId: string; status: "pending" | "waitlisted" }
      >(functions, "submitApplication");
      const result = await submitApplication({
        eventId: eventToApply.id,
        ...details,
      });
      const applicationId = result.data.applicationId;
      const applicationStatus = result.data.status;
      await loadProductData(appUser.uid);
      setActiveRoomId(applicationId);
      setActiveTab(
        applicationStatus === "waitlisted" ? "activity" : "messages",
      );
      setMessage(
        applicationStatus === "waitlisted"
          ? "キャンセル待ちに登録しました。空きが出たら通知します。"
          : "参加申請を送信しました。主催者からの連絡を待ちましょう。",
      );
    } catch (error) {
      setMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsActionLoading(false);
    }
  };

  const uploadChatAttachment = async (file: File) => {
    if (!appUser || !activeRoomId) return;
    validateChatAttachment(file);
    const attachmentUrl = await uploadImage(
      file,
      `chat-attachments/${activeRoomId}/${appUser.uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
    );
    const messageType = file.type.startsWith("image/") ? "image" : "file";
    const roomRef = doc(db, "chatRooms", activeRoomId);
    const messageRef = doc(collection(roomRef, "messages"));
    const batch = writeBatch(db);
    batch.set(messageRef, {
      roomId: activeRoomId,
      senderId: appUser.uid,
      senderName: appUser.displayName,
      type: messageType,
      text: file.name.slice(0, 200),
      attachmentUrl,
      attachmentName: file.name.slice(0, 200),
      attachmentType: file.type,
      attachmentSize: file.size,
      createdAt: serverTimestamp(),
    });
    batch.update(roomRef, {
      lastMessageText: `${messageType === "image" ? "画像" : "ファイル"}を送信しました`,
      lastMessageAt: serverTimestamp(),
    });
    await batch.commit();
  };

  const sendMessage = async () => {
    if (!appUser || !activeRoomId || !messageDraft.trim()) return;
    const text = messageDraft.trim().slice(0, 2000);
    setMessageDraft("");
    try {
      const roomRef = doc(db, "chatRooms", activeRoomId);
      const messageRef = doc(collection(roomRef, "messages"));
      const batch = writeBatch(db);
      batch.set(messageRef, {
        roomId: activeRoomId,
        senderId: appUser.uid,
        senderName: appUser.displayName,
        type: "text",
        text,
        createdAt: serverTimestamp(),
      });
      batch.update(roomRef, {
        lastMessageText: text,
        lastMessageAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      setMessageDraft((current) => current || text);
      setMessage(getFirebaseErrorMessage(error));
    }
  };

  const selectChatRoom = (roomId: string) => {
    if (roomId !== activeRoomId) {
      setChatMessageLimit(100);
    }
    setActiveRoomId(roomId);
    const unread = notifications.filter(
      (notification) =>
        !notification.isRead &&
        notification.targetType === "chat" &&
        notification.targetId === roomId,
    );
    if (unread.length === 0) return;
    setNotifications((current) =>
      current.map((notification) =>
        unread.some((item) => item.id === notification.id)
          ? { ...notification, isRead: true }
          : notification,
      ),
    );
    void Promise.all(
      unread.map((notification) =>
        updateDoc(doc(db, "notifications", notification.id), {
          isRead: true,
          readAt: serverTimestamp(),
        }),
      ),
    ).catch((error: unknown) => setMessage(getFirebaseErrorMessage(error)));
  };

  const toggleChatMute = async (roomId: string) => {
    if (!appUser) return;
    const current = chatPreferences.find(
      (preference) => preference.roomId === roomId,
    );
    const next: ChatPreference = {
      userId: appUser.uid,
      roomId,
      muted: !current?.muted,
    };
    setChatPreferences((preferences) => [
      ...preferences.filter((preference) => preference.roomId !== roomId),
      next,
    ]);
    try {
      await setDoc(
        doc(db, "chatPreferences", `${roomId}_${appUser.uid}`),
        { ...next, updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch (error) {
      setChatPreferences((preferences) => [
        ...preferences.filter((preference) => preference.roomId !== roomId),
        ...(current ? [current] : []),
      ]);
      setMessage(getFirebaseErrorMessage(error));
    }
  };

  const cancelApplication = async (application: EventApplication) => {
    if (
      !appUser ||
      !["pending", "waitlisted", "confirmed"].includes(application.status)
    ) {
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

  const checkInApplication = async (
    application: EventApplication,
    code: string,
  ) => {
    if (!appUser) return;
    const checkIn = httpsCallable<
      { eventId: string; code: string },
      { status: "attended" }
    >(functions, "checkInToEvent");
    await checkIn({ eventId: application.eventId, code });
    await loadProductData(appUser.uid);
    setMessage("受付が完了しました。活動実績へ反映します。");
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

  const handleLogout = async () => {
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setDisplayName("");
    setDepartment("");
    setInterestText("");
    setCurrentActivities("");
    setWantToTry("");
    setOrganizationName("");
    setMessage("");
    setIsNotificationOpen(false);
    setSelectedEventId(null);
    setActiveRoomId(null);
    setIsCreatorDashboardOpen(false);
    setApplicationToCancel(null);
    setApplicationEvent(null);
    setReportTarget(null);
    setAuthMode("login");
    setActiveTab("home");
    setSearchText("");
    setFilter("すべて");
    setSearchDateFilter("すべて");
    setSearchDayFilter("すべて");
    setSearchTimeFilter("すべて");
    setSearchFeeFilter("すべて");
    setSearchFormatFilter("すべて");
    setSearchSort("開催が近い順");
    setSearchView("list");
    setOnlyAvailableEvents(false);
    setOnlyBeginnerEvents(false);
    setMessageDraft("");
    await signOut(auth);
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
          hasAcceptedLegal,
          setHasAcceptedLegal,
          isActionLoading,
          message,
          handleAuthSubmit,
        }}
      />
    );
  const accountAccessGate = resolveAccountAccessGate({
    isProduction: import.meta.env.PROD,
    emailVerified: firebaseUser.emailVerified,
    status: appUser.status,
  });
  if (accountAccessGate === "email_verification")
    return (
      <VerifyEmailScreen
        firebaseUser={firebaseUser}
        onVerified={async () => {
          await reload(firebaseUser);
          if (firebaseUser.emailVerified) {
            await getIdToken(firebaseUser, true);
          }
          setFirebaseUser(auth.currentUser);
        }}
        onLogout={() => void handleLogout()}
      />
    );
  if (accountAccessGate === "account_rejected")
    return (
      <AccountRejectedScreen
        appUser={appUser}
        onLogout={() => void handleLogout()}
      />
    );
  if (accountAccessGate === "admin_approval")
    return (
      <AdminApprovalPendingScreen
        appUser={appUser}
        onLogout={() => void handleLogout()}
      />
    );
  if (accountAccessGate === "account_setup")
    return (
      <AccountSetupScreen
        appUser={appUser}
        onLogout={() => void handleLogout()}
      />
    );
  if (appUser.role === "organization") {
    return (
      <OrganizationDashboard
        appUser={appUser}
        accountDeletionRequest={accountDeletionRequest}
        onRequestAccountDeletion={requestAccountDeletion}
        onCancelAccountDeletion={cancelAccountDeletion}
        onLogout={() => void handleLogout()}
      />
    );
  }
  if (appUser.role === "admin") {
    return <AdminDashboard onLogout={() => void handleLogout()} />;
  }
  if (isCreatorDashboardOpen) {
    return (
      <OrganizationDashboard
        appUser={appUser}
        accountDeletionRequest={accountDeletionRequest}
        onRequestAccountDeletion={requestAccountDeletion}
        onCancelAccountDeletion={cancelAccountDeletion}
        onClose={() => setIsCreatorDashboardOpen(false)}
        onLogout={() => void handleLogout()}
      />
    );
  }

  const hasApplied = (eventId: string) =>
    applications.some((application) => application.eventId === eventId);
  const saveCurrentSearch = async () => {
    const nextSearch: SavedSearch = {
      userId: appUser.uid,
      searchText,
      category: filter,
      dateFilter: searchDateFilter,
      dayFilter: searchDayFilter,
      timeFilter: searchTimeFilter,
      feeFilter: searchFeeFilter,
      formatFilter: searchFormatFilter,
      onlyAvailable: onlyAvailableEvents,
      onlyBeginner: onlyBeginnerEvents,
    };
    await setDoc(
      doc(db, "savedSearches", `${appUser.uid}_default`),
      { ...nextSearch, updatedAt: serverTimestamp() },
      { merge: true },
    );
    setSavedSearch(nextSearch);
    setMessage("検索条件を保存しました。条件に合う新着イベントを通知します。");
  };
  const applySavedSearch = () => {
    if (!savedSearch) return;
    setSearchText(savedSearch.searchText);
    setFilter(savedSearch.category);
    setSearchDateFilter(savedSearch.dateFilter);
    setSearchDayFilter(savedSearch.dayFilter);
    setSearchTimeFilter(savedSearch.timeFilter);
    setSearchFeeFilter(savedSearch.feeFilter);
    setSearchFormatFilter(savedSearch.formatFilter);
    setOnlyAvailableEvents(savedSearch.onlyAvailable);
    setOnlyBeginnerEvents(savedSearch.onlyBeginner);
  };
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
              className="creator-entry-button"
              type="button"
              onClick={() => setIsCreatorDashboardOpen(true)}
            >
              <Plus size={16} />
              企画
            </button>
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
        <div className="welcome-row">
          <div>
            <p className="eyebrow">WELCOME BACK</p>
            <h1>
              こんにちは、
              <wbr />
              <span className="welcome-name">{appUser.displayName}さん</span>
            </h1>
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
          <div className="notice" role="status" aria-live="polite">
            <CheckCircle2 size={18} /> {message}
            <button
              type="button"
              onClick={() => setMessage("")}
              aria-label="お知らせを閉じる"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {activeTab === "home" && (
          <HomeTab
            {...{
              events: upcomingEvents,
              recommendedEvent,
              recommendationLabel,
              applications,
              savedEventIds,
              selectedEvent,
              selectedEventId,
              setSelectedEventId,
              toggleSaved,
              hasApplied,
              requestApplication: setApplicationEvent,
              isActionLoading,
              setActiveTab,
              setFilter,
              onReport: (event) => {
                setSelectedEventId(null);
                setReportTarget({
                  targetType: "event",
                  targetId: event.id,
                  title: event.title,
                });
              },
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
              requestApplication: setApplicationEvent,
              isActionLoading,
              searchDateFilter,
              setSearchDateFilter,
              searchSort,
              setSearchSort,
              searchDayFilter,
              setSearchDayFilter,
              searchTimeFilter,
              setSearchTimeFilter,
              searchFeeFilter,
              setSearchFeeFilter,
              searchFormatFilter,
              setSearchFormatFilter,
              searchView,
              setSearchView,
              savedSearch,
              onSaveSearch: () =>
                void saveCurrentSearch().catch((error) =>
                  setMessage(getFirebaseErrorMessage(error)),
                ),
              onApplySavedSearch: applySavedSearch,
              onlyAvailableEvents,
              setOnlyAvailableEvents,
              onlyBeginnerEvents,
              setOnlyBeginnerEvents,
              onResetFilters: () => {
                setSearchText("");
                setFilter("すべて");
                setSearchDateFilter("すべて");
                setSearchDayFilter("すべて");
                setSearchTimeFilter("すべて");
                setSearchFeeFilter("すべて");
                setSearchFormatFilter("すべて");
                setOnlyAvailableEvents(false);
                setOnlyBeginnerEvents(false);
              },
              onReport: (event) => {
                setSelectedEventId(null);
                setReportTarget({
                  targetType: "event",
                  targetId: event.id,
                  title: event.title,
                });
              },
            }}
          />
        )}
        {activeTab === "activity" && (
          <ActivityTab
            {...{
              applications,
              activities,
              userName: appUser.displayName,
              activityYear,
              activityByMonth,
              events,
              setSelectedEventId,
              setActiveTab,
              onOpenMessages: (eventId: string) => {
                const room =
                  chatRooms.find(
                    (item) =>
                      item.eventId === eventId && item.roomType !== "event",
                  ) ?? chatRooms.find((item) => item.eventId === eventId);
                if (room) selectChatRoom(room.id);
                setActiveTab("messages");
              },
              onCancelApplication: setApplicationToCancel,
              onCheckIn: (application: EventApplication, code: string) =>
                checkInApplication(application, code),
            }}
          />
        )}
        {activeTab === "messages" && (
          <MessagesTab
            rooms={chatRooms}
            activeRoomId={activeRoomId}
            messages={chatMessages}
            hasOlderMessages={hasOlderChatMessages}
            onLoadOlder={() => setChatMessageLimit((current) => current + 100)}
            draft={messageDraft}
            unreadCounts={unreadChatCounts}
            readReceipts={chatReadReceipts}
            mutedRoomIds={chatPreferences
              .filter((preference) => preference.muted)
              .map((preference) => preference.roomId)}
            onSelectRoom={selectChatRoom}
            onToggleMute={(roomId) => void toggleChatMute(roomId)}
            onDraftChange={setMessageDraft}
            onSend={() => void sendMessage()}
            onUploadAttachment={async (file) => {
              try {
                await uploadChatAttachment(file);
              } catch (error) {
                setMessage(getFirebaseErrorMessage(error));
              }
            }}
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
            onOpenEvent={(eventId) => {
              setSelectedEventId(eventId);
              setActiveTab("search");
            }}
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
            accountDeletionRequest={accountDeletionRequest}
            onRequestAccountDeletion={requestAccountDeletion}
            onCancelAccountDeletion={cancelAccountDeletion}
            onSaveProfile={async (updates) => {
              const { profileImageFile, ...profileUpdates } = updates;
              let profileImageUrl = appUser.profileImageUrl;
              if (profileImageFile) {
                validateImageFile(profileImageFile, "プロフィール画像");
                profileImageUrl = await uploadImage(
                  profileImageFile,
                  `profile-images/${appUser.uid}/profile-${Date.now()}`,
                );
              }
              const persistedUpdates = {
                ...profileUpdates,
                ...(profileImageUrl ? { profileImageUrl } : {}),
              };
              await updateDoc(doc(db, "users", appUser.uid), {
                ...persistedUpdates,
                updatedAt: serverTimestamp(),
              });
              await setDoc(
                doc(db, "studentProfiles", appUser.uid),
                {
                  ...persistedUpdates,
                  updatedAt: serverTimestamp(),
                },
                { merge: true },
              );
              setAppUser((current) =>
                current ? { ...current, ...persistedUpdates } : current,
              );
            }}
            onSaveNotificationPreferences={async (updates) => {
              const previousPreferences = notificationPreferences;
              const nextPreferences = {
                ...notificationPreferences,
                ...updates,
                userId: appUser.uid,
              };
              setNotificationPreferences(nextPreferences);
              try {
                await setDoc(
                  doc(db, "notificationPreferences", appUser.uid),
                  { ...nextPreferences, updatedAt: serverTimestamp() },
                  { merge: true },
                );
              } catch (error) {
                setNotificationPreferences(previousPreferences);
                throw error;
              }
            }}
            onOpenActivity={() => setActiveTab("activity")}
            onOpenCreatorDashboard={() => setIsCreatorDashboardOpen(true)}
            onOpenSavedEvent={(eventId) => {
              setSelectedEventId(eventId);
              setActiveTab("search");
            }}
            onLogout={() => void handleLogout()}
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
          onClick={() => setActiveTab("activity")}
        />
        <TabButton
          active={activeTab === "messages"}
          icon={<MessageSquareText size={19} />}
          label="メッセージ"
          badge={unreadChatTotal || undefined}
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
      {applicationEvent && (
        <ApplicationDialog
          event={applicationEvent}
          isSubmitting={isActionLoading}
          onClose={() => setApplicationEvent(null)}
          onSubmit={(details) => {
            const eventToApply = applicationEvent;
            setApplicationEvent(null);
            void applyToEvent(eventToApply, details);
          }}
        />
      )}
      {applicationToCancel && (
        <ConfirmDialog
          title="参加申請をキャンセルしますか？"
          description={`「${applicationToCancel.eventTitle}」の申請を取り消します。取り消した申請は元に戻せません。`}
          confirmLabel="申請を取り消す"
          danger
          onClose={() => setApplicationToCancel(null)}
          onConfirm={() => {
            const application = applicationToCancel;
            setApplicationToCancel(null);
            void cancelApplication(application);
          }}
        />
      )}
    </div>
  );
}

function HomeTab(props: {
  events: AizuEvent[];
  recommendedEvent?: AizuEvent;
  recommendationLabel: string;
  applications: EventApplication[];
  savedEventIds: string[];
  selectedEvent?: AizuEvent;
  selectedEventId: string | null;
  setSelectedEventId: (id: string) => void;
  toggleSaved: (id: string) => void;
  hasApplied: (id: string) => boolean;
  requestApplication: (event: AizuEvent) => void;
  isActionLoading: boolean;
  setActiveTab: (tab: Tab) => void;
  setFilter: (value: Filter) => void;
  onReport: (event: AizuEvent) => void;
}) {
  const {
    events,
    recommendedEvent,
    recommendationLabel,
    applications,
    savedEventIds,
    selectedEventId,
    setSelectedEventId,
    toggleSaved,
    hasApplied,
    requestApplication,
    isActionLoading,
    setActiveTab,
    setFilter,
  } = props;
  return (
    <section className="tab-page">
      <button
        className="search-launch"
        type="button"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setActiveTab("search")}
      >
        <Search size={18} />
        <span>イベント・活動・地域を探す</span>
        <kbd>⌘ K</kbd>
      </button>
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
            {recommendedEvent && (
              <FeaturedEvent
                event={recommendedEvent}
                label={recommendationLabel}
                saved={savedEventIds.includes(recommendedEvent.id)}
                onSave={() => toggleSaved(recommendedEvent.id)}
                onOpen={() => setSelectedEventId(recommendedEvent.id)}
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
              {events.slice(0, 4).map((event) => (
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
              onApply={() => requestApplication(props.selectedEvent!)}
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
  requestApplication: (event: AizuEvent) => void;
  isActionLoading: boolean;
  searchDateFilter: SearchDateFilter;
  setSearchDateFilter: (value: SearchDateFilter) => void;
  searchSort: SearchSort;
  setSearchSort: (value: SearchSort) => void;
  searchDayFilter: SearchDayFilter;
  setSearchDayFilter: (value: SearchDayFilter) => void;
  searchTimeFilter: SearchTimeFilter;
  setSearchTimeFilter: (value: SearchTimeFilter) => void;
  searchFeeFilter: SearchFeeFilter;
  setSearchFeeFilter: (value: SearchFeeFilter) => void;
  searchFormatFilter: SearchFormatFilter;
  setSearchFormatFilter: (value: SearchFormatFilter) => void;
  searchView: SearchView;
  setSearchView: (value: SearchView) => void;
  savedSearch: SavedSearch | null;
  onSaveSearch: () => void;
  onApplySavedSearch: () => void;
  onlyAvailableEvents: boolean;
  setOnlyAvailableEvents: (value: boolean) => void;
  onlyBeginnerEvents: boolean;
  setOnlyBeginnerEvents: (value: boolean) => void;
  onResetFilters: () => void;
  onReport: (event: AizuEvent) => void;
}) {
  const calendarGroups = props.filteredEvents.reduce<
    Record<string, AizuEvent[]>
  >((groups, event) => {
    const date = event.startAt?.toDate();
    const key = date
      ? new Intl.DateTimeFormat("ja-JP", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "short",
        }).format(date)
      : "日時未定";
    groups[key] = [...(groups[key] ?? []), event];
    return groups;
  }, {});
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
          aria-label="イベントを検索"
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
      <div className="search-control-grid">
        <label>
          <span>曜日</span>
          <select
            aria-label="曜日で絞り込む"
            value={props.searchDayFilter}
            onChange={(event) =>
              props.setSearchDayFilter(event.target.value as SearchDayFilter)
            }
          >
            <option>すべて</option>
            <option>平日</option>
            <option>土日</option>
          </select>
        </label>
        <label>
          <span>時間帯</span>
          <select
            aria-label="時間帯で絞り込む"
            value={props.searchTimeFilter}
            onChange={(event) =>
              props.setSearchTimeFilter(event.target.value as SearchTimeFilter)
            }
          >
            <option>すべて</option>
            <option>午前</option>
            <option>午後</option>
            <option>夜</option>
          </select>
        </label>
        <label>
          <span>料金</span>
          <select
            aria-label="料金で絞り込む"
            value={props.searchFeeFilter}
            onChange={(event) =>
              props.setSearchFeeFilter(event.target.value as SearchFeeFilter)
            }
          >
            <option>すべて</option>
            <option>無料</option>
            <option>有料</option>
          </select>
        </label>
        <label>
          <span>開催形式</span>
          <select
            aria-label="開催形式で絞り込む"
            value={props.searchFormatFilter}
            onChange={(event) =>
              props.setSearchFormatFilter(
                event.target.value as SearchFormatFilter,
              )
            }
          >
            <option>すべて</option>
            <option>現地</option>
            <option>オンライン</option>
            <option>ハイブリッド</option>
          </select>
        </label>
        <label>
          <span>並び順</span>
          <select
            aria-label="イベントの並び順"
            value={props.searchSort}
            onChange={(event) =>
              props.setSearchSort(event.target.value as SearchSort)
            }
          >
            <option>開催が近い順</option>
            <option>人気順</option>
            <option>新着順</option>
          </select>
        </label>
      </div>
      <div className="search-toolbar">
        <div className="view-switch" aria-label="表示形式">
          <button
            className={props.searchView === "list" ? "active" : ""}
            type="button"
            title="一覧表示"
            aria-label="一覧表示"
            onClick={() => props.setSearchView("list")}
          >
            <List size={16} />
          </button>
          <button
            className={props.searchView === "calendar" ? "active" : ""}
            type="button"
            title="日付別表示"
            aria-label="日付別表示"
            onClick={() => props.setSearchView("calendar")}
          >
            <CalendarDays size={16} />
          </button>
        </div>
        <div className="saved-search-actions">
          {props.savedSearch && (
            <button type="button" onClick={props.onApplySavedSearch}>
              <RefreshCw size={14} />
              保存条件を適用
            </button>
          )}
          <button type="button" onClick={props.onSaveSearch}>
            <Bell size={14} />
            この条件を保存
          </button>
        </div>
      </div>
      {props.filteredEvents.length === 0 ? (
        <EmptySearchResults onReset={props.onResetFilters} />
      ) : props.searchView === "calendar" ? (
        <div className="calendar-event-groups">
          {Object.entries(calendarGroups).map(([date, events]) => (
            <section key={date}>
              <h3>{date}</h3>
              <div className="event-grid search-grid">
                {events.map((event) => (
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
            </section>
          ))}
        </div>
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
          onApply={() => props.requestApplication(props.selectedEvent!)}
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
    waitlisted: "キャンセル待ち",
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
  const currentStep =
    status === "pending" || status === "waitlisted"
      ? 1
      : status === "confirmed"
        ? 2
        : 3;
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
  userName: string;
  activityYear: number;
  activityByMonth: { month: number; count: number }[];
  events: AizuEvent[];
  setSelectedEventId: (id: string) => void;
  setActiveTab: (tab: Tab) => void;
  onOpenMessages: (eventId: string) => void;
  onCancelApplication: (application: EventApplication) => void;
  onCheckIn: (application: EventApplication, code: string) => Promise<void>;
}) {
  const [selectedCertificate, setSelectedCertificate] =
    useState<ActivityRecord | null>(null);
  const [checkInCodes, setCheckInCodes] = useState<Record<string, string>>({});
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState("");
  const [checkInErrorId, setCheckInErrorId] = useState<string | null>(null);
  const verifiedActivities = props.activities.filter(
    (activity) => activity.verificationStatus === "verified",
  );
  const uniqueOrganizations = new Set(
    verifiedActivities.map((activity) => activity.organizationName),
  ).size;
  const portfolioTakeaways = Array.from(
    new Set(verifiedActivities.flatMap((activity) => activity.takeaways ?? [])),
  ).slice(0, 5);
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
            <h3>{props.activityYear}年の活動</h3>
          </div>
          <Sparkles size={20} />
        </div>
        <div className="portfolio-summary">
          <span>
            <strong>{verifiedActivities.length}</strong>
            <small>証明済み活動</small>
          </span>
          <span>
            <strong>{uniqueOrganizations}</strong>
            <small>つながった主催</small>
          </span>
          <span>
            <strong>{portfolioTakeaways.length}</strong>
            <small>経験タグ</small>
          </span>
        </div>
        {portfolioTakeaways.length > 0 && (
          <div className="portfolio-tags">
            {portfolioTakeaways.map((takeaway) => (
              <span key={takeaway}>{takeaway}</span>
            ))}
          </div>
        )}
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
          props.applications.map((application) => {
            const relatedEvent = props.events.find(
              (item) => item.id === application.eventId,
            );
            const eventDate = relatedEvent?.startAt?.toDate();
            return (
              <div className="application-item" key={application.id}>
                <div className="date-block">
                  <strong>{eventDate?.getDate() ?? "--"}</strong>
                  <span>
                    {eventDate ? `${eventDate.getMonth() + 1}月` : "予定"}
                  </span>
                </div>
                <div className="application-copy">
                  <strong>{application.eventTitle}</strong>
                  <span>{application.organizationName}</span>
                  <small>
                    {application.status === "confirmed"
                      ? "参加確定。開催前にメッセージで詳細を確認しましょう。"
                      : application.status === "waitlisted"
                        ? `キャンセル待ち${application.waitlistPosition ? ` ${application.waitlistPosition}番目` : ""}です。空きが出たら通知します。`
                        : application.status === "attended"
                          ? "出席が確認され、活動実績に反映されています。"
                          : application.status === "rejected"
                            ? "今回は参加できませんでした。別の活動を探してみましょう。"
                            : "申請後の連絡はメッセージから確認できます。"}
                  </small>
                  <ApplicationStatusTimeline status={application.status} />
                  <div className="application-quick-actions">
                    {relatedEvent && (
                      <button
                        type="button"
                        onClick={() => {
                          props.setSelectedEventId(relatedEvent.id);
                          props.setActiveTab("search");
                        }}
                      >
                        <Eye size={13} />
                        詳細を見る
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => props.onOpenMessages(application.eventId)}
                    >
                      <MessageCircle size={13} />
                      連絡を見る
                    </button>
                  </div>
                  {application.status === "confirmed" && (
                    <form
                      className="student-check-in"
                      onSubmit={(submitEvent) => {
                        submitEvent.preventDefault();
                        const code = checkInCodes[application.id] ?? "";
                        if (!/^\d{6}$/.test(code)) {
                          setCheckInError(
                            "6桁の受付コードを入力してください。",
                          );
                          setCheckInErrorId(application.id);
                          return;
                        }
                        setCheckingInId(application.id);
                        setCheckInError("");
                        setCheckInErrorId(null);
                        void props
                          .onCheckIn(application, code)
                          .catch((error) => {
                            setCheckInError(getFirebaseErrorMessage(error));
                            setCheckInErrorId(application.id);
                          })
                          .finally(() => setCheckingInId(null));
                      }}
                    >
                      <input
                        aria-label={`${application.eventTitle}の受付コード`}
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        placeholder="当日の6桁受付コード"
                        value={checkInCodes[application.id] ?? ""}
                        onChange={(changeEvent) =>
                          setCheckInCodes((current) => ({
                            ...current,
                            [application.id]: changeEvent.target.value.replace(
                              /\D/g,
                              "",
                            ),
                          }))
                        }
                      />
                      <button
                        type="submit"
                        disabled={checkingInId === application.id}
                      >
                        {checkingInId === application.id ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <Check size={13} />
                        )}
                        受付する
                      </button>
                    </form>
                  )}
                  {checkInError && checkInErrorId === application.id && (
                    <small className="inline-error">{checkInError}</small>
                  )}
                </div>
                <span className="status-chip">
                  {applicationStatusLabel(application.status)}
                </span>
                {["pending", "waitlisted", "confirmed"].includes(
                  application.status,
                ) && (
                  <button
                    className="text-button application-cancel"
                    type="button"
                    onClick={() => props.onCancelApplication(application)}
                  >
                    キャンセル
                  </button>
                )}
              </div>
            );
          })
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
                <div className="certificate-card">
                  <span>
                    <ShieldCheck size={14} />
                    活動証明 {activity.certificateId ?? activity.id}
                  </span>
                  <small>{activity.participantRole ?? "参加者"}</small>
                </div>
                <button
                  className="certificate-open-button"
                  type="button"
                  onClick={() => setSelectedCertificate(activity)}
                >
                  <FileText size={14} />
                  証明書を表示・共有
                </button>
                {activity.takeaways && activity.takeaways.length > 0 && (
                  <div className="activity-takeaways">
                    {activity.takeaways.slice(0, 3).map((takeaway) => (
                      <span key={takeaway}>{takeaway}</span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </div>
      {selectedCertificate && (
        <CertificateDialog
          activity={selectedCertificate}
          userName={props.userName}
          onClose={() => setSelectedCertificate(null)}
        />
      )}
    </section>
  );
}

function MessagesTab({
  rooms,
  activeRoomId,
  messages,
  hasOlderMessages = false,
  draft,
  unreadCounts = {},
  readReceipts = [],
  mutedRoomIds = [],
  onSelectRoom,
  onLoadOlder,
  onToggleMute,
  onDraftChange,
  onSend,
  onUploadAttachment,
  onReportMessage,
  onSaveRoomMeta,
  currentUserId,
  currentUserRole,
  onOpenActivity,
  onOpenEvent,
}: {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  messages: ChatMessage[];
  hasOlderMessages?: boolean;
  draft: string;
  unreadCounts?: Record<string, number>;
  readReceipts?: ChatReadReceipt[];
  mutedRoomIds?: string[];
  onSelectRoom: (roomId: string) => void;
  onLoadOlder?: () => void;
  onToggleMute?: (roomId: string) => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onUploadAttachment?: (file: File) => Promise<void> | void;
  onReportMessage?: (message: ChatMessage) => void;
  onSaveRoomMeta?: (
    room: ChatRoom,
    updates: Pick<ChatRoom, "pinnedMessage" | "organizerNotice">,
  ) => Promise<void>;
  currentUserId: string;
  currentUserRole: "student" | "organization";
  onOpenActivity?: () => void;
  onOpenEvent?: (eventId: string) => void;
}) {
  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const [pinnedDraft, setPinnedDraft] = useState("");
  const [noticeDraft, setNoticeDraft] = useState("");
  const [isMetaEditing, setIsMetaEditing] = useState(false);
  const [isMetaSaving, setIsMetaSaving] = useState(false);
  const [roomTypeFilter, setRoomTypeFilter] = useState<
    "all" | "event" | "application"
  >("all");
  const [roomSearch, setRoomSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentInputKey, setAttachmentInputKey] = useState(0);
  const conversationListRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const selectRoom = (roomId: string) => {
    onSelectRoom(roomId);
    if (window.matchMedia("(max-width: 620px)").matches) {
      window.requestAnimationFrame(() =>
        chatPanelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    }
  };
  const getCounterpartName = (room: ChatRoom) =>
    room.roomType === "event"
      ? "イベント全体"
      : currentUserRole === "organization"
        ? room.studentName || "参加学生"
        : room.organizationName;
  const getRoomSubtitle = (room: ChatRoom) =>
    room.roomType === "event"
      ? `${room.eventTitle} · 全体チャット`
      : room.eventTitle;
  const messagePlaceholder =
    activeRoom?.roomType === "event"
      ? "全体チャットにメッセージを送る"
      : currentUserRole === "organization"
        ? "参加者にメッセージを送る"
        : "主催者にメッセージを送る";
  const visibleRooms = [...rooms]
    .filter(
      (room) => roomTypeFilter === "all" || room.roomType === roomTypeFilter,
    )
    .filter((room) => !unreadOnly || Boolean(unreadCounts[room.id]))
    .filter((room) => {
      const normalized = roomSearch.trim().toLowerCase();
      return (
        !normalized ||
        [
          room.eventTitle,
          room.studentName ?? "",
          room.organizationName,
          room.lastMessageText,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized)
      );
    })
    .sort(
      (left, right) =>
        timestampMillis(right.lastMessageAt) -
        timestampMillis(left.lastMessageAt),
    );
  const otherReadAt = Math.max(
    0,
    ...readReceipts
      .filter((receipt) => receipt.userId !== currentUserId)
      .map((receipt) => timestampMillis(receipt.readAt)),
  );
  const lastOwnMessageIndex = messages.findLastIndex(
    (chatMessage) =>
      chatMessage.senderId === currentUserId && chatMessage.type !== "system",
  );
  useEffect(() => {
    setPinnedDraft(activeRoom?.pinnedMessage ?? "");
    setNoticeDraft(activeRoom?.organizerNotice ?? "");
    setIsMetaEditing(false);
  }, [activeRoom?.id, activeRoom?.organizerNotice, activeRoom?.pinnedMessage]);
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
          <div className="conversation-list" ref={conversationListRef}>
            <div className="conversation-tools">
              <div className="conversation-search">
                <Search size={14} />
                <input
                  aria-label="チャットを検索"
                  placeholder="イベント・参加者を検索"
                  value={roomSearch}
                  onChange={(event) => setRoomSearch(event.target.value)}
                />
              </div>
              <div className="conversation-filters" aria-label="チャット種別">
                {(
                  [
                    ["all", "すべて"],
                    ["event", "全体"],
                    ["application", "個別"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    className={roomTypeFilter === value ? "active" : ""}
                    type="button"
                    key={value}
                    onClick={() => setRoomTypeFilter(value)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  className={unreadOnly ? "active" : ""}
                  type="button"
                  onClick={() => setUnreadOnly((current) => !current)}
                >
                  未読
                </button>
              </div>
            </div>
            {visibleRooms.length === 0 ? (
              <div className="conversation-no-results">
                <Search size={18} />
                条件に合うチャットはありません
              </div>
            ) : (
              visibleRooms.map((room) => (
                <button
                  className={`conversation-item ${room.id === activeRoomId ? "active" : ""}`}
                  key={room.id}
                  type="button"
                  onClick={() => selectRoom(room.id)}
                >
                  <div className="conversation-avatar">
                    {room.roomType === "event" ? (
                      <UsersRound size={19} />
                    ) : (
                      <UserRound size={19} />
                    )}
                  </div>
                  <div>
                    <strong>{getCounterpartName(room)}</strong>
                    <span>{getRoomSubtitle(room)}</span>
                    <small>{room.lastMessageText}</small>
                    <time>{formatChatTime(room.lastMessageAt)}</time>
                  </div>
                  {mutedRoomIds.includes(room.id) && <VolumeX size={14} />}
                  {unreadCounts[room.id] ? (
                    <em className="unread-badge">{unreadCounts[room.id]}</em>
                  ) : null}
                  <ChevronRight size={17} />
                </button>
              ))
            )}
          </div>
          {activeRoom && (
            <div className="chat-panel" ref={chatPanelRef}>
              <div className="chat-panel-head">
                <div className="chat-panel-title">
                  <button
                    className="icon-button mobile-chat-back"
                    type="button"
                    title="チャット一覧へ戻る"
                    aria-label="チャット一覧へ戻る"
                    onClick={() =>
                      conversationListRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                    }
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <div>
                    <span>
                      {activeRoom.roomType === "event"
                        ? "全体チャット"
                        : "個別チャット"}
                    </span>
                    <strong>{activeRoom.eventTitle}</strong>
                  </div>
                </div>
                <div className="chat-head-actions">
                  <small>{getCounterpartName(activeRoom)}</small>
                  {onOpenEvent && (
                    <button
                      className="icon-button"
                      type="button"
                      title="イベント詳細"
                      aria-label="イベント詳細を開く"
                      onClick={() => onOpenEvent(activeRoom.eventId)}
                    >
                      <CalendarDays size={15} />
                    </button>
                  )}
                  {onToggleMute && (
                    <button
                      className="icon-button"
                      type="button"
                      title={
                        mutedRoomIds.includes(activeRoom.id)
                          ? "通知をオン"
                          : "通知をオフ"
                      }
                      aria-label={
                        mutedRoomIds.includes(activeRoom.id)
                          ? "このチャットの通知をオンにする"
                          : "このチャットの通知をオフにする"
                      }
                      aria-pressed={mutedRoomIds.includes(activeRoom.id)}
                      onClick={() => onToggleMute(activeRoom.id)}
                    >
                      {mutedRoomIds.includes(activeRoom.id) ? (
                        <VolumeX size={15} />
                      ) : (
                        <Volume2 size={15} />
                      )}
                    </button>
                  )}
                </div>
              </div>
              {(activeRoom.pinnedMessage || activeRoom.organizerNotice) && (
                <div className="chat-info-stack">
                  {activeRoom.pinnedMessage && (
                    <div className="chat-info-card">
                      <Pin size={15} />
                      <span>
                        <strong>固定メッセージ</strong>
                        <small>{activeRoom.pinnedMessage}</small>
                      </span>
                    </div>
                  )}
                  {activeRoom.organizerNotice && (
                    <div className="chat-info-card notice-card">
                      <Bell size={15} />
                      <span>
                        <strong>主催者からのお知らせ</strong>
                        <small>{activeRoom.organizerNotice}</small>
                      </span>
                    </div>
                  )}
                </div>
              )}
              {currentUserRole === "organization" &&
                activeRoom.roomType === "event" &&
                onSaveRoomMeta && (
                  <div className="chat-meta-editor">
                    {isMetaEditing ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          setIsMetaSaving(true);
                          void onSaveRoomMeta(activeRoom, {
                            pinnedMessage: pinnedDraft.trim().slice(0, 180),
                            organizerNotice: noticeDraft.trim().slice(0, 220),
                          }).finally(() => {
                            setIsMetaSaving(false);
                            setIsMetaEditing(false);
                          });
                        }}
                      >
                        <input
                          aria-label="固定メッセージ"
                          maxLength={180}
                          value={pinnedDraft}
                          placeholder="集合場所、持ち物などを固定"
                          onChange={(event) =>
                            setPinnedDraft(event.target.value)
                          }
                        />
                        <input
                          aria-label="主催者からのお知らせ"
                          maxLength={220}
                          value={noticeDraft}
                          placeholder="当日の変更や連絡事項"
                          onChange={(event) =>
                            setNoticeDraft(event.target.value)
                          }
                        />
                        <div className="row-actions">
                          <button type="submit" disabled={isMetaSaving}>
                            保存
                          </button>
                          <button
                            className="muted"
                            type="button"
                            onClick={() => setIsMetaEditing(false)}
                          >
                            閉じる
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsMetaEditing(true)}
                      >
                        <Pin size={15} />
                        固定メッセージ・お知らせを編集
                      </button>
                    )}
                  </div>
                )}
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
                {hasOlderMessages && onLoadOlder && (
                  <button
                    className="chat-load-older"
                    type="button"
                    onClick={onLoadOlder}
                  >
                    <History size={15} />
                    過去のメッセージを読み込む
                  </button>
                )}
                {messages.length === 0 ? (
                  <p className="chat-placeholder">
                    最初のメッセージを送ってみましょう。
                  </p>
                ) : (
                  messages.map((chatMessage, index) => {
                    const day = formatChatDay(chatMessage.createdAt);
                    const previousDay =
                      index > 0
                        ? formatChatDay(messages[index - 1].createdAt)
                        : "";
                    const isOwn = chatMessage.senderId === currentUserId;
                    const isRead =
                      isOwn &&
                      index === lastOwnMessageIndex &&
                      otherReadAt >= timestampMillis(chatMessage.createdAt);
                    return (
                      <div className="chat-message-block" key={chatMessage.id}>
                        {day && day !== previousDay && (
                          <div className="chat-date-separator">
                            <span>{day}</span>
                          </div>
                        )}
                        <div
                          className={`chat-message ${chatMessage.type === "system" ? "system" : isOwn ? "mine" : "theirs"}`}
                        >
                          <span>{chatMessage.senderName}</span>
                          {chatMessage.type === "image" &&
                            chatMessage.attachmentUrl && (
                              <a
                                className="chat-image-link"
                                href={chatMessage.attachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <img
                                  src={chatMessage.attachmentUrl}
                                  alt={chatMessage.attachmentName || "添付画像"}
                                />
                              </a>
                            )}
                          {chatMessage.type === "file" &&
                            chatMessage.attachmentUrl && (
                              <a
                                className="chat-file-link"
                                href={chatMessage.attachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <FileText size={15} />
                                {chatMessage.attachmentName || chatMessage.text}
                                <Download size={13} />
                              </a>
                            )}
                          {chatMessage.type !== "file" && (
                            <p>{chatMessage.text}</p>
                          )}
                          <small className="chat-message-time">
                            {formatChatTime(chatMessage.createdAt)}
                            {isRead ? " · 既読" : ""}
                          </small>
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
                      </div>
                    );
                  })
                )}
              </div>
              <form
                className="chat-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSend();
                }}
              >
                {onUploadAttachment && (
                  <label
                    className="chat-attachment-button"
                    title="画像・資料を添付"
                  >
                    {isUploadingAttachment ? (
                      <Loader2 size={17} className="spin" />
                    ) : (
                      <Paperclip size={17} />
                    )}
                    <input
                      key={attachmentInputKey}
                      type="file"
                      disabled={
                        activeRoom.status !== "active" || isUploadingAttachment
                      }
                      accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        setIsUploadingAttachment(true);
                        Promise.resolve(onUploadAttachment(file)).finally(
                          () => {
                            setIsUploadingAttachment(false);
                            setAttachmentInputKey((current) => current + 1);
                          },
                        );
                      }}
                    />
                  </label>
                )}
                <input
                  value={draft}
                  maxLength={2000}
                  disabled={activeRoom.status !== "active"}
                  placeholder={
                    activeRoom.status === "active"
                      ? messagePlaceholder
                      : "このチャットは終了しています"
                  }
                  onChange={(event) => onDraftChange(event.target.value)}
                />
                <button
                  type="submit"
                  disabled={activeRoom.status !== "active" || !draft.trim()}
                  title="送信"
                >
                  <Send size={17} />
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ApplicationDialog({
  event,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  event: AizuEvent;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (details: ApplicationDetails) => void;
}) {
  const [participantMessage, setParticipantMessage] = useState("");
  const [accessibilityNeeds, setAccessibilityNeeds] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const isWaitlist =
    Number(event.applicantCount ?? 0) >= Number(event.capacity ?? 0);
  const dialogRef = useDialogAccessibility<HTMLFormElement>(onClose);
  return createPortal(
    <div className="report-backdrop" role="presentation" onClick={onClose}>
      <form
        ref={dialogRef}
        className="application-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-dialog-title"
        tabIndex={-1}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          if (!consentAccepted) return;
          onSubmit({
            participantMessage: participantMessage.trim().slice(0, 500),
            accessibilityNeeds: accessibilityNeeds.trim().slice(0, 500),
            emergencyContact: emergencyContact.trim().slice(0, 200),
            consentAccepted,
          });
        }}
      >
        <div className="report-dialog-head">
          <div>
            <p className="eyebrow">
              {isWaitlist ? "WAITING LIST" : "APPLICATION"}
            </p>
            <h2 id="application-dialog-title">
              {isWaitlist ? "キャンセル待ちに登録" : "参加申請を確認"}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="閉じる"
            data-dialog-initial-focus
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="application-event-summary">
          <strong>{event.title}</strong>
          <span>
            <CalendarDays size={14} />
            {event.startAtLabel}
            {event.endAtLabel ? ` - ${event.endAtLabel}` : ""}
          </span>
          <span>
            <MapPin size={14} />
            {event.meetingPoint || event.location}
          </span>
          <span>
            <UsersRound size={14} />
            {isWaitlist
              ? "現在満員です。空きが出た場合に通知します。"
              : `残り${Math.max(event.capacity - event.applicantCount, 0)}名`}
          </span>
        </div>
        <div className="application-policy">
          <strong>キャンセルについて</strong>
          <p>
            {event.cancellationPolicy ||
              "参加できなくなった場合は、活動ページから早めにキャンセルしてください。"}
          </p>
        </div>
        <Field label="主催者へのメッセージ（任意）">
          <textarea
            maxLength={500}
            value={participantMessage}
            placeholder="参加したい理由や事前に伝えたいこと"
            onChange={(changeEvent) =>
              setParticipantMessage(changeEvent.target.value)
            }
          />
        </Field>
        <Field label="配慮してほしいこと（任意）">
          <textarea
            maxLength={500}
            value={accessibilityNeeds}
            placeholder="移動、聴覚、食事など必要な配慮"
            onChange={(changeEvent) =>
              setAccessibilityNeeds(changeEvent.target.value)
            }
          />
        </Field>
        <Field label="緊急時の連絡先（任意・主催者のみ閲覧）">
          <input
            maxLength={200}
            value={emergencyContact}
            placeholder="電話番号または連絡方法"
            onChange={(changeEvent) =>
              setEmergencyContact(changeEvent.target.value)
            }
          />
        </Field>
        <label className="application-consent">
          <input
            required
            type="checkbox"
            checked={consentAccepted}
            onChange={(changeEvent) =>
              setConsentAccepted(changeEvent.target.checked)
            }
          />
          <span>
            イベント内容、キャンセル方針、主催者との情報共有範囲を確認しました
          </span>
        </label>
        <div className="report-dialog-actions">
          <button className="text-button" type="button" onClick={onClose}>
            戻る
          </button>
          <button
            className="primary-action"
            type="submit"
            disabled={isSubmitting || !consentAccepted}
          >
            {isSubmitting ? (
              <Loader2 size={16} className="spin" />
            ) : isWaitlist ? (
              <History size={16} />
            ) : (
              <Check size={16} />
            )}
            {isWaitlist ? "キャンセル待ちに登録" : "参加申請を送信"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function CertificateDialog({
  activity,
  userName,
  onClose,
}: {
  activity: ActivityRecord;
  userName: string;
  onClose: () => void;
}) {
  const [shareNotice, setShareNotice] = useState("");
  const dialogRef = useDialogAccessibility<HTMLElement>(onClose);
  const shareText = `${userName}さんは「${activity.title}」に参加しました。活動証明: ${activity.certificateId ?? activity.id}`;
  const shareCertificate = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "Aizu Connect 活動証明",
        text: shareText,
      });
      return;
    }
    await navigator.clipboard.writeText(shareText);
    setShareNotice("共有用テキストをコピーしました。");
  };
  return createPortal(
    <div
      className="image-review-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        ref={dialogRef}
        className="certificate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="certificate-title"
        tabIndex={-1}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="image-review-head no-print">
          <div>
            <p className="eyebrow">ACTIVITY CERTIFICATE</p>
            <h2 id="certificate-title">活動証明書</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="閉じる"
            data-dialog-initial-focus
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="certificate-sheet">
          <span className="brand-mark">A</span>
          <p>AIZU CONNECT ACTIVITY CERTIFICATE</p>
          <h3>活動証明書</h3>
          <strong>{userName} 様</strong>
          <p>
            下記の活動へ参加し、主催者による出席確認が完了したことを証明します。
          </p>
          <dl>
            <div>
              <dt>活動名</dt>
              <dd>{activity.title}</dd>
            </div>
            <div>
              <dt>主催</dt>
              <dd>{activity.organizationName}</dd>
            </div>
            <div>
              <dt>参加年月</dt>
              <dd>
                {activity.activityYear}年{activity.activityMonth}月
              </dd>
            </div>
            <div>
              <dt>証明番号</dt>
              <dd>{activity.certificateId ?? activity.id}</dd>
            </div>
          </dl>
          {(activity.takeaways ?? []).length > 0 && (
            <div className="certificate-skills">
              {(activity.takeaways ?? []).map((takeaway) => (
                <span key={takeaway}>{takeaway}</span>
              ))}
            </div>
          )}
          <small>発行: Aizu Connect / 主催者確認済み</small>
        </div>
        {shareNotice && (
          <div className="form-message no-print">{shareNotice}</div>
        )}
        <div className="image-review-actions no-print">
          <button
            className="secondary-action"
            type="button"
            onClick={() => void shareCertificate()}
          >
            <LinkIcon size={16} />
            共有
          </button>
          <button
            className="primary-action"
            type="button"
            onClick={() => window.print()}
          >
            <Download size={16} />
            PDFとして印刷
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function ImageReviewDialog({
  title,
  imageUrl,
  alt,
  circular = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  imageUrl: string;
  alt: string;
  circular?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useDialogAccessibility<HTMLElement>(onCancel);

  return createPortal(
    <div className="image-review-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="image-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-review-title"
        tabIndex={-1}
      >
        <div className="image-review-head">
          <div>
            <p className="eyebrow">PHOTO REVIEW</p>
            <h2 id="image-review-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="閉じる"
            aria-label="写真レビューを閉じる"
            data-dialog-initial-focus
            onClick={onCancel}
          >
            <X size={18} />
          </button>
        </div>
        <div className={`image-review-frame${circular ? " circular" : ""}`}>
          <img src={imageUrl} alt={alt} />
        </div>
        <p className="image-review-help">
          この写真でよければ確定してください。保存するまで公開されません。
        </p>
        <div className="image-review-actions">
          <button className="secondary-action" type="button" onClick={onCancel}>
            選び直す
          </button>
          <button className="primary-action" type="button" onClick={onConfirm}>
            <Check size={17} />
            この写真を使う
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function AccountDeletionPanel({
  request,
  onRequest,
  onCancel,
}: {
  request: AccountDeletionRequest | null;
  onRequest: (reason: string) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const isSubmitted = request?.status === "submitted";

  return (
    <section className="account-deletion-panel">
      <div className="account-deletion-copy">
        <div className="settings-icon">
          <Trash2 size={18} />
        </div>
        <span>
          <strong>
            {isSubmitted ? "退会・データ削除を申請中" : "退会・データ削除"}
          </strong>
          <small>
            {isSubmitted
              ? "運営が本人確認後にアカウントと関連データを削除します"
              : "アプリ内から運営へ削除を申請できます"}
          </small>
        </span>
      </div>
      {isSubmitted && request?.reason && (
        <p className="account-deletion-reason">申請理由: {request.reason}</p>
      )}
      {notice && (
        <div className="form-message" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      <div className="row-actions">
        {isSubmitted ? (
          <button
            className="secondary-action"
            type="button"
            disabled={isSaving}
            onClick={() => setIsCancelOpen(true)}
          >
            申請を取り消す
          </button>
        ) : (
          <button
            className="danger-action"
            type="button"
            disabled={isSaving}
            onClick={() => setIsRequestOpen(true)}
          >
            <Trash2 size={15} />
            退会を申請する
          </button>
        )}
      </div>
      {isRequestOpen && (
        <ActionReasonDialog
          title="退会・データ削除を申請"
          description="運営が内容を確認した後、認証アカウント、プロフィール、参加申請、チャットなどの関連データを削除します。削除完了後は元に戻せません。"
          label="退会理由・削除に関する連絡"
          placeholder="退会理由や、削除前に確認してほしいことを入力してください"
          confirmLabel="削除を申請する"
          danger
          onClose={() => setIsRequestOpen(false)}
          onConfirm={(reason) => {
            setIsSaving(true);
            setNotice("");
            void onRequest(reason)
              .then(() => {
                setIsRequestOpen(false);
                setNotice("退会・データ削除の申請を受け付けました。");
              })
              .catch((error) => setNotice(getFirebaseErrorMessage(error)))
              .finally(() => setIsSaving(false));
          }}
        />
      )}
      {isCancelOpen && (
        <ConfirmDialog
          title="退会申請を取り消しますか？"
          description="アカウントとデータは削除されず、これまでどおり利用できます。"
          confirmLabel="申請を取り消す"
          onClose={() => setIsCancelOpen(false)}
          onConfirm={() => {
            setIsSaving(true);
            setNotice("");
            void onCancel()
              .then(() => {
                setIsCancelOpen(false);
                setNotice("退会申請を取り消しました。");
              })
              .catch((error) => setNotice(getFirebaseErrorMessage(error)))
              .finally(() => setIsSaving(false));
          }}
        />
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
  accountDeletionRequest,
  onSaveProfile,
  onSaveNotificationPreferences,
  onRequestAccountDeletion,
  onCancelAccountDeletion,
  onOpenActivity,
  onOpenCreatorDashboard,
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
  accountDeletionRequest: AccountDeletionRequest | null;
  onSaveProfile: (updates: {
    displayName: string;
    department: string;
    grade: number;
    interests: string[];
    currentActivities: string;
    wantToTry: string;
    profileImageFile: File | null;
  }) => Promise<void>;
  onSaveNotificationPreferences: (
    updates: Partial<Omit<NotificationPreferences, "userId">>,
  ) => Promise<void>;
  onRequestAccountDeletion: (reason: string) => Promise<void>;
  onCancelAccountDeletion: () => Promise<void>;
  onOpenActivity: () => void;
  onOpenCreatorDashboard: () => void;
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
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(
    appUser.profileImageUrl ?? null,
  );
  const [isProfileImageReviewOpen, setIsProfileImageReviewOpen] =
    useState(false);
  const [profileImageInputKey, setProfileImageInputKey] = useState(0);
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
  const profileMeta = [
    appUser.university,
    appUser.department,
    appUser.grade > 0 ? `${appUser.grade}年` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const startEditing = () => {
    setDisplayName(appUser.displayName);
    setDepartment(appUser.department);
    setGrade(appUser.grade);
    setInterestText(appUser.interests.join(", "));
    setCurrentActivities(appUser.currentActivities ?? "");
    setWantToTry(appUser.wantToTry ?? "");
    setProfileImageFile(null);
    setProfileImagePreview(appUser.profileImageUrl ?? null);
    setIsProfileImageReviewOpen(false);
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
    setIsSaving(true);
    setProfileMessage("");
    try {
      await onSaveProfile({
        displayName: displayName.trim().slice(0, 60) || "名前未設定",
        department: department.trim().slice(0, 80),
        grade: Math.max(0, Math.min(6, grade)),
        interests,
        currentActivities: currentActivities.trim().slice(0, 240),
        wantToTry: wantToTry.trim().slice(0, 240),
        profileImageFile,
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
          {appUser.profileImageUrl ? (
            <img src={appUser.profileImageUrl} alt="プロフィール画像" />
          ) : (
            <CircleUserRound size={35} />
          )}
        </div>
        <div className="profile-copy">
          <p className="eyebrow">MY PROFILE</p>
          <h2>{appUser.displayName}</h2>
          <p>{profileMeta || "プロフィール未設定"}</p>
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
      {profileMessage && (
        <div className="notice" role="status" aria-live="polite">
          {profileMessage}
        </div>
      )}
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
          <Field label="プロフィール画像">
            <div className="image-picker">
              <div className="profile-image-preview">
                {profileImagePreview ? (
                  <img
                    src={profileImagePreview}
                    alt="プロフィール画像のプレビュー"
                  />
                ) : (
                  <CircleUserRound size={27} />
                )}
              </div>
              <input
                key={profileImageInputKey}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    validateImageFile(file, "プロフィール画像");
                    setProfileImageFile(file);
                    setProfileImagePreview(URL.createObjectURL(file));
                    setProfileMessage("");
                    setIsProfileImageReviewOpen(true);
                  } catch (error) {
                    setProfileMessage(getFirebaseErrorMessage(error));
                    event.target.value = "";
                  }
                }}
              />
              <small>JPEG・PNG・WebP / 5MB未満</small>
            </div>
          </Field>
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
                min={0}
                max={6}
                value={grade > 0 ? grade : ""}
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
      {isProfileImageReviewOpen && profileImagePreview && (
        <ImageReviewDialog
          title="プロフィール画像を確認"
          imageUrl={profileImagePreview}
          alt="プロフィール画像の確認用プレビュー"
          circular
          onCancel={() => {
            setIsProfileImageReviewOpen(false);
            setProfileImageFile(null);
            setProfileImagePreview(appUser.profileImageUrl ?? null);
            setProfileImageInputKey((current) => current + 1);
          }}
          onConfirm={() => setIsProfileImageReviewOpen(false)}
        />
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
                  <img
                    src={event.imageUrl}
                    alt={`${event.title}の写真`}
                    loading="lazy"
                  />
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
          onClick={onOpenCreatorDashboard}
        >
          <div className="settings-icon">
            <Plus size={18} />
          </div>
          <span>
            <strong>イベントを企画する</strong>
            <small>企画申請と参加者管理を開く</small>
          </span>
          <ChevronRight size={17} />
        </button>
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
      <AccountDeletionPanel
        request={accountDeletionRequest}
        onRequest={onRequestAccountDeletion}
        onCancel={onCancelAccountDeletion}
      />
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
      <div className="event-card-main">
        <div className="event-image-wrap">
          <button
            className="event-image-button"
            type="button"
            aria-label={`${event.title}の詳細を見る`}
            onClick={onOpen}
          >
            <img
              src={event.imageUrl}
              alt={`${event.title}の写真`}
              loading="lazy"
            />
            <span className="event-category">{event.category}</span>
          </button>
          <button
            className={`save-button ${saved ? "saved" : ""}`}
            title={saved ? "保存を解除" : "保存"}
            aria-label={`${event.title}を${saved ? "保存から削除" : "保存"}`}
            aria-pressed={saved}
            type="button"
            onClick={onSave}
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
              {event.endAtLabel ? ` - ${event.endAtLabel}` : ""}
            </span>
            <span>
              <MapPin size={14} /> {event.location}
            </span>
            <span>
              <FileText size={14} /> {event.feeType ?? "無料"}
              {event.feeType === "有料" && event.feeAmount
                ? ` ${event.feeAmount.toLocaleString("ja-JP")}円`
                : ""}
            </span>
          </div>
          <div className="tag-row">
            {event.beginnerLevel && <span>{event.beginnerLevel}</span>}
            <span>{event.eventFormat ?? "現地"}</span>
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
          <button className="event-detail-link" type="button" onClick={onOpen}>
            詳細を見る <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

function FeaturedEvent({
  event,
  label,
  saved,
  onSave,
  onOpen,
}: {
  event: AizuEvent;
  label: string;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="featured-event">
      <div>
        <img src={event.imageUrl} alt={`${event.title}の写真`} />
        <div className="featured-overlay" />
        <div className="featured-content">
          <span className="featured-label">{label}</span>
          <h3>{event.title}</h3>
          <p>
            <MapPin size={14} /> {event.location} · {event.startAtLabel}
          </p>
          <div className="featured-action">
            <button
              className="featured-detail-link"
              type="button"
              onClick={onOpen}
            >
              詳細を見る <ChevronRight size={15} />
            </button>
            <button
              className={`save-button ${saved ? "saved" : ""}`}
              title={saved ? "保存を解除" : "保存"}
              aria-label={`${event.title}を${saved ? "保存から削除" : "保存"}`}
              aria-pressed={saved}
              type="button"
              onClick={onSave}
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
  previewMode = false,
  onClose,
}: {
  event: AizuEvent;
  applied: boolean;
  onApply: () => void;
  onReport: () => void;
  isLoading: boolean;
  previewMode?: boolean;
  onClose: () => void;
}) {
  const canApply = Boolean(event.createdBy);
  const capacity = Number(event.capacity ?? 0);
  const applicantCount = Number(event.applicantCount ?? 0);
  const remainingSlots = Math.max(0, capacity - applicantCount);
  const organizerVerified =
    event.organizationVerified ?? Boolean(event.createdBy);
  const [organizerProfile, setOrganizerProfile] =
    useState<PublicOrganizerProfile | null>(null);
  const dialogRef = useDialogAccessibility<HTMLElement>(onClose);
  useEffect(() => {
    if (!event.createdBy) {
      setOrganizerProfile(null);
      return;
    }
    void getDoc(doc(db, "publicOrganizerProfiles", event.createdBy))
      .then((snapshot) =>
        setOrganizerProfile(
          snapshot.exists()
            ? (snapshot.data() as PublicOrganizerProfile)
            : null,
        ),
      )
      .catch(() => setOrganizerProfile(null));
  }, [event.createdBy]);

  return createPortal(
    <div className="detail-overlay" role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-detail-title"
        tabIndex={-1}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="detail-panel-head">
          <span>{previewMode ? "公開前プレビュー" : "イベント詳細"}</span>
          <button
            className="icon-button"
            title="閉じる"
            type="button"
            data-dialog-initial-focus
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="detail-visual" aria-hidden="true">
          <img src={event.imageUrl} alt={`${event.title}の写真`} />
          <div className="detail-visual-shade" />
          <div className="detail-visual-copy">
            <span className="detail-visual-badge">{event.category}</span>
            <strong>{event.organizationName}</strong>
            <span>
              <MapPin size={14} /> {event.location}
            </span>
            <span>
              <CalendarDays size={14} /> {event.startAtLabel}
              {event.endAtLabel ? ` - ${event.endAtLabel}` : ""}
            </span>
          </div>
        </div>
        <div className="detail-panel-content">
          <p className="eyebrow">{event.category}</p>
          <h2 id="event-detail-title">{event.title}</h2>
          <p className="detail-summary">{event.summary}</p>
          <section className="detail-section detail-value-section">
            <h3>参加すると得られること</h3>
            <div className="value-chip-grid">
              {(event.takeaways?.length ? event.takeaways : defaultTakeaways)
                .slice(0, 3)
                .map((takeaway) => (
                  <span key={takeaway}>
                    <CheckCircle2 size={15} />
                    {takeaway}
                  </span>
                ))}
            </div>
          </section>
          <div className="detail-facts">
            <span>
              <CalendarDays size={16} /> {event.startAtLabel}
              {event.endAtLabel ? ` - ${event.endAtLabel}` : ""}
            </span>
            <span>
              <MapPin size={16} /> {event.location}
            </span>
            <span>
              <UsersRound size={16} /> 定員 {capacity}名
            </span>
            <span>
              <Sparkles size={16} /> {event.beginnerLevel ?? "誰でも歓迎"}
            </span>
            <span>
              <FileText size={16} />
              {event.feeType ?? "無料"}
              {event.feeType === "有料" && event.feeAmount
                ? ` ${event.feeAmount.toLocaleString("ja-JP")}円`
                : ""}
            </span>
            <span>
              <Compass size={16} /> {event.eventFormat ?? "現地"}
            </span>
          </div>
          <section className="detail-section">
            <h3>参加前に確認</h3>
            <dl className="event-guidance-list">
              <div>
                <dt>集合場所</dt>
                <dd>{event.meetingPoint || event.location}</dd>
              </div>
              <div>
                <dt>アクセス</dt>
                <dd>{event.accessInfo || "申請後に主催者から案内します"}</dd>
              </div>
              <div>
                <dt>持ち物・服装</dt>
                <dd>{event.bringItems || "特になし"}</dd>
              </div>
              <div>
                <dt>キャンセル</dt>
                <dd>
                  {event.cancellationPolicy ||
                    "参加できない場合は早めにキャンセルしてください"}
                </dd>
              </div>
              <div>
                <dt>天候・中止時</dt>
                <dd>
                  {event.weatherPolicy ||
                    "変更がある場合は通知と全体チャットで案内します"}
                </dd>
              </div>
              <div>
                <dt>参加時の配慮</dt>
                <dd>
                  {event.accessibility ||
                    "必要な配慮は申請時に主催者へ伝えられます"}
                </dd>
              </div>
              <div>
                <dt>連絡方法</dt>
                <dd>
                  {event.contactMethod ||
                    "申請後の個別チャットで主催者へ連絡できます"}
                </dd>
              </div>
            </dl>
            <div className="detail-secondary-actions">
              <a
                href={googleCalendarUrl(event)}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!event.startAt}
              >
                <CalendarPlus size={15} />
                Googleカレンダー
                <ExternalLink size={12} />
              </a>
              <button
                type="button"
                onClick={() => downloadEventCalendar(event)}
                disabled={!event.startAt}
              >
                <CalendarPlus size={15} />
                Appleカレンダー
              </button>
              {(event.eventFormat ?? "現地") !== "オンライン" && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.meetingPoint || event.location)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Map size={15} />
                  地図で確認
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
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
              <p>
                {organizerProfile?.description ||
                  event.organizerDescription ||
                  "参加者が安心して参加できるよう、事前連絡と当日の案内を行います。"}
              </p>
              <small>
                {organizerProfile
                  ? `公開イベント ${organizerProfile.publishedEventCount}件`
                  : event.organizerExperience || "Aizu Connectで活動を企画"}
              </small>
            </div>
          </div>
          <div className="detail-action-bar">
            <div className="detail-trust-row">
              <span>
                <UsersRound size={15} />
                {remainingSlots > 0
                  ? `残り${remainingSlots}名`
                  : "満員・キャンセル待ち受付中"}
              </span>
              {!previewMode && (
                <button
                  className="text-button"
                  type="button"
                  onClick={onReport}
                >
                  <Flag size={14} /> 掲載を通報
                </button>
              )}
            </div>
            {previewMode ? (
              <button
                className="primary-action"
                type="button"
                onClick={onClose}
              >
                <Check size={17} />
                プレビューを閉じる
              </button>
            ) : (
              <button
                className="primary-action"
                type="button"
                disabled={applied || isLoading || !canApply}
                onClick={onApply}
              >
                {isLoading && <Loader2 size={17} className="spin" />}
                {applied
                  ? "申請済み"
                  : canApply
                    ? remainingSlots > 0
                      ? "このイベントに参加する"
                      : "キャンセル待ちに登録する"
                    : "現在申請できません"}
              </button>
            )}
          </div>
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

function EmptySearchResults({ onReset }: { onReset: () => void }) {
  return (
    <div className="empty-state">
      <Search size={30} />
      <h3>条件に合う活動が見つかりません</h3>
      <p>検索語や絞り込み条件を変えると、別の活動が見つかるかもしれません。</p>
      <button className="secondary-action" type="button" onClick={onReset}>
        条件をリセット
      </button>
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
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {badge ? (
        <b aria-label={`${badge}件の未読`}>{badge > 99 ? "99+" : badge}</b>
      ) : null}
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
  hasAcceptedLegal: boolean;
  setHasAcceptedLegal: (value: boolean) => void;
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
          <form onSubmit={props.handleAuthSubmit}>
            {props.authMode === "register" && (
              <div
                className="account-type-switch"
                role="group"
                aria-label="アカウント種別"
              >
                <button
                  className={props.accountType === "student" ? "active" : ""}
                  type="button"
                  aria-pressed={props.accountType === "student"}
                  onClick={() => props.setAccountType("student")}
                >
                  個人
                </button>
                <button
                  className={
                    props.accountType === "organization" ? "active" : ""
                  }
                  type="button"
                  aria-pressed={props.accountType === "organization"}
                  onClick={() => props.setAccountType("organization")}
                >
                  団体・自治体
                </button>
              </div>
            )}
            <Field label="メールアドレス">
              <input
                type={
                  props.authMode === "login" && import.meta.env.DEV
                    ? "text"
                    : "email"
                }
                autoComplete="email"
                required
                maxLength={320}
                placeholder="you@example.com"
                value={props.email}
                onChange={(event) => props.setEmail(event.target.value)}
              />
            </Field>
            <div className="field">
              <label htmlFor="auth-password">パスワード</label>
              <div className="password-input-wrap">
                <input
                  id="auth-password"
                  type={props.showPassword ? "text" : "password"}
                  autoComplete={
                    props.authMode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                  placeholder={
                    props.authMode === "register" ? "10文字以上" : "パスワード"
                  }
                  required
                  minLength={props.authMode === "register" ? 10 : 6}
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
            </div>
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
                {props.accountType === "student" ? (
                  <>
                    <Field label="表示名">
                      <input
                        required
                        maxLength={80}
                        value={props.displayName}
                        onChange={(event) =>
                          props.setDisplayName(event.target.value)
                        }
                      />
                    </Field>
                    <div className="form-grid">
                      <Field label="学科">
                        <input
                          maxLength={80}
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
                          required
                          value={props.grade}
                          onChange={(event) =>
                            props.setGrade(Number(event.target.value))
                          }
                        />
                      </Field>
                    </div>
                    <Field label="興味分野">
                      <input
                        maxLength={200}
                        value={props.interestText}
                        onChange={(event) =>
                          props.setInterestText(event.target.value)
                        }
                      />
                    </Field>
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
                ) : (
                  <Field label="団体・自治体名">
                    <input
                      required
                      maxLength={100}
                      autoComplete="organization"
                      value={props.organizationName}
                      onChange={(event) =>
                        props.setOrganizationName(event.target.value)
                      }
                    />
                  </Field>
                )}
              </>
            )}
            {props.authMode === "register" && (
              <div className="auth-legal-consent">
                <label>
                  <input
                    type="checkbox"
                    required
                    checked={props.hasAcceptedLegal}
                    onChange={(event) =>
                      props.setHasAcceptedLegal(event.target.checked)
                    }
                  />
                  <span>利用規約とプライバシーポリシーに同意します</span>
                </label>
                <p>
                  内容を読む：
                  <button
                    type="button"
                    onClick={() => setLegalDocument("terms")}
                  >
                    利用規約
                  </button>
                  <span aria-hidden="true"> / </span>
                  <button
                    type="button"
                    onClick={() => setLegalDocument("privacy")}
                  >
                    プライバシーポリシー
                  </button>
                </p>
              </div>
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
                ? "登録して始める"
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
          {props.message && (
            <div className="form-message" role="status" aria-live="polite">
              {props.message}
            </div>
          )}
          <p className="form-footnote">
            登録後、誰でもイベント企画を申請できます。会津大学メール以外の方は管理者が確認します。
          </p>
          {props.authMode === "login" && (
            <p className="legal-links">
              <button type="button" onClick={() => setLegalDocument("terms")}>
                利用規約
              </button>
              と
              <button type="button" onClick={() => setLegalDocument("privacy")}>
                プライバシーポリシー
              </button>
              を確認できます。
            </p>
          )}
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
        {notice && (
          <div className="notice" role="status" aria-live="polite">
            {notice}
          </div>
        )}
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

function AdminApprovalPendingScreen({
  appUser,
  onLogout,
}: {
  appUser: AppUser;
  onLogout: () => void;
}) {
  return (
    <main className="loading-screen">
      <div className="pending-card approval-pending-card">
        <div className="brand-mark">A</div>
        <p className="eyebrow">ADMIN REVIEW</p>
        <h1>承認待ちです</h1>
        <p>
          {appUser.displayName}
          さんのメール認証は完了しています。利用開始に必要なのは管理者の承認のみです。
          {appUser.role === "organization"
            ? "確認が完了したら、活動を掲載できます。"
            : "確認が完了したら、イベントへの参加を始められます。"}
        </p>
        <ol
          className="approval-progress"
          aria-label="アカウント利用開始までの状況"
        >
          <li className="is-complete">
            <CheckCircle2 size={19} />
            <span>
              <strong>アカウント登録</strong>
              <small>完了</small>
            </span>
          </li>
          <li className="is-complete">
            <CheckCircle2 size={19} />
            <span>
              <strong>メール認証</strong>
              <small>完了</small>
            </span>
          </li>
          <li className="is-current">
            <ShieldCheck size={19} />
            <span>
              <strong>管理者確認</strong>
              <small>確認中</small>
            </span>
          </li>
        </ol>
        <div className="pending-help">
          <RefreshCw size={17} />
          <span>
            承認されると自動的に利用画面へ切り替わります。再読み込みや再ログインは必要ありません。
          </span>
        </div>
        <button className="secondary-action" type="button" onClick={onLogout}>
          <LogOut size={17} /> ログアウト
        </button>
      </div>
    </main>
  );
}

function AccountSetupScreen({
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
        <p className="eyebrow">ACCOUNT STATUS</p>
        <h1>登録状態を確認しています</h1>
        <p>
          {appUser.displayName}
          さんの登録情報を確認しています。状態が変わらない場合は、登録したメールアドレスから運営へお問い合わせください。
        </p>
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
        <h1>
          {appUser.status === "suspended"
            ? "アカウントを確認してください"
            : "登録内容を確認してください"}
        </h1>
        <p>
          {appUser.displayName}
          さんの
          {appUser.status === "suspended"
            ? "アカウントは現在利用を停止しています。"
            : "登録は、現在の内容では承認されませんでした。"}
        </p>
        {(appUser.moderationReason || appUser.reviewReason) && (
          <div className="pending-help">
            <Flag size={17} />
            <span>
              <strong>運営からの案内</strong>
              <br />
              {appUser.moderationReason || appUser.reviewReason}
            </span>
          </div>
        )}
        <p>
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
  accountDeletionRequest,
  onRequestAccountDeletion,
  onCancelAccountDeletion,
  onClose,
  onLogout,
}: {
  appUser: AppUser;
  accountDeletionRequest: AccountDeletionRequest | null;
  onRequestAccountDeletion: (reason: string) => Promise<void>;
  onCancelAccountDeletion: () => Promise<void>;
  onClose?: () => void;
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
  const [endAtInput, setEndAtInput] = useState("");
  const [capacity, setCapacity] = useState(20);
  const [category, setCategory] = useState("交流・コミュニティ");
  const [feeType, setFeeType] = useState<AizuEvent["feeType"]>("無料");
  const [feeAmount, setFeeAmount] = useState(0);
  const [eventFormat, setEventFormat] =
    useState<AizuEvent["eventFormat"]>("現地");
  const [meetingPoint, setMeetingPoint] = useState("会津若松市");
  const [accessInfo, setAccessInfo] = useState("");
  const [bringItems, setBringItems] = useState("特になし");
  const [cancellationPolicy, setCancellationPolicy] = useState(
    "参加できなくなった場合は、開催前日までに活動ページからキャンセルしてください。",
  );
  const [weatherPolicy, setWeatherPolicy] = useState(
    "変更・中止の場合は通知と全体チャットで案内します。",
  );
  const [accessibility, setAccessibility] = useState(
    "必要な配慮は参加申請時にお知らせください。",
  );
  const [contactMethod, setContactMethod] = useState(
    "申請後の個別チャットでお問い合わせください。",
  );
  const [organizerDescription, setOrganizerDescription] = useState(
    "参加者が安心して参加できるよう、事前連絡と当日の案内を行います。",
  );
  const [organizerExperience, setOrganizerExperience] = useState(
    "Aizu Connectでイベントを企画",
  );
  const [templateKey, setTemplateKey] = useState<string>(eventTemplates[0].key);
  const [beginnerLevel, setBeginnerLevel] =
    useState<AizuEvent["beginnerLevel"]>("初参加歓迎");
  const [takeawayText, setTakeawayText] = useState("");
  const [eventImageFile, setEventImageFile] = useState<File | null>(null);
  const [eventImagePreview, setEventImagePreview] = useState<string | null>(
    eventTemplates[0].imageUrl,
  );
  const [isEventImageReviewOpen, setIsEventImageReviewOpen] = useState(false);
  const [isEventPreviewOpen, setIsEventPreviewOpen] = useState(false);
  const [eventImageInputKey, setEventImageInputKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatMessageLimit, setChatMessageLimit] = useState(100);
  const [hasOlderChatMessages, setHasOlderChatMessages] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [chatReadReceipts, setChatReadReceipts] = useState<ChatReadReceipt[]>(
    [],
  );
  const [chatPreferences, setChatPreferences] = useState<ChatPreference[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [eventSearch, setEventSearch] = useState("");
  const [eventStatusFilter, setEventStatusFilter] = useState<
    "all" | AizuEvent["status"]
  >("all");
  const [eventSort, setEventSort] = useState<"date" | "newest">("date");
  const [applicantSearch, setApplicantSearch] = useState("");
  const [applicantStatusFilter, setApplicantStatusFilter] = useState<
    "all" | EventApplication["status"]
  >("all");
  const [selectedApplicantIds, setSelectedApplicantIds] = useState<string[]>(
    [],
  );
  const [eventCancellationTarget, setEventCancellationTarget] =
    useState<AizuEvent | null>(null);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [checkInCode, setCheckInCode] = useState("");
  const [pendingApplicationUpdate, setPendingApplicationUpdate] = useState<{
    application: EventApplication;
    status: "rejected" | "absent";
  } | null>(null);
  const eventFormSectionRef = useRef<HTMLElement>(null);
  const eventListSectionRef = useRef<HTMLElement>(null);
  const applicantSectionRef = useRef<HTMLElement>(null);
  const messagesSectionRef = useRef<HTMLDivElement>(null);

  const organizationName = appUser.organizationName || appUser.displayName;
  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const selectedTemplate =
    eventTemplates.find((template) => template.key === templateKey) ??
    eventTemplates[0];
  const visibleEvents = useMemo(
    () =>
      [...events]
        .filter(
          (event) =>
            eventStatusFilter === "all" || event.status === eventStatusFilter,
        )
        .filter((event) =>
          [event.title, event.location, event.organizationName]
            .join(" ")
            .toLowerCase()
            .includes(eventSearch.trim().toLowerCase()),
        )
        .sort((left, right) =>
          eventSort === "newest"
            ? timestampMillis(right.createdAt) - timestampMillis(left.createdAt)
            : timestampMillis(left.startAt) - timestampMillis(right.startAt),
        ),
    [eventSearch, eventSort, eventStatusFilter, events],
  );
  const visibleApplications = useMemo(
    () =>
      applications.filter(
        (application) =>
          (applicantStatusFilter === "all" ||
            application.status === applicantStatusFilter) &&
          [
            application.studentName,
            application.participantMessage ?? "",
            application.accessibilityNeeds ?? "",
            application.organizerNote ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(applicantSearch.trim().toLowerCase()),
      ),
    [applicantSearch, applicantStatusFilter, applications],
  );
  const applicantMetrics = useMemo(
    () => ({
      total: applications.length,
      pending: applications.filter((item) => item.status === "pending").length,
      waitlisted: applications.filter((item) => item.status === "waitlisted")
        .length,
      confirmed: applications.filter((item) => item.status === "confirmed")
        .length,
      attended: applications.filter((item) => item.status === "attended")
        .length,
      absent: applications.filter((item) => item.status === "absent").length,
    }),
    [applications],
  );
  const unreadChatCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    notifications.forEach((notification) => {
      if (
        !notification.isRead &&
        notification.targetType === "chat" &&
        notification.targetId
      ) {
        counts[notification.targetId] =
          (counts[notification.targetId] ?? 0) + 1;
      }
    });
    return counts;
  }, [notifications]);
  const unreadChatTotal = Object.values(unreadChatCounts).reduce(
    (sum, count) => sum + count,
    0,
  );

  const scrollToManagementSection = (element: HTMLElement | null) => {
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const beginEditEvent = (event: AizuEvent) => {
    setEditingEventId(event.id);
    setTitle(event.title);
    setSummary(event.summary);
    setLocation(event.location);
    setStartAtInput(toDateTimeInput(event.startAt));
    setEndAtInput(toDateTimeInput(event.endAt));
    setCapacity(event.capacity);
    setCategory(event.category);
    setFeeType(event.feeType ?? "無料");
    setFeeAmount(event.feeAmount ?? 0);
    setEventFormat(event.eventFormat ?? "現地");
    setMeetingPoint(event.meetingPoint ?? event.location);
    setAccessInfo(event.accessInfo ?? "");
    setBringItems(event.bringItems ?? "特になし");
    setCancellationPolicy(
      event.cancellationPolicy ??
        "参加できなくなった場合は、開催前日までに活動ページからキャンセルしてください。",
    );
    setWeatherPolicy(
      event.weatherPolicy ??
        "変更・中止の場合は通知と全体チャットで案内します。",
    );
    setAccessibility(
      event.accessibility ?? "必要な配慮は参加申請時にお知らせください。",
    );
    setContactMethod(
      event.contactMethod ?? "申請後の個別チャットでお問い合わせください。",
    );
    setOrganizerDescription(
      event.organizerDescription ??
        "参加者が安心して参加できるよう、事前連絡と当日の案内を行います。",
    );
    setOrganizerExperience(
      event.organizerExperience ?? "Aizu Connectでイベントを企画",
    );
    setTemplateKey(event.templateKey ?? eventTemplates[0].key);
    setBeginnerLevel(event.beginnerLevel ?? "誰でも歓迎");
    setTakeawayText((event.takeaways ?? defaultTakeaways).join("\n"));
    setEventImageFile(null);
    setEventImagePreview(event.imageUrl);
    setIsEventImageReviewOpen(false);
    setNotice(
      event.status === "published"
        ? "公開中イベントの変更は、再審査後に反映されます。"
        : "イベントを修正して再申請できます。",
    );
    window.setTimeout(
      () => scrollToManagementSection(eventFormSectionRef.current),
      0,
    );
  };

  const clearEventForm = () => {
    setEditingEventId(null);
    setTitle("");
    setSummary("");
    setLocation("会津若松市");
    setStartAtInput("");
    setEndAtInput("");
    setCapacity(20);
    setCategory("交流・コミュニティ");
    setFeeType("無料");
    setFeeAmount(0);
    setEventFormat("現地");
    setMeetingPoint("会津若松市");
    setAccessInfo("");
    setBringItems("特になし");
    setCancellationPolicy(
      "参加できなくなった場合は、開催前日までに活動ページからキャンセルしてください。",
    );
    setWeatherPolicy("変更・中止の場合は通知と全体チャットで案内します。");
    setAccessibility("必要な配慮は参加申請時にお知らせください。");
    setContactMethod("申請後の個別チャットでお問い合わせください。");
    setOrganizerDescription(
      "参加者が安心して参加できるよう、事前連絡と当日の案内を行います。",
    );
    setOrganizerExperience("Aizu Connectでイベントを企画");
    setTemplateKey(eventTemplates[0].key);
    setBeginnerLevel("初参加歓迎");
    setTakeawayText("");
    setEventImageFile(null);
    setEventImagePreview(eventTemplates[0].imageUrl);
    setIsEventImageReviewOpen(false);
  };

  const duplicateEvent = (event: AizuEvent) => {
    beginEditEvent(event);
    setEditingEventId(null);
    setSelectedEventId(null);
    setTitle(`${event.title}（複製）`.slice(0, 80));
    setStartAtInput("");
    setEndAtInput("");
    setNotice("イベントを複製しました。開催日時を設定して申請してください。");
  };

  useEffect(() => {
    const stored = window.localStorage.getItem(
      `aizu-connect:event-draft:${appUser.uid}`,
    );
    if (stored) {
      try {
        const draft = JSON.parse(stored) as Record<string, unknown>;
        const draftTemplate =
          eventTemplates.find(
            (template) => template.key === String(draft.templateKey ?? ""),
          ) ?? eventTemplates[0];
        const restoredTitle =
          String(draft.title ?? "") === draftTemplate.title
            ? ""
            : String(draft.title ?? "");
        const restoredSummary =
          String(draft.summary ?? "") === draftTemplate.summary
            ? ""
            : String(draft.summary ?? "");
        const restoredTakeaways =
          String(draft.takeawayText ?? "") ===
          draftTemplate.takeaways.join("\n")
            ? ""
            : String(draft.takeawayText ?? "");
        const hasMeaningfulDraft = [
          restoredTitle,
          restoredSummary,
          draft.startAtInput,
        ].some((value) => typeof value === "string" && value.trim().length > 0);
        if (!hasMeaningfulDraft) {
          window.localStorage.removeItem(
            `aizu-connect:event-draft:${appUser.uid}`,
          );
          setIsDraftReady(true);
          return;
        }
        setTitle(restoredTitle);
        setSummary(restoredSummary);
        setLocation(String(draft.location ?? "会津若松市"));
        setMeetingPoint(String(draft.meetingPoint ?? "会津若松市"));
        setStartAtInput(String(draft.startAtInput ?? ""));
        setEndAtInput(String(draft.endAtInput ?? ""));
        setCapacity(Number(draft.capacity ?? 20));
        setCategory(String(draft.category ?? "交流・コミュニティ"));
        setTemplateKey(String(draft.templateKey ?? eventTemplates[0].key));
        setBeginnerLevel(
          (draft.beginnerLevel as AizuEvent["beginnerLevel"]) ?? "初参加歓迎",
        );
        setTakeawayText(restoredTakeaways);
        setFeeType((draft.feeType as AizuEvent["feeType"]) ?? "無料");
        setFeeAmount(Number(draft.feeAmount ?? 0));
        setEventFormat(
          (draft.eventFormat as AizuEvent["eventFormat"]) ?? "現地",
        );
        setAccessInfo(String(draft.accessInfo ?? ""));
        setBringItems(String(draft.bringItems ?? "特になし"));
        setCancellationPolicy(String(draft.cancellationPolicy ?? ""));
        setWeatherPolicy(String(draft.weatherPolicy ?? ""));
        setAccessibility(String(draft.accessibility ?? ""));
        setContactMethod(String(draft.contactMethod ?? ""));
        setOrganizerDescription(String(draft.organizerDescription ?? ""));
        setOrganizerExperience(String(draft.organizerExperience ?? ""));
        setNotice("保存されていた下書きを復元しました。");
      } catch {
        window.localStorage.removeItem(
          `aizu-connect:event-draft:${appUser.uid}`,
        );
      }
    }
    setIsDraftReady(true);
  }, [appUser.uid]);

  useEffect(() => {
    if (!isDraftReady || editingEventId) return;
    const draft = {
      title,
      summary,
      location,
      meetingPoint,
      startAtInput,
      endAtInput,
      capacity,
      category,
      templateKey,
      beginnerLevel,
      takeawayText,
      feeType,
      feeAmount,
      eventFormat,
      accessInfo,
      bringItems,
      cancellationPolicy,
      weatherPolicy,
      accessibility,
      contactMethod,
      organizerDescription,
      organizerExperience,
    };
    const timer = window.setTimeout(() => {
      const hasMeaningfulDraft = Boolean(
        title.trim() || summary.trim() || startAtInput.trim(),
      );
      if (hasMeaningfulDraft) {
        window.localStorage.setItem(
          `aizu-connect:event-draft:${appUser.uid}`,
          JSON.stringify(draft),
        );
      } else {
        window.localStorage.removeItem(
          `aizu-connect:event-draft:${appUser.uid}`,
        );
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    accessInfo,
    accessibility,
    appUser.uid,
    beginnerLevel,
    bringItems,
    cancellationPolicy,
    capacity,
    category,
    contactMethod,
    editingEventId,
    endAtInput,
    eventFormat,
    feeAmount,
    feeType,
    isDraftReady,
    location,
    meetingPoint,
    organizerDescription,
    organizerExperience,
    startAtInput,
    summary,
    takeawayText,
    templateKey,
    title,
    weatherPolicy,
  ]);

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
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientId", "==", appUser.uid),
      limit(100),
    );
    return onSnapshot(
      notificationsQuery,
      (snapshot) =>
        setNotifications(
          snapshot.docs.map((notificationDoc) => ({
            id: notificationDoc.id,
            ...notificationDoc.data(),
          })) as NotificationItem[],
        ),
      () => setNotice("通知を取得できませんでした。"),
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
      where("eventId", "==", selectedEventId),
      limit(1000),
    );
    return onSnapshot(
      applicationsQuery,
      (snapshot) =>
        setApplications(
          snapshot.docs.map((applicationDoc) => ({
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
    const preferencesQuery = query(
      collection(db, "chatPreferences"),
      where("userId", "==", appUser.uid),
      limit(100),
    );
    return onSnapshot(
      preferencesQuery,
      (snapshot) =>
        setChatPreferences(
          snapshot.docs.map(
            (preferenceDoc) => preferenceDoc.data() as ChatPreference,
          ),
        ),
      () => setNotice("チャット通知設定を取得できませんでした。"),
    );
  }, [appUser.uid]);

  useEffect(() => {
    if (!activeRoomId) {
      setChatMessages([]);
      setHasOlderChatMessages(false);
      return;
    }
    return onSnapshot(
      query(
        collection(db, "chatRooms", activeRoomId, "messages"),
        orderBy("createdAt", "asc"),
        limitToLast(chatMessageLimit),
      ),
      (snapshot) => {
        setChatMessages(
          snapshot.docs.map((messageDoc) => ({
            id: messageDoc.id,
            ...messageDoc.data(),
          })) as ChatMessage[],
        );
        setHasOlderChatMessages(snapshot.size === chatMessageLimit);
      },
      () => setNotice("チャットを取得できませんでした。"),
    );
  }, [activeRoomId, chatMessageLimit]);

  useEffect(() => {
    if (!activeRoomId) {
      setChatReadReceipts([]);
      return;
    }
    void setDoc(
      doc(db, "chatRooms", activeRoomId, "reads", appUser.uid),
      { userId: appUser.uid, readAt: serverTimestamp() },
      { merge: true },
    ).catch((error: unknown) => setNotice(getFirebaseErrorMessage(error)));
    return onSnapshot(
      collection(db, "chatRooms", activeRoomId, "reads"),
      (snapshot) =>
        setChatReadReceipts(
          snapshot.docs.map(
            (receiptDoc) => receiptDoc.data() as ChatReadReceipt,
          ),
        ),
      () => setNotice("既読情報を取得できませんでした。"),
    );
  }, [activeRoomId, appUser.uid]);

  useEffect(() => {
    setSelectedApplicantIds([]);
    if (!selectedEventId) {
      setCheckInCode("");
      return;
    }
    void getDoc(doc(db, "eventCheckIns", selectedEventId))
      .then((snapshot) =>
        setCheckInCode(
          snapshot.exists() ? String(snapshot.data().code ?? "") : "",
        ),
      )
      .catch(() => setCheckInCode(""));
  }, [selectedEventId]);

  const sendOrganizationMessage = async () => {
    if (!activeRoomId || !messageDraft.trim()) return;
    const text = messageDraft.trim().slice(0, 2000);
    setMessageDraft("");
    try {
      const roomRef = doc(db, "chatRooms", activeRoomId);
      const messageRef = doc(collection(roomRef, "messages"));
      const batch = writeBatch(db);
      batch.set(messageRef, {
        roomId: activeRoomId,
        senderId: appUser.uid,
        senderName: organizationName,
        type: "text",
        text,
        createdAt: serverTimestamp(),
      });
      batch.update(roomRef, {
        lastMessageText: text,
        lastMessageAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      setMessageDraft((current) => current || text);
      setNotice(getFirebaseErrorMessage(error));
    }
  };

  const uploadOrganizationAttachment = async (file: File) => {
    if (!activeRoomId) return;
    validateChatAttachment(file);
    const attachmentUrl = await uploadImage(
      file,
      `chat-attachments/${activeRoomId}/${appUser.uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
    );
    const messageType = file.type.startsWith("image/") ? "image" : "file";
    const roomRef = doc(db, "chatRooms", activeRoomId);
    const messageRef = doc(collection(roomRef, "messages"));
    const batch = writeBatch(db);
    batch.set(messageRef, {
      roomId: activeRoomId,
      senderId: appUser.uid,
      senderName: organizationName,
      type: messageType,
      text: file.name.slice(0, 200),
      attachmentUrl,
      attachmentName: file.name.slice(0, 200),
      attachmentType: file.type,
      attachmentSize: file.size,
      createdAt: serverTimestamp(),
    });
    batch.update(roomRef, {
      lastMessageText: `${messageType === "image" ? "画像" : "ファイル"}を送信しました`,
      lastMessageAt: serverTimestamp(),
    });
    await batch.commit();
  };

  const selectOrganizationChatRoom = (roomId: string) => {
    if (roomId !== activeRoomId) {
      setChatMessageLimit(100);
    }
    setActiveRoomId(roomId);
    const unread = notifications.filter(
      (notification) =>
        !notification.isRead &&
        notification.targetType === "chat" &&
        notification.targetId === roomId,
    );
    if (unread.length === 0) return;
    setNotifications((current) =>
      current.map((notification) =>
        unread.some((item) => item.id === notification.id)
          ? { ...notification, isRead: true }
          : notification,
      ),
    );
    void Promise.all(
      unread.map((notification) =>
        updateDoc(doc(db, "notifications", notification.id), {
          isRead: true,
          readAt: serverTimestamp(),
        }),
      ),
    ).catch((error: unknown) => setNotice(getFirebaseErrorMessage(error)));
  };

  const toggleOrganizationChatMute = async (roomId: string) => {
    const current = chatPreferences.find(
      (preference) => preference.roomId === roomId,
    );
    await setDoc(
      doc(db, "chatPreferences", `${roomId}_${appUser.uid}`),
      {
        userId: appUser.uid,
        roomId,
        muted: !current?.muted,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  };

  const saveRoomMeta = async (
    room: ChatRoom,
    updates: Pick<ChatRoom, "pinnedMessage" | "organizerNotice">,
  ) => {
    await updateDoc(doc(db, "chatRooms", room.id), {
      pinnedMessage: updates.pinnedMessage ?? "",
      organizerNotice: updates.organizerNotice ?? "",
      updatedAt: serverTimestamp(),
    });
    setNotice("全体チャットのお知らせを更新しました。");
  };

  const exportSelectedEventReport = () => {
    if (!selectedEvent) {
      setNotice("レポートを出力するイベントを選択してください。");
      return;
    }
    const rows = [
      [
        "イベント名",
        "開催日時",
        "定員",
        "申請数",
        "参加者名",
        "状態",
        "申請日時",
        "参加者メッセージ",
        "必要な配慮",
        "緊急連絡先",
        "運営メモ",
      ],
      ...applications.map((application) => [
        selectedEvent.title,
        selectedEvent.startAtLabel,
        selectedEvent.capacity,
        selectedEvent.applicantCount,
        application.studentName,
        applicationStatusLabel(application.status),
        application.createdAt?.toDate?.().toLocaleString("ja-JP") ?? "",
        application.participantMessage ?? "",
        application.accessibilityNeeds ?? "",
        application.emergencyContact ?? "",
        application.organizerNote ?? "",
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => csvEscape(value)).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedEvent.title}-参加者レポート.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("参加者レポートを出力しました。");
  };

  const applyTemplate = (template: (typeof eventTemplates)[number]) => {
    setTemplateKey(template.key);
    setCategory(template.category);
    setBeginnerLevel(template.beginnerLevel);
    setEventImageFile(null);
    setEventImagePreview(template.imageUrl);
    setNotice(
      "テンプレートの例文を表示しました。入力した内容だけが保存されます。",
    );
  };

  const createEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !title.trim() ||
      !summary.trim() ||
      !takeawayText.trim() ||
      !startAtInput.trim()
    ) {
      setNotice("タイトル、概要、得られること、開催日時を入力してください。");
      return;
    }
    const startAtDate = new Date(startAtInput);
    if (Number.isNaN(startAtDate.getTime())) {
      setNotice("開催日時の形式を確認してください。");
      return;
    }
    if (!isFutureEventStart(startAtDate)) {
      setNotice("開催日時は現在より後の日時を指定してください。");
      return;
    }
    const endAtDate = endAtInput
      ? new Date(endAtInput)
      : new Date(startAtDate.getTime() + 2 * 60 * 60 * 1000);
    if (
      Number.isNaN(endAtDate.getTime()) ||
      endAtDate.getTime() <= startAtDate.getTime()
    ) {
      setNotice("終了日時は開催日時より後にしてください。");
      return;
    }
    setIsLoading(true);
    setNotice("");
    try {
      const eventId = editingEventId ?? doc(collection(db, "events")).id;
      const takeaways = takeawayText
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3);
      const currentEvent = events.find((item) => item.id === eventId);
      const templateImage =
        eventTemplates.find((template) => template.key === templateKey)
          ?.imageUrl ?? eventTemplates[0].imageUrl;
      const imageUrl = eventImageFile
        ? await uploadImage(
            eventImageFile,
            `event-images/${appUser.uid}/${eventId}/cover-${Date.now()}`,
          )
        : new URL(
            currentEvent?.imageUrl ?? templateImage,
            window.location.origin,
          ).toString();
      if (!imageUrl) {
        throw new Error(
          "イベント画像を設定できませんでした。もう一度お試しください。",
        );
      }
      const eventData = {
        title: title.trim().slice(0, 80),
        summary: summary.trim().slice(0, 220),
        category,
        location: location.trim().slice(0, 80),
        startAtMillis: startAtDate.getTime(),
        endAtMillis: endAtDate.getTime(),
        feeType: feeType ?? "無料",
        feeAmount:
          feeType === "有料"
            ? Math.max(0, Math.min(Number(feeAmount) || 0, 1_000_000))
            : 0,
        eventFormat: eventFormat ?? "現地",
        meetingPoint: meetingPoint.trim().slice(0, 160),
        accessInfo: accessInfo.trim().slice(0, 300),
        bringItems: bringItems.trim().slice(0, 300),
        cancellationPolicy: cancellationPolicy.trim().slice(0, 500),
        weatherPolicy: weatherPolicy.trim().slice(0, 500),
        accessibility: accessibility.trim().slice(0, 500),
        contactMethod: contactMethod.trim().slice(0, 300),
        capacity: Math.round(Math.max(1, Math.min(capacity, 1000))),
        imageUrl,
        templateKey,
        beginnerLevel,
        takeaways,
        organizerDescription: organizerDescription.trim().slice(0, 500),
        organizerExperience: organizerExperience.trim().slice(0, 300),
      };
      const savePlan = httpsCallable<
        {
          eventId: string;
          mode: "create" | "update";
          event: Record<string, unknown>;
        },
        { eventId: string; status: "pending_review" }
      >(functions, "saveEventPlan");
      await savePlan({
        eventId,
        mode: editingEventId ? "update" : "create",
        event: eventData,
      });
      window.localStorage.removeItem(`aizu-connect:event-draft:${appUser.uid}`);
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

  const bulkUpdateApplications = async (
    targetStatus: "confirmed" | "attended",
  ) => {
    const targets = applications.filter(
      (application) =>
        selectedApplicantIds.includes(application.id) &&
        (targetStatus === "confirmed"
          ? application.status === "pending"
          : application.status === "confirmed"),
    );
    if (targets.length === 0) {
      setNotice("更新できる参加者を選択してください。");
      return;
    }
    const batch = writeBatch(db);
    targets.forEach((application) =>
      batch.update(doc(db, "eventApplications", application.id), {
        status: targetStatus,
      }),
    );
    await batch.commit();
    setSelectedApplicantIds([]);
    setNotice(
      targetStatus === "confirmed"
        ? `${targets.length}名を参加確定にしました。`
        : `${targets.length}名を出席として記録しました。`,
    );
  };

  const saveOrganizerNote = async (
    application: EventApplication,
    organizerNote: string,
  ) => {
    await updateDoc(doc(db, "eventApplications", application.id), {
      organizerNote: organizerNote.trim().slice(0, 500),
    });
    setNotice(`${application.studentName}さんの運営メモを保存しました。`);
  };

  const openApplicantChat = (application: EventApplication) => {
    const room = chatRooms.find(
      (chatRoom) =>
        chatRoom.applicationId === application.id &&
        chatRoom.roomType !== "event",
    );
    if (!room) {
      setNotice("この参加者の個別チャットはまだ作成されていません。");
      return;
    }
    selectOrganizationChatRoom(room.id);
    scrollToManagementSection(messagesSectionRef.current);
  };

  const cancelManagedEvent = async (event: AizuEvent, reason: string) => {
    await updateDoc(doc(db, "events", event.id), {
      status: "cancelled",
      cancellationReason: reason.trim().slice(0, 500),
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setSelectedEventId(null);
    setEventCancellationTarget(null);
    setNotice("イベントを中止し、参加者への通知処理を開始しました。");
  };

  const selectManagedEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    window.setTimeout(
      () => scrollToManagementSection(applicantSectionRef.current),
      0,
    );
  };

  const openManagedMessages = () => {
    const selectedRoom = selectedEventId
      ? (chatRooms.find(
          (room) =>
            room.eventId === selectedEventId && room.roomType === "event",
        ) ?? chatRooms.find((room) => room.eventId === selectedEventId))
      : undefined;
    if (selectedRoom) selectOrganizationChatRoom(selectedRoom.id);
    scrollToManagementSection(messagesSectionRef.current);
  };

  const previewStartAt = startAtInput ? new Date(startAtInput) : undefined;
  const previewEndAt = endAtInput ? new Date(endAtInput) : undefined;
  const previewEvent: AizuEvent = {
    id: editingEventId ?? "preview",
    title: title.trim() || "イベント名",
    summary: summary.trim() || "イベントの概要がここに表示されます。",
    category,
    location: location.trim() || "会津若松市",
    startAtLabel: startAtInput ? formatEventStart(startAtInput) : "日時未設定",
    startAt:
      previewStartAt && Number.isFinite(previewStartAt.getTime())
        ? Timestamp.fromDate(previewStartAt)
        : undefined,
    endAtLabel:
      previewEndAt && Number.isFinite(previewEndAt.getTime())
        ? new Intl.DateTimeFormat("ja-JP", {
            hour: "numeric",
            minute: "2-digit",
          }).format(previewEndAt)
        : undefined,
    endAt:
      previewEndAt && Number.isFinite(previewEndAt.getTime())
        ? Timestamp.fromDate(previewEndAt)
        : undefined,
    feeType,
    feeAmount,
    eventFormat,
    meetingPoint,
    accessInfo,
    bringItems,
    cancellationPolicy,
    weatherPolicy,
    accessibility,
    contactMethod,
    organizationName,
    status: "pending_review",
    capacity,
    applicantCount: 0,
    imageUrl: eventImagePreview ?? eventTemplates[0].imageUrl,
    tags: [category, "学生歓迎"],
    templateKey,
    beginnerLevel,
    takeaways: takeawayText
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3),
    organizerDescription,
    organizerExperience,
    organizationVerified: appUser.role === "organization",
    createdBy: appUser.uid,
  };

  return (
    <RoleShell
      title={organizationName}
      subtitle="企画ダッシュボード"
      icon={<UsersRound size={19} />}
      onClose={onClose}
      onLogout={onLogout}
    >
      {notice && (
        <div className="notice" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      <nav className="management-nav" aria-label="企画管理メニュー">
        <button
          type="button"
          onClick={() => scrollToManagementSection(eventFormSectionRef.current)}
        >
          <Plus size={18} />
          <span>
            <strong>企画作成</strong>
            <small>テンプレートから作る</small>
          </span>
        </button>
        <button
          type="button"
          onClick={() => scrollToManagementSection(eventListSectionRef.current)}
        >
          <CalendarDays size={18} />
          <span>
            <strong>イベント</strong>
            <small>{events.length}件を管理</small>
          </span>
        </button>
        <button
          type="button"
          onClick={() =>
            scrollToManagementSection(
              selectedEventId
                ? applicantSectionRef.current
                : eventListSectionRef.current,
            )
          }
        >
          <UsersRound size={18} />
          <span>
            <strong>参加者</strong>
            <small>
              {selectedEvent
                ? `確認待ち ${applicantMetrics.pending}件`
                : "イベントを選択"}
            </small>
          </span>
        </button>
        <button type="button" onClick={openManagedMessages}>
          <MessageCircle size={18} />
          <span>
            <strong>連絡</strong>
            <small>
              {unreadChatTotal > 0 ? `未読 ${unreadChatTotal}件` : "未読なし"}
            </small>
          </span>
        </button>
      </nav>
      <div className="role-grid">
        <section
          className="role-card event-form-card"
          ref={eventFormSectionRef}
        >
          <div className="role-card-head">
            <div>
              <p className="eyebrow">PLAN EVENT</p>
              <h2>
                {editingEventId ? "企画を修正する" : "イベントを企画する"}
              </h2>
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
            className="role-form event-plan-form"
            onSubmit={(event) => void createEvent(event)}
          >
            <fieldset className="event-form-section">
              <legend>
                <span className="event-form-step">1</span>
                <span className="event-form-section-title">
                  <strong>基本情報</strong>
                  <small>活動の内容と魅力を入力</small>
                </span>
              </legend>
              <div className="event-form-section-body">
                <div className="template-picker" aria-label="企画テンプレート">
                  {eventTemplates.map((template) => (
                    <button
                      className={templateKey === template.key ? "active" : ""}
                      key={template.key}
                      type="button"
                      onClick={() => applyTemplate(template)}
                    >
                      <Sparkles size={15} />
                      {template.label}
                    </button>
                  ))}
                </div>
                <Field label="活動名">
                  <input
                    required
                    maxLength={80}
                    placeholder={selectedTemplate.title}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </Field>
                <Field label="活動の概要">
                  <textarea
                    required
                    maxLength={220}
                    placeholder={selectedTemplate.summary}
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                  />
                </Field>
                <Field label="参加すると得られること（1行ずつ）">
                  <textarea
                    required
                    maxLength={180}
                    placeholder={selectedTemplate.takeaways.join("\n")}
                    value={takeawayText}
                    onChange={(event) => setTakeawayText(event.target.value)}
                  />
                </Field>
                <Field label="初心者歓迎度">
                  <select
                    value={beginnerLevel}
                    onChange={(event) =>
                      setBeginnerLevel(
                        event.target.value as AizuEvent["beginnerLevel"],
                      )
                    }
                  >
                    <option>初参加歓迎</option>
                    <option>誰でも歓迎</option>
                    <option>少し経験者向け</option>
                  </select>
                </Field>
                <Field label="イベント写真">
                  <div className="image-picker event-image-picker">
                    <div className="event-image-preview">
                      {eventImagePreview ? (
                        <img
                          src={eventImagePreview}
                          alt="イベント画像のプレビュー"
                        />
                      ) : (
                        <span>活動の様子が伝わる写真を選択</span>
                      )}
                    </div>
                    <input
                      key={eventImageInputKey}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        try {
                          validateImageFile(file, "イベント画像");
                          setEventImageFile(file);
                          setEventImagePreview(URL.createObjectURL(file));
                          setNotice("");
                          setIsEventImageReviewOpen(true);
                        } catch (error) {
                          setNotice(getFirebaseErrorMessage(error));
                          event.target.value = "";
                        }
                      }}
                    />
                    <small>JPEG・PNG・WebP / 5MB未満</small>
                  </div>
                </Field>
              </div>
            </fieldset>
            <fieldset className="event-form-section">
              <legend>
                <span className="event-form-step">2</span>
                <span className="event-form-section-title">
                  <strong>開催情報</strong>
                  <small>日時・場所・参加条件を入力</small>
                </span>
              </legend>
              <div className="event-form-section-body">
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
                      onChange={(event) =>
                        setCapacity(Number(event.target.value))
                      }
                    />
                  </Field>
                </div>
                <div className="form-grid">
                  <Field label="開始日時">
                    <input
                      type="datetime-local"
                      required
                      value={startAtInput}
                      min={toDateTimeLocalValue(new Date())}
                      onChange={(event) => {
                        const value = event.target.value;
                        setStartAtInput(value);
                        if (!endAtInput && value) {
                          const start = new Date(value);
                          setEndAtInput(
                            toDateTimeLocalValue(
                              new Date(start.getTime() + 2 * 60 * 60 * 1000),
                            ),
                          );
                        }
                      }}
                      onInput={(event) => {
                        const value = event.currentTarget.value;
                        setStartAtInput(value);
                        if (!endAtInput && value) {
                          const start = new Date(value);
                          setEndAtInput(
                            toDateTimeLocalValue(
                              new Date(start.getTime() + 2 * 60 * 60 * 1000),
                            ),
                          );
                        }
                      }}
                    />
                  </Field>
                  <Field label="終了日時">
                    <input
                      type="datetime-local"
                      required
                      value={endAtInput}
                      min={startAtInput || toDateTimeLocalValue(new Date())}
                      onChange={(event) => setEndAtInput(event.target.value)}
                      onInput={(event) =>
                        setEndAtInput(event.currentTarget.value)
                      }
                    />
                  </Field>
                </div>
                <div className="form-grid">
                  <Field label="開催形式">
                    <select
                      value={eventFormat}
                      onChange={(event) =>
                        setEventFormat(
                          event.target.value as AizuEvent["eventFormat"],
                        )
                      }
                    >
                      <option>現地</option>
                      <option>オンライン</option>
                      <option>ハイブリッド</option>
                    </select>
                  </Field>
                  <Field label="料金">
                    <select
                      value={feeType}
                      onChange={(event) =>
                        setFeeType(event.target.value as AizuEvent["feeType"])
                      }
                    >
                      <option>無料</option>
                      <option>有料</option>
                    </select>
                  </Field>
                </div>
                {feeType === "有料" && (
                  <Field label="参加費（円）">
                    <input
                      type="number"
                      min={0}
                      max={1_000_000}
                      required
                      value={feeAmount}
                      onChange={(event) =>
                        setFeeAmount(Number(event.target.value))
                      }
                    />
                  </Field>
                )}
                <div className="form-grid">
                  <Field label="開催エリア・場所">
                    <input
                      required
                      maxLength={80}
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                    />
                  </Field>
                  <Field label="集合場所・オンラインURL案内">
                    <input
                      required
                      maxLength={160}
                      value={meetingPoint}
                      onChange={(event) => setMeetingPoint(event.target.value)}
                    />
                  </Field>
                </div>
              </div>
            </fieldset>
            <details
              className="event-form-section event-form-advanced"
              key={editingEventId ?? "new-event"}
              open={editingEventId ? true : undefined}
            >
              <summary>
                <span className="event-form-step">3</span>
                <span className="event-form-section-title">
                  <strong>詳細設定</strong>
                  <small>持ち物・中止時対応・主催者情報</small>
                </span>
                <ChevronRight
                  className="event-form-section-chevron"
                  size={18}
                />
              </summary>
              <div className="event-form-section-body">
                <Field label="アクセス方法">
                  <textarea
                    maxLength={300}
                    value={accessInfo}
                    placeholder="最寄り駅、駐車場、入室方法など"
                    onChange={(event) => setAccessInfo(event.target.value)}
                  />
                </Field>
                <Field label="持ち物・服装">
                  <textarea
                    required
                    maxLength={300}
                    value={bringItems}
                    onChange={(event) => setBringItems(event.target.value)}
                  />
                </Field>
                <Field label="キャンセル方針">
                  <textarea
                    required
                    maxLength={500}
                    value={cancellationPolicy}
                    onChange={(event) =>
                      setCancellationPolicy(event.target.value)
                    }
                  />
                </Field>
                <Field label="雨天・中止時の対応">
                  <textarea
                    required
                    maxLength={500}
                    value={weatherPolicy}
                    onChange={(event) => setWeatherPolicy(event.target.value)}
                  />
                </Field>
                <Field label="バリアフリー・必要な配慮">
                  <textarea
                    required
                    maxLength={500}
                    value={accessibility}
                    onChange={(event) => setAccessibility(event.target.value)}
                  />
                </Field>
                <Field label="問い合わせ方法">
                  <textarea
                    required
                    maxLength={300}
                    value={contactMethod}
                    onChange={(event) => setContactMethod(event.target.value)}
                  />
                </Field>
                <div className="form-grid">
                  <Field label="主催者紹介">
                    <textarea
                      required
                      maxLength={500}
                      value={organizerDescription}
                      onChange={(event) =>
                        setOrganizerDescription(event.target.value)
                      }
                    />
                  </Field>
                  <Field label="主催・開催実績">
                    <textarea
                      required
                      maxLength={300}
                      value={organizerExperience}
                      onChange={(event) =>
                        setOrganizerExperience(event.target.value)
                      }
                    />
                  </Field>
                </div>
              </div>
            </details>
            <div className="event-form-foot">
              <small>
                {editingEventId
                  ? "変更内容は審査後に反映されます"
                  : "入力内容はこの端末へ自動保存されます"}
              </small>
              <div className="row-actions">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => setIsEventPreviewOpen(true)}
                >
                  <Eye size={16} />
                  公開前プレビュー
                </button>
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
                  {editingEventId ? "変更を審査へ送る" : "企画を申請する"}
                </button>
              </div>
            </div>
          </form>
        </section>
        <section
          className="role-card event-list-card"
          ref={eventListSectionRef}
        >
          <div className="role-card-head">
            <div>
              <p className="eyebrow">YOUR PLANS</p>
              <h2>企画したイベント</h2>
            </div>
            <strong>{events.length}件</strong>
          </div>
          <div className="management-filter-bar">
            <div className="conversation-search">
              <Search size={14} />
              <input
                aria-label="企画したイベントを検索"
                value={eventSearch}
                placeholder="イベント名・場所を検索"
                onChange={(event) => setEventSearch(event.target.value)}
              />
            </div>
            <select
              aria-label="イベント状態で絞り込む"
              value={eventStatusFilter}
              onChange={(event) =>
                setEventStatusFilter(
                  event.target.value as "all" | AizuEvent["status"],
                )
              }
            >
              <option value="all">すべての状態</option>
              <option value="published">公開中</option>
              <option value="pending_review">審査中</option>
              <option value="revision_required">修正依頼</option>
              <option value="cancelled">中止</option>
              <option value="unpublished">非公開</option>
            </select>
            <select
              aria-label="イベントを並び替える"
              value={eventSort}
              onChange={(event) =>
                setEventSort(event.target.value as "date" | "newest")
              }
            >
              <option value="date">開催が近い順</option>
              <option value="newest">作成が新しい順</option>
            </select>
          </div>
          <div className="role-list">
            {visibleEvents.length === 0 ? (
              <EmptyRoleState text="まだ企画はありません。" />
            ) : (
              visibleEvents.map((event) => (
                <div className="managed-event-row" key={event.id}>
                  <button
                    className={`role-list-item ${selectedEventId === event.id ? "active" : ""}`}
                    type="button"
                    onClick={() => selectManagedEvent(event.id)}
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
                          : event.status === "revision_required"
                            ? "修正依頼"
                            : event.status === "cancelled"
                              ? "中止"
                              : "非公開"}
                    </em>
                  </button>
                  <div className="managed-event-actions">
                    <button type="button" onClick={() => duplicateEvent(event)}>
                      <Plus size={13} />
                      複製
                    </button>
                    {[
                      "pending_review",
                      "published",
                      "revision_required",
                      "unpublished",
                    ].includes(event.status) && (
                      <button
                        type="button"
                        onClick={() => beginEditEvent(event)}
                      >
                        <Settings size={13} />
                        編集
                      </button>
                    )}
                    {[
                      "published",
                      "pending_review",
                      "revision_required",
                    ].includes(event.status) && (
                      <button
                        className="danger-text"
                        type="button"
                        onClick={() => setEventCancellationTarget(event)}
                      >
                        <X size={13} />
                        中止
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      {isEventImageReviewOpen && eventImagePreview && (
        <ImageReviewDialog
          title="イベント写真を確認"
          imageUrl={eventImagePreview}
          alt="イベント写真の確認用プレビュー"
          onCancel={() => {
            setIsEventImageReviewOpen(false);
            setEventImageFile(null);
            setEventImagePreview(
              editingEventId
                ? (events.find((item) => item.id === editingEventId)
                    ?.imageUrl ?? null)
                : null,
            );
            setEventImageInputKey((current) => current + 1);
          }}
          onConfirm={() => setIsEventImageReviewOpen(false)}
        />
      )}
      {isEventPreviewOpen && (
        <EventDrawer
          event={previewEvent}
          applied={false}
          isLoading={false}
          previewMode
          onApply={() => undefined}
          onReport={() => undefined}
          onClose={() => setIsEventPreviewOpen(false)}
        />
      )}
      {selectedEventId && (
        <section className="role-card applicant-card" ref={applicantSectionRef}>
          <div className="role-card-head">
            <div>
              <p className="eyebrow">APPLICANTS</p>
              <h2>参加者を確認</h2>
              {selectedEvent && <small>{selectedEvent.title}</small>}
            </div>
            <div className="row-actions">
              <button type="button" onClick={exportSelectedEventReport}>
                <Download size={15} />
                レポート出力
              </button>
              {selectedEvent?.status === "revision_required" && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedEvent) beginEditEvent(selectedEvent);
                  }}
                >
                  編集する
                </button>
              )}
              <UsersRound size={20} />
            </div>
          </div>
          {selectedEvent?.revisionReason && (
            <div className="revision-reason-banner">
              <Flag size={16} />
              <span>
                <strong>管理者からの修正依頼</strong>
                <small>{selectedEvent.revisionReason}</small>
              </span>
            </div>
          )}
          {checkInCode && (
            <div className="check-in-panel">
              <span>
                <small>スマホ受付コード</small>
                <strong>{checkInCode}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(checkInCode);
                  setNotice("受付コードをコピーしました。");
                }}
              >
                <LinkIcon size={14} />
                コピー
              </button>
            </div>
          )}
          <div className="applicant-metrics">
            <span>
              <strong>{applicantMetrics.total}</strong>
              <small>申請</small>
            </span>
            <span>
              <strong>{applicantMetrics.pending}</strong>
              <small>確認待ち</small>
            </span>
            <span>
              <strong>{applicantMetrics.waitlisted}</strong>
              <small>キャンセル待ち</small>
            </span>
            <span>
              <strong>{applicantMetrics.confirmed}</strong>
              <small>参加確定</small>
            </span>
            <span>
              <strong>{applicantMetrics.attended}</strong>
              <small>出席</small>
            </span>
            <span>
              <strong>{applicantMetrics.absent}</strong>
              <small>欠席</small>
            </span>
          </div>
          <div className="participant-toolbar">
            <div className="conversation-search">
              <Search size={14} />
              <input
                aria-label="参加者を検索"
                value={applicantSearch}
                placeholder="名前・配慮事項・メモを検索"
                onChange={(event) => setApplicantSearch(event.target.value)}
              />
            </div>
            <select
              aria-label="参加状態で絞り込む"
              value={applicantStatusFilter}
              onChange={(event) =>
                setApplicantStatusFilter(
                  event.target.value as "all" | EventApplication["status"],
                )
              }
            >
              <option value="all">すべての状態</option>
              <option value="pending">確認待ち</option>
              <option value="waitlisted">キャンセル待ち</option>
              <option value="confirmed">参加確定</option>
              <option value="attended">出席済み</option>
              <option value="absent">欠席</option>
              <option value="cancelled">キャンセル</option>
            </select>
            <div className="row-actions">
              <button
                type="button"
                disabled={selectedApplicantIds.length === 0}
                onClick={() =>
                  void bulkUpdateApplications("confirmed").catch((error) =>
                    setNotice(getFirebaseErrorMessage(error)),
                  )
                }
              >
                <Check size={14} />
                選択を承認
              </button>
              <button
                type="button"
                disabled={selectedApplicantIds.length === 0}
                onClick={() =>
                  void bulkUpdateApplications("attended").catch((error) =>
                    setNotice(getFirebaseErrorMessage(error)),
                  )
                }
              >
                <ShieldCheck size={14} />
                選択を出席
              </button>
            </div>
          </div>
          {visibleApplications.length === 0 ? (
            <EmptyRoleState text="この活動にはまだ参加申請がありません。" />
          ) : (
            <div className="applicant-list">
              {visibleApplications.map((application) => (
                <div className="applicant-row" key={application.id}>
                  <label className="applicant-select">
                    <input
                      type="checkbox"
                      aria-label={`${application.studentName}さんを選択`}
                      checked={selectedApplicantIds.includes(application.id)}
                      onChange={(event) =>
                        setSelectedApplicantIds((current) =>
                          event.target.checked
                            ? [...current, application.id]
                            : current.filter((id) => id !== application.id),
                        )
                      }
                    />
                  </label>
                  <div className="applicant-avatar">
                    {application.studentProfileImageUrl ? (
                      <img
                        src={application.studentProfileImageUrl}
                        alt={`${application.studentName}さんのプロフィール画像`}
                      />
                    ) : (
                      <UserRound size={18} />
                    )}
                  </div>
                  <div className="applicant-main">
                    <strong>{application.studentName}</strong>
                    <small>
                      参加申請 · {applicationStatusLabel(application.status)}
                      {application.waitlistPosition
                        ? ` ${application.waitlistPosition}番目`
                        : ""}
                    </small>
                    {application.participantMessage && (
                      <p>{application.participantMessage}</p>
                    )}
                    {application.accessibilityNeeds && (
                      <span className="participant-sensitive-note">
                        <ShieldCheck size={13} />
                        必要な配慮: {application.accessibilityNeeds}
                      </span>
                    )}
                    {application.emergencyContact && (
                      <span className="participant-sensitive-note">
                        緊急連絡: {application.emergencyContact}
                      </span>
                    )}
                    <input
                      className="organizer-note-input"
                      aria-label={`${application.studentName}さんの運営メモ`}
                      defaultValue={application.organizerNote ?? ""}
                      maxLength={500}
                      placeholder="運営メモ（主催者のみ）"
                      onBlur={(event) => {
                        if (
                          event.currentTarget.value.trim() ===
                          (application.organizerNote ?? "")
                        ) {
                          return;
                        }
                        void saveOrganizerNote(
                          application,
                          event.currentTarget.value,
                        ).catch((error) =>
                          setNotice(getFirebaseErrorMessage(error)),
                        );
                      }}
                    />
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
                            setPendingApplicationUpdate({
                              application,
                              status: "rejected",
                            })
                          }
                        >
                          見送り
                        </button>
                      </>
                    )}
                    {application.status === "waitlisted" && (
                      <button
                        className="muted"
                        type="button"
                        onClick={() =>
                          setPendingApplicationUpdate({
                            application,
                            status: "rejected",
                          })
                        }
                      >
                        見送り
                      </button>
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
                            setPendingApplicationUpdate({
                              application,
                              status: "absent",
                            })
                          }
                        >
                          欠席にする
                        </button>
                      </>
                    )}
                    {application.status === "attended" && <em>活動実績済み</em>}
                    <button
                      className="muted"
                      type="button"
                      onClick={() => openApplicantChat(application)}
                    >
                      <MessageCircle size={14} />
                      個別連絡
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <div className="organization-messages-section" ref={messagesSectionRef}>
        <MessagesTab
          rooms={chatRooms}
          activeRoomId={activeRoomId}
          messages={chatMessages}
          hasOlderMessages={hasOlderChatMessages}
          onLoadOlder={() => setChatMessageLimit((current) => current + 100)}
          draft={messageDraft}
          unreadCounts={unreadChatCounts}
          readReceipts={chatReadReceipts}
          mutedRoomIds={chatPreferences
            .filter((preference) => preference.muted)
            .map((preference) => preference.roomId)}
          onSelectRoom={selectOrganizationChatRoom}
          onToggleMute={(roomId) =>
            void toggleOrganizationChatMute(roomId).catch((error) =>
              setNotice(getFirebaseErrorMessage(error)),
            )
          }
          onDraftChange={setMessageDraft}
          onSend={() => void sendOrganizationMessage()}
          onUploadAttachment={async (file) => {
            try {
              await uploadOrganizationAttachment(file);
            } catch (error) {
              setNotice(getFirebaseErrorMessage(error));
            }
          }}
          onSaveRoomMeta={saveRoomMeta}
          currentUserId={appUser.uid}
          currentUserRole="organization"
          onOpenEvent={selectManagedEvent}
        />
      </div>
      <AccountDeletionPanel
        request={accountDeletionRequest}
        onRequest={onRequestAccountDeletion}
        onCancel={onCancelAccountDeletion}
      />
      {pendingApplicationUpdate && (
        <ConfirmDialog
          title={
            pendingApplicationUpdate.status === "rejected"
              ? "参加申請を見送りますか？"
              : "欠席として記録しますか？"
          }
          description={`${pendingApplicationUpdate.application.studentName}さんの「${pendingApplicationUpdate.application.eventTitle}」への参加状態を更新します。`}
          confirmLabel={
            pendingApplicationUpdate.status === "rejected"
              ? "見送る"
              : "欠席にする"
          }
          danger
          onClose={() => setPendingApplicationUpdate(null)}
          onConfirm={() => {
            const { application, status } = pendingApplicationUpdate;
            setPendingApplicationUpdate(null);
            void updateApplicationStatus(application, status);
          }}
        />
      )}
      {eventCancellationTarget && (
        <ActionReasonDialog
          title="イベントを中止"
          description={`「${eventCancellationTarget.title}」を中止し、参加者へ通知します。`}
          label="中止理由"
          placeholder="参加者に伝わる具体的な理由を入力してください"
          confirmLabel="イベントを中止する"
          danger
          onClose={() => setEventCancellationTarget(null)}
          onConfirm={(reason) =>
            void cancelManagedEvent(eventCancellationTarget, reason).catch(
              (error) => setNotice(getFirebaseErrorMessage(error)),
            )
          }
        />
      )}
    </RoleShell>
  );
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [pendingEvents, setPendingEvents] = useState<AizuEvent[]>([]);
  const [pendingUsers, setPendingUsers] = useState<AppUser[]>([]);
  const [pendingReports, setPendingReports] = useState<ReportRecord[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<
    AccountDeletionRequest[]
  >([]);
  const [managedUsers, setManagedUsers] = useState<AppUser[]>([]);
  const [managedEvents, setManagedEvents] = useState<AizuEvent[]>([]);
  const [managedUserQueryLimit, setManagedUserQueryLimit] = useState(50);
  const [managedEventQueryLimit, setManagedEventQueryLimit] = useState(50);
  const [hasMoreManagedUsers, setHasMoreManagedUsers] = useState(false);
  const [hasMoreManagedEvents, setHasMoreManagedEvents] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [adminSearch, setAdminSearch] = useState("");
  const [managedUserStatus, setManagedUserStatus] = useState<
    "active" | "suspended" | "rejected"
  >("active");
  const [reasonAction, setReasonAction] = useState<{
    title: string;
    description: string;
    label: string;
    placeholder: string;
    confirmLabel: string;
    danger?: boolean;
    action: (reason: string) => Promise<void>;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    danger?: boolean;
    action: () => Promise<void>;
  } | null>(null);

  const normalizedAdminSearch = adminSearch.trim().toLowerCase();
  const matchesAdminSearch = (...values: (string | null | undefined)[]) =>
    !normalizedAdminSearch ||
    values
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedAdminSearch);
  const visiblePendingEvents = [...pendingEvents]
    .filter((event) =>
      matchesAdminSearch(event.title, event.organizationName, event.location),
    )
    .sort(
      (left, right) =>
        timestampMillis(left.createdAt) - timestampMillis(right.createdAt),
    );
  const visiblePendingUsers = [...pendingUsers]
    .filter((user) =>
      matchesAdminSearch(user.displayName, user.email, user.university),
    )
    .sort(
      (left, right) =>
        timestampMillis(left.createdAt) - timestampMillis(right.createdAt),
    );
  const visiblePendingReports = [...pendingReports]
    .filter((report) =>
      matchesAdminSearch(report.targetTitle, report.reason, report.description),
    )
    .sort(
      (left, right) =>
        timestampMillis(left.createdAt) - timestampMillis(right.createdAt),
    );
  const visibleDeletionRequests = [...deletionRequests]
    .filter((request) => {
      const user = managedUsers.find((item) => item.uid === request.userId);
      return matchesAdminSearch(
        request.userId,
        request.reason,
        user?.displayName,
        user?.email,
      );
    })
    .sort(
      (left, right) =>
        timestampMillis(left.requestedAt) - timestampMillis(right.requestedAt),
    );
  const visibleManagedUsers = managedUsers
    .filter((user) => user.status === managedUserStatus)
    .filter((user) =>
      matchesAdminSearch(user.displayName, user.email, user.university),
    );
  const visibleManagedEvents = managedEvents.filter((event) =>
    matchesAdminSearch(event.title, event.organizationName, event.location),
  );
  const pendingCreatedTimes = [
    ...pendingEvents.map((event) => timestampMillis(event.createdAt)),
    ...pendingUsers.map((user) => timestampMillis(user.createdAt)),
    ...pendingReports.map((report) => timestampMillis(report.createdAt)),
  ].filter((value) => value > 0);
  const oldestPendingDays =
    pendingCreatedTimes.length > 0
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - Math.min(...pendingCreatedTimes)) / 86_400_000,
          ),
        )
      : 0;
  const processedToday = auditLogs.filter((audit) => {
    const date = audit.createdAt?.toDate();
    const now = new Date();
    return (
      date?.getFullYear() === now.getFullYear() &&
      date?.getMonth() === now.getMonth() &&
      date?.getDate() === now.getDate()
    );
  }).length;

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
    const deletionRequestUnsubscribe = onSnapshot(
      query(
        collection(db, "accountDeletionRequests"),
        where("status", "==", "submitted"),
        limit(100),
      ),
      (snapshot) =>
        setDeletionRequests(
          snapshot.docs.map(
            (requestDoc) => requestDoc.data() as AccountDeletionRequest,
          ),
        ),
      () => setNotice("退会申請を取得できませんでした。"),
    );
    return () => {
      eventUnsubscribe();
      userUnsubscribe();
      reportUnsubscribe();
      deletionRequestUnsubscribe();
    };
  }, []);

  useEffect(() => {
    const usersUnsubscribe = onSnapshot(
      query(
        collection(db, "users"),
        orderBy(documentId()),
        limit(managedUserQueryLimit),
      ),
      (snapshot) => {
        setHasMoreManagedUsers(snapshot.size === managedUserQueryLimit);
        setManagedUsers(
          snapshot.docs
            .map((userDoc) => ({
              uid: userDoc.id,
              ...(userDoc.data() as Omit<AppUser, "uid">),
            }))
            .filter((user) => user.role !== "admin") as AppUser[],
        );
      },
      () => setNotice("ユーザー管理データを取得できませんでした。"),
    );
    const eventsUnsubscribe = onSnapshot(
      query(
        collection(db, "events"),
        orderBy(documentId()),
        limit(managedEventQueryLimit),
      ),
      (snapshot) => {
        setHasMoreManagedEvents(snapshot.size === managedEventQueryLimit);
        setManagedEvents(
          snapshot.docs
            .map(
              (eventDoc) =>
                ({
                  id: eventDoc.id,
                  ...eventDoc.data(),
                }) as AizuEvent,
            )
            .filter((event) =>
              ["published", "unpublished"].includes(event.status),
            ) as AizuEvent[],
        );
      },
      () => setNotice("公開イベント管理データを取得できませんでした。"),
    );
    const auditUnsubscribe = onSnapshot(
      query(
        collection(db, "auditLogs"),
        orderBy("createdAt", "desc"),
        limit(100),
      ),
      (snapshot) =>
        setAuditLogs(
          snapshot.docs.map((auditDoc) => ({
            id: auditDoc.id,
            ...auditDoc.data(),
          })) as AuditLog[],
        ),
      () => setNotice("監査履歴を取得できませんでした。"),
    );
    return () => {
      usersUnsubscribe();
      eventsUnsubscribe();
      auditUnsubscribe();
    };
  }, [managedEventQueryLimit, managedUserQueryLimit]);

  const approveEvent = async (event: AizuEvent) => {
    await runAdminAction(
      "approve_event",
      event.id,
      "公開基準を満たしていることを確認",
      "イベントを公開しました。",
    );
  };

  const requestEventRevision = async (event: AizuEvent, reason: string) => {
    await runAdminAction(
      "request_event_revision",
      event.id,
      reason,
      "理由を添えてイベントを差し戻しました。",
    );
  };

  const approveUser = async (user: AppUser) => {
    await runAdminAction(
      "approve_user",
      user.uid,
      "登録情報を確認",
      "アカウントを承認しました。",
    );
  };

  const rejectUser = async (user: AppUser, reason: string) => {
    await runAdminAction(
      "reject_user",
      user.uid,
      reason,
      "アカウントを見送りました。",
    );
  };

  const resolveReport = async (
    report: ReportRecord,
    status: "resolved" | "dismissed",
    reason: string,
  ) => {
    await runAdminAction(
      status === "resolved" ? "resolve_report" : "dismiss_report",
      report.id,
      reason,
      status === "resolved"
        ? "通報を対応済みにしました。"
        : "通報を棄却しました。",
    );
  };

  type AdminAction =
    | "approve_event"
    | "request_event_revision"
    | "approve_user"
    | "reject_user"
    | "resolve_report"
    | "dismiss_report"
    | "suspend_user"
    | "restore_user"
    | "delete_user"
    | "unpublish_event"
    | "restore_event"
    | "delete_event";

  const runAdminAction = async (
    action: AdminAction,
    targetId: string,
    reason: string,
    successMessage: string,
  ) => {
    setIsLoading(true);
    try {
      const manageResource = httpsCallable<
        { action: AdminAction; targetId: string; reason: string },
        { status: string }
      >(functions, "adminManageResource");
      await manageResource({
        action,
        targetId,
        reason: reason.trim().slice(0, 1000),
      });
      setReasonAction(null);
      setNotice(successMessage);
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const updateManagedUserStatus = async (
    user: AppUser,
    status: "active" | "suspended",
    reason: string,
  ) => {
    await runAdminAction(
      status === "suspended" ? "suspend_user" : "restore_user",
      user.uid,
      reason,
      status === "suspended"
        ? "アカウントを停止しました。"
        : "アカウントを復旧しました。",
    );
  };

  const updateManagedEventStatus = async (
    event: AizuEvent,
    status: "published" | "unpublished",
    reason: string,
  ) => {
    await runAdminAction(
      status === "unpublished" ? "unpublish_event" : "restore_event",
      event.id,
      reason,
      status === "unpublished"
        ? "イベントを非公開にしました。"
        : "イベントを再公開しました。",
    );
  };

  const deleteManagedEvent = async (event: AizuEvent, reason: string) => {
    await runAdminAction(
      "delete_event",
      event.id,
      reason,
      "イベントと関連する申請・チャットを削除しました。",
    );
  };

  const deleteManagedUser = async (user: AppUser, reason: string) => {
    await runAdminAction(
      "delete_user",
      user.uid,
      reason,
      "ユーザーの認証アカウントと関連データを削除しました。",
    );
  };

  const eventRiskFlags = (event: AizuEvent) =>
    [
      event.organizationVerified === false ? "未承認主催者" : null,
      !event.cancellationPolicy ? "キャンセル方針なし" : null,
      !event.meetingPoint ? "集合案内なし" : null,
      !event.accessibility ? "配慮情報なし" : null,
      event.feeType === "有料" && !event.feeAmount ? "料金未確定" : null,
    ].filter(Boolean) as string[];
  const userRiskFlags = (user: AppUser) =>
    [
      !user.email ? "メール未設定" : null,
      user.role === "student" &&
      user.email &&
      !isAizuUniversityEmail(user.email)
        ? "学外メール"
        : null,
      !user.department ? "所属未設定" : null,
    ].filter(Boolean) as string[];

  return (
    <RoleShell
      title="Aizu Connect運営"
      subtitle="管理者コンソール"
      icon={<ShieldCheck size={19} />}
      onLogout={onLogout}
    >
      {notice && (
        <div className="notice" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      <div className="admin-toolbar">
        <div className="conversation-search">
          <Search size={15} />
          <input
            aria-label="管理対象を検索"
            value={adminSearch}
            placeholder="イベント・氏名・通報理由を横断検索"
            onChange={(event) => setAdminSearch(event.target.value)}
          />
        </div>
        <span>
          <FilterIcon size={14} />
          古い申請から表示
        </span>
      </div>
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
          <strong>{deletionRequests.length}</strong>
          <span>退会申請</span>
        </div>
        <div>
          <strong>{oldestPendingDays}日</strong>
          <span>最も古い未処理</span>
        </div>
        <div>
          <strong>{processedToday}</strong>
          <span>本日の処理</span>
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
            {visiblePendingEvents.length === 0 ? (
              <EmptyRoleState text="審査待ちのイベントはありません。" />
            ) : (
              visiblePendingEvents.map((event) => (
                <article className="admin-review-item" key={event.id}>
                  <div className="review-row">
                    <div>
                      <strong>{event.title}</strong>
                      <small>
                        {event.organizationName} · {event.startAtLabel}
                      </small>
                      {eventRiskFlags(event).length > 0 && (
                        <div className="risk-chip-row">
                          {eventRiskFlags(event).map((risk) => (
                            <span key={risk}>{risk}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="row-actions">
                      <button
                        className="muted"
                        type="button"
                        aria-expanded={expandedEventId === event.id}
                        onClick={() =>
                          setExpandedEventId((current) =>
                            current === event.id ? null : event.id,
                          )
                        }
                      >
                        <Eye size={14} />
                        {expandedEventId === event.id
                          ? "内容を閉じる"
                          : "内容を見る"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmation({
                            title: "イベントを公開しますか？",
                            description: `「${event.title}」を学生向けのイベント一覧へ公開します。`,
                            confirmLabel: "公開する",
                            action: () => approveEvent(event),
                          })
                        }
                      >
                        公開する
                      </button>
                      <button
                        className="muted"
                        type="button"
                        onClick={() =>
                          setReasonAction({
                            title: "イベントを差し戻す",
                            description: `「${event.title}」を非公開のまま主催者へ戻します。`,
                            label: "修正してほしい内容",
                            placeholder:
                              "不足情報と、公開に必要な修正を具体的に入力してください",
                            confirmLabel: "差し戻す",
                            danger: true,
                            action: (reason) =>
                              requestEventRevision(event, reason),
                          })
                        }
                      >
                        差し戻す
                      </button>
                    </div>
                  </div>
                  {expandedEventId === event.id && (
                    <div className="admin-event-preview">
                      <img
                        src={event.imageUrl}
                        alt={`${event.title}の審査用画像`}
                      />
                      <div>
                        <div className="admin-event-preview-head">
                          <span>{event.category}</span>
                          <strong>
                            {event.beginnerLevel ?? "初心者歓迎度 未設定"}
                          </strong>
                        </div>
                        <p>{event.summary}</p>
                        <dl>
                          <div>
                            <dt>日時</dt>
                            <dd>{event.startAtLabel}</dd>
                          </div>
                          <div>
                            <dt>場所</dt>
                            <dd>{event.location}</dd>
                          </div>
                          <div>
                            <dt>定員</dt>
                            <dd>{event.capacity}名</dd>
                          </div>
                        </dl>
                        {event.takeaways && event.takeaways.length > 0 && (
                          <div className="value-chip-grid compact">
                            {event.takeaways.slice(0, 3).map((takeaway) => (
                              <span key={takeaway}>{takeaway}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
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
            {visiblePendingUsers.length === 0 ? (
              <EmptyRoleState text="審査待ちはありません。会津大学メールの学生は自動承認されます。" />
            ) : (
              visiblePendingUsers.map((user) => (
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
                    {userRiskFlags(user).length > 0 && (
                      <div className="risk-chip-row">
                        {userRiskFlags(user).map((risk) => (
                          <span key={risk}>{risk}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmation({
                          title: "アカウントを承認しますか？",
                          description: `${user.displayName}さんがAizu Connectを利用できるようになります。`,
                          confirmLabel: "承認する",
                          action: () => approveUser(user),
                        })
                      }
                    >
                      承認する
                    </button>
                    <button
                      className="muted"
                      type="button"
                      onClick={() =>
                        setReasonAction({
                          title: "アカウントを見送る",
                          description: `${user.displayName}さんへ理由を表示して利用を制限します。`,
                          label: "見送り理由",
                          placeholder:
                            "不足している確認情報や、再申請に必要な内容を入力してください",
                          confirmLabel: "理由を添えて見送る",
                          danger: true,
                          action: (reason) => rejectUser(user, reason),
                        })
                      }
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
      <section className="role-card admin-deletion-card">
        <div className="role-card-head">
          <div>
            <p className="eyebrow">ACCOUNT DELETION</p>
            <h2>退会・データ削除申請</h2>
          </div>
          <Trash2 size={20} />
        </div>
        {visibleDeletionRequests.length === 0 ? (
          <EmptyRoleState text="対応待ちの退会申請はありません。" />
        ) : (
          <div className="role-list">
            {visibleDeletionRequests.map((request) => {
              const user = managedUsers.find(
                (item) => item.uid === request.userId,
              );
              const deletionTarget =
                user ??
                ({
                  uid: request.userId,
                  displayName: `ユーザー ${request.userId}`,
                  email: "",
                } as AppUser);
              return (
                <div className="review-row" key={request.userId}>
                  <div>
                    <strong>{deletionTarget.displayName}</strong>
                    <small>
                      {deletionTarget.email || request.userId} ·{" "}
                      {request.requestedAt
                        ? formatChatTime(request.requestedAt)
                        : "申請日時を確認中"}
                    </small>
                    <p>{request.reason}</p>
                  </div>
                  <button
                    className="danger-action"
                    type="button"
                    disabled={isLoading}
                    onClick={() =>
                      setReasonAction({
                        title: "退会申請を承認して削除",
                        description: `${deletionTarget.displayName}さんの認証アカウントと関連データを完全に削除します。この操作は元に戻せません。`,
                        label: "本人確認・対応記録",
                        placeholder:
                          "本人確認方法と、削除を実行する判断を記録してください",
                        confirmLabel: "アカウントを完全に削除",
                        danger: true,
                        action: (reason) =>
                          deleteManagedUser(
                            deletionTarget,
                            `${reason}\n本人申請: ${request.reason}`,
                          ),
                      })
                    }
                  >
                    <Trash2 size={14} />
                    削除を実行
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section className="role-card admin-report-card">
        <div className="role-card-head">
          <div>
            <p className="eyebrow">SAFETY QUEUE</p>
            <h2>通報・安全確認</h2>
          </div>
          <Flag size={20} />
        </div>
        {visiblePendingReports.length === 0 ? (
          <EmptyRoleState text="確認が必要な通報はありません。" />
        ) : (
          <div className="role-list">
            {visiblePendingReports.map((report) => (
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
                  {report.targetType === "event" && (
                    <button
                      className="danger-action"
                      type="button"
                      disabled={isLoading}
                      onClick={() =>
                        setReasonAction({
                          title: "通報対象イベントを削除",
                          description: `「${report.targetTitle || "対象イベント"}」を、申請・チャットを含めて削除します。この操作は元に戻せません。`,
                          label: "削除理由・対応記録",
                          placeholder:
                            "確認した違反内容と、削除が必要な理由を入力してください",
                          confirmLabel: "イベントを削除する",
                          danger: true,
                          action: (reason) =>
                            deleteManagedEvent(
                              {
                                id: report.targetId,
                                title: report.targetTitle || "対象イベント",
                              } as AizuEvent,
                              reason,
                            ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                      対象を削除
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() =>
                      setReasonAction({
                        title: "通報を対応済みにする",
                        description: `「${report.targetTitle || "対象コンテンツ"}」の確認が完了したものとしてキューを閉じます。`,
                        label: "対応内容・記録",
                        placeholder:
                          "確認した内容と、実施した対応を入力してください",
                        confirmLabel: "対応済みにする",
                        action: (reason) =>
                          resolveReport(report, "resolved", reason),
                      })
                    }
                  >
                    対応済み
                  </button>
                  <button
                    className="muted"
                    type="button"
                    disabled={isLoading}
                    onClick={() =>
                      setReasonAction({
                        title: "問題なしとして閉じる",
                        description:
                          "この通報は対応キューから外れ、提出済みの状態には戻せません。",
                        label: "問題なしと判断した理由",
                        placeholder: "確認した事実と判断根拠を入力してください",
                        confirmLabel: "問題なしとして閉じる",
                        danger: true,
                        action: (reason) =>
                          resolveReport(report, "dismissed", reason),
                      })
                    }
                  >
                    問題なし
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="role-grid admin-operations-grid">
        <section className="role-card">
          <div className="role-card-head">
            <div>
              <p className="eyebrow">USER OPERATIONS</p>
              <h2>ユーザー管理</h2>
            </div>
            <UsersRound size={20} />
          </div>
          <div className="admin-status-tabs" aria-label="ユーザー状態">
            {(
              [
                ["active", "利用中"],
                ["suspended", "停止中"],
                ["rejected", "見送り"],
              ] as const
            ).map(([status, label]) => (
              <button
                className={managedUserStatus === status ? "active" : ""}
                type="button"
                key={status}
                onClick={() => setManagedUserStatus(status)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="role-list admin-compact-list">
            {visibleManagedUsers.length === 0 ? (
              <EmptyRoleState text="条件に合うユーザーはいません。" />
            ) : (
              visibleManagedUsers.map((user) => (
                <div className="review-row" key={user.uid}>
                  <div>
                    <strong>{user.displayName}</strong>
                    <small>
                      {user.email} ·{" "}
                      {user.role === "organization" ? "団体" : "学生"}
                    </small>
                    {(user.moderationReason || user.reviewReason) && (
                      <small>
                        理由: {user.moderationReason || user.reviewReason}
                      </small>
                    )}
                  </div>
                  <div className="row-actions">
                    {user.status === "active" ? (
                      <button
                        className="muted"
                        type="button"
                        disabled={isLoading}
                        onClick={() =>
                          setReasonAction({
                            title: "アカウントを停止",
                            description: `${user.displayName}さんの利用を停止します。`,
                            label: "停止理由",
                            placeholder:
                              "違反内容、確認事項、復旧条件を入力してください",
                            confirmLabel: "利用を停止する",
                            danger: true,
                            action: (reason) =>
                              updateManagedUserStatus(
                                user,
                                "suspended",
                                reason,
                              ),
                          })
                        }
                      >
                        停止
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() =>
                          setReasonAction({
                            title: "アカウントを復旧",
                            description: `${user.displayName}さんの利用を再開します。`,
                            label: "復旧理由",
                            placeholder:
                              "確認済みの内容と、復旧可能と判断した理由を入力してください",
                            confirmLabel: "利用を再開する",
                            action: (reason) =>
                              updateManagedUserStatus(user, "active", reason),
                          })
                        }
                      >
                        復旧
                      </button>
                    )}
                    <button
                      className="danger-action"
                      type="button"
                      disabled={isLoading}
                      onClick={() =>
                        setReasonAction({
                          title: "ユーザーを完全に削除",
                          description: `${user.displayName}さんの認証アカウント、参加申請、チャット、プロフィールを削除します。この操作は元に戻せません。`,
                          label: "削除理由・対応記録",
                          placeholder:
                            "削除が必要な理由と、事前に確認した内容を入力してください",
                          confirmLabel: "ユーザーを削除する",
                          danger: true,
                          action: (reason) => deleteManagedUser(user, reason),
                        })
                      }
                    >
                      <Trash2 size={14} />
                      削除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {hasMoreManagedUsers && (
            <button
              className="admin-load-more"
              type="button"
              disabled={isLoading}
              onClick={() =>
                setManagedUserQueryLimit((current) => current + 50)
              }
            >
              さらに50件読み込む
            </button>
          )}
        </section>
        <section className="role-card">
          <div className="role-card-head">
            <div>
              <p className="eyebrow">EVENT OPERATIONS</p>
              <h2>公開イベント管理</h2>
            </div>
            <CalendarDays size={20} />
          </div>
          <div className="role-list admin-compact-list">
            {visibleManagedEvents.length === 0 ? (
              <EmptyRoleState text="管理対象のイベントはありません。" />
            ) : (
              visibleManagedEvents.map((event) => (
                <div className="review-row" key={event.id}>
                  <div>
                    <strong>{event.title}</strong>
                    <small>
                      {event.organizationName} ·{" "}
                      {event.status === "published" ? "公開中" : "非公開"}
                    </small>
                    {event.moderationReason && (
                      <small>理由: {event.moderationReason}</small>
                    )}
                  </div>
                  <div className="row-actions">
                    <button
                      className={event.status === "published" ? "muted" : ""}
                      type="button"
                      disabled={isLoading}
                      onClick={() =>
                        setReasonAction({
                          title:
                            event.status === "published"
                              ? "イベントを非公開"
                              : "イベントを再公開",
                          description: `「${event.title}」の公開状態を変更します。`,
                          label:
                            event.status === "published"
                              ? "非公開にする理由"
                              : "再公開する理由",
                          placeholder:
                            event.status === "published"
                              ? "安全確認の内容と主催者への案内を入力してください"
                              : "修正・確認済みの内容を入力してください",
                          confirmLabel:
                            event.status === "published"
                              ? "非公開にする"
                              : "再公開する",
                          danger: event.status === "published",
                          action: (reason) =>
                            updateManagedEventStatus(
                              event,
                              event.status === "published"
                                ? "unpublished"
                                : "published",
                              reason,
                            ),
                        })
                      }
                    >
                      {event.status === "published" ? "非公開" : "再公開"}
                    </button>
                    <button
                      className="danger-action"
                      type="button"
                      disabled={isLoading}
                      onClick={() =>
                        setReasonAction({
                          title: "イベントを完全に削除",
                          description: `「${event.title}」と参加申請・チャットを削除します。この操作は元に戻せません。`,
                          label: "削除理由・対応記録",
                          placeholder:
                            "違反内容や削除依頼など、削除が必要な理由を入力してください",
                          confirmLabel: "イベントを削除する",
                          danger: true,
                          action: (reason) => deleteManagedEvent(event, reason),
                        })
                      }
                    >
                      <Trash2 size={14} />
                      削除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {hasMoreManagedEvents && (
            <button
              className="admin-load-more"
              type="button"
              disabled={isLoading}
              onClick={() =>
                setManagedEventQueryLimit((current) => current + 50)
              }
            >
              さらに50件読み込む
            </button>
          )}
        </section>
      </div>
      <section className="role-card audit-log-card">
        <div className="role-card-head">
          <div>
            <p className="eyebrow">AUDIT HISTORY</p>
            <h2>操作履歴</h2>
          </div>
          <History size={20} />
        </div>
        {auditLogs.length === 0 ? (
          <EmptyRoleState text="管理操作を行うと、理由と日時がここに残ります。" />
        ) : (
          <div className="audit-log-list">
            {auditLogs.slice(0, 50).map((audit) => (
              <div key={audit.id}>
                <span>
                  <strong>{audit.targetTitle}</strong>
                  <small>
                    {audit.actorName} · {audit.action}
                  </small>
                </span>
                <p>{audit.reason}</p>
                <time>{formatChatTime(audit.createdAt)}</time>
              </div>
            ))}
          </div>
        )}
      </section>
      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.confirmLabel}
          danger={confirmation.danger}
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            const action = confirmation.action;
            setConfirmation(null);
            void action();
          }}
        />
      )}
      {reasonAction && (
        <ActionReasonDialog
          title={reasonAction.title}
          description={reasonAction.description}
          label={reasonAction.label}
          placeholder={reasonAction.placeholder}
          confirmLabel={reasonAction.confirmLabel}
          danger={reasonAction.danger}
          onClose={() => setReasonAction(null)}
          onConfirm={(reason) => void reasonAction.action(reason)}
        />
      )}
    </RoleShell>
  );
}

function RoleShell({
  title,
  subtitle,
  icon,
  onClose,
  onLogout,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  onClose?: () => void;
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
          {onClose && (
            <button
              className="secondary-action compact-action"
              type="button"
              onClick={onClose}
            >
              ホームへ戻る
            </button>
          )}
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
          title="通知パネルを閉じる"
          aria-label="通知パネルを閉じる"
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
  const dialogRef = useDialogAccessibility<HTMLFormElement>(onClose);
  return createPortal(
    <div className="report-backdrop" role="presentation" onClick={onClose}>
      <form
        ref={dialogRef}
        className="report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(reason, description);
        }}
      >
        <div className="report-dialog-head">
          <div>
            <p className="eyebrow">SAFETY</p>
            <h2 id="report-dialog-title">通報する</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="閉じる"
            data-dialog-initial-focus
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

function ActionReasonDialog({
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  danger = false,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  label: string;
  placeholder: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const dialogRef = useDialogAccessibility<HTMLFormElement>(onClose);
  return createPortal(
    <div className="report-backdrop" role="presentation" onClick={onClose}>
      <form
        ref={dialogRef}
        className="report-dialog action-reason-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="action-reason-title"
        tabIndex={-1}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          const normalized = reason.trim();
          if (!normalized) return;
          onConfirm(normalized);
        }}
      >
        <div className="report-dialog-head">
          <div>
            <p className="eyebrow">REASON REQUIRED</p>
            <h2 id="action-reason-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="閉じる"
            data-dialog-initial-focus
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <p>{description}</p>
        <Field label={label}>
          <textarea
            required
            minLength={5}
            maxLength={1000}
            value={reason}
            placeholder={placeholder}
            onChange={(changeEvent) => setReason(changeEvent.target.value)}
          />
        </Field>
        <div className="report-dialog-actions">
          <button className="text-button" type="button" onClick={onClose}>
            キャンセル
          </button>
          <button
            className={danger ? "danger-action" : "primary-action"}
            type="submit"
            disabled={reason.trim().length < 5}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export default App;
