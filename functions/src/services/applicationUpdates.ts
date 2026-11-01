import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {
  applicationStatusMessage,
  shouldDecrementApplicantCount,
  shouldIncrementApplicantCount,
  tokyoYearMonth,
} from "../applicationLogic";
import {db} from "../lib/firebaseAdmin";
import {readLiveApplication} from "./resourceLifecycle";
import {releaseApplicationCapacity} from "./applicationCapacity";

export const processApplicationUpdate = async (
  applicationId: string,
  before: FirebaseFirestore.DocumentData,
  after: FirebaseFirestore.DocumentData,
) =>
  db.runTransaction(async (transaction) => {
    const context = await readLiveApplication(transaction, applicationId);
    if (!context) return;
    const current = context.application.data()!;
    const eventData = context.event.data()!;
    const notificationRef = db.doc(
      `notifications/application_updated_${applicationId}_${after.status}`,
    );
    const activityRef = db.doc(`activities/${applicationId}`);
    const receiptId = [
      "application", applicationId, before.status, after.status,
    ].join("_");
    const receiptRef = db.doc(`functionReceipts/${receiptId}`);
    const [notification, preferences, activity, receipt] =
      await transaction.getAll(
        notificationRef,
        db.doc(`notificationPreferences/${current.studentId}`),
        activityRef,
        receiptRef,
      );
    const sameStatus = current.status === after.status;
    const decrement =
      current.capacityReleased !== true &&
      after.capacityReleased !== true &&
      shouldDecrementApplicantCount(before.status, after.status);
    const increment =
      shouldIncrementApplicantCount(before.status, after.status) &&
      current.promotedFromWaitlist !== true &&
      after.promotedFromWaitlist !== true;
    // Capacity helpers must finish all their reads before any writes below.
    if (!receipt.exists && (decrement || increment)) {
      if (decrement) {
        await releaseApplicationCapacity(transaction, context.event.ref);
      } else if (eventData.status !== "cancelled") {
        transaction.update(context.event.ref, {
          applicantCount:
            Math.max(0, Number(eventData.applicantCount ?? 0)) + 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.create(receiptRef, {
        applicationId,
        beforeStatus: before.status,
        afterStatus: after.status,
        processedAt: FieldValue.serverTimestamp(),
      });
      if (decrement) {
        transaction.update(context.application.ref, {
          capacityReleased: true,
          capacityHeld: false,
        });
      }
    }
    if (
      sameStatus &&
      !notification.exists &&
      preferences.data()?.applicationUpdates !== false
    ) {
      transaction.create(notificationRef, {
        recipientId: current.studentId,
        type: "application_updated",
        title: "参加申請が更新されました",
        body: applicationStatusMessage(current.status),
        targetType: "application",
        targetId: applicationId,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (
      sameStatus &&
      current.status === "attended" &&
      eventData.status === "published" &&
      !activity.exists
    ) {
      const occurredAt =
        eventData.startAt instanceof Timestamp ?
          eventData.startAt :
          Timestamp.now();
      const {activityYear, activityMonth} = tokyoYearMonth(
        occurredAt.toDate(),
      );
      transaction.create(activityRef, {
        id: applicationId,
        userId: current.studentId,
        eventId: current.eventId,
        title: current.eventTitle,
        organizationId: current.organizationId,
        organizationName: current.organizationName,
        certificateId: `AC-${applicationId}`,
        participantRole: "参加者",
        takeaways: Array.isArray(eventData.takeaways) ?
          eventData.takeaways.slice(0, 3) :
          [],
        verificationStatus: "verified",
        verifiedBy: current.organizationId,
        occurredAt,
        activityMonth,
        activityYear,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
