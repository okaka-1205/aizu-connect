import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {randomInt} from "node:crypto";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {setGlobalOptions} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {
  isEventPlanEditableStatus,
  isCheckInWindowOpen,
  isApplicationWindowOpen,
  normalizeApplicationAnswers,
  evaluateCheckInAttempt,
  normalizeEventPlanInput,
} from "./applicationLogic";
import {db} from "./lib/firebaseAdmin";
import {hasRequiredCommerceDisclosure} from "./lib/eventValidation";
import {requiredDocumentId} from "./lib/callableValidation";

export {healthCheck} from "./http/healthCheck";
export {reportClientError} from "./callables/reportClientError";
export {getAdminDashboardMetrics} from "./callables/adminDashboardMetrics";

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

export const markAllNotificationsRead = onCall(
  {enforceAppCheck: enforceCallableAppCheck},
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) throw new HttpsError("unauthenticated", "Login required.");

    const userSnapshot = await db.doc(`users/${userId}`).get();
    if (!userSnapshot.exists || userSnapshot.data()?.status !== "active") {
      throw new HttpsError("permission-denied", "Active account required.");
    }

    let updatedCount = 0;
    let hasUnreadNotifications = true;
    while (hasUnreadNotifications) {
      const unreadSnapshot = await db
        .collection("notifications")
        .where("recipientId", "==", userId)
        .where("isRead", "==", false)
        .limit(400)
        .get();
      if (unreadSnapshot.empty) break;

      const batch = db.batch();
      unreadSnapshot.docs.forEach((notification) => {
        batch.update(notification.ref, {
          isRead: true,
          readAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
      updatedCount += unreadSnapshot.size;
      hasUnreadNotifications = unreadSnapshot.size === 400;
    }

    return {updatedCount};
  },
);

export {adminManageResource} from "./callables/adminManageResource";
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
      const [userSnapshot, eventSnapshot, applicationSnapshot, roomSnapshot] =
        await transaction.getAll(
          userRef,
          eventRef,
          applicationRef,
          eventRoomRef,
        );
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
          memberCount: roomSnapshot.exists ? FieldValue.increment(1) : 2,
          status: "active",
          ...(!roomSnapshot.exists ?
            {
              lastMessageText:
                  "イベント全体チャットに参加しました。過去のやり取りも確認できます。",
              lastMessageAt: FieldValue.serverTimestamp(),
              createdAt: FieldValue.serverTimestamp(),
            } :
            {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
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
      // Older rooms have no preview message ID; resolve it before writing.
      const latest = roomData?.lastMessageId ?
        undefined :
        await transaction.get(
          roomRef
            .collection("messages")
            .orderBy("createdAt", "desc")
            .limit(1),
        );
      const isLatest =
        (roomData?.lastMessageId ?? latest?.docs[0]?.id) === messageId;
      if (action === "edit") {
        if (roomData?.status !== "active") {
          throw new HttpsError(
            "failed-precondition",
            "終了したチャットのメッセージは編集できません。",
          );
        }
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
        if (isLatest) {
          transaction.update(roomRef, {
            lastMessageId: messageId,
            lastMessageText: text,
          });
        }
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
        if (isLatest) {
          transaction.update(roomRef, {
            lastMessageId: messageId,
            lastMessageText: "このメッセージは削除されました。",
          });
        }
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
