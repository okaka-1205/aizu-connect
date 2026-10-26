import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDocs,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";

vi.mock("../lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    collection: vi.fn((_db: unknown, name: string) => name),
    documentId: vi.fn(() => "__name__"),
    getDocs: vi.fn(),
    limit: vi.fn((value: number) => ({ type: "limit", value })),
    orderBy: vi.fn((field: string, direction: string) => ({
      type: "orderBy",
      field,
      direction,
    })),
    query: vi.fn((...constraints: unknown[]) => constraints),
    where: vi.fn((field: string, operation: string, value: unknown) => ({
      type: "where",
      field,
      operation,
      value,
    })),
  };
});

import {
  loadStudentSavedEvents,
  loadStudentSavedSearches,
  SAVED_EVENT_PAGE_SIZE,
  SAVED_SEARCH_PAGE_SIZE,
} from "./studentRepository";

const document = (id: string, data: DocumentData) =>
  ({ id, data: () => data }) as QueryDocumentSnapshot<DocumentData>;

const snapshot = (docs: QueryDocumentSnapshot<DocumentData>[]) =>
  ({ docs, empty: docs.length === 0, size: docs.length }) as QuerySnapshot;

describe("student dashboard pagination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns one saved-search page and reports a remaining page", async () => {
    const documents = Array.from(
      { length: SAVED_SEARCH_PAGE_SIZE + 1 },
      (_, index) =>
        document(`search-${index}`, {
          userId: "student-1",
          name: `条件${index}`,
        }),
    );
    vi.mocked(getDocs).mockResolvedValueOnce(snapshot(documents));

    const page = await loadStudentSavedSearches("student-1");

    expect(page.items).toHaveLength(SAVED_SEARCH_PAGE_SIZE);
    expect(page.items.at(-1)?.id).toBe(`search-${SAVED_SEARCH_PAGE_SIZE - 1}`);
    expect(page.hasMore).toBe(true);
  });

  it("loads only published events for the current saved-event page", async () => {
    const savedDocuments = Array.from(
      { length: SAVED_EVENT_PAGE_SIZE + 1 },
      (_, index) =>
        document(`saved-${index}`, {
          userId: "student-1",
          eventId: `event-${index}`,
        }),
    );
    const eventDocuments = Array.from(
      { length: SAVED_EVENT_PAGE_SIZE },
      (_, index) =>
        document(`event-${index}`, {
          status: "published",
          title: `イベント${index}`,
        }),
    );
    vi.mocked(getDocs)
      .mockResolvedValueOnce(snapshot(savedDocuments))
      .mockResolvedValueOnce(snapshot(eventDocuments));

    const page = await loadStudentSavedEvents("student-1");

    expect(page.ids).toHaveLength(SAVED_EVENT_PAGE_SIZE);
    expect(page.events).toHaveLength(SAVED_EVENT_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
    expect(getDocs).toHaveBeenCalledTimes(2);
  });
});
