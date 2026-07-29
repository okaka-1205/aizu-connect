import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applicationStatusMessage,
  isCheckInWindowOpen,
  isEventPlanEditableStatus,
  isApplicationWindowOpen,
  isMissingStorageBucketError,
  matchesSavedSearch,
  normalizeEventPlanInput,
  reminderBucketForHoursUntil,
  reminderNotificationPath,
  shouldDecrementApplicantCount,
  shouldIncrementApplicantCount,
  shouldNotifyPublishedEventStudent,
  shouldSetChatRoomReadOnly,
} from "../lib/applicationLogic.js";

describe("administrative cleanup safeguards", () => {
  it("continues only when the configured Storage bucket is missing", () => {
    assert.equal(isMissingStorageBucketError({ code: 404 }), true);
    assert.equal(
      isMissingStorageBucketError({
        message: "The specified bucket does not exist.",
      }),
      true,
    );
    assert.equal(isMissingStorageBucketError({ code: 403 }), false);
    assert.equal(
      isMissingStorageBucketError(new Error("network error")),
      false,
    );
  });
});

describe("event plan editability", () => {
  it("allows owners to resubmit reviewable event states", () => {
    assert.equal(isEventPlanEditableStatus("pending_review"), true);
    assert.equal(isEventPlanEditableStatus("published"), true);
    assert.equal(isEventPlanEditableStatus("revision_required"), true);
    assert.equal(isEventPlanEditableStatus("unpublished"), true);
    assert.equal(isEventPlanEditableStatus("cancelled"), false);
  });
});

describe("application status logic", () => {
  it("uses specific user-facing messages for known status changes", () => {
    assert.equal(applicationStatusMessage("confirmed"), "参加が確定しました。");
    assert.equal(
      applicationStatusMessage("attended"),
      "出席が確認され、活動実績に追加されました。",
    );
  });

  it("falls back for unknown status changes", () => {
    assert.equal(
      applicationStatusMessage("manual_review"),
      "参加申請の状態が更新されました。",
    );
  });

  it("decrements applicant count only when a counted application exits", () => {
    assert.equal(shouldDecrementApplicantCount("pending", "cancelled"), true);
    assert.equal(shouldDecrementApplicantCount("confirmed", "rejected"), true);
    assert.equal(shouldDecrementApplicantCount("attended", "cancelled"), false);
    assert.equal(shouldDecrementApplicantCount("pending", "attended"), false);
  });

  it("increments applicant count when a waitlisted application is promoted", () => {
    assert.equal(shouldIncrementApplicantCount("waitlisted", "pending"), true);
    assert.equal(
      shouldIncrementApplicantCount("waitlisted", "confirmed"),
      true,
    );
    assert.equal(shouldIncrementApplicantCount("pending", "confirmed"), false);
  });

  it("locks chat rooms only for terminal unsuccessful statuses", () => {
    assert.equal(shouldSetChatRoomReadOnly("cancelled"), true);
    assert.equal(shouldSetChatRoomReadOnly("rejected"), true);
    assert.equal(shouldSetChatRoomReadOnly("confirmed"), false);
  });
});

describe("saved search matching", () => {
  const event = {
    title: "会津ボランティア",
    summary: "地域清掃",
    category: "ボランティア",
    location: "会津若松市",
    tags: ["初心者歓迎"],
    beginnerLevel: "初参加歓迎",
    feeType: "無料",
    eventFormat: "現地",
    applicantCount: 2,
    capacity: 10,
    startAtMillis: Date.parse("2026-08-01T09:00:00+09:00"),
  };

  it("matches category, fee, format and beginner preferences", () => {
    assert.equal(
      matchesSavedSearch(
        {
          searchText: "地域清掃",
          category: "ボランティア",
          feeFilter: "無料",
          formatFilter: "現地",
          onlyBeginner: true,
        },
        event,
        Date.parse("2026-07-20T00:00:00+09:00"),
      ),
      true,
    );
  });

  it("rejects full or mismatched events", () => {
    assert.equal(
      matchesSavedSearch(
        { onlyAvailable: true },
        { ...event, applicantCount: 10 },
        Date.parse("2026-07-20T00:00:00+09:00"),
      ),
      false,
    );
    assert.equal(
      matchesSavedSearch(
        { feeFilter: "有料" },
        event,
        Date.parse("2026-07-20T00:00:00+09:00"),
      ),
      false,
    );
  });
});

describe("event notification logic", () => {
  it("does not notify the organizer or students who disabled new events", () => {
    assert.equal(
      shouldNotifyPublishedEventStudent("student-1", "org-1", true),
      true,
    );
    assert.equal(
      shouldNotifyPublishedEventStudent("org-1", "org-1", true),
      false,
    );
    assert.equal(
      shouldNotifyPublishedEventStudent("student-1", "org-1", false),
      false,
    );
  });
});

describe("event application window logic", () => {
  it("accepts only published events that have not started", () => {
    const now = Date.parse("2026-07-23T00:00:00.000Z");
    assert.equal(isApplicationWindowOpen("published", now + 60_000, now), true);
    assert.equal(isApplicationWindowOpen("published", now, now), false);
    assert.equal(
      isApplicationWindowOpen("pending_review", now + 60_000, now),
      false,
    );
    assert.equal(isApplicationWindowOpen("published", Number.NaN, now), false);
  });
});

describe("event plan validation", () => {
  const validPlan = {
    title: "学生と地域の交流会",
    summary: "初めてでも参加しやすい交流会です。",
    category: "交流・コミュニティ",
    location: "会津若松市",
    startAtMillis: Date.parse("2026-08-01T09:00:00.000Z"),
    endAtMillis: Date.parse("2026-08-01T11:00:00.000Z"),
    feeType: "無料",
    feeAmount: 100,
    eventFormat: "現地",
    meetingPoint: "会津大学正門前",
    accessInfo: "",
    bringItems: "学生証",
    cancellationPolicy: "前日までにキャンセルしてください。",
    weatherPolicy: "中止時はチャットで連絡します。",
    accessibility: "必要な配慮をお知らせください。",
    contactMethod: "個別チャット",
    capacity: 20,
    imageUrl: "https://example.com/event.png",
    templateKey: "交流会",
    beginnerLevel: "初参加歓迎",
    takeaways: ["地域とつながる"],
    organizerDescription: "地域交流を企画しています。",
    organizerExperience: "10回開催",
  };

  it("normalizes a complete future event plan", () => {
    const result = normalizeEventPlanInput(
      validPlan,
      Date.parse("2026-07-01T00:00:00.000Z"),
    );
    assert.equal(result?.feeAmount, 0);
    assert.equal(result?.title, validPlan.title);
    assert.equal("atmosphere" in result, false);
  });

  it("rejects past, reversed, or incomplete event plans", () => {
    const now = Date.parse("2026-08-01T10:00:00.000Z");
    assert.equal(normalizeEventPlanInput(validPlan, now), null);
    assert.equal(
      normalizeEventPlanInput(
        { ...validPlan, endAtMillis: validPlan.startAtMillis },
        Date.parse("2026-07-01T00:00:00.000Z"),
      ),
      null,
    );
    assert.equal(
      normalizeEventPlanInput(
        { ...validPlan, cancellationPolicy: "" },
        Date.parse("2026-07-01T00:00:00.000Z"),
      ),
      null,
    );
  });

  it("rejects insecure remote image URLs while allowing emulator URLs", () => {
    const now = Date.parse("2026-07-01T00:00:00.000Z");
    assert.equal(
      normalizeEventPlanInput(
        { ...validPlan, imageUrl: "http://example.com/event.png" },
        now,
      ),
      null,
    );
    assert.equal(
      normalizeEventPlanInput(
        { ...validPlan, imageUrl: "http://127.0.0.1:9199/event.png" },
        now,
      )?.imageUrl,
      "http://127.0.0.1:9199/event.png",
    );
  });
});

describe("event check-in window logic", () => {
  it("opens shortly before a published event and closes the next day", () => {
    const start = Date.parse("2026-08-01T09:00:00.000Z");
    const end = Date.parse("2026-08-01T11:00:00.000Z");
    assert.equal(
      isCheckInWindowOpen(
        "published",
        start,
        end,
        Date.parse("2026-08-01T06:00:00.000Z"),
      ),
      true,
    );
    assert.equal(
      isCheckInWindowOpen(
        "published",
        start,
        end,
        Date.parse("2026-08-02T11:00:00.001Z"),
      ),
      false,
    );
    assert.equal(isCheckInWindowOpen("cancelled", start, end, start), false);
  });
});

describe("event reminder logic", () => {
  it("uses the two-hour reminder bucket at the two-hour boundary", () => {
    assert.equal(reminderBucketForHoursUntil(2), "2h");
    assert.equal(reminderBucketForHoursUntil(1.99), "2h");
    assert.equal(reminderBucketForHoursUntil(2.01), "24h");
  });

  it("builds stable notification document paths for idempotent reminders", () => {
    assert.equal(
      reminderNotificationPath("event-1", "student-1", "24h"),
      "notifications/reminder_event-1_student-1_24h",
    );
  });
});
