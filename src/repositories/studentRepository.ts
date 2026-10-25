import {
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db } from "../lib/firebase";
import { functions } from "../lib/firebase";
import { defaultNotificationPreferences } from "../lib/eventUtils";
import { fetchPublishedEventPage } from "./eventsRepository";
import type {
  ActivityRecord,
  AizuEvent,
  ChatPreference,
  EventApplication,
  NotificationItem,
  NotificationPreferences,
  SavedSearch,
} from "../types/domain";

export const subscribeStudentApplications = (
  studentId: string,
  onValue: (applications: EventApplication[]) => void,
  onError: (error: Error) => void,
  queryLimit = 50,
  onHasMore?: (hasMore: boolean) => void,
) => {
  const applicationsQuery = query(
    collection(db, "eventApplications"),
    where("studentId", "==", studentId),
    orderBy("createdAt", "desc"),
    limit(queryLimit + 1),
  );
  return onSnapshot(
    applicationsQuery,
    (snapshot) => {
      onHasMore?.(snapshot.size > queryLimit);
      onValue(
        snapshot.docs.slice(0, queryLimit).map((applicationDoc) => ({
          id: applicationDoc.id,
          ...applicationDoc.data(),
        })) as EventApplication[],
      );
    },
    onError,
  );
};

export const loadStudentDashboardData = async (userId: string) => {
  const [
    eventPage,
    chatPreferenceSnapshot,
    savedSnapshot,
    savedOrganizerSnapshot,
    notificationSnapshot,
    activitySnapshot,
    preferenceSnapshot,
    savedSearchSnapshot,
    unreadNotificationCountSnapshot,
  ] = await Promise.all([
    fetchPublishedEventPage(null),
    getDocs(
      query(
        collection(db, "chatPreferences"),
        where("userId", "==", userId),
        orderBy("updatedAt", "desc"),
      ),
    ),
    getDocs(
      query(
        collection(db, "savedEvents"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
      ),
    ),
    getDocs(
      query(
        collection(db, "savedOrganizers"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
      ),
    ),
    getDocs(
      query(
        collection(db, "notifications"),
        where("recipientId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(31),
      ),
    ),
    getDocs(
      query(
        collection(db, "activities"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(51),
      ),
    ),
    getDoc(doc(db, "notificationPreferences", userId)),
    getDocs(
      query(
        collection(db, "savedSearches"),
        where("userId", "==", userId),
        orderBy("updatedAt", "desc"),
      ),
    ),
    getCountFromServer(
      query(
        collection(db, "notifications"),
        where("recipientId", "==", userId),
        where("isRead", "==", false),
      ),
    ),
  ]);

  const savedEventIds = savedSnapshot.docs.map(
    (savedDocument) => savedDocument.data().eventId as string,
  );
  const savedEventIdChunks = Array.from(
    { length: Math.ceil(savedEventIds.length / 30) },
    (_, index) => savedEventIds.slice(index * 30, index * 30 + 30),
  );
  const savedEventSnapshots = await Promise.all(
    savedEventIdChunks.map((eventIds) =>
      getDocs(
        query(
          collection(db, "events"),
          where(documentId(), "in", eventIds),
          where("status", "==", "published"),
        ),
      ).catch(() => null),
    ),
  );
  const savedEventsById = new Map(
    savedEventSnapshots.flatMap((snapshot) =>
      snapshot
        ? snapshot.docs.map(
            (eventDocument) =>
              [
                eventDocument.id,
                {
                  id: eventDocument.id,
                  ...eventDocument.data(),
                } as AizuEvent,
              ] as const,
          )
        : [],
    ),
  );
  const savedEvents = savedEventIds
    .map((eventId) => savedEventsById.get(eventId))
    .filter((event): event is AizuEvent => Boolean(event));

  const notifications = notificationSnapshot.docs
    .slice(0, 30)
    .map((notificationDoc) => ({
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
    chatPreferences: chatPreferenceSnapshot.docs.map(
      (preferenceDoc) => preferenceDoc.data() as ChatPreference,
    ),
    savedEventIds,
    savedEvents,
    savedOrganizerIds: savedOrganizerSnapshot.docs.map(
      (savedDocument) => savedDocument.data().organizationId as string,
    ),
    notifications,
    activities: activitySnapshot.docs.slice(0, 50).map((activityDoc) => ({
      id: activityDoc.id,
      ...activityDoc.data(),
    })) as ActivityRecord[],
    notificationPreferences: {
      ...defaultNotificationPreferences(userId),
      ...(preferenceSnapshot.exists() ? preferenceSnapshot.data() : {}),
      userId,
    } as NotificationPreferences,
    savedSearch: !savedSearchSnapshot.empty
      ? ({
          id: savedSearchSnapshot.docs[0].id,
          ...savedSearchSnapshot.docs[0].data(),
        } as SavedSearch)
      : null,
    savedSearches: savedSearchSnapshot.docs.map((searchDocument) => ({
      id: searchDocument.id,
      ...searchDocument.data(),
    })) as SavedSearch[],
    unreadNotificationCount: unreadNotificationCountSnapshot.data().count,
    hasMoreNotifications: notificationSnapshot.size > 30,
    hasMoreActivities: activitySnapshot.size > 50,
  };
};

export const markAllStudentNotificationsRead = async () => {
  const markAllRead = httpsCallable<void, { updatedCount: number }>(
    functions,
    "markAllNotificationsRead",
  );
  await markAllRead();
};

export const loadStudentNotifications = async (
  userId: string,
  queryLimit: number,
) => {
  const snapshot = await getDocs(
    query(
      collection(db, "notifications"),
      where("recipientId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(queryLimit + 1),
    ),
  );
  return {
    items: snapshot.docs.slice(0, queryLimit).map((notificationDocument) => ({
      id: notificationDocument.id,
      ...notificationDocument.data(),
    })) as NotificationItem[],
    hasMore: snapshot.size > queryLimit,
  };
};

export const loadStudentActivities = async (
  userId: string,
  queryLimit: number,
) => {
  const snapshot = await getDocs(
    query(
      collection(db, "activities"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(queryLimit + 1),
    ),
  );
  return {
    items: snapshot.docs.slice(0, queryLimit).map((activityDocument) => ({
      id: activityDocument.id,
      ...activityDocument.data(),
    })) as ActivityRecord[],
    hasMore: snapshot.size > queryLimit,
  };
};
