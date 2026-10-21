import type { Timestamp } from "firebase/firestore";
import { timestampMillis } from "../../lib/eventUtils";
import type {
  AccountDeletionRequest,
  AizuEvent,
  AppUser,
  AuditLog,
  ReportRecord,
} from "../../types/domain";

type AdminDashboardViewInput = {
  search: string;
  pendingEvents: AizuEvent[];
  pendingUsers: AppUser[];
  pendingReports: ReportRecord[];
  deletionRequests: AccountDeletionRequest[];
  deletionRequestUsers: Record<string, AppUser>;
  managedUsers: AppUser[];
  managedEvents: AizuEvent[];
  managedUserStatus: "active" | "suspended" | "rejected";
  auditLogs: AuditLog[];
  now?: Date;
};

export function deriveAdminDashboardView({
  search,
  pendingEvents,
  pendingUsers,
  pendingReports,
  deletionRequests,
  deletionRequestUsers,
  managedUsers,
  managedEvents,
  managedUserStatus,
  auditLogs,
  now = new Date(),
}: AdminDashboardViewInput) {
  const normalizedSearch = search.trim().toLowerCase();
  const matches = (...values: (string | null | undefined)[]) =>
    !normalizedSearch ||
    values.filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch);
  const newestFirst = <T extends { createdAt?: Timestamp }>(
    left: T,
    right: T,
  ) => timestampMillis(right.createdAt) - timestampMillis(left.createdAt);

  const visiblePendingEvents = [...pendingEvents]
    .filter((event) =>
      matches(event.title, event.organizationName, event.location),
    )
    .sort(newestFirst);
  const visiblePendingUsers = [...pendingUsers]
    .filter((user) => matches(user.displayName, user.email, user.university))
    .sort(newestFirst);
  const visiblePendingReports = [...pendingReports]
    .filter((report) =>
      matches(report.targetTitle, report.reason, report.description),
    )
    .sort(newestFirst);
  const visibleDeletionRequests = [...deletionRequests]
    .filter((request) => {
      const user =
        deletionRequestUsers[request.userId] ??
        managedUsers.find((item) => item.uid === request.userId);
      return matches(
        request.userId,
        request.reason,
        user?.displayName,
        user?.email,
      );
    })
    .sort(
      (left, right) =>
        timestampMillis(right.requestedAt) - timestampMillis(left.requestedAt),
    );
  const visibleManagedUsers = [...managedUsers]
    .filter((user) => user.status === managedUserStatus)
    .filter((user) => matches(user.displayName, user.email, user.university))
    .sort(newestFirst);
  const visibleManagedEvents = [...managedEvents]
    .filter((event) =>
      matches(event.title, event.organizationName, event.location),
    )
    .sort(newestFirst);
  const pendingCreatedTimes = [
    ...pendingEvents.map((event) => timestampMillis(event.createdAt)),
    ...pendingUsers.map((user) => timestampMillis(user.createdAt)),
    ...pendingReports.map((report) => timestampMillis(report.createdAt)),
  ].filter((value) => value > 0);
  const oldestPendingDays = pendingCreatedTimes.length
    ? Math.max(
        0,
        Math.floor(
          (now.getTime() - Math.min(...pendingCreatedTimes)) / 86_400_000,
        ),
      )
    : 0;
  const processedToday = auditLogs.filter((audit) => {
    const date = audit.createdAt?.toDate();
    return (
      date?.getFullYear() === now.getFullYear() &&
      date?.getMonth() === now.getMonth() &&
      date?.getDate() === now.getDate()
    );
  }).length;

  return {
    visiblePendingEvents,
    visiblePendingUsers,
    visiblePendingReports,
    visibleDeletionRequests,
    visibleManagedUsers,
    visibleManagedEvents,
    oldestPendingDays,
    processedToday,
  };
}
