import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Field } from "../../components/Field";
import { LegalDialog } from "../../components/LegalDialog";
import { BrandMark, NoticeBanner } from "../../components/ui/AppPrimitives";
import {
  PRIVACY_VERSION,
  TERMS_VERSION,
  type LegalDocument,
} from "../../content/legalDocuments";
import { useNoticeState } from "../../hooks/useNoticeState";
import { ensureAppCheck } from "../../lib/firebase";
import { getFirebaseErrorMessage } from "../../lib/appLogic";
import { requestPasswordReset } from "../../services/authService";
import type { NoticeTone } from "../../types/domain";

export function LegalReconsentScreen({
  isLoading,
  message,
  messageTone,
  onAccept,
  onLogout,
}: {
  isLoading: boolean;
  message: string;
  messageTone: NoticeTone;
  onAccept: () => Promise<void>;
  onLogout: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [eligibilityConfirmed, setEligibilityConfirmed] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(
    null,
  );

  return (
    <main className="loading-screen">
      <section className="pending-card legal-reconsent-card">
        <div className="legal-reconsent-heading">
          <BrandMark large />
          <div>
            <p className="eyebrow">重要なお知らせ</p>
            <h1>利用条件を更新しました</h1>
          </div>
        </div>
        <p className="legal-reconsent-lede">
          個人情報の共有範囲、退会時のデータ、有料イベントおよび未成年者の取扱いを
          明確にしました。利用を続ける前に内容を確認してください。
        </p>
        <div className="legal-reconsent-summary" role="status">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>確認する文書は2つです</span>
        </div>
        <div className="legal-reconsent-links">
          <button type="button" onClick={() => setLegalDocument("terms")}>
            <span>
              <strong>利用規約</strong>
              <small>バージョン {TERMS_VERSION}</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setLegalDocument("privacy")}>
            <span>
              <strong>プライバシーポリシー</strong>
              <small>バージョン {PRIVACY_VERSION}</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <fieldset className="legal-reconsent-checks">
          <legend>同意内容</legend>
          <label className="legal-reconsent-consent">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>上記の両文書に同意します</span>
          </label>
          <label className="legal-reconsent-consent">
            <input
              type="checkbox"
              checked={eligibilityConfirmed}
              onChange={(event) =>
                setEligibilityConfirmed(event.target.checked)
              }
            />
            <span>
              18歳以上です。または16歳・17歳で、法定代理人から本サービスの利用について同意を得ています
            </span>
          </label>
        </fieldset>
        {message && <NoticeBanner message={message} tone={messageTone} />}
        <button
          className="primary-action"
          type="button"
          disabled={!confirmed || !eligibilityConfirmed || isLoading}
          onClick={() => void onAccept()}
        >
          {isLoading && <Loader2 size={16} className="spin" />}
          同意して利用を続ける
        </button>
        <button className="text-button" type="button" onClick={onLogout}>
          同意せずログアウト
        </button>
      </section>
      {legalDocument && (
        <LegalDialog
          document={legalDocument}
          onClose={() => setLegalDocument(null)}
        />
      )}
    </main>
  );
}

export function AuthScreen(props: {
  authMode: "login" | "register";
  setAuthMode: (mode: "login" | "register") => void;
  accountType: "student" | "organization";
  setAccountType: (type: "student" | "organization") => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  displayName: string;
  setDisplayName: (value: string) => void;
  department: string;
  setDepartment: (value: string) => void;
  grade: number;
  setGrade: (value: number) => void;
  interestText: string;
  setInterestText: (value: string) => void;
  currentActivities: string;
  setCurrentActivities: (value: string) => void;
  wantToTry: string;
  setWantToTry: (value: string) => void;
  organizationName: string;
  setOrganizationName: (value: string) => void;
  hasAcceptedLegal: boolean;
  setHasAcceptedLegal: (value: boolean) => void;
  hasConfirmedEligibility: boolean;
  setHasConfirmedEligibility: (value: boolean) => void;
  isActionLoading: boolean;
  message: string;
  messageTone: NoticeTone;
  handleAuthSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(
    null,
  );
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState(props.email);
  const [resetMessage, resetMessageTone, setResetMessage] = useNoticeState();
  const [isResetting, setIsResetting] = useState(false);

  const submitPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetEmail.trim()) {
      setResetMessage("メールアドレスを入力してください。", "error");
      return;
    }
    setIsResetting(true);
    setResetMessage("");
    try {
      await ensureAppCheck();
      await requestPasswordReset(resetEmail.trim());
      setResetMessage(
        "パスワード再設定メールを送信しました。メールを確認してください。",
        "success",
      );
    } catch (error) {
      setResetMessage(getFirebaseErrorMessage(error), "error");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-visual">
        <div className="auth-brand">
          <BrandMark />
          <strong>Aizu Connect</strong>
        </div>
        <div>
          <h1>
            会津のイベント
            <br />
            <em>を探す。</em>
          </h1>
          <p>
            学生・地域・団体が主催するイベントを、
            <br />
            探して、申し込んで、参加できます。
          </p>
        </div>
        <div className="auth-visual-note">
          <UsersRound size={17} /> 参加した活動は記録として残ります
        </div>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form-card">
          <div className="auth-mobile-brand">
            <BrandMark />
            <strong>Aizu Connect</strong>
          </div>
          <h2>
            {props.authMode === "register" ? "アカウントを作成" : "ログイン"}
          </h2>
          <p className="auth-lede">
            {props.authMode === "register"
              ? "利用に必要な情報を入力してください。"
              : "メールアドレスとパスワードを入力してください。"}
          </p>
          <div className="auth-switch" role="group" aria-label="認証方法">
            <button
              className={props.authMode === "register" ? "active" : ""}
              type="button"
              aria-pressed={props.authMode === "register"}
              onClick={() => props.setAuthMode("register")}
            >
              新規登録
            </button>
            <button
              className={props.authMode === "login" ? "active" : ""}
              type="button"
              aria-pressed={props.authMode === "login"}
              onClick={() => props.setAuthMode("login")}
            >
              ログイン
            </button>
          </div>
          <form onSubmit={props.handleAuthSubmit}>
            {props.authMode === "register" && (
              <div
                className="account-type-switch"
                role="group"
                aria-label="アカウント種別"
              >
                <button
                  className={props.accountType === "student" ? "active" : ""}
                  type="button"
                  aria-pressed={props.accountType === "student"}
                  onClick={() => props.setAccountType("student")}
                >
                  個人
                </button>
                <button
                  className={
                    props.accountType === "organization" ? "active" : ""
                  }
                  type="button"
                  aria-pressed={props.accountType === "organization"}
                  onClick={() => props.setAccountType("organization")}
                >
                  団体・自治体
                </button>
              </div>
            )}
            <Field label="メールアドレス">
              <input
                type={
                  props.authMode === "login" && import.meta.env.DEV
                    ? "text"
                    : "email"
                }
                autoComplete="email"
                required
                maxLength={320}
                placeholder="you@example.com"
                value={props.email}
                onChange={(event) => props.setEmail(event.target.value)}
              />
            </Field>
            <div className="field">
              <label htmlFor="auth-password">パスワード</label>
              <div className="password-input-wrap">
                <input
                  id="auth-password"
                  type={props.showPassword ? "text" : "password"}
                  autoComplete={
                    props.authMode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                  placeholder={
                    props.authMode === "register" ? "10文字以上" : "パスワード"
                  }
                  required
                  minLength={props.authMode === "register" ? 10 : 6}
                  value={props.password}
                  onChange={(event) => props.setPassword(event.target.value)}
                />
                <button
                  className="password-toggle icon-button"
                  type="button"
                  title={
                    props.showPassword ? "パスワードを隠す" : "パスワードを見る"
                  }
                  aria-label={
                    props.showPassword ? "パスワードを隠す" : "パスワードを見る"
                  }
                  aria-pressed={props.showPassword}
                  onClick={() => props.setShowPassword(!props.showPassword)}
                >
                  {props.showPassword ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </div>
            </div>
            {props.authMode === "login" && (
              <button
                className="text-button password-reset-link"
                type="button"
                onClick={() => {
                  setResetEmail(props.email);
                  setResetMessage("");
                  setIsResetOpen((current) => !current);
                }}
              >
                パスワードを忘れた方
              </button>
            )}
            {props.authMode === "register" && (
              <>
                {props.accountType === "student" ? (
                  <>
                    <Field label="表示名">
                      <input
                        required
                        maxLength={80}
                        value={props.displayName}
                        onChange={(event) =>
                          props.setDisplayName(event.target.value)
                        }
                      />
                    </Field>
                    <div className="form-grid">
                      <Field label="学科">
                        <input
                          maxLength={80}
                          value={props.department}
                          onChange={(event) =>
                            props.setDepartment(event.target.value)
                          }
                        />
                      </Field>
                      <Field label="学年">
                        <input
                          min={1}
                          max={6}
                          type="number"
                          required
                          value={props.grade}
                          onChange={(event) =>
                            props.setGrade(Number(event.target.value))
                          }
                        />
                      </Field>
                    </div>
                    <Field label="興味分野">
                      <input
                        maxLength={200}
                        value={props.interestText}
                        onChange={(event) =>
                          props.setInterestText(event.target.value)
                        }
                      />
                    </Field>
                    <Field label="今やっていること（任意）">
                      <textarea
                        value={props.currentActivities}
                        maxLength={240}
                        placeholder="例：学生団体の運営、英語の勉強"
                        onChange={(event) =>
                          props.setCurrentActivities(event.target.value)
                        }
                      />
                    </Field>
                    <Field label="やってみたいこと（任意）">
                      <textarea
                        value={props.wantToTry}
                        maxLength={240}
                        placeholder="例：地域イベントの運営、ものづくり"
                        onChange={(event) =>
                          props.setWantToTry(event.target.value)
                        }
                      />
                    </Field>
                  </>
                ) : (
                  <Field label="団体・自治体名">
                    <input
                      required
                      maxLength={100}
                      autoComplete="organization"
                      value={props.organizationName}
                      onChange={(event) =>
                        props.setOrganizationName(event.target.value)
                      }
                    />
                  </Field>
                )}
              </>
            )}
            {props.authMode === "register" && (
              <div className="auth-legal-consent">
                <label>
                  <input
                    type="checkbox"
                    required
                    checked={props.hasAcceptedLegal}
                    onChange={(event) =>
                      props.setHasAcceptedLegal(event.target.checked)
                    }
                  />
                  <span>利用規約とプライバシーポリシーに同意します</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    required
                    checked={props.hasConfirmedEligibility}
                    onChange={(event) =>
                      props.setHasConfirmedEligibility(event.target.checked)
                    }
                  />
                  <span>
                    18歳以上です。または16歳・17歳で、法定代理人から本サービスの利用について同意を得ています
                  </span>
                </label>
                <p>
                  内容を読む：
                  <button
                    type="button"
                    onClick={() => setLegalDocument("terms")}
                  >
                    利用規約
                  </button>
                  <span aria-hidden="true"> / </span>
                  <button
                    type="button"
                    onClick={() => setLegalDocument("privacy")}
                  >
                    プライバシーポリシー
                  </button>
                </p>
              </div>
            )}
            <button
              className="primary-action auth-submit"
              disabled={props.isActionLoading}
              type="submit"
            >
              {props.isActionLoading ? (
                <Loader2 size={17} className="spin" />
              ) : (
                <Check size={17} />
              )}
              {props.authMode === "register"
                ? "アカウントを作成"
                : "ログインする"}
            </button>
          </form>
          {props.authMode === "login" && isResetOpen && (
            <form
              className="password-reset-panel"
              onSubmit={(event) => void submitPasswordReset(event)}
            >
              <p className="eyebrow">ログインできない場合</p>
              <h3>パスワードを再設定</h3>
              <p>登録済みのメールアドレスへ再設定リンクを送ります。</p>
              <input
                type="email"
                value={resetEmail}
                placeholder="you@example.com"
                onChange={(event) => setResetEmail(event.target.value)}
              />
              <button
                className="secondary-action"
                type="submit"
                disabled={isResetting}
              >
                {isResetting && <Loader2 size={16} className="spin" />}
                メールを送る
              </button>
              {resetMessage && (
                <NoticeBanner message={resetMessage} tone={resetMessageTone} />
              )}
            </form>
          )}
          {props.message && (
            <NoticeBanner message={props.message} tone={props.messageTone} />
          )}
          <p className="form-footnote">
            個人はメール認証後に利用できます。団体・自治体は管理者が登録内容を確認します。
          </p>
          {props.authMode === "login" && (
            <p className="legal-links">
              <button type="button" onClick={() => setLegalDocument("terms")}>
                利用規約
              </button>
              と
              <button type="button" onClick={() => setLegalDocument("privacy")}>
                プライバシーポリシー
              </button>
              を確認できます。
            </p>
          )}
        </div>
      </div>
      {legalDocument && (
        <LegalDialog
          document={legalDocument}
          onClose={() => setLegalDocument(null)}
        />
      )}
    </main>
  );
}
