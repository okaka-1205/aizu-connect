export type ApplicationStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "attended"
  | "absent"
  | "cancelled";

export type ReminderBucket = "2h" | "24h";

const applicationStatusMessages: Record<string, string> = {
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

export const shouldSetChatRoomReadOnly = (status: string): boolean =>
  ["cancelled", "rejected"].includes(status);

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
