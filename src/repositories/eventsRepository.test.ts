import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDocs,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";

vi.mock("../lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    collection: vi.fn(() => "events"),
    getDocs: vi.fn(),
    limit: vi.fn((value: number) => ({ type: "limit", value })),
    orderBy: vi.fn((field: string, direction: string) => ({
      type: "orderBy",
      field,
      direction,
    })),
    query: vi.fn((...constraints: unknown[]) => constraints),
    startAfter: vi.fn((cursor: unknown) => ({ type: "startAfter", cursor })),
    where: vi.fn((field: string, operation: string, value: unknown) => ({
      type: "where",
      field,
      operation,
      value,
    })),
  };
});

import { EVENT_PAGE_SIZE } from "../config/events";
import { fetchPublishedEventPage } from "./eventsRepository";

const eventDocument = (id: string, startAtMillis: number) =>
  ({
    id,
    data: () => ({
      status: "published",
      startAt: Timestamp.fromMillis(startAtMillis),
      applicantCount: 0,
      createdAt: Timestamp.fromMillis(startAtMillis),
    }),
  }) as unknown as QueryDocumentSnapshot<DocumentData>;

const snapshot = (docs: QueryDocumentSnapshot<DocumentData>[]) =>
  ({
    docs,
    empty: docs.length === 0,
    size: docs.length,
  }) as QuerySnapshot<DocumentData>;

describe("fetchPublishedEventPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scans beyond an expired popular page without skipping upcoming events", async () => {
    const now = Date.now();
    const expired = Array.from({ length: EVENT_PAGE_SIZE + 1 }, (_, index) =>
      eventDocument(`expired-${index}`, now - 60_000),
    );
    const upcoming = [
      eventDocument("upcoming-1", now + 60_000),
      eventDocument("upcoming-2", now + 120_000),
    ];
    vi.mocked(getDocs)
      .mockResolvedValueOnce(snapshot(expired))
      .mockResolvedValueOnce(snapshot(upcoming));

    const page = await fetchPublishedEventPage(null, "人気順");

    expect(page.events.map((event) => event.id)).toEqual([
      "upcoming-1",
      "upcoming-2",
    ]);
    expect(page.cursor?.id).toBe("upcoming-2");
    expect(page.hasMore).toBe(false);
    expect(getDocs).toHaveBeenCalledTimes(2);
  });

  it("keeps the cursor on the last returned document when a page is full", async () => {
    const now = Date.now();
    const upcoming = Array.from({ length: EVENT_PAGE_SIZE + 1 }, (_, index) =>
      eventDocument(`upcoming-${index + 1}`, now + (index + 1) * 60_000),
    );
    vi.mocked(getDocs).mockResolvedValueOnce(snapshot(upcoming));

    const page = await fetchPublishedEventPage(null, "新着順");

    expect(page.events).toHaveLength(EVENT_PAGE_SIZE);
    expect(page.cursor?.id).toBe(`upcoming-${EVENT_PAGE_SIZE}`);
    expect(page.hasMore).toBe(true);
  });
});
