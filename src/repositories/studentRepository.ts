import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { defaultNotificationPreferences } from "../lib/eventUtils";
import { fetchPublishedEventPage } from "./eventsRepository";
import type {
  ActivityRecord,
  ChatPreference,
  ChatRoom,
  EventApplication,
  NotificationItem,
  NotificationPreferences,
  SavedSearch,
} from "../types/domain";

export const subscribeStudentApplications = (
  studentId: string,
  onValue: (applications: EventApplication[]) => void,
  onError: (error: Error) => void,
) => {
  const applicationsQuery = query(
    collection(db, "eventApplications"),
    where("studentId", "==", studentId),
    limit(100),
  );
  return onSnapshot(
    applicationsQuery,
    (snapshot) =>
      onValue(
        snapshot.docs.map((applicationDoc) => ({
          id: applicationDoc.id,
          ...applicationDoc.data(),
        })) as EventApplication[],
      ),
    onError,
  );
};

export const loadStudentDashboardData = async (userId: string) => {
  const [
    eventPage,
    roomSnapshot,
    chatPreferenceSnapshot,
    savedSnapshot,
    notificationSnapshot,
    activitySnapshot,
    preferenceSnapshot,
    savedSearchSnapshot,
  ] = await Promise.all([
    fetchPublishedEventPage(null),
    getDocs(
      query(
        collection(db, "chatRooms"),
        where("participantIds", "array-contains", userId),
        limit(100),
      ),
    ),
    getDocs(
      query(
        collection(db, "chatPreferences"),
        where("userId", "==", userId),
        limit(100),
      ),
    ),
    getDocs(
      query(
        collection(db, "savedEvents"),
        where("userId", "==", userId),
        limit(100),
      ),
    ),
    getDocs(
      query(
        collection(db, "notifications"),
        where("recipientId", "==", userId),
        limit(30),
      ),
    ),
    getDocs(
      query(
        collection(db, "activities"),
        where("userId", "==", userId),
        limit(100),
      ),
    ),
    getDoc(doc(db, "notificationPreferences", userId)),
    getDoc(doc(db, "savedSearches", `${userId}_default`)),
  ]);

  const notifications = notificationSnapshot.docs.map((notificationDoc) => ({
    id: notificationDoc.id,
    ...notificationDoc.data(),
  })) as NotificationItem[];
  notifications.sort(
    (left, right) =>
      (right.createdAt?.toMillis?.() ?? 0) -
      (left.createdAt?.toMillis?.() ?? 0),
  );

  return {
    eventPage,
    chatRooms: roomSnapshot.docs.map((roomDoc) => ({
      id: roomDoc.id,
      ...roomDoc.data(),
    })) as ChatRoom[],
    chatPreferences: chatPreferenceSnapshot.docs.map(
      (preferenceDoc) => preferenceDoc.data() as ChatPreference,
    ),
    savedEventIds: savedSnapshot.docs.map(
      (savedDoc) => savedDoc.data().eventId as string,
    ),
    notifications,
    activities: activitySnapshot.docs.map((activityDoc) => ({
      id: activityDoc.id,
      ...activityDoc.data(),
    })) as ActivityRecord[],
    notificationPreferences: {
      ...defaultNotificationPreferences(userId),
      ...(preferenceSnapshot.exists() ? preferenceSnapshot.data() : {}),
      userId,
    } as NotificationPreferences,
    savedSearch: savedSearchSnapshot.exists()
      ? (savedSearchSnapshot.data() as SavedSearch)
      : null,
  };
};
