import {createHash} from "node:crypto";
import {HttpsError} from "firebase-functions/v2/https";
import {requiredDocumentId} from "./callableValidation";

export const MAX_CHAT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const acceptedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
]);

export const parseChatAttachment = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "添付ファイルの情報が不正です。");
  }
  const data = value as Record<string, unknown>;
  const allowed = [
    "roomId",
    "expectedUserId",
    "requestId",
    "name",
    "contentType",
    "size",
    "contentBase64",
  ];
  if (
    !Object.keys(data).every((key) => allowed.includes(key)) ||
    typeof data.expectedUserId !== "string" ||
    typeof data.requestId !== "string" ||
    !/^[A-Za-z0-9_-]{16,80}$/.test(data.requestId) ||
    typeof data.name !== "string" ||
    !data.name ||
    data.name.length > 200 ||
    typeof data.contentType !== "string" ||
    !acceptedTypes.has(data.contentType) ||
    !Number.isInteger(data.size) ||
    Number(data.size) < 0 ||
    Number(data.size) >= MAX_CHAT_ATTACHMENT_BYTES ||
    typeof data.contentBase64 !== "string" ||
    data.contentBase64.length !== Math.ceil(Number(data.size) / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(data.contentBase64)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "添付の形式と10MB未満のサイズを確認してください。",
    );
  }
  const roomId = requiredDocumentId(data.roomId);
  const bytes = Buffer.from(data.contentBase64, "base64");
  if (
    bytes.length !== data.size ||
    bytes.toString("base64") !== data.contentBase64
  ) {
    throw new HttpsError(
      "invalid-argument",
      "添付ファイルのデータが不正です。",
    );
  }
  // Salt the fingerprint with the private retry identifier. It is retained
  // after a soft delete without retaining a guessable hash of the file alone.
  const fingerprint = createHash("sha256")
    .update(data.requestId)
    .update("\0")
    .update(data.name)
    .update("\0")
    .update(data.contentType)
    .update("\0")
    .update(bytes)
    .digest("hex");
  return {
    roomId,
    requestId: data.requestId,
    name: data.name,
    contentType: data.contentType,
    bytes,
    fingerprint,
  };
};
