import type {
  ChatMessage,
  ChatReadReceipt,
  ChatRoom,
} from "../../../types/domain";

export type MessagesTabProps = {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  messages: ChatMessage[];
  hasMoreRooms?: boolean;
  hasOlderMessages?: boolean;
  draft: string;
  unreadCounts?: Record<string, number>;
  readReceipts?: ChatReadReceipt[];
  mutedRoomIds?: string[];
  onSelectRoom: (roomId: string) => void;
  onCloseRoom?: () => void;
  onLoadMoreRooms?: () => void;
  onLoadOlder?: () => void;
  onToggleMute?: (roomId: string) => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onUploadAttachment?: (file: File) => Promise<void> | void;
  onReportMessage?: (message: ChatMessage) => void;
  onEditMessage?: (message: ChatMessage, text: string) => Promise<void>;
  onDeleteMessage?: (message: ChatMessage) => Promise<void>;
  onSaveRoomMeta?: (
    room: ChatRoom,
    updates: Pick<ChatRoom, "pinnedMessage" | "organizerNotice">,
  ) => Promise<void>;
  currentUserId: string;
  currentUserRole: "student" | "organization";
  onOpenActivity?: () => void;
  onOpenEvent?: (eventId: string) => void;
};
