import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { ChatMessage, ChatReadReceipt, ChatRoom } from "../types/domain";

export const CHAT_ROOM_PAGE_SIZE = 50;

const mergeRooms = (...roomGroups: ChatRoom[][]) =>
  Array.from(
    new Map(
      roomGroups.flat().map((room) => [room.id, room] as const),
    ).values(),
  )
    .sort(
      (left, right) =>
        (right.lastMessageAt?.toMillis?.() ?? 0) -
        (left.lastMessageAt?.toMillis?.() ?? 0),
    )
    .slice(0, CHAT_ROOM_PAGE_SIZE);

const roomsFromMembershipSnapshot = async (
  memberDocuments: QueryDocumentSnapshot<DocumentData>[],
) => {
  const roomRefs = memberDocuments
    .map((member) => member.ref.parent.parent)
    .filter(
      (roomRef): roomRef is NonNullable<typeof roomRef> => roomRef !== null,
    );
  const roomSnapshots = await Promise.all(
    roomRefs.map((roomRef) => getDoc(roomRef)),
  );
  return roomSnapshots
    .filter((room) => room.exists())
    .map((room) => ({ id: room.id, ...room.data() }) as ChatRoom)
    .sort(
      (left, right) =>
        (right.lastMessageAt?.toMillis?.() ?? 0) -
        (left.lastMessageAt?.toMillis?.() ?? 0),
    );
};

export const loadChatRoomsForUser = async (userId: string) => {
  const [memberships, legacyRooms] = await Promise.all([
    getDocs(
      query(
        collectionGroup(db, "members"),
        where("userId", "==", userId),
        limit(CHAT_ROOM_PAGE_SIZE + 1),
      ),
    ),
    getDocs(
      query(
        collection(db, "chatRooms"),
        where("participantIds", "array-contains", userId),
        limit(CHAT_ROOM_PAGE_SIZE),
      ),
    ),
  ]);
  return mergeRooms(
    await roomsFromMembershipSnapshot(
      memberships.docs.slice(0, CHAT_ROOM_PAGE_SIZE),
    ),
    legacyRooms.docs.map(
      (room) => ({ id: room.id, ...room.data() }) as ChatRoom,
    ),
  );
};

export const subscribeChatRoomsForUser = (
  userId: string,
  onValue: (rooms: ChatRoom[]) => void,
  onError: (error: Error) => void,
) => {
  let membershipRooms: ChatRoom[] = [];
  let legacyRooms: ChatRoom[] = [];
  let roomUnsubscribers: Array<() => void> = [];
  const emitRooms = () => onValue(mergeRooms(membershipRooms, legacyRooms));

  const unsubscribeLegacyRooms = onSnapshot(
    query(
      collection(db, "chatRooms"),
      where("participantIds", "array-contains", userId),
      limit(CHAT_ROOM_PAGE_SIZE),
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
    query(
      collectionGroup(db, "members"),
      where("userId", "==", userId),
      limit(CHAT_ROOM_PAGE_SIZE),
    ),
    (snapshot) => {
      roomUnsubscribers.forEach((unsubscribe) => unsubscribe());
      roomUnsubscribers = [];
      const roomsById = new Map<string, ChatRoom>();
      const roomRefs = Array.from(
        new Map(
          snapshot.docs
            .map((member) => member.ref.parent.parent)
            .filter(
              (roomRef): roomRef is NonNullable<typeof roomRef> =>
                roomRef !== null,
            )
            .map((roomRef) => [roomRef.id, roomRef] as const),
        ).values(),
      );
      membershipRooms = [];
      emitRooms();
      roomUnsubscribers = roomRefs.map((roomRef) =>
        onSnapshot(
          roomRef,
          (roomSnapshot) => {
            if (roomSnapshot.exists()) {
              roomsById.set(roomSnapshot.id, {
                id: roomSnapshot.id,
                ...roomSnapshot.data(),
              } as ChatRoom);
            } else {
              roomsById.delete(roomSnapshot.id);
            }
            membershipRooms = Array.from(roomsById.values());
            emitRooms();
          },
          onError,
        ),
      );
    },
    onError,
  );

  return () => {
    unsubscribeMemberships();
    unsubscribeLegacyRooms();
    roomUnsubscribers.forEach((unsubscribe) => unsubscribe());
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
