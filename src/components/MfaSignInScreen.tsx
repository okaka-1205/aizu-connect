import { KeyRound, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { MultiFactorResolver } from "firebase/auth";
import { BrandMark, NoticeBanner } from "./ui/AppPrimitives";
import { useNoticeState } from "../hooks/useNoticeState";
import { getFirebaseErrorMessage } from "../lib/appLogic";
import { completeTotpSignIn } from "../services/mfaService";

export function MfaSignInScreen({
  resolver,
  onComplete,
  onCancel,
}: {
  resolver: MultiFactorResolver;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [verificationCode, setVerificationCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [notice, noticeTone, setNotice] = useNoticeState();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(verificationCode)) {
      setNotice("認証アプリに表示されている6桁のコードを入力してください。", "error");
      return;
    }
    setIsLoading(true);
    setNotice("");
    try {
      await completeTotpSignIn(resolver, verificationCode);
      onComplete();
    } catch (error) {
      setNotice(
        `コードが正しくないか、有効期限が切れています。${getFirebaseErrorMessage(error)}`,
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
          <p className="eyebrow">管理者ログイン</p>
          <h1>
            認証アプリで
            <br />
            <em>本人確認。</em>
          </h1>
          <p>パスワードに加えて、現在の確認コードを入力します。</p>
        </div>
      </div>
      <div className="auth-form-wrap">
        <section className="auth-form-card">
          <div className="auth-mobile-brand">
            <BrandMark />
            <strong>Aizu Connect</strong>
          </div>
          <p className="eyebrow">2段階認証</p>
          <h2>6桁のコードを入力</h2>
          <p className="auth-lede">登録済みの認証アプリを開いてください。</p>
          <form onSubmit={(event) => void submit(event)}>
            <label className="field">
              <span>確認コード</span>
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
              本人確認してログイン
            </button>
          </form>
          {notice && <NoticeBanner message={notice} tone={noticeTone} />}
          <button className="text-button mfa-logout" type="button" onClick={onCancel}>
            メールアドレスからやり直す
          </button>
        </section>
      </div>
    </main>
  );
}
