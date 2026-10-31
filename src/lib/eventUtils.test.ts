import { Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AizuEvent } from "../types/domain";
import { selectRecommendedEvent } from "./eventUtils";

const now = Date.UTC(2026, 9, 30);
const day = 86_400_000;
const event = (
  id: string,
  daysUntil: number,
  fields: Partial<AizuEvent> = {},
): AizuEvent => ({
  id,
  title: id,
  summary: "概要",
  category: "カテゴリ",
  location: "会津若松市",
  startAtLabel: "開催日時",
  startAt: Timestamp.fromMillis(now + daysUntil * day),
  organizationName: "主催者",
  status: "published",
  capacity: 20,
  applicantCount: 0,
  imageUrl: "event.jpg",
  tags: [],
  ...fields,
});

describe("selectRecommendedEvent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns no recommendation for an empty list", () => {
    expect(selectRecommendedEvent([], [], now)).toBeUndefined();
  });

  it.each<Partial<AizuEvent>>([
    { category: "地域交流" },
    { title: "地域交流会" },
    { tags: ["地域交流"] },
    { takeaways: ["地域交流を体験"] },
  ])("uses interests found in the event fields: %j", (fields) => {
    const near = event("near", 1);
    const matching = event("matching", 10, fields);
    expect(selectRecommendedEvent([near, matching], ["地域交流"], now)).toBe(
      matching,
    );
  });

  it("keeps the existing balance between interest matches and days until the event", () => {
    const near = event("near", 1);
    const matching = event("matching", 80, { tags: ["交流", "学習"] });
    const tooFar = event("too-far", 202, { tags: ["交流", "学習"] });
    expect(selectRecommendedEvent([near, matching], ["交流"], now)).toBe(
      matching,
    );
    expect(selectRecommendedEvent([near, tooFar], ["交流", "学習"], now)).toBe(
      near,
    );
  });

  it("keeps the first tied event and leaves the input array untouched", () => {
    const first = event("first", 2);
    const tied = event("tied", 2);
    const events = Object.freeze([first, tied, event("later", 3)]);
    expect(selectRecommendedEvent(events, [], now)).toBe(first);
    expect(events.map(({ id }) => id)).toEqual(["first", "tied", "later"]);
  });

  it("keeps the existing zero-day score for missing or elapsed start dates", () => {
    const missing = event("missing", 0, { startAt: undefined });
    const elapsed = event("elapsed", -1);
    expect(selectRecommendedEvent([missing, elapsed], [], now)).toBe(missing);
    expect(selectRecommendedEvent([elapsed, missing], [], now)).toBe(elapsed);
  });

  it("selects the nearest event when interests are absent", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const near = event("near", 1);
    expect(selectRecommendedEvent([event("later", 2), near])).toBe(near);
  });

  it("reads the clock once and evaluates each event once", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const events = Array.from({ length: 100 }, (_, index) =>
      event(String(index), 100 - index),
    );
    const reads = events.map((item) => vi.spyOn(item.startAt!, "toMillis"));
    expect(selectRecommendedEvent(events)).toBe(events[99]);
    expect(clock).toHaveBeenCalledTimes(1);
    for (const read of reads) expect(read).toHaveBeenCalledTimes(1);
  });
});
