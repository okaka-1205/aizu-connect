import {
  ChevronRight,
  History,
  Search,
  UsersRound,
  VolumeX,
} from "lucide-react";
import { memo, useMemo } from "react";
import { formatChatTime, timestampMillis } from "../../../lib/eventUtils";
import type { ChatRoom } from "../../../types/domain";
import type { MessagesTabProps } from "./types";

type ConversationListProps = Pick<
  MessagesTabProps,
  | "rooms"
  | "activeRoomId"
  | "hasMoreRooms"
  | "unreadCounts"
  | "mutedRoomIds"
  | "onSelectRoom"
  | "onLoadMoreRooms"
> & {
  roomSearch: string;
  unreadOnly: boolean;
  onRoomSearchChange: (query: string) => void;
  onUnreadOnlyChange: (unreadOnly: boolean) => void;
  getRoomAudience: (room: ChatRoom) => string;
};

export const ConversationList = memo(function ConversationList({
  rooms,
  activeRoomId,
  hasMoreRooms,
  unreadCounts = {},
  mutedRoomIds = [],
  onSelectRoom,
  onLoadMoreRooms,
  roomSearch,
  unreadOnly,
  onRoomSearchChange,
  onUnreadOnlyChange,
  getRoomAudience,
}: ConversationListProps) {
  const visibleRooms = useMemo(() => {
    const normalized = roomSearch.trim().toLowerCase();
    return rooms
      .filter((room) => !unreadOnly || Boolean(unreadCounts[room.id]))
      .filter(
        (room) =>
          !normalized ||
          [
            room.eventTitle,
            room.studentName ?? "",
            room.organizationName,
            room.lastMessageText,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalized),
      )
      .sort(
        (left, right) =>
          timestampMillis(right.lastMessageAt) -
          timestampMillis(left.lastMessageAt),
      );
  }, [rooms, roomSearch, unreadOnly, unreadCounts]);
  const getRoomSubtitle = (room: ChatRoom) =>
    room.eventTitle + " · 全体チャット";
  return (
    <div className="conversation-list">
      <div className="conversation-tools">
        <div className="conversation-search">
          <Search size={14} />
          <input
            aria-label="チャットを検索"
            placeholder="イベント名で検索"
            value={roomSearch}
            onChange={(event) => onRoomSearchChange(event.target.value)}
          />
        </div>
        <div className="conversation-filters">
          <button
            className={!unreadOnly ? "active" : ""}
            type="button"
            aria-pressed={!unreadOnly}
            onClick={() => onUnreadOnlyChange(false)}
          >
            すべて
          </button>
          <button
            className={unreadOnly ? "active" : ""}
            type="button"
            aria-pressed={unreadOnly}
            onClick={() => onUnreadOnlyChange(true)}
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
            onClick={() => onSelectRoom(room.id)}
          >
            <div className="conversation-avatar">
              <UsersRound size={19} />
            </div>
            <div>
              <strong>{getRoomAudience(room)}</strong>
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
      {hasMoreRooms && onLoadMoreRooms && (
        <button
          className="conversation-load-more"
          type="button"
          onClick={onLoadMoreRooms}
        >
          <History size={15} />
          過去のチャットをさらに50件読み込む
        </button>
      )}
    </div>
  );
});
