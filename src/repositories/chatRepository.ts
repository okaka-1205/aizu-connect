import {
  collection,
  doc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { ChatMessage, ChatReadReceipt } from "../types/domain";

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
