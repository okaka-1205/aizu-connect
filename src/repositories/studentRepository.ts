import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { defaultNotificationPreferences } from "../lib/eventUtils";
import { fetchPublishedEventPage } from "./eventsRepository";
import type {
  ActivityRecord,
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
    blockedUserSnapshot,
    notificationSnapshot,
    activitySnapshot,
    preferenceSnapshot,
    savedSearchSnapshot,
  ] = await Promise.all([
    fetchPublishedEventPage(null),
    getDocs(
      query(
        collection(db, "chatPreferences"),
        where("userId", "==", userId),
        orderBy("updatedAt", "desc"),
        limit(51),
      ),
    ),
    getDocs(
      query(
        collection(db, "savedEvents"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(51),
      ),
    ),
    getDocs(
      query(
        collection(db, "savedOrganizers"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(51),
      ),
    ),
    getDocs(
      query(
        collection(db, "userBlocks"),
        where("blockerId", "==", userId),
        limit(100),
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
        limit(10),
      ),
    ),
  ]);

  const notifications = notificationSnapshot.docs.slice(0, 30).map((notificationDoc) => ({
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
    chatPreferences: chatPreferenceSnapshot.docs.slice(0, 50).map(
      (preferenceDoc) => preferenceDoc.data() as ChatPreference,
    ),
    savedEventIds: savedSnapshot.docs.slice(0, 50).map(
      (savedDoc) => savedDoc.data().eventId as string,
    ),
    savedOrganizerIds: savedOrganizerSnapshot.docs.slice(0, 50).map(
      (savedDocument) => savedDocument.data().organizationId as string,
    ),
    blockedUserIds: blockedUserSnapshot.docs.map(
      (blockDocument) => blockDocument.data().blockedId as string,
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
    hasMoreNotifications: notificationSnapshot.size > 30,
    hasMoreActivities: activitySnapshot.size > 50,
    hasMoreSavedEvents: savedSnapshot.size > 50,
    hasMoreChatPreferences: chatPreferenceSnapshot.size > 50,
  };
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
