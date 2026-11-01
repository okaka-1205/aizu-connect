import {FieldValue} from "firebase-admin/firestore";
import {db} from "../lib/firebaseAdmin";
import {readLiveApplication, readLiveEvent} from "./resourceLifecycle";

export const processUnavailableApplication = async (
  applicationId: string,
  eventId: string,
  status: "cancelled" | "unpublished",
) =>
  db.runTransaction(async (transaction) => {
    const context = await readLiveApplication(transaction, applicationId);
    if (
      !context ||
      context.event.id !== eventId ||
      context.event.data()?.status !== status
    ) {
      return;
    }
    const application = context.application.data()!;
    if (!["pending", "waitlisted", "confirmed"].includes(application.status)) {
      return;
    }
    const notificationRef = db.doc(
      `notifications/event_unavailable_${eventId}_${status}_${applicationId}`,
    );
    const notification = await transaction.get(notificationRef);
    const eventData = context.event.data()!;
    if (status === "cancelled") {
      transaction.update(context.application.ref, {status: "cancelled"});
    }
    if (!notification.exists) {
      transaction.create(notificationRef, {
        recipientId: application.studentId,
        type:
          status === "cancelled" ?
            "event_cancelled" :
            "event_temporarily_unpublished",
        title:
          status === "cancelled" ?
            "イベントが中止になりました" :
            "イベントの公開が一時停止されました",
        body:
          status === "cancelled" ?
            `「${eventData.title}」は中止になりました。` +
              (eventData.cancellationReason ?? "") :
            `「${eventData.title}」は運営確認のため一時的に非公開になりました。`,
        targetType: "application",
        targetId: applicationId,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });

export const closeCancelledEventRoom = async (eventId: string) =>
  db.runTransaction(async (transaction) => {
    const event = await readLiveEvent(transaction, eventId, "cancelled");
    if (!event) return;
    const roomRef = db.doc(`chatRooms/event_${eventId}`);
    const room = await transaction.get(roomRef);
    if (!room.exists) return;
    transaction.update(roomRef, {
      status: "read_only",
      organizerNotice:
        event.data()?.cancellationReason ?? "このイベントは中止になりました。",
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
