import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import type {
  AizuEvent,
  EventApplication,
  NotificationItem,
} from "../../types/domain";
import {
  countUnreadChats,
  filterOrganizationApplications,
  filterOrganizationEvents,
  summarizeApplicants,
} from "./organizationDashboardLogic";

describe("organization dashboard logic", () => {
  it("filters and orders events without mutating the source", () => {
    const events = [
      {
        id: "later",
        title: "地域交流",
        location: "会津若松市",
        organizationName: "地域団体",
        status: "published",
        startAt: Timestamp.fromMillis(4_000),
        createdAt: Timestamp.fromMillis(2_000),
      },
      {
        id: "sooner",
        title: "学生交流",
        location: "会津若松市",
        organizationName: "学生団体",
        status: "published",
        startAt: Timestamp.fromMillis(3_000),
        createdAt: Timestamp.fromMillis(1_000),
      },
    ] as AizuEvent[];

    expect(
      filterOrganizationEvents(events, "交流", "published", "date").map(
        (event) => event.id,
      ),
    ).toEqual(["sooner", "later"]);
    expect(events.map((event) => event.id)).toEqual(["later", "sooner"]);
  });

  it("summarizes applicants and unread chats", () => {
    const applications = [
      { studentName: "学生A", status: "pending" },
      { studentName: "学生B", status: "confirmed" },
      { studentName: "学生C", status: "confirmed" },
    ] as EventApplication[];
    const notifications = [
      { isRead: false, targetType: "chat", targetId: "room-a" },
      { isRead: false, targetType: "chat", targetId: "room-a" },
      { isRead: true, targetType: "chat", targetId: "room-a" },
    ] as NotificationItem[];

    expect(summarizeApplicants(applications)).toMatchObject({
      total: 3,
      pending: 1,
      confirmed: 2,
    });
    expect(
      filterOrganizationApplications(applications, "学生B", "confirmed"),
    ).toHaveLength(1);
    expect(countUnreadChats(notifications)).toEqual({ "room-a": 2 });
  });
});
