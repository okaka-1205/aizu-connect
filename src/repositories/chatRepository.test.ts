import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeBatch } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const delivery = vi.hoisted(() => ({
  send: vi.fn<
    (...args: unknown[]) => Promise<{ data: { messageId: string } }>
  >(),
}));

const batch = vi.hoisted(() => ({
  set: vi.fn(),
  update: vi.fn(),
  commit: vi.fn<() => Promise<void>>(),
}));

vi.mock("../lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => delivery.send),
}));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    collection: vi.fn((parent: unknown, name: string) => `${parent}/${name}`),
    doc: vi.fn((parent: unknown, ...segments: string[]) =>
      typeof parent === "string"
        ? {
            id: "message-1",
            path: `${parent}/${segments.join("/") || "message-1"}`,
          }
        : segments.join("/"),
    ),
    serverTimestamp: vi.fn(() => "server-time"),
    writeBatch: vi.fn(() => batch),
  };
});

import { sendChatAttachment, sendChatTextMessage } from "./chatRepository";

const senders = [
  { senderId: "student-1", senderName: "学生の表示名" },
  { senderId: "organizer-1", senderName: "主催団体名" },
] as const;

describe("chat message delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batch.commit.mockResolvedValue(undefined);
    delivery.send.mockResolvedValue({ data: { messageId: "server-message" } });
  });

  it.each(senders)(
    "preserves $senderName and updates the room atomically",
    async (sender) => {
      await sendChatTextMessage("event-1", sender, "参加します。");

      expect(batch.set).toHaveBeenCalledWith(
        { id: "message-1", path: "chatRooms/event-1/messages/message-1" },
        {
          roomId: "event-1",
          ...sender,
          type: "text",
          text: "参加します。",
          createdAt: "server-time",
        },
      );
      expect(batch.update).toHaveBeenCalledWith("chatRooms/event-1", {
        lastMessageId: "message-1",
        lastMessageText: "参加します。",
        lastMessageAt: "server-time",
      });
      expect(writeBatch).toHaveBeenCalledTimes(1);
      expect(batch.commit).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { type: "image/png", expectedType: "image" },
    {
      type: "text/plain",
      expectedType: "file",
    },
  ])(
    "sends $expectedType attachment metadata through the callable",
    async ({ type }) => {
      const file = new File(["attachment"], "資料 (1).png", { type });
      const sender = senders[1];

      await sendChatAttachment("event-1", sender, file);

      expect(httpsCallable).toHaveBeenCalledWith({}, "sendChatAttachment", {
        timeout: 360_000,
      });
      expect(delivery.send).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: "event-1",
          expectedUserId: sender.senderId,
          name: file.name,
          contentType: type,
          size: file.size,
          contentBase64: btoa("attachment"),
          requestId: expect.any(String),
        }),
      );
      expect(writeBatch).not.toHaveBeenCalled();
    },
  );

  it("limits the attachment label to 200 characters", async () => {
    const file = new File(["note"], `${"a".repeat(210)}.txt`, {
      type: "text/plain",
    });

    await sendChatAttachment("event-1", senders[0], file);

    expect(delivery.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "a".repeat(200) }),
    );
  });

  it.each([
    { type: "application/javascript", size: 1 },
    { type: "text/plain", size: 10 * 1024 * 1024 },
  ])(
    "rejects an invalid attachment before uploading or writing ($type, $size bytes)",
    async ({ type, size }) => {
      const file = new File([new Uint8Array(size)], "attachment", { type });

      await expect(
        sendChatAttachment("event-1", senders[0], file),
      ).rejects.toThrow();

      expect(delivery.send).not.toHaveBeenCalled();
      expect(writeBatch).not.toHaveBeenCalled();
    },
  );

  it("does not create a message or room preview when uploading fails", async () => {
    const error = new Error("Upload failed");
    delivery.send.mockRejectedValueOnce(error);
    const file = new File(["note"], "note.txt", { type: "text/plain" });

    await expect(sendChatAttachment("event-1", senders[0], file)).rejects.toBe(
      error,
    );

    expect(writeBatch).not.toHaveBeenCalled();
  });

  it("reuses the request ID after an ambiguous failure and starts a new send after success", async () => {
    const file = new File(["retry payload"], "retry-note.txt", {
      type: "text/plain",
    });
    delivery.send.mockRejectedValueOnce(new Error("Connection interrupted"));
    await expect(
      sendChatAttachment("event-retry", senders[0], file),
    ).rejects.toThrow("Connection interrupted");
    const first = delivery.send.mock.calls[0]![0] as { requestId: string };
    await sendChatAttachment(
      "event-retry",
      senders[0],
      new File(["retry payload"], "retry-note.txt", { type: "text/plain" }),
    );
    const second = delivery.send.mock.calls[1]![0] as { requestId: string };
    expect(second.requestId).toBe(first.requestId);
    await sendChatAttachment("event-retry", senders[0], file);
    const third = delivery.send.mock.calls[2]![0] as { requestId: string };
    expect(third.requestId).not.toBe(first.requestId);
  });

  it("coalesces concurrent sends of the same file in one room", async () => {
    const file = new File(["concurrent payload"], "concurrent-note.txt", {
      type: "text/plain",
    });
    let finish: (value: { data: { messageId: string } }) => void;
    const started = new Promise<void>((resolve) => {
      delivery.send.mockImplementationOnce(() => {
        resolve();
        return new Promise((complete) => {
          finish = complete;
        });
      });
    });
    const first = sendChatAttachment("event-concurrent", senders[0], file);
    const second = sendChatAttachment("event-concurrent", senders[0], file);
    await started;
    await new Promise((resolve) => setTimeout(resolve, 20));
    finish!({ data: { messageId: "server-message" } });
    await Promise.all([first, second]);
    expect(delivery.send).toHaveBeenCalledOnce();
  });

  it("propagates write failures so the screen can restore the draft", async () => {
    const error = new Error("Write failed");
    batch.commit.mockRejectedValueOnce(error);

    await expect(
      sendChatTextMessage("event-1", senders[0], "参加します。"),
    ).rejects.toBe(error);
  });
});
