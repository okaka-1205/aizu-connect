import type { Timestamp } from "firebase/firestore";
import { toCalendarFile } from "./appLogic";
import type {
  ActivityRecord,
  AizuEvent,
  NotificationPreferences,
} from "../types/domain";

export const hasRequiredCommerceDisclosure = (event: AizuEvent) =>
  event.feeType !== "有料" ||
  (Number(event.feeAmount ?? 0) > 0 &&
    [
      event.commercialSellerName,
      event.commercialSellerAddress,
      event.commercialSellerPhone,
      event.commercialResponsiblePerson,
      event.paymentMethod,
      event.paymentTiming,
      event.additionalFees,
      event.cancellationPolicy,
    ].every((value) => typeof value === "string" && value.trim().length > 0));

export const csvEscape = (value: string | number | undefined | null) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

export const timestampMillis = (value?: Timestamp) => value?.toMillis?.() ?? 0;

export const indexEventsById = (events: readonly AizuEvent[]) => {
  const byId = new Map<string, AizuEvent>();
  for (const event of events) {
    if (!byId.has(event.id)) byId.set(event.id, event);
  }
  return byId;
};

export const selectRecommendedEvent = (
  events: readonly AizuEvent[],
  interests: readonly string[] = [],
  now = Date.now(),
) => {
  let recommended: AizuEvent | undefined;
  let highestScore = -Infinity;
  for (const event of events) {
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
      (timestampMillis(event.startAt) - now) / 86_400_000,
    );
    const score = interestScore * 100 - daysUntil;
    if (!recommended || score > highestScore) {
      recommended = event;
      highestScore = score;
    }
  }
  return recommended;
};

export const preferredScrollBehavior = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";

const chatTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const chatDayFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

export const formatChatTime = (value?: Timestamp) =>
  value ? chatTimeFormatter.format(value.toDate()) : "";

export const formatChatDay = (value?: Timestamp) =>
  value ? chatDayFormatter.format(value.toDate()) : "";

export const downloadEventCalendar = (event: AizuEvent) => {
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

export const googleCalendarUrl = (event: AizuEvent) => {
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

export const defaultNotificationPreferences = (
  userId: string,
): NotificationPreferences => ({
  userId,
  newEvents: true,
  applicationUpdates: true,
  chatMessages: true,
  eventReminders: true,
});

export const revokeObjectUrl = (url: string | null | undefined) => {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
};

export const downloadActivityPortfolioPdf = async (
  userName: string,
  activities: ActivityRecord[],
) => {
  const { jsPDF } = await import("jspdf");
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = Math.max(1754, 360 + activities.length * 110);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PDFを作成できませんでした。");
  context.fillStyle = "#fffefa";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#1c2735";
  context.font = "bold 46px system-ui, sans-serif";
  context.fillText("Aizu Connect 活動実績", 90, 120);
  context.font = "28px system-ui, sans-serif";
  context.fillText(`${userName} さん`, 90, 180);
  context.fillStyle = "#627083";
  context.font = "22px system-ui, sans-serif";
  context.fillText(`証明済み活動 ${activities.length}件`, 90, 225);
  activities.forEach((activity, index) => {
    const top = 310 + index * 110;
    context.fillStyle = "#f1f4f2";
    context.fillRect(80, top - 48, 1080, 86);
    context.fillStyle = "#1c2735";
    context.font = "bold 24px system-ui, sans-serif";
    context.fillText(activity.title.slice(0, 38), 105, top - 10);
    context.fillStyle = "#526274";
    context.font = "19px system-ui, sans-serif";
    context.fillText(
      `${activity.organizationName} / ${activity.activityYear}年${activity.activityMonth}月`,
      105,
      top + 22,
    );
  });
  const pdf = new jsPDF({ unit: "px", format: [canvas.width, canvas.height] });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(`Aizu-Connect-${userName}-活動実績.pdf`);
};
