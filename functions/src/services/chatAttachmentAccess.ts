import {HttpsError} from "firebase-functions/v2/https";
import {db} from "../lib/firebaseAdmin";
import {
  deletionLockRef,
  isLiveResource,
  readLiveEvent,
} from "./resourceLifecycle";

export const readChatAttachmentAccess = async (
  transaction: FirebaseFirestore.Transaction,
  userId: string,
  roomId: string,
) => {
  const roomRef = db.doc(`chatRooms/${roomId}`);
  const [user, userLock, room, member] = await transaction.getAll(
    db.doc(`users/${userId}`),
    deletionLockRef("user", userId),
    roomRef,
    roomRef.collection("members").doc(userId),
  );
  if (
    !isLiveResource(user) ||
    userLock.exists ||
    user.data()?.status !== "active" ||
    !["student", "organization"].includes(user.data()?.role)
  ) {
    throw new HttpsError("permission-denied", "有効なアカウントが必要です。");
  }
  const data = user.data();
  const senderName = data?.role === "organization" ?
    data.organizationName || data.displayName : data?.displayName;
  if (
    typeof senderName !== "string" ||
    !senderName ||
    senderName.length > (data?.role === "organization" ? 100 : 80)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "アカウントの表示名を確認してください。",
    );
  }
  const legacyMember =
    Array.isArray(room.data()?.participantIds) &&
    room.data()?.participantIds.includes(userId);
  if (!room.exists || (!member.exists && !legacyMember)) {
    throw new HttpsError("permission-denied", "チャット参加者ではありません。");
  }
  const eventId = room.data()?.eventId;
  if (
    typeof eventId !== "string" ||
    (await transaction.get(deletionLockRef("event", eventId))).exists
  ) {
    throw new HttpsError(
      "failed-precondition",
      "このイベントは利用できません。",
    );
  }
  const event = await readLiveEvent(transaction, eventId);
  if (!event) {
    throw new HttpsError(
      "failed-precondition",
      "このイベントは利用できません。",
    );
  }
  return {user, room, event, senderName};
};
