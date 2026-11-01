import {createHash, randomUUID} from "node:crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {adminStorage, db} from "../lib/firebaseAdmin";
import {parseChatAttachment} from "../lib/chatAttachmentValidation";
import {readChatAttachmentAccess} from "../services/chatAttachmentAccess";
import {
  tryCleanupChatAttachmentAttempt,
} from "../services/chatAttachmentCleanup";

const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
const enforceAppCheck =
  !isEmulator &&
  (process.env.ENFORCE_CALLABLE_APP_CHECK ??
    process.env.ENFORCE_ADMIN_APP_CHECK) === "true";

export const sendChatAttachment = onCall(
  {
    region: "asia-northeast1",
    invoker: "public",
    enforceAppCheck,
    memory: "512MiB",
    concurrency: 2,
    maxInstances: 5,
    timeoutSeconds: 300,
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "ログインが必要です。");
    }
    if (request.auth?.token.email_verified !== true) {
      throw new HttpsError("permission-denied", "メール認証が必要です。");
    }
    if (request.data?.expectedUserId !== userId) {
      throw new HttpsError(
        "permission-denied",
        "ログイン状態が変わりました。送信し直してください。",
      );
    }
    const upload = parseChatAttachment(request.data);
    const messageId =
      "attachment_" +
      createHash("sha256")
        .update(userId)
        .update("\0")
        .update(upload.roomId)
        .update("\0")
        .update(upload.requestId)
        .digest("hex");
    const roomRef = db.doc(`chatRooms/${upload.roomId}`);
    const messageRef = roomRef.collection("messages").doc(messageId);
    const attemptId = randomUUID();
    const attemptRef = db.doc(`chatAttachmentUploads/${attemptId}`);
    const objectPath =
      `chat-attachments/${upload.roomId}/${userId}/${attemptId}`;
    const assertSameMessage = (message: FirebaseFirestore.DocumentSnapshot) => {
      if (
        message.exists &&
        (message.data()?.senderId !== userId ||
          message.data()?.uploadFingerprint !== upload.fingerprint)
      ) {
        throw new HttpsError(
          "already-exists",
          "送信識別子が別のデータに使われています。",
        );
      }
      return message.exists;
    };
    const duplicate = await db.runTransaction(async (transaction) => {
      const access = await readChatAttachmentAccess(
        transaction,
        userId,
        upload.roomId,
      );
      const message = await transaction.get(messageRef);
      if (assertSameMessage(message)) return true;
      if (
        access.room.data()?.status !== "active" ||
        access.event.data()?.status === "cancelled"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "終了したチャットには添付できません。",
        );
      }
      transaction.create(attemptRef, {
        userId,
        roomId: upload.roomId,
        messageId,
        objectPath,
        fingerprint: upload.fingerprint,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
      });
      return false;
    });
    if (duplicate) return {messageId};
    let stored = false;
    let finalizationStarted = false;
    try {
      const file = adminStorage.bucket().file(objectPath);
      const downloadToken = randomUUID();
      const filename = upload.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const encodedName = encodeURIComponent(
        Buffer.from(upload.name).toString("utf8"),
      ).replace(/['()*]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      await file.save(upload.bytes, {
        resumable: false,
        timeout: 60_000,
        preconditionOpts: {ifGenerationMatch: 0},
        metadata: {
          contentType: upload.contentType,
          contentDisposition: `inline; filename="${filename}"; ` +
            `filename*=UTF-8''${encodedName}`,
          cacheControl: "public,max-age=3600",
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
            uploadAttemptId: attemptId,
            uploadFingerprint: upload.fingerprint,
          },
        },
      });
      stored = true;
      // Reuse the saved token instead of fetching Firebase metadata again.
      const endpoint = process.env.STORAGE_EMULATOR_HOST ||
        "https://firebasestorage.googleapis.com";
      const url = `${endpoint}/v0/b/${file.bucket.name}/o/` +
        `${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;
      finalizationStarted = true;
      const result = await db.runTransaction(async (transaction) => {
        const access = await readChatAttachmentAccess(
          transaction,
          userId,
          upload.roomId,
        );
        const message = await transaction.get(messageRef);
        if (assertSameMessage(message)) return "duplicate";
        if (
          access.room.data()?.status !== "active" ||
          access.event.data()?.status === "cancelled"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "終了したチャットには添付できません。",
          );
        }
        const type = upload.contentType.startsWith("image/") ? "image" : "file";
        transaction.create(messageRef, {
          roomId: upload.roomId,
          senderId: userId,
          senderName: access.senderName,
          type,
          text: upload.name,
          attachmentName: upload.name,
          attachmentUrl: url,
          attachmentType: upload.contentType,
          attachmentSize: upload.bytes.length,
          attachmentPath: objectPath,
          uploadFingerprint: upload.fingerprint,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.update(roomRef, {
          lastMessageId: messageId,
          lastMessageText: `${type === "image" ? "画像" : "ファイル"}を送信しました`,
          lastMessageAt: FieldValue.serverTimestamp(),
        });
        transaction.delete(attemptRef);
        return "created";
      });
      if (result === "duplicate") {
        await tryCleanupChatAttachmentAttempt(attemptRef);
      }
      return {messageId};
    } catch (error) {
      // Preserve a committed attachment when its response was lost.
      try {
        const message = await messageRef.get();
        if (
          message.data()?.senderId === userId &&
          message.data()?.uploadFingerprint === upload.fingerprint
        ) {
          await tryCleanupChatAttachmentAttempt(attemptRef);
          return {messageId};
        }
        if (stored && (!finalizationStarted || error instanceof HttpsError)) {
          await tryCleanupChatAttachmentAttempt(attemptRef);
        }
      } catch {
        // Reconciliation checks the committed message before deleting the
        // object generation owned by this pending attempt.
      }
      throw error;
    }
  },
);
