import { KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { NoticeBanner, BrandMark } from "./ui/AppPrimitives";
import { getFirebaseErrorMessage } from "../lib/appLogic";
import {
  beginTotpEnrollment,
  completeTotpEnrollment,
  type TotpEnrollment,
} from "../services/mfaService";
import { useNoticeState } from "../hooks/useNoticeState";

export function AdminMfaEnrollmentScreen({
  user,
  onEnrolled,
  onLogout,
}: {
  user: User;
  onEnrolled: () => void;
  onLogout: () => void;
}) {
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [notice, noticeTone, setNotice] = useNoticeState();

  useEffect(() => {
    let cancelled = false;
    void beginTotpEnrollment(user)
      .then(async (nextEnrollment) => {
        const nextQrDataUrl = await QRCode.toDataURL(nextEnrollment.qrCodeUrl, {
          width: 240,
          margin: 1,
          errorCorrectionLevel: "M",
        });
        if (cancelled) return;
        setEnrollment(nextEnrollment);
        setQrDataUrl(nextQrDataUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        setNotice(
          `認証アプリの登録を開始できませんでした。再ログインしてもう一度お試しください。${getFirebaseErrorMessage(error)}`,
          "error",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setNotice, user]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enrollment || !/^\d{6}$/.test(verificationCode)) {
      setNotice("認証アプリに表示されている6桁のコードを入力してください。", "error");
      return;
    }
    setIsLoading(true);
    setNotice("");
    try {
      await completeTotpEnrollment(user, enrollment, verificationCode);
      onEnrolled();
    } catch (error) {
      setNotice(
        `コードを確認できませんでした。新しいコードで再度お試しください。${getFirebaseErrorMessage(error)}`,
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="auth-shell admin-mfa-shell">
      <div className="auth-visual">
        <div className="auth-brand">
          <BrandMark />
          <strong>Aizu Connect</strong>
        </div>
        <div>
          <p className="eyebrow">管理者セキュリティ</p>
          <h1>
            大切な操作を
            <br />
            <em>二段階で守る。</em>
          </h1>
          <p>管理者アカウントには認証アプリの登録が必要です。</p>
        </div>
        <div className="auth-visual-note">
          <ShieldCheck size={17} /> パスワード流出時の不正操作を防ぎます
        </div>
      </div>
      <div className="auth-form-wrap">
        <section className="auth-form-card admin-mfa-card" aria-busy={isLoading}>
          <div className="auth-mobile-brand">
            <BrandMark />
            <strong>Aizu Connect</strong>
          </div>
          <p className="eyebrow">初回のみ</p>
          <h2>認証アプリを登録</h2>
          <p className="auth-lede">
            Google AuthenticatorなどでQRコードを読み取り、表示されたコードを入力してください。
          </p>
          {isLoading && !enrollment ? (
            <div className="mfa-loading" role="status">
              <Loader2 size={20} className="spin" /> 登録情報を準備しています
            </div>
          ) : enrollment ? (
            <form onSubmit={(event) => void submit(event)}>
              {qrDataUrl && (
                <img
                  className="mfa-qr-code"
                  src={qrDataUrl}
                  alt="認証アプリ登録用QRコード"
                  width="240"
                  height="240"
                />
              )}
              <details className="mfa-manual-key">
                <summary>QRコードを読み取れない場合</summary>
                <p>次のキーを認証アプリへ手動入力してください。</p>
                <code>{enrollment.secretKey}</code>
              </details>
              <label className="field">
                <span>6桁の確認コード</span>
                <input
                  autoFocus
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(event) =>
                    setVerificationCode(
                      event.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                />
              </label>
              <button
                className="primary-action auth-submit"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 size={17} className="spin" />
                ) : (
                  <KeyRound size={17} />
                )}
                登録して管理画面へ進む
              </button>
            </form>
          ) : null}
          {notice && <NoticeBanner message={notice} tone={noticeTone} />}
          <button className="text-button mfa-logout" type="button" onClick={onLogout}>
            <LogOut size={15} /> ログアウト
          </button>
          <p className="form-footnote">
            端末を紛失した場合は、本人確認後に管理者用の復旧手順を実行します。秘密キーをチャットやIssueへ貼り付けないでください。
          </p>
        </section>
      </div>
    </main>
  );
}
