import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { EVENT_PAGE_SIZE } from "../config/events";
import { db } from "../lib/firebase";
import type { AizuEvent } from "../types/domain";

export type EventPage = {
  events: AizuEvent[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

export const fetchPublishedEventPage = async (
  cursor: QueryDocumentSnapshot<DocumentData> | null,
): Promise<EventPage> => {
  const eventQuery = cursor
    ? query(
        collection(db, "events"),
        where("status", "==", "published"),
        where("startAt", ">=", Timestamp.now()),
        orderBy("startAt", "asc"),
        startAfter(cursor),
        limit(EVENT_PAGE_SIZE + 1),
      )
    : query(
        collection(db, "events"),
        where("status", "==", "published"),
        where("startAt", ">=", Timestamp.now()),
        orderBy("startAt", "asc"),
        limit(EVENT_PAGE_SIZE + 1),
      );
  const snapshot = await getDocs(eventQuery);
  const pageDocuments = snapshot.docs.slice(0, EVENT_PAGE_SIZE);
  return {
    events: pageDocuments.map((eventDoc) => ({
      id: eventDoc.id,
      ...eventDoc.data(),
    })) as AizuEvent[],
    cursor: pageDocuments.at(-1) ?? null,
    hasMore: snapshot.size > EVENT_PAGE_SIZE,
  };
};
