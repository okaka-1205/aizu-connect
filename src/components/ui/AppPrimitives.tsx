import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Compass,
  Info,
  Loader2,
  Search,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { EVENT_PAGE_SIZE } from "../../config/events";
import type { NoticeTone } from "../../types/domain";

export function SectionHeading({
  className,
  eyebrow,
  title,
  action,
  onClick,
}: {
  className?: string;
  eyebrow?: string;
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className={`section-heading ${className ?? ""}`.trim()}>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {action && (
        <button type="button" onClick={onClick}>
          {action}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}

export function EmptyEvents() {
  return (
    <div className="empty-state">
      <Compass size={30} />
      <h3>公開中のイベントはありません</h3>
      <p>新しいイベントが公開されると、ここから参加できます。</p>
    </div>
  );
}

export function EmptySearchResults({
  hasMoreEvents,
  isLoading,
  onReset,
}: {
  hasMoreEvents: boolean;
  isLoading: boolean;
  onReset: () => void;
}) {
  return (
    <div className="empty-state">
      <Search size={30} />
      <h3>
        {isLoading
          ? "すべてのイベントを検索しています"
          : hasMoreEvents
            ? "読み込み済みの範囲に一致するイベントはありません"
            : "条件に合うイベントが見つかりません"}
      </h3>
      <p>
        {isLoading
          ? "結果がそろうまで少しお待ちください。"
          : hasMoreEvents
            ? `下の「次の${EVENT_PAGE_SIZE}件を見る」で検索対象を広げるか、条件を変えてください。`
            : "検索語や絞り込み条件を変えると、別のイベントが見つかるかもしれません。"}
      </p>
      <button className="secondary-action" type="button" onClick={onReset}>
        条件をリセット
      </button>
    </div>
  );
}

export function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand-mark${large ? " large" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" focusable="false">
        <path d="M14.8 8.7 8.4 22.5M17.2 8.7l6.4 13.8M11 19c3-2.7 7-2.7 10 0" />
        <circle cx="16" cy="6" r="2.8" />
        <circle cx="7" cy="25" r="2.8" />
        <circle cx="25" cy="25" r="2.8" />
      </svg>
    </span>
  );
}

export function NoticeBanner({
  message,
  tone,
  onClose,
}: {
  message: string;
  tone: NoticeTone;
  onClose?: () => void;
}) {
  return (
    <div
      className={`notice is-${tone}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      {tone === "error" ? (
        <AlertCircle size={18} />
      ) : tone === "success" ? (
        <CheckCircle2 size={18} />
      ) : (
        <Info size={18} />
      )}
      <span>{message}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="お知らせを閉じる">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function TabButton({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  const accessibleLabel = [
    label,
    label === "プロフィール" ? "自分" : "",
    badge ? `未読${badge}件` : "",
  ]
    .filter(Boolean)
    .join("、");
  return (
    <button
      className={`tab-button ${active ? "active" : ""}`}
      type="button"
      aria-label={accessibleLabel}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {icon}
      <span data-short-label={label === "プロフィール" ? "自分" : undefined}>
        {label}
      </span>
      {badge ? <b aria-hidden="true">{badge > 99 ? "99+" : badge}</b> : null}
    </button>
  );
}

export function LoadingScreen() {
  return (
    <main
      className="loading-screen"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <BrandMark large />
      <Loader2 size={20} className="spin" />
      <span>Aizu Connectを準備しています</span>
    </main>
  );
}
