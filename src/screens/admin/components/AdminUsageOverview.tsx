import {
  Activity,
  CalendarCheck2,
  CalendarDays,
  CircleX,
  RefreshCw,
  TriangleAlert,
  UserPlus,
  UsersRound,
} from "lucide-react";
import type { AdminUsageMetrics } from "../../../types/domain";

export function AdminUsageOverview({
  metrics,
  isLoading,
  error,
  onRefresh,
}: {
  metrics: AdminUsageMetrics | null;
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  return (
    <section className="admin-usage-overview" aria-labelledby="usage-heading">
      <div className="role-card-head">
        <div>
          <p className="eyebrow">サービス運用</p>
          <h2 id="usage-heading">利用状況</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          title="利用状況を更新"
          aria-label="利用状況を更新"
          disabled={isLoading}
          onClick={onRefresh}
        >
          <RefreshCw size={17} className={isLoading ? "spin" : ""} />
        </button>
      </div>
      {error ? (
        <p className="admin-metrics-error" role="alert">
          {error}
        </p>
      ) : !metrics ? (
        <p className="admin-metrics-loading" role="status">
          利用状況を集計しています…
        </p>
      ) : (
        <>
          <div className="admin-usage-metrics">
            <UsageMetric
              icon={<UsersRound size={18} />}
              value={metrics.totalUsers}
              label="登録ユーザー"
              detail={`有効 ${metrics.activeUsers}人・団体 ${metrics.organizationUsers}件`}
            />
            <UsageMetric
              icon={<UserPlus size={18} />}
              value={metrics.newUsers30Days}
              label="直近30日の登録"
              detail="新しく登録されたアカウント"
            />
            <UsageMetric
              icon={<CalendarDays size={18} />}
              value={metrics.publishedEvents}
              label="公開イベント"
              detail="現在公開中"
            />
            <UsageMetric
              icon={<Activity size={18} />}
              value={metrics.totalApplications}
              label="累計申込"
              detail={`直近30日 ${metrics.applications30Days}件`}
            />
            <UsageMetric
              icon={<CalendarCheck2 size={18} />}
              value={`${metrics.applicationCompletionRate}%`}
              label="申込完了率"
              detail="参加確定・出席 ÷ 全申込"
            />
            <UsageMetric
              icon={<CircleX size={18} />}
              value={`${metrics.cancellationRate}%`}
              label="キャンセル率"
              detail="キャンセル ÷ 全申込"
            />
            <UsageMetric
              icon={<TriangleAlert size={18} />}
              value={metrics.clientErrors7Days}
              label="直近7日の画面エラー"
              detail="集計開始後・個人情報は保存しません"
              warning={metrics.clientErrors7Days > 0}
            />
          </div>
          <p className="admin-metrics-updated">
            最終集計：{new Date(metrics.generatedAt).toLocaleString("ja-JP")}
          </p>
        </>
      )}
    </section>
  );
}

function UsageMetric({
  icon,
  value,
  label,
  detail,
  warning = false,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <div className={warning ? "is-warning" : undefined}>
      <span className="admin-metric-icon" aria-hidden="true">
        {icon}
      </span>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{detail}</small>
    </div>
  );
}
