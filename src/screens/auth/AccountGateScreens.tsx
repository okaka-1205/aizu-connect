import type { User } from "firebase/auth";
import {
  CheckCircle2,
  Flag,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { BrandMark, NoticeBanner } from "../../components/ui/AppPrimitives";
import { useNoticeState } from "../../hooks/useNoticeState";
import { auth } from "../../lib/firebase";
import { getFirebaseErrorMessage } from "../../lib/appLogic";
import { resendVerificationEmail } from "../../services/authService";
import type { AppUser } from "../../types/domain";

export function VerifyEmailScreen({
  firebaseUser,
  onVerified,
  onLogout,
}: {
  firebaseUser: User;
  onVerified: () => Promise<void>;
  onLogout: () => void;
}) {
  const [notice, noticeTone, setNotice] = useNoticeState();
  const [isSending, setIsSending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const resend = async () => {
    setIsSending(true);
    setNotice("");
    try {
      await resendVerificationEmail(firebaseUser);
      setNotice(
        "確認メールを再送しました。メール内のリンクを開いてください。",
        "success",
      );
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error), "error");
    } finally {
      setIsSending(false);
    }
  };

  const checkVerification = async () => {
    setIsChecking(true);
    setNotice("");
    try {
      await onVerified();
      const isVerified = Boolean(auth.currentUser?.emailVerified);
      setNotice(
        isVerified
          ? "メール認証が完了しました。"
          : "まだ認証を確認できません。メールのリンクを開いてから再確認してください。",
        isVerified ? "success" : "info",
      );
    } catch (error) {
      setNotice(getFirebaseErrorMessage(error), "error");
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <main className="loading-screen">
      <div className="pending-card verify-card">
        <BrandMark />
        <h1>メールを確認してください</h1>
        <p>
          <strong>{firebaseUser.email}</strong> に確認メールを送信しました。
          リンクを開いたあと、この画面で認証状態を確認してください。
        </p>
        {notice && <NoticeBanner message={notice} tone={noticeTone} />}
        <button
          className="primary-action"
          type="button"
          onClick={() => void checkVerification()}
          disabled={isChecking}
        >
          {isChecking && <Loader2 size={17} className="spin" />}
          認証状態を確認
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={() => void resend()}
          disabled={isSending}
        >
          {isSending && <Loader2 size={17} className="spin" />}
          確認メールを再送
        </button>
        <button className="text-button" type="button" onClick={onLogout}>
          ログアウト
        </button>
      </div>
    </main>
  );
}

export function AdminApprovalPendingScreen({
  appUser,
  onLogout,
}: {
  appUser: AppUser;
  onLogout: () => void;
}) {
  return (
    <main className="loading-screen">
      <div className="pending-card approval-pending-card">
        <BrandMark />
        <h1>運営が登録内容を確認しています</h1>
        <p>
          {appUser.displayName}
          さんのメール認証は完了しています。利用開始に必要なのは管理者の承認のみです。
          {appUser.role === "organization"
            ? "確認が完了したら、活動を掲載できます。"
            : "確認が完了したら、イベントへの参加を始められます。"}
        </p>
        <ol
          className="approval-progress"
          aria-label="アカウント利用開始までの状況"
        >
          <li className="is-complete">
            <CheckCircle2 size={19} />
            <span>
              <strong>アカウント登録</strong>
              <small>完了</small>
            </span>
          </li>
          <li className="is-complete">
            <CheckCircle2 size={19} />
            <span>
              <strong>メール認証</strong>
              <small>完了</small>
            </span>
          </li>
          <li className="is-current">
            <ShieldCheck size={19} />
            <span>
              <strong>管理者確認</strong>
              <small>確認中</small>
            </span>
          </li>
        </ol>
        <div className="pending-help">
          <RefreshCw size={17} />
          <span>
            承認されると自動的に利用画面へ切り替わります。再読み込みや再ログインは必要ありません。
          </span>
        </div>
        <button className="secondary-action" type="button" onClick={onLogout}>
          <LogOut size={17} /> ログアウト
        </button>
      </div>
    </main>
  );
}

export function AccountSetupScreen({
  appUser,
  onLogout,
}: {
  appUser: AppUser;
  onLogout: () => void;
}) {
  return (
    <main className="loading-screen">
      <div className="pending-card">
        <BrandMark />
        <h1>登録状態を確認しています</h1>
        <p>
          {appUser.displayName}
          さんの登録情報を確認しています。状態が変わらない場合は、登録したメールアドレスから運営へお問い合わせください。
        </p>
        <button className="secondary-action" type="button" onClick={onLogout}>
          <LogOut size={17} /> ログアウト
        </button>
      </div>
    </main>
  );
}

export function AccountRejectedScreen({
  appUser,
  onLogout,
}: {
  appUser: AppUser;
  onLogout: () => void;
}) {
  return (
    <main className="loading-screen">
      <div className="pending-card">
        <BrandMark />
        <h1>
          {appUser.status === "suspended"
            ? "アカウントを確認してください"
            : "登録内容を確認してください"}
        </h1>
        <p>
          {appUser.displayName}
          さんの
          {appUser.status === "suspended"
            ? "アカウントは現在利用を停止しています。"
            : "登録は、現在の内容では承認されませんでした。"}
        </p>
        {(appUser.moderationReason || appUser.reviewReason) && (
          <div className="pending-help">
            <Flag size={17} />
            <span>
              <strong>運営からの案内</strong>
              <br />
              {appUser.moderationReason || appUser.reviewReason}
            </span>
          </div>
        )}
        <p>
          運営へ問い合わせる場合は、登録したメールアドレスからご連絡ください。
        </p>
        <button className="secondary-action" type="button" onClick={onLogout}>
          <LogOut size={17} /> ログアウト
        </button>
      </div>
    </main>
  );
}
