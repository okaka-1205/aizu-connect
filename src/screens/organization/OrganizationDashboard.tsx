import {
  collection,
  doc,
  endAt,
  getDoc,
  getDocs,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAt,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { CheckInQrCode } from "../../components/CheckInQrCode";
import { Field } from "../../components/Field";
import { ImageCropDialog } from "../../components/ImageCropDialog";
import { NoticeBanner } from "../../components/ui/AppPrimitives";
import { defaultTakeaways, eventTemplates } from "../../config/events";
import { useNoticeState } from "../../hooks/useNoticeState";
import {
  categories,
  formatEventStart,
  getFirebaseErrorMessage,
  isAttendanceWindowOpen,
  isFutureEventStart,
  toDateTimeInput,
  toDateTimeLocalValue,
  validateChatAttachment,
  validateImageFile,
} from "../../lib/appLogic";
import {
  preferredScrollBehavior,
  revokeObjectUrl,
  timestampMillis,
} from "../../lib/eventUtils";
import { db, functions } from "../../lib/firebase";
import { uploadImage } from "../../lib/storage";
import { subscribeChatRoomsForUser } from "../../repositories/chatRepository";
import {
  deleteChatMessage,
  editChatMessage,
  saveEventReport,
} from "../../repositories/engagementRepository";
import type {
  AccountDeletionRequest,
  AizuEvent,
  ApplicationQuestion,
  AppUser,
  ChatMessage,
  ChatPreference,
  ChatReadReceipt,
  ChatRoom,
  EventApplication,
  NotificationItem,
} from "../../types/domain";
import { EventDrawer } from "../shared/EventDrawer";
import { MessagesTab } from "../shared/MessagesTab";
import { AccountDeletionPanel } from "../shared/AccountDeletionPanel";
import {
  ActionReasonDialog,
  EmptyRoleState,
  RoleShell,
} from "../shared/RoleScreenPrimitives";
import { applicationStatusLabel } from "../shared/applicationStatus";
import { OrganizationNavigation } from "./components/OrganizationNavigation";
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
  const [commercialSellerName, setCommercialSellerName] = useState("");
  const [commercialSellerAddress, setCommercialSellerAddress] = useState("");
  const [commercialSellerPhone, setCommercialSellerPhone] = useState("");
  const [commercialResponsiblePerson, setCommercialResponsiblePerson] =
    useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentTiming, setPaymentTiming] = useState("");
  const [additionalFees, setAdditionalFees] = useState("なし");
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
    "申請後の全体チャットでお問い合わせください。",
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
  const [applicationQuestions, setApplicationQuestions] = useState<
    ApplicationQuestion[]
  >([]);
  const [cancellationDeadlineInput, setCancellationDeadlineInput] =
    useState("");
  const [eventImageFile, setEventImageFile] = useState<File | null>(null);
  const [eventImagePreview, setEventImagePreview] = useState<string | null>(
    eventTemplates[0].imageUrl,
  );
  const [isEventImageReviewOpen, setIsEventImageReviewOpen] = useState(false);
  const [isEventPreviewOpen, setIsEventPreviewOpen] = useState(false);
  const [eventImageInputKey, setEventImageInputKey] = useState(0);
  const [eventFormStep, setEventFormStep] = useState<1 | 2 | 3>(1);
  const eventFormRef = useRef<HTMLFormElement>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, noticeTone, setNotice] = useNoticeState();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [chatRoomQueryLimit, setChatRoomQueryLimit] = useState(50);
  const [hasMoreChatRooms, setHasMoreChatRooms] = useState(false);
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
  const [isDraftReady, setIsDraftReady] = useState(false);
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
  const selectedTemplate =
    eventTemplates.find((template) => template.key === templateKey) ??
    eventTemplates[0];
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

  const moveToEventFormStep = (step: 1 | 2 | 3) => {
    if (step > eventFormStep) {
      const currentSection = eventFormRef.current?.querySelector<HTMLElement>(
        `[data-event-form-step="${eventFormStep}"]`,
      );
      const invalidField = currentSection?.querySelector<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input:invalid, textarea:invalid, select:invalid");
      if (invalidField) {
        invalidField.reportValidity();
        invalidField.focus();
        return;
      }
    }
    setEventFormStep(step);
    window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
  };

  const beginEditEvent = (event: AizuEvent) => {
    showOrganizationView("create");
    revokeObjectUrl(eventImagePreview);
    setEventFormStep(1);
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
    setCommercialSellerName(event.commercialSellerName ?? "");
    setCommercialSellerAddress(event.commercialSellerAddress ?? "");
    setCommercialSellerPhone(event.commercialSellerPhone ?? "");
    setCommercialResponsiblePerson(event.commercialResponsiblePerson ?? "");
    setPaymentMethod(event.paymentMethod ?? "");
    setPaymentTiming(event.paymentTiming ?? "");
    setAdditionalFees(event.additionalFees ?? "なし");
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
      event.contactMethod ?? "申請後の全体チャットでお問い合わせください。",
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
    setApplicationQuestions(event.applicationQuestions ?? []);
    setCancellationDeadlineInput(toDateTimeInput(event.cancellationDeadline));
    setEventImageFile(null);
    setEventImagePreview(event.imageUrl);
    setIsEventImageReviewOpen(false);
    setNotice(
      event.status === "published"
        ? "公開中イベントの変更は、再審査後に反映されます。"
        : "イベントを修正して再申請できます。",
      "info",
    );
  };

  const clearEventForm = () => {
    revokeObjectUrl(eventImagePreview);
    setEventFormStep(1);
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
    setCommercialSellerName("");
    setCommercialSellerAddress("");
    setCommercialSellerPhone("");
    setCommercialResponsiblePerson("");
    setPaymentMethod("");
    setPaymentTiming("");
    setAdditionalFees("なし");
    setEventFormat("現地");
    setMeetingPoint("会津若松市");
    setAccessInfo("");
    setBringItems("特になし");
    setCancellationPolicy(
      "参加できなくなった場合は、開催前日までに活動ページからキャンセルしてください。",
    );
    setWeatherPolicy("変更・中止の場合は通知と全体チャットで案内します。");
    setAccessibility("必要な配慮は参加申請時にお知らせください。");
    setContactMethod("申請後の全体チャットでお問い合わせください。");
    setOrganizerDescription(
      "参加者が安心して参加できるよう、事前連絡と当日の案内を行います。",
    );
    setOrganizerExperience("Aizu Connectでイベントを企画");
    setTemplateKey(eventTemplates[0].key);
    setBeginnerLevel("初参加歓迎");
    setTakeawayText("");
    setApplicationQuestions([]);
    setCancellationDeadlineInput("");
    setEventImageFile(null);
    setEventImagePreview(eventTemplates[0].imageUrl);
    setIsEventImageReviewOpen(false);
  };

  const duplicateEvent = (event: AizuEvent) => {
    beginEditEvent(event);
    const duplicateTemplate =
      eventTemplates.find((template) => template.key === event.templateKey) ??
      eventTemplates[0];
    setEditingEventId(null);
    setSelectedEventId(null);
    setTitle(`${event.title}（複製）`.slice(0, 80));
    setStartAtInput("");
    setEndAtInput("");
    setEventImageFile(null);
    setEventImagePreview(duplicateTemplate.imageUrl);
    setNotice(
      "イベントを複製しました。写真と開催日時を確認して申請してください。",
      "info",
    );
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
        setApplicationQuestions(
          Array.isArray(draft.applicationQuestions)
            ? (draft.applicationQuestions as ApplicationQuestion[])
            : [],
        );
        setCancellationDeadlineInput(
          String(draft.cancellationDeadlineInput ?? ""),
        );
        setFeeType((draft.feeType as AizuEvent["feeType"]) ?? "無料");
        setFeeAmount(Number(draft.feeAmount ?? 0));
        setCommercialSellerName(String(draft.commercialSellerName ?? ""));
        setCommercialSellerAddress(String(draft.commercialSellerAddress ?? ""));
        setCommercialSellerPhone(String(draft.commercialSellerPhone ?? ""));
        setCommercialResponsiblePerson(
          String(draft.commercialResponsiblePerson ?? ""),
        );
        setPaymentMethod(String(draft.paymentMethod ?? ""));
        setPaymentTiming(String(draft.paymentTiming ?? ""));
        setAdditionalFees(String(draft.additionalFees ?? "なし"));
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
        setNotice("保存されていた下書きを復元しました。", "info");
      } catch {
        window.localStorage.removeItem(
          `aizu-connect:event-draft:${appUser.uid}`,
        );
      }
    }
    setIsDraftReady(true);
  }, [appUser.uid, setNotice]);

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
      applicationQuestions,
      cancellationDeadlineInput,
      feeType,
      feeAmount,
      commercialSellerName,
      commercialSellerAddress,
      commercialSellerPhone,
      commercialResponsiblePerson,
      paymentMethod,
      paymentTiming,
      additionalFees,
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
        setDraftSavedAt(new Date());
      } else {
        window.localStorage.removeItem(
          `aizu-connect:event-draft:${appUser.uid}`,
        );
        setDraftSavedAt(null);
      }
      setIsDraftSaving(false);
    }, 400);
    setIsDraftSaving(true);
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
    commercialSellerName,
    commercialSellerAddress,
    commercialSellerPhone,
    commercialResponsiblePerson,
    paymentMethod,
    paymentTiming,
    additionalFees,
    isDraftReady,
    location,
    meetingPoint,
    organizerDescription,
    organizerExperience,
    startAtInput,
    summary,
    takeawayText,
    applicationQuestions,
    cancellationDeadlineInput,
    templateKey,
    title,
    weatherPolicy,
  ]);

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
    const preferencesQuery = query(
      collection(db, "chatPreferences"),
      where("userId", "==", appUser.uid),
    );
    return onSnapshot(
      preferencesQuery,
      (snapshot) =>
        setChatPreferences(
          snapshot.docs.map(
            (preferenceDoc) => preferenceDoc.data() as ChatPreference,
          ),
        ),
      () => setNotice("チャット通知設定を取得できませんでした。", "error"),
    );
  }, [appUser.uid, setNotice]);

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
      () => setNotice("チャットを取得できませんでした。", "error"),
    );
  }, [activeRoomId, chatMessageLimit, setNotice]);

  useEffect(() => {
    if (!activeRoomId) {
      setChatReadReceipts([]);
      return;
    }
    void setDoc(
      doc(db, "chatRooms", activeRoomId, "reads", appUser.uid),
      { userId: appUser.uid, readAt: serverTimestamp() },
      { merge: true },
    ).catch((error: unknown) =>
      setNotice(getFirebaseErrorMessage(error), "error"),
    );
    return onSnapshot(
      collection(db, "chatRooms", activeRoomId, "reads"),
      (snapshot) =>
        setChatReadReceipts(
          snapshot.docs.map(
            (receiptDoc) => receiptDoc.data() as ChatReadReceipt,
          ),
        ),
      () => setNotice("既読情報を取得できませんでした。", "error"),
    );
  }, [activeRoomId, appUser.uid, setNotice]);

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
      setNotice(getFirebaseErrorMessage(error), "error");
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
    ).catch((error: unknown) =>
      setNotice(getFirebaseErrorMessage(error), "error"),
    );
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

  const applyTemplate = (template: (typeof eventTemplates)[number]) => {
    revokeObjectUrl(eventImagePreview);
    setTemplateKey(template.key);
    setCategory(template.category);
    setBeginnerLevel(template.beginnerLevel);
    setEventImageFile(null);
    setEventImagePreview(template.imageUrl);
    setNotice(
      "テンプレートの例文を表示しました。入力した内容だけが保存されます。",
      "info",
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
      setNotice(
        "タイトル、概要、体験できること、開催日時を入力してください。",
        "error",
      );
      return;
    }
    const startAtDate = new Date(startAtInput);
    if (Number.isNaN(startAtDate.getTime())) {
      setNotice("開催日時の形式を確認してください。", "error");
      return;
    }
    if (!isFutureEventStart(startAtDate)) {
      setNotice("開催日時は現在より後の日時を指定してください。", "error");
      return;
    }
    const endAtDate = endAtInput
      ? new Date(endAtInput)
      : new Date(startAtDate.getTime() + 2 * 60 * 60 * 1000);
    if (
      Number.isNaN(endAtDate.getTime()) ||
      endAtDate.getTime() <= startAtDate.getTime()
    ) {
      setNotice("終了日時は開催日時より後にしてください。", "error");
      return;
    }
    if (
      feeType === "有料" &&
      ![
        commercialSellerAddress,
        commercialSellerPhone,
        commercialResponsiblePerson,
        paymentMethod,
        paymentTiming,
        additionalFees,
        cancellationPolicy,
      ].every((value) => value.trim().length > 0)
    ) {
      setNotice(
        "有料イベントは、特定商取引法に基づく表示をすべて入力してください。",
        "error",
      );
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
        commercialSellerName:
          feeType === "有料"
            ? (commercialSellerName.trim() || organizationName).slice(0, 120)
            : "",
        commercialSellerAddress:
          feeType === "有料"
            ? commercialSellerAddress.trim().slice(0, 240)
            : "",
        commercialSellerPhone:
          feeType === "有料" ? commercialSellerPhone.trim().slice(0, 40) : "",
        commercialResponsiblePerson:
          feeType === "有料"
            ? commercialResponsiblePerson.trim().slice(0, 80)
            : "",
        paymentMethod:
          feeType === "有料" ? paymentMethod.trim().slice(0, 200) : "",
        paymentTiming:
          feeType === "有料" ? paymentTiming.trim().slice(0, 200) : "",
        additionalFees:
          feeType === "有料" ? additionalFees.trim().slice(0, 200) : "なし",
        eventFormat: eventFormat ?? "現地",
        meetingPoint: meetingPoint.trim().slice(0, 160),
        accessInfo: accessInfo.trim().slice(0, 300),
        bringItems: bringItems.trim().slice(0, 300),
        cancellationPolicy: cancellationPolicy.trim().slice(0, 500),
        cancellationDeadlineMillis: cancellationDeadlineInput
          ? new Date(cancellationDeadlineInput).getTime()
          : undefined,
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
        applicationQuestions,
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
        "success",
      );
      showOrganizationView("events");
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error), "error");
    } finally {
      setIsLoading(false);
    }
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
    cancellationDeadline:
      cancellationDeadlineInput &&
      Number.isFinite(new Date(cancellationDeadlineInput).getTime())
        ? Timestamp.fromDate(new Date(cancellationDeadlineInput))
        : undefined,
    weatherPolicy,
    accessibility,
    contactMethod,
    applicationQuestions,
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
            <section className="role-card event-form-card">
              <div className="role-card-head">
                <div>
                  <p className="eyebrow">イベント登録</p>
                  <h2>
                    {editingEventId ? "イベントを編集" : "新しいイベント"}
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
                ref={eventFormRef}
                className="role-form event-plan-form"
                onSubmit={(event) => void createEvent(event)}
                onInvalid={(event) => {
                  const section = (
                    event.target as HTMLElement
                  ).closest<HTMLElement>("[data-event-form-step]");
                  const step = Number(section?.dataset.eventFormStep);
                  if (step === 1 || step === 2 || step === 3)
                    setEventFormStep(step);
                }}
              >
                <nav
                  className="event-form-progress"
                  aria-label="企画作成の手順"
                >
                  {["基本情報", "開催情報", "詳細・確認"].map(
                    (label, index) => {
                      const step = (index + 1) as 1 | 2 | 3;
                      return (
                        <button
                          className={
                            eventFormStep === step
                              ? "active"
                              : eventFormStep > step
                                ? "complete"
                                : ""
                          }
                          key={label}
                          type="button"
                          aria-current={
                            eventFormStep === step ? "step" : undefined
                          }
                          onClick={() => moveToEventFormStep(step)}
                        >
                          <span>{step}</span>
                          {label}
                        </button>
                      );
                    },
                  )}
                </nav>
                <details
                  className="event-form-section event-form-collapsible"
                  data-event-form-step="1"
                  open
                  hidden={eventFormStep !== 1}
                >
                  <summary>
                    <span className="event-form-step">1</span>
                    <span className="event-form-section-title">
                      <strong>基本情報</strong>
                      <small>活動の内容と魅力を入力</small>
                    </span>
                    <ChevronRight
                      className="event-form-section-chevron"
                      size={18}
                    />
                  </summary>
                  <div className="event-form-section-body">
                    <div
                      className="template-picker"
                      aria-label="企画テンプレート"
                    >
                      {eventTemplates.map((template) => (
                        <button
                          className={
                            templateKey === template.key ? "active" : ""
                          }
                          key={template.key}
                          type="button"
                          onClick={() => applyTemplate(template)}
                        >
                          <FileText size={15} />
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
                    <Field label="イベントで体験できること（1行ずつ）">
                      <textarea
                        required
                        maxLength={180}
                        placeholder={selectedTemplate.takeaways.join("\n")}
                        value={takeawayText}
                        onChange={(event) =>
                          setTakeawayText(event.target.value)
                        }
                      />
                    </Field>
                    <div className="application-question-editor">
                      <div className="role-card-head">
                        <div>
                          <strong>申込時の質問</strong>
                          <small>
                            最大8問。回答は参加者一覧で確認できます。
                          </small>
                        </div>
                        <button
                          type="button"
                          disabled={applicationQuestions.length >= 8}
                          onClick={() =>
                            setApplicationQuestions((current) => [
                              ...current,
                              {
                                id: `question_${Date.now()}`,
                                label: "",
                                type: "text",
                                required: false,
                                containsSensitiveInfo: false,
                                options: [],
                              },
                            ])
                          }
                        >
                          <Plus size={14} />
                          質問を追加
                        </button>
                      </div>
                      {applicationQuestions.map((question, index) => (
                        <div className="form-grid" key={question.id}>
                          <input
                            aria-label={`申込質問${index + 1}`}
                            maxLength={120}
                            required
                            placeholder="例：参加目的を教えてください"
                            value={question.label}
                            onChange={(event) =>
                              setApplicationQuestions((current) =>
                                current.map((item) =>
                                  item.id === question.id
                                    ? { ...item, label: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <select
                            aria-label={`申込質問${index + 1}の形式`}
                            value={question.type}
                            onChange={(event) =>
                              setApplicationQuestions((current) =>
                                current.map((item) =>
                                  item.id === question.id
                                    ? {
                                        ...item,
                                        type: event.target
                                          .value as ApplicationQuestion["type"],
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="text">1行入力</option>
                            <option value="textarea">複数行</option>
                            <option value="select">選択式</option>
                            <option value="checkbox">確認チェック</option>
                          </select>
                          {question.type === "select" && (
                            <input
                              aria-label={`申込質問${index + 1}の選択肢`}
                              placeholder="選択肢をカンマ区切りで入力"
                              value={(question.options ?? []).join(",")}
                              onChange={(event) =>
                                setApplicationQuestions((current) =>
                                  current.map((item) =>
                                    item.id === question.id
                                      ? {
                                          ...item,
                                          options: event.target.value
                                            .split(",")
                                            .map((value) => value.trim())
                                            .filter(Boolean)
                                            .slice(0, 8),
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          )}
                          <label>
                            <input
                              type="checkbox"
                              checked={question.required}
                              onChange={(event) =>
                                setApplicationQuestions((current) =>
                                  current.map((item) =>
                                    item.id === question.id
                                      ? {
                                          ...item,
                                          required: event.target.checked,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                            必須
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={question.containsSensitiveInfo === true}
                              onChange={(event) =>
                                setApplicationQuestions((current) =>
                                  current.map((item) =>
                                    item.id === question.id
                                      ? {
                                          ...item,
                                          containsSensitiveInfo:
                                            event.target.checked,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                            健康・障害等の要配慮情報を含む
                          </label>
                          <button
                            className="muted"
                            type="button"
                            onClick={() =>
                              setApplicationQuestions((current) =>
                                current.filter(
                                  (item) => item.id !== question.id,
                                ),
                              )
                            }
                          >
                            削除
                          </button>
                        </div>
                      ))}
                    </div>
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
                              revokeObjectUrl(eventImagePreview);
                              setEventImageFile(file);
                              setEventImagePreview(URL.createObjectURL(file));
                              setNotice("");
                              setIsEventImageReviewOpen(true);
                            } catch (error) {
                              setNotice(
                                getFirebaseErrorMessage(error),
                                "error",
                              );
                              event.target.value = "";
                            }
                          }}
                        />
                        <small>JPEG・PNG・WebP / 5MB未満</small>
                      </div>
                    </Field>
                    <button
                      className="secondary-action event-form-next"
                      type="button"
                      onClick={() => moveToEventFormStep(2)}
                    >
                      開催情報へ
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </details>
                <details
                  className="event-form-section event-form-collapsible"
                  data-event-form-step="2"
                  open
                  hidden={eventFormStep !== 2}
                >
                  <summary>
                    <span className="event-form-step">2</span>
                    <span className="event-form-section-title">
                      <strong>開催情報</strong>
                      <small>日時・場所・参加条件を入力</small>
                    </span>
                    <ChevronRight
                      className="event-form-section-chevron"
                      size={18}
                    />
                  </summary>
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
                                  new Date(
                                    start.getTime() + 2 * 60 * 60 * 1000,
                                  ),
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
                                  new Date(
                                    start.getTime() + 2 * 60 * 60 * 1000,
                                  ),
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
                          onChange={(event) =>
                            setEndAtInput(event.target.value)
                          }
                          onInput={(event) =>
                            setEndAtInput(event.currentTarget.value)
                          }
                        />
                      </Field>
                      <Field label="キャンセル期限">
                        <input
                          type="datetime-local"
                          value={cancellationDeadlineInput}
                          max={startAtInput || undefined}
                          onChange={(event) =>
                            setCancellationDeadlineInput(event.target.value)
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
                            setFeeType(
                              event.target.value as AizuEvent["feeType"],
                            )
                          }
                        >
                          <option>無料</option>
                          <option>有料</option>
                        </select>
                      </Field>
                    </div>
                    {feeType === "有料" && (
                      <div className="commerce-disclosure-form">
                        <p>
                          有料イベントは、申込前に特定商取引法に基づく表示を参加者へ示します。
                        </p>
                        <Field label="参加費（税込・円）">
                          <input
                            type="number"
                            min={1}
                            max={1_000_000}
                            required
                            value={feeAmount}
                            onChange={(event) =>
                              setFeeAmount(Number(event.target.value))
                            }
                          />
                        </Field>
                        <div className="form-grid">
                          <Field label="販売・役務提供事業者名">
                            <input
                              required
                              maxLength={120}
                              placeholder={organizationName}
                              value={commercialSellerName}
                              onChange={(event) =>
                                setCommercialSellerName(event.target.value)
                              }
                            />
                          </Field>
                          <Field label="運営責任者名">
                            <input
                              required
                              maxLength={80}
                              value={commercialResponsiblePerson}
                              onChange={(event) =>
                                setCommercialResponsiblePerson(
                                  event.target.value,
                                )
                              }
                            />
                          </Field>
                        </div>
                        <Field label="事業者所在地">
                          <input
                            required
                            maxLength={240}
                            autoComplete="street-address"
                            value={commercialSellerAddress}
                            onChange={(event) =>
                              setCommercialSellerAddress(event.target.value)
                            }
                          />
                        </Field>
                        <Field label="事業者電話番号">
                          <input
                            required
                            maxLength={40}
                            type="tel"
                            autoComplete="tel"
                            value={commercialSellerPhone}
                            onChange={(event) =>
                              setCommercialSellerPhone(event.target.value)
                            }
                          />
                        </Field>
                        <div className="form-grid">
                          <Field label="支払方法">
                            <input
                              required
                              maxLength={200}
                              placeholder="例：当日受付で現金"
                              value={paymentMethod}
                              onChange={(event) =>
                                setPaymentMethod(event.target.value)
                              }
                            />
                          </Field>
                          <Field label="支払時期">
                            <input
                              required
                              maxLength={200}
                              placeholder="例：イベント当日の受付時"
                              value={paymentTiming}
                              onChange={(event) =>
                                setPaymentTiming(event.target.value)
                              }
                            />
                          </Field>
                        </div>
                        <Field label="参加費以外の追加費用">
                          <input
                            required
                            maxLength={200}
                            placeholder="ない場合は「なし」"
                            value={additionalFees}
                            onChange={(event) =>
                              setAdditionalFees(event.target.value)
                            }
                          />
                        </Field>
                      </div>
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
                          onChange={(event) =>
                            setMeetingPoint(event.target.value)
                          }
                        />
                      </Field>
                    </div>
                    <div className="event-form-step-actions">
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() => moveToEventFormStep(1)}
                      >
                        <ChevronLeft size={16} />
                        基本情報へ
                      </button>
                      <button
                        className="primary-action"
                        type="button"
                        onClick={() => moveToEventFormStep(3)}
                      >
                        詳細・確認へ
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </details>
                <details
                  className="event-form-section event-form-advanced"
                  data-event-form-step="3"
                  key={editingEventId ?? "new-event"}
                  open
                  hidden={eventFormStep !== 3}
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
                        onChange={(event) =>
                          setWeatherPolicy(event.target.value)
                        }
                      />
                    </Field>
                    <Field label="バリアフリー・必要な配慮">
                      <textarea
                        required
                        maxLength={500}
                        value={accessibility}
                        onChange={(event) =>
                          setAccessibility(event.target.value)
                        }
                      />
                    </Field>
                    <Field label="問い合わせ方法">
                      <textarea
                        required
                        maxLength={300}
                        value={contactMethod}
                        onChange={(event) =>
                          setContactMethod(event.target.value)
                        }
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
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => moveToEventFormStep(2)}
                    >
                      <ChevronLeft size={16} />
                      開催情報へ戻る
                    </button>
                  </div>
                </details>
                <div className="event-form-foot" hidden={eventFormStep !== 3}>
                  <small className="draft-save-status" role="status">
                    {editingEventId
                      ? "変更内容は審査後に反映されます"
                      : isDraftSaving
                        ? "下書きを保存中…"
                        : draftSavedAt
                          ? `下書き保存済み・${draftSavedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
                          : "入力するとこの端末へ自動保存されます"}
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
      {isEventImageReviewOpen && eventImagePreview && eventImageFile && (
        <ImageCropDialog
          title="イベント写真の範囲を調整"
          imageUrl={eventImagePreview}
          imageFile={eventImageFile}
          alt="イベント写真の確認用プレビュー"
          aspect={16 / 9}
          maxOutputWidth={1920}
          onCancel={() => {
            revokeObjectUrl(eventImagePreview);
            setIsEventImageReviewOpen(false);
            setEventImageFile(null);
            setEventImagePreview(
              editingEventId
                ? (events.find((item) => item.id === editingEventId)
                    ?.imageUrl ?? null)
                : selectedTemplate.imageUrl,
            );
            setEventImageInputKey((current) => current + 1);
          }}
          onConfirm={(file, previewUrl) => {
            revokeObjectUrl(eventImagePreview);
            setEventImageFile(file);
            setEventImagePreview(previewUrl);
            setIsEventImageReviewOpen(false);
          }}
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
                        {file.name}
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
            onLoadOlder={() => setChatMessageLimit((current) => current + 100)}
            draft={messageDraft}
            unreadCounts={unreadChatCounts}
            readReceipts={chatReadReceipts}
            mutedRoomIds={chatPreferences
              .filter((preference) => preference.muted)
              .map((preference) => preference.roomId)}
            onSelectRoom={selectOrganizationChatRoom}
            onCloseRoom={() => setActiveRoomId(null)}
            onLoadMoreRooms={() =>
              setChatRoomQueryLimit((current) => current + 50)
            }
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
