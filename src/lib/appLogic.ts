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

export const categories: Filter[] = [
  "すべて",
  "交流・コミュニティ",
  "地域活動",
  "ボランティア",
  "学び・制作",
  "趣味・スポーツ",
];

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"];

export const validateImageFile = (file: ImageLike, label: string) => {
  if (!acceptedImageTypes.includes(file.type)) {
    throw new Error(`${label}はJPEG、PNG、WebPのいずれかを選択してください。`);
  }
  if (file.size >= MAX_IMAGE_SIZE) {
    throw new Error(`${label}は5MB未満の画像を選択してください。`);
  }
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

export const DEV_ADMIN_EMAIL = "admin@aizu-connect.local";
export const DEV_ADMIN_PASSWORD = "admin123";

export const normalizeLoginEmail = (email: string, isDev = false) => {
  const normalizedEmail = email.trim().toLowerCase();
  return isDev && normalizedEmail === "admin"
    ? DEV_ADMIN_EMAIL
    : normalizedEmail;
};

export const formatEventStart = (value: string) => {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ja-JP", {
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
    if (error.message.includes("Email verification is required."))
      return "メールアドレスの確認が必要です。確認メールのリンクを開いてから、もう一度お試しください。";
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
