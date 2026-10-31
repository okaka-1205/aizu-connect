import {
  onAuthStateChanged,
  type MultiFactorResolver,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
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
  type ReactNode,
} from "react";
import { MfaSignInScreen } from "./components/MfaSignInScreen";
import {
  BrandMark,
  LoadingScreen,
  NoticeBanner,
  TabButton,
} from "./components/ui/AppPrimitives";
import { tabLabels } from "./config/events";
import { PRIVACY_VERSION, TERMS_VERSION } from "./content/legalMetadata";
import { useAccountDeletion } from "./hooks/useAccountDeletion";
import { useAuthForm } from "./hooks/useAuthForm";
import { useEventSearch } from "./hooks/useEventSearch";
import { useNoticeState } from "./hooks/useNoticeState";
import { useRoomConversation } from "./hooks/useRoomConversation";
import { useStudentNavigation } from "./hooks/useStudentNavigation";
import {
  didCompleteManualApproval,
  getApplicationSubmissionError,
  getFirebaseErrorMessage,
  resolveAccountAccessGate,
  shouldAutoActivateVerifiedStudent,
  validateImageFile,
} from "./lib/appLogic";
import {
  defaultNotificationPreferences,
  hasRequiredCommerceDisclosure,
} from "./lib/eventUtils";
import {
  auth,
  authPersistenceReady,
  db,
  ensureAppCheck,
  functions,
} from "./lib/firebase";
import { uploadImage } from "./lib/storage";
import {
  loadChatPreferencesForRooms,
  sendChatAttachment,
  sendChatTextMessage,
  subscribeChatRoomsForUser,
} from "./repositories/chatRepository";
import {
  deleteChatMessage,
  editChatMessage,
} from "./repositories/engagementRepository";
import { fetchPublishedEventPage } from "./repositories/eventsRepository";
import {
  loadStudentActivities,
  loadStudentDashboardData,
  loadStudentNotifications,
  loadStudentSavedEvents,
  loadStudentSavedSearches,
  markAllStudentNotificationsRead,
  SAVED_EVENT_PAGE_SIZE,
  SAVED_SEARCH_PAGE_SIZE,
  subscribeStudentApplications,
} from "./repositories/studentRepository";
import {
  AccountRejectedScreen,
  AccountSetupScreen,
  AdminApprovalPendingScreen,
  VerifyEmailScreen,
} from "./screens/auth/AccountGateScreens";
import { AuthScreen, LegalReconsentScreen } from "./screens/auth/AuthScreens";
import { ActionReasonDialog } from "./screens/shared/RoleScreenPrimitives";
import {
  NotificationPanel,
  ReportDialog,
} from "./screens/shared/StudentOverlays";
import { ApplicationDialog } from "./screens/student/ApplicationDialog";
import { HomeTab, SearchTab } from "./screens/student/DiscoverTabs";
import {
  logout,
  refreshAuthToken,
  reloadAuthUser,
} from "./services/authService";
import { hasTotpEnrollment } from "./services/mfaService";
import type {
  AccountStatus,
  ActivityRecord,
  AizuEvent,
  ApplicationDetails,
  AppUser,
  ChatMessage,
  ChatPreference,
  ChatRoom,
  EventApplication,
  NotificationItem,
  NotificationPreferences,
  ReportTarget,
  SavedSearch,
  SearchSort,
} from "./types/domain";

const AdminMfaEnrollmentScreen = lazy(() =>
  import("./components/AdminMfaEnrollmentScreen").then((module) => ({
    default: module.AdminMfaEnrollmentScreen,
  })),
);
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

function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(
    null,
  );
  const [newlyMfaEnrolledUserId, setNewlyMfaEnrolledUserId] = useState<
    string | null
  >(null);
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
  const {
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
    handleAuthSubmit,
  } = useAuthForm({
    setMessage,
    setIsActionLoading,
    setAppUser,
    setMfaResolver,
  });

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
  const mutedChatRoomIds = useMemo(
    () =>
      chatPreferences
        .filter((preference) => preference.muted)
        .map((preference) => preference.roomId),
    [chatPreferences],
  );
  const chatRoomIdsKey = useMemo(
    () =>
      chatRooms
        .map((room) => room.id)
        .sort()
        .join("\n"),
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
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const previousSearchSortRef = useRef<SearchSort>("開催が近い順");
  const searchSortRequestRef = useRef(0);
  const progressiveSearchRef = useRef({ key: "", loadedPages: 0 });
  const { selectedEventId, setSelectedEventId, activeTab, setActiveTab } =
    useStudentNavigation(events);

  const {
    resetSearch,
    resetSavedSearches,
    filter,
    setFilter,
    searchText,
    setSearchText,
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
    onlyAvailableEvents,
    setOnlyAvailableEvents,
    onlyBeginnerEvents,
    setOnlyBeginnerEvents,
    savedSearch,
    setSavedSearch,
    savedSearches,
    setSavedSearches,
    upcomingEvents,
    filteredEvents,
    hasActiveSearchCriteria,
    searchCriteriaKey,
    recommendedEvent,
    recommendationLabel,
    saveCurrentSearch,
    applySavedSearch,
    deleteSavedSearch,
  } = useEventSearch({ events, appUser, setMessage });

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId),
    [events, selectedEventId],
  );

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
      const bucket = months[month - 1];
      if (bucket) bucket.count += 1;
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
            resetSearch();
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
            resetSavedSearches();
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
  }, [
    setActiveTab,
    setMessage,
    setSelectedEventId,
    resetSearch,
    resetSavedSearches,
  ]);

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

  const loadProductData = useCallback(
    async (uid: string) => {
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
    },
    [setSavedSearch, setSavedSearches, setSelectedEventId],
  );

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
  }, [activeStudentUid, setMessage, loadProductData, setSavedSearches]);

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
      const recovery = getApplicationSubmissionError(error);
      if (recovery.showActivity) setActiveTab("activity");
      setMessage(recovery.message, recovery.tone);
    } finally {
      setIsActionLoading(false);
    }
  };

  const uploadChatAttachment = async (file: File) => {
    if (!appUser || !activeRoomId) return;
    await sendChatAttachment(
      activeRoomId,
      { senderId: appUser.uid, senderName: appUser.displayName },
      file,
    );
  };

  const sendMessage = async () => {
    if (!appUser || !activeRoomId || !messageDraft.trim()) return;
    const text = messageDraft.trim().slice(0, 2000);
    setMessageDraft("");
    try {
      await sendChatTextMessage(
        activeRoomId,
        { senderId: appUser.uid, senderName: appUser.displayName },
        text,
      );
    } catch (error) {
      setMessageDraft((current) => current || text);
      setMessage(getFirebaseErrorMessage(error), "error");
    }
  };

  const editMessage = useCallback(
    (chatMessage: ChatMessage, text: string) =>
      editChatMessage(activeRoomId ?? chatMessage.roomId, chatMessage.id, text),
    [activeRoomId],
  );
  const reportChatMessage = useCallback((chatMessage: ChatMessage) => {
    setReportTarget({
      targetType: "message",
      targetId: chatMessage.id,
      title: `${chatMessage.senderName}さんのメッセージ`,
    });
  }, []);
  const loadMoreChatRooms = useCallback(
    () => setChatRoomQueryLimit((current) => current + 50),
    [],
  );

  const selectChatRoom = useCallback(
    (roomId: string) => {
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
    },
    [activeRoomId, notifications, resetMessageWindow, setMessage],
  );

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
    resetSearch();
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
      return withDashboardLoading(
        <AdminMfaEnrollmentScreen
          user={firebaseUser}
          onEnrolled={() => setNewlyMfaEnrolledUserId(firebaseUser.uid)}
          onLogout={() => void handleLogout()}
        />,
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
              mutedRoomIds={mutedChatRoomIds}
              onSelectRoom={selectChatRoom}
              onCloseRoom={() => setActiveRoomId(null)}
              onLoadMoreRooms={loadMoreChatRooms}
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
              onReportMessage={reportChatMessage}
              onEditMessage={editMessage}
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
              onSaveProfile={async (updates, onImageUploadProgress) => {
                const { profileImageFile, ...profileUpdates } = updates;
                let profileImageUrl = appUser.profileImageUrl;
                if (profileImageFile) {
                  validateImageFile(profileImageFile, "プロフィール画像");
                  profileImageUrl = await uploadImage(
                    profileImageFile,
                    `profile-images/${appUser.uid}/profile-${Date.now()}`,
                    onImageUploadProgress,
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
