import {
  collection,
  collectionGroup,
  doc,
  documentId,
  getDocs,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { validateChatAttachment } from "../lib/appLogic";
import { uploadImage } from "../lib/storage";
import type {
  ChatMessage,
  ChatPreference,
  ChatReadReceipt,
  ChatRoom,
} from "../types/domain";

export const CHAT_ROOM_PAGE_SIZE = 50;
// One user document plus at most eight membership lookups stays within the
// Rules query access-call budget. Never truncate memberships before sorting.
const ROOM_QUERY_BATCH_SIZE = 8;

type ChatSender = Pick<ChatMessage, "senderId" | "senderName">;

const commitChatMessage = (
  roomId: string,
  sender: ChatSender,
  message: Pick<
    ChatMessage,
    | "type"
    | "text"
    | "attachmentUrl"
    | "attachmentName"
    | "attachmentType"
    | "attachmentSize"
  >,
  lastMessageText: string,
) => {
  const roomRef = doc(db, "chatRooms", roomId);
  const messageRef = doc(collection(roomRef, "messages"));
  const batch = writeBatch(db);
  batch.set(messageRef, {
    roomId,
    ...sender,
    ...message,
    createdAt: serverTimestamp(),
  });
  batch.update(roomRef, {
    lastMessageId: messageRef.id,
    lastMessageText,
    lastMessageAt: serverTimestamp(),
  });
  return batch.commit();
};

export const sendChatTextMessage = (
  roomId: string,
  sender: ChatSender,
  text: string,
) => commitChatMessage(roomId, sender, { type: "text", text }, text);

export const sendChatAttachment = async (
  roomId: string,
  sender: ChatSender,
  file: File,
) => {
  validateChatAttachment(file);
  const attachmentUrl = await uploadImage(
    file,
    `chat-attachments/${roomId}/${sender.senderId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
  );
  const type = file.type.startsWith("image/") ? "image" : "file";
  await commitChatMessage(
    roomId,
    sender,
    {
      type,
      text: file.name.slice(0, 200),
      attachmentUrl,
      attachmentName: file.name.slice(0, 200),
      attachmentType: file.type,
      attachmentSize: file.size,
    },
    `${type === "image" ? "画像" : "ファイル"}を送信しました`,
  );
};

export const loadChatPreferencesForRooms = async (
  userId: string,
  roomIds: string[],
) => {
  const uniqueRoomIds = Array.from(new Set(roomIds));
  const chunks = Array.from(
    { length: Math.ceil(uniqueRoomIds.length / 30) },
    (_, index) => uniqueRoomIds.slice(index * 30, index * 30 + 30),
  );
  const snapshots = await Promise.all(
    chunks.map((ids) =>
      getDocs(
        query(
          collection(db, "chatPreferences"),
          where("userId", "==", userId),
          where("roomId", "in", ids),
        ),
      ),
    ),
  );
  return snapshots.flatMap((snapshot) =>
    snapshot.docs.map(
      (preferenceDocument) => preferenceDocument.data() as ChatPreference,
    ),
  );
};

const mergeRooms = (roomLimit: number, ...roomGroups: ChatRoom[][]) =>
  Array.from(
    new Map(roomGroups.flat().map((room) => [room.id, room] as const)).values(),
  )
    .filter((room) => room.roomType === "event")
    .sort(
      (left, right) =>
        (right.lastMessageAt?.toMillis?.() ?? 0) -
        (left.lastMessageAt?.toMillis?.() ?? 0),
    )
    .slice(0, roomLimit);

export const subscribeChatRoomsForUser = (
  userId: string,
  onValue: (rooms: ChatRoom[], hasMore: boolean) => void,
  onError: (error: Error) => void,
  roomLimit = CHAT_ROOM_PAGE_SIZE,
) => {
  let membershipRooms: ChatRoom[] = [];
  let legacyRooms: ChatRoom[] = [];
  const membershipRoomsById = new Map<string, ChatRoom>();
  const roomUnsubscribers = new Map<string, () => void>();
  const emitRooms = () => {
    const rooms = mergeRooms(roomLimit + 1, membershipRooms, legacyRooms);
    onValue(rooms.slice(0, roomLimit), rooms.length > roomLimit);
  };

  const unsubscribeLegacyRooms = onSnapshot(
    query(
      collection(db, "chatRooms"),
      where("participantIds", "array-contains", userId),
    ),
    (snapshot) => {
      legacyRooms = snapshot.docs.map(
        (room) => ({ id: room.id, ...room.data() }) as ChatRoom,
      );
      emitRooms();
    },
    onError,
  );

  const unsubscribeMemberships = onSnapshot(
    query(collectionGroup(db, "members"), where("userId", "==", userId)),
    (snapshot) => {
      const roomRefsById = new Map(
        snapshot.docs
          .map((member) => member.ref.parent.parent)
          .filter(
            (roomRef): roomRef is NonNullable<typeof roomRef> =>
              roomRef !== null,
          )
          .map((roomRef) => [roomRef.id, roomRef] as const),
      );

      const ids = Array.from(roomRefsById.keys()).sort();
      const groups = new Map<string, string[]>();
      for (let i = 0; i < ids.length; i += ROOM_QUERY_BATCH_SIZE) {
        const group = ids.slice(i, i + ROOM_QUERY_BATCH_SIZE);
        groups.set(group.join("|"), group);
      }
      roomUnsubscribers.forEach((unsubscribe, key) => {
        if (groups.has(key)) return;
        unsubscribe();
        roomUnsubscribers.delete(key);
      });
      membershipRoomsById.forEach((_, id) => {
        if (!roomRefsById.has(id)) membershipRoomsById.delete(id);
      });
      membershipRooms = Array.from(membershipRoomsById.values());
      emitRooms();

      groups.forEach((group, key) => {
        if (roomUnsubscribers.has(key)) return;
        roomUnsubscribers.set(
          key,
          onSnapshot(
            query(
              collection(db, "chatRooms"),
              where(documentId(), "in", group),
              limit(ROOM_QUERY_BATCH_SIZE),
            ),
            (snapshot) => {
              group.forEach((id) => membershipRoomsById.delete(id));
              snapshot.docs.forEach((roomSnapshot) => {
                membershipRoomsById.set(roomSnapshot.id, {
                  id: roomSnapshot.id,
                  ...roomSnapshot.data(),
                } as ChatRoom);
              });
              membershipRooms = Array.from(membershipRoomsById.values());
              emitRooms();
            },
            onError,
          ),
        );
      });
    },
    onError,
  );

  return () => {
    unsubscribeMemberships();
    unsubscribeLegacyRooms();
    roomUnsubscribers.forEach((unsubscribe) => unsubscribe());
    roomUnsubscribers.clear();
  };
};

export const subscribeRoomMessages = (
  roomId: string,
  messageLimit: number,
  onValue: (messages: ChatMessage[], hasOlder: boolean) => void,
  onError: (error: Error) => void,
) => {
  const messagesQuery = query(
    collection(db, "chatRooms", roomId, "messages"),
    orderBy("createdAt", "asc"),
    limitToLast(messageLimit),
  );
  return onSnapshot(
    messagesQuery,
    (snapshot) =>
      onValue(
        snapshot.docs.map((messageDoc) => ({
          id: messageDoc.id,
          ...messageDoc.data(),
        })) as ChatMessage[],
        snapshot.size === messageLimit,
      ),
    onError,
  );
};

export const markRoomRead = (roomId: string, userId: string) =>
  setDoc(
    doc(db, "chatRooms", roomId, "reads", userId),
    { userId, readAt: serverTimestamp() },
    { merge: true },
  );

export const subscribeRoomReadReceipts = (
  roomId: string,
  onValue: (receipts: ChatReadReceipt[]) => void,
  onError: (error: Error) => void,
) =>
  onSnapshot(
    collection(db, "chatRooms", roomId, "reads"),
    (snapshot) =>
      onValue(
        snapshot.docs.map((receiptDoc) => receiptDoc.data() as ChatReadReceipt),
      ),
    onError,
  );
