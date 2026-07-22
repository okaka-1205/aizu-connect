import {initializeApp} from "firebase-admin/app";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import {setGlobalOptions} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";

initializeApp();
setGlobalOptions({maxInstances: 10, region: "asia-northeast1"});

const db = getFirestore();

const notificationEnabled = async (
  userId: string,
  key: "newEvents" | "applicationUpdates" | "chatMessages" | "eventReminders",
) => {
  const snapshot = await db.doc(`notificationPreferences/${userId}`).get();
  return snapshot.data()?.[key] !== false;
};

export const submitApplication = onCall(async (request) => {
  const userId = request.auth?.uid;
  const eventId = request.data?.eventId;
  if (!userId) throw new HttpsError("unauthenticated", "Login required.");
  if (request.auth?.token.email_verified !== true) {
    throw new HttpsError(
      "failed-precondition",
      "Email verification is required.",
    );
  }
  if (typeof eventId !== "string" || eventId.length < 3) {
    throw new HttpsError("invalid-argument", "Event ID is required.");
  }

  const applicationId = `${eventId}_${userId}`;
  const applicationRef = db.doc(`eventApplications/${applicationId}`);
  const eventRef = db.doc(`events/${eventId}`);
  const userRef = db.doc(`users/${userId}`);
  const roomRef = db.doc(`chatRooms/${applicationId}`);
  const messageRef = roomRef.collection("messages").doc();

  await db.runTransaction(async (transaction) => {
    const [userSnapshot, eventSnapshot, applicationSnapshot] =
      await transaction.getAll(userRef, eventRef, applicationRef);
    if (!userSnapshot.exists || userSnapshot.data()?.role !== "student") {
      throw new HttpsError("permission-denied", "Student account required.");
    }
    if (userSnapshot.data()?.status !== "active") {
      throw new HttpsError("permission-denied", "Account is not active.");
    }
    if (!eventSnapshot.exists || eventSnapshot.data()?.status !== "published") {
      throw new HttpsError("failed-precondition", "Event is not available.");
    }
    if (applicationSnapshot.exists) {
      throw new HttpsError("already-exists", "Already applied.");
    }

    const eventData = eventSnapshot.data() ?? {};
    const currentCount = Number(eventData.applicantCount ?? 0);
    const capacity = Number(eventData.capacity ?? 0);
    if (capacity > 0 && currentCount >= capacity) {
      throw new HttpsError("resource-exhausted", "Event is full.");
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
      organizationName: eventData.organizationName,
      organizationId,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(eventRef, {
      applicantCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(roomRef, {
      id: applicationId,
      applicationId,
      eventId,
      eventTitle: eventData.title,
      studentId: userId,
      studentName: userSnapshot.data()?.displayName ?? "学生",
      organizationName: eventData.organizationName,
      participantIds: [userId, organizationId],
      status: "active",
      lastMessageText:
        "参加申請を送信しました。主催者からの連絡をお待ちください。",
      lastMessageAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(messageRef, {
      roomId: applicationId,
      senderId: userId,
      senderName: "Aizu Connect",
      type: "text",
      text: "参加申請を送信しました。主催者からの連絡をお待ちください。",
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return {applicationId};
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
      await db.collection("notifications").add({
        recipientId: application.organizationId,
        type: "application_submitted",
        title: "新しい参加申請があります",
        body:
          `${application.studentName}さんが「${application.eventTitle}」へ` +
          "申請しました。",
        targetType: "application",
        targetId: event.params.applicationId,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  },
);

export const notifyApplicationUpdated = onDocumentUpdated(
  "eventApplications/{applicationId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status === after.status) return;

    const statusMessages: Record<string, string> = {
      confirmed: "参加が確定しました。",
      rejected: "今回は参加見送りとなりました。",
      attended: "出席が確認され、活動実績に追加されました。",
      absent: "出席が確認できませんでした。",
      cancelled: "参加申請をキャンセルしました。",
    };
    if (await notificationEnabled(after.studentId, "applicationUpdates")) {
      await db.collection("notifications").add({
        recipientId: after.studentId,
        type: "application_updated",
        title: "参加申請が更新されました",
        body:
          statusMessages[after.status] ?? "参加申請の状態が更新されました。",
        targetType: "application",
        targetId: event.params.applicationId,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (after.status === "attended") {
      const eventSnapshot = await db.doc(`events/${after.eventId}`).get();
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
    const wasCounted = ["pending", "confirmed"].includes(before.status);
    if (
      wasCounted &&
      ["cancelled", "rejected"].includes(after.status) &&
      typeof after.eventId === "string"
    ) {
      await db.doc(`events/${after.eventId}`).update({
        applicantCount: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (
      ["cancelled", "rejected"].includes(after.status) &&
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

    const batch = db.batch();
    batch.set(db.collection("notifications").doc(), {
      recipientId: after.createdBy,
      type: "event_published",
      title: "イベントが公開されました",
      body: `「${after.title}」がAizu Connectで公開されました。`,
      targetType: "event",
      targetId: event.params.eventId,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    const students = await db
      .collection("users")
      .where("role", "==", "student")
      .where("status", "==", "active")
      .limit(499)
      .get();
    const preferences = await Promise.all(
      students.docs.map(async (student) => ({
        id: student.id,
        enabled: await notificationEnabled(student.id, "newEvents"),
      })),
    );
    for (const preference of preferences) {
      if (!preference.enabled || preference.id === after.createdBy) continue;
      batch.set(db.collection("notifications").doc(), {
        recipientId: preference.id,
        type: "new_event",
        title: "新しいイベントが公開されました",
        body: `「${after.title}」をチェックしてみませんか？`,
        targetType: "event",
        targetId: event.params.eventId,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  },
);

export const notifyChatMessageCreated = onDocumentCreated(
  "chatRooms/{roomId}/messages/{messageId}",
  async (event) => {
    const message = event.data?.data();
    if (!message || message.type !== "text" || !message.senderId) return;

    const room = await db.doc(`chatRooms/${event.params.roomId}`).get();
    const roomData = room.data();
    if (!roomData?.participantIds) return;

    const recipients = roomData.participantIds.filter(
      (participantId: string) => participantId !== message.senderId,
    );
    await Promise.all(
      recipients.map(async (recipientId: string) => {
        if (!(await notificationEnabled(recipientId, "chatMessages"))) return;
        await db.collection("notifications").add({
          recipientId,
          type: "new_message",
          title: "新しいメッセージがあります",
          body: `${message.senderName}さんからメッセージが届きました。`,
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
    const bucket = hoursUntil <= 2 ? "2h" : "24h";
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
        path:
          `notifications/reminder_${eventDocument.id}_${studentId}_${bucket}`,
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
    const batch = db.batch();
    for (const write of writes.slice(index, index + 400)) {
      batch.set(db.doc(write.path), write.data, {merge: true});
    }
    await batch.commit();
  }
});
