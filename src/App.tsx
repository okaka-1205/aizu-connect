import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  type MultiFactorResolver,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  Compass,
  Home,
  MapPin,
  MessageSquareText,
  Plus,
  UserRound,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BrandMark,
  LoadingScreen,
  NoticeBanner,
  TabButton,
} from "./components/ui/AppPrimitives";
import { PRIVACY_VERSION, TERMS_VERSION } from "./content/legalDocuments";
import {
  auth,
  authPersistenceReady,
  db,
  ensureAppCheck,
  functions,
} from "./lib/firebase";
import {
  didCompleteManualApproval,
  getAuthFlowErrorMessage,
  getFirebaseErrorMessage,
  isAizuUniversityEmail,
  isFutureEventStart,
  matchesCategoryFilter,
  normalizeLoginEmail,
  resolveAccountAccessGate,
  resolveInitialAccountStatus,
  shouldAutoActivateVerifiedStudent,
  validateChatAttachment,
  validateImageFile,
  type AuthFlowStage,
  type Filter,
} from "./lib/appLogic";
import { tabLabels } from "./config/events";
import { useNoticeState } from "./hooks/useNoticeState";
import { useAccountDeletion } from "./hooks/useAccountDeletion";
import { useRoomConversation } from "./hooks/useRoomConversation";
import {
  defaultNotificationPreferences,
  hasRequiredCommerceDisclosure,
  timestampMillis,
} from "./lib/eventUtils";
import { uploadImage } from "./lib/storage";
import { fetchPublishedEventPage } from "./repositories/eventsRepository";
import {
  loadChatPreferencesForRooms,
  subscribeChatRoomsForUser,
} from "./repositories/chatRepository";
import {
  deleteChatMessage,
  editChatMessage,
} from "./repositories/engagementRepository";
import {
  SAVED_EVENT_PAGE_SIZE,
  SAVED_SEARCH_PAGE_SIZE,
  loadStudentActivities,
  loadStudentDashboardData,
  loadStudentNotifications,
  loadStudentSavedEvents,
  loadStudentSavedSearches,
  markAllStudentNotificationsRead,
  subscribeStudentApplications,
} from "./repositories/studentRepository";
import {
  deleteAuthUser,
  loginWithEmail,
  logout,
  refreshAuthToken,
  registerWithEmail,
  reloadAuthUser,
  resendVerificationEmail,
} from "./services/authService";
import { AdminMfaEnrollmentScreen } from "./components/AdminMfaEnrollmentScreen";
import { MfaSignInScreen } from "./components/MfaSignInScreen";
import { ActionReasonDialog } from "./screens/shared/RoleScreenPrimitives";
import { ApplicationDialog } from "./screens/student/ApplicationDialog";
import { HomeTab, SearchTab } from "./screens/student/DiscoverTabs";
import { AuthScreen, LegalReconsentScreen } from "./screens/auth/AuthScreens";
import {
  AccountRejectedScreen,
  AccountSetupScreen,
  AdminApprovalPendingScreen,
  VerifyEmailScreen,
} from "./screens/auth/AccountGateScreens";
import {
  NotificationPanel,
  ReportDialog,
} from "./screens/shared/StudentOverlays";
import type {
  AccountStatus,
  ActivityRecord,
  AizuEvent,
  ApplicationDetails,
  AppUser,
  ChatPreference,
  ChatRoom,
  EventApplication,
  NotificationItem,
  NotificationPreferences,
  NoticeTone,
  ReportTarget,
  SavedSearch,
  SearchDateFilter,
  SearchDayFilter,
  SearchFeeFilter,
  SearchFormatFilter,
  SearchSort,
  SearchTimeFilter,
  SearchView,
  Tab,
} from "./types/domain";

const AdminDashboard = lazy(() =>
  import("./screens/admin/AdminDashboard").then((module) => ({
    default: module.AdminDashboard,
  })),
);
const OrganizationDashboard = lazy(() =>
  import("./screens/organization/OrganizationDashboard").then((module) => ({
    default: module.OrganizationDashboard,
  })),
);
const ActivityTab = lazy(() =>
  import("./screens/student/ActivityTab").then((module) => ({
    default: module.ActivityTab,
  })),
);
const MessagesTab = lazy(() =>
  import("./screens/shared/MessagesTab").then((module) => ({
    default: module.MessagesTab,
  })),
);
const ProfileTab = lazy(() =>
  import("./screens/student/ProfileTab").then((module) => ({
    default: module.ProfileTab,
  })),
);

const withDashboardLoading = (screen: ReactNode) => (
  <Suspense fallback={<LoadingScreen />}>{screen}</Suspense>
);

const DeferredContentLoading = () => (
  <div className="empty-state" role="status" aria-live="polite">
    <span>画面を読み込んでいます</span>
  </div>
);
import {
  createMultiFactorResolver,
  hasTotpEnrollment,
  isMultiFactorRequiredError,
} from "./services/mfaService";

const studentTabs: Tab[] = [
  "home",
  "search",
  "activity",
  "messages",
  "profile",
];

function tabFromLocation(): Tab {
  if (typeof window === "undefined") return "home";
  const candidate = new URLSearchParams(window.location.search).get("tab");
  return studentTabs.includes(candidate as Tab) ? (candidate as Tab) : "home";
}

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
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(
    null,
  );
  const [newlyMfaEnrolledUserId, setNewlyMfaEnrolledUserId] = useState<
    string | null
  >(null);
  const [displayName, setDisplayName] = useState("");
  const [department, setDepartment] = useState("");
  const [grade, setGrade] = useState(1);
  const [interestText, setInterestText] = useState("");
  const [currentActivities, setCurrentActivities] = useState("");
  const [wantToTry, setWantToTry] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false);
  const [hasConfirmedEligibility, setHasConfirmedEligibility] = useState(false);
  const [events, setEvents] = useState<AizuEvent[]>([]);
  const [eventPageCursor, setEventPageCursor] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreEvents, setHasMoreEvents] = useState(false);
  const [isLoadingMoreEvents, setIsLoadingMoreEvents] = useState(false);
  const [applications, setApplications] = useState<EventApplication[]>([]);
  const [applicationQueryLimit, setApplicationQueryLimit] = useState(50);
  const [hasMoreApplications, setHasMoreApplications] = useState(false);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [chatRoomQueryLimit, setChatRoomQueryLimit] = useState(50);
  const [hasMoreChatRooms, setHasMoreChatRooms] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("event"),
  );
  const [activeTab, setActiveTabState] = useState<Tab>(tabFromLocation);
  const setActiveTab = useCallback((tab: Tab) => {
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    if (tab === "home") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.pushState(
      { tab },
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);
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
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedSearchQueryLimit, setSavedSearchQueryLimit] = useState(
    SAVED_SEARCH_PAGE_SIZE,
  );
  const [hasMoreSavedSearches, setHasMoreSavedSearches] = useState(false);
  const [savedEventIds, setSavedEventIds] = useState<string[]>([]);
  const [savedEvents, setSavedEvents] = useState<AizuEvent[]>([]);
  const [savedEventQueryLimit, setSavedEventQueryLimit] = useState(
    SAVED_EVENT_PAGE_SIZE,
  );
  const [hasMoreSavedEvents, setHasMoreSavedEvents] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isAutoActivatingStudent, setIsAutoActivatingStudent] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [message, messageTone, setMessage] = useNoticeState();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotificationTotal, setUnreadNotificationTotal] = useState(0);
  const [notificationQueryLimit, setNotificationQueryLimit] = useState(30);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [activityQueryLimit, setActivityQueryLimit] = useState(50);
  const [hasMoreActivities, setHasMoreActivities] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [applicationToCancel, setApplicationToCancel] =
    useState<EventApplication | null>(null);
  const [applicationEvent, setApplicationEvent] = useState<AizuEvent | null>(
    null,
  );
  const [chatPreferences, setChatPreferences] = useState<ChatPreference[]>([]);
  const chatRoomIdsKey = useMemo(
    () => chatRooms.map((room) => room.id).sort().join("\n"),
    [chatRooms],
  );
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(() => defaultNotificationPreferences(""));
  const [isCreatorDashboardOpen, setIsCreatorDashboardOpen] = useState(false);
  const {
    accountDeletionRequest,
    requestAccountDeletion,
    cancelAccountDeletion,
  } = useAccountDeletion({
    appUser,
    enabled:
      isEmailVerified &&
      !isAutoActivatingStudent &&
      appUser?.status === "active",
    setNotice: setMessage,
  });
  const {
    chatMessages,
    hasOlderChatMessages,
    chatReadReceipts,
    loadOlderMessages,
    resetMessageWindow,
  } = useRoomConversation({
    roomId: activeRoomId,
    userId: appUser?.uid,
    setNotice: setMessage,
  });
  const authenticatedUidRef = useRef<string | null>(null);
  const accountStatusRef = useRef<{
    uid: string;
    status: AccountStatus;
  } | null>(null);
  const verificationRefreshUidRef = useRef<string | null>(null);
  const shouldFocusSearchRef = useRef(false);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const previousSearchSortRef = useRef<SearchSort>("開催が近い順");
  const searchSortRequestRef = useRef(0);
  const progressiveSearchRef = useRef({ key: "", loadedPages: 0 });

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId),
    [events, selectedEventId],
  );

  const upcomingEvents = useMemo(
    () => events.filter((event) => isFutureEventStart(event.startAt?.toDate())),
    [events],
  );

  useEffect(() => {
    const handleHistoryNavigation = () => {
      setActiveTabState(tabFromLocation());
      const eventId = new URLSearchParams(window.location.search).get("event");
      setSelectedEventId(eventId);
    };
    window.addEventListener("popstate", handleHistoryNavigation);
    return () =>
      window.removeEventListener("popstate", handleHistoryNavigation);
  }, []);

  useEffect(() => {
    const eventId = new URLSearchParams(window.location.search).get("event");
    if (eventId && events.some((event) => event.id === eventId)) {
      setSelectedEventId(eventId);
    }
  }, [events]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const currentEventId = url.searchParams.get("event");
    if (currentEventId === selectedEventId) return;
    if (selectedEventId) {
      url.searchParams.set("event", selectedEventId);
      window.history.pushState(
        { ...window.history.state, tab: activeTab, event: selectedEventId },
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    } else {
      url.searchParams.delete("event");
      window.history.replaceState(
        { ...window.history.state, tab: activeTab },
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }, [activeTab, selectedEventId]);

  useEffect(() => {
    if (!(["home", "search"] as Tab[]).includes(activeTab) && selectedEventId) {
      setSelectedEventId(null);
    }
  }, [activeTab, selectedEventId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => {
      if (document.querySelector('[aria-modal="true"]')) return;
      if (activeTab === "search" && shouldFocusSearchRef.current) {
        document.getElementById("event-search-input")?.focus();
        shouldFocusSearchRef.current = false;
        return;
      }
      document.getElementById("student-main")?.focus({ preventScroll: true });
    });
  }, [activeTab]);

  useEffect(() => {
    let currentPageTitle = tabLabels[activeTab];
    if (isAuthLoading) {
      currentPageTitle = "読み込み中";
    } else if (!firebaseUser || !appUser) {
      currentPageTitle = authMode === "login" ? "ログイン" : "新規登録";
    } else {
      const isAutoActivating =
        isAutoActivatingStudent ||
        shouldAutoActivateVerifiedStudent({
          role: appUser.role,
          status: appUser.status,
          emailVerified: isEmailVerified,
          email: appUser.email ?? "",
        });
      const accessGate = resolveAccountAccessGate({
        isProduction: import.meta.env.PROD,
        emailVerified: isEmailVerified,
        status: appUser.status,
      });

      if (isAutoActivating) currentPageTitle = "アカウントを準備中";
      else if (accessGate === "email_verification")
        currentPageTitle = "メールを確認";
      else if (accessGate === "account_rejected")
        currentPageTitle = "アカウントを確認";
      else if (accessGate === "admin_approval") currentPageTitle = "承認待ち";
      else if (accessGate === "account_setup")
        currentPageTitle = "登録内容を確認";
      else if (
        appUser.role !== "admin" &&
        (appUser.termsVersion !== TERMS_VERSION ||
          appUser.privacyVersion !== PRIVACY_VERSION ||
          !appUser.eligibilityConfirmedAt)
      )
        currentPageTitle = "利用条件の更新";
      else if (appUser.role === "admin") currentPageTitle = "管理";
      else if (appUser.role === "organization" || isCreatorDashboardOpen)
        currentPageTitle = "企画管理";
    }
    document.title = `${currentPageTitle} | Aizu Connect`;
  }, [
    activeTab,
    appUser,
    authMode,
    firebaseUser,
    isAuthLoading,
    isAutoActivatingStudent,
    isCreatorDashboardOpen,
    isEmailVerified,
  ]);

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
  const hasActiveSearchCriteria = Boolean(
    searchText.trim() ||
    filter !== "すべて" ||
    searchDateFilter !== "すべて" ||
    searchDayFilter !== "すべて" ||
    searchTimeFilter !== "すべて" ||
    searchFeeFilter !== "すべて" ||
    searchFormatFilter !== "すべて" ||
    onlyAvailableEvents ||
    onlyBeginnerEvents,
  );
  const searchCriteriaKey = JSON.stringify([
    searchText.trim(),
    filter,
    searchDateFilter,
    searchDayFilter,
    searchTimeFilter,
    searchFeeFilter,
    searchFormatFilter,
    searchSort,
    onlyAvailableEvents,
    onlyBeginnerEvents,
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
      return "興味分野に関連";
    }
    const daysUntil =
      (timestampMillis(recommendedEvent.startAt) - Date.now()) / 86_400_000;
    return daysUntil <= 7 ? "7日以内に開催" : "開催日が近いイベント";
  }, [appUser?.interests, recommendedEvent]);

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (activeTab === "search") {
          document.getElementById("event-search-input")?.focus();
          return;
        }
        shouldFocusSearchRef.current = true;
        setActiveTab("search");
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, [activeTab, setActiveTab]);

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
    let disposed = false;
    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeAuth: () => void = () => {};
    let missingProfileTimer: ReturnType<typeof setTimeout> | null = null;
    const clearMissingProfileTimer = () => {
      if (missingProfileTimer !== null) {
        clearTimeout(missingProfileTimer);
        missingProfileTimer = null;
      }
    };
    void authPersistenceReady
      .then(() => {
        if (disposed) return;
        unsubscribeAuth = onAuthStateChanged(auth, (user) => {
          clearMissingProfileTimer();
          unsubscribeProfile?.();
          unsubscribeProfile = null;
          if (authenticatedUidRef.current !== (user?.uid ?? null)) {
            authenticatedUidRef.current = user?.uid ?? null;
            accountStatusRef.current = null;
            verificationRefreshUidRef.current = null;
            setIsAutoActivatingStudent(false);
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
            setEventPageCursor(null);
            setHasMoreEvents(false);
            setIsLoadingMoreEvents(false);
            setApplications([]);
            setApplicationQueryLimit(50);
            setHasMoreApplications(false);
            setChatRooms([]);
            setChatPreferences([]);
            setNotifications([]);
            setUnreadNotificationTotal(0);
            setNotificationQueryLimit(30);
            setHasMoreNotifications(false);
            setActivities([]);
            setActivityQueryLimit(50);
            setHasMoreActivities(false);
            setSavedEventIds([]);
            setSavedSearch(null);
            setSavedSearches([]);
          }
          setFirebaseUser(user);
          setIsEmailVerified(Boolean(user?.emailVerified));
          setAppUser(null);
          if (!user) {
            setIsAuthLoading(false);
            return;
          }
          void ensureAppCheck()
            .then(() => {
              if (disposed || auth.currentUser?.uid !== user.uid) return;
              unsubscribeProfile = onSnapshot(
                doc(db, "users", user.uid),
                (snapshot) => {
                  if (snapshot.exists()) {
                    clearMissingProfileTimer();
                    const nextUser = snapshot.data() as AppUser;
                    const previousAccount = accountStatusRef.current;
                    if (
                      previousAccount?.uid === user.uid &&
                      didCompleteManualApproval({
                        previousStatus: previousAccount.status,
                        nextStatus: nextUser.status,
                        role: nextUser.role,
                        email: nextUser.email ?? "",
                      })
                    ) {
                      setMessage(
                        "管理者の承認が完了しました。Aizu Connectのすべての機能を利用できます。",
                        "success",
                      );
                    }
                    accountStatusRef.current = {
                      uid: user.uid,
                      status: nextUser.status,
                    };
                    setAppUser(nextUser);
                  } else {
                    // Registration creates the Auth user before its profile
                    // document. Do not sign the user out while that batch is
                    // still in flight; the snapshot listener will receive the
                    // document as soon as the registration commit completes.
                    setMessage(
                      "アカウント情報を準備しています。しばらくお待ちください。",
                      "info",
                    );
                    missingProfileTimer ??= setTimeout(() => {
                      missingProfileTimer = null;
                      if (disposed || auth.currentUser?.uid !== user.uid)
                        return;
                      void logout()
                        .then(() => {
                          setMessage(
                            "アカウント情報が見つかりませんでした。削除済みのアカウント、または登録が完了していない可能性があります。管理者へお問い合わせください。",
                            "error",
                          );
                        })
                        .catch((error: unknown) => {
                          setMessage(
                            `無効なログイン状態を解除できませんでした。ブラウザを再読み込みしてください。${getFirebaseErrorMessage(error)}`,
                            "error",
                          );
                        });
                    }, 8_000);
                  }
                  setIsAuthLoading(false);
                },
                (error) => {
                  clearMissingProfileTimer();
                  setMessage(
                    `アカウント情報を読み込めませんでした。通信状態を確認して、もう一度お試しください。${getFirebaseErrorMessage(error)}`,
                    "error",
                  );
                  setIsAuthLoading(false);
                },
              );
            })
            .catch((error: unknown) => {
              if (disposed || auth.currentUser?.uid !== user.uid) return;
              setMessage(
                `安全性の確認に失敗しました。通信環境を確認して、もう一度お試しください。${getFirebaseErrorMessage(error)}`,
                "error",
              );
              setIsAuthLoading(false);
              void logout();
            });
        });
      })
      .catch((error: unknown) => {
        setMessage(
          `ログイン状態を保存できませんでした。${getFirebaseErrorMessage(error)}`,
          "error",
        );
        setIsAuthLoading(false);
      });
    return () => {
      disposed = true;
      clearMissingProfileTimer();
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, [setActiveTab, setMessage]);

  useEffect(() => {
    if (
      !firebaseUser ||
      !appUser ||
      isEmailVerified ||
      verificationRefreshUidRef.current === firebaseUser.uid ||
      appUser.role !== "student" ||
      appUser.status !== "pending_approval"
    ) {
      return;
    }

    verificationRefreshUidRef.current = firebaseUser.uid;
    void reloadAuthUser(firebaseUser)
      .then(async () => {
        if (firebaseUser.emailVerified) {
          await refreshAuthToken(firebaseUser);
        }
        setIsEmailVerified(firebaseUser.emailVerified);
      })
      .catch(() => {
        verificationRefreshUidRef.current = null;
      });
  }, [appUser, firebaseUser, isEmailVerified, setMessage]);

  useEffect(() => {
    if (
      !firebaseUser ||
      !appUser ||
      !shouldAutoActivateVerifiedStudent({
        role: appUser.role,
        status: appUser.status,
        emailVerified: isEmailVerified,
        email: appUser.email ?? "",
      })
    ) {
      return;
    }

    let disposed = false;
    setIsAutoActivatingStudent(true);
    void (async () => {
      try {
        await refreshAuthToken(firebaseUser);
        const profileRef = doc(db, "studentProfiles", firebaseUser.uid);
        const profileSnapshot = await getDoc(profileRef);
        const batch = writeBatch(db);
        batch.update(doc(db, "users", firebaseUser.uid), {
          status: "active",
          updatedAt: serverTimestamp(),
        });
        if (profileSnapshot.exists()) {
          batch.update(profileRef, {
            status: "active",
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        if (!disposed) {
          setMessage(
            "メール認証が完了しました。アカウントを有効化しました。",
            "success",
          );
        }
      } catch (error) {
        if (!disposed) {
          setMessage(
            `アカウントの有効化を完了できませんでした。${getFirebaseErrorMessage(error)}`,
            "error",
          );
          setIsEmailVerified(false);
          verificationRefreshUidRef.current = null;
        }
      } finally {
        setIsAutoActivatingStudent(false);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [appUser, firebaseUser, isEmailVerified, setMessage]);

  const activeStudentUid =
    appUser?.role === "student" &&
    appUser.status === "active" &&
    isEmailVerified &&
    !isAutoActivatingStudent
      ? appUser.uid
      : null;

  useEffect(() => {
    if (!activeStudentUid) {
      setEvents([]);
      setSavedEventIds([]);
      setSavedEvents([]);
      setSavedEventQueryLimit(SAVED_EVENT_PAGE_SIZE);
      setHasMoreSavedEvents(false);
      setSavedSearches([]);
      setSavedSearchQueryLimit(SAVED_SEARCH_PAGE_SIZE);
      setHasMoreSavedSearches(false);
      setApplications([]);
      setChatRooms([]);
      setChatRoomQueryLimit(50);
      setHasMoreChatRooms(false);
      setActiveRoomId(null);
      setChatPreferences([]);
      return;
    }
    void loadProductData(activeStudentUid).catch((error) => {
      setMessage(getFirebaseErrorMessage(error), "error");
    });
  }, [activeStudentUid, setMessage]);

  useEffect(() => {
    if (!activeStudentUid) return;
    return subscribeChatRoomsForUser(
      activeStudentUid,
      (rooms, hasMore) => {
        setChatRooms(rooms);
        setHasMoreChatRooms(hasMore);
        setActiveRoomId((current) => current ?? rooms[0]?.id ?? null);
      },
      (error) => setMessage(getFirebaseErrorMessage(error), "error"),
      chatRoomQueryLimit,
    );
  }, [activeStudentUid, chatRoomQueryLimit, setMessage]);

  useEffect(() => {
    if (!activeStudentUid || !chatRoomIdsKey) {
      setChatPreferences([]);
      return;
    }
    void loadChatPreferencesForRooms(
      activeStudentUid,
      chatRoomIdsKey.split("\n"),
    )
      .then(setChatPreferences)
      .catch((error: unknown) =>
        setMessage(getFirebaseErrorMessage(error), "error"),
      );
  }, [activeStudentUid, chatRoomIdsKey, setMessage]);

  useEffect(() => {
    if (!activeStudentUid) return;
    return subscribeStudentApplications(
      activeStudentUid,
      setApplications,
      (error) => setMessage(getFirebaseErrorMessage(error), "error"),
      applicationQueryLimit,
      setHasMoreApplications,
    );
  }, [activeStudentUid, applicationQueryLimit, setMessage]);

  const loadMoreEvents = useCallback(async () => {
    if (!eventPageCursor || !hasMoreEvents || isLoadingMoreEvents) return;
    setIsLoadingMoreEvents(true);
    try {
      const page = await fetchPublishedEventPage(eventPageCursor, searchSort);
      setEvents((current) => {
        const knownIds = new Set(current.map((event) => event.id));
        return [
          ...current,
          ...page.events.filter((event) => !knownIds.has(event.id)),
        ];
      });
      setEventPageCursor(page.cursor);
      setHasMoreEvents(page.hasMore);
    } catch (error) {
      setMessage(
        `イベントを追加で読み込めませんでした。${getFirebaseErrorMessage(error)}`,
        "error",
      );
    } finally {
      setIsLoadingMoreEvents(false);
    }
  }, [
    eventPageCursor,
    hasMoreEvents,
    isLoadingMoreEvents,
    searchSort,
    setMessage,
  ]);

  const openPublishedEvent = async (eventId: string) => {
    try {
      let event = events.find((item) => item.id === eventId);
      if (!event) {
        const eventSnapshot = await getDoc(doc(db, "events", eventId));
        if (!eventSnapshot.exists()) {
          throw new Error("対象のイベントが見つかりません。");
        }
        const fetchedEvent = {
          id: eventSnapshot.id,
          ...eventSnapshot.data(),
        } as AizuEvent;
        if (fetchedEvent.status !== "published") {
          throw new Error("このイベントは現在公開されていません。");
        }
        event = fetchedEvent;
        setEvents((current) =>
          current.some((item) => item.id === eventId)
            ? current
            : [...current, fetchedEvent],
        );
      }
      setSelectedEventId(eventId);
      setActiveTab("search");
      return true;
    } catch (error) {
      setMessage(getFirebaseErrorMessage(error), "error");
      return false;
    }
  };

  useEffect(() => {
    if (!activeStudentUid || previousSearchSortRef.current === searchSort) {
      return;
    }
    previousSearchSortRef.current = searchSort;
    const requestId = searchSortRequestRef.current + 1;
    searchSortRequestRef.current = requestId;
    setIsLoadingMoreEvents(true);
    void fetchPublishedEventPage(null, searchSort)
      .then((page) => {
        if (searchSortRequestRef.current !== requestId) return;
        setEvents(page.events);
        setEventPageCursor(page.cursor);
        setHasMoreEvents(page.hasMore);
      })
      .catch((error: unknown) => {
        if (searchSortRequestRef.current !== requestId) return;
        setMessage(
          `並び順を変更できませんでした。${getFirebaseErrorMessage(error)}`,
          "error",
        );
      })
      .finally(() => {
        if (searchSortRequestRef.current === requestId) {
          setIsLoadingMoreEvents(false);
        }
      });
  }, [activeStudentUid, searchSort, setMessage]);

  useEffect(() => {
    if (progressiveSearchRef.current.key !== searchCriteriaKey) {
      progressiveSearchRef.current = {
        key: searchCriteriaKey,
        loadedPages: 0,
      };
    }
    if (
      activeTab !== "search" ||
      !hasActiveSearchCriteria ||
      !eventPageCursor ||
      !hasMoreEvents ||
      isLoadingMoreEvents ||
      progressiveSearchRef.current.loadedPages >= 3
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      progressiveSearchRef.current.loadedPages += 1;
      void loadMoreEvents();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    eventPageCursor,
    hasActiveSearchCriteria,
    hasMoreEvents,
    isLoadingMoreEvents,
    loadMoreEvents,
    searchCriteriaKey,
  ]);

  const loadProductData = async (uid: string) => {
    const data = await loadStudentDashboardData(uid);
    const loadedEvents = data.eventPage.events;
    setEvents(loadedEvents);
    setEventPageCursor(data.eventPage.cursor);
    setHasMoreEvents(data.eventPage.hasMore);
    setSelectedEventId((current) =>
      current && loadedEvents.some((event) => event.id === current)
        ? current
        : null,
    );

    setSavedEventIds(data.savedEventIds);
    setSavedEvents(data.savedEvents);
    setHasMoreSavedEvents(data.hasMoreSavedEvents);
    setNotifications(data.notifications);
    setUnreadNotificationTotal(data.unreadNotificationCount);
    setHasMoreNotifications(data.hasMoreNotifications);
    setActivities(data.activities);
    setHasMoreActivities(data.hasMoreActivities);
    setNotificationPreferences(data.notificationPreferences);
    setSavedSearch(data.savedSearch);
    setSavedSearches(data.savedSearches);
    setHasMoreSavedSearches(data.hasMoreSavedSearches);
  };

  const loadMoreNotifications = async () => {
    if (!appUser || !hasMoreNotifications) return;
    const nextLimit = notificationQueryLimit + 30;
    const page = await loadStudentNotifications(appUser.uid, nextLimit);
    setNotificationQueryLimit(nextLimit);
    setNotifications(page.items);
    setHasMoreNotifications(page.hasMore);
  };

  const loadMoreActivities = async () => {
    if (!appUser || !hasMoreActivities) return;
    const nextLimit = activityQueryLimit + 50;
    const page = await loadStudentActivities(appUser.uid, nextLimit);
    setActivityQueryLimit(nextLimit);
    setActivities(page.items);
    setHasMoreActivities(page.hasMore);
  };

  const loadMoreSavedEvents = async () => {
    if (!appUser || !hasMoreSavedEvents) return;
    const nextLimit = savedEventQueryLimit + SAVED_EVENT_PAGE_SIZE;
    const page = await loadStudentSavedEvents(appUser.uid, nextLimit);
    setSavedEventQueryLimit(nextLimit);
    setSavedEventIds(page.ids);
    setSavedEvents(page.events);
    setHasMoreSavedEvents(page.hasMore);
  };

  const loadMoreSavedSearches = async () => {
    if (!appUser || !hasMoreSavedSearches) return;
    const nextLimit = savedSearchQueryLimit + SAVED_SEARCH_PAGE_SIZE;
    const page = await loadStudentSavedSearches(appUser.uid, nextLimit);
    setSavedSearchQueryLimit(nextLimit);
    setSavedSearches(page.items);
    setSavedSearch((current) => current ?? page.items[0] ?? null);
    setHasMoreSavedSearches(page.hasMore);
  };

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
      setMessage("メールアドレスとパスワードを入力してください。", "error");
      return;
    }
    if (authMode === "register") {
      if (!hasAcceptedLegal) {
        setMessage(
          "利用規約とプライバシーポリシーを確認し、同意してください。",
          "error",
        );
        return;
      }
      if (!hasConfirmedEligibility) {
        setMessage(
          "年齢条件を確認し、未成年の場合は法定代理人の同意を得てください。",
          "error",
        );
        return;
      }
      if (password.length < 10) {
        setMessage("パスワードは10文字以上にしてください。", "error");
        return;
      }
      if (accountType === "student" && !displayName.trim()) {
        setMessage("表示名を入力してください。", "error");
        return;
      }
      if (accountType === "organization" && !organizationName.trim()) {
        setMessage("団体・自治体名を入力してください。", "error");
        return;
      }
    }
    setIsActionLoading(true);
    let createdUser: User | null = null;
    let authFlowStage: AuthFlowStage = "persistence";
    try {
      // The persistence mode must be settled before sign-in/sign-up. Without
      // this await, a fast login can race the initial auth state observer and
      // appear to be lost after a reload.
      await authPersistenceReady;
      authFlowStage = "app_check";
      await ensureAppCheck();
      if (authMode === "login") {
        authFlowStage = "sign_in";
        await loginWithEmail(normalizedEmail, normalizedPassword);
        setMessage("");
        return;
      }
      authFlowStage = "create_account";
      const credential = await registerWithEmail(normalizedEmail, password);
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
      const status: AccountStatus = resolveInitialAccountStatus({
        role: accountType,
        email: normalizedEmail,
      });
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
            : "その他"
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
        eligibilityConfirmedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(
          db,
          "legalConsents",
          `${credential.user.uid}_${TERMS_VERSION}_${PRIVACY_VERSION}`,
        ),
        {
          userId: credential.user.uid,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          acceptedAt: serverTimestamp(),
          eligibilityConfirmedAt: serverTimestamp(),
          source: "registration",
        },
      );
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
      authFlowStage = "save_profile";
      await batch.commit();
      let registrationMessage =
        isStudent && isAizuStudent
          ? "登録しました。メール認証が完了すると、すぐに利用できます。"
          : "登録しました。メール認証と管理者の承認後に利用できます。";
      let registrationTone: NoticeTone = "success";
      try {
        await resendVerificationEmail(credential.user);
      } catch (verificationError) {
        registrationTone = "info";
        registrationMessage = `登録は完了しましたが、確認メールを送信できませんでした。${getFirebaseErrorMessage(verificationError)}`;
      }
      setAppUser({
        ...userData,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        legalAcceptedAt: Timestamp.now(),
        eligibilityConfirmedAt: Timestamp.now(),
      });
      setMessage(registrationMessage, registrationTone);
    } catch (error) {
      if (authMode === "login" && isMultiFactorRequiredError(error)) {
        setMfaResolver(createMultiFactorResolver(error));
        setPassword("");
        setMessage("");
        return;
      }
      let rollbackFailed = false;
      if (createdUser) {
        await deleteAuthUser(createdUser).catch(async () => {
          rollbackFailed = true;
          await logout().catch(() => undefined);
        });
      }
      const errorCode =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "unknown";
      console.error("Authentication flow failed", {
        stage: authFlowStage,
        code: errorCode,
        rollbackFailed,
      });
      setMessage(
        getAuthFlowErrorMessage({
          stage: authFlowStage,
          error,
          rollbackFailed,
        }),
        "error",
      );
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
        "error",
      );
      return;
    }
    if (!hasRequiredCommerceDisclosure(eventToApply)) {
      setMessage(
        "この有料イベントは法定表示の確認中です。表示が整うまで申込みできません。",
        "error",
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
      const applicationStatus = result.data.status;
      setActiveRoomId(`event_${eventToApply.id}`);
      setActiveTab(
        applicationStatus === "waitlisted" ? "activity" : "messages",
      );
      setMessage(
        applicationStatus === "waitlisted"
          ? "キャンセル待ちに登録しました。空きが出たら通知します。"
          : "参加申請を送信しました。全体チャットを確認できます。",
        "success",
      );
    } catch (error) {
      setMessage(getFirebaseErrorMessage(error), "error");
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
      setMessage(getFirebaseErrorMessage(error), "error");
    }
  };

  const selectChatRoom = (roomId: string) => {
    if (roomId !== activeRoomId) {
      resetMessageWindow();
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
    setUnreadNotificationTotal((current) =>
      Math.max(0, current - unread.length),
    );
    void Promise.all(
      unread.map((notification) =>
        updateDoc(doc(db, "notifications", notification.id), {
          isRead: true,
          readAt: serverTimestamp(),
        }),
      ),
    ).catch((error: unknown) =>
      setMessage(getFirebaseErrorMessage(error), "error"),
    );
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
      setMessage(getFirebaseErrorMessage(error), "error");
    }
  };

  const cancelApplication = async (
    application: EventApplication,
    cancellationReason: string,
  ) => {
    if (
      !appUser ||
      !["pending", "waitlisted", "confirmed"].includes(application.status)
    ) {
      return;
    }
    const relatedEvent = events.find(
      (event) => event.id === application.eventId,
    );
    if (
      relatedEvent?.cancellationDeadline &&
      relatedEvent.cancellationDeadline.toMillis() < Date.now()
    ) {
      setMessage(
        "キャンセル期限を過ぎています。主催者へチャットでご連絡ください。",
        "error",
      );
      return;
    }
    setIsActionLoading(true);
    setMessage("");
    try {
      await updateDoc(doc(db, "eventApplications", application.id), {
        status: "cancelled",
        cancellationReason: cancellationReason.trim().slice(0, 300),
        cancelledAt: serverTimestamp(),
      });
      setMessage("参加申請をキャンセルしました。", "success");
    } catch (error) {
      setMessage(getFirebaseErrorMessage(error), "error");
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
    setMessage("受付が完了しました。活動実績へ反映します。", "success");
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
      setMessage("通報を受け付けました。運営が確認します。", "success");
    } catch (error) {
      setMessage(getFirebaseErrorMessage(error), "error");
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
    setHasAcceptedLegal(false);
    setHasConfirmedEligibility(false);
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
    setIsEmailVerified(false);
    verificationRefreshUidRef.current = null;
    await logout();
  };

  const acceptUpdatedLegalDocuments = async () => {
    if (!appUser || appUser.role === "admin") return;
    setIsActionLoading(true);
    setMessage("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", appUser.uid), {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        legalAcceptedAt: serverTimestamp(),
        eligibilityConfirmedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(
          db,
          "legalConsents",
          `${appUser.uid}_${TERMS_VERSION}_${PRIVACY_VERSION}`,
        ),
        {
          userId: appUser.uid,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          acceptedAt: serverTimestamp(),
          eligibilityConfirmedAt: serverTimestamp(),
          source: "reconsent",
        },
      );
      await batch.commit();
    } catch (error) {
      setMessage(getFirebaseErrorMessage(error), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isAuthLoading) return <LoadingScreen />;
  if (mfaResolver)
    return (
      <MfaSignInScreen
        resolver={mfaResolver}
        onComplete={() => setMfaResolver(null)}
        onCancel={() => {
          setMfaResolver(null);
          setMessage("");
        }}
      />
    );
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
          hasConfirmedEligibility,
          setHasConfirmedEligibility,
          isActionLoading,
          message,
          messageTone,
          handleAuthSubmit,
        }}
      />
    );
  const shouldAutoActivateCurrentUser = shouldAutoActivateVerifiedStudent({
    role: appUser.role,
    status: appUser.status,
    emailVerified: isEmailVerified,
    email: appUser.email ?? "",
  });
  if (shouldAutoActivateCurrentUser || isAutoActivatingStudent) {
    return <LoadingScreen />;
  }
  const accountAccessGate = resolveAccountAccessGate({
    isProduction: import.meta.env.PROD,
    emailVerified: isEmailVerified,
    status: appUser.status,
  });
  if (accountAccessGate === "email_verification")
    return (
      <VerifyEmailScreen
        firebaseUser={firebaseUser}
        onVerified={async () => {
          await reloadAuthUser(firebaseUser);
          if (firebaseUser.emailVerified) {
            await refreshAuthToken(firebaseUser);
          }
          setIsEmailVerified(firebaseUser.emailVerified);
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
  if (
    appUser.role !== "admin" &&
    (appUser.termsVersion !== TERMS_VERSION ||
      appUser.privacyVersion !== PRIVACY_VERSION ||
      !appUser.eligibilityConfirmedAt)
  ) {
    return (
      <LegalReconsentScreen
        isLoading={isActionLoading}
        message={message}
        messageTone={messageTone}
        onAccept={acceptUpdatedLegalDocuments}
        onLogout={() => void handleLogout()}
      />
    );
  }
  if (appUser.role === "organization") {
    return withDashboardLoading(
      <OrganizationDashboard
        appUser={appUser}
        accountDeletionRequest={accountDeletionRequest}
        onRequestAccountDeletion={requestAccountDeletion}
        onCancelAccountDeletion={cancelAccountDeletion}
        onLogout={() => void handleLogout()}
      />,
    );
  }
  if (appUser.role === "admin") {
    if (
      import.meta.env.PROD &&
      !hasTotpEnrollment(firebaseUser) &&
      newlyMfaEnrolledUserId !== firebaseUser.uid
    ) {
      return (
        <AdminMfaEnrollmentScreen
          user={firebaseUser}
          onEnrolled={() => setNewlyMfaEnrolledUserId(firebaseUser.uid)}
          onLogout={() => void handleLogout()}
        />
      );
    }
    return withDashboardLoading(
      <AdminDashboard onLogout={() => void handleLogout()} />,
    );
  }
  if (isCreatorDashboardOpen) {
    return withDashboardLoading(
      <OrganizationDashboard
        appUser={appUser}
        accountDeletionRequest={accountDeletionRequest}
        onRequestAccountDeletion={requestAccountDeletion}
        onCancelAccountDeletion={cancelAccountDeletion}
        onClose={() => setIsCreatorDashboardOpen(false)}
        onLogout={() => void handleLogout()}
      />,
    );
  }

  const hasApplied = (eventId: string) =>
    applications.some((application) => application.eventId === eventId);
  const openApplicationDialog = (event: AizuEvent) => {
    setSelectedEventId(null);
    setApplicationEvent(event);
  };
  const saveCurrentSearch = async () => {
    const searchCriteria = {
      userId: appUser.uid,
      name: searchText.trim() || `${filter}・${searchDateFilter}`,
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
    const criteriaSignature = (search: Omit<SavedSearch, "id" | "updatedAt">) =>
      JSON.stringify([
        search.searchText.trim(),
        search.category,
        search.dateFilter,
        search.dayFilter,
        search.timeFilter,
        search.feeFilter,
        search.formatFilter,
        search.onlyAvailable,
        search.onlyBeginner,
      ]);
    const existingSearch = savedSearches.find(
      (search) => criteriaSignature(search) === criteriaSignature(searchCriteria),
    );
    const nextSearch: SavedSearch = {
      ...searchCriteria,
      id: existingSearch?.id ?? `${appUser.uid}_${Date.now()}`,
    };
    const { id: savedSearchId, ...savedSearchData } = nextSearch;
    await setDoc(
      doc(db, "savedSearches", savedSearchId ?? `${appUser.uid}_default`),
      { ...savedSearchData, updatedAt: serverTimestamp() },
      { merge: true },
    );
    setSavedSearch(nextSearch);
    setSavedSearches((current) => [
      nextSearch,
      ...current.filter((search) => search.id !== nextSearch.id),
    ]);
    setMessage(
      "検索条件を保存しました。条件に合う新着イベントを通知します。",
      "success",
    );
  };
  const applySavedSearch = (selectedSearch?: SavedSearch) => {
    const search = selectedSearch ?? savedSearch;
    if (!search) return;
    setSearchText(search.searchText);
    setFilter(search.category);
    setSearchDateFilter(search.dateFilter);
    setSearchDayFilter(search.dayFilter);
    setSearchTimeFilter(search.timeFilter);
    setSearchFeeFilter(search.feeFilter);
    setSearchFormatFilter(search.formatFilter);
    setOnlyAvailableEvents(search.onlyAvailable);
    setOnlyBeginnerEvents(search.onlyBeginner);
  };
  const deleteSavedSearch = async (search: SavedSearch) => {
    if (!search.id) return;
    await deleteDoc(doc(db, "savedSearches", search.id));
    setSavedSearches((current) => {
      const next = current.filter((item) => item.id !== search.id);
      setSavedSearch((selected) =>
        selected?.id === search.id ? (next[0] ?? null) : selected,
      );
      return next;
    });
    setMessage("保存した検索条件を削除しました。", "success");
  };
  const toggleSaved = (eventId: string) => {
    if (!appUser) return;
    const saved = savedEventIds.includes(eventId);
    const eventToSave =
      events.find((event) => event.id === eventId) ??
      savedEvents.find((event) => event.id === eventId);
    setSavedEventIds((current) =>
      saved ? current.filter((id) => id !== eventId) : [...current, eventId],
    );
    setSavedEvents((current) =>
      saved
        ? current.filter((event) => event.id !== eventId)
        : eventToSave && !current.some((event) => event.id === eventId)
          ? [eventToSave, ...current]
          : current,
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
      setSavedEvents((current) =>
        saved && eventToSave && !current.some((event) => event.id === eventId)
          ? [eventToSave, ...current]
          : current.filter((event) => event.id !== eventId),
      );
      setMessage(getFirebaseErrorMessage(error), "error");
    });
  };

  const goToStudentHome = () => {
    setActiveTab("home");
    setSelectedEventId(null);
    setActiveRoomId(null);
    setIsNotificationOpen(false);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#student-main">
        メインコンテンツへ移動
      </a>
      <header className="app-header">
        <div className="header-inner">
          <button
            className="brand-lockup"
            type="button"
            onClick={goToStudentHome}
            aria-label="ホームへ戻る"
          >
            <BrandMark />
            <span>
              <strong>Aizu Connect</strong>
              <small>会津のイベント情報</small>
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
              ref={notificationButtonRef}
              className="icon-button"
              title="通知"
              type="button"
              aria-label={
                unreadNotificationTotal > 0
                  ? `通知、未読${unreadNotificationTotal}件`
                  : "通知"
              }
              aria-controls="notification-panel"
              aria-expanded={isNotificationOpen}
              onClick={() => setIsNotificationOpen((current) => !current)}
            >
              <Bell size={19} />
              {unreadNotificationTotal > 0 && (
                <span className="notification-badge" aria-hidden="true">
                  {unreadNotificationTotal > 9 ? "9+" : unreadNotificationTotal}
                </span>
              )}
            </button>
            <button
              className="avatar-button"
              title="プロフィール"
              type="button"
              aria-label="プロフィール"
              onClick={() => setActiveTab("profile")}
            >
              <UserRound size={18} />
            </button>
          </div>
        </div>
      </header>

      <nav className="bottom-nav" aria-label="メインナビゲーション">
        <TabButton
          active={activeTab === "home"}
          icon={<Home size={19} />}
          label="ホーム"
          onClick={goToStudentHome}
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

      <main
        className="app-content"
        id="student-main"
        aria-label={tabLabels[activeTab]}
        tabIndex={-1}
      >
        {isNotificationOpen && (
          <NotificationPanel
            notifications={notifications}
            unreadTotal={unreadNotificationTotal}
            hasMore={hasMoreNotifications}
            onLoadMore={() => void loadMoreNotifications()}
            onReadAll={async () => {
              if (!appUser || unreadNotificationTotal === 0) return;
              try {
                await markAllStudentNotificationsRead();
                setNotifications((current) =>
                  current.map((notification) => ({
                    ...notification,
                    isRead: true,
                  })),
                );
                setUnreadNotificationTotal(0);
              } catch (error) {
                setMessage(
                  `通知を既読にできませんでした。${getFirebaseErrorMessage(error)}`,
                  "error",
                );
              }
            }}
            onClose={() => {
              setIsNotificationOpen(false);
              window.requestAnimationFrame(() =>
                notificationButtonRef.current?.focus(),
              );
            }}
            onRead={async (notification) => {
              try {
                if (!notification.isRead) {
                  await updateDoc(doc(db, "notifications", notification.id), {
                    isRead: true,
                    readAt: serverTimestamp(),
                  });
                  setUnreadNotificationTotal((current) =>
                    Math.max(0, current - 1),
                  );
                }
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
                  if (await openPublishedEvent(notification.targetId)) {
                    setIsNotificationOpen(false);
                  }
                } else if (
                  notification.targetType === "chat" &&
                  notification.targetId
                ) {
                  setActiveRoomId(notification.targetId);
                  setActiveTab("messages");
                  setIsNotificationOpen(false);
                } else if (notification.targetType === "application") {
                  setActiveTab("activity");
                  setIsNotificationOpen(false);
                }
              } catch (error) {
                setMessage(getFirebaseErrorMessage(error), "error");
              }
            }}
          />
        )}
        {activeTab === "home" && (
          <div className="welcome-row">
            <div>
              <h1>
                こんにちは、
                <wbr />
                <span className="welcome-name">{appUser.displayName}さん</span>
              </h1>
              <p>参加予定や新しいイベントを確認できます。</p>
            </div>
            <div className="welcome-stats">
              <span>
                <strong>
                  {applications.length}
                  {hasMoreApplications ? "+" : ""}
                </strong>
                申請
              </span>
              <span>
                <strong>
                  {savedEventIds.length}
                  {hasMoreSavedEvents ? "+" : ""}
                </strong>
                保存
              </span>
            </div>
          </div>
        )}
        {message && (
          <NoticeBanner
            message={message}
            tone={messageTone}
            onClose={() => setMessage("")}
          />
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
              requestApplication: openApplicationDialog,
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
              loadedEventCount: events.length,
              hasMoreEvents,
              isLoadingMoreEvents,
              onLoadMoreEvents: () => void loadMoreEvents(),
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
              requestApplication: openApplicationDialog,
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
              savedSearches,
              hasMoreSavedSearches,
              onLoadMoreSavedSearches: () =>
                void loadMoreSavedSearches().catch((error) =>
                  setMessage(getFirebaseErrorMessage(error), "error"),
                ),
              onSaveSearch: () =>
                void saveCurrentSearch().catch((error) =>
                  setMessage(getFirebaseErrorMessage(error), "error"),
                ),
              onApplySavedSearch: applySavedSearch,
              onDeleteSavedSearch: async (search: SavedSearch) => {
                try {
                  await deleteSavedSearch(search);
                } catch (error) {
                  setMessage(getFirebaseErrorMessage(error), "error");
                }
              },
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
                setSearchSort("開催が近い順");
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
          <Suspense fallback={<DeferredContentLoading />}>
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
                  const room = chatRooms.find(
                    (item) =>
                      item.eventId === eventId && item.roomType === "event",
                  );
                  if (room) selectChatRoom(room.id);
                  setActiveTab("messages");
                },
                onCancelApplication: setApplicationToCancel,
                onCheckIn: (application: EventApplication, code: string) =>
                  checkInApplication(application, code),
                hasMoreApplications,
                onLoadMoreApplications: () =>
                  setApplicationQueryLimit((current) => current + 50),
                hasMoreActivities,
                onLoadMoreActivities: () => void loadMoreActivities(),
              }}
            />
          </Suspense>
        )}
        {activeTab === "messages" && (
          <Suspense fallback={<DeferredContentLoading />}>
            <MessagesTab
            rooms={chatRooms}
            hasMoreRooms={hasMoreChatRooms}
            activeRoomId={activeRoomId}
            messages={chatMessages}
            hasOlderMessages={hasOlderChatMessages}
            onLoadOlder={loadOlderMessages}
            draft={messageDraft}
            unreadCounts={unreadChatCounts}
            readReceipts={chatReadReceipts}
            mutedRoomIds={chatPreferences
              .filter((preference) => preference.muted)
              .map((preference) => preference.roomId)}
            onSelectRoom={selectChatRoom}
            onCloseRoom={() => setActiveRoomId(null)}
            onLoadMoreRooms={() =>
              setChatRoomQueryLimit((current) => current + 50)
            }
            onToggleMute={(roomId) => void toggleChatMute(roomId)}
            onDraftChange={setMessageDraft}
            onSend={() => void sendMessage()}
            onUploadAttachment={async (file) => {
              try {
                await uploadChatAttachment(file);
              } catch (error) {
                setMessage(getFirebaseErrorMessage(error), "error");
              }
            }}
            onReportMessage={(chatMessage) =>
              setReportTarget({
                targetType: "message",
                targetId: chatMessage.id,
                title: `${chatMessage.senderName}さんのメッセージ`,
              })
            }
            onEditMessage={(chatMessage, text) =>
              editChatMessage(
                activeRoomId ?? chatMessage.roomId,
                chatMessage.id,
                text,
              )
            }
            onDeleteMessage={(chatMessage) =>
              deleteChatMessage(
                activeRoomId ?? chatMessage.roomId,
                chatMessage.id,
              )
            }
            currentUserId={appUser.uid}
            currentUserRole="student"
            onOpenActivity={() => setActiveTab("activity")}
            onOpenEvent={(eventId) => void openPublishedEvent(eventId)}
            />
          </Suspense>
        )}
        {activeTab === "profile" && (
          <Suspense fallback={<DeferredContentLoading />}>
            <ProfileTab
            appUser={appUser}
            applications={applications}
            activities={activities}
            activityByMonth={activityByMonth}
            savedEventIds={savedEventIds}
            events={savedEvents}
            hasMoreSavedEvents={hasMoreSavedEvents}
            onLoadMoreSavedEvents={() =>
              void loadMoreSavedEvents().catch((error) =>
                setMessage(getFirebaseErrorMessage(error), "error"),
              )
            }
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
            onOpenSavedEvent={(eventId) => void openPublishedEvent(eventId)}
            onLogout={() => void handleLogout()}
            />
          </Suspense>
        )}
      </main>
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
        <ActionReasonDialog
          title="参加申請をキャンセルしますか？"
          description={`「${applicationToCancel.eventTitle}」の申請を取り消します。取り消した申請は元に戻せません。`}
          label="キャンセル理由"
          placeholder="主催者に伝える理由を入力してください"
          confirmLabel="申請を取り消す"
          danger
          onClose={() => setApplicationToCancel(null)}
          onConfirm={async (reason) => {
            const application = applicationToCancel;
            setApplicationToCancel(null);
            await cancelApplication(application, reason);
          }}
        />
      )}
    </div>
  );
}

export default App;
