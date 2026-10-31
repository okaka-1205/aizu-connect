import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeBatch } from "firebase/firestore";
import { uploadImage } from "../lib/storage";

const batch = vi.hoisted(() => ({
  set: vi.fn(),
  update: vi.fn(),
  commit: vi.fn<() => Promise<void>>(),
}));

vi.mock("../lib/firebase", () => ({ db: {} }));
vi.mock("../lib/storage", () => ({ uploadImage: vi.fn() }));
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
    vi.mocked(uploadImage).mockResolvedValue("https://example.com/attachment");
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
    { type: "image/png", expectedType: "image", preview: "画像を送信しました" },
    {
      type: "text/plain",
      expectedType: "file",
      preview: "ファイルを送信しました",
    },
  ])(
    "preserves attachment metadata and the $expectedType preview",
    async ({ type, expectedType, preview }) => {
      const file = new File(["attachment"], "資料 (1).png", { type });
      const sender = senders[1];

      await sendChatAttachment("event-1", sender, file);

      expect(uploadImage).toHaveBeenCalledWith(
        file,
        expect.stringMatching(
          /^chat-attachments\/event-1\/organizer-1\/\d+-____1_\.png$/,
        ),
      );
      expect(batch.set).toHaveBeenCalledWith(
        { id: "message-1", path: "chatRooms/event-1/messages/message-1" },
        expect.objectContaining({
          ...sender,
          type: expectedType,
          text: file.name,
          attachmentName: file.name,
          attachmentUrl: "https://example.com/attachment",
          attachmentType: type,
          attachmentSize: file.size,
        }),
      );
      expect(batch.update).toHaveBeenCalledWith("chatRooms/event-1", {
        lastMessageId: "message-1",
        lastMessageText: preview,
        lastMessageAt: "server-time",
      });
      expect(batch.commit).toHaveBeenCalledTimes(1);
    },
  );

  it("limits the attachment label to 200 characters", async () => {
    const file = new File(["note"], `${"a".repeat(210)}.txt`, {
      type: "text/plain",
    });

    await sendChatAttachment("event-1", senders[0], file);

    expect(batch.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        text: "a".repeat(200),
        attachmentName: "a".repeat(200),
      }),
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

      expect(uploadImage).not.toHaveBeenCalled();
      expect(writeBatch).not.toHaveBeenCalled();
    },
  );

  it("does not create a message or room preview when uploading fails", async () => {
    const error = new Error("Upload failed");
    vi.mocked(uploadImage).mockRejectedValueOnce(error);
    const file = new File(["note"], "note.txt", { type: "text/plain" });

    await expect(sendChatAttachment("event-1", senders[0], file)).rejects.toBe(
      error,
    );

    expect(writeBatch).not.toHaveBeenCalled();
  });

  it("propagates write failures so the screen can restore the draft", async () => {
    const error = new Error("Write failed");
    batch.commit.mockRejectedValueOnce(error);

    await expect(
      sendChatTextMessage("event-1", senders[0], "参加します。"),
    ).rejects.toBe(error);
  });
});
