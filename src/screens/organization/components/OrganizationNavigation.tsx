import {
  CalendarDays,
  MessageCircle,
  Plus,
  Settings,
  UsersRound,
} from "lucide-react";

export function OrganizationNavigation({
  eventCount,
  hasSelectedEvent,
  pendingApplicantCount,
  unreadChatTotal,
  onCreate,
  onEvents,
  onApplicants,
  onMessages,
  onSettings,
}: {
  eventCount: number;
  hasSelectedEvent: boolean;
  pendingApplicantCount: number;
  unreadChatTotal: number;
  onCreate: () => void;
  onEvents: () => void;
  onApplicants: () => void;
  onMessages: () => void;
  onSettings: () => void;
}) {
  return (
    <nav className="management-nav" aria-label="企画管理メニュー">
      <NavigationButton
        icon={<Plus size={18} />}
        title="企画作成"
        detail="テンプレートから作る"
        onClick={onCreate}
      />
      <NavigationButton
        icon={<CalendarDays size={18} />}
        title="イベント"
        detail={`${eventCount}件を管理`}
        onClick={onEvents}
      />
      <NavigationButton
        icon={<UsersRound size={18} />}
        title="参加者"
        detail={
          hasSelectedEvent
            ? `確認待ち ${pendingApplicantCount}件`
            : "イベントを選択"
        }
        onClick={onApplicants}
      />
      <NavigationButton
        icon={<MessageCircle size={18} />}
        title="全体チャット"
        detail={unreadChatTotal > 0 ? `未読 ${unreadChatTotal}件` : "未読なし"}
        onClick={onMessages}
      />
      <NavigationButton
        icon={<Settings size={18} />}
        title="設定"
        detail="アカウント管理"
        onClick={onSettings}
      />
    </nav>
  );
}

function NavigationButton({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}>
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </button>
  );
}
