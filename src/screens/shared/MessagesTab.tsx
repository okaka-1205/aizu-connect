import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageCircle,
  MessageSquareText,
  Paperclip,
  Pin,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import type {
  ChatMessage,
  ChatReadReceipt,
  ChatRoom,
} from "../../types/domain";

import { ConversationList } from "./messages/ConversationList";
import { MessageHistory } from "./messages/MessageHistory";
import type { MessagesTabProps } from "./messages/types";

const EMPTY_UNREAD_COUNTS: Record<string, number> = {};
const EMPTY_READ_RECEIPTS: ChatReadReceipt[] = [];
const EMPTY_MUTED_ROOM_IDS: string[] = [];

export function MessagesTab({
  rooms,
  activeRoomId,
  messages,
  hasMoreRooms = false,
  hasOlderMessages = false,
  draft,
  unreadCounts = EMPTY_UNREAD_COUNTS,
  readReceipts = EMPTY_READ_RECEIPTS,
  mutedRoomIds = EMPTY_MUTED_ROOM_IDS,
  onSelectRoom,
  onCloseRoom,
  onLoadMoreRooms,
  onLoadOlder,
  onToggleMute,
  onDraftChange,
  onSend,
  onUploadAttachment,
  onReportMessage,
  onEditMessage,
  onDeleteMessage,
  onSaveRoomMeta,
  currentUserId,
  currentUserRole,
  onOpenActivity,
  onOpenEvent,
}: MessagesTabProps) {
  const eventRooms = useMemo(
    () => rooms.filter((room) => room.roomType === "event"),
    [rooms],
  );
  const activeRoom = useMemo(
    () => eventRooms.find((room) => room.id === activeRoomId),
    [eventRooms, activeRoomId],
  );
  const [pinnedDraft, setPinnedDraft] = useState("");
  const [noticeDraft, setNoticeDraft] = useState("");
  const [isMetaEditing, setIsMetaEditing] = useState(false);
  const [isMetaSaving, setIsMetaSaving] = useState(false);
  const [roomSearch, setRoomSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentInputKey, setAttachmentInputKey] = useState(0);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [messageToDelete, setMessageToDelete] = useState<ChatMessage | null>(
    null,
  );
  const getRoomAudience = useCallback(
    (room: ChatRoom) =>
      currentUserRole === "organization"
        ? "参加者全員"
        : "主催：" + room.organizationName,
    [currentUserRole],
  );
  const messagePlaceholder = "全体チャットにメッセージを送る";
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = draft
      ? `${Math.min(textarea.scrollHeight, 128)}px`
      : "";
  }, [activeRoom?.id, draft]);

  useEffect(() => {
    setPinnedDraft(activeRoom?.pinnedMessage ?? "");
    setNoticeDraft(activeRoom?.organizerNotice ?? "");
    setIsMetaEditing(false);
  }, [activeRoom?.id, activeRoom?.organizerNotice, activeRoom?.pinnedMessage]);
  return (
    <>
      <section className="tab-page">
        <div className="page-title">
          <div>
            <h1>メッセージ</h1>
            <p>イベント参加者全員への連絡を確認できます。</p>
          </div>
          <div className="message-count">
            <MessageCircle size={20} />
            <span>
              <strong>{eventRooms.length}</strong>件の全体チャット
            </span>
          </div>
        </div>
        {eventRooms.length === 0 ? (
          <div className="message-empty">
            <MessageSquareText size={32} />
            <h3>まだメッセージはありません</h3>
            <p>イベントに参加申請すると、全体チャットがここに表示されます。</p>
          </div>
        ) : (
          <div
            className={`conversation-layout ${activeRoom ? "has-active-room" : "no-active-room"}`}
          >
            <ConversationList
              rooms={eventRooms}
              activeRoomId={activeRoomId}
              hasMoreRooms={hasMoreRooms}
              unreadCounts={unreadCounts}
              mutedRoomIds={mutedRoomIds}
              onSelectRoom={onSelectRoom}
              onLoadMoreRooms={onLoadMoreRooms}
              roomSearch={roomSearch}
              unreadOnly={unreadOnly}
              onRoomSearchChange={setRoomSearch}
              onUnreadOnlyChange={setUnreadOnly}
              getRoomAudience={getRoomAudience}
            />
            {activeRoom && (
              <div className="chat-panel">
                <div className="chat-panel-head">
                  <div className="chat-panel-title">
                    <button
                      className="icon-button mobile-chat-back"
                      type="button"
                      title="チャット一覧へ戻る"
                      aria-label="チャット一覧へ戻る"
                      onClick={() => onCloseRoom?.()}
                    >
                      <ChevronLeft size={17} />
                    </button>
                    <div>
                      <span>全体チャット</span>
                      <strong>{activeRoom.eventTitle}</strong>
                    </div>
                  </div>
                  <div className="chat-head-actions">
                    <small
                      className="chat-counterpart"
                      title={getRoomAudience(activeRoom)}
                    >
                      {getRoomAudience(activeRoom)}
                    </small>
                    {onOpenEvent && (
                      <button
                        className="chat-action-button"
                        type="button"
                        title="イベント詳細"
                        aria-label="イベント詳細を開く"
                        onClick={() => onOpenEvent(activeRoom.eventId)}
                      >
                        <CalendarDays size={15} />
                        <span>イベント</span>
                      </button>
                    )}
                    {onToggleMute && (
                      <button
                        className="chat-action-button"
                        type="button"
                        title={
                          mutedRoomIds.includes(activeRoom.id)
                            ? "通知をオン"
                            : "通知をオフ"
                        }
                        aria-label={
                          mutedRoomIds.includes(activeRoom.id)
                            ? "このチャットの通知をオンにする"
                            : "このチャットの通知をオフにする"
                        }
                        aria-pressed={mutedRoomIds.includes(activeRoom.id)}
                        onClick={() => onToggleMute(activeRoom.id)}
                      >
                        {mutedRoomIds.includes(activeRoom.id) ? (
                          <VolumeX size={15} />
                        ) : (
                          <Volume2 size={15} />
                        )}
                        <span>
                          {mutedRoomIds.includes(activeRoom.id)
                            ? "通知オン"
                            : "通知オフ"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
                {(activeRoom.pinnedMessage || activeRoom.organizerNotice) && (
                  <div className="chat-info-stack">
                    {activeRoom.pinnedMessage && (
                      <div className="chat-info-card">
                        <Pin size={15} />
                        <span>
                          <strong>固定メッセージ</strong>
                          <small>{activeRoom.pinnedMessage}</small>
                        </span>
                      </div>
                    )}
                    {activeRoom.organizerNotice && (
                      <div className="chat-info-card notice-card">
                        <Bell size={15} />
                        <span>
                          <strong>主催者からのお知らせ</strong>
                          <small>{activeRoom.organizerNotice}</small>
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {currentUserRole === "organization" &&
                  activeRoom.roomType === "event" &&
                  onSaveRoomMeta && (
                    <div className="chat-meta-editor">
                      {isMetaEditing ? (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            setIsMetaSaving(true);
                            void onSaveRoomMeta(activeRoom, {
                              pinnedMessage: pinnedDraft.trim().slice(0, 180),
                              organizerNotice: noticeDraft.trim().slice(0, 220),
                            }).finally(() => {
                              setIsMetaSaving(false);
                              setIsMetaEditing(false);
                            });
                          }}
                        >
                          <input
                            aria-label="固定メッセージ"
                            maxLength={180}
                            value={pinnedDraft}
                            placeholder="集合場所、持ち物などを固定"
                            onChange={(event) =>
                              setPinnedDraft(event.target.value)
                            }
                          />
                          <input
                            aria-label="主催者からのお知らせ"
                            maxLength={220}
                            value={noticeDraft}
                            placeholder="当日の変更や連絡事項"
                            onChange={(event) =>
                              setNoticeDraft(event.target.value)
                            }
                          />
                          <div className="row-actions">
                            <button type="submit" disabled={isMetaSaving}>
                              保存
                            </button>
                            <button
                              className="muted"
                              type="button"
                              onClick={() => setIsMetaEditing(false)}
                            >
                              閉じる
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsMetaEditing(true)}
                        >
                          <Pin size={15} />
                          固定メッセージ・お知らせを編集
                        </button>
                      )}
                    </div>
                  )}
                {onOpenActivity && (
                  <button
                    className="chat-activity-link"
                    type="button"
                    onClick={onOpenActivity}
                  >
                    参加予定・活動実績を確認する
                    <ChevronRight size={15} />
                  </button>
                )}
                <MessageHistory
                  messages={messages}
                  hasOlderMessages={hasOlderMessages}
                  onLoadOlder={onLoadOlder}
                  readReceipts={readReceipts}
                  currentUserId={currentUserId}
                  onReportMessage={onReportMessage}
                  onEditMessage={onEditMessage}
                  editingMessageId={editingMessageId}
                  editingMessageText={editingMessageText}
                  onEditingMessageIdChange={setEditingMessageId}
                  onEditingMessageTextChange={setEditingMessageText}
                  onDeleteRequest={setMessageToDelete}
                  canDeleteMessage={Boolean(onDeleteMessage)}
                />
                <form
                  className="chat-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSend();
                  }}
                >
                  {onUploadAttachment && (
                    <label
                      className="chat-attachment-button"
                      title="画像・資料を添付"
                    >
                      {isUploadingAttachment ? (
                        <Loader2 size={17} className="spin" />
                      ) : (
                        <Paperclip size={17} />
                      )}
                      <input
                        key={attachmentInputKey}
                        type="file"
                        disabled={
                          activeRoom.status !== "active" ||
                          isUploadingAttachment
                        }
                        accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          setIsUploadingAttachment(true);
                          Promise.resolve(onUploadAttachment(file)).finally(
                            () => {
                              setIsUploadingAttachment(false);
                              setAttachmentInputKey((current) => current + 1);
                            },
                          );
                        }}
                      />
                    </label>
                  )}
                  <textarea
                    ref={composerRef}
                    aria-label={messagePlaceholder}
                    value={draft}
                    maxLength={2000}
                    rows={1}
                    disabled={activeRoom.status !== "active"}
                    placeholder={
                      activeRoom.status === "active"
                        ? messagePlaceholder
                        : "このチャットは終了しています"
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key !== "Enter" ||
                        event.shiftKey ||
                        event.nativeEvent.isComposing
                      )
                        return;
                      event.preventDefault();
                      if (draft.trim()) onSend();
                    }}
                    onChange={(event) => onDraftChange(event.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={activeRoom.status !== "active" || !draft.trim()}
                    title="送信"
                    aria-label="メッセージを送信"
                  >
                    <Send size={17} />
                  </button>
                  <small className="chat-compose-hint">
                    Enterで送信・Shift+Enterで改行
                  </small>
                </form>
              </div>
            )}
          </div>
        )}
      </section>
      {messageToDelete && onDeleteMessage && (
        <ConfirmDialog
          title="メッセージを削除しますか？"
          description="削除したメッセージの本文は表示されなくなります。編集履歴は安全管理のため保持される場合があります。"
          confirmLabel="メッセージを削除"
          danger
          onClose={() => setMessageToDelete(null)}
          onConfirm={() => {
            void onDeleteMessage(messageToDelete).then(() =>
              setMessageToDelete(null),
            );
          }}
        />
      )}
    </>
  );
}
