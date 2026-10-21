import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import type { AizuEvent, AppUser } from "../../types/domain";
import { deriveAdminDashboardView } from "./adminDashboardLogic";

describe("deriveAdminDashboardView", () => {
  it("filters queues and sorts newest records first", () => {
    const older = {
      id: "older",
      title: "地域交流会",
      organizationName: "地域団体",
      location: "会津若松市",
      createdAt: Timestamp.fromMillis(1_000),
    } as AizuEvent;
    const newer = {
      ...older,
      id: "newer",
      title: "学生交流会",
      createdAt: Timestamp.fromMillis(2_000),
    } as AizuEvent;
    const activeUser = {
      uid: "active-user",
      displayName: "対象学生",
      email: "student@example.com",
      university: "会津大学",
      status: "active",
      createdAt: Timestamp.fromMillis(3_000),
    } as AppUser;

    const result = deriveAdminDashboardView({
      search: "交流会",
      pendingEvents: [older, newer],
      pendingUsers: [],
      pendingReports: [],
      deletionRequests: [],
      deletionRequestUsers: {},
      managedUsers: [activeUser],
      managedEvents: [],
      managedUserStatus: "active",
      auditLogs: [],
      now: new Date("2026-10-21T00:00:00+09:00"),
    });

    expect(result.visiblePendingEvents.map((event) => event.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(result.visibleManagedUsers).toEqual([]);
  });
});
