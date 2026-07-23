import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
  applicationStatusMessage,
  reminderBucketForHoursUntil,
  reminderNotificationPath,
  shouldDecrementApplicantCount,
  shouldNotifyPublishedEventStudent,
  shouldSetChatRoomReadOnly,
} from "../lib/applicationLogic.js";

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

  it("locks chat rooms only for terminal unsuccessful statuses", () => {
    assert.equal(shouldSetChatRoomReadOnly("cancelled"), true);
    assert.equal(shouldSetChatRoomReadOnly("rejected"), true);
    assert.equal(shouldSetChatRoomReadOnly("confirmed"), false);
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
