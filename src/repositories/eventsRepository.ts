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
      ? [
          where("status", "==", "published"),
          where("applicantCount", ">=", 0),
          where("startAt", ">=", now),
          orderBy("applicantCount", "desc"),
          orderBy("startAt", "asc"),
        ]
      : sort === "新着順"
        ? [
            where("status", "==", "published"),
            where("createdAt", ">=", Timestamp.fromMillis(0)),
            where("startAt", ">=", now),
            orderBy("createdAt", "desc"),
            orderBy("startAt", "asc"),
          ]
        : [
            where("status", "==", "published"),
            where("startAt", ">=", now),
            orderBy("startAt", "asc"),
          ];

  // Both ranges are enforced by Firestore, so past events do not require
  // serial browser-side scans before a page can be displayed.
  const snapshot = await getDocs(
    query(
      collection(db, "events"),
      ...constraints,
      ...(cursor ? [startAfter(cursor)] : []),
      limit(EVENT_PAGE_SIZE + 1),
    ),
  );
  const documents = snapshot.docs.slice(0, EVENT_PAGE_SIZE);
  return {
    events: documents.map(
      (document) => ({ id: document.id, ...document.data() }) as AizuEvent,
    ),
    cursor: documents.at(-1) ?? null,
    hasMore: snapshot.size > EVENT_PAGE_SIZE,
  };
};
