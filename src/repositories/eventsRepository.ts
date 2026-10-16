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
import type { AizuEvent, SearchSort } from "../types/domain";

export type EventPage = {
  events: AizuEvent[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

export const fetchPublishedEventPage = async (
  cursor: QueryDocumentSnapshot<DocumentData> | null,
  sort: SearchSort = "開催が近い順",
): Promise<EventPage> => {
  const constraints =
    sort === "人気順"
      ? [where("status", "==", "published"), orderBy("applicantCount", "desc")]
      : sort === "新着順"
        ? [where("status", "==", "published"), orderBy("createdAt", "desc")]
        : [
            where("status", "==", "published"),
            where("startAt", ">=", Timestamp.now()),
            orderBy("startAt", "asc"),
          ];
  const eventQuery = query(
    collection(db, "events"),
    ...constraints,
    ...(cursor ? [startAfter(cursor)] : []),
    limit(EVENT_PAGE_SIZE + 1),
  );
  const snapshot = await getDocs(eventQuery);
  const pageDocuments = snapshot.docs.slice(0, EVENT_PAGE_SIZE);
  return {
    events: pageDocuments
      .map((eventDoc) => ({
        id: eventDoc.id,
        ...eventDoc.data(),
      }) as AizuEvent)
      .filter((event) =>
        sort === "開催が近い順"
          ? true
          : !event.startAt || event.startAt.toMillis() >= Date.now(),
      ),
    cursor: pageDocuments.at(-1) ?? null,
    hasMore: snapshot.size > EVENT_PAGE_SIZE,
  };
};
