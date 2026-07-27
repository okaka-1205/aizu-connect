import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {randomInt} from "node:crypto";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import {setGlobalOptions} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  applicationStatusMessage,
  isCheckInWindowOpen,
  isApplicationWindowOpen,
  matchesSavedSearch,
  normalizeEventPlanInput,
  reminderBucketForHoursUntil,
  reminderNotificationPath,
  shouldDecrementApplicantCount,
  shouldIncrementApplicantCount,
  shouldNotifyPublishedEventStudent,
  shouldSetChatRoomReadOnly,
} from "./applicationLogic";

initializeApp();
setGlobalOptions({maxInstances: 10, region: "asia-northeast1"});

const db = getFirestore();
const adminAuth = getAuth();
const isFunctionsEmulator = process.env.FUNCTIONS_EMULATOR === "true";

const notificationEnabled = async (
  userId: string,
  key: "newEvents" | "applicationUpdates" | "chatMessages" | "eventReminders",
) => {
  const snapshot = await db.doc(`notificationPreferences/${userId}`).get();
  return snapshot.data()?.[key] !== false;
};

const createNotificationOnce = async (
  path: string,
  data: Record<string, unknown>,
) => {
  try {
    await db.doc(path).create(data);
  } catch (error) {
    const code = (error as {code?: unknown}).code;
    if (code !== 6 && code !== "already-exists") throw error;
  }
};

const eventChatRoomId = (eventId: string) => `event_${eventId}`;
const createCheckInCode = () =>
  String(randomInt(0, 1_000_000)).padStart(6, "0");

type AdminActor = {
  uid: string;
  displayName: string;
};

const requireAdmin = async (
  userId: string | undefined,
): Promise<AdminActor> => {
  if (!userId) {
    throw new HttpsError("unauthenticated", "ログインが必要です。");
  }
  const snapshot = await db.doc(`users/${userId}`).get();
  const data = snapshot.data();
  if (
    !snapshot.exists ||
    data?.role !== "admin" ||
    data?.status !== "active"
  ) {
    throw new HttpsError(
      "permission-denied",
      "有効な管理者権限を確認できませんでした。",
    );
  }
  return {
    uid: userId,
    displayName: String(data.displayName || "Aizu Connect 運営").slice(0, 80),
  };
};

const requiredAdminText = (
  value: unknown,
  label: string,
  maxLength = 1000,
) => {
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
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(value)
  ) {
    throw new HttpsError("invalid-argument", "対象IDが不正です。");
  }
  return value;
};

const writeAuditLog = async (
  actor: AdminActor,
  action: string,
  targetType: "event" | "user" | "report",
  targetId: string,
  targetTitle: string,
  reason: string,
) => {
  await db.collection("auditLogs").add({
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
      snapshot.docs.map((document) => db.recursiveDelete(document.ref)),
    );
  }
};

const resolveReportsForTarget = async (
  targetType: "event" | "user",
  targetId: string,
  resolution: string,
) => {
  const snapshot = await db
    .collection("reports")
    .where("targetId", "==", targetId)
    .limit(200)
    .get();
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
};

const deleteEventData = async (eventId: string, resolution: string) => {
  await resolveReportsForTarget("event", eventId, resolution);
  await Promise.all([
    deleteMatchingDocuments("eventApplications", "eventId", eventId),
    deleteMatchingDocuments("chatRooms", "eventId", eventId),
    deleteMatchingDocuments("savedEvents", "eventId", eventId),
    deleteMatchingDocuments("notifications", "targetId", eventId),
    db.recursiveDelete(db.doc(`eventCheckIns/${eventId}`)),
  ]);
  await db.recursiveDelete(db.doc(`events/${eventId}`));
};

const deleteUserData = async (userId: string, resolution: string) => {
  const ownedEvents = await db
    .collection("events")
    .where("createdBy", "==", userId)
    .limit(200)
    .get();
  for (const eventDocument of ownedEvents.docs) {
    await deleteEventData(eventDocument.id, resolution);
  }

  const applications = await db
    .collection("eventApplications")
    .where("studentId", "==", userId)
    .limit(500)
    .get();
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

  const rooms = await db
    .collection("chatRooms")
    .where("participantIds", "array-contains", userId)
    .limit(500)
    .get();
  for (const room of rooms.docs) {
    if (room.data().roomType === "event") {
      await room.ref.update({
        participantIds: FieldValue.arrayRemove(userId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await db.recursiveDelete(room.ref);
    }
  }

  await resolveReportsForTarget("user", userId, resolution);
  await Promise.all([
    deleteMatchingDocuments("activities", "userId", userId),
    deleteMatchingDocuments("notifications", "recipientId", userId),
    deleteMatchingDocuments("savedEvents", "userId", userId),
    deleteMatchingDocuments("chatPreferences", "userId", userId),
    deleteMatchingDocuments("reports", "reporterId", userId),
    db.recursiveDelete(db.doc(`notificationPreferences/${userId}`)),
    db.recursiveDelete(db.doc(`savedSearches/${userId}_default`)),
    db.recursiveDelete(db.doc(`studentProfiles/${userId}`)),
    db.recursiveDelete(db.doc(`organizations/${userId}`)),
    db.recursiveDelete(db.doc(`publicOrganizerProfiles/${userId}`)),
  ]);
  await db.recursiveDelete(db.doc(`users/${userId}`));
  try {
    await adminAuth.deleteUser(userId);
  } catch (error) {
    if ((error as {code?: string}).code !== "auth/user-not-found") throw error;
  }
};

export const adminManageResource = onCall(async (request) => {
  const actor = await requireAdmin(request.auth?.uid);
  const action = String(request.data?.action ?? "");
  const targetId = requiredDocumentId(request.data?.targetId);
  const reason = requiredAdminText(request.data?.reason, "対応理由");

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
    );
    return {status};
  }

  if (["suspend_user", "restore_user", "delete_user"].includes(action)) {
    if (targetId === actor.uid) {
      throw new HttpsError(
        "failed-precondition",
        "自分自身の管理者アカウントは操作できません。",
      );
    }
    const userRef = db.doc(`users/${targetId}`);
    const user = await userRef.get();
    if (!user.exists) {
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
    if (action === "delete_user") {
      await deleteUserData(
        targetId,
        `管理者がアカウントを削除しました: ${reason}`.slice(0, 1000),
      );
      await writeAuditLog(
        actor,
        "user_delete",
        "user",
        targetId,
        title,
        reason,
      );
      return {status: "deleted"};
    }
    const status = action === "suspend_user" ? "suspended" : "active";
    await userRef.update({
      status,
      moderationReason:
        status === "suspended" ? reason : FieldValue.delete(),
      ...(status === "active" ? {reviewReason: FieldValue.delete()} : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
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
    );
    return {status};
  }

  if (
    ["unpublish_event", "restore_event", "delete_event"].includes(action)
  ) {
    const eventRef = db.doc(`events/${targetId}`);
    const event = await eventRef.get();
    if (!event.exists) {
      throw new HttpsError("not-found", "イベントが見つかりません。");
    }
    const eventData = event.data();
    const title = String(eventData?.title || "イベント");
    if (action === "delete_event") {
      await deleteEventData(
        targetId,
        `管理者がイベントを削除しました: ${reason}`.slice(0, 1000),
      );
      await writeAuditLog(
        actor,
        "event_delete",
        "event",
        targetId,
        title,
        reason,
      );
      return {status: "deleted"};
    }
    const status = action === "unpublish_event" ?
      "unpublished" :
      "published";
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
        type: status === "unpublished" ? "event_unpublished" : "event_restored",
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
    );
    return {status};
  }

  throw new HttpsError("invalid-argument", "管理操作が不正です。");
});

export const saveEventPlan = onCall(async (request) => {
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
  if (
    !userSnapshot.exists ||
    userData?.status !== "active" ||
    !["student", "organization"].includes(userData?.role) ||
    (!isFunctionsEmulator &&
      request.auth?.token.email_verified !== true)
  ) {
    throw new HttpsError("permission-denied", "Active account required.");
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
        !["published", "revision_required"].includes(
          eventSnapshot.data()?.status,
        ))
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Event cannot be edited.",
      );
    }
    const startAt = Timestamp.fromMillis(plan.startAtMillis);
    const endAt = Timestamp.fromMillis(plan.endAtMillis);
    const eventData = {
      ...plan,
      startAt,
      endAt,
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
    if (mode === "create") {
      transaction.create(eventRef, {
        ...eventData,
        applicantCount: 0,
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
});

export const submitApplication = onCall(async (request) => {
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
    participantMessage.length > 500 ||
    accessibilityNeeds.length > 500 ||
    emergencyContact.length > 200
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Application details are invalid.",
    );
  }

  const applicationId = `${eventId}_${userId}`;
  const applicationRef = db.doc(`eventApplications/${applicationId}`);
  const eventRef = db.doc(`events/${eventId}`);
  const userRef = db.doc(`users/${userId}`);
  const roomRef = db.doc(`chatRooms/${applicationId}`);
  const messageRef = roomRef.collection("messages").doc();
  const eventRoomRef = db.doc(`chatRooms/${eventChatRoomId(eventId)}`);
  let applicationStatus: "pending" | "waitlisted" = "pending";
  let waitlistPosition = 0;

  await db.runTransaction(async (transaction) => {
    applicationStatus = "pending";
    waitlistPosition = 0;
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
    const currentCount = Number(eventData.applicantCount ?? 0);
    const capacity = Number(eventData.capacity ?? 0);
    if (capacity > 0 && currentCount >= capacity) {
      applicationStatus = "waitlisted";
      const waitlistSnapshot = await transaction.get(
        db
          .collection("eventApplications")
          .where("eventId", "==", eventId)
          .where("status", "==", "waitlisted")
          .limit(500),
      );
      waitlistPosition = waitlistSnapshot.size + 1;
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
      studentProfileImageUrl: userSnapshot.data()?.profileImageUrl ?? null,
      organizationName: eventData.organizationName,
      organizationId,
      status: applicationStatus,
      participantMessage,
      accessibilityNeeds,
      emergencyContact,
      consentAccepted,
      ...(applicationStatus === "waitlisted" ? {waitlistPosition} : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
    if (applicationStatus === "pending") {
      transaction.update(eventRef, {
        applicantCount: FieldValue.increment(1),
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
        participantIds: FieldValue.arrayUnion(userId, organizationId),
        status: "active",
        lastMessageText:
          "イベント全体チャットに参加しました。過去のやり取りも確認できます。",
        lastMessageAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    transaction.create(messageRef, {
      roomId: applicationId,
      senderId: userId,
      senderName: "Aizu Connect",
      type: "text",
      text: "参加申請を送信しました。主催者からの連絡をお待ちください。",
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return {applicationId, status: applicationStatus, waitlistPosition};
});

export const createEventChatRoom = onDocumentCreated(
  "events/{eventId}",
  async (event) => {
    const eventData = event.data?.data();
    if (!eventData || typeof eventData.createdBy !== "string") return;
    const roomId = eventChatRoomId(event.params.eventId);
    await db.doc(`chatRooms/${roomId}`).set(
      {
        id: roomId,
        roomType: "event",
        applicationId: roomId,
        eventId: event.params.eventId,
        eventTitle: eventData.title,
        studentId: "",
        studentName: "",
        organizationName: eventData.organizationName,
        organizationId: eventData.createdBy,
        participantIds: [eventData.createdBy],
        status: "active",
        lastMessageText: "イベント全体チャットを作成しました。",
        lastMessageAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    await db.doc(`chatRooms/${roomId}/messages/welcome`).set({
      roomId,
      senderId: "system",
      senderName: "Aizu Connect",
      type: "system",
      text: "イベント全体チャットです。参加者は参加前のやり取りも確認できます。",
      createdAt: FieldValue.serverTimestamp(),
    });
    const checkInRef = db.doc(`eventCheckIns/${event.params.eventId}`);
    await db.runTransaction(async (transaction) => {
      const checkInSnapshot = await transaction.get(checkInRef);
      if (checkInSnapshot.exists) return;
      transaction.create(checkInRef, {
        eventId: event.params.eventId,
        organizerId: eventData.createdBy,
        code: createCheckInCode(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  },
);

export const checkInToEvent = onCall(async (request) => {
  const userId = request.auth?.uid;
  const eventId = request.data?.eventId;
  const code = String(request.data?.code ?? "").trim();
  if (!userId) throw new HttpsError("unauthenticated", "Login required.");
  if (typeof eventId !== "string" || !/^\d{6}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Check-in details are invalid.");
  }
  const applicationId = `${eventId}_${userId}`;
  const [applicationSnapshot, checkInSnapshot, eventSnapshot] =
    await Promise.all([
      db.doc(`eventApplications/${applicationId}`).get(),
      db.doc(`eventCheckIns/${eventId}`).get(),
      db.doc(`events/${eventId}`).get(),
    ]);
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
  if (!checkInSnapshot.exists || checkInSnapshot.data()?.code !== code) {
    throw new HttpsError("permission-denied", "Check-in code is incorrect.");
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
  if (
    !eventSnapshot.exists ||
    !isCheckInWindowOpen(
      String(eventData?.status ?? ""),
      startAt,
      endAt,
      Date.now(),
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Check-in is not available at this time.",
    );
  }
  await applicationSnapshot.ref.update({
    status: "attended",
    checkedInAt: FieldValue.serverTimestamp(),
    checkInMethod: "event_code",
  });
  return {status: "attended"};
});

export const notifyApplicationCreated = onDocumentCreated(
  "eventApplications/{applicationId}",
  async (event) => {
    const application = event.data?.data();
    if (
      !application ||
      !application.organizationId ||
      application.organizationId === "unknown"
    ) {
      return;
    }

    if (
      await notificationEnabled(
        application.organizationId,
        "applicationUpdates",
      )
    ) {
      await createNotificationOnce(
        `notifications/application_submitted_${event.params.applicationId}`,
        {
          recipientId: application.organizationId,
          type: "application_submitted",
          title: "新しい参加申請があります",
          body:
          `${application.studentName}さんが「${application.eventTitle}」へ` +
          (application.status === "waitlisted" ?
            "キャンセル待ち登録しました。" :
            "申請しました。"),
          targetType: "application",
          targetId: event.params.applicationId,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        },
      );
    }
  },
);

export const notifyApplicationUpdated = onDocumentUpdated(
  "eventApplications/{applicationId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status === after.status) return;

    if (await notificationEnabled(after.studentId, "applicationUpdates")) {
      const notificationId = [
        "application_updated",
        event.params.applicationId,
        after.status,
      ].join("_");
      await createNotificationOnce(`notifications/${notificationId}`, {
        recipientId: after.studentId,
        type: "application_updated",
        title: "参加申請が更新されました",
        body: applicationStatusMessage(after.status),
        targetType: "application",
        targetId: event.params.applicationId,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (after.status === "attended") {
      const eventSnapshot = await db.doc(`events/${after.eventId}`).get();
      const eventData = eventSnapshot.data() ?? {};
      const eventStartAt = eventSnapshot.data()?.startAt;
      const occurredAt =
        eventStartAt instanceof Timestamp ? eventStartAt : Timestamp.now();
      const occurredDate = occurredAt.toDate();
      await db
        .collection("activities")
        .doc(event.params.applicationId)
        .set(
          {
            id: event.params.applicationId,
            userId: after.studentId,
            eventId: after.eventId,
            title: after.eventTitle,
            organizationId: after.organizationId,
            organizationName: after.organizationName,
            certificateId: `AC-${event.params.applicationId}`,
            participantRole: "参加者",
            takeaways: Array.isArray(eventData.takeaways) ?
              eventData.takeaways.slice(0, 3) :
              [],
            verificationStatus: "verified",
            verifiedBy: after.organizationId,
            occurredAt,
            activityMonth: occurredDate.getMonth() + 1,
            activityYear: occurredDate.getFullYear(),
            createdAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
    }
    if (typeof after.eventId === "string") {
      const shouldDecrement = shouldDecrementApplicantCount(
        before.status,
        after.status,
      );
      const shouldIncrement =
        shouldIncrementApplicantCount(before.status, after.status) &&
        after.promotedFromWaitlist !== true;
      if (shouldDecrement || shouldIncrement) {
        const receiptId = [
          "application",
          event.params.applicationId,
          before.status,
          after.status,
        ].join("_");
        const receiptRef = db.doc(`functionReceipts/${receiptId}`);
        const availabilityEventRef = db.doc(`events/${after.eventId}`);
        await db.runTransaction(async (transaction) => {
          const receiptSnapshot = await transaction.get(receiptRef);
          if (receiptSnapshot.exists) return;
          const availabilityEvent = await transaction.get(
            availabilityEventRef,
          );
          let nextWaitlisted:
            | FirebaseFirestore.QueryDocumentSnapshot
            | undefined;
          if (
            shouldDecrement &&
            availabilityEvent.exists &&
            availabilityEvent.data()?.status !== "cancelled"
          ) {
            const waitlistSnapshot = await transaction.get(
              db
                .collection("eventApplications")
                .where("eventId", "==", after.eventId)
                .where("status", "==", "waitlisted")
                .limit(100),
            );
            nextWaitlisted = [...waitlistSnapshot.docs].sort(
              (left, right) =>
                (left.data().createdAt?.toMillis?.() ?? 0) -
                (right.data().createdAt?.toMillis?.() ?? 0),
            )[0];
          }
          if (
            availabilityEvent.exists &&
            availabilityEvent.data()?.status !== "cancelled"
          ) {
            const currentCount = Math.max(
              0,
              Number(availabilityEvent.data()?.applicantCount ?? 0),
            );
            if (shouldDecrement && nextWaitlisted) {
              transaction.update(nextWaitlisted.ref, {
                status: "pending",
                waitlistPosition: FieldValue.delete(),
                promotedFromWaitlist: true,
              });
            } else if (shouldDecrement) {
              transaction.update(availabilityEventRef, {
                applicantCount: Math.max(0, currentCount - 1),
                updatedAt: FieldValue.serverTimestamp(),
              });
            } else if (shouldIncrement) {
              transaction.update(availabilityEventRef, {
                applicantCount: currentCount + 1,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          }
          transaction.create(receiptRef, {
            applicationId: event.params.applicationId,
            beforeStatus: before.status,
            afterStatus: after.status,
            processedAt: FieldValue.serverTimestamp(),
          });
        });
      }
    }
    if (
      shouldSetChatRoomReadOnly(after.status) &&
      typeof event.params.applicationId === "string"
    ) {
      await db.doc(`chatRooms/${event.params.applicationId}`).set(
        {
          status: "read_only",
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    }
  },
);

export const notifyEventPublished = onDocumentUpdated(
  "events/{eventId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (
      !before ||
      !after ||
      before.status === after.status ||
      after.status !== "published"
    ) {
      return;
    }

    const isRestoration = before.status === "unpublished";
    const notificationWrites: {
      path: string;
      data: Record<string, unknown>;
    }[] = [];
    if (!isRestoration) {
      notificationWrites.push({
        path: `notifications/event_published_${event.params.eventId}`,
        data: {
          recipientId: after.createdBy,
          type: "event_published",
          title: "イベントが公開されました",
          body: `「${after.title}」がAizu Connectで公開されました。`,
          targetType: "event",
          targetId: event.params.eventId,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        },
      });
    }

    const students = await db
      .collection("users")
      .where("role", "==", "student")
      .where("status", "==", "active")
      .limit(498)
      .get();
    const preferences = await Promise.all(
      students.docs.map(async (student) => {
        const [enabled, savedSearch] = await Promise.all([
          notificationEnabled(student.id, "newEvents"),
          db.doc(`savedSearches/${student.id}_default`).get(),
        ]);
        return {
          id: student.id,
          enabled,
          savedSearch: savedSearch.data(),
        };
      }),
    );
    for (const preference of preferences) {
      if (
        isRestoration ||
        !shouldNotifyPublishedEventStudent(
          preference.id,
          after.createdBy,
          preference.enabled,
        ) ||
        !matchesSavedSearch(
          preference.savedSearch,
          {
            ...after,
            startAtMillis:
              after.startAt instanceof Timestamp ?
                after.startAt.toMillis() :
                Number.NaN,
          },
          Date.now(),
        )
      ) {
        continue;
      }
      notificationWrites.push({
        path:
          `notifications/new_event_${event.params.eventId}_${preference.id}`,
        data: {
          recipientId: preference.id,
          type: "new_event",
          title: "新しいイベントが公開されました",
          body: `「${after.title}」をチェックしてみませんか？`,
          targetType: "event",
          targetId: event.params.eventId,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        },
      });
    }
    const organizerEvents = await db
      .collection("events")
      .where("createdBy", "==", after.createdBy)
      .limit(500)
      .get();
    const publishedEventCount = organizerEvents.docs.filter(
      (eventDocument) => eventDocument.data().status === "published",
    ).length;
    await Promise.all([
      ...notificationWrites.map(({path, data}) =>
        createNotificationOnce(path, data),
      ),
      db.doc(`publicOrganizerProfiles/${after.createdBy}`).set(
        {
          userId: after.createdBy,
          displayName: after.organizationName,
          description:
          after.organizerDescription ??
          "参加者が安心して参加できるイベント運営を行います。",
          experience:
          after.organizerExperience ?? "Aizu Connectでイベントを企画",
          publishedEventCount,
          verified: after.organizationVerified === true,
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      ),
    ]);
  },
);

export const notifyEventUnavailable = onDocumentUpdated(
  "events/{eventId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (
      !before ||
      !after ||
      before.status === after.status ||
      !["cancelled", "unpublished"].includes(after.status)
    ) {
      return;
    }
    const applications = await db
      .collection("eventApplications")
      .where("eventId", "==", event.params.eventId)
      .limit(1000)
      .get();
    const activeApplications = applications.docs.filter((application) =>
      ["pending", "waitlisted", "confirmed"].includes(
        application.data().status,
      ),
    );
    for (let index = 0; index < activeApplications.length; index += 150) {
      const applicationChunk = activeApplications.slice(index, index + 150);
      const batch = db.batch();
      const notificationWrites: Promise<void>[] = [];
      for (const application of applicationChunk) {
        const applicationData = application.data();
        if (after.status === "cancelled") {
          batch.update(application.ref, {status: "cancelled"});
        }
        const notificationId = [
          "event_unavailable",
          event.params.eventId,
          after.status,
          application.id,
        ].join("_");
        const notificationData = {
          recipientId: applicationData.studentId,
          type:
            after.status === "cancelled" ?
              "event_cancelled" :
              "event_temporarily_unpublished",
          title:
            after.status === "cancelled" ?
              "イベントが中止になりました" :
              "イベントの公開が一時停止されました",
          body:
            after.status === "cancelled" ?
              `「${after.title}」は中止になりました。${after.cancellationReason ?? ""}` :
              `「${after.title}」は運営確認のため一時的に非公開になりました。`,
          targetType: "application",
          targetId: application.id,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        };
        if (after.status === "cancelled") {
          batch.set(
            db.doc(`notifications/${notificationId}`),
            notificationData,
          );
        } else {
          notificationWrites.push(
            createNotificationOnce(
              `notifications/${notificationId}`,
              notificationData,
            ),
          );
        }
      }
      if (after.status === "cancelled") await batch.commit();
      await Promise.all(notificationWrites);
    }
    if (after.status === "cancelled") {
      await db.doc(`chatRooms/${eventChatRoomId(event.params.eventId)}`).set(
        {
          status: "read_only",
          organizerNotice:
            after.cancellationReason ?? "このイベントは中止になりました。",
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    }
  },
);

export const notifyChatMessageCreated = onDocumentCreated(
  "chatRooms/{roomId}/messages/{messageId}",
  async (event) => {
    const message = event.data?.data();
    if (!message || message.type === "system" || !message.senderId) return;

    const room = await db.doc(`chatRooms/${event.params.roomId}`).get();
    const roomData = room.data();
    if (!roomData?.participantIds) return;

    const recipients = roomData.participantIds.filter(
      (participantId: string) => participantId !== message.senderId,
    );
    await Promise.all(
      recipients.map(async (recipientId: string) => {
        if (!(await notificationEnabled(recipientId, "chatMessages"))) return;
        const chatPreference = await db
          .doc(`chatPreferences/${event.params.roomId}_${recipientId}`)
          .get();
        if (chatPreference.data()?.muted === true) return;
        const notificationId = [
          "chat",
          event.params.roomId,
          event.params.messageId,
          recipientId,
        ].join("_");
        await createNotificationOnce(`notifications/${notificationId}`, {
          recipientId,
          type: "new_message",
          title: "新しいメッセージがあります",
          body:
            message.type === "text" ?
              `${message.senderName}さんからメッセージが届きました。` :
              `${message.senderName}さんから添付ファイルが届きました。`,
          targetType: "chat",
          targetId: event.params.roomId,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }),
    );
  },
);

export const sendEventReminders = onSchedule("every 1 hours", async () => {
  const now = Timestamp.now();
  const nextDay = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);
  const eventSnapshot = await db
    .collection("events")
    .where("status", "==", "published")
    .where("startAt", ">=", now)
    .where("startAt", "<=", nextDay)
    .limit(100)
    .get();
  const writes: { path: string; data: Record<string, unknown> }[] = [];

  for (const eventDocument of eventSnapshot.docs) {
    const eventData = eventDocument.data();
    const startAt = eventData.startAt as Timestamp;
    const hoursUntil = (startAt.toMillis() - now.toMillis()) / (60 * 60 * 1000);
    const bucket = reminderBucketForHoursUntil(hoursUntil);
    const applications = await db
      .collection("eventApplications")
      .where("eventId", "==", eventDocument.id)
      .where("status", "==", "confirmed")
      .limit(500)
      .get();
    const preferences = await Promise.all(
      applications.docs.map(async (application) => ({
        application: application.data(),
        enabled: await notificationEnabled(
          application.data().studentId,
          "eventReminders",
        ),
      })),
    );
    for (const preference of preferences) {
      if (!preference.enabled) continue;
      const studentId = preference.application.studentId;
      writes.push({
        path: reminderNotificationPath(eventDocument.id, studentId, bucket),
        data: {
          recipientId: studentId,
          type: "event_reminder",
          title:
            bucket === "2h" ? "まもなく開催です" : "明日の予定を確認しましょう",
          body: `「${eventData.title}」の開催が近づいています。`,
          targetType: "event",
          targetId: eventDocument.id,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        },
      });
    }
  }

  for (let index = 0; index < writes.length; index += 400) {
    const writeChunk = writes.slice(index, index + 400);
    await db.runTransaction(async (transaction) => {
      const references = writeChunk.map((write) => db.doc(write.path));
      const snapshots = await transaction.getAll(...references);
      snapshots.forEach((snapshot, snapshotIndex) => {
        if (!snapshot.exists) {
          transaction.create(
            references[snapshotIndex],
            writeChunk[snapshotIndex].data,
          );
        }
      });
    });
  }
});
