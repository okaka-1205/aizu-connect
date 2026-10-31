import { CheckCircle2, ChevronRight, Compass, LogOut, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Field } from "../../components/Field";
import { BrandMark } from "../../components/ui/AppPrimitives";
import { useDialogAccessibility } from "../../hooks/useDialogAccessibility";

export function RoleShell({
  title,
  subtitle,
  icon,
  onHome,
  onClose,
  onLogout,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  onHome: () => void;
  onClose?: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  return (
    <div className="role-shell">
      <a className="skip-link" href="#role-main">
        管理内容へ移動
      </a>
      <header className="role-header">
        <button
          className="brand-lockup"
          type="button"
          onClick={onHome}
          aria-label="ダッシュボードのホームへ戻る"
        >
          <BrandMark />
          <span>
            <strong>Aizu Connect</strong>
            <small>{subtitle}</small>
          </span>
        </button>
        <div className={`role-header-user${onClose ? " has-home-action" : ""}`}>
          {icon}
          <strong title={title}>{title}</strong>
          {onClose && (
            <button
              className="secondary-action compact-action"
              type="button"
              onClick={onClose}
            >
              アプリへ戻る
            </button>
          )}
          <button
            className="icon-button"
            title="ログアウト"
            aria-label="ログアウト"
            type="button"
            onClick={onLogout}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <main className="role-content" id="role-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

export function EmptyRoleState({ text }: { text: string }) {
  return (
    <div className="empty-role-state">
      <Compass size={22} />
      <span>{text}</span>
    </div>
  );
}

export function QueuePagination({
  label,
  loadedCount,
  pageSize,
  hasMore,
  disabled,
  onLoadMore,
}: {
  label: string;
  loadedCount: number;
  pageSize: number;
  hasMore: boolean;
  disabled: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className={`queue-pagination ${hasMore ? "" : "is-complete"}`}>
      <span>
        <strong>{loadedCount}件</strong>
        <small>{label}を読み込み済み</small>
      </span>
      {hasMore ? (
        <button type="button" disabled={disabled} onClick={onLoadMore}>
          さらに{pageSize}件
          <ChevronRight size={14} />
        </button>
      ) : (
        <em>
          <CheckCircle2 size={14} />
          全件表示
        </em>
      )}
    </div>
  );
}

export function ActionReasonDialog({
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  danger = false,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  label: string;
  placeholder: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const dialogRef = useDialogAccessibility<HTMLFormElement>(onClose);
  return createPortal(
    <div className="report-backdrop" role="presentation" onClick={onClose}>
      <form
        ref={dialogRef}
        className="report-dialog action-reason-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="action-reason-title"
        tabIndex={-1}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          const normalized = reason.trim();
          if (!normalized) return;
          onConfirm(normalized);
        }}
      >
        <div className="report-dialog-head">
          <div>
            <h2 id="action-reason-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="閉じる"
            data-dialog-initial-focus
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <p>{description}</p>
        <Field label={label}>
          <textarea
            required
            minLength={5}
            maxLength={1000}
            value={reason}
            placeholder={placeholder}
            onChange={(changeEvent) => setReason(changeEvent.target.value)}
          />
        </Field>
        <div className="report-dialog-actions">
          <button className="text-button" type="button" onClick={onClose}>
            キャンセル
          </button>
          <button
            className={danger ? "danger-action" : "primary-action"}
            type="submit"
            disabled={reason.trim().length < 5}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
