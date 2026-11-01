import {logger} from "firebase-functions";
import {Timestamp} from "firebase-admin/firestore";
import {adminStorage, db} from "../lib/firebaseAdmin";

// A pending attempt has its own random object path. Never remove a file that
// a committed message references, including after a lost commit response.
export const cleanupChatAttachmentAttempt = async (
  attemptRef: FirebaseFirestore.DocumentReference,
) => {
  const attempt = await attemptRef.get();
  const data = attempt.data();
  if (!data) return;
  if (
    typeof data.roomId !== "string" ||
    typeof data.messageId !== "string" ||
    typeof data.userId !== "string" ||
    typeof data.fingerprint !== "string" ||
    data.objectPath !==
      `chat-attachments/${data.roomId}/${data.userId}/${attempt.id}`
  ) {
    throw new Error("Invalid server-owned attachment attempt");
  }
  const message = await db
    .doc(`chatRooms/${data.roomId}/messages/${data.messageId}`)
    .get();
  if (
    message.data()?.attachmentPath === data.objectPath &&
    message.data()?.uploadFingerprint === data.fingerprint
  ) {
    await attemptRef.delete();
    return;
  }
  const file = adminStorage.bucket().file(data.objectPath);
  try {
    const [metadata] = await file.getMetadata();
    if (
      !metadata.generation ||
      metadata.metadata?.uploadAttemptId !== attempt.id ||
      metadata.metadata?.uploadFingerprint !== data.fingerprint
    ) {
      throw new Error("Attachment attempt does not own the object");
    }
    await file.delete({ifGenerationMatch: metadata.generation});
  } catch (error) {
    if (Number((error as { code?: unknown }).code) !== 404) throw error;
  }
  await attemptRef.delete();
};

export const tryCleanupChatAttachmentAttempt = async (
  attemptRef: FirebaseFirestore.DocumentReference,
) => {
  try {
    await cleanupChatAttachmentAttempt(attemptRef);
  } catch (error) {
    logger.warn("Attachment cleanup deferred", {
      attemptId: attemptRef.id,
      code: String((error as { code?: unknown }).code ?? "unknown"),
    });
  }
};

export const runCleanupExpiredChatAttachments = async (
  now: Timestamp = Timestamp.now(),
) => {
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let processed = 0;
  for (;;) {
    const query = db
      .collection("chatAttachmentUploads")
      .where("expiresAt", "<=", now)
      .orderBy("expiresAt")
      .limit(100);
    const page = await (cursor ? query.startAfter(cursor) : query).get();
    if (page.empty) break;
    for (const attempt of page.docs) {
      await tryCleanupChatAttachmentAttempt(attempt.ref);
      processed++;
    }
    cursor = page.docs[page.docs.length - 1];
    if (page.size < 100) break;
  }
  return {processed};
};
