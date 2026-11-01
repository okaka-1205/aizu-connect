import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { validateChatAttachment } from "../lib/appLogic";

type PendingSend = {
  requestId: string;
  expiresAt: number;
  promise?: Promise<void>;
};
const pendingSends = new Map<string, PendingSend>();
const retryWindow = 15 * 60 * 1000;

export const uploadChatAttachment = async (
  roomId: string,
  expectedUserId: string,
  file: File,
) => {
  validateChatAttachment(file);
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const key = JSON.stringify([
    roomId,
    expectedUserId,
    file.name,
    file.type,
    hash,
  ]);
  const now = Date.now();
  for (const [id, pending] of pendingSends) {
    if (!pending.promise && pending.expiresAt <= now) pendingSends.delete(id);
  }
  let pending = pendingSends.get(key);
  if (pending?.promise) return pending.promise;
  if (!pending) {
    pending = { requestId: crypto.randomUUID(), expiresAt: now + retryWindow };
    pendingSends.set(key, pending);
  }
  const current = pending;
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 32768)));
  }
  const send = httpsCallable(functions, "sendChatAttachment", {
    timeout: 360_000,
  });
  current.promise = send({
    roomId,
    expectedUserId,
    requestId: current.requestId,
    name: file.name.slice(0, 200),
    contentType: file.type,
    size: file.size,
    contentBase64: btoa(chunks.join("")),
  })
    .then(() => {
      pendingSends.delete(key);
    })
    .finally(() => {
      current.promise = undefined;
    });
  // Retain only small retry identifiers, not file contents, after a failure.
  for (const [id, entry] of pendingSends) {
    if (pendingSends.size <= 20) break;
    if (!entry.promise) pendingSends.delete(id);
  }
  return current.promise;
};
