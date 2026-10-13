import { Filter, Search } from "lucide-react";

export function AdminOverview({
  search,
  onSearchChange,
  pendingEvents,
  pendingUsers,
  pendingReports,
  deletionRequests,
  hasMorePendingEvents,
  hasMorePendingUsers,
  hasMorePendingReports,
  hasMoreDeletionRequests,
  oldestPendingDays,
  processedToday,
  reviewQueueHasMore,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  pendingEvents: number;
  pendingUsers: number;
  pendingReports: number;
  deletionRequests: number;
  hasMorePendingEvents: boolean;
  hasMorePendingUsers: boolean;
  hasMorePendingReports: boolean;
  hasMoreDeletionRequests: boolean;
  oldestPendingDays: number;
  processedToday: number;
  reviewQueueHasMore: boolean;
}) {
  return (
    <>
      <div className="admin-toolbar">
        <div className="conversation-search">
          <Search size={15} />
          <input
            aria-label="管理対象を検索"
            value={search}
            placeholder="イベント・氏名・通報理由を横断検索"
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <span>
          <Filter size={14} />
          新しい項目から表示
        </span>
      </div>
      <div className="role-metrics">
        <Metric
          value={pendingEvents}
          hasMore={hasMorePendingEvents}
          label="イベント審査"
        />
        <Metric
          value={pendingUsers}
          hasMore={hasMorePendingUsers}
          label="アカウント審査"
        />
        <Metric
          value={pendingReports}
          hasMore={hasMorePendingReports}
          label="通報対応"
        />
        <Metric
          value={deletionRequests}
          hasMore={hasMoreDeletionRequests}
          label="退会申請"
        />
        <div>
          <strong>{oldestPendingDays}日</strong>
          <span>
            {reviewQueueHasMore ? "読込範囲の最古" : "最も古い未処理"}
          </span>
        </div>
        <div>
          <strong>{processedToday}</strong>
          <span>本日の処理</span>
        </div>
      </div>
    </>
  );
}

function Metric({
  value,
  hasMore,
  label,
}: {
  value: number;
  hasMore: boolean;
  label: string;
}) {
  return (
    <div>
      <strong>
        {value}
        {hasMore ? "+" : ""}
      </strong>
      <span>{label}</span>
    </div>
  );
}
