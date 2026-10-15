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
import { onAuthStateChanged, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Compass,
  Eye,
  EyeOff,
  Flag,
  Home,
  Loader2,
  LogOut,
  MapPin,
  MessageSquareText,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Field } from "./components/Field";
import { LegalDialog } from "./components/LegalDialog";
import {
  BrandMark,
  LoadingScreen,
  NoticeBanner,
  TabButton,
} from "./components/ui/AppPrimitives";
import {
  PRIVACY_VERSION,
  TERMS_VERSION,
  type LegalDocument,
} from "./content/legalDocuments";
import { useDialogAccessibility } from "./hooks/useDialogAccessibility";
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
import { subscribeChatRoomsForUser } from "./repositories/chatRepository";
import {
  deleteChatMessage,
  editChatMessage,
  saveUserBlock,
} from "./repositories/engagementRepository";
import {
  loadStudentActivities,
  loadStudentDashboardData,
  loadStudentNotifications,
  subscribeStudentApplications,
} from "./repositories/studentRepository";
import {
  deleteAuthUser,
  loginWithEmail,
  logout,
  refreshAuthToken,
  registerWithEmail,
  reloadAuthUser,
  requestPasswordReset,
  resendVerificationEmail,
} from "./services/authService";
import { AdminDashboard } from "./screens/admin/AdminDashboard";
import { OrganizationDashboard } from "./screens/organization/OrganizationDashboard";
import { MessagesTab } from "./screens/shared/MessagesTab";
import { EmptyRoleState } from "./screens/shared/RoleScreenPrimitives";
import { ActionReasonDialog } from "./screens/shared/RoleScreenPrimitives";
import { ActivityTab } from "./screens/student/ActivityTab";
import { ApplicationDialog } from "./screens/student/ApplicationDialog";
import { HomeTab, SearchTab } from "./screens/student/DiscoverTabs";
import { ProfileTab } from "./screens/student/ProfileTab";
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
  const [eventPageCursor, setEventPageCursor] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreEvents, setHasMoreEvents] = useState(false);
  const [isLoadingMoreEvents, setIsLoadingMoreEvents] = useState(false);
  const [applications, setApplications] = useState<EventApplication[]>([]);
  const [applicationQueryLimit, setApplicationQueryLimit] = useState(50);
  const [hasMoreApplications, setHasMoreApplications] = useState(false);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
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
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedEventIds, setSavedEventIds] = useState<string[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isAutoActivatingStudent, setIsAutoActivatingStudent] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [message, messageTone, setMessage] = useNoticeState();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
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
  const exhaustiveSearchRequestRef = useRef(0);

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
    searchSort !== "開催が近い順" ||
    onlyAvailableEvents ||
    onlyBeginnerEvents,
  );

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
  }, [activeTab]);

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
  const unreadNotificationTotal = notifications.filter(
    (notification) => !notification.isRead,
  ).length;

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
            setNotificationQueryLimit(30);
            setHasMoreNotifications(false);
            setActivities([]);
            setActivityQueryLimit(50);
            setHasMoreActivities(false);
            setSavedEventIds([]);
            setBlockedUserIds([]);
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
                      if (disposed || auth.currentUser?.uid !== user.uid) return;
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
  }, [setMessage]);

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
      setApplications([]);
      setChatRooms([]);
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
      (rooms) => {
        setChatRooms(rooms);
        setActiveRoomId((current) => current ?? rooms[0]?.id ?? null);
      },
      (error) => setMessage(getFirebaseErrorMessage(error), "error"),
    );
  }, [activeStudentUid, setMessage]);

  useEffect(() => {
    if (!activeStudentUid) return;
    return subscribeStudentApplications(
      activeStudentUid,
      setApplications,
      (error) => setMessage(getFirebaseErrorMessage(error), "error"),
      applicationQueryLimit,
      setHasMoreApplications,
    );
  }, [
    activeStudentUid,
    applicationQueryLimit,
    setMessage,
  ]);

  const loadMoreEvents = async () => {
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
  };

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
    const requestId = exhaustiveSearchRequestRef.current + 1;
    exhaustiveSearchRequestRef.current = requestId;

    if (
      activeTab !== "search" ||
      !hasActiveSearchCriteria ||
      !eventPageCursor ||
      !hasMoreEvents
    ) {
      setIsLoadingMoreEvents(false);
      return;
    }

    setIsLoadingMoreEvents(true);
    void (async () => {
      try {
        let cursor: QueryDocumentSnapshot<DocumentData> | null =
          searchSort === "開催が近い順" ? eventPageCursor : null;
        let hasNextPage: boolean =
          searchSort === "開催が近い順" ? hasMoreEvents : true;
        const searchEvents: AizuEvent[] = [];

        if (searchSort !== "開催が近い順") {
          const firstPage = await fetchPublishedEventPage(null, searchSort);
          searchEvents.push(...firstPage.events);
          cursor = firstPage.cursor;
          hasNextPage = firstPage.hasMore;
        }

        while (
          cursor &&
          hasNextPage &&
          exhaustiveSearchRequestRef.current === requestId
        ) {
          const page = await fetchPublishedEventPage(cursor, searchSort);
          searchEvents.push(...page.events);
          cursor = page.cursor;
          hasNextPage = page.hasMore;
        }

        if (exhaustiveSearchRequestRef.current !== requestId) return;
        setEvents((current) => {
          if (searchSort !== "開催が近い順") return searchEvents;
          const knownIds = new Set(current.map((event) => event.id));
          return [
            ...current,
            ...searchEvents.filter((event) => !knownIds.has(event.id)),
          ];
        });
        setEventPageCursor(cursor);
        setHasMoreEvents(hasNextPage);
      } catch (error) {
        if (exhaustiveSearchRequestRef.current === requestId) {
          setMessage(
            `検索対象をすべて読み込めませんでした。${getFirebaseErrorMessage(error)}`,
            "error",
          );
        }
      } finally {
        if (exhaustiveSearchRequestRef.current === requestId) {
          setIsLoadingMoreEvents(false);
        }
      }
    })();

    return () => {
      if (exhaustiveSearchRequestRef.current === requestId) {
        exhaustiveSearchRequestRef.current += 1;
      }
    };
  }, [
    activeTab,
    eventPageCursor,
    hasActiveSearchCriteria,
    hasMoreEvents,
    searchSort,
    setMessage,
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

    setChatPreferences(data.chatPreferences);
    setSavedEventIds(data.savedEventIds);
    setBlockedUserIds(data.blockedUserIds);
    setNotifications(data.notifications);
    setHasMoreNotifications(data.hasMoreNotifications);
    setActivities(data.activities);
    setHasMoreActivities(data.hasMoreActivities);
    setNotificationPreferences(data.notificationPreferences);
    setSavedSearch(data.savedSearch);
    setSavedSearches(data.savedSearches);
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
      const applicationId = result.data.applicationId;
      const applicationStatus = result.data.status;
      setActiveRoomId(applicationId);
      setActiveTab(
        applicationStatus === "waitlisted" ? "activity" : "messages",
      );
      setMessage(
        applicationStatus === "waitlisted"
          ? "キャンセル待ちに登録しました。空きが出たら通知します。"
          : "参加申請を送信しました。主催者からの連絡を待ちましょう。",
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
    const relatedEvent = events.find((event) => event.id === application.eventId);
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
  const openApplicationDialog = (event: AizuEvent) => {
    setSelectedEventId(null);
    setApplicationEvent(event);
  };
  const saveCurrentSearch = async () => {
    const nextSearch: SavedSearch = {
      id: `${appUser.uid}_${Date.now()}`,
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
    const { id: savedSearchId, ...savedSearchData } = nextSearch;
    await setDoc(
      doc(db, "savedSearches", savedSearchId ?? `${appUser.uid}_default`),
      { ...savedSearchData, updatedAt: serverTimestamp() },
      { merge: true },
    );
    setSavedSearch(nextSearch);
    setSavedSearches((current) => [nextSearch, ...current].slice(0, 10));
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
              {notifications.some((notification) => !notification.isRead) && (
                <span className="notification-dot" aria-hidden="true" />
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
            hasMore={hasMoreNotifications}
            onLoadMore={() => void loadMoreNotifications()}
            onClose={() => {
              setIsNotificationOpen(false);
              window.requestAnimationFrame(() =>
                notificationButtonRef.current?.focus(),
              );
            }}
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
                <strong>{applications.length}</strong>申請
              </span>
              <span>
                <strong>{savedEventIds.length}</strong>保存
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
              onSaveSearch: () =>
                void saveCurrentSearch().catch((error) =>
                  setMessage(getFirebaseErrorMessage(error), "error"),
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
              hasMoreApplications,
              onLoadMoreApplications: () =>
                setApplicationQueryLimit((current) => current + 50),
              hasMoreActivities,
              onLoadMoreActivities: () => void loadMoreActivities(),
            }}
          />
        )}
        {activeTab === "messages" && (
          <MessagesTab
            rooms={chatRooms}
            activeRoomId={activeRoomId}
            messages={chatMessages.filter(
              (chatMessage) => !blockedUserIds.includes(chatMessage.senderId),
            )}
            hasOlderMessages={hasOlderChatMessages}
            onLoadOlder={loadOlderMessages}
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
              editChatMessage(activeRoomId ?? chatMessage.roomId, chatMessage.id, text)
            }
            onDeleteMessage={(chatMessage) =>
              deleteChatMessage(
                activeRoomId ?? chatMessage.roomId,
                chatMessage.id,
              )
            }
            onBlockUser={async (chatMessage) => {
              await saveUserBlock(appUser.uid, chatMessage.senderId);
              setBlockedUserIds((current) => [
                ...new Set([...current, chatMessage.senderId]),
              ]);
              setMessage(`${chatMessage.senderName}さんをブロックしました。`, "success");
            }}
            currentUserId={appUser.uid}
            currentUserRole="student"
            onOpenActivity={() => setActiveTab("activity")}
            onOpenEvent={(eventId) => void openPublishedEvent(eventId)}
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
            onOpenSavedEvent={(eventId) => void openPublishedEvent(eventId)}
            onLogout={() => void handleLogout()}
          />
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

function LegalReconsentScreen({
  isLoading,
  message,
  messageTone,
  onAccept,
  onLogout,
}: {
  isLoading: boolean;
  message: string;
  messageTone: NoticeTone;
  onAccept: () => Promise<void>;
  onLogout: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(
    null,
  );

  return (
    <main className="loading-screen">
      <section className="pending-card legal-reconsent-card">
        <BrandMark large />
        <p className="eyebrow">重要なお知らせ</p>
        <h1>利用条件を更新しました</h1>
        <p>
          個人情報の共有範囲、退会時のデータ、有料イベントおよび未成年者の取扱いを
          明確にしました。利用を続ける前に内容を確認してください。
        </p>
        <div className="legal-reconsent-links">
          <button type="button" onClick={() => setLegalDocument("terms")}>
            利用規約（{TERMS_VERSION}）を読む
          </button>
          <button type="button" onClick={() => setLegalDocument("privacy")}>
            プライバシーポリシー（{PRIVACY_VERSION}）を読む
          </button>
        </div>
        <label className="application-consent">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            両文書に同意します。16歳以上で、未成年の場合は法定代理人の同意を得ています
          </span>
        </label>
        {message && <NoticeBanner message={message} tone={messageTone} />}
        <button
          className="primary-action"
          type="button"
          disabled={!confirmed || isLoading}
          onClick={() => void onAccept()}
        >
          {isLoading && <Loader2 size={16} className="spin" />}
          同意して利用を続ける
        </button>
        <button className="text-button" type="button" onClick={onLogout}>
          同意せずログアウト
        </button>
      </section>
      {legalDocument && (
        <LegalDialog
          document={legalDocument}
          onClose={() => setLegalDocument(null)}
        />
      )}
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
  messageTone: NoticeTone;
  handleAuthSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(
    null,
  );
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState(props.email);
  const [resetMessage, resetMessageTone, setResetMessage] = useNoticeState();
  const [isResetting, setIsResetting] = useState(false);

  const submitPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetEmail.trim()) {
      setResetMessage("メールアドレスを入力してください。", "error");
      return;
    }
    setIsResetting(true);
    setResetMessage("");
    try {
      await ensureAppCheck();
      await requestPasswordReset(resetEmail.trim());
      setResetMessage(
        "パスワード再設定メールを送信しました。メールを確認してください。",
        "success",
      );
    } catch (error) {
      setResetMessage(getFirebaseErrorMessage(error), "error");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-visual">
        <div className="auth-brand">
          <BrandMark />
          <strong>Aizu Connect</strong>
        </div>
        <div>
          <h1>
            会津のイベント
            <br />
            <em>を探す。</em>
          </h1>
          <p>
            学生・地域・団体が主催するイベントを、
            <br />
            探して、申し込んで、参加できます。
          </p>
        </div>
        <div className="auth-visual-note">
          <UsersRound size={17} /> 参加した活動は記録として残ります
        </div>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form-card">
          <div className="auth-mobile-brand">
            <BrandMark />
            <strong>Aizu Connect</strong>
          </div>
          <h2>
            {props.authMode === "register" ? "アカウントを作成" : "ログイン"}
          </h2>
          <p className="auth-lede">
            {props.authMode === "register"
              ? "利用に必要な情報を入力してください。"
              : "メールアドレスとパスワードを入力してください。"}
          </p>
          <div className="auth-switch" role="group" aria-label="認証方法">
            <button
              className={props.authMode === "register" ? "active" : ""}
              type="button"
              aria-pressed={props.authMode === "register"}
              onClick={() => props.setAuthMode("register")}
            >
              新規登録
            </button>
            <button
              className={props.authMode === "login" ? "active" : ""}
              type="button"
              aria-pressed={props.authMode === "login"}
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
                  <span>
                    利用規約とプライバシーポリシーに同意します。16歳以上で、
                    未成年の場合は法定代理人の同意を得ています
                  </span>
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
                ? "アカウントを作成"
                : "ログインする"}
            </button>
          </form>
          {props.authMode === "login" && isResetOpen && (
            <form
              className="password-reset-panel"
              onSubmit={(event) => void submitPasswordReset(event)}
            >
              <p className="eyebrow">ログインできない場合</p>
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
              {resetMessage && (
                <NoticeBanner message={resetMessage} tone={resetMessageTone} />
              )}
            </form>
          )}
          {props.message && (
            <NoticeBanner message={props.message} tone={props.messageTone} />
          )}
          <p className="form-footnote">
            個人はメール認証後に利用できます。団体・自治体は管理者が登録内容を確認します。
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
  const [notice, noticeTone, setNotice] = useNoticeState();
  const [isSending, setIsSending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const resend = async () => {
    setIsSending(true);
    setNotice("");
    try {
      await resendVerificationEmail(firebaseUser);
      setNotice(
        "確認メールを再送しました。メール内のリンクを開いてください。",
        "success",
      );
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error), "error");
    } finally {
      setIsSending(false);
    }
  };

  const checkVerification = async () => {
    setIsChecking(true);
    setNotice("");
    try {
      await onVerified();
      const isVerified = Boolean(auth.currentUser?.emailVerified);
      setNotice(
        isVerified
          ? "メール認証が完了しました。"
          : "まだ認証を確認できません。メールのリンクを開いてから再確認してください。",
        isVerified ? "success" : "info",
      );
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error), "error");
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <main className="loading-screen">
      <div className="pending-card verify-card">
        <BrandMark />
        <h1>メールを確認してください</h1>
        <p>
          <strong>{firebaseUser.email}</strong> に確認メールを送信しました。
          リンクを開いたあと、この画面で認証状態を確認してください。
        </p>
        {notice && <NoticeBanner message={notice} tone={noticeTone} />}
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
        <BrandMark />
        <h1>運営が登録内容を確認しています</h1>
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
        <BrandMark />
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
        <BrandMark />
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

function NotificationPanel({
  notifications,
  hasMore,
  onLoadMore,
  onClose,
  onRead,
}: {
  notifications: NotificationItem[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  onClose: () => void;
  onRead: (notification: NotificationItem) => Promise<void>;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <aside
      ref={panelRef}
      className="notification-panel"
      id="notification-panel"
      aria-label="通知"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="notification-panel-head">
        <div>
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
          {hasMore && onLoadMore && (
            <button type="button" onClick={onLoadMore}>
              過去の通知をさらに30件読み込む
            </button>
          )}
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

export default App;
