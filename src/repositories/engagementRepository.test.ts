import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteField,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
  getDocs,
  setDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
vi.mock("../lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    collection: vi.fn((_db: unknown, ...segments: string[]) =>
      segments.join("/"),
    ),
    doc: vi.fn((_db: unknown, ...segments: string[]) => segments.join("/")),
    documentId: vi.fn(() => "document-id"),
    query: vi.fn((...parts: unknown[]) => parts),
    orderBy: vi.fn((field: string, direction: string) => ({
      field,
      direction,
    })),
    startAfter: vi.fn((cursor: unknown) => ({ cursor })),
    limit: vi.fn((value: number) => ({ limit: value })),
    where: vi.fn((...parts: unknown[]) => ({ where: parts })),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    getAggregateFromServer: vi.fn(),
    getCountFromServer: vi.fn(),
    setDoc: vi.fn(),
  };
});
import {
  EVENT_SURVEY_PAGE_SIZE,
  loadAdminAssignment,
  loadEventSurveyPage,
  loadEventSurveySummary,
  saveAdminAssignment,
} from "./engagementRepository";
const response = (index: number) =>
  ({
    id: String(index),
    data: () => ({
      eventId: "event",
      rating: 4,
      comment: "感想",
      wouldRecommend: true,
    }),
  }) as unknown as QueryDocumentSnapshot<DocumentData>;
const snapshot = (
  docs: QueryDocumentSnapshot<DocumentData>[],
  fromCache = false,
) =>
  ({ docs, size: docs.length, metadata: { fromCache } }) as unknown as Awaited<
    ReturnType<typeof getDocs>
  >;
const assignmentDocument = (id: string, status = "in_progress") =>
  ({
    id,
    data: () => ({
      targetType: id.slice(0, id.indexOf("_")),
      targetId: id.slice(id.indexOf("_") + 1),
      status,
      assigneeId: "admin",
      assigneeName: "管理者",
    }),
  }) as unknown as QueryDocumentSnapshot<DocumentData>;
const requestedAssignmentIds = (request: unknown) =>
  (request as [string, { where: [string, string, string[]] }])[1].where[2];

describe("engagement persistence", () => {
  beforeEach(() => vi.clearAllMocks());
  it("keeps the lookahead response for the next page", async () => {
    const documents = Array.from(
      { length: EVENT_SURVEY_PAGE_SIZE + 1 },
      (_, index) => response(index),
    );
    const lookahead = documents.at(-1);
    if (!lookahead) throw new Error("Lookahead fixture is missing");
    vi.mocked(getDocs)
      .mockResolvedValueOnce(snapshot(documents))
      .mockResolvedValueOnce(snapshot([lookahead]));
    const first = await loadEventSurveyPage("event");
    expect(first.responses).toHaveLength(EVENT_SURVEY_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    expect(first.cursor).toBe(documents[EVENT_SURVEY_PAGE_SIZE - 1]);
    const second = await loadEventSurveyPage("event", first.cursor);
    expect(second.responses.map(({ userId }) => userId)).toEqual([
      String(EVENT_SURVEY_PAGE_SIZE),
    ]);
    expect(second.hasMore).toBe(false);
    expect(getDocs).toHaveBeenLastCalledWith([
      "eventSurveys/event/responses",
      { field: "createdAt", direction: "desc" },
      { cursor: first.cursor },
      { limit: EVENT_SURVEY_PAGE_SIZE + 1 },
    ]);
  });
  it("uses all responses for summary values independently of pagination", async () => {
    vi.mocked(getAggregateFromServer).mockResolvedValue({
      data: () => ({ responseCount: 120, averageRating: 4.5 }),
    } as unknown as Awaited<ReturnType<typeof getAggregateFromServer>>);
    vi.mocked(getCountFromServer).mockResolvedValue({
      data: () => ({ count: 90 }),
    } as Awaited<ReturnType<typeof getCountFromServer>>);
    expect(await loadEventSurveySummary("event")).toEqual({
      responseCount: 120,
      averageRating: 4.5,
      recommendationCount: 90,
    });
    expect(getCountFromServer).toHaveBeenCalledWith([
      "eventSurveys/event/responses",
      { where: ["wouldRecommend", "==", true] },
    ]);
  });
  it("restores legacy completion values using the value accepted by Rules", async () => {
    vi.mocked(getDocs).mockResolvedValue(
      snapshot([assignmentDocument("event_event", "done")]),
    );
    expect((await loadAdminAssignment("event", "event"))?.status).toBe(
      "completed",
    );
  });
  it("loads 200 targets in seven queries and maps unordered results and missing assignments", async () => {
    vi.mocked(getDocs).mockImplementation(async (request) =>
      snapshot(
        requestedAssignmentIds(request)
          .filter((id) => Number(id.slice(id.indexOf("_") + 1)) % 2 === 0)
          .reverse()
          .map((id) => assignmentDocument(id)),
      ),
    );
    const targets = (["event", "user", "report", "deletion"] as const).flatMap(
      (type) =>
        Array.from({ length: 50 }, (_, index) => ({ type, id: String(index) })),
    );
    const assignments = await Promise.all(
      targets.map(({ type, id }) => loadAdminAssignment(type, id)),
    );
    expect(getDocs).toHaveBeenCalledTimes(7);
    expect(
      vi
        .mocked(getDocs)
        .mock.calls.flatMap(([request]) => requestedAssignmentIds(request)),
    ).toEqual(targets.map(({ type, id }) => `${type}_${id}`));
    for (const [request] of vi.mocked(getDocs).mock.calls) {
      expect(requestedAssignmentIds(request).length).toBeLessThanOrEqual(30);
    }
    for (const [index, target] of targets.entries()) {
      if (Number(target.id) % 2) expect(assignments[index]).toBeNull();
      else
        expect(assignments[index]).toMatchObject({
          targetType: target.type,
          targetId: target.id,
        });
    }
  });
  it("shares duplicate requests while a read is pending", async () => {
    let finish: (value: Awaited<ReturnType<typeof getDocs>>) => void = () => {};
    vi.mocked(getDocs).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = loadAdminAssignment("event", "event");
    expect(loadAdminAssignment("event", "event")).toBe(first);
    await Promise.resolve();
    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(loadAdminAssignment("event", "event")).toBe(first);
    finish(snapshot([assignmentDocument("event_event")]));
    expect((await first)?.targetId).toBe("event");
  });
  it("reads fresh data after a completed read and save", async () => {
    vi.mocked(getDocs)
      .mockResolvedValueOnce(
        snapshot([assignmentDocument("event_event", "in_progress")]),
      )
      .mockResolvedValueOnce(
        snapshot([assignmentDocument("event_event", "completed")]),
      );
    vi.mocked(setDoc).mockResolvedValue(undefined);
    expect((await loadAdminAssignment("event", "event"))?.status).toBe(
      "in_progress",
    );
    await saveAdminAssignment({
      targetType: "event",
      targetId: "event",
      assigneeId: "admin",
      assigneeName: "管理者",
      status: "completed",
    });
    expect((await loadAdminAssignment("event", "event"))?.status).toBe(
      "completed",
    );
    expect(getDocs).toHaveBeenCalledTimes(2);
  });
  it("limits failures to their batch and permits retry without retaining a rejected promise", async () => {
    const error = new Error("取得に失敗");
    vi.mocked(getDocs).mockImplementation(async (request) => {
      const ids = requestedAssignmentIds(request);
      if (ids.includes("event_30")) throw error;
      return snapshot(ids.map((id) => assignmentDocument(id)));
    });
    const results = await Promise.allSettled(
      Array.from({ length: 61 }, (_, index) =>
        loadAdminAssignment("event", String(index)),
      ),
    );
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      31,
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      30,
    );
    expect(getDocs).toHaveBeenCalledTimes(3);
    vi.mocked(getDocs).mockResolvedValue(
      snapshot([assignmentDocument("event_30")]),
    );
    expect((await loadAdminAssignment("event", "30"))?.targetId).toBe("30");
    expect(getDocs).toHaveBeenCalledTimes(4);
  });
  it("checks cache-only omissions individually while preserving cached assignments", async () => {
    vi.mocked(getDocs).mockResolvedValue(
      snapshot([assignmentDocument("event_cached", "done")], true),
    );
    vi.mocked(getDoc)
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => assignmentDocument("event_restored").data(),
      } as Awaited<ReturnType<typeof getDoc>>)
      .mockResolvedValueOnce({
        exists: () => false,
      } as Awaited<ReturnType<typeof getDoc>>);
    const [cached, restored, missing] = await Promise.all(
      ["cached", "restored", "missing"].map((id) =>
        loadAdminAssignment("event", id),
      ),
    );
    expect(cached?.status).toBe("completed");
    expect(restored?.targetId).toBe("restored");
    expect(missing).toBeNull();
    expect(getDoc).toHaveBeenCalledTimes(2);
    expect(getDoc).toHaveBeenNthCalledWith(
      1,
      "adminAssignments/event_restored",
    );
    expect(getDoc).toHaveBeenNthCalledWith(2, "adminAssignments/event_missing");
  });
  it("reports an offline cache miss and allows a fresh retry", async () => {
    const error = new Error("オフラインで取得できません");
    vi.mocked(getDocs).mockResolvedValue(snapshot([], true));
    vi.mocked(getDoc)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => assignmentDocument("event_event").data(),
      } as Awaited<ReturnType<typeof getDoc>>);
    await expect(loadAdminAssignment("event", "event")).rejects.toBe(error);
    expect((await loadAdminAssignment("event", "event"))?.targetId).toBe(
      "event",
    );
    expect(getDocs).toHaveBeenCalledTimes(2);
    expect(getDoc).toHaveBeenCalledTimes(2);
  });
  it("removes a cleared deadline instead of sending undefined", async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined);
    await saveAdminAssignment({
      targetType: "event",
      targetId: "event",
      assigneeId: "admin",
      assigneeName: "管理者",
      status: "completed",
    });
    expect(setDoc).toHaveBeenCalledWith(
      "adminAssignments/event_event",
      expect.objectContaining({ status: "completed", dueAt: deleteField() }),
      { merge: true },
    );
  });
  it("propagates read and save failures for the interface to report", async () => {
    const error = new Error("通信に失敗");
    vi.mocked(getDocs).mockRejectedValue(error);
    vi.mocked(setDoc).mockRejectedValue(error);
    await expect(loadAdminAssignment("event", "event")).rejects.toBe(error);
    await expect(
      saveAdminAssignment({
        targetType: "event",
        targetId: "event",
        assigneeId: "admin",
        assigneeName: "管理者",
        status: "open",
      }),
    ).rejects.toBe(error);
  });
});
