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
import type {
  ChatMessage,
  ChatPreference,
  ChatReadReceipt,
  ChatRoom,
} from "../types/domain";

export const CHAT_ROOM_PAGE_SIZE = 50;

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

export const loadChatRoomsForUser = async (
  userId: string,
  roomLimit = CHAT_ROOM_PAGE_SIZE,
) => {
  const [memberships, legacyRooms] = await Promise.all([
    getDocs(
      query(
        collectionGroup(db, "members"),
        where("userId", "==", userId),
        limit(roomLimit + 1),
      ),
    ),
    getDocs(
      query(
        collection(db, "chatRooms"),
        where("participantIds", "array-contains", userId),
        limit(roomLimit + 1),
      ),
    ),
  ]);
  return mergeRooms(
    roomLimit,
    await roomsFromMembershipSnapshot(
      memberships.docs.slice(0, roomLimit),
    ),
    legacyRooms.docs.slice(0, roomLimit).map(
      (room) => ({ id: room.id, ...room.data() }) as ChatRoom,
    ),
  );
};

export const subscribeChatRoomsForUser = (
  userId: string,
  onValue: (rooms: ChatRoom[], hasMore: boolean) => void,
  onError: (error: Error) => void,
  roomLimit = CHAT_ROOM_PAGE_SIZE,
) => {
  let membershipRooms: ChatRoom[] = [];
  let legacyRooms: ChatRoom[] = [];
  let membershipHasMore = false;
  let legacyHasMore = false;
  const membershipRoomsById = new Map<string, ChatRoom>();
  const roomUnsubscribers = new Map<string, () => void>();
  const emitRooms = () =>
    onValue(
      mergeRooms(roomLimit, membershipRooms, legacyRooms),
      membershipHasMore || legacyHasMore,
    );

  const unsubscribeLegacyRooms = onSnapshot(
    query(
      collection(db, "chatRooms"),
      where("participantIds", "array-contains", userId),
      limit(roomLimit + 1),
    ),
    (snapshot) => {
      legacyHasMore = snapshot.size > roomLimit;
      legacyRooms = snapshot.docs.slice(0, roomLimit).map(
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
      limit(roomLimit + 1),
    ),
    (snapshot) => {
      membershipHasMore = snapshot.size > roomLimit;
      const roomRefsById = new Map(
        snapshot.docs
          .slice(0, roomLimit)
          .map((member) => member.ref.parent.parent)
          .filter(
            (roomRef): roomRef is NonNullable<typeof roomRef> =>
              roomRef !== null,
          )
          .map((roomRef) => [roomRef.id, roomRef] as const),
      );

      roomUnsubscribers.forEach((unsubscribe, roomId) => {
        if (roomRefsById.has(roomId)) return;
        unsubscribe();
        roomUnsubscribers.delete(roomId);
        membershipRoomsById.delete(roomId);
      });
      membershipRooms = Array.from(membershipRoomsById.values());
      emitRooms();

      roomRefsById.forEach((roomRef, roomId) => {
        if (roomUnsubscribers.has(roomId)) return;
        roomUnsubscribers.set(
          roomId,
          onSnapshot(
            roomRef,
            (roomSnapshot) => {
              if (roomSnapshot.exists()) {
                membershipRoomsById.set(roomSnapshot.id, {
                  id: roomSnapshot.id,
                  ...roomSnapshot.data(),
                } as ChatRoom);
              } else {
                membershipRoomsById.delete(roomSnapshot.id);
              }
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
