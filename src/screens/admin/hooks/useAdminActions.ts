import { httpsCallable } from "firebase/functions";
import { useRef } from "react";
import { getFirebaseErrorMessage } from "../../../lib/appLogic";
import { functions } from "../../../lib/firebase";
import type {
  AizuEvent,
  AppUser,
  ReportRecord,
  SetNotice,
} from "../../../types/domain";

export function useAdminActions({
  setNotice,
  setIsLoading,
  setReasonAction,
}: {
  setNotice: SetNotice;
  setIsLoading: (loading: boolean) => void;
  setReasonAction: (action: null) => void;
}) {
  const pendingOperationIds = useRef(new Map<string, string>());

  const approveEvent = async (event: AizuEvent) => {
    await runAdminAction(
      "approve_event",
      event.id,
      "公開基準を満たしていることを確認",
      "イベントを公開しました。",
      event,
    );
  };

  const requestEventRevision = async (event: AizuEvent, reason: string) => {
    await runAdminAction(
      "request_event_revision",
      event.id,
      reason,
      "理由を添えてイベントを差し戻しました。",
      event,
    );
  };

  const approveUser = async (user: AppUser) => {
    await runAdminAction(
      "approve_user",
      user.uid,
      "登録情報を確認",
      "アカウントを承認しました。",
    );
  };

  const rejectUser = async (user: AppUser, reason: string) => {
    await runAdminAction(
      "reject_user",
      user.uid,
      reason,
      "アカウントを見送りました。",
    );
  };

  const resolveReport = async (
    report: ReportRecord,
    status: "resolved" | "dismissed",
    reason: string,
  ) => {
    await runAdminAction(
      status === "resolved" ? "resolve_report" : "dismiss_report",
      report.id,
      reason,
      status === "resolved"
        ? "通報を対応済みにしました。"
        : "通報を棄却しました。",
    );
  };

  type AdminAction =
    | "approve_event"
    | "request_event_revision"
    | "approve_user"
    | "reject_user"
    | "resolve_report"
    | "dismiss_report"
    | "suspend_user"
    | "restore_user"
    | "delete_user"
    | "unpublish_event"
    | "restore_event"
    | "delete_event";

  const runAdminAction = async (
    action: AdminAction,
    targetId: string,
    reason: string,
    successMessage: string,
    reviewedEvent?: AizuEvent,
  ) => {
    setIsLoading(true);
    try {
      const manageResource = httpsCallable<
        {
          action: AdminAction;
          targetId: string;
          reason: string;
          requestId: string;
          expectedUpdatedAt?: { seconds: number; nanoseconds: number } | null;
        },
        { status: string }
      >(functions, "adminManageResource");
      const reviewedVersion = reviewedEvent?.updatedAt;
      const versionKey = reviewedVersion
        ? `${reviewedVersion.seconds}:${reviewedVersion.nanoseconds}`
        : "legacy";
      const operationKey = `${action}:${targetId}:${reviewedEvent ? versionKey : ""}`;
      const requestId =
        pendingOperationIds.current.get(operationKey) ??
        globalThis.crypto.randomUUID().replaceAll("-", "");
      pendingOperationIds.current.set(operationKey, requestId);
      await manageResource({
        action,
        targetId,
        reason: reason.trim().slice(0, 1000),
        requestId,
        ...(reviewedEvent
          ? {
              expectedUpdatedAt: reviewedEvent.updatedAt
                ? {
                    seconds: reviewedEvent.updatedAt.seconds,
                    nanoseconds: reviewedEvent.updatedAt.nanoseconds,
                  }
                : null,
            }
          : {}),
      });
      pendingOperationIds.current.delete(operationKey);
      setReasonAction(null);
      setNotice(successMessage, "success");
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error), "error");
    } finally {
      setIsLoading(false);
    }
  };

  const updateManagedUserStatus = async (
    user: AppUser,
    status: "active" | "suspended",
    reason: string,
  ) => {
    await runAdminAction(
      status === "suspended" ? "suspend_user" : "restore_user",
      user.uid,
      reason,
      status === "suspended"
        ? "アカウントを停止しました。"
        : "アカウントを復旧しました。",
    );
  };

  const updateManagedEventStatus = async (
    event: AizuEvent,
    status: "published" | "unpublished",
    reason: string,
  ) => {
    await runAdminAction(
      status === "unpublished" ? "unpublish_event" : "restore_event",
      event.id,
      reason,
      status === "unpublished"
        ? "イベントを非公開にしました。"
        : "イベントを再公開しました。",
      event,
    );
  };

  const deleteManagedEvent = async (event: AizuEvent, reason: string) => {
    await runAdminAction(
      "delete_event",
      event.id,
      reason,
      "イベントと関連する申請・チャットを削除しました。",
    );
  };

  const deleteManagedUser = async (user: AppUser, reason: string) => {
    await runAdminAction(
      "delete_user",
      user.uid,
      reason,
      "ユーザーの認証アカウントと関連データを削除しました。",
    );
  };
  return {
    approveEvent,
    requestEventRevision,
    approveUser,
    rejectUser,
    resolveReport,
    updateManagedUserStatus,
    updateManagedEventStatus,
    deleteManagedEvent,
    deleteManagedUser,
  };
}
