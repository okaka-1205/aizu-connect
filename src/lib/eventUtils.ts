import type { Timestamp } from "firebase/firestore";
import { toCalendarFile } from "./appLogic";
import type { AizuEvent, NotificationPreferences } from "../types/domain";

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

export const preferredScrollBehavior = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";

export const formatChatTime = (value?: Timestamp) =>
  value
    ? new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(value.toDate())
    : "";

export const formatChatDay = (value?: Timestamp) =>
  value
    ? new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(value.toDate())
    : "";

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
