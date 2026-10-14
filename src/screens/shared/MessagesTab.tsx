import {
  Bell,
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Flag,
  History,
  Loader2,
  MessageCircle,
  MessageSquareText,
  Paperclip,
  Pin,
  Pencil,
  Search,
  Send,
  Trash2,
  UserRound,
  UsersRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  formatChatDay,
  formatChatTime,
  preferredScrollBehavior,
  timestampMillis,
} from "../../lib/eventUtils";
import type {
  ChatMessage,
  ChatReadReceipt,
  ChatRoom,
} from "../../types/domain";

export function MessagesTab({
  rooms,
  activeRoomId,
  messages,
  hasOlderMessages = false,
  draft,
  unreadCounts = {},
  readReceipts = [],
  mutedRoomIds = [],
  onSelectRoom,
  onLoadOlder,
  onToggleMute,
  onDraftChange,
  onSend,
  onUploadAttachment,
  onReportMessage,
  onEditMessage,
  onDeleteMessage,
  onBlockUser,
  onSaveRoomMeta,
  currentUserId,
  currentUserRole,
  onOpenActivity,
  onOpenEvent,
}: {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  messages: ChatMessage[];
  hasOlderMessages?: boolean;
  draft: string;
  unreadCounts?: Record<string, number>;
  readReceipts?: ChatReadReceipt[];
  mutedRoomIds?: string[];
  onSelectRoom: (roomId: string) => void;
  onLoadOlder?: () => void;
  onToggleMute?: (roomId: string) => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onUploadAttachment?: (file: File) => Promise<void> | void;
  onReportMessage?: (message: ChatMessage) => void;
  onEditMessage?: (message: ChatMessage, text: string) => Promise<void>;
  onDeleteMessage?: (message: ChatMessage) => Promise<void>;
  onBlockUser?: (message: ChatMessage) => Promise<void>;
  onSaveRoomMeta?: (
    room: ChatRoom,
    updates: Pick<ChatRoom, "pinnedMessage" | "organizerNotice">,
  ) => Promise<void>;
  currentUserId: string;
  currentUserRole: "student" | "organization";
  onOpenActivity?: () => void;
  onOpenEvent?: (eventId: string) => void;
}) {
  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const newestMessage = messages[messages.length - 1];
  const [pinnedDraft, setPinnedDraft] = useState("");
  const [noticeDraft, setNoticeDraft] = useState("");
  const [isMetaEditing, setIsMetaEditing] = useState(false);
  const [isMetaSaving, setIsMetaSaving] = useState(false);
  const [roomTypeFilter, setRoomTypeFilter] = useState<
    "all" | "event" | "application"
  >("all");
  const [roomSearch, setRoomSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentInputKey, setAttachmentInputKey] = useState(0);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const conversationListRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const selectRoom = (roomId: string) => {
    onSelectRoom(roomId);
    if (window.matchMedia("(max-width: 620px)").matches) {
      window.requestAnimationFrame(() =>
        chatPanelRef.current?.scrollIntoView({
          behavior: preferredScrollBehavior(),
          block: "start",
        }),
      );
    }
  };
  const getCounterpartName = (room: ChatRoom) =>
    room.roomType === "event"
      ? "イベント全体"
      : currentUserRole === "organization"
        ? room.studentName || "参加学生"
        : room.organizationName;
  const getRoomSubtitle = (room: ChatRoom) =>
    room.roomType === "event"
      ? `${room.eventTitle} · 全体チャット`
      : room.eventTitle;
  const messagePlaceholder =
    activeRoom?.roomType === "event"
      ? "全体チャットにメッセージを送る"
      : currentUserRole === "organization"
        ? "参加者にメッセージを送る"
        : "主催者にメッセージを送る";
  const visibleRooms = [...rooms]
    .filter(
      (room) => roomTypeFilter === "all" || room.roomType === roomTypeFilter,
    )
    .filter((room) => !unreadOnly || Boolean(unreadCounts[room.id]))
    .filter((room) => {
      const normalized = roomSearch.trim().toLowerCase();
      return (
        !normalized ||
        [
          room.eventTitle,
          room.studentName ?? "",
          room.organizationName,
          room.lastMessageText,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized)
      );
    })
    .sort(
      (left, right) =>
        timestampMillis(right.lastMessageAt) -
        timestampMillis(left.lastMessageAt),
    );
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
  useEffect(() => {
    setPinnedDraft(activeRoom?.pinnedMessage ?? "");
    setNoticeDraft(activeRoom?.organizerNotice ?? "");
    setIsMetaEditing(false);
  }, [activeRoom?.id, activeRoom?.organizerNotice, activeRoom?.pinnedMessage]);
  return (
    <section className="tab-page">
      <div className="page-title">
        <div>
          <h1>メッセージ</h1>
          <p>イベントの主催者との連絡を確認できます。</p>
        </div>
        <div className="message-count">
          <MessageCircle size={20} />
          <strong>{rooms.length}</strong>
        </div>
      </div>
      {rooms.length === 0 ? (
        <div className="message-empty">
          <MessageSquareText size={32} />
          <h3>まだメッセージはありません</h3>
          <p>
            イベントに参加申請すると、主催者との連絡スペースがここにできます。
          </p>
        </div>
      ) : (
        <div className="conversation-layout">
          <div className="conversation-list" ref={conversationListRef}>
            <div className="conversation-tools">
              <div className="conversation-search">
                <Search size={14} />
                <input
                  aria-label="チャットを検索"
                  placeholder="イベント・参加者を検索"
                  value={roomSearch}
                  onChange={(event) => setRoomSearch(event.target.value)}
                />
              </div>
              <div
                className="conversation-filters"
                role="group"
                aria-label="チャット種別"
              >
                {(
                  [
                    ["all", "すべて"],
                    ["event", "全体"],
                    ["application", "個別"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    className={roomTypeFilter === value ? "active" : ""}
                    type="button"
                    key={value}
                    aria-pressed={roomTypeFilter === value}
                    onClick={() => setRoomTypeFilter(value)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  className={unreadOnly ? "active" : ""}
                  type="button"
                  aria-pressed={unreadOnly}
                  onClick={() => setUnreadOnly((current) => !current)}
                >
                  未読
                </button>
              </div>
            </div>
            {visibleRooms.length === 0 ? (
              <div className="conversation-no-results">
                <Search size={18} />
                条件に合うチャットはありません
              </div>
            ) : (
              visibleRooms.map((room) => (
                <button
                  className={`conversation-item ${room.id === activeRoomId ? "active" : ""}`}
                  key={room.id}
                  type="button"
                  aria-pressed={room.id === activeRoomId}
                  onClick={() => selectRoom(room.id)}
                >
                  <div className="conversation-avatar">
                    {room.roomType === "event" ? (
                      <UsersRound size={19} />
                    ) : (
                      <UserRound size={19} />
                    )}
                  </div>
                  <div>
                    <strong>{getCounterpartName(room)}</strong>
                    <span>{getRoomSubtitle(room)}</span>
                    <small>{room.lastMessageText}</small>
                    <time>{formatChatTime(room.lastMessageAt)}</time>
                  </div>
                  {mutedRoomIds.includes(room.id) && <VolumeX size={14} />}
                  {unreadCounts[room.id] ? (
                    <em className="unread-badge">{unreadCounts[room.id]}</em>
                  ) : null}
                  <ChevronRight size={17} />
                </button>
              ))
            )}
          </div>
          {activeRoom && (
            <div className="chat-panel" ref={chatPanelRef}>
              <div className="chat-panel-head">
                <div className="chat-panel-title">
                  <button
                    className="icon-button mobile-chat-back"
                    type="button"
                    title="チャット一覧へ戻る"
                    aria-label="チャット一覧へ戻る"
                    onClick={() =>
                      conversationListRef.current?.scrollIntoView({
                        behavior: preferredScrollBehavior(),
                        block: "start",
                      })
                    }
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <div>
                    <span>
                      {activeRoom.roomType === "event"
                        ? "全体チャット"
                        : "個別チャット"}
                    </span>
                    <strong>{activeRoom.eventTitle}</strong>
                  </div>
                </div>
                <div className="chat-head-actions">
                  <small>{getCounterpartName(activeRoom)}</small>
                  {onOpenEvent && (
                    <button
                      className="icon-button"
                      type="button"
                      title="イベント詳細"
                      aria-label="イベント詳細を開く"
                      onClick={() => onOpenEvent(activeRoom.eventId)}
                    >
                      <CalendarDays size={15} />
                    </button>
                  )}
                  {onToggleMute && (
                    <button
                      className="icon-button"
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
                      index > 0
                        ? formatChatDay(messages[index - 1].createdAt)
                        : "";
                    const isOwn = chatMessage.senderId === currentUserId;
                    const isRead =
                      isOwn &&
                      index === lastOwnMessageIndex &&
                      otherReadAt >= timestampMillis(chatMessage.createdAt);
                    return (
                      <div className="chat-message-block" key={chatMessage.id}>
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
                          {chatMessage.type === "file" &&
                            chatMessage.attachmentUrl && (
                              <a
                                className="chat-file-link"
                                href={chatMessage.attachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <FileText size={15} />
                                {chatMessage.attachmentName || chatMessage.text}
                                <Download size={13} />
                              </a>
                            )}
                          {editingMessageId === chatMessage.id ? (
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                if (!onEditMessage || !editingMessageText.trim()) return;
                                void onEditMessage(
                                  chatMessage,
                                  editingMessageText,
                                ).then(() => setEditingMessageId(null));
                              }}
                            >
                              <input
                                aria-label="メッセージを編集"
                                maxLength={2000}
                                value={editingMessageText}
                                onChange={(event) =>
                                  setEditingMessageText(event.target.value)
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
                              <span className="message-owner-actions">
                                {onEditMessage && (
                                  <button
                                    type="button"
                                    aria-label="メッセージを編集"
                                    onClick={() => {
                                      setEditingMessageId(chatMessage.id);
                                      setEditingMessageText(chatMessage.text);
                                    }}
                                  >
                                    <Pencil size={12} />
                                  </button>
                                )}
                                {onDeleteMessage && (
                                  <button
                                    type="button"
                                    aria-label="メッセージを削除"
                                    onClick={() => void onDeleteMessage(chatMessage)}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </span>
                            )}
                          {chatMessage.senderId !== currentUserId &&
                            onReportMessage &&
                            chatMessage.type !== "system" && (
                              <button
                                className="message-report-button"
                                type="button"
                                title="メッセージを通報"
                                aria-label={`${chatMessage.senderName}さんのメッセージを通報`}
                                onClick={() => onReportMessage(chatMessage)}
                              >
                                <Flag size={12} />
                              </button>
                            )}
                          {chatMessage.senderId !== currentUserId &&
                            onBlockUser &&
                            chatMessage.type !== "system" && (
                              <button
                                className="message-report-button"
                                type="button"
                                title="このユーザーをブロック"
                                aria-label={`${chatMessage.senderName}さんをブロック`}
                                onClick={() => void onBlockUser(chatMessage)}
                              >
                                <Ban size={12} />
                              </button>
                            )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
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
                        activeRoom.status !== "active" || isUploadingAttachment
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
                <input
                  value={draft}
                  maxLength={2000}
                  disabled={activeRoom.status !== "active"}
                  placeholder={
                    activeRoom.status === "active"
                      ? messagePlaceholder
                      : "このチャットは終了しています"
                  }
                  onChange={(event) => onDraftChange(event.target.value)}
                />
                <button
                  type="submit"
                  disabled={activeRoom.status !== "active" || !draft.trim()}
                  title="送信"
                >
                  <Send size={17} />
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
