export type ApplicationStatus =
  | "pending"
  | "waitlisted"
  | "confirmed"
  | "rejected"
  | "attended"
  | "absent"
  | "cancelled";

export type ReminderBucket = "2h" | "24h";

const applicationStatusMessages: Record<string, string> = {
  pending: "空きが出たため、参加申請の確認待ちへ繰り上がりました。",
  waitlisted: "キャンセル待ちに登録されました。",
  confirmed: "参加が確定しました。",
  rejected: "今回は参加見送りとなりました。",
  attended: "出席が確認され、活動実績に追加されました。",
  absent: "出席が確認できませんでした。",
  cancelled: "参加申請をキャンセルしました。",
};

export const applicationStatusMessage = (status: string): string =>
  applicationStatusMessages[status] ?? "参加申請の状態が更新されました。";

export const shouldDecrementApplicantCount = (
  beforeStatus: string,
  afterStatus: string,
): boolean =>
  ["pending", "confirmed"].includes(beforeStatus) &&
  ["cancelled", "rejected"].includes(afterStatus);

export const shouldIncrementApplicantCount = (
  beforeStatus: string,
  afterStatus: string,
): boolean =>
  beforeStatus === "waitlisted" &&
  ["pending", "confirmed"].includes(afterStatus);

export const shouldSetChatRoomReadOnly = (status: string): boolean =>
  ["cancelled", "rejected"].includes(status);

export const isEventPlanEditableStatus = (status: unknown): boolean =>
  ["pending_review", "published", "revision_required", "unpublished"].includes(
    String(status),
  );

export const isMissingStorageBucketError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const storageError = error as {
    code?: unknown;
    statusCode?: unknown;
    message?: unknown;
    errors?: Array<{ reason?: unknown }>;
  };
  return (
    storageError.code === 404 ||
    storageError.statusCode === 404 ||
    storageError.code === "404" ||
    storageError.errors?.some((item) => item.reason === "notFound") === true ||
    (typeof storageError.message === "string" &&
      storageError.message.includes("specified bucket does not exist"))
  );
};

export const isCheckInWindowOpen = (
  eventStatus: string,
  startAtMillis: number,
  endAtMillis: number | undefined,
  nowMillis: number,
): boolean => {
  if (
    eventStatus !== "published" ||
    !Number.isFinite(startAtMillis) ||
    !Number.isFinite(nowMillis)
  ) {
    return false;
  }
  const threeHours = 3 * 60 * 60 * 1000;
  const twentyFourHours = 24 * 60 * 60 * 1000;
  const fallbackEnd = startAtMillis + 12 * 60 * 60 * 1000;
  const effectiveEnd =
    endAtMillis !== undefined && Number.isFinite(endAtMillis) ?
      Math.max(endAtMillis, startAtMillis) :
      fallbackEnd;
  return (
    nowMillis >= startAtMillis - threeHours &&
    nowMillis <= effectiveEnd + twentyFourHours
  );
};

export type EventPlanInput = {
  title: string;
  summary: string;
  category: string;
  location: string;
  startAtMillis: number;
  endAtMillis: number;
  feeType: "無料" | "有料";
  feeAmount: number;
  eventFormat: "現地" | "オンライン" | "ハイブリッド";
  meetingPoint: string;
  accessInfo: string;
  bringItems: string;
  cancellationPolicy: string;
  weatherPolicy: string;
  accessibility: string;
  contactMethod: string;
  capacity: number;
  imageUrl: string;
  templateKey: string;
  beginnerLevel: "初参加歓迎" | "少し経験者向け" | "誰でも歓迎";
  takeaways: string[];
  organizerDescription: string;
  organizerExperience: string;
};

const validText = (
  value: unknown,
  minimumLength: number,
  maximumLength: number,
) =>
  typeof value === "string" &&
  value.trim().length >= minimumLength &&
  value.trim().length <= maximumLength;

const validImageUrl = (value: unknown) => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "::1"].includes(url.hostname))
    );
  } catch {
    return false;
  }
};

export const normalizeEventPlanInput = (
  value: unknown,
  nowMillis: number,
): EventPlanInput | null => {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const categories = [
    "交流・コミュニティ",
    "地域活動",
    "ボランティア",
    "学び・制作",
    "趣味・スポーツ",
  ];
  const feeTypes = ["無料", "有料"];
  const eventFormats = ["現地", "オンライン", "ハイブリッド"];
  const beginnerLevels = ["初参加歓迎", "少し経験者向け", "誰でも歓迎"];
  const takeaways = data.takeaways;
  if (
    !validText(data.title, 1, 80) ||
    !validText(data.summary, 1, 220) ||
    !validText(data.category, 1, 40) ||
    !categories.includes(String(data.category)) ||
    !validText(data.location, 1, 80) ||
    typeof data.startAtMillis !== "number" ||
    !Number.isFinite(data.startAtMillis) ||
    data.startAtMillis <= nowMillis ||
    typeof data.endAtMillis !== "number" ||
    !Number.isFinite(data.endAtMillis) ||
    data.endAtMillis <= data.startAtMillis ||
    !feeTypes.includes(String(data.feeType)) ||
    typeof data.feeAmount !== "number" ||
    !Number.isFinite(data.feeAmount) ||
    data.feeAmount < 0 ||
    data.feeAmount > 1_000_000 ||
    !eventFormats.includes(String(data.eventFormat)) ||
    !validText(data.meetingPoint, 1, 160) ||
    !validText(data.accessInfo, 0, 300) ||
    !validText(data.bringItems, 1, 300) ||
    !validText(data.cancellationPolicy, 1, 500) ||
    !validText(data.weatherPolicy, 1, 500) ||
    !validText(data.accessibility, 1, 500) ||
    !validText(data.contactMethod, 1, 300) ||
    typeof data.capacity !== "number" ||
    !Number.isInteger(data.capacity) ||
    data.capacity < 1 ||
    data.capacity > 1000 ||
    !validText(data.imageUrl, 1, 500) ||
    !validImageUrl(data.imageUrl) ||
    !validText(data.templateKey, 1, 40) ||
    !beginnerLevels.includes(String(data.beginnerLevel)) ||
    !Array.isArray(takeaways) ||
    takeaways.length < 1 ||
    takeaways.length > 3 ||
    !takeaways.every((item) => validText(item, 1, 60)) ||
    !validText(data.organizerDescription, 1, 500) ||
    !validText(data.organizerExperience, 1, 300)
  ) {
    return null;
  }
  return {
    title: String(data.title).trim(),
    summary: String(data.summary).trim(),
    category: String(data.category),
    location: String(data.location).trim(),
    startAtMillis: data.startAtMillis,
    endAtMillis: data.endAtMillis,
    feeType: data.feeType as EventPlanInput["feeType"],
    feeAmount: data.feeType === "無料" ? 0 : data.feeAmount,
    eventFormat: data.eventFormat as EventPlanInput["eventFormat"],
    meetingPoint: String(data.meetingPoint).trim(),
    accessInfo: String(data.accessInfo).trim(),
    bringItems: String(data.bringItems).trim(),
    cancellationPolicy: String(data.cancellationPolicy).trim(),
    weatherPolicy: String(data.weatherPolicy).trim(),
    accessibility: String(data.accessibility).trim(),
    contactMethod: String(data.contactMethod).trim(),
    capacity: data.capacity,
    imageUrl: String(data.imageUrl).trim(),
    templateKey: String(data.templateKey),
    beginnerLevel: data.beginnerLevel as EventPlanInput["beginnerLevel"],
    takeaways: takeaways.map((item) => String(item).trim()),
    organizerDescription: String(data.organizerDescription).trim(),
    organizerExperience: String(data.organizerExperience).trim(),
  };
};

type SavedSearchLike = {
  searchText?: string;
  category?: string;
  dateFilter?: string;
  dayFilter?: string;
  timeFilter?: string;
  feeFilter?: string;
  formatFilter?: string;
  onlyAvailable?: boolean;
  onlyBeginner?: boolean;
};

type EventSearchLike = {
  title?: string;
  summary?: string;
  category?: string;
  location?: string;
  organizationName?: string;
  tags?: string[];
  beginnerLevel?: string;
  feeType?: string;
  eventFormat?: string;
  applicantCount?: number;
  capacity?: number;
  startAtMillis?: number;
};

export const matchesSavedSearch = (
  savedSearch: SavedSearchLike | undefined,
  event: EventSearchLike,
  nowMillis: number,
): boolean => {
  if (!savedSearch) return true;
  const searchText = String(savedSearch.searchText ?? "")
    .trim()
    .toLowerCase();
  const searchable = [
    event.title,
    event.summary,
    event.category,
    event.location,
    event.organizationName,
    ...(event.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (searchText && !searchable.includes(searchText)) return false;
  if (
    savedSearch.category &&
    savedSearch.category !== "すべて" &&
    event.category !== savedSearch.category
  ) {
    return false;
  }
  if (savedSearch.onlyAvailable) {
    if (Number(event.applicantCount ?? 0) >= Number(event.capacity ?? 0)) {
      return false;
    }
  }
  if (
    savedSearch.onlyBeginner &&
    event.beginnerLevel !== "初参加歓迎" &&
    !(event.tags ?? []).some((tag) => tag.includes("初心者"))
  ) {
    return false;
  }
  if (
    savedSearch.feeFilter &&
    savedSearch.feeFilter !== "すべて" &&
    (event.feeType ?? "無料") !== savedSearch.feeFilter
  ) {
    return false;
  }
  if (
    savedSearch.formatFilter &&
    savedSearch.formatFilter !== "すべて" &&
    (event.eventFormat ?? "現地") !== savedSearch.formatFilter
  ) {
    return false;
  }
  const eventDate = new Date(Number(event.startAtMillis));
  if (!Number.isFinite(eventDate.getTime())) return false;
  const day = eventDate.getDay();
  if (savedSearch.dayFilter === "土日" && day !== 0 && day !== 6) {
    return false;
  }
  if (savedSearch.dayFilter === "平日" && (day === 0 || day === 6)) {
    return false;
  }
  const hour = eventDate.getHours();
  if (savedSearch.timeFilter === "午前" && hour >= 12) return false;
  if (savedSearch.timeFilter === "午後" && (hour < 12 || hour >= 18)) {
    return false;
  }
  if (savedSearch.timeFilter === "夜" && hour < 18) return false;
  const daysUntil = (eventDate.getTime() - nowMillis) / 86_400_000;
  if (savedSearch.dateFilter === "今週" && daysUntil > 7) return false;
  if (
    savedSearch.dateFilter === "今月" &&
    (eventDate.getMonth() !== new Date(nowMillis).getMonth() ||
      eventDate.getFullYear() !== new Date(nowMillis).getFullYear())
  ) {
    return false;
  }
  return eventDate.getTime() > nowMillis;
};

export const reminderBucketForHoursUntil = (
  hoursUntil: number,
): ReminderBucket => (hoursUntil <= 2 ? "2h" : "24h");

export const reminderNotificationPath = (
  eventId: string,
  studentId: string,
  bucket: ReminderBucket,
): string => `notifications/reminder_${eventId}_${studentId}_${bucket}`;

export const shouldNotifyPublishedEventStudent = (
  studentId: string,
  organizerId: string,
  notificationEnabled: boolean,
): boolean => notificationEnabled && studentId !== organizerId;

export const isApplicationWindowOpen = (
  eventStatus: string,
  startAtMillis: number,
  nowMillis: number,
): boolean =>
  eventStatus === "published" &&
  Number.isFinite(startAtMillis) &&
  startAtMillis > nowMillis;
