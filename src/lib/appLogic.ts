export type Filter =
  | "すべて"
  | "交流・コミュニティ"
  | "地域活動"
  | "ボランティア"
  | "学び・制作"
  | "趣味・スポーツ";

export type TimestampLike = {
  toDate: () => Date;
};

export type ImageLike = {
  type: string;
  size: number;
};

export type CalendarEventLike = {
  id: string;
  title: string;
  summary: string;
  location: string;
  startAt: Date;
  endAt?: Date;
};

export const categories: Filter[] = [
  "すべて",
  "交流・コミュニティ",
  "地域活動",
  "ボランティア",
  "学び・制作",
  "趣味・スポーツ",
];

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"];
export const acceptedChatAttachmentTypes = [
  ...acceptedImageTypes,
  "application/pdf",
  "text/plain",
  "text/csv",
];

export const validateImageFile = (file: ImageLike, label: string) => {
  if (!acceptedImageTypes.includes(file.type)) {
    throw new Error(`${label}はJPEG、PNG、WebPのいずれかを選択してください。`);
  }
  if (file.size >= MAX_IMAGE_SIZE) {
    throw new Error(`${label}は5MB未満の画像を選択してください。`);
  }
};

export const validateChatAttachment = (file: ImageLike) => {
  if (!acceptedChatAttachmentTypes.includes(file.type)) {
    throw new Error("添付できるのはJPEG、PNG、WebP、PDF、テキスト、CSVです。");
  }
  if (file.size >= MAX_CHAT_ATTACHMENT_SIZE) {
    throw new Error("添付ファイルは10MB未満にしてください。");
  }
};

const escapeCalendarText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

const toCalendarTimestamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

export const toCalendarFile = (event: CalendarEventLike) => {
  const endAt =
    event.endAt ?? new Date(event.startAt.getTime() + 2 * 60 * 60 * 1000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aizu Connect//Event//JA",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(event.id)}@aizu-connect`,
    `DTSTAMP:${toCalendarTimestamp(new Date())}`,
    `DTSTART:${toCalendarTimestamp(event.startAt)}`,
    `DTEND:${toCalendarTimestamp(endAt)}`,
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `DESCRIPTION:${escapeCalendarText(event.summary)}`,
    `LOCATION:${escapeCalendarText(event.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
};

const categoryAliases: Record<Exclude<Filter, "すべて">, string[]> = {
  "交流・コミュニティ": ["交流・コミュニティ", "地域イベント", "企業交流"],
  地域活動: ["地域活動", "地域イベント"],
  ボランティア: ["ボランティア"],
  "学び・制作": ["学び・制作", "キャリア"],
  "趣味・スポーツ": ["趣味・スポーツ"],
};

export const matchesCategoryFilter = (category: string, filter: Filter) =>
  filter === "すべて" || categoryAliases[filter].includes(category);

export const isAizuUniversityEmail = (email: string) =>
  email.trim().toLowerCase().endsWith("@u-aizu.ac.jp");

export const normalizeLoginEmail = (email: string, devAdminEmail = "") => {
  const normalizedEmail = email.trim().toLowerCase();
  return devAdminEmail && normalizedEmail === "admin"
    ? devAdminEmail
    : normalizedEmail;
};

export type AccountAccessGate =
  | "email_verification"
  | "admin_approval"
  | "account_rejected"
  | "account_setup"
  | "active";

export const resolveAccountAccessGate = ({
  isProduction,
  emailVerified,
  status,
}: {
  isProduction: boolean;
  emailVerified: boolean;
  status: string;
}): AccountAccessGate => {
  if (isProduction && !emailVerified) return "email_verification";
  if (status === "rejected" || status === "suspended")
    return "account_rejected";
  if (status === "pending_approval" || status === "pending")
    return "admin_approval";
  if (status === "active") return "active";
  return "account_setup";
};

export const formatEventStart = (value: string) => {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export const toDateTimeLocalValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export const toDateTimeInput = (timestamp?: TimestampLike) => {
  if (!timestamp) return "";
  return toDateTimeLocalValue(timestamp.toDate());
};

export const isFutureEventStart = (date?: Date, now = new Date()) =>
  Boolean(
    date && Number.isFinite(date.getTime()) && date.getTime() > now.getTime(),
  );

export const getFirebaseErrorMessage = (error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  if (error instanceof Error) {
    if (
      code === "functions/permission-denied" &&
      error.message.includes("承認待ち")
    )
      return "メール認証は完了しています。現在は管理者の承認待ちです。";
    if (
      code === "functions/permission-denied" &&
      error.message.includes("管理者")
    )
      return "管理者権限を確認できませんでした。管理者アカウントで再ログインしてください。";
    if (
      code === "functions/failed-precondition" &&
      (error.message.includes("管理者") ||
        error.message.includes("審査済み") ||
        error.message.includes("公開状態"))
    )
      return "この管理操作は実行できません。対象の状態を更新してから、もう一度お試しください。";
    if (
      code === "functions/not-found" &&
      (error.message.includes("通報") ||
        error.message.includes("ユーザー") ||
        error.message.includes("イベント"))
    )
      return "対象データはすでに削除されたか、更新されています。画面を再読み込みしてください。";
    if (code === "functions/already-exists")
      return "このイベントにはすでに参加申請済みです。";
    if (code === "functions/resource-exhausted")
      return "このイベントは定員に達しています。";
    if (error.message.includes("Email verification is required."))
      return "メールアドレスの確認が必要です。確認メールのリンクを開いてから、もう一度お試しください。";
    if (
      code === "functions/failed-precondition" &&
      error.message.includes("編集できません")
    )
      return "このイベントは現在編集できません。画面を更新して状態を確認してください。";
    if (
      code === "functions/invalid-argument" &&
      error.message.includes("Event details")
    )
      return "イベントの入力内容を確認してください。必須項目と開催日時を見直してください。";
    if (code === "functions/failed-precondition")
      return "このイベントは現在申し込めません。公開状態と受付期間を確認してください。";
    if (code === "functions/permission-denied")
      return "この操作には承認済みの学生アカウントが必要です。";
    if (
      code === "auth/network-request-failed" ||
      error.message.includes("auth/network-request-failed")
    )
      return "Firebase Authenticationに接続できません。ネットワーク接続とFirebase設定を確認してください。";
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
      code === "storage/unauthorized" ||
      error.message.includes("storage/unauthorized")
    )
      return "画像やファイルを保存する権限を確認できませんでした。メール認証とアカウントの承認状態を確認して、もう一度お試しください。";
    if (
      code === "storage/retry-limit-exceeded" ||
      code === "storage/unknown" ||
      error.message.includes("storage/retry-limit-exceeded")
    )
      return "ファイルの送信を完了できませんでした。通信状態を確認して、もう一度お試しください。";
    if (
      code === "storage/quota-exceeded" ||
      error.message.includes("storage/quota-exceeded")
    )
      return "現在ファイルを保存できません。運営へお問い合わせください。";
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
