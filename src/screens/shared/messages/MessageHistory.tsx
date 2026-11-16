import {
  Download,
  FileText,
  Flag,
  History,
  Pencil,
  Trash2,
} from "lucide-react";
import { memo, useState } from "react";
import { ActionMenu } from "../../../components/ActionMenu";
import { getFirebaseErrorMessage } from "../../../lib/appLogic";
import {
  formatChatDay,
  formatChatTime,
  timestampMillis,
} from "../../../lib/eventUtils";
import type { ChatMessage } from "../../../types/domain";
import type { MessagesTabProps } from "./types";

type MessageHistoryProps = Pick<
  MessagesTabProps,
  | "messages"
  | "hasOlderMessages"
  | "onLoadOlder"
  | "readReceipts"
  | "currentUserId"
  | "onReportMessage"
  | "onEditMessage"
> & {
  editingMessageId: string | null;
  editingMessageText: string;
  onEditingMessageIdChange: (id: string | null) => void;
  onEditingMessageTextChange: (text: string) => void;
  onDeleteRequest: (message: ChatMessage) => void;
  canDeleteMessage: boolean;
};

export const MessageHistory = memo(function MessageHistory({
  messages,
  hasOlderMessages,
  onLoadOlder,
  readReceipts = [],
  currentUserId,
  onReportMessage,
  onEditMessage,
  editingMessageId,
  editingMessageText,
  onEditingMessageIdChange,
  onEditingMessageTextChange,
  onDeleteRequest,
  canDeleteMessage,
}: MessageHistoryProps) {
  const [editError, setEditError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const newestMessage = messages[messages.length - 1];
  const otherReadAt = Math.max(
    0,
    ...readReceipts
      .filter((receipt) => receipt.userId !== currentUserId)
      .map((receipt) => timestampMillis(receipt.readAt)),
  );
  const lastOwnMessageIndex = messages.findLastIndex(
    (chatMessage) =>
      chatMessage.senderId === currentUserId && chatMessage.type !== "system",
  );

  return (
    <>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {newestMessage
          ? `最新のメッセージ。${newestMessage.senderName}さん、${newestMessage.text || newestMessage.attachmentName || "添付ファイル"}`
          : ""}
      </div>
      <div
        className="chat-messages"
        data-menu-boundary
        role="region"
        aria-label="メッセージ履歴"
      >
        {hasOlderMessages && onLoadOlder && (
          <button
            className="chat-load-older"
            type="button"
            onClick={onLoadOlder}
          >
            <History size={15} />
            過去のメッセージを読み込む
          </button>
        )}
        {messages.length === 0 ? (
          <p className="chat-placeholder">
            最初のメッセージを送ってみましょう。
          </p>
        ) : (
          messages.map((chatMessage, index) => {
            const day = formatChatDay(chatMessage.createdAt);
            const previousDay =
              index > 0 ? formatChatDay(messages[index - 1]?.createdAt) : "";
            const isOwn = chatMessage.senderId === currentUserId;
            const restoreActionsFocus = () =>
              window.requestAnimationFrame(() => {
                document
                  .querySelector<HTMLElement>(
                    `[data-message-id="${CSS.escape(chatMessage.id)}"] .chat-message-actions-trigger`,
                  )
                  ?.focus();
              });
            const actions =
              isOwn && chatMessage.type === "text" && !chatMessage.deletedAt
                ? [
                    ...(onEditMessage
                      ? [
                          {
                            label: "編集",
                            accessibleLabel: "メッセージを編集",
                            icon: <Pencil size={16} />,
                            onSelect: () => {
                              onEditingMessageIdChange(chatMessage.id);
                              onEditingMessageTextChange(chatMessage.text);
                            },
                          },
                        ]
                      : []),
                    ...(canDeleteMessage
                      ? [
                          {
                            label: "削除",
                            accessibleLabel: "メッセージを削除",
                            icon: <Trash2 size={16} />,
                            danger: true,
                            onSelect: () => onDeleteRequest(chatMessage),
                          },
                        ]
                      : []),
                  ]
                : !isOwn && chatMessage.type !== "system" && onReportMessage
                  ? [
                      {
                        label: "通報",
                        accessibleLabel: `${chatMessage.senderName}さんのメッセージを通報`,
                        icon: <Flag size={16} />,
                        onSelect: () => onReportMessage(chatMessage),
                      },
                    ]
                  : [];
            const isRead =
              isOwn &&
              index === lastOwnMessageIndex &&
              otherReadAt >= timestampMillis(chatMessage.createdAt);
            return (
              <div
                className="chat-message-block"
                data-message-id={chatMessage.id}
                key={chatMessage.id}
              >
                {day && day !== previousDay && (
                  <div className="chat-date-separator">
                    <span>{day}</span>
                  </div>
                )}
                <div
                  className={`chat-message ${chatMessage.type === "system" ? "system" : isOwn ? "mine" : "theirs"}`}
                >
                  <span>{chatMessage.senderName}</span>
                  {chatMessage.type === "image" &&
                    chatMessage.attachmentUrl && (
                      <a
                        className="chat-image-link"
                        href={chatMessage.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={chatMessage.attachmentUrl}
                          alt={chatMessage.attachmentName || "添付画像"}
                        />
                      </a>
                    )}
                  {chatMessage.type === "file" && chatMessage.attachmentUrl && (
                    <a
                      className="chat-file-link"
                      href={chatMessage.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileText size={15} />
                      <span className="file-name">
                        {chatMessage.attachmentName || chatMessage.text}
                      </span>
                      <Download size={13} />
                    </a>
                  )}
                  {editingMessageId === chatMessage.id ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!onEditMessage || !editingMessageText.trim())
                          return;
                        setEditError(null);
                        void onEditMessage(chatMessage, editingMessageText)
                          .then(() => {
                            onEditingMessageIdChange(null);
                            restoreActionsFocus();
                          })
                          .catch((error) =>
                            setEditError({
                              id: chatMessage.id,
                              message: getFirebaseErrorMessage(error),
                            }),
                          );
                      }}
                    >
                      <input
                        aria-label="メッセージを編集"
                        autoFocus
                        maxLength={2000}
                        value={editingMessageText}
                        onKeyDown={(event) => {
                          if (event.key !== "Escape") return;
                          event.preventDefault();
                          onEditingMessageIdChange(null);
                          restoreActionsFocus();
                        }}
                        onChange={(event) =>
                          onEditingMessageTextChange(event.target.value)
                        }
                      />
                      <button type="submit">保存</button>
                      <button
                        type="button"
                        onClick={() => {
                          onEditingMessageIdChange(null);
                          restoreActionsFocus();
                        }}
                      >
                        キャンセル
                      </button>
                      {editError?.id === chatMessage.id && (
                        <small className="inline-error" role="alert">
                          {editError.message}
                        </small>
                      )}
                    </form>
                  ) : chatMessage.type !== "file" ? (
                    <p>{chatMessage.text}</p>
                  ) : null}
                  <div className="chat-message-meta">
                    <small className="chat-message-time">
                      {formatChatTime(chatMessage.createdAt)}
                      {chatMessage.editedAt ? " · 編集済み" : ""}
                      {isRead ? " · 既読" : ""}
                    </small>
                    {actions.length > 0 &&
                      editingMessageId !== chatMessage.id && (
                        <ActionMenu
                          label={
                            isOwn
                              ? "自分のメッセージ操作"
                              : `${chatMessage.senderName}さんのメッセージ操作`
                          }
                          actions={actions}
                        />
                      )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
});
