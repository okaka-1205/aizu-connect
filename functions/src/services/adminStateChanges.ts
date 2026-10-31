import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {db} from "../lib/firebaseAdmin";
import {hasRequiredCommerceDisclosure} from "../lib/eventValidation";
import {type AdminActor} from "../lib/adminAuthorization";

export const adminAuditData = (
  actor: AdminActor,
  action: string,
  targetType: string,
  targetId: string,
  title: string,
  reason: string,
) => ({
  actorId: actor.uid,
  actorName: actor.displayName,
  action,
  targetType,
  targetId,
  targetTitle: title.slice(0, 200) || "対象データ",
  reason,
  createdAt: FieldValue.serverTimestamp(),
});

export const finishAdminOperation = (
  transaction: FirebaseFirestore.Transaction,
  operationRef: FirebaseFirestore.DocumentReference,
  audit: Record<string, unknown>,
  status: string,
) => {
  transaction.set(db.doc(`auditLogs/${operationRef.id}`), audit);
  transaction.set(
    operationRef,
    {
      status: "completed",
      resultStatus: status,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastError: FieldValue.delete(),
    },
    {merge: true},
  );
};

const assertReviewedVersion = (expected: unknown, actual: unknown) => {
  if (expected === null && !(actual instanceof Timestamp)) return;
  if (
    !expected ||
    typeof expected !== "object" ||
    !Number.isInteger((expected as Record<string, unknown>).seconds) ||
    !Number.isInteger((expected as Record<string, unknown>).nanoseconds)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "確認したイベントの版が必要です。画面を更新してください。",
    );
  }
  const version = expected as {seconds: number; nanoseconds: number};
  if (
    !(actual instanceof Timestamp) ||
    actual.seconds !== version.seconds ||
    actual.nanoseconds !== version.nanoseconds
  ) {
    throw new HttpsError(
      "failed-precondition",
      "イベントが変更されました。最新の内容を確認してから操作してください。",
    );
  }
};

export const applyAdminStateChange = async ({
  actor,
  action,
  targetId,
  reason,
  operationRef,
  expectedUpdatedAt,
}: {
  actor: AdminActor;
  action: string;
  targetId: string;
  reason: string;
  operationRef: FirebaseFirestore.DocumentReference;
  expectedUpdatedAt: unknown;
}) =>
  db.runTransaction(async (transaction) => {
    const targetType = action.endsWith("_report") ?
      "report" :
      action.endsWith("_user") ?
        "user" :
        "event";
    const collection = {report: "reports", user: "users", event: "events"}[
      targetType
    ];
    const targetRef = db.doc(`${collection}/${targetId}`);
    const snapshot = await transaction.get(targetRef);
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "対象データが見つかりません。");
    }
    const data = snapshot.data() ?? {};
    const title = String(
      data.title || data.targetTitle || data.displayName || "対象データ",
    );
    let status: string;
    let auditAction: string;
    let notification: Record<string, unknown> | undefined;
    if (targetType === "report") {
      status = action === "resolve_report" ? "resolved" : "dismissed";
      auditAction =
        action === "resolve_report" ? "report_resolved" : "report_dismissed";
      transaction.update(targetRef, {
        status,
        resolution: reason,
        resolvedAt: FieldValue.serverTimestamp(),
      });
    } else if (targetType === "user") {
      if (targetId === actor.uid || data.role === "admin") {
        throw new HttpsError(
          "permission-denied",
          "管理者アカウントはこの画面から操作できません。",
        );
      }
      const relatedRef =
        data.role === "student" ?
          db.doc(`studentProfiles/${targetId}`) :
          data.role === "organization" ?
            db.doc(`organizations/${targetId}`) :
            null;
      const related = relatedRef ? await transaction.get(relatedRef) : null;
      const review = ["approve_user", "reject_user"].includes(action);
      status = ["approve_user", "restore_user"].includes(action) ?
        "active" :
        action === "reject_user" ?
          "rejected" :
          "suspended";
      const update = {
        status,
        updatedAt: FieldValue.serverTimestamp(),
        ...(review ?
          {
            reviewReason:
                status === "rejected" ? reason : FieldValue.delete(),
            moderationReason: FieldValue.delete(),
          } :
          {
            moderationReason:
                status === "suspended" ? reason : FieldValue.delete(),
            ...(status === "active" ?
              {reviewReason: FieldValue.delete()} :
              {}),
          }),
      };
      transaction.update(targetRef, update);
      if (relatedRef && related?.exists) transaction.update(relatedRef, update);
      auditAction =
        {
          approve_user: "user_approve",
          reject_user: "user_reject",
          suspend_user: "user_suspend",
          restore_user: "user_restore",
        }[action] ?? action;
      if (review || status === "suspended") {
        notification = {
          recipientId: targetId,
          targetType: "profile",
          targetId,
          type: review ?
            status === "active" ?
              "account_approved" :
              "account_rejected" :
            "account_suspended",
          title: review ?
            status === "active" ?
              "アカウントが承認されました" :
              "アカウントの申請結果を確認してください" :
            "アカウントの利用を停止しました",
          body:
            status === "active" ?
              "Aizu Connectのすべての機能を利用できます。" :
              reason,
        };
      }
    } else {
      assertReviewedVersion(expectedUpdatedAt, data.updatedAt);
      const review = ["approve_event", "request_event_revision"].includes(
        action,
      );
      if (review && data.status !== "pending_review") {
        throw new HttpsError(
          "failed-precondition",
          "このイベントはすでに審査済みです。",
        );
      }
      if (
        !review &&
        !(
          (action === "unpublish_event" && data.status === "published") ||
          (action === "restore_event" && data.status === "unpublished")
        )
      ) {
        throw new HttpsError(
          "failed-precondition",
          "現在の公開状態からは変更できません。",
        );
      }
      status =
        action === "request_event_revision" ?
          "revision_required" :
          action === "unpublish_event" ?
            "unpublished" :
            "published";
      if (status === "published" && !hasRequiredCommerceDisclosure(data)) {
        throw new HttpsError(
          "failed-precondition",
          "有料イベントの特定商取引法に基づく表示が不足しています。",
        );
      }
      transaction.update(targetRef, {
        status,
        reviewedBy: actor.uid,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...(review ?
          {
            reviewNote:
                status === "published" ?
                  "公開基準を満たしていることを確認しました。" :
                  FieldValue.delete(),
            revisionReason:
                status === "revision_required" ? reason : FieldValue.delete(),
          } :
          {
            moderationReason:
                status === "unpublished" ? reason : FieldValue.delete(),
          }),
      });
      auditAction =
        {
          approve_event: "event_publish",
          request_event_revision: "event_revision_required",
          unpublish_event: "event_unpublish",
          restore_event: "event_restore",
        }[action] ?? action;
      if (
        (status === "revision_required" || !review) &&
        typeof data.createdBy === "string"
      ) {
        notification = {
          recipientId: data.createdBy,
          targetType: "event",
          targetId,
          type:
            status === "revision_required" ?
              "event_revision_required" :
              status === "unpublished" ?
                "event_unpublished" :
                "event_restored",
          title:
            status === "revision_required" ?
              "イベントの修正をお願いします" :
              status === "unpublished" ?
                "イベントを一時的に非公開にしました" :
                "イベントを再公開しました",
          body: reason,
        };
      }
    }
    if (notification) {
      const prefix = ["approve_user", "reject_user"].includes(action) ?
        "account_review" :
        action === "request_event_revision" ? "event_review" : "admin";
      transaction.set(db.doc(`notifications/${prefix}_${operationRef.id}`), {
        ...notification,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    finishAdminOperation(
      transaction,
      operationRef,
      adminAuditData(actor, auditAction, targetType, targetId, title, reason),
      status,
    );
    return {status, operationId: operationRef.id};
  });
