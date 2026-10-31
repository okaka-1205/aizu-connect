import {FieldPath, FieldValue, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {
  isMissingStorageBucketError,
  shouldDecrementApplicantCount,
} from "../applicationLogic";
import {createNotificationOnce} from "../services/notifications";
import {adminAuth, adminStorage, db} from "../lib/firebaseAdmin";
import {requiredDocumentId} from "../lib/callableValidation";
import {requireAdmin} from "../lib/adminAuthorization";
import {
  adminAuditData,
  applyAdminStateChange,
  finishAdminOperation,
} from "../services/adminStateChanges";
import {releaseApplicationCapacity} from "../services/applicationCapacity";

const isFunctionsEmulator = process.env.FUNCTIONS_EMULATOR === "true";
const enforceCallableAppCheck =
  !isFunctionsEmulator &&
  (process.env.ENFORCE_CALLABLE_APP_CHECK ??
    process.env.ENFORCE_ADMIN_APP_CHECK) === "true";

const requiredAdminText = (value: unknown, label: string, maxLength = 1000) => {
  const text = String(value ?? "").trim();
  if (text.length < 3 || text.length > maxLength) {
    throw new HttpsError(
      "invalid-argument",
      `${label}は3文字以上${maxLength}文字以内で入力してください。`,
    );
  }
  return text;
};

const requiredRequestId = (value: unknown) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(value)) {
    throw new HttpsError("invalid-argument", "操作識別子が不正です。");
  }
  return value;
};

const deleteMatchingDocuments = async (
  collectionName: string,
  field: string,
  value: string,
  beforeDelete?: (documentId: string) => Promise<void>,
) => {
  let hasDocuments = true;
  while (hasDocuments) {
    const snapshot = await db
      .collection(collectionName)
      .where(field, "==", value)
      .limit(100)
      .get();
    hasDocuments = !snapshot.empty;
    if (snapshot.empty) continue;
    await Promise.all(
      snapshot.docs.map(async (document) => {
        if (beforeDelete) await beforeDelete(document.id);
        await db.recursiveDelete(document.ref);
      }),
    );
  }
};

const deleteCollectionGroupDocuments = async (
  collectionId: string,
  field: string,
  value: string,
) => {
  let hasDocuments = true;
  while (hasDocuments) {
    const snapshot = await db
      .collectionGroup(collectionId)
      .where(field, "==", value)
      .limit(100)
      .get();
    hasDocuments = !snapshot.empty;
    if (snapshot.empty) continue;
    await Promise.all(
      snapshot.docs.map((document) => db.recursiveDelete(document.ref)),
    );
  }
};

const deleteStoragePrefixes = async (prefixes: string[]) => {
  const uniquePrefixes = [...new Set(prefixes.filter(Boolean))];
  if (uniquePrefixes.length === 0) return;
  const bucket = adminStorage.bucket();
  try {
    await Promise.all(
      uniquePrefixes.map((prefix) => bucket.deleteFiles({prefix, force: true})),
    );
  } catch (error) {
    if (!isMissingStorageBucketError(error)) throw error;
    logger.warn(
      "Storage bucket is not provisioned; continuing admin data deletion.",
      {bucket: bucket.name},
    );
  }
};

const anonymizeEventRoomMessages = async (
  roomRef: FirebaseFirestore.DocumentReference,
  userId: string,
) => {
  let hasMessages = true;
  while (hasMessages) {
    const messages = await roomRef
      .collection("messages")
      .where("senderId", "==", userId)
      .limit(100)
      .get();
    hasMessages = !messages.empty;
    if (messages.empty) continue;
    const batch = db.batch();
    messages.docs.forEach((message) => {
      const data = message.data();
      const hasAttachment = ["image", "file"].includes(String(data.type));
      batch.update(message.ref, {
        senderId: "deleted_user",
        senderName: "退会済みユーザー",
        ...(hasAttachment ?
          {
            type: "text",
            text: "添付ファイルは削除されました。",
            attachmentUrl: FieldValue.delete(),
            attachmentName: FieldValue.delete(),
            attachmentType: FieldValue.delete(),
            attachmentSize: FieldValue.delete(),
          } :
          {}),
        anonymizedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
  await db.recursiveDelete(roomRef.collection("reads").doc(userId));
};

const resolveReportsForTarget = async (
  targetType: "event" | "user",
  targetId: string,
  resolution: string,
) => {
  let lastId: string | undefined;
  let hasReports = true;
  while (hasReports) {
    let reportsQuery = db
      .collection("reports")
      .where("targetId", "==", targetId)
      .orderBy(FieldPath.documentId())
      .limit(200);
    if (lastId) reportsQuery = reportsQuery.startAfter(lastId);
    const snapshot = await reportsQuery.get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach((report) => {
      if (
        report.data().targetType === targetType &&
        !["resolved", "dismissed"].includes(report.data().status)
      ) {
        batch.update(report.ref, {
          status: "resolved",
          resolution,
          resolvedAt: FieldValue.serverTimestamp(),
        });
      }
    });
    await batch.commit();
    lastId = snapshot.docs[snapshot.docs.length - 1]?.id;
    hasReports = snapshot.size === 200;
  }
};

const notifyEventDeletion = async (
  eventId: string,
  eventTitle: string,
  organizerId: string,
  reason: string,
  operationId: string,
) => {
  let lastApplicationId: string | undefined;
  let hasApplications = true;
  while (hasApplications) {
    let applicationsQuery = db
      .collection("eventApplications")
      .where("eventId", "==", eventId)
      .orderBy(FieldPath.documentId())
      .limit(100);
    if (lastApplicationId) {
      applicationsQuery = applicationsQuery.startAfter(lastApplicationId);
    }
    const applications = await applicationsQuery.get();
    if (applications.empty) break;
    const batch = db.batch();
    applications.docs.forEach((application) => {
      const data = application.data();
      if (typeof data.studentId === "string") {
        batch.set(
          db.doc(
            `notifications/event_deleted_${operationId}_${application.id}`,
          ),
          {
            recipientId: data.studentId,
            type: "event_deleted",
            title: "イベントが削除されました",
            body: `「${eventTitle}」は運営判断により削除されました。${reason}`,
            targetType: "notice",
            targetId: operationId,
            isRead: false,
            createdAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
      }
    });
    await batch.commit();
    lastApplicationId = applications.docs[applications.docs.length - 1]?.id;
    hasApplications = applications.size === 100;
  }
  if (organizerId) {
    await createNotificationOnce(
      `notifications/event_deleted_${operationId}_organizer`,
      {
        recipientId: organizerId,
        type: "event_deleted",
        title: "イベントが削除されました",
        body: `「${eventTitle}」は運営判断により削除されました。${reason}`,
        targetType: "notice",
        targetId: operationId,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
  }
};

const deleteEventData = async (
  eventId: string,
  resolution: string,
  operationId: string,
) => {
  const eventSnapshot = await db.doc(`events/${eventId}`).get();
  const eventData = eventSnapshot.data();
  if (eventSnapshot.exists) {
    await notifyEventDeletion(
      eventId,
      String(eventData?.title || "イベント"),
      String(eventData?.createdBy || ""),
      resolution,
      operationId,
    );
  }
  await resolveReportsForTarget("event", eventId, resolution);
  const storagePrefixes = [
    typeof eventData?.createdBy === "string" ?
      `event-images/${eventData.createdBy}/${eventId}/` :
      "",
    typeof eventData?.createdBy === "string" ?
      `event-reports/${eventData.createdBy}/${eventId}/` :
      "",
  ];
  await Promise.all([
    deleteMatchingDocuments("eventApplications", "eventId", eventId),
    deleteMatchingDocuments("chatRooms", "eventId", eventId, async (roomId) => {
      storagePrefixes.push(`chat-attachments/${roomId}/`);
    }),
    deleteMatchingDocuments("savedEvents", "eventId", eventId),
    deleteMatchingDocuments("checkInAttempts", "eventId", eventId),
    deleteMatchingDocuments("notifications", "targetId", eventId),
    deleteMatchingDocuments("adminAssignments", "targetId", eventId),
    db.recursiveDelete(db.doc(`eventCheckIns/${eventId}`)),
    db.recursiveDelete(db.doc(`eventReports/${eventId}`)),
    db.recursiveDelete(db.doc(`eventSurveys/${eventId}`)),
  ]);
  await deleteStoragePrefixes(storagePrefixes);
  await db.recursiveDelete(db.doc(`events/${eventId}`));
};

const anonymizeReportsByReporter = async (userId: string) => {
  let hasReports = true;
  while (hasReports) {
    const reports = await db
      .collection("reports")
      .where("reporterId", "==", userId)
      .limit(100)
      .get();
    hasReports = !reports.empty;
    if (reports.empty) continue;
    const batch = db.batch();
    reports.docs.forEach((report) => {
      batch.update(report.ref, {
        reporterId: "deleted_user",
        reporterDeletedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
};

const deleteUserData = async (
  userId: string,
  resolution: string,
  operationId: string,
) => {
  let hasOwnedEvents = true;
  while (hasOwnedEvents) {
    const ownedEvents = await db
      .collection("events")
      .where("createdBy", "==", userId)
      .limit(100)
      .get();
    hasOwnedEvents = !ownedEvents.empty;
    for (const eventDocument of ownedEvents.docs) {
      await deleteEventData(
        eventDocument.id,
        resolution,
        `${operationId}_${eventDocument.id}`,
      );
    }
  }

  let hasApplications = true;
  while (hasApplications) {
    const applications = await db
      .collection("eventApplications")
      .where("studentId", "==", userId)
      .limit(100)
      .get();
    hasApplications = !applications.empty;
    for (const application of applications.docs) {
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(application.ref);
        const data = current.data();
        if (!current.exists || data?.capacityReleased === true) return;
        if (
          typeof data?.eventId === "string" &&
          shouldDecrementApplicantCount(data.status, "cancelled")
        ) {
          await releaseApplicationCapacity(
            transaction,
            db.doc(`events/${data.eventId}`),
          );
        }
        transaction.update(application.ref, {capacityReleased: true});
      });
      await db.recursiveDelete(application.ref);
    }
  }

  const storagePrefixes = [`profile-images/${userId}/`];
  let hasRooms = true;
  while (hasRooms) {
    const rooms = await db
      .collection("chatRooms")
      .where("participantIds", "array-contains", userId)
      .limit(100)
      .get();
    hasRooms = !rooms.empty;
    for (const room of rooms.docs) {
      storagePrefixes.push(`chat-attachments/${room.id}/${userId}/`);
      if (room.data().roomType === "event") {
        await anonymizeEventRoomMessages(room.ref, userId);
        await room.ref.update({
          participantIds: FieldValue.arrayRemove(userId),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        await db.recursiveDelete(room.ref);
      }
    }
  }

  let hasMemberships = true;
  while (hasMemberships) {
    const memberships = await db
      .collectionGroup("members")
      .where("userId", "==", userId)
      .limit(100)
      .get();
    hasMemberships = !memberships.empty;
    for (const membership of memberships.docs) {
      const roomRef = membership.ref.parent.parent;
      if (!roomRef) {
        await membership.ref.delete();
        continue;
      }
      const room = await roomRef.get();
      storagePrefixes.push(`chat-attachments/${room.id}/${userId}/`);
      if (room.data()?.roomType === "event") {
        await anonymizeEventRoomMessages(roomRef, userId);
        await membership.ref.delete();
        await roomRef.update({
          memberCount: FieldValue.increment(-1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        await db.recursiveDelete(roomRef);
      }
    }
  }

  await resolveReportsForTarget("user", userId, resolution);
  await anonymizeReportsByReporter(userId);
  await Promise.all([
    deleteMatchingDocuments("activities", "userId", userId),
    deleteMatchingDocuments("notifications", "recipientId", userId),
    deleteMatchingDocuments("savedEvents", "userId", userId),
    deleteMatchingDocuments("savedSearches", "userId", userId),
    deleteMatchingDocuments("savedOrganizers", "userId", userId),
    deleteMatchingDocuments("savedOrganizers", "organizationId", userId),
    deleteMatchingDocuments("userBlocks", "blockerId", userId),
    deleteMatchingDocuments("userBlocks", "blockedId", userId),
    deleteMatchingDocuments("chatPreferences", "userId", userId),
    deleteMatchingDocuments("checkInAttempts", "userId", userId),
    deleteMatchingDocuments("adminAssignments", "assigneeId", userId),
    deleteCollectionGroupDocuments("responses", "userId", userId),
    db.recursiveDelete(db.doc(`notificationPreferences/${userId}`)),
    db.recursiveDelete(db.doc(`studentProfiles/${userId}`)),
    db.recursiveDelete(db.doc(`organizations/${userId}`)),
    db.recursiveDelete(db.doc(`publicOrganizerProfiles/${userId}`)),
    db.recursiveDelete(db.doc(`accountDeletionRequests/${userId}`)),
  ]);
  await deleteStoragePrefixes(storagePrefixes);
  try {
    await adminAuth.deleteUser(userId);
  } catch (error) {
    if ((error as {code?: string}).code !== "auth/user-not-found") {
      throw error;
    }
  }
  await db.recursiveDelete(db.doc(`users/${userId}`));
};

export const adminManageResource = onCall(
  {
    region: "asia-northeast1",
    enforceAppCheck: enforceCallableAppCheck,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (request) => {
    const actor = await requireAdmin(
      request.auth?.uid,
      request.auth?.token.email_verified === true,
      request.auth?.token.firebase?.sign_in_second_factor,
    );
    const action = String(request.data?.action ?? "");
    if (
      ![
        "resolve_report",
        "dismiss_report",
        "approve_user",
        "reject_user",
        "suspend_user",
        "restore_user",
        "delete_user",
        "approve_event",
        "request_event_revision",
        "unpublish_event",
        "restore_event",
        "delete_event",
      ].includes(action)
    ) {
      throw new HttpsError("invalid-argument", "管理操作が不正です。");
    }
    const targetId = requiredDocumentId(request.data?.targetId);
    const reason = requiredAdminText(request.data?.reason, "対応理由");
    const requestId = requiredRequestId(request.data?.requestId);
    const operationId = `${actor.uid}_${action}_${targetId}_${requestId}`;
    const operationRef = db.doc(`adminOperations/${operationId}`);
    const reservation = await db.runTransaction(async (transaction) => {
      const previousOperation = await transaction.get(operationRef);
      if (previousOperation.data()?.status === "completed") {
        return {
          state: "completed" as const,
          resultStatus: String(
            previousOperation.data()?.resultStatus || "completed",
          ),
        };
      }
      const startedAt = previousOperation.data()?.startedAt;
      const leaseIsActive =
        previousOperation.data()?.status === "running" &&
        startedAt instanceof Timestamp &&
        Date.now() - startedAt.toMillis() < 15 * 60 * 1000;
      if (leaseIsActive) return {state: "running" as const};
      transaction.set(
        operationRef,
        {
          action,
          targetId,
          requestId,
          actorId: actor.uid,
          actorName: actor.displayName,
          reason,
          status: "running",
          attemptCount: FieldValue.increment(1),
          startedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      return {state: "acquired" as const};
    });
    if (reservation.state === "completed") {
      return {
        status: reservation.resultStatus,
        operationId,
      };
    }
    if (reservation.state === "running") {
      throw new HttpsError(
        "aborted",
        "同じ管理操作を処理中です。完了後にもう一度お試しください。",
      );
    }
    try {
      if (!["delete_user", "delete_event"].includes(action)) {
        return await applyAdminStateChange({
          actor,
          action,
          targetId,
          reason,
          operationRef,
          expectedUpdatedAt: request.data?.expectedUpdatedAt,
        });
      }
      const targetType = action === "delete_user" ? "user" : "event";
      const targetRef = db.doc(
        `${targetType === "user" ? "users" : "events"}/${targetId}`,
      );
      const target = await targetRef.get();
      if (
        targetType === "user" &&
        (targetId === actor.uid || target.data()?.role === "admin")
      ) {
        throw new HttpsError(
          "permission-denied",
          "管理者アカウントはこの画面から操作できません。",
        );
      }
      const previous = await operationRef.get();
      const title = String(
        target.data()?.title ||
          target.data()?.displayName ||
          previous.data()?.targetTitle ||
          "対象データ",
      );
      if (target.exists) {
        // Keep the audit identity available if the final transaction must retry
        // after the resource itself has already been removed.
        await operationRef.set({targetTitle: title}, {merge: true});
        const label = targetType === "user" ? "アカウント" : "イベント";
        const resolution = `管理者が${label}を削除しました: ${reason}`.slice(
          0,
          1000,
        );
        if (targetType === "user") {
          await deleteUserData(targetId, resolution, operationId);
        } else await deleteEventData(targetId, resolution, operationId);
      }
      await db.runTransaction(async (transaction) => {
        finishAdminOperation(
          transaction,
          operationRef,
          adminAuditData(
            actor,
            `${targetType}_delete`,
            targetType,
            targetId,
            title,
            reason,
          ),
          "deleted",
        );
      });
      return {status: "deleted", operationId};
    } catch (error) {
      const completed = await db.runTransaction(async (transaction) => {
        const current = await transaction.get(operationRef);
        if (current.data()?.status === "completed") {
          return {status: String(current.data()?.resultStatus), operationId};
        }
        transaction.set(
          operationRef,
          {
            status: "failed",
            lastError:
              error instanceof Error ?
                error.message.slice(0, 500) :
                "Unknown error",
            updatedAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
        return null;
      });
      if (completed) return completed;
      throw error;
    }
  },
);
