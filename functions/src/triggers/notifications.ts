import {FieldPath, FieldValue, Timestamp} from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {
  matchesSavedSearch,
  shouldNotifyPublishedEventStudent,
} from "../applicationLogic";
import {
  createNotificationOnce,
  notificationEnabled,
} from "../services/notifications";
import {db} from "../lib/firebaseAdmin";
import {processApplicationUpdate} from "../services/applicationUpdates";
import {
  isLiveResource,
  readLiveApplication,
  readLiveEvent,
} from "../services/resourceLifecycle";
import {refreshOrganizerProfile} from "../services/organizerProfiles";
import {
  closeCancelledEventRoom,
  processUnavailableApplication,
} from "../services/eventAvailability";
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
        async (transaction) =>
          Boolean(
            await readLiveApplication(transaction, event.params.applicationId),
          ),
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

    await processApplicationUpdate(event.params.applicationId, before, after);
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
        async (transaction) =>
          Boolean(
            await readLiveEvent(transaction, event.params.eventId, "published"),
          ),
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
            await createNotificationOnce(
              notificationPath,
              {
                recipientId: preference.id,
                type: "new_event",
                title: "新しいイベントが公開されました",
                body: `「${after.title}」をチェックしてみませんか？`,
                targetType: "event",
                targetId: event.params.eventId,
                isRead: false,
                createdAt: FieldValue.serverTimestamp(),
              },
              async (transaction) =>
                Boolean(
                  await readLiveEvent(
                    transaction,
                    event.params.eventId,
                    "published",
                  ),
                ),
            );
          }),
        );
        lastStudent = students.docs[students.docs.length - 1];
        hasStudents = students.size === 200;
      }
    }
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
      await Promise.all(
        applications.docs.map((application) =>
          processUnavailableApplication(
            application.id,
            event.params.eventId,
            after.status,
          ),
        ),
      );
      lastApplication = applications.docs[applications.docs.length - 1];
      hasApplications = applications.size === 150;
    }
    if (after.status === "cancelled") {
      await closeCancelledEventRoom(event.params.eventId);
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
        await createNotificationOnce(
          `notifications/${notificationId}`,
          {
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
          },
          async (transaction) => {
            const [currentMessage, currentRoom, sender] =
              await transaction.getAll(
                room.ref.collection("messages").doc(event.params.messageId),
                db.doc(`chatRooms/${event.params.roomId}`),
                db.doc(`users/${message.senderId}`),
              );
            return (
              isLiveResource(sender) &&
              currentRoom.exists &&
              currentMessage.exists &&
              !currentMessage.data()?.deletedAt &&
              currentMessage.data()?.senderId === message.senderId &&
              Boolean(
                await readLiveEvent(
                  transaction,
                  String(currentRoom.data()?.eventId),
                ),
              )
            );
          },
        );
      }),
    );
  },
);

export const syncEventPublicProfile = onDocumentWritten(
  {document: "events/{eventId}", retry: true, timeoutSeconds: 120},
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const fields = [
      "status",
      "createdBy",
      "organizationName",
      "organizerDescription",
      "organizerExperience",
      "organizationVerified",
      "startAt",
    ];
    if (
      before &&
      after &&
      fields.every((key) =>
        key === "startAt" ?
          before[key]?.isEqual?.(after[key]) :
          before[key] === after[key],
      )
    ) {
      return;
    }
    const owners = new Set([before?.createdBy, after?.createdBy]);
    for (const owner of owners) {
      if (typeof owner === "string" && owner) {
        await refreshOrganizerProfile(owner);
      }
    }
  },
);
