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

export const SAVED_EVENT_PAGE_SIZE = 30;
export const SAVED_SEARCH_PAGE_SIZE = 20;

const loadPublishedEventsByIds = async (eventIds: string[]) => {
  const eventIdChunks = Array.from(
    { length: Math.ceil(eventIds.length / 30) },
    (_, index) => eventIds.slice(index * 30, index * 30 + 30),
  );
  const snapshots = await Promise.all(
    eventIdChunks.map((ids) =>
      getDocs(
        query(
          collection(db, "events"),
          where(documentId(), "in", ids),
          where("status", "==", "published"),
        ),
      ).catch(() => null),
    ),
  );
  const eventsById = new Map(
    snapshots.flatMap((snapshot) =>
      snapshot
        ? snapshot.docs.map(
            (eventDocument) =>
              [
                eventDocument.id,
                { id: eventDocument.id, ...eventDocument.data() } as AizuEvent,
              ] as const,
          )
        : [],
    ),
  );
  return eventIds
    .map((eventId) => eventsById.get(eventId))
    .filter((event): event is AizuEvent => Boolean(event));
};

export const loadStudentSavedEvents = async (
  userId: string,
  queryLimit = SAVED_EVENT_PAGE_SIZE,
) => {
  const snapshot = await getDocs(
    query(
      collection(db, "savedEvents"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(queryLimit + 1),
    ),
  );
  const documents = snapshot.docs.slice(0, queryLimit);
  const ids = documents.map(
    (savedDocument) => savedDocument.data().eventId as string,
  );
  return {
    ids,
    events: await loadPublishedEventsByIds(ids),
    hasMore: snapshot.size > queryLimit,
  };
};

export const loadStudentSavedSearches = async (
  userId: string,
  queryLimit = SAVED_SEARCH_PAGE_SIZE,
) => {
  const snapshot = await getDocs(
    query(
      collection(db, "savedSearches"),
      where("userId", "==", userId),
      orderBy("updatedAt", "desc"),
      limit(queryLimit + 1),
    ),
  );
  return {
    items: snapshot.docs.slice(0, queryLimit).map((searchDocument) => ({
      id: searchDocument.id,
      ...searchDocument.data(),
    })) as SavedSearch[],
    hasMore: snapshot.size > queryLimit,
  };
};

export const loadStudentDashboardData = async (userId: string) => {
  const [
    eventPage,
    savedEventPage,
    notificationSnapshot,
    activitySnapshot,
    preferenceSnapshot,
    savedSearchPage,
    unreadNotificationCountSnapshot,
  ] = await Promise.all([
    fetchPublishedEventPage(null),
    loadStudentSavedEvents(userId),
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
    loadStudentSavedSearches(userId),
    getCountFromServer(
      query(
        collection(db, "notifications"),
        where("recipientId", "==", userId),
        where("isRead", "==", false),
      ),
    ),
  ]);

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
    savedEventIds: savedEventPage.ids,
    savedEvents: savedEventPage.events,
    hasMoreSavedEvents: savedEventPage.hasMore,
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
    savedSearch: savedSearchPage.items[0] ?? null,
    savedSearches: savedSearchPage.items,
    hasMoreSavedSearches: savedSearchPage.hasMore,
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
