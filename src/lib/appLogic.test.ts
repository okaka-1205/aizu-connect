import { describe, expect, it } from "vitest";

import {
  DEV_ADMIN_EMAIL,
  MAX_IMAGE_SIZE,
  formatEventStart,
  getFirebaseErrorMessage,
  isAizuUniversityEmail,
  isFutureEventStart,
  matchesCategoryFilter,
  normalizeLoginEmail,
  toDateTimeInput,
  toDateTimeLocalValue,
  validateImageFile,
} from "./appLogic";

describe("auth helpers", () => {
  it("normalizes regular login emails", () => {
    expect(normalizeLoginEmail("  STUDENT@U-AIZU.AC.JP  ")).toBe(
      "student@u-aizu.ac.jp",
    );
  });

  it("maps the dev admin shortcut only in dev mode", () => {
    expect(normalizeLoginEmail(" admin ", true)).toBe(DEV_ADMIN_EMAIL);
    expect(normalizeLoginEmail(" admin ", false)).toBe("admin");
  });

  it("recognizes Aizu University addresses case-insensitively", () => {
    expect(isAizuUniversityEmail(" Student@U-AIZU.AC.JP ")).toBe(true);
    expect(isAizuUniversityEmail("student@example.com")).toBe(false);
  });
});

describe("event helpers", () => {
  it("matches category aliases used by existing event data", () => {
    expect(matchesCategoryFilter("地域イベント", "地域活動")).toBe(true);
    expect(matchesCategoryFilter("企業交流", "交流・コミュニティ")).toBe(true);
    expect(matchesCategoryFilter("キャリア", "学び・制作")).toBe(true);
    expect(matchesCategoryFilter("キャリア", "ボランティア")).toBe(false);
  });

  it("formats local datetime labels for Japanese users", () => {
    expect(formatEventStart("2026-01-02T09:05:00+09:00")).toContain("9:05");
  });

  it("converts Firestore-like timestamps to datetime-local input values", () => {
    expect(
      toDateTimeInput({
        toDate: () => new Date("2026-01-02T09:05:00+09:00"),
      }),
    ).toMatch(/^2026-01-02T09:05$/);
  });

  it("uses local time for datetime inputs and rejects started events", () => {
    const now = new Date("2026-07-23T09:00:00+09:00");
    expect(toDateTimeLocalValue(now)).toBe("2026-07-23T09:00");
    expect(isFutureEventStart(new Date("2026-07-23T09:01:00+09:00"), now)).toBe(
      true,
    );
    expect(isFutureEventStart(now, now)).toBe(false);
    expect(isFutureEventStart(undefined, now)).toBe(false);
  });
});

describe("image validation", () => {
  it("accepts supported images below the storage rules limit", () => {
    expect(() =>
      validateImageFile(
        { type: "image/webp", size: MAX_IMAGE_SIZE - 1 },
        "画像",
      ),
    ).not.toThrow();
  });

  it("rejects unsupported image types and images at the 5MB boundary", () => {
    expect(() =>
      validateImageFile({ type: "image/gif", size: 1024 }, "画像"),
    ).toThrow("画像はJPEG、PNG、WebPのいずれかを選択してください。");
    expect(() =>
      validateImageFile({ type: "image/png", size: MAX_IMAGE_SIZE }, "画像"),
    ).toThrow("画像は5MB未満の画像を選択してください。");
  });
});

describe("firebase error messages", () => {
  it("prioritizes callable function errors", () => {
    expect(
      getFirebaseErrorMessage(
        Object.assign(new Error("Already applied."), {
          code: "functions/already-exists",
        }),
      ),
    ).toBe("このイベントにはすでに参加申請済みです。");
  });

  it("maps auth failures to user-friendly Japanese copy", () => {
    expect(
      getFirebaseErrorMessage(
        Object.assign(new Error("Firebase: auth/weak-password"), {
          code: "auth/weak-password",
        }),
      ),
    ).toBe("パスワードは6文字以上にしてください。");
  });

  it("falls back for unknown non-error values", () => {
    expect(getFirebaseErrorMessage(null)).toBe(
      "問題が発生しました。もう一度試してください。",
    );
  });
});
