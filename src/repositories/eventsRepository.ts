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
  const now = Timestamp.now();
  const constraints =
    sort === "人気順"
      ? [where("status", "==", "published"), orderBy("applicantCount", "desc")]
      : sort === "新着順"
        ? [where("status", "==", "published"), orderBy("createdAt", "desc")]
        : [
            where("status", "==", "published"),
            where("startAt", ">=", now),
            orderBy("startAt", "asc"),
          ];

  // Popular and newest ordering cannot use startAt as the primary Firestore
  // order without changing the requested sort. Scan past expired events until
  // a complete page of upcoming events is assembled, and return the last
  // scanned document as the cursor so no valid event is skipped.
  const events: AizuEvent[] = [];
  let scanCursor = cursor;
  let hasMore = true;
  while (events.length < EVENT_PAGE_SIZE && hasMore) {
    const snapshot = await getDocs(
      query(
        collection(db, "events"),
        ...constraints,
        ...(scanCursor ? [startAfter(scanCursor)] : []),
        limit(EVENT_PAGE_SIZE + 1),
      ),
    );
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    let processedDocuments = 0;
    for (const eventDocument of snapshot.docs) {
      scanCursor = eventDocument;
      processedDocuments += 1;
      const event = {
        id: eventDocument.id,
        ...eventDocument.data(),
      } as AizuEvent;
      if (
        sort === "開催が近い順" ||
        !event.startAt ||
        event.startAt.toMillis() >= now.toMillis()
      ) {
        events.push(event);
      }
      if (events.length === EVENT_PAGE_SIZE) break;
    }

    hasMore =
      processedDocuments < snapshot.size ||
      snapshot.size === EVENT_PAGE_SIZE + 1;
  }

  return {
    events,
    cursor: scanCursor,
    hasMore,
  };
};
