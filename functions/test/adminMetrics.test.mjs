import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  percentage,
  recentUtcDateKeys,
  utcDateKey,
} from "../lib/lib/adminMetrics.js";

describe("admin dashboard metrics", () => {
  it("calculates stable percentages including empty data", () => {
    assert.equal(percentage(3, 8), 37.5);
    assert.equal(percentage(1, 3), 33.3);
    assert.equal(percentage(0, 0), 0);
  });

  it("builds UTC date keys for the rolling error window", () => {
    const now = new Date("2026-01-01T00:30:00.000Z");
    assert.equal(utcDateKey(now), "2026-01-01");
    assert.deepEqual(recentUtcDateKeys(3, now), [
      "2026-01-01",
      "2025-12-31",
      "2025-12-30",
    ]);
  });
});
