import { Bell, Flag, Loader2, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Field } from "../../components/Field";
import { useDialogAccessibility } from "../../hooks/useDialogAccessibility";
import { getFirebaseErrorMessage } from "../../lib/appLogic";
import { EmptyRoleState } from "../shared/RoleScreenPrimitives";
import type { NotificationItem, ReportTarget } from "../../types/domain";
import {
  formatChatTime as formatNotificationTime,
  timestampMillis,
} from "../../lib/eventUtils";

export function NotificationPanel({
  notifications,
  unreadTotal,
  hasMore,
  onLoadMore,
  onClose,
  onRead,
  onReadAll,
}: {
  notifications: NotificationItem[];
  unreadTotal?: number;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onClose: (restoreFocus?: boolean) => void;
  onRead: (notification: NotificationItem) => Promise<void>;
  onReadAll: () => Promise<void>;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isReadingAll, setIsReadingAll] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [readError, setReadError] = useState("");

  useEffect(() => {
    panelRef.current?.focus();
  }, []);
  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        panelRef.current?.contains(target) ||
        target.closest('[aria-controls="notification-panel"]')
      )
        return;
      onClose(false);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    return () =>
      document.removeEventListener("pointerdown", dismissOutside, true);
  }, [onClose]);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const loadedUnreadCount = notifications.filter(
    (notification) => !notification.isRead,
  ).length;
  const unreadCount = unreadTotal ?? loadedUnreadCount;
  const visibleNotifications = unreadOnly
    ? notifications.filter((notification) => !notification.isRead)
    : notifications;
  const readAll = async () => {
    if (isReadingAll) return;
    setIsReadingAll(true);
    setReadError("");
    try {
      await onReadAll();
    } catch (error) {
      setReadError(getFirebaseErrorMessage(error));
    } finally {
      setIsReadingAll(false);
    }
  };
  const read = async (notification: NotificationItem) => {
    if (readingId) return;
    setReadingId(notification.id);
    setReadError("");
    try {
      await onRead(notification);
    } catch (error) {
      setReadError(getFirebaseErrorMessage(error));
    } finally {
      setReadingId(null);
    }
  };

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
          {unreadCount > 0 && <small>未読{unreadCount}件</small>}
        </div>
        {unreadCount > 0 && (
          <button
            className="notification-read-all"
            type="button"
            disabled={isReadingAll || Boolean(readingId)}
            aria-busy={isReadingAll}
            onClick={() => void readAll()}
          >
            {isReadingAll ? "更新中…" : "すべて既読"}
          </button>
        )}
        <button
          className="icon-button"
          title="通知パネルを閉じる"
          aria-label="通知パネルを閉じる"
          type="button"
          onClick={() => onClose()}
        >
          <X size={17} />
        </button>
      </div>
      <div className="notification-filter-row">
        <button
          className={unreadOnly ? "active" : ""}
          type="button"
          aria-pressed={unreadOnly}
          onClick={() => setUnreadOnly((current) => !current)}
        >
          未読のみ
        </button>
      </div>
      {readError && (
        <p className="inline-error" role="alert">
          {readError}
        </p>
      )}
      {visibleNotifications.length === 0 ? (
        <EmptyRoleState
          text={
            unreadOnly ? "未読の通知はありません。" : "新しい通知はありません。"
          }
        />
      ) : (
        <div className="notification-list">
          {visibleNotifications.map((notification, index) => {
            const millis = timestampMillis(notification.createdAt);
            const group = millis >= todayStart.getTime() ? "今日" : "過去";
            const previous = visibleNotifications[index - 1];
            const previousGroup = previous
              ? timestampMillis(previous.createdAt) >= todayStart.getTime()
                ? "今日"
                : "過去"
              : null;
            return (
              <Fragment key={notification.id}>
                {group !== previousGroup && (
                  <h3 className="notification-group-label">{group}</h3>
                )}
                <button
                  className={`notification-item ${notification.isRead ? "" : "unread"}`}
                  type="button"
                  disabled={Boolean(readingId) || isReadingAll}
                  aria-busy={readingId === notification.id}
                  onClick={() => void read(notification)}
                >
                  <span className="notification-icon">
                    {readingId === notification.id ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Bell size={15} />
                    )}
                  </span>
                  <span>
                    <strong>{notification.title}</strong>
                    <small>{notification.body}</small>
                    <time>
                      {millis
                        ? formatNotificationTime(notification.createdAt)
                        : "日時不明"}
                    </time>
                  </span>
                </button>
              </Fragment>
            );
          })}
        </div>
      )}
      {hasMore && onLoadMore && (
        <button
          className="notification-load-more secondary-action"
          type="button"
          onClick={onLoadMore}
        >
          過去の通知をさらに30件読み込む
        </button>
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
