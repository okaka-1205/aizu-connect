import { csvEscape, timestampMillis } from "../../lib/eventUtils";
import type {
  AizuEvent,
  EventApplication,
  NotificationItem,
} from "../../types/domain";
import { applicationStatusLabel } from "../shared/applicationStatus";

export function filterOrganizationEvents(
  events: AizuEvent[],
  search: string,
  status: "all" | AizuEvent["status"],
  sort: "date" | "newest",
) {
  const normalizedSearch = search.trim().toLowerCase();
  return [...events]
    .filter((event) => status === "all" || event.status === status)
    .filter((event) =>
      [event.title, event.location, event.organizationName]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    )
    .sort((left, right) =>
      sort === "newest"
        ? timestampMillis(right.createdAt) - timestampMillis(left.createdAt)
        : timestampMillis(left.startAt) - timestampMillis(right.startAt),
    );
}

export function filterOrganizationApplications(
  applications: EventApplication[],
  search: string,
  status: "all" | EventApplication["status"],
) {
  const normalizedSearch = search.trim().toLowerCase();
  return applications.filter(
    (application) =>
      (status === "all" || application.status === status) &&
      [
        application.studentName,
        application.participantMessage ?? "",
        application.accessibilityNeeds ?? "",
        application.organizerNote ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
  );
}

export function summarizeApplicants(applications: EventApplication[]) {
  return {
    total: applications.length,
    pending: applications.filter((item) => item.status === "pending").length,
    waitlisted: applications.filter((item) => item.status === "waitlisted")
      .length,
    confirmed: applications.filter((item) => item.status === "confirmed")
      .length,
    attended: applications.filter((item) => item.status === "attended").length,
    absent: applications.filter((item) => item.status === "absent").length,
  };
}

export function countUnreadChats(notifications: NotificationItem[]) {
  const counts: Record<string, number> = {};
  notifications.forEach((notification) => {
    if (
      !notification.isRead &&
      notification.targetType === "chat" &&
      notification.targetId
    ) {
      counts[notification.targetId] = (counts[notification.targetId] ?? 0) + 1;
    }
  });
  return counts;
}

export function downloadParticipantReport(
  event: AizuEvent,
  applications: EventApplication[],
) {
  const rows = [
    [
      "イベント名",
      "開催日時",
      "定員",
      "申請数",
      "参加者名",
      "状態",
      "申請日時",
      "参加者メッセージ",
      "必要な配慮",
      "緊急連絡先",
      "運営メモ",
    ],
    ...applications.map((application) => [
      event.title,
      event.startAtLabel,
      event.capacity,
      event.applicantCount,
      application.studentName,
      applicationStatusLabel(application.status),
      application.createdAt?.toDate?.().toLocaleString("ja-JP") ?? "",
      application.participantMessage ?? "",
      application.accessibilityNeeds ?? "",
      application.emergencyContact ?? "",
      application.organizerNote ?? "",
    ]),
  ];
  const csv = rows
    .map((row) => row.map((value) => csvEscape(value)).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title}-参加者レポート.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
