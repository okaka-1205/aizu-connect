import { Bell, Flag, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Field } from "../../components/Field";
import { useDialogAccessibility } from "../../hooks/useDialogAccessibility";
import { EmptyRoleState } from "../shared/RoleScreenPrimitives";
import type { NotificationItem, ReportTarget } from "../../types/domain";

export function NotificationPanel({
  notifications,
  hasMore,
  onLoadMore,
  onClose,
  onRead,
}: {
  notifications: NotificationItem[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  onClose: () => void;
  onRead: (notification: NotificationItem) => Promise<void>;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <aside
      ref={panelRef}
      className="notification-panel"
      id="notification-panel"
      aria-label="通知"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="notification-panel-head">
        <div>
          <h2>通知</h2>
        </div>
        <button
          className="icon-button"
          title="通知パネルを閉じる"
          aria-label="通知パネルを閉じる"
          type="button"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      {notifications.length === 0 ? (
        <EmptyRoleState text="新しい通知はありません。" />
      ) : (
        <div className="notification-list">
          {notifications.map((notification) => (
            <button
              className={`notification-item ${notification.isRead ? "" : "unread"}`}
              key={notification.id}
              type="button"
              onClick={() => void onRead(notification)}
            >
              <span className="notification-icon">
                <Bell size={15} />
              </span>
              <span>
                <strong>{notification.title}</strong>
                <small>{notification.body}</small>
              </span>
            </button>
          ))}
          {hasMore && onLoadMore && (
            <button type="button" onClick={onLoadMore}>
              過去の通知をさらに30件読み込む
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

export function ReportDialog({
  target,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  target: ReportTarget;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (reason: string, description: string) => void;
}) {
  const [reason, setReason] = useState("不適切な内容");
  const [description, setDescription] = useState("");
  const dialogRef = useDialogAccessibility<HTMLFormElement>(onClose);
  return createPortal(
    <div className="report-backdrop" role="presentation" onClick={onClose}>
      <form
        ref={dialogRef}
        className="report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(reason, description);
        }}
      >
        <div className="report-dialog-head">
          <div>
            <h2 id="report-dialog-title">通報する</h2>
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
        <p className="report-target">対象：{target.title}</p>
        <Field label="理由">
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            <option>不適切な内容</option>
            <option>迷惑行為・スパム</option>
            <option>個人情報が含まれている</option>
            <option>詐欺・危険な勧誘</option>
            <option>その他</option>
          </select>
        </Field>
        <Field label="詳細（任意）">
          <textarea
            value={description}
            maxLength={1000}
            placeholder="気になった点を入力してください"
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="report-dialog-actions">
          <button className="text-button" type="button" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="primary-action"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Flag size={16} />
            )}
            通報を送信
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
