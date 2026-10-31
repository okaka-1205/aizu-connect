import {
  Download,
  FileText,
  Flag,
  History,
  Pencil,
  Trash2,
} from "lucide-react";
import { memo } from "react";
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
      <div className="chat-messages" role="region" aria-label="メッセージ履歴">
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
                        void onEditMessage(
                          chatMessage,
                          editingMessageText,
                        ).then(() => onEditingMessageIdChange(null));
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
                          window.requestAnimationFrame(() => {
                            const messageBlock =
                              document.querySelector<HTMLElement>(
                                `[data-message-id="${CSS.escape(chatMessage.id)}"]`,
                              );
                            messageBlock
                              ?.querySelector<HTMLElement>(
                                '[aria-label="メッセージを編集"]',
                              )
                              ?.focus();
                          });
                        }}
                        onChange={(event) =>
                          onEditingMessageTextChange(event.target.value)
                        }
                      />
                      <button type="submit">保存</button>
                    </form>
                  ) : chatMessage.type !== "file" ? (
                    <p>{chatMessage.text}</p>
                  ) : null}
                  <small className="chat-message-time">
                    {formatChatTime(chatMessage.createdAt)}
                    {chatMessage.editedAt ? " · 編集済み" : ""}
                    {isRead ? " · 既読" : ""}
                  </small>
                  {isOwn &&
                    chatMessage.type === "text" &&
                    !chatMessage.deletedAt && (
                      <div
                        className="message-owner-actions"
                        aria-label="送信したメッセージの操作"
                      >
                        {onEditMessage && (
                          <button
                            type="button"
                            aria-label="メッセージを編集"
                            onClick={() => {
                              onEditingMessageIdChange(chatMessage.id);
                              onEditingMessageTextChange(chatMessage.text);
                            }}
                          >
                            <Pencil size={12} />
                            編集
                          </button>
                        )}
                        {canDeleteMessage && (
                          <button
                            type="button"
                            aria-label="メッセージを削除"
                            onClick={() => onDeleteRequest(chatMessage)}
                          >
                            <Trash2 size={12} />
                            削除
                          </button>
                        )}
                      </div>
                    )}
                  {chatMessage.senderId !== currentUserId &&
                    chatMessage.type !== "system" &&
                    onReportMessage && (
                      <div
                        className="message-moderation-actions"
                        aria-label={`${chatMessage.senderName}さんのメッセージ操作`}
                      >
                        {onReportMessage && (
                          <button
                            type="button"
                            aria-label={`${chatMessage.senderName}さんのメッセージを通報`}
                            onClick={() => onReportMessage(chatMessage)}
                          >
                            <Flag size={13} aria-hidden="true" />
                            通報
                          </button>
                        )}
                      </div>
                    )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
});
