import { useCallback, useEffect, useState } from "react";
import { getFirebaseErrorMessage } from "../lib/appLogic";
import {
  markRoomRead,
  subscribeRoomMessages,
  subscribeRoomReadReceipts,
} from "../repositories/chatRepository";
import type { ChatMessage, ChatReadReceipt, SetNotice } from "../types/domain";

export function useRoomConversation({
  roomId,
  userId,
  setNotice,
}: {
  roomId: string | null;
  userId?: string;
  setNotice: SetNotice;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageLimit, setMessageLimit] = useState(100);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [readReceipts, setReadReceipts] = useState<ChatReadReceipt[]>([]);
  const loadOlderMessages = useCallback(
    () => setMessageLimit((current) => current + 100),
    [],
  );
  const resetMessageWindow = useCallback(() => setMessageLimit(100), []);

  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      setHasOlderMessages(false);
      return;
    }
    return subscribeRoomMessages(
      roomId,
      messageLimit,
      (nextMessages, hasOlder) => {
        setMessages(nextMessages);
        setHasOlderMessages(hasOlder);
      },
      (error) => setNotice(getFirebaseErrorMessage(error), "error"),
    );
  }, [messageLimit, roomId, setNotice]);

  useEffect(() => {
    if (!roomId || !userId) {
      setReadReceipts([]);
      return;
    }
    void markRoomRead(roomId, userId).catch((error: unknown) =>
      setNotice(getFirebaseErrorMessage(error), "error"),
    );
    return subscribeRoomReadReceipts(roomId, setReadReceipts, (error) =>
      setNotice(getFirebaseErrorMessage(error), "error"),
    );
  }, [roomId, setNotice, userId]);

  return {
    chatMessages: messages,
    hasOlderChatMessages: hasOlderMessages,
    chatReadReceipts: readReceipts,
    loadOlderMessages,
    resetMessageWindow,
  };
}
