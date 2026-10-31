import { beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeChatRoomsForUser } from "./chatRepository";

const state = vi.hoisted(() => ({
  listeners: [] as {
    query: { source: string; filters: { field?: string; value?: unknown }[] };
    next: (snapshot: unknown) => void;
    stop: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("../lib/firebase", () => ({ db: {} }));
vi.mock("../lib/storage", () => ({ uploadImage: vi.fn() }));
vi.mock("firebase/firestore", async (original) => ({
  ...(await original<typeof import("firebase/firestore")>()),
  collection: (_: unknown, source: string) => source,
  collectionGroup: (_: unknown, source: string) => source,
  documentId: () => "__name__",
  where: (field: string, _: string, value: unknown) => ({ field, value }),
  limit: (value: number) => ({ field: "limit", value }),
  query: (source: string, ...filters: unknown[]) => ({ source, filters }),
  onSnapshot: (
    query: (typeof state.listeners)[number]["query"],
    next: (snapshot: unknown) => void,
  ) => {
    const stop = vi.fn();
    state.listeners.push({ query, next, stop });
    return stop;
  },
}));

const members = (count: number) => ({
  docs: Array.from({ length: count }, (_, index) => ({
    ref: {
      parent: { parent: { id: `room-${String(index).padStart(3, "0")}` } },
    },
  })),
});
const room = (id: string, time: number) => ({
  id,
  data: () => ({ roomType: "event", lastMessageAt: { toMillis: () => time } }),
});

describe("chat room ordering", () => {
  beforeEach(() => {
    state.listeners.length = 0;
  });
  it("shows the newest room beyond the first 50 memberships and keeps it live", () => {
    const onValue = vi.fn();
    const stop = subscribeChatRoomsForUser("student", onValue, vi.fn());
    state.listeners
      .find((x) => x.query.source === "members")!
      .next(members(51));
    const groups = state.listeners.filter((x) =>
      x.query.filters.some((f) => f.field === "__name__"),
    );
    expect(groups).toHaveLength(7);
    for (const group of groups) {
      const ids = group.query.filters.find((f) => f.field === "__name__")!
        .value as string[];
      group.next({ docs: ids.map((id) => room(id, Number(id.slice(-3)))) });
    }
    expect(onValue).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "room-050" })]),
      true,
    );
    expect(onValue.mock.lastCall![0][0].id).toBe("room-050");
    const firstGroup = groups[0]!;
    const ids = firstGroup.query.filters.find((f) => f.field === "__name__")!
      .value as string[];
    firstGroup.next({
      docs: ids.map((id) =>
        room(id, id === "room-000" ? 999 : Number(id.slice(-3))),
      ),
    });
    expect(onValue.mock.lastCall![0][0].id).toBe("room-000");
    expect(onValue.mock.lastCall![0]).toHaveLength(50);
    stop();
    expect(state.listeners.every((x) => x.stop.mock.calls.length === 1)).toBe(
      true,
    );
  });
});
