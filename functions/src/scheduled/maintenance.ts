import {
  FieldPath,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  reminderBucketForHoursUntil,
  reminderNotificationPath,
} from "../applicationLogic";
import {
  createNotificationOnce,
  notificationEnabled,
} from "../services/notifications";
import {db} from "../lib/firebaseAdmin";

export const purgeExpiredLegalRecords = onSchedule(
  {
    schedule: "every day 03:00",
    timeZone: "Asia/Tokyo",
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async () => {
    let hasExpiredRecords = true;
    while (hasExpiredRecords) {
      const snapshot = await db
        .collection("thirdPartyProvisionLogs")
        .where("expiresAt", "<=", Timestamp.now())
        .limit(200)
        .get();
      hasExpiredRecords = !snapshot.empty;
      if (snapshot.empty) continue;
      const batch = db.batch();
      snapshot.docs.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }
  },
);

export const sendEventReminders = onSchedule(
  {
    schedule: "every 1 hours",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const now = Timestamp.now();
    const nextDay = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);
    let lastEvent: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    let hasEvents = true;
    while (hasEvents) {
      let eventsQuery = db
        .collection("events")
        .where("status", "==", "published")
        .where("startAt", ">=", now)
        .where("startAt", "<=", nextDay)
        .orderBy("startAt", "asc")
        .limit(100);
      if (lastEvent) eventsQuery = eventsQuery.startAfter(lastEvent);
      const eventSnapshot = await eventsQuery.get();
      if (eventSnapshot.empty) {
        hasEvents = false;
        continue;
      }

      for (const eventDocument of eventSnapshot.docs) {
        const eventData = eventDocument.data();
        const startAt = eventData.startAt as Timestamp;
        const hoursUntil =
          (startAt.toMillis() - now.toMillis()) / (60 * 60 * 1000);
        const bucket = reminderBucketForHoursUntil(hoursUntil);
        let lastConfirmedApplication:
          FirebaseFirestore.QueryDocumentSnapshot | undefined;
        let hasConfirmedApplications = true;
        while (hasConfirmedApplications) {
          let applicationsQuery = db
            .collection("eventApplications")
            .where("eventId", "==", eventDocument.id)
            .where("status", "==", "confirmed")
            .orderBy(FieldPath.documentId())
            .limit(200);
          if (lastConfirmedApplication) {
            applicationsQuery = applicationsQuery.startAfter(
              lastConfirmedApplication,
            );
          }
          const applications = await applicationsQuery.get();
          if (applications.empty) {
            hasConfirmedApplications = false;
            continue;
          }
          const preferences = await Promise.all(
            applications.docs.map(async (application) => ({
              application: application.data(),
              enabled: await notificationEnabled(
                application.data().studentId,
                "eventReminders",
              ),
            })),
          );
          await Promise.all(
            preferences.map(async (preference) => {
              if (!preference.enabled) return;
              const studentId = preference.application.studentId;
              await createNotificationOnce(
                reminderNotificationPath(eventDocument.id, studentId, bucket),
                {
                  recipientId: studentId,
                  type: "event_reminder",
                  title:
                    bucket === "2h" ?
                      "まもなく開催です" :
                      "明日の予定を確認しましょう",
                  body: `「${eventData.title}」の開催が近づいています。`,
                  targetType: "event",
                  targetId: eventDocument.id,
                  isRead: false,
                  createdAt: FieldValue.serverTimestamp(),
                },
              );
            }),
          );
          lastConfirmedApplication =
            applications.docs[applications.docs.length - 1];
          hasConfirmedApplications = applications.size === 200;
        }
      }
      lastEvent = eventSnapshot.docs[eventSnapshot.docs.length - 1];
      hasEvents = eventSnapshot.size === 100;
    }
  },
);
