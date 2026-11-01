import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseChatAttachment,
  MAX_CHAT_ATTACHMENT_BYTES,
} from "../lib/lib/chatAttachmentValidation.js";

const payload = (overrides = {}) => ({
  roomId: "event-room",
  expectedUserId: "student-1",
  requestId: "12345678-1234-1234-1234-123456789abc",
  name: "資料.txt",
  contentType: "text/plain",
  size: 4,
  contentBase64: Buffer.from("note").toString("base64"),
  ...overrides,
});
describe("server attachment validation", () => {
  for (const contentType of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/csv",
  ]) {
    it(`accepts the existing allowed type ${contentType}`, () => {
      const result = parseChatAttachment(payload({ contentType }));
      assert.equal(result.contentType, contentType);
      assert.equal(result.bytes.toString(), "note");
    });
  }
  it("accepts an empty text file and a file one byte below the size limit", () => {
    assert.equal(
      parseChatAttachment(payload({ size: 0, contentBase64: "" })).bytes.length,
      0,
    );
    const bytes = Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES - 1, 65);
    assert.equal(
      parseChatAttachment(
        payload({
          size: bytes.length,
          contentBase64: bytes.toString("base64"),
        }),
      ).bytes.length,
      bytes.length,
    );
  });
  for (const overrides of [
    { contentType: "application/javascript" },
    { size: MAX_CHAT_ATTACHMENT_BYTES },
    { size: -1 },
    { size: 1.5 },
    { size: 3 },
    { contentBase64: "bad!" },
    { contentBase64: "bm90ZQ==\n" },
    { contentBase64: "bm90ZR==" },
    { name: "" },
    { name: "x".repeat(201) },
    { roomId: "room/nested" },
    { requestId: "short" },
    { senderId: "someone-else" },
  ]) {
    it(`rejects invalid metadata or bytes: ${JSON.stringify(overrides)}`, () => {
      assert.throws(
        () => parseChatAttachment(payload(overrides)),
        (error) => error.code === "invalid-argument",
      );
    });
  }
  it("binds retries to bytes, filename, type and the private request ID", () => {
    const original = parseChatAttachment(payload()).fingerprint;
    assert.equal(parseChatAttachment(payload()).fingerprint, original);
    for (const value of [
      payload({ name: "other.txt" }),
      payload({ contentType: "text/csv" }),
      payload({ requestId: "different-request-identifier" }),
      payload({ contentBase64: Buffer.from("next").toString("base64") }),
    ]) {
      assert.notEqual(parseChatAttachment(value).fingerprint, original);
    }
  });
});
