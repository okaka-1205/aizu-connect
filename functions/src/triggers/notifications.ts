import {FieldPath, FieldValue, Timestamp} from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import {
  applicationStatusMessage,
  matchesSavedSearch,
  shouldDecrementApplicantCount,
  shouldIncrementApplicantCount,
  shouldNotifyPublishedEventStudent,
  shouldSetChatRoomReadOnly,
} from "../applicationLogic";
import {
  createNotificationOnce,
  notificationEnabled,
} from "../services/notifications";
import {db} from "../lib/firebaseAdmin";
const eventChatRoomId = (eventId: string) => `event_${eventId}`;
const isFunctionsEmulator = process.env.FUNCTIONS_EMULATOR === "true";

export const notifyApplicationCreated = onDocumentCreated(
  {document: "eventApplications/{applicationId}", retry: true},
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
  {document: "eventApplications/{applicationId}", retry: true},
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
          const availabilityEvent = await transaction.get(availabilityEventRef);
          let nextWaitlisted:
            FirebaseFirestore.QueryDocumentSnapshot | undefined;
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
                .orderBy("waitlistSequence", "asc")
                .limit(1),
            );
            nextWaitlisted = waitlistSnapshot.docs[0];
            if (!nextWaitlisted) {
              const legacyWaitlist = await transaction.get(
                db
                  .collection("eventApplications")
                  .where("eventId", "==", after.eventId)
                  .where("status", "==", "waitlisted")
                  .orderBy("createdAt", "asc")
                  .limit(1),
              );
              nextWaitlisted = legacyWaitlist.docs[0];
            }
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
                waitlistSequence: FieldValue.delete(),
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
  {
    document: "events/{eventId}",
    retry: true,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
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
    if (!isRestoration) {
      await createNotificationOnce(
        `notifications/event_published_${event.params.eventId}`,
        {
          recipientId: after.createdBy,
          type: "event_published",
          title: "イベントが公開されました",
          body: `「${after.title}」がAizu Connectで公開されました。`,
          targetType: "event",
          targetId: event.params.eventId,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        },
      );
    }

    if (!isRestoration) {
      let lastStudent: FirebaseFirestore.QueryDocumentSnapshot | undefined;
      let hasStudents = true;
      while (hasStudents) {
        let studentsQuery = db
          .collection("users")
          .where("role", "==", "student")
          .where("status", "==", "active")
          .orderBy(FieldPath.documentId())
          .limit(200);
        if (lastStudent) {
          studentsQuery = studentsQuery.startAfter(lastStudent);
        }
        const students = await studentsQuery.get();
        if (students.empty) {
          hasStudents = false;
          continue;
        }
        const preferences = await Promise.all(
          students.docs.map(async (student) => {
            const [enabled, savedSearches] = await Promise.all([
              notificationEnabled(student.id, "newEvents"),
              db
                .collection("savedSearches")
                .where("userId", "==", student.id)
                .limit(10)
                .get(),
            ]);
            return {
              id: student.id,
              enabled,
              savedSearches: savedSearches.docs.map((search) => search.data()),
            };
          }),
        );
        await Promise.all(
          preferences.map(async (preference) => {
            if (
              !shouldNotifyPublishedEventStudent(
                preference.id,
                after.createdBy,
                preference.enabled,
              ) ||
              !(
                preference.savedSearches.length === 0 ||
                preference.savedSearches.some((savedSearch) =>
                  matchesSavedSearch(
                    savedSearch,
                    {
                      ...after,
                      startAtMillis:
                        after.startAt instanceof Timestamp ?
                          after.startAt.toMillis() :
                          Number.NaN,
                    },
                    Date.now(),
                  ),
                )
              )
            ) {
              return;
            }
            const notificationPath = [
              "notifications/new_event",
              event.params.eventId,
              preference.id,
            ].join("_");
            await createNotificationOnce(notificationPath, {
              recipientId: preference.id,
              type: "new_event",
              title: "新しいイベントが公開されました",
              body: `「${after.title}」をチェックしてみませんか？`,
              targetType: "event",
              targetId: event.params.eventId,
              isRead: false,
              createdAt: FieldValue.serverTimestamp(),
            });
          }),
        );
        lastStudent = students.docs[students.docs.length - 1];
        hasStudents = students.size === 200;
      }
    }

    let publishedEventCount = 0;
    let lastOrganizerEvent: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    let hasOrganizerEvents = true;
    while (hasOrganizerEvents) {
      let organizerEventsQuery = db
        .collection("events")
        .where("createdBy", "==", after.createdBy)
        .orderBy(FieldPath.documentId())
        .limit(200);
      if (lastOrganizerEvent) {
        organizerEventsQuery =
          organizerEventsQuery.startAfter(lastOrganizerEvent);
      }
      const organizerEvents = await organizerEventsQuery.get();
      publishedEventCount += organizerEvents.docs.filter(
        (eventDocument) => eventDocument.data().status === "published",
      ).length;
      lastOrganizerEvent =
        organizerEvents.docs[organizerEvents.docs.length - 1];
      hasOrganizerEvents = organizerEvents.size === 200;
    }
    await db.doc(`publicOrganizerProfiles/${after.createdBy}`).set(
      {
        userId: after.createdBy,
        displayName: after.organizationName,
        description:
          after.organizerDescription ??
          "参加者が安心して参加できるイベント運営を行います。",
        experience: after.organizerExperience ?? "Aizu Connectでイベントを企画",
        publishedEventCount,
        verified: after.organizationVerified === true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  },
);

export const notifyEventUnavailable = onDocumentUpdated(
  {
    document: "events/{eventId}",
    retry: true,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
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
    let lastApplication: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    let hasApplications = true;
    while (hasApplications) {
      let applicationsQuery = db
        .collection("eventApplications")
        .where("eventId", "==", event.params.eventId)
        .orderBy(FieldPath.documentId())
        .limit(150);
      if (lastApplication) {
        applicationsQuery = applicationsQuery.startAfter(lastApplication);
      }
      const applications = await applicationsQuery.get();
      if (applications.empty) {
        hasApplications = false;
        continue;
      }
      const applicationChunk = applications.docs.filter((application) =>
        ["pending", "waitlisted", "confirmed"].includes(
          application.data().status,
        ),
      );
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
      if (after.status === "cancelled" && applicationChunk.length > 0) {
        await batch.commit();
      }
      await Promise.all(notificationWrites);
      lastApplication = applications.docs[applications.docs.length - 1];
      hasApplications = applications.size === 150;
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
  {document: "chatRooms/{roomId}/messages/{messageId}", retry: true},
  async (event) => {
    const message = event.data?.data();
    if (
      !message ||
      message.type === "system" ||
      !message.senderId ||
      (isFunctionsEmulator && message.suppressNotification === true)
    ) {
      return;
    }

    const room = await db.doc(`chatRooms/${event.params.roomId}`).get();
    const roomData = room.data();
    if (!roomData) return;
    const recipients = new Set<string>();
    let lastMember: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    let hasMembers = true;
    while (hasMembers) {
      let memberQuery = db
        .collection(`chatRooms/${event.params.roomId}/members`)
        .orderBy(FieldPath.documentId())
        .limit(200);
      if (lastMember) memberQuery = memberQuery.startAfter(lastMember);
      const memberSnapshot = await memberQuery.get();
      memberSnapshot.docs.forEach((member) => {
        const userId = String(member.data().userId ?? member.id);
        if (userId && userId !== message.senderId) recipients.add(userId);
      });
      lastMember = memberSnapshot.docs[memberSnapshot.docs.length - 1];
      hasMembers = memberSnapshot.size === 200;
    }
    if (recipients.size === 0 && Array.isArray(roomData.participantIds)) {
      roomData.participantIds.forEach((participantId: unknown) => {
        if (
          typeof participantId === "string" &&
          participantId !== message.senderId
        ) {
          recipients.add(participantId);
        }
      });
    }
    await Promise.all(
      [...recipients].map(async (recipientId: string) => {
        const block = await db
          .doc(`userBlocks/${recipientId}_${message.senderId}`)
          .get();
        if (block.exists) return;
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
