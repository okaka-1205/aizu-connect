import {
  collection,
  doc,
  endAt,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAt,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  Link as LinkIcon,
  Loader2,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckInQrCode } from "../../components/CheckInQrCode";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ImageCropDialog } from "../../components/ImageCropDialog";
import { NoticeBanner } from "../../components/ui/AppPrimitives";
import { useNoticeState } from "../../hooks/useNoticeState";
import { useRoomConversation } from "../../hooks/useRoomConversation";
import {
  getFirebaseErrorMessage,
  isAttendanceWindowOpen,
} from "../../lib/appLogic";
import {
  preferredScrollBehavior,
  revokeObjectUrl,
  timestampMillis,
} from "../../lib/eventUtils";
import { db } from "../../lib/firebase";
import { uploadImage } from "../../lib/storage";
import {
  loadChatPreferencesForRooms,
  sendChatAttachment,
  sendChatTextMessage,
  subscribeChatRoomsForUser,
} from "../../repositories/chatRepository";
import {
  deleteChatMessage,
  editChatMessage,
  saveEventReport,
} from "../../repositories/engagementRepository";
import type {
  AccountDeletionRequest,
  AizuEvent,
  AppUser,
  ChatMessage,
  ChatPreference,
  ChatRoom,
  EventApplication,
  NotificationItem,
} from "../../types/domain";
import { AccountDeletionPanel } from "../shared/AccountDeletionPanel";
import { EventDrawer } from "../shared/EventDrawer";
import { MessagesTab } from "../shared/MessagesTab";
import {
  ActionReasonDialog,
  EmptyRoleState,
  RoleShell,
} from "../shared/RoleScreenPrimitives";
import { applicationStatusLabel } from "../shared/applicationStatus";
import { EventSurveyResults } from "./components/EventSurveyResults";
import { OrganizationEventForm } from "./components/OrganizationEventForm";
import { OrganizationNavigation } from "./components/OrganizationNavigation";
import { useOrganizationEventEditor } from "./hooks/useOrganizationEventEditor";
import {
  countUnreadChats,
  downloadParticipantReport,
  filterOrganizationApplications,
  filterOrganizationEvents,
  summarizeApplicants,
} from "./organizationDashboardLogic";

type OrganizationView =
  "home" | "create" | "events" | "participants" | "messages" | "settings";

const organizationViews: OrganizationView[] = [
  "home",
  "create",
  "events",
  "participants",
  "messages",
  "settings",
];

export function OrganizationDashboard({
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
  const [activeView, setActiveView] = useState<OrganizationView>(() => {
    const candidate = new URLSearchParams(window.location.search).get(
      "orgView",
    );
    return organizationViews.includes(candidate as OrganizationView)
      ? (candidate as OrganizationView)
      : "home";
  });
  const [events, setEvents] = useState<AizuEvent[]>([]);
  const [eventQueryLimit, setEventQueryLimit] = useState(50);
  const [hasMoreManagedEvents, setHasMoreManagedEvents] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [applications, setApplications] = useState<EventApplication[]>([]);
  const [notice, noticeTone, setNotice] = useNoticeState();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [chatRoomQueryLimit, setChatRoomQueryLimit] = useState(50);
  const [hasMoreChatRooms, setHasMoreChatRooms] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
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
  const {
    chatMessages,
    hasOlderChatMessages,
    chatReadReceipts,
    loadOlderMessages,
    resetMessageWindow,
  } = useRoomConversation({
    roomId: activeRoomId,
    userId: appUser.uid,
    setNotice,
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationQueryLimit, setNotificationQueryLimit] = useState(50);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  const [eventStatusFilter, setEventStatusFilter] = useState<
    "all" | AizuEvent["status"]
  >("all");
  const [eventSort, setEventSort] = useState<"date" | "newest">("date");
  const [applicantSearch, setApplicantSearch] = useState("");
  const [applicantStatusFilter, setApplicantStatusFilter] = useState<
    "all" | EventApplication["status"]
  >("all");
  const [participantQueryLimit, setParticipantQueryLimit] = useState(50);
  const [hasMoreParticipants, setHasMoreParticipants] = useState(false);
  const [selectedApplicantIds, setSelectedApplicantIds] = useState<string[]>(
    [],
  );
  const [eventCancellationTarget, setEventCancellationTarget] =
    useState<AizuEvent | null>(null);
  const [checkInCode, setCheckInCode] = useState("");
  const [eventReportSummary, setEventReportSummary] = useState("");
  const [eventReportFiles, setEventReportFiles] = useState<File[]>([]);
  const [eventReportRightsConfirmed, setEventReportRightsConfirmed] =
    useState(false);
  const [isSavingEventReport, setIsSavingEventReport] = useState(false);
  const [pendingApplicationUpdate, setPendingApplicationUpdate] = useState<{
    application: EventApplication;
    status: "rejected" | "absent";
  } | null>(null);

  const organizationName = appUser.organizationName || appUser.displayName;
  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const attendanceWindowOpen = Boolean(
    selectedEvent &&
    isAttendanceWindowOpen(timestampMillis(selectedEvent.startAt), Date.now()),
  );
  const visibleEvents = useMemo(
    () =>
      filterOrganizationEvents(
        events,
        eventSearch,
        eventStatusFilter,
        eventSort,
      ),
    [eventSearch, eventSort, eventStatusFilter, events],
  );
  const visibleApplications = useMemo(
    () =>
      filterOrganizationApplications(
        applications,
        applicantSearch,
        applicantStatusFilter,
      ),
    [applicantSearch, applicantStatusFilter, applications],
  );
  const applicantMetrics = useMemo(
    () => summarizeApplicants(applications),
    [applications],
  );
  const unreadChatCounts = useMemo(
    () => countUnreadChats(notifications),
    [notifications],
  );
  const unreadChatTotal = Object.values(unreadChatCounts).reduce(
    (sum, count) => sum + count,
    0,
  );

  const showOrganizationView = (view: OrganizationView) => {
    setActiveView(view);
    const url = new URL(window.location.href);
    if (view === "home") url.searchParams.delete("orgView");
    else url.searchParams.set("orgView", view);
    window.history.pushState(
      { ...window.history.state, orgView: view },
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
  };

  useEffect(() => {
    const handlePopState = () => {
      const candidate = new URLSearchParams(window.location.search).get(
        "orgView",
      );
      setActiveView(
        organizationViews.includes(candidate as OrganizationView)
          ? (candidate as OrganizationView)
          : "home",
      );
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const loadEvents = useCallback(async () => {
    const snapshot = await getDocs(
      query(
        collection(db, "events"),
        where("createdBy", "==", appUser.uid),
        orderBy("createdAt", "desc"),
        limit(eventQueryLimit + 1),
      ),
    );
    setEvents(
      snapshot.docs.slice(0, eventQueryLimit).map((eventDoc) => ({
        id: eventDoc.id,
        ...eventDoc.data(),
      })) as AizuEvent[],
    );
  }, [appUser.uid, eventQueryLimit]);
  const editor = useOrganizationEventEditor({
    appUser,
    events,
    organizationName,
    loadEvents,
    showOrganizationView,
    setSelectedEventId,
    setNotice,
  });
  const {
    editingEventId,
    setEditingEventId,
    eventImageFile,
    setEventImageFile,
    eventImagePreview,
    setEventImagePreview,
    eventImageSourceFile,
    setEventImageSourceFile,
    eventImageSourcePreview,
    setEventImageSourcePreview,
    isEventImageReviewOpen,
    setIsEventImageReviewOpen,
    isEventPreviewOpen,
    setIsEventPreviewOpen,
    setEventImageInputKey,
    selectedTemplate,
    beginEditEvent,
    duplicateEvent,
    buildPreviewEvent,
  } = editor;

  useEffect(() => {
    const eventsQuery = query(
      collection(db, "events"),
      where("createdBy", "==", appUser.uid),
      orderBy("createdAt", "desc"),
      limit(eventQueryLimit + 1),
    );
    return onSnapshot(
      eventsQuery,
      (snapshot) => {
        setHasMoreManagedEvents(snapshot.size > eventQueryLimit);
        setEvents(
          snapshot.docs.slice(0, eventQueryLimit).map((eventDoc) => ({
            id: eventDoc.id,
            ...eventDoc.data(),
          })) as AizuEvent[],
        );
      },
      () => setNotice("掲載した活動を取得できませんでした。", "error"),
    );
  }, [appUser.uid, eventQueryLimit, setNotice]);

  useEffect(() => {
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientId", "==", appUser.uid),
      orderBy("createdAt", "desc"),
      limit(notificationQueryLimit + 1),
    );
    return onSnapshot(
      notificationsQuery,
      (snapshot) => {
        setHasMoreNotifications(snapshot.size > notificationQueryLimit);
        setNotifications(
          snapshot.docs
            .slice(0, notificationQueryLimit)
            .map((notificationDoc) => ({
              id: notificationDoc.id,
              ...notificationDoc.data(),
            })) as NotificationItem[],
        );
      },
      () => setNotice("通知を取得できませんでした。", "error"),
    );
  }, [appUser.uid, notificationQueryLimit, setNotice]);

  useEffect(() => {
    if (!selectedEventId) {
      setApplications([]);
      setHasMoreParticipants(false);
      return;
    }
    const normalizedSearch = applicantSearch.trim().toLocaleLowerCase("ja-JP");
    const applicationsQuery = normalizedSearch
      ? query(
          collection(db, "eventApplications"),
          where("organizationId", "==", appUser.uid),
          where("eventId", "==", selectedEventId),
          orderBy("studentNameLower", "asc"),
          startAt(normalizedSearch),
          endAt(`${normalizedSearch}\uf8ff`),
          limit(participantQueryLimit + 1),
        )
      : query(
          collection(db, "eventApplications"),
          where("organizationId", "==", appUser.uid),
          where("eventId", "==", selectedEventId),
          orderBy("createdAt", "desc"),
          limit(participantQueryLimit + 1),
        );
    return onSnapshot(
      applicationsQuery,
      (snapshot) => {
        setHasMoreParticipants(snapshot.size > participantQueryLimit);
        setApplications(
          snapshot.docs
            .slice(0, participantQueryLimit)
            .map((applicationDoc) => ({
              id: applicationDoc.id,
              ...applicationDoc.data(),
            })) as EventApplication[],
        );
      },
      () => setNotice("参加者情報を取得できませんでした。", "error"),
    );
  }, [
    appUser.uid,
    applicantSearch,
    participantQueryLimit,
    selectedEventId,
    setNotice,
  ]);

  useEffect(
    () => setParticipantQueryLimit(50),
    [applicantSearch, selectedEventId],
  );

  useEffect(
    () =>
      subscribeChatRoomsForUser(
        appUser.uid,
        (rooms, hasMore) => {
          setChatRooms(rooms);
          setHasMoreChatRooms(hasMore);
          setActiveRoomId((current) => current ?? rooms[0]?.id ?? null);
        },
        () => setNotice("メッセージを取得できませんでした。", "error"),
        chatRoomQueryLimit,
      ),
    [appUser.uid, chatRoomQueryLimit, setNotice],
  );

  useEffect(() => {
    if (!chatRoomIdsKey) {
      setChatPreferences([]);
      return;
    }
    void loadChatPreferencesForRooms(appUser.uid, chatRoomIdsKey.split("\n"))
      .then(setChatPreferences)
      .catch(() =>
        setNotice("チャット通知設定を取得できませんでした。", "error"),
      );
  }, [appUser.uid, chatRoomIdsKey, setNotice]);

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
      await sendChatTextMessage(
        activeRoomId,
        { senderId: appUser.uid, senderName: organizationName },
        text,
      );
    } catch (error) {
      setMessageDraft((current) => current || text);
      setNotice(getFirebaseErrorMessage(error), "error");
    }
  };

  const uploadOrganizationAttachment = async (file: File) => {
    if (!activeRoomId) return;
    await sendChatAttachment(
      activeRoomId,
      { senderId: appUser.uid, senderName: organizationName },
      file,
    );
  };

  const editMessage = useCallback(
    (chatMessage: ChatMessage, text: string) =>
      editChatMessage(activeRoomId ?? chatMessage.roomId, chatMessage.id, text),
    [activeRoomId],
  );
  const loadMoreChatRooms = useCallback(
    () => setChatRoomQueryLimit((current) => current + 50),
    [],
  );

  const selectOrganizationChatRoom = useCallback(
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
      void Promise.all(
        unread.map((notification) =>
          updateDoc(doc(db, "notifications", notification.id), {
            isRead: true,
            readAt: serverTimestamp(),
          }),
        ),
      ).catch((error: unknown) =>
        setNotice(getFirebaseErrorMessage(error), "error"),
      );
    },
    [activeRoomId, notifications, resetMessageWindow, setNotice],
  );

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
    setNotice("全体チャットのお知らせを更新しました。", "success");
  };

  const exportSelectedEventReport = () => {
    if (!selectedEvent) {
      setNotice("レポートを出力するイベントを選択してください。", "error");
      return;
    }
    downloadParticipantReport(selectedEvent, applications);
    setNotice("参加者レポートを出力しました。", "success");
  };

  const updateApplicationStatus = async (
    application: EventApplication,
    status: EventApplication["status"],
  ) => {
    if (
      (status === "attended" || status === "absent") &&
      !attendanceWindowOpen
    ) {
      setNotice("出欠の確定は開催3時間前から行えます。", "error");
      return;
    }
    try {
      await updateDoc(doc(db, "eventApplications", application.id), { status });
      setApplications((current) =>
        current.map((item) =>
          item.id === application.id ? { ...item, status } : item,
        ),
      );
      setNotice("参加者の状態を更新しました。", "success");
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error), "error");
    }
  };

  const bulkUpdateApplications = async (
    targetStatus: "confirmed" | "attended",
  ) => {
    if (targetStatus === "attended" && !attendanceWindowOpen) {
      setNotice("出席の確定は開催3時間前から行えます。", "error");
      return;
    }
    const targets = applications.filter(
      (application) =>
        selectedApplicantIds.includes(application.id) &&
        (targetStatus === "confirmed"
          ? application.status === "pending"
          : application.status === "confirmed"),
    );
    if (targets.length === 0) {
      setNotice("更新できる参加者を選択してください。", "error");
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
      "success",
    );
  };

  const saveOrganizerNote = async (
    application: EventApplication,
    organizerNote: string,
  ) => {
    await updateDoc(doc(db, "eventApplications", application.id), {
      organizerNote: organizerNote.trim().slice(0, 500),
    });
    setNotice(
      `${application.studentName}さんの運営メモを保存しました。`,
      "success",
    );
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
    setNotice(
      "イベントを中止し、参加者への通知処理を開始しました。",
      "success",
    );
  };

  const publishEventReport = async () => {
    if (
      !selectedEvent ||
      !eventReportSummary.trim() ||
      !eventReportRightsConfirmed
    )
      return;
    setIsSavingEventReport(true);
    try {
      const imageUrls = await Promise.all(
        eventReportFiles
          .slice(0, 4)
          .map((file, index) =>
            uploadImage(
              file,
              `event-reports/${appUser.uid}/${selectedEvent.id}/${Date.now()}-${index}`,
            ),
          ),
      );
      await saveEventReport({
        eventId: selectedEvent.id,
        organizationId: appUser.uid,
        title: `${selectedEvent.title} 活動報告`,
        summary: eventReportSummary.trim().slice(0, 2000),
        imageUrls,
        participantCount: applications.filter(
          (application) => application.status === "attended",
        ).length,
        status: "published",
        rightsConfirmed: true,
      });
      setEventReportSummary("");
      setEventReportFiles([]);
      setEventReportRightsConfirmed(false);
      setNotice("活動報告を公開しました。", "success");
    } finally {
      setIsSavingEventReport(false);
    }
  };

  const selectManagedEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    showOrganizationView("participants");
  };

  const openManagedMessages = () => {
    const selectedRoom = selectedEventId
      ? chatRooms.find(
          (room) =>
            room.eventId === selectedEventId && room.roomType === "event",
        )
      : undefined;
    if (selectedRoom) selectOrganizationChatRoom(selectedRoom.id);
    showOrganizationView("messages");
  };

  const goToOrganizationHome = () => {
    showOrganizationView("home");
    setSelectedEventId(null);
    setEditingEventId(null);
    setActiveRoomId(null);
    setEventSearch("");
    setApplicantSearch("");
    window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
  };

  return (
    <RoleShell
      title={organizationName}
      subtitle="企画ダッシュボード"
      icon={<UsersRound size={19} />}
      onHome={goToOrganizationHome}
      onClose={onClose}
      onLogout={onLogout}
    >
      {notice && <NoticeBanner message={notice} tone={noticeTone} />}
      {activeView === "home" ? (
        <>
          <section className="organization-home-card">
            <div>
              <p className="eyebrow">団体ホーム</p>
              <h1>イベント運営</h1>
              <p>
                企画の作成から参加者への連絡まで、行いたい操作を選んでください。
              </p>
            </div>
            <div className="organization-home-summary" aria-label="運営状況">
              <span>
                <strong>{events.length}</strong>
                <small>登録イベント</small>
              </span>
              <span>
                <strong>{applicantMetrics.pending}</strong>
                <small>確認待ち</small>
              </span>
              <span>
                <strong>{unreadChatTotal}</strong>
                <small>未読メッセージ</small>
              </span>
            </div>
          </section>
          <OrganizationNavigation
            eventCount={events.length}
            hasSelectedEvent={Boolean(selectedEvent)}
            pendingApplicantCount={applicantMetrics.pending}
            unreadChatTotal={unreadChatTotal}
            onCreate={() => showOrganizationView("create")}
            onEvents={() => showOrganizationView("events")}
            onApplicants={() => showOrganizationView("participants")}
            onMessages={openManagedMessages}
            onSettings={() => showOrganizationView("settings")}
          />
        </>
      ) : (
        <header className="organization-page-heading">
          <button
            className="secondary-action compact-action"
            type="button"
            onClick={() => showOrganizationView("home")}
          >
            <ChevronLeft size={16} />
            団体ホーム
          </button>
          <div>
            <p className="eyebrow">イベント運営</p>
            <h1>
              {activeView === "create"
                ? editingEventId
                  ? "イベントを編集"
                  : "企画を作成"
                : activeView === "events"
                  ? "イベント管理"
                  : activeView === "participants"
                    ? "参加者管理"
                    : activeView === "messages"
                      ? "全体チャット"
                      : "設定"}
            </h1>
          </div>
        </header>
      )}
      {(activeView === "create" || activeView === "events") && (
        <div className="role-grid organization-workspace-grid">
          {activeView === "create" && (
            <OrganizationEventForm editor={editor} setNotice={setNotice} />
          )}
          {activeView === "events" && (
            <section className="role-card event-list-card">
              <div className="role-card-head">
                <div>
                  <p className="eyebrow">イベント一覧</p>
                  <h2>登録したイベント</h2>
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
                        <span className="managed-event-open-label">
                          <UsersRound size={14} />
                          参加者を見る
                        </span>
                      </button>
                      <div className="managed-event-actions">
                        <button
                          type="button"
                          onClick={() => duplicateEvent(event)}
                        >
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
              {hasMoreManagedEvents && (
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => setEventQueryLimit((current) => current + 50)}
                >
                  過去のイベントをさらに50件読み込む
                </button>
              )}
            </section>
          )}
        </div>
      )}
      {isEventImageReviewOpen &&
        eventImageSourcePreview &&
        eventImageSourceFile && (
          <ImageCropDialog
            title="イベント写真の範囲を調整"
            imageUrl={eventImageSourcePreview}
            imageFile={eventImageSourceFile}
            alt="イベント写真の確認用プレビュー"
            aspect={16 / 9}
            maxOutputWidth={1920}
            onCancel={() => {
              setIsEventImageReviewOpen(false);
              if (!eventImageFile) {
                revokeObjectUrl(eventImageSourcePreview);
                setEventImageSourceFile(null);
                setEventImageSourcePreview(null);
                setEventImagePreview(
                  editingEventId
                    ? (events.find((item) => item.id === editingEventId)
                        ?.imageUrl ?? null)
                    : selectedTemplate.imageUrl,
                );
                setEventImageInputKey((current) => current + 1);
              }
            }}
            onConfirm={(file, previewUrl) => {
              if (eventImagePreview !== eventImageSourcePreview) {
                revokeObjectUrl(eventImagePreview);
              }
              setEventImageFile(file);
              setEventImagePreview(previewUrl);
              setIsEventImageReviewOpen(false);
            }}
          />
        )}
      {isEventPreviewOpen && (
        <EventDrawer
          event={buildPreviewEvent()}
          applied={false}
          isLoading={false}
          previewMode
          onApply={() => undefined}
          onReport={() => undefined}
          onClose={() => setIsEventPreviewOpen(false)}
        />
      )}
      {activeView === "participants" && !selectedEventId && (
        <section className="role-card organization-event-picker">
          <div className="role-card-head">
            <div>
              <p className="eyebrow">参加者管理</p>
              <h2>イベントを選択</h2>
              <small>
                参加申請・出欠・活動報告を管理するイベントを選んでください。
              </small>
            </div>
            <UsersRound size={20} />
          </div>
          {events.length === 0 ? (
            <EmptyRoleState text="参加者を管理できるイベントはまだありません。" />
          ) : (
            <div className="organization-event-picker-list">
              {events.map((event) => (
                <button
                  type="button"
                  key={event.id}
                  onClick={() => selectManagedEvent(event.id)}
                >
                  <span>
                    <strong>{event.title}</strong>
                    <small>
                      {event.startAtLabel} · {event.location}
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      {activeView === "participants" && selectedEventId && (
        <section className="role-card applicant-card">
          <div className="role-card-head">
            <div>
              <p className="eyebrow">申込者</p>
              <h2>参加者一覧</h2>
              {selectedEvent && <small>{selectedEvent.title}</small>}
            </div>
            <div className="row-actions">
              <button
                className="muted"
                type="button"
                onClick={() => setSelectedEventId(null)}
              >
                イベントを変更
              </button>
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
              {selectedEventId && (
                <CheckInQrCode eventId={selectedEventId} code={checkInCode} />
              )}
              <span>
                <small>QR受付・6桁受付コード</small>
                <strong>{checkInCode}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(checkInCode);
                  setNotice("受付コードをコピーしました。", "success");
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
                    setNotice(getFirebaseErrorMessage(error), "error"),
                  )
                }
              >
                <Check size={14} />
                選択を承認
              </button>
              <button
                type="button"
                disabled={
                  selectedApplicantIds.length === 0 || !attendanceWindowOpen
                }
                aria-describedby={
                  attendanceWindowOpen
                    ? undefined
                    : "attendance-availability-note"
                }
                title={
                  attendanceWindowOpen
                    ? undefined
                    : "出席の確定は開催3時間前から行えます"
                }
                onClick={() =>
                  void bulkUpdateApplications("attended").catch((error) =>
                    setNotice(getFirebaseErrorMessage(error), "error"),
                  )
                }
              >
                <ShieldCheck size={14} />
                選択を出席
              </button>
            </div>
          </div>
          {!attendanceWindowOpen && (
            <p
              className="attendance-availability-note"
              id="attendance-availability-note"
            >
              出席・欠席の確定は、イベント開催3時間前から操作できます。
            </p>
          )}
          {visibleApplications.length === 0 ? (
            <EmptyRoleState text="この活動にはまだ参加申請がありません。" />
          ) : (
            <div className="applicant-list">
              {visibleApplications.map((application) => (
                <article className="applicant-row" key={application.id}>
                  <div className="applicant-card-head">
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
                    <div>
                      <strong>{application.studentName}</strong>
                      <small>
                        {applicationStatusLabel(application.status)}
                        {application.waitlistPosition
                          ? ` ${application.waitlistPosition}番目`
                          : ""}
                      </small>
                    </div>
                  </div>
                  <div className="applicant-main">
                    {application.participantMessage && (
                      <p>{application.participantMessage}</p>
                    )}
                    {(application.answers ?? []).map((answer) => (
                      <span
                        className="participant-answer"
                        key={answer.questionId}
                      >
                        <strong>{answer.label}:</strong>{" "}
                        {typeof answer.value === "boolean"
                          ? answer.value
                            ? "はい"
                            : "いいえ"
                          : answer.value}
                      </span>
                    ))}
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
                          setNotice(getFirebaseErrorMessage(error), "error"),
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
                          disabled={!attendanceWindowOpen}
                          aria-describedby={
                            attendanceWindowOpen
                              ? undefined
                              : "attendance-availability-note"
                          }
                          title={
                            attendanceWindowOpen
                              ? undefined
                              : "出席の確定は開催3時間前から行えます"
                          }
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
                          disabled={!attendanceWindowOpen}
                          aria-describedby={
                            attendanceWindowOpen
                              ? undefined
                              : "attendance-availability-note"
                          }
                          title={
                            attendanceWindowOpen
                              ? undefined
                              : "欠席の確定は開催3時間前から行えます"
                          }
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
                  </div>
                </article>
              ))}
            </div>
          )}
          {hasMoreParticipants && (
            <button
              className="secondary-action"
              type="button"
              onClick={() =>
                setParticipantQueryLimit((current) => current + 50)
              }
            >
              参加者をさらに50件読み込む
            </button>
          )}
          {selectedEvent && (
            <EventSurveyResults
              key={selectedEvent.id}
              eventId={selectedEvent.id}
            />
          )}
          {selectedEvent && (
            <div className="event-report-editor">
              <h3>イベント終了後の活動報告</h3>
              <label className="event-report-field">
                <span>当日の様子、成果、参加者へのお礼など</span>
                <textarea
                  aria-label="活動報告本文"
                  maxLength={2000}
                  placeholder="活動報告を入力してください"
                  value={eventReportSummary}
                  onChange={(event) =>
                    setEventReportSummary(event.target.value)
                  }
                />
              </label>
              <label className="event-report-field event-report-files">
                <span>写真（最大4枚）</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  aria-label="活動報告の写真"
                  onChange={(event) =>
                    setEventReportFiles(
                      Array.from(event.target.files ?? []).slice(0, 4),
                    )
                  }
                />
                {eventReportFiles.length > 0 && (
                  <div className="selected-file-list" aria-label="選択した写真">
                    {eventReportFiles.map((file, index) => (
                      <span key={`${file.name}-${file.lastModified}`}>
                        <span className="file-name">{file.name}</span>
                        <button
                          type="button"
                          aria-label={`${file.name}を選択から外す`}
                          onClick={() =>
                            setEventReportFiles((current) =>
                              current.filter(
                                (_, fileIndex) => fileIndex !== index,
                              ),
                            )
                          }
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </label>
              <label className="application-consent">
                <input
                  type="checkbox"
                  checked={eventReportRightsConfirmed}
                  onChange={(event) =>
                    setEventReportRightsConfirmed(event.target.checked)
                  }
                />
                <span>
                  本文・写真の権利を確認し、写っている方へ公開範囲を説明して必要な同意を得ています
                </span>
              </label>
              <button
                type="button"
                disabled={
                  isSavingEventReport ||
                  !eventReportSummary.trim() ||
                  !eventReportRightsConfirmed
                }
                onClick={() => void publishEventReport()}
              >
                {isSavingEventReport && <Loader2 size={14} className="spin" />}
                活動報告を公開
              </button>
            </div>
          )}
        </section>
      )}
      {activeView === "messages" && (
        <div className="organization-messages-section">
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
            onSelectRoom={selectOrganizationChatRoom}
            onCloseRoom={() => setActiveRoomId(null)}
            onLoadMoreRooms={loadMoreChatRooms}
            onToggleMute={(roomId) =>
              void toggleOrganizationChatMute(roomId).catch((error) =>
                setNotice(getFirebaseErrorMessage(error), "error"),
              )
            }
            onDraftChange={setMessageDraft}
            onSend={() => void sendOrganizationMessage()}
            onUploadAttachment={async (file) => {
              try {
                await uploadOrganizationAttachment(file);
              } catch (error) {
                setNotice(getFirebaseErrorMessage(error), "error");
              }
            }}
            onSaveRoomMeta={saveRoomMeta}
            onEditMessage={editMessage}
            onDeleteMessage={(chatMessage) =>
              deleteChatMessage(
                activeRoomId ?? chatMessage.roomId,
                chatMessage.id,
              )
            }
            currentUserId={appUser.uid}
            currentUserRole="organization"
            onOpenEvent={selectManagedEvent}
          />
          {hasMoreNotifications && (
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setNotificationQueryLimit((current) => current + 50)
              }
            >
              過去の通知を読み込む
            </button>
          )}
        </div>
      )}
      {activeView === "settings" && (
        <section className="organization-settings-page">
          <div className="role-card">
            <div className="role-card-head">
              <div>
                <p className="eyebrow">アカウント設定</p>
                <h2>団体アカウント</h2>
                <small>退会やデータ削除に関する操作を行えます。</small>
              </div>
              <Settings size={20} />
            </div>
            <AccountDeletionPanel
              request={accountDeletionRequest}
              onRequest={onRequestAccountDeletion}
              onCancel={onCancelAccountDeletion}
            />
          </div>
        </section>
      )}
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
              (error) => setNotice(getFirebaseErrorMessage(error), "error"),
            )
          }
        />
      )}
    </RoleShell>
  );
}
