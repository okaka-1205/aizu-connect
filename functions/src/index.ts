import {FieldPath, FieldValue, Timestamp} from "firebase-admin/firestore";
import {randomInt} from "node:crypto";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {logger, setGlobalOptions} from "firebase-functions";
import {HttpsError, onCall, onRequest} from "firebase-functions/v2/https";
import {
  isEventPlanEditableStatus,
  isCheckInWindowOpen,
  isApplicationWindowOpen,
  isMissingStorageBucketError,
  normalizeApplicationAnswers,
  evaluateCheckInAttempt,
  normalizeEventPlanInput,
  sanitizeClientErrorText,
  sanitizeClientPath,
  shouldDecrementApplicantCount,
} from "./applicationLogic";
import {createNotificationOnce} from "./services/notifications";
import {adminAuth, adminStorage, db} from "./lib/firebaseAdmin";

setGlobalOptions({maxInstances: 10, region: "asia-northeast1"});
const isFunctionsEmulator = process.env.FUNCTIONS_EMULATOR === "true";
const enforceCallableAppCheck =
  !isFunctionsEmulator &&
  (process.env.ENFORCE_CALLABLE_APP_CHECK ??
    process.env.ENFORCE_ADMIN_APP_CHECK) === "true";

const eventChatRoomId = (eventId: string) => `event_${eventId}`;
const createCheckInCode = () =>
  String(randomInt(0, 1_000_000)).padStart(6, "0");

const thirdPartyRecordExpiry = () => {
  const expiry = new Date();
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 3);
  return Timestamp.fromDate(expiry);
};

const hasRequiredCommerceDisclosure = (
  eventData: FirebaseFirestore.DocumentData,
) =>
  eventData.feeType !== "有料" ||
  (Number(eventData.feeAmount ?? 0) > 0 &&
    [
      eventData.commercialSellerName,
      eventData.commercialSellerAddress,
      eventData.commercialSellerPhone,
      eventData.commercialResponsiblePerson,
      eventData.paymentMethod,
      eventData.paymentTiming,
      eventData.additionalFees,
      eventData.cancellationPolicy,
    ].every((value) => typeof value === "string" && value.trim()));

type AdminActor = {
  uid: string;
  displayName: string;
};

const requireAdmin = async (
  userId: string | undefined,
  emailVerified: boolean,
  secondFactor: unknown,
): Promise<AdminActor> => {
  if (!userId || !emailVerified) {
    throw new HttpsError("unauthenticated", "ログインが必要です。");
  }
  const snapshot = await db.doc(`users/${userId}`).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.role !== "admin" || data?.status !== "active") {
    throw new HttpsError(
      "permission-denied",
      "有効な管理者権限を確認できませんでした。",
    );
  }
  if (
    process.env.FUNCTIONS_EMULATOR !== "true" &&
    secondFactor !== "totp"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "管理操作には認証アプリによる二段階認証が必要です。",
    );
  }
  return {
    uid: userId,
    displayName: String(data.displayName || "Aizu Connect 運営").slice(0, 80),
  };
};

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

const requiredDocumentId = (value: unknown) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) {
    throw new HttpsError("invalid-argument", "対象IDが不正です。");
  }
  return value;
};

const optionalClientText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const clientErrorId = (value: unknown) => {
  const normalized = optionalClientText(value, 32).toUpperCase();
  return /^[A-Z0-9]{8,32}$/.test(normalized) ? normalized : "UNKNOWN";
};

const requiredRequestId = (value: unknown) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(value)) {
    throw new HttpsError("invalid-argument", "操作識別子が不正です。");
  }
  return value;
};

export const healthCheck = onRequest(
  {
    invoker: "public",
    timeoutSeconds: 10,
    memory: "256MiB",
    maxInstances: 2,
  },
  (request, response) => {
    response.set("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(request.method)) {
      response.status(405).json({status: "method_not_allowed"});
      return;
    }
    response.status(200).json({
      status: "ok",
      service: "aizu-connect-functions",
      checkedAt: new Date().toISOString(),
    });
  },
);

export const reportClientError = onCall(
  {
    enforceAppCheck: enforceCallableAppCheck,
    timeoutSeconds: 15,
    memory: "256MiB",
    maxInstances: 3,
  },
  (request) => {
    const errorId = clientErrorId(request.data?.errorId);
    logger.error("Client render error", {
      errorId,
      userId: request.auth?.uid ?? null,
      name: sanitizeClientErrorText(request.data?.name, 80),
      clientMessage: sanitizeClientErrorText(request.data?.message, 500),
      componentStack: sanitizeClientErrorText(
        request.data?.componentStack,
        3000,
      ),
      path: sanitizeClientPath(request.data?.path),
    });
    return {accepted: true, errorId};
  },
);

const writeAuditLog = async (
  actor: AdminActor,
  action: string,
  targetType: "event" | "user" | "report",
  targetId: string,
  targetTitle: string,
  reason: string,
  operationId?: string,
) => {
  const reference = operationId ?
    db.doc(`auditLogs/${operationId}`) :
    db.collection("auditLogs").doc();
  await reference.set({
    actorId: actor.uid,
    actorName: actor.displayName,
    action,
    targetType,
    targetId,
    targetTitle: targetTitle.slice(0, 200) || "対象データ",
    reason,
    createdAt: FieldValue.serverTimestamp(),
  });
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
      uniquePrefixes.map((prefix) =>
        bucket.deleteFiles({prefix, force: true}),
      ),
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
      const data = application.data();
      if (
        typeof data.eventId === "string" &&
        shouldDecrementApplicantCount(data.status, "cancelled")
      ) {
        const eventRef = db.doc(`events/${data.eventId}`);
        await db.runTransaction(async (transaction) => {
          const eventSnapshot = await transaction.get(eventRef);
          if (!eventSnapshot.exists) return;
          const count = Number(eventSnapshot.data()?.applicantCount ?? 0);
          transaction.update(eventRef, {
            applicantCount: Math.max(0, count - 1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
      }
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
    if ((error as { code?: string }).code !== "auth/user-not-found") {
      throw error;
    }
  }
  await db.recursiveDelete(db.doc(`users/${userId}`));
};

export const adminManageResource = onCall(
  {
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
    const completeOperation = async (status: string) => {
      await operationRef.set(
        {
          status: "completed",
          resultStatus: status,
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastError: FieldValue.delete(),
        },
        {merge: true},
      );
      return {status, operationId};
    };

    try {
      if (["resolve_report", "dismiss_report"].includes(action)) {
        const reportRef = db.doc(`reports/${targetId}`);
        const report = await reportRef.get();
        if (!report.exists) {
          throw new HttpsError("not-found", "通報が見つかりません。");
        }
        const status = action === "resolve_report" ? "resolved" : "dismissed";
        await reportRef.update({
          status,
          resolution: reason,
          resolvedAt: FieldValue.serverTimestamp(),
        });
        await writeAuditLog(
          actor,
          action === "resolve_report" ? "report_resolved" : "report_dismissed",
          "report",
          targetId,
          String(report.data()?.targetTitle || "対象コンテンツ"),
          reason,
          operationId,
        );
        return await completeOperation(status);
      }

      if (
        [
          "approve_user",
          "reject_user",
          "suspend_user",
          "restore_user",
          "delete_user",
        ].includes(action)
      ) {
        if (targetId === actor.uid) {
          throw new HttpsError(
            "failed-precondition",
            "自分自身の管理者アカウントは操作できません。",
          );
        }
        const userRef = db.doc(`users/${targetId}`);
        const user = await userRef.get();
        if (!user.exists) {
          if (action === "delete_user") {
            return await completeOperation("deleted");
          }
          throw new HttpsError("not-found", "ユーザーが見つかりません。");
        }
        const userData = user.data();
        if (userData?.role === "admin") {
          throw new HttpsError(
            "permission-denied",
            "管理者アカウントはこの画面から操作できません。",
          );
        }
        const title = String(userData?.displayName || "ユーザー");
        const relatedAccountRef =
          userData?.role === "student" ?
            db.doc(`studentProfiles/${targetId}`) :
            userData?.role === "organization" ?
              db.doc(`organizations/${targetId}`) :
              null;
        const relatedAccount = relatedAccountRef ?
          await relatedAccountRef.get() :
          null;
        if (action === "delete_user") {
          await deleteUserData(
            targetId,
            `管理者がアカウントを削除しました: ${reason}`.slice(0, 1000),
            operationId,
          );
          await writeAuditLog(
            actor,
            "user_delete",
            "user",
            targetId,
            title,
            reason,
            operationId,
          );
          return await completeOperation("deleted");
        }
        if (["approve_user", "reject_user"].includes(action)) {
          const status = action === "approve_user" ? "active" : "rejected";
          const accountBatch = db.batch();
          const accountUpdate = {
            status,
            reviewReason: status === "rejected" ? reason : FieldValue.delete(),
            moderationReason: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          };
          accountBatch.update(userRef, accountUpdate);
          if (relatedAccountRef && relatedAccount?.exists) {
            accountBatch.update(relatedAccountRef, accountUpdate);
          }
          await accountBatch.commit();
          await createNotificationOnce(
            `notifications/account_review_${operationId}`,
            {
              recipientId: targetId,
              type:
                status === "active" ? "account_approved" : "account_rejected",
              title:
                status === "active" ?
                  "アカウントが承認されました" :
                  "アカウントの申請結果を確認してください",
              body:
                status === "active" ?
                  "Aizu Connectのすべての機能を利用できます。" :
                  reason,
              targetType: "profile",
              targetId,
              isRead: false,
              createdAt: FieldValue.serverTimestamp(),
            },
          );
          await writeAuditLog(
            actor,
            status === "active" ? "user_approve" : "user_reject",
            "user",
            targetId,
            title,
            reason,
            operationId,
          );
          return await completeOperation(status);
        }
        const status = action === "suspend_user" ? "suspended" : "active";
        const accountBatch = db.batch();
        const accountUpdate = {
          status,
          moderationReason:
            status === "suspended" ? reason : FieldValue.delete(),
          ...(status === "active" ? {reviewReason: FieldValue.delete()} : {}),
          updatedAt: FieldValue.serverTimestamp(),
        };
        accountBatch.update(userRef, accountUpdate);
        if (relatedAccountRef && relatedAccount?.exists) {
          accountBatch.update(relatedAccountRef, accountUpdate);
        }
        await accountBatch.commit();
        if (status === "suspended") {
          await db.collection("notifications").add({
            recipientId: targetId,
            type: "account_suspended",
            title: "アカウントの利用を停止しました",
            body: reason,
            targetType: "profile",
            targetId,
            isRead: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        await writeAuditLog(
          actor,
          status === "suspended" ? "user_suspend" : "user_restore",
          "user",
          targetId,
          title,
          reason,
          operationId,
        );
        return await completeOperation(status);
      }

      if (
        [
          "approve_event",
          "request_event_revision",
          "unpublish_event",
          "restore_event",
          "delete_event",
        ].includes(action)
      ) {
        const eventRef = db.doc(`events/${targetId}`);
        const event = await eventRef.get();
        if (!event.exists) {
          if (action === "delete_event") {
            return await completeOperation("deleted");
          }
          throw new HttpsError("not-found", "イベントが見つかりません。");
        }
        const eventData = event.data();
        const title = String(eventData?.title || "イベント");
        if (action === "delete_event") {
          await deleteEventData(
            targetId,
            `管理者がイベントを削除しました: ${reason}`.slice(0, 1000),
            operationId,
          );
          await writeAuditLog(
            actor,
            "event_delete",
            "event",
            targetId,
            title,
            reason,
            operationId,
          );
          return await completeOperation("deleted");
        }
        if (["approve_event", "request_event_revision"].includes(action)) {
          if (eventData?.status !== "pending_review") {
            throw new HttpsError(
              "failed-precondition",
              "このイベントはすでに審査済みです。",
            );
          }
          if (
            action === "approve_event" &&
            !hasRequiredCommerceDisclosure(eventData ?? {})
          ) {
            throw new HttpsError(
              "failed-precondition",
              "有料イベントの特定商取引法に基づく表示が不足しています。",
            );
          }
          const status =
            action === "approve_event" ? "published" : "revision_required";
          await eventRef.update({
            status,
            reviewNote:
              status === "published" ?
                "公開基準を満たしていることを確認しました。" :
                FieldValue.delete(),
            revisionReason:
              status === "revision_required" ? reason : FieldValue.delete(),
            reviewedBy: actor.uid,
            reviewedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          if (
            status === "revision_required" &&
            typeof eventData?.createdBy === "string"
          ) {
            await createNotificationOnce(
              `notifications/event_review_${operationId}`,
              {
                recipientId: eventData.createdBy,
                type: "event_revision_required",
                title: "イベントの修正をお願いします",
                body: reason,
                targetType: "event",
                targetId,
                isRead: false,
                createdAt: FieldValue.serverTimestamp(),
              },
            );
          }
          await writeAuditLog(
            actor,
            status === "published" ?
              "event_publish" :
              "event_revision_required",
            "event",
            targetId,
            title,
            reason,
            operationId,
          );
          return await completeOperation(status);
        }
        const status =
          action === "unpublish_event" ? "unpublished" : "published";
        const allowed =
          (status === "unpublished" && eventData?.status === "published") ||
          (status === "published" && eventData?.status === "unpublished");
        if (!allowed) {
          throw new HttpsError(
            "failed-precondition",
            "現在の公開状態からは変更できません。",
          );
        }
        await eventRef.update({
          status,
          moderationReason:
            status === "unpublished" ? reason : FieldValue.delete(),
          reviewedBy: actor.uid,
          reviewedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (typeof eventData?.createdBy === "string") {
          await db.collection("notifications").add({
            recipientId: eventData.createdBy,
            type:
              status === "unpublished" ? "event_unpublished" : "event_restored",
            title:
              status === "unpublished" ?
                "イベントを一時的に非公開にしました" :
                "イベントを再公開しました",
            body: reason,
            targetType: "event",
            targetId,
            isRead: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        await writeAuditLog(
          actor,
          status === "unpublished" ? "event_unpublish" : "event_restore",
          "event",
          targetId,
          title,
          reason,
          operationId,
        );
        return await completeOperation(status);
      }

      throw new HttpsError("invalid-argument", "管理操作が不正です。");
    } catch (error) {
      await operationRef.set(
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
      throw error;
    }
  },
);

export const saveEventPlan = onCall(
  {enforceAppCheck: enforceCallableAppCheck},
  async (request) => {
    const userId = request.auth?.uid;
    const eventId = request.data?.eventId;
    const mode = request.data?.mode;
    if (!userId) throw new HttpsError("unauthenticated", "Login required.");
    if (
      typeof eventId !== "string" ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(eventId) ||
      !["create", "update"].includes(mode)
    ) {
      throw new HttpsError("invalid-argument", "Event request is invalid.");
    }
    const plan = normalizeEventPlanInput(request.data?.event, Date.now());
    if (!plan) {
      throw new HttpsError("invalid-argument", "Event details are invalid.");
    }
    const userSnapshot = await db.doc(`users/${userId}`).get();
    const userData = userSnapshot.data();
    if (!userSnapshot.exists) {
      throw new HttpsError(
        "failed-precondition",
        "アカウント情報を確認できませんでした。",
      );
    }
    if (userData?.status !== "active") {
      const isAwaitingApproval = ["pending", "pending_approval"].includes(
        String(userData?.status),
      );
      throw new HttpsError(
        "permission-denied",
        isAwaitingApproval ?
          "管理者の承認待ちです。" :
          "このアカウントではイベントを企画できません。",
      );
    }
    if (!["student", "organization"].includes(userData?.role)) {
      throw new HttpsError(
        "permission-denied",
        "学生または団体アカウントでイベントを企画できます。",
      );
    }
    if (!isFunctionsEmulator && request.auth?.token.email_verified !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Email verification is required.",
      );
    }
    const organizationName = String(
      userData?.organizationName ?? userData?.displayName ?? "",
    ).trim();
    if (!organizationName || organizationName.length > 100) {
      throw new HttpsError(
        "failed-precondition",
        "Organizer profile is incomplete.",
      );
    }
    const eventRef = db.doc(`events/${eventId}`);
    await db.runTransaction(async (transaction) => {
      const eventSnapshot = await transaction.get(eventRef);
      if (mode === "create" && eventSnapshot.exists) {
        throw new HttpsError("already-exists", "Event already exists.");
      }
      if (
        mode === "update" &&
        (!eventSnapshot.exists ||
          eventSnapshot.data()?.createdBy !== userId ||
          !isEventPlanEditableStatus(eventSnapshot.data()?.status))
      ) {
        throw new HttpsError(
          "failed-precondition",
          "このイベントは現在編集できません。",
        );
      }
      const startAt = Timestamp.fromMillis(plan.startAtMillis);
      const endAt = Timestamp.fromMillis(plan.endAtMillis);
      const eventData = {
        ...plan,
        startAt,
        endAt,
        cancellationDeadline:
          plan.cancellationDeadlineMillis === undefined ?
            Timestamp.fromMillis(
              Math.max(
                plan.startAtMillis - 24 * 60 * 60 * 1000,
                Math.min(
                  plan.startAtMillis - 60_000,
                  Date.now() + 60 * 60 * 1000,
                ),
              ),
            ) :
            Timestamp.fromMillis(plan.cancellationDeadlineMillis),
        startAtLabel: new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          year: "numeric",
          month: "numeric",
          day: "numeric",
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        }).format(startAt.toDate()),
        endAtLabel: new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          hour: "numeric",
          minute: "2-digit",
        }).format(endAt.toDate()),
        organizationName,
        organizationId: userId,
        organizationVerified: userData?.role === "organization",
        status: "pending_review",
        imageUrl: plan.imageUrl,
        tags: [
          plan.category,
          "学生歓迎",
          ...(plan.beginnerLevel === "初参加歓迎" ? ["初心者歓迎"] : []),
        ],
        createdBy: userId,
        updatedAt: FieldValue.serverTimestamp(),
      };
      delete (eventData as Record<string, unknown>).startAtMillis;
      delete (eventData as Record<string, unknown>).endAtMillis;
      delete (eventData as Record<string, unknown>).cancellationDeadlineMillis;
      if (mode === "create") {
        transaction.create(eventRef, {
          ...eventData,
          applicantCount: 0,
          popularityScore: 0,
          waitlistNextSequence: 1,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else {
        transaction.update(eventRef, {
          ...eventData,
          revisionReason: FieldValue.delete(),
          reviewNote: FieldValue.delete(),
          reviewedBy: FieldValue.delete(),
          reviewedAt: FieldValue.delete(),
          moderationReason: FieldValue.delete(),
        });
      }
    });
    return {eventId, status: "pending_review"};
  },
);

export const submitApplication = onCall(
  {enforceAppCheck: enforceCallableAppCheck},
  async (request) => {
    const userId = request.auth?.uid;
    const eventId = request.data?.eventId;
    const participantMessage = String(
      request.data?.participantMessage ?? "",
    ).trim();
    const accessibilityNeeds = String(
      request.data?.accessibilityNeeds ?? "",
    ).trim();
    const emergencyContact = String(
      request.data?.emergencyContact ?? "",
    ).trim();
    const consentAccepted = request.data?.consentAccepted === true;
    const sensitiveInfoConsent = request.data?.sensitiveInfoConsent === true;
    const emergencyContactAuthorityConfirmed =
      request.data?.emergencyContactAuthorityConfirmed === true;
    const submittedAnswers = Array.isArray(request.data?.answers) ?
      request.data.answers :
      [];
    if (!userId) throw new HttpsError("unauthenticated", "Login required.");
    if (!isFunctionsEmulator && request.auth?.token.email_verified !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Email verification is required.",
      );
    }
    if (typeof eventId !== "string" || eventId.length < 3) {
      throw new HttpsError("invalid-argument", "Event ID is required.");
    }
    if (
      !consentAccepted ||
      (accessibilityNeeds.length > 0 && !sensitiveInfoConsent) ||
      (emergencyContact.length > 0 && !emergencyContactAuthorityConfirmed) ||
      participantMessage.length > 500 ||
      accessibilityNeeds.length > 500 ||
      emergencyContact.length > 200
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Application details are invalid.",
      );
    }
    if (
      submittedAnswers.length > 8 ||
      !submittedAnswers.every((answer: unknown) => {
        if (!answer || typeof answer !== "object") return false;
        const item = answer as Record<string, unknown>;
        return (
          typeof item.questionId === "string" &&
          item.questionId.length >= 1 &&
          item.questionId.length <= 40 &&
          typeof item.label === "string" &&
          item.label.length <= 120 &&
          ((typeof item.value === "string" && item.value.length <= 1000) ||
            typeof item.value === "boolean")
        );
      })
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Application answers are invalid.",
      );
    }

    const applicationId = `${eventId}_${userId}`;
    const applicationRef = db.doc(`eventApplications/${applicationId}`);
    const eventRef = db.doc(`events/${eventId}`);
    const userRef = db.doc(`users/${userId}`);
    const roomRef = db.doc(`chatRooms/${applicationId}`);
    const messageRef = roomRef.collection("messages").doc();
    const eventRoomRef = db.doc(`chatRooms/${eventChatRoomId(eventId)}`);
    const provisionLogRef = db.doc(`thirdPartyProvisionLogs/${applicationId}`);
    let applicationStatus: "pending" | "waitlisted" = "pending";
    let waitlistPosition = 0;
    let waitlistSequence = 0;
    let hasSensitiveAnswers = false;
    let validatedAnswers: Array<{
      questionId: string;
      label: string;
      value: string | boolean;
    }> = [];

    await db.runTransaction(async (transaction) => {
      applicationStatus = "pending";
      waitlistPosition = 0;
      waitlistSequence = 0;
      hasSensitiveAnswers = false;
      validatedAnswers = [];
      const [userSnapshot, eventSnapshot, applicationSnapshot] =
        await transaction.getAll(userRef, eventRef, applicationRef);
      if (!userSnapshot.exists || userSnapshot.data()?.role !== "student") {
        throw new HttpsError("permission-denied", "Student account required.");
      }
      if (userSnapshot.data()?.status !== "active") {
        throw new HttpsError("permission-denied", "Account is not active.");
      }
      if (!eventSnapshot.exists) {
        throw new HttpsError("failed-precondition", "Event is not available.");
      }
      if (applicationSnapshot.exists) {
        throw new HttpsError("already-exists", "Already applied.");
      }

      const eventData = eventSnapshot.data() ?? {};
      if (!hasRequiredCommerceDisclosure(eventData)) {
        throw new HttpsError(
          "failed-precondition",
          "有料イベントの法定表示を確認できないため申込みできません。",
        );
      }
      const startAtMillis =
        eventData.startAt instanceof Timestamp ?
          eventData.startAt.toMillis() :
          Number.NaN;
      if (
        !isApplicationWindowOpen(
          String(eventData.status ?? ""),
          startAtMillis,
          Date.now(),
        )
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Event application period has ended.",
        );
      }
      const normalizedAnswers = normalizeApplicationAnswers(
        eventData.applicationQuestions,
        submittedAnswers,
      );
      if (!normalizedAnswers) {
        throw new HttpsError(
          "invalid-argument",
          "申込質問への回答を確認してください。",
        );
      }
      validatedAnswers = normalizedAnswers;
      const sensitiveQuestionIds = new Set(
        (Array.isArray(eventData.applicationQuestions) ?
          eventData.applicationQuestions :
          []
        )
          .filter(
            (question: unknown) =>
              question !== null &&
              typeof question === "object" &&
              (question as Record<string, unknown>).containsSensitiveInfo ===
                true,
          )
          .map((question: unknown) =>
            String((question as Record<string, unknown>).id ?? ""),
          ),
      );
      hasSensitiveAnswers = normalizedAnswers.some(
        (answer) =>
          sensitiveQuestionIds.has(answer.questionId) &&
          (typeof answer.value === "string" ?
            answer.value.trim().length > 0 :
            answer.value === true),
      );
      if (hasSensitiveAnswers && !sensitiveInfoConsent) {
        throw new HttpsError(
          "invalid-argument",
          "要配慮個人情報を含む申込回答への明示的な同意が必要です。",
        );
      }
      const currentCount = Number(eventData.applicantCount ?? 0);
      const capacity = Number(eventData.capacity ?? 0);
      if (capacity > 0 && currentCount >= capacity) {
        applicationStatus = "waitlisted";
        waitlistSequence = Math.max(
          1,
          Number(eventData.waitlistNextSequence ?? 1),
        );
        waitlistPosition = waitlistSequence;
      }
      const organizationId = eventData.createdBy;
      if (typeof organizationId !== "string" || !organizationId) {
        throw new HttpsError("failed-precondition", "Organizer is missing.");
      }

      transaction.create(applicationRef, {
        id: applicationId,
        eventId,
        eventTitle: eventData.title,
        studentId: userId,
        studentName: userSnapshot.data()?.displayName ?? "学生",
        studentNameLower: String(
          userSnapshot.data()?.displayName ?? "学生",
        ).toLocaleLowerCase("ja-JP"),
        studentProfileImageUrl: userSnapshot.data()?.profileImageUrl ?? null,
        organizationName: eventData.organizationName,
        organizationId,
        eventStartAt: eventData.startAt,
        eventEndAt: eventData.endAt ?? eventData.startAt,
        status: applicationStatus,
        participantMessage,
        accessibilityNeeds,
        emergencyContact,
        consentAccepted,
        sensitiveInfoConsent,
        emergencyContactAuthorityConfirmed,
        answers: validatedAnswers,
        ...(applicationStatus === "waitlisted" ?
          {
            waitlistPosition,
            waitlistSequence,
          } :
          {}),
        createdAt: FieldValue.serverTimestamp(),
      });
      if (applicationStatus === "pending") {
        transaction.update(eventRef, {
          applicantCount: FieldValue.increment(1),
          popularityScore: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        transaction.update(eventRef, {
          waitlistNextSequence: waitlistSequence + 1,
          popularityScore: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.create(roomRef, {
        id: applicationId,
        roomType: "application",
        applicationId,
        eventId,
        eventTitle: eventData.title,
        studentId: userId,
        studentName: userSnapshot.data()?.displayName ?? "学生",
        organizationName: eventData.organizationName,
        organizationId,
        participantIds: [userId, organizationId],
        memberCount: 2,
        status: "active",
        lastMessageText:
          applicationStatus === "waitlisted" ?
            "キャンセル待ちに登録しました。" :
            "参加申請を送信しました。主催者からの連絡をお待ちください。",
        lastMessageAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.set(
        eventRoomRef,
        {
          id: eventChatRoomId(eventId),
          roomType: "event",
          applicationId: eventChatRoomId(eventId),
          eventId,
          eventTitle: eventData.title,
          studentId: "",
          studentName: "",
          organizationName: eventData.organizationName,
          organizationId,
          memberCount: FieldValue.increment(1),
          status: "active",
          lastMessageText:
            "イベント全体チャットに参加しました。過去のやり取りも確認できます。",
          lastMessageAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      transaction.set(roomRef.collection("members").doc(userId), {
        userId,
        role: "student",
        displayName: userSnapshot.data()?.displayName ?? "学生",
        joinedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(roomRef.collection("members").doc(organizationId), {
        userId: organizationId,
        role: "organization",
        displayName: eventData.organizationName,
        joinedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(eventRoomRef.collection("members").doc(userId), {
        userId,
        role: "student",
        displayName: userSnapshot.data()?.displayName ?? "学生",
        joinedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(eventRoomRef.collection("members").doc(organizationId), {
        userId: organizationId,
        role: "organization",
        displayName: eventData.organizationName,
        joinedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(messageRef, {
        roomId: applicationId,
        senderId: userId,
        senderName: "Aizu Connect",
        type: "text",
        text: "参加申請を送信しました。主催者からの連絡をお待ちください。",
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.create(provisionLogRef, {
        applicationId,
        userId,
        userDisplayName: userSnapshot.data()?.displayName ?? "学生",
        recipientId: organizationId,
        recipientName: eventData.organizationName,
        eventId,
        legalBasis: "本人同意",
        consentAccepted: true,
        sensitiveInfoConsent,
        emergencyContactAuthorityConfirmed,
        dataCategories: [
          "表示名",
          ...(userSnapshot.data()?.profileImageUrl ? ["プロフィール画像"] : []),
          "参加申請情報",
          ...(accessibilityNeeds ? ["必要な配慮"] : []),
          ...(hasSensitiveAnswers ? ["要配慮個人情報を含む申込回答"] : []),
          ...(emergencyContact ? ["緊急連絡先"] : []),
        ],
        providedAt: FieldValue.serverTimestamp(),
        expiresAt: thirdPartyRecordExpiry(),
      });
    });

    return {applicationId, status: applicationStatus, waitlistPosition};
  },
);

export const createEventChatRoom = onDocumentCreated(
  {document: "events/{eventId}", retry: true},
  async (event) => {
    const eventData = event.data?.data();
    if (!eventData || typeof eventData.createdBy !== "string") return;
    const roomId = eventChatRoomId(event.params.eventId);
    const roomRef = db.doc(`chatRooms/${roomId}`);
    const memberRef = roomRef.collection("members").doc(eventData.createdBy);
    const welcomeRef = roomRef.collection("messages").doc("welcome");
    const checkInRef = db.doc(`eventCheckIns/${event.params.eventId}`);
    await db.runTransaction(async (transaction) => {
      const [room, member, welcome, checkIn] = await transaction.getAll(
        roomRef,
        memberRef,
        welcomeRef,
        checkInRef,
      );
      if (!room.exists) {
        transaction.create(roomRef, {
          id: roomId,
          roomType: "event",
          applicationId: roomId,
          eventId: event.params.eventId,
          eventTitle: eventData.title,
          studentId: "",
          studentName: "",
          organizationName: eventData.organizationName,
          organizationId: eventData.createdBy,
          memberCount: 1,
          status: "active",
          lastMessageText: "イベント全体チャットを作成しました。",
          lastMessageAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      if (!member.exists) {
        transaction.create(memberRef, {
          userId: eventData.createdBy,
          role: "organization",
          displayName: eventData.organizationName,
          joinedAt: FieldValue.serverTimestamp(),
        });
      }
      if (!welcome.exists) {
        transaction.create(welcomeRef, {
          roomId,
          senderId: "system",
          senderName: "Aizu Connect",
          type: "system",
          text: "イベント全体チャットです。参加者は参加前のやり取りも確認できます。",
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      if (!checkIn.exists) {
        transaction.create(checkInRef, {
          eventId: event.params.eventId,
          organizerId: eventData.createdBy,
          code: createCheckInCode(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  },
);

export const manageChatMessage = onCall(
  {enforceAppCheck: enforceCallableAppCheck},
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "ログインが必要です。");
    }
    const roomId = requiredDocumentId(request.data?.roomId);
    const messageId = requiredDocumentId(request.data?.messageId);
    const action = String(request.data?.action ?? "");
    if (!isFunctionsEmulator && request.auth?.token.email_verified !== true) {
      throw new HttpsError("permission-denied", "メール認証が必要です。");
    }
    const userSnapshot = await db.doc(`users/${userId}`).get();
    if (
      !userSnapshot.exists ||
      userSnapshot.data()?.status !== "active" ||
      !["student", "organization"].includes(String(userSnapshot.data()?.role))
    ) {
      throw new HttpsError("permission-denied", "有効なアカウントが必要です。");
    }
    const roomRef = db.doc(`chatRooms/${roomId}`);
    const memberRef = roomRef.collection("members").doc(userId);
    const messageRef = roomRef.collection("messages").doc(messageId);
    await db.runTransaction(async (transaction) => {
      const [roomSnapshot, memberSnapshot, messageSnapshot] =
        await transaction.getAll(roomRef, memberRef, messageRef);
      const roomData = roomSnapshot.data();
      const legacyMember =
        Array.isArray(roomData?.participantIds) &&
        roomData.participantIds.includes(userId);
      if (!roomSnapshot.exists || (!memberSnapshot.exists && !legacyMember)) {
        throw new HttpsError(
          "permission-denied",
          "チャット参加者ではありません。",
        );
      }
      const messageData = messageSnapshot.data();
      if (!messageSnapshot.exists || messageData?.senderId !== userId) {
        throw new HttpsError(
          "permission-denied",
          "自分のメッセージだけ変更できます。",
        );
      }
      if (messageData?.deletedAt) {
        throw new HttpsError("failed-precondition", "削除済みです。");
      }
      if (action === "edit") {
        const text = String(request.data?.text ?? "").trim();
        if (!text || text.length > 2000) {
          throw new HttpsError(
            "invalid-argument",
            "メッセージは1〜2000文字で入力してください。",
          );
        }
        const history = Array.isArray(messageData.editHistory) ?
          messageData.editHistory.slice(-19) :
          [];
        transaction.update(messageRef, {
          text,
          editedAt: FieldValue.serverTimestamp(),
          editHistory: [
            ...history,
            {
              text: String(messageData.text ?? "").slice(0, 2000),
              editedAt: Timestamp.now(),
            },
          ],
        });
        return;
      }
      if (action === "delete") {
        transaction.update(messageRef, {
          text: "このメッセージは削除されました。",
          attachmentUrl: FieldValue.delete(),
          attachmentName: FieldValue.delete(),
          attachmentType: FieldValue.delete(),
          attachmentSize: FieldValue.delete(),
          editedAt: FieldValue.delete(),
          editHistory: FieldValue.delete(),
          deletedAt: FieldValue.serverTimestamp(),
        });
        return;
      }
      throw new HttpsError("invalid-argument", "操作が不正です。");
    });
    return {status: action === "edit" ? "edited" : "deleted"};
  },
);

export const checkInToEvent = onCall(
  {enforceAppCheck: enforceCallableAppCheck},
  async (request) => {
    const userId = request.auth?.uid;
    const eventId = request.data?.eventId;
    const code = String(request.data?.code ?? "").trim();
    if (!userId) throw new HttpsError("unauthenticated", "Login required.");
    if (!isFunctionsEmulator && request.auth?.token.email_verified !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Email verification is required.",
      );
    }
    if (typeof eventId !== "string" || !/^\d{6}$/.test(code)) {
      throw new HttpsError("invalid-argument", "Check-in details are invalid.");
    }
    const applicationId = `${eventId}_${userId}`;
    const applicationRef = db.doc(`eventApplications/${applicationId}`);
    const checkInRef = db.doc(`eventCheckIns/${eventId}`);
    const eventRef = db.doc(`events/${eventId}`);
    const attemptRef = db.doc(`checkInAttempts/${applicationId}`);
    const userRef = db.doc(`users/${userId}`);
    const outcome = await db.runTransaction(async (transaction) => {
      const [
        userSnapshot,
        applicationSnapshot,
        checkInSnapshot,
        eventSnapshot,
        attemptSnapshot,
      ] = await transaction.getAll(
        userRef,
        applicationRef,
        checkInRef,
        eventRef,
        attemptRef,
      );
      if (
        !userSnapshot.exists ||
        userSnapshot.data()?.status !== "active" ||
        userSnapshot.data()?.role !== "student"
      ) {
        throw new HttpsError(
          "permission-denied",
          "Active student account required.",
        );
      }
      if (
        !applicationSnapshot.exists ||
        applicationSnapshot.data()?.studentId !== userId ||
        applicationSnapshot.data()?.status !== "confirmed"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Confirmed application required.",
        );
      }
      const eventData = eventSnapshot.data();
      const startAt =
        eventData?.startAt instanceof Timestamp ?
          eventData.startAt.toMillis() :
          Number.NaN;
      const endAt =
        eventData?.endAt instanceof Timestamp ?
          eventData.endAt.toMillis() :
          undefined;
      const nowMillis = Date.now();
      if (
        !eventSnapshot.exists ||
        !isCheckInWindowOpen(
          String(eventData?.status ?? ""),
          startAt,
          endAt,
          nowMillis,
        )
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Check-in is not available at this time.",
        );
      }
      const attemptData = attemptSnapshot.data();
      const lockedUntil = attemptData?.lockedUntil;
      const decision = evaluateCheckInAttempt({
        failedAttempts: Number(attemptData?.failedAttempts ?? 0),
        lockedUntilMillis:
          lockedUntil instanceof Timestamp ? lockedUntil.toMillis() : undefined,
        nowMillis,
        codeMatches:
          checkInSnapshot.exists && checkInSnapshot.data()?.code === code,
      });
      if (!decision.allowed) {
        if (
          !(lockedUntil instanceof Timestamp) ||
          lockedUntil.toMillis() <= nowMillis
        ) {
          transaction.set(
            attemptRef,
            {
              eventId,
              userId,
              failedAttempts: decision.failedAttempts,
              lockedUntil:
                decision.lockedUntilMillis === undefined ?
                  FieldValue.delete() :
                  Timestamp.fromMillis(decision.lockedUntilMillis),
              lastAttemptAt: FieldValue.serverTimestamp(),
              expiresAt: Timestamp.fromMillis(
                nowMillis + 30 * 24 * 60 * 60 * 1000,
              ),
            },
            {merge: true},
          );
        }
        return decision;
      }
      transaction.update(applicationRef, {
        status: "attended",
        checkedInAt: FieldValue.serverTimestamp(),
        checkInMethod: "event_code",
      });
      if (attemptSnapshot.exists) transaction.delete(attemptRef);
      return decision;
    });
    if (!outcome.allowed) {
      if (outcome.locked) {
        throw new HttpsError(
          "resource-exhausted",
          "入力回数が上限に達しました。15分後にもう一度お試しください。",
        );
      }
      throw new HttpsError("permission-denied", "Check-in code is incorrect.");
    }
    return {status: "attended"};
  },
);

export {
  notifyApplicationCreated,
  notifyApplicationUpdated,
  notifyEventPublished,
  notifyEventUnavailable,
  notifyChatMessageCreated,
} from "./triggers/notifications";
export {
  purgeExpiredLegalRecords,
  sendEventReminders,
} from "./scheduled/maintenance";
