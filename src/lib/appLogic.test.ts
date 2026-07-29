import { describe, expect, it } from "vitest";

import {
  MAX_CHAT_ATTACHMENT_SIZE,
  MAX_IMAGE_SIZE,
  formatEventStart,
  getFirebaseErrorMessage,
  isAizuUniversityEmail,
  isFutureEventStart,
  matchesCategoryFilter,
  normalizeLoginEmail,
  resolveAccountAccessGate,
  toCalendarFile,
  toDateTimeInput,
  toDateTimeLocalValue,
  validateChatAttachment,
  validateImageFile,
} from "./appLogic";

describe("auth helpers", () => {
  it("normalizes regular login emails", () => {
    expect(normalizeLoginEmail("  STUDENT@U-AIZU.AC.JP  ")).toBe(
      "student@u-aizu.ac.jp",
    );
  });

  it("maps the dev admin shortcut only in dev mode", () => {
    expect(normalizeLoginEmail(" admin ", "admin@aizu-connect.local")).toBe(
      "admin@aizu-connect.local",
    );
    expect(normalizeLoginEmail(" admin ")).toBe("admin");
  });

  it("recognizes Aizu University addresses case-insensitively", () => {
    expect(isAizuUniversityEmail(" Student@U-AIZU.AC.JP ")).toBe(true);
    expect(isAizuUniversityEmail("student@example.com")).toBe(false);
  });

  it("shows email verification before an admin approval wait", () => {
    expect(
      resolveAccountAccessGate({
        isProduction: true,
        emailVerified: false,
        status: "pending_approval",
      }),
    ).toBe("email_verification");
    expect(
      resolveAccountAccessGate({
        isProduction: true,
        emailVerified: true,
        status: "pending_approval",
      }),
    ).toBe("admin_approval");
  });

  it("only grants access to active accounts", () => {
    expect(
      resolveAccountAccessGate({
        isProduction: true,
        emailVerified: true,
        status: "active",
      }),
    ).toBe("active");
    expect(
      resolveAccountAccessGate({
        isProduction: true,
        emailVerified: true,
        status: "suspended",
      }),
    ).toBe("account_rejected");
    expect(
      resolveAccountAccessGate({
        isProduction: true,
        emailVerified: true,
        status: "profile_incomplete",
      }),
    ).toBe("account_setup");
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

  it("builds an importable calendar entry with escaped event text", () => {
    const calendar = toCalendarFile({
      id: "event-1",
      title: "会津交流会, 夏",
      summary: "1行目\n2行目",
      location: "会津若松市",
      startAt: new Date("2026-08-01T09:00:00.000Z"),
      endAt: new Date("2026-08-01T11:00:00.000Z"),
    });
    expect(calendar).toContain("BEGIN:VEVENT");
    expect(calendar).toContain("SUMMARY:会津交流会\\, 夏");
    expect(calendar).toContain("DESCRIPTION:1行目\\n2行目");
    expect(calendar).toContain("DTEND:20260801T110000Z");
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

describe("chat attachment validation", () => {
  it("accepts supported documents below 10MB", () => {
    expect(() =>
      validateChatAttachment({
        type: "application/pdf",
        size: MAX_CHAT_ATTACHMENT_SIZE - 1,
      }),
    ).not.toThrow();
  });

  it("rejects unsupported or oversized files", () => {
    expect(() =>
      validateChatAttachment({ type: "application/zip", size: 1024 }),
    ).toThrow("添付できるのは");
    expect(() =>
      validateChatAttachment({
        type: "image/png",
        size: MAX_CHAT_ATTACHMENT_SIZE,
      }),
    ).toThrow("10MB未満");
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

  it("explains when only administrator approval remains", () => {
    expect(
      getFirebaseErrorMessage(
        Object.assign(new Error("管理者の承認待ちです。"), {
          code: "functions/permission-denied",
        }),
      ),
    ).toBe("メール認証は完了しています。現在は管理者の承認待ちです。");
  });

  it("keeps email verification errors distinct from event state errors", () => {
    expect(
      getFirebaseErrorMessage(
        Object.assign(new Error("Email verification is required."), {
          code: "functions/failed-precondition",
        }),
      ),
    ).toBe(
      "メールアドレスの確認が必要です。確認メールのリンクを開いてから、もう一度お試しください。",
    );
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
