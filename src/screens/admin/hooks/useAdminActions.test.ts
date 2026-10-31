import { afterEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import { useAdminActions } from "./useAdminActions";
import type { AizuEvent } from "../../../types/domain";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => invoke }));
vi.mock("react", () => ({ useRef: () => ({ current: new Map() }) }));

describe("review operation retry identity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    invoke.mockReset();
  });
  it("reuses a failed request only for the same reviewed version", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    invoke.mockRejectedValue(new Error("Uncertain response"));
    const { approveEvent } = useAdminActions({
      setNotice: vi.fn(),
      setIsLoading: vi.fn(),
      setReasonAction: vi.fn(),
    });
    const base = { id: "event", updatedAt: new Timestamp(1, 5) } as AizuEvent;
    await approveEvent(base);
    await approveEvent(base);
    await approveEvent({ ...base, updatedAt: new Timestamp(1, 6) });
    expect(invoke.mock.calls[0]?.[0].requestId).toBe(
      invoke.mock.calls[1]?.[0].requestId,
    );
    expect(invoke.mock.calls[2]?.[0].requestId).not.toBe(
      invoke.mock.calls[0]?.[0].requestId,
    );
    expect(invoke.mock.calls[2]?.[0].expectedUpdatedAt).toEqual({
      seconds: 1,
      nanoseconds: 6,
    });
  });
});
