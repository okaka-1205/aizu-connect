import { Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { NoticeBanner } from "../../components/ui/AppPrimitives";
import { useNoticeState } from "../../hooks/useNoticeState";
import { getFirebaseErrorMessage } from "../../lib/appLogic";
import type { AccountDeletionRequest } from "../../types/domain";
import { ActionReasonDialog } from "./RoleScreenPrimitives";

export function AccountDeletionPanel({
  request,
  onRequest,
  onCancel,
}: {
  request: AccountDeletionRequest | null;
  onRequest: (reason: string) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, noticeTone, setNotice] = useNoticeState();
  const isSubmitted = request?.status === "submitted";

  return (
    <section className="account-deletion-panel">
      <div className="account-deletion-copy">
        <div className="settings-icon">
          <Trash2 size={18} />
        </div>
        <span>
          <strong>
            {isSubmitted ? "退会・データ削除を申請中" : "退会・データ削除"}
          </strong>
          {isSubmitted && (
            <small>運営が本人確認後にアカウントと関連データを削除します</small>
          )}
        </span>
      </div>
      {isSubmitted && request?.reason && (
        <p className="account-deletion-reason">申請理由: {request.reason}</p>
      )}
      {notice && <NoticeBanner message={notice} tone={noticeTone} />}
      <div className="row-actions">
        {isSubmitted ? (
          <button
            className="secondary-action"
            type="button"
            disabled={isSaving}
            onClick={() => setIsCancelOpen(true)}
          >
            申請を取り消す
          </button>
        ) : (
          <button
            className="danger-action"
            type="button"
            disabled={isSaving}
            onClick={() => setIsRequestOpen(true)}
          >
            <Trash2 size={15} />
            退会を申請する
          </button>
        )}
      </div>
      {isRequestOpen && (
        <ActionReasonDialog
          title="退会・データ削除を申請"
          description="運営が内容を確認した後、認証アカウント、プロフィール、参加申請などを削除します。全体チャットの投稿は送信者を匿名化して残る場合があり、法令上必要な記録は所定期間保存します。削除完了後は元に戻せません。"
          label="退会理由・削除に関する連絡"
          placeholder="退会理由や、削除前に確認してほしいことを入力してください"
          confirmLabel="削除を申請する"
          danger
          onClose={() => setIsRequestOpen(false)}
          onConfirm={(reason) => {
            setIsSaving(true);
            setNotice("");
            void onRequest(reason)
              .then(() => {
                setIsRequestOpen(false);
                setNotice(
                  "退会・データ削除の申請を受け付けました。",
                  "success",
                );
              })
              .catch((error) =>
                setNotice(getFirebaseErrorMessage(error), "error"),
              )
              .finally(() => setIsSaving(false));
          }}
        />
      )}
      {isCancelOpen && (
        <ConfirmDialog
          title="退会申請を取り消しますか？"
          description="アカウントとデータは削除されず、これまでどおり利用できます。"
          confirmLabel="申請を取り消す"
          onClose={() => setIsCancelOpen(false)}
          onConfirm={() => {
            setIsSaving(true);
            setNotice("");
            void onCancel()
              .then(() => {
                setIsCancelOpen(false);
                setNotice("退会申請を取り消しました。", "success");
              })
              .catch((error) =>
                setNotice(getFirebaseErrorMessage(error), "error"),
              )
              .finally(() => setIsSaving(false));
          }}
        />
      )}
    </section>
  );
}
