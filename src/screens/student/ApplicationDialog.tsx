import {
  CalendarDays,
  Check,
  History,
  Loader2,
  MapPin,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Field } from "../../components/Field";
import { useDialogAccessibility } from "../../hooks/useDialogAccessibility";
import type {
  AizuEvent,
  ApplicationAnswer,
  ApplicationDetails,
} from "../../types/domain";

export function ApplicationDialog({
  event,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  event: AizuEvent;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (details: ApplicationDetails) => void;
}) {
  const [participantMessage, setParticipantMessage] = useState("");
  const [accessibilityNeeds, setAccessibilityNeeds] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [sensitiveInfoConsent, setSensitiveInfoConsent] = useState(false);
  const [customAnswers, setCustomAnswers] = useState<
    Record<string, string | boolean>
  >({});
  const [
    emergencyContactAuthorityConfirmed,
    setEmergencyContactAuthorityConfirmed,
  ] = useState(false);
  const isWaitlist =
    Number(event.applicantCount ?? 0) >= Number(event.capacity ?? 0);
  const dialogRef = useDialogAccessibility<HTMLFormElement>(onClose, () =>
    Array.from(document.querySelectorAll<HTMLElement>("button")).find(
      (element) =>
        element.getAttribute("aria-label") ===
        `${event.title}の詳細を見る`,
    ) ?? null,
  );
  return createPortal(
    <div className="report-backdrop" role="presentation" onClick={onClose}>
      <form
        ref={dialogRef}
        className="application-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-dialog-title"
        tabIndex={-1}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          if (!consentAccepted) return;
          onSubmit({
            participantMessage: participantMessage.trim().slice(0, 500),
            accessibilityNeeds: accessibilityNeeds.trim().slice(0, 500),
            emergencyContact: emergencyContact.trim().slice(0, 200),
            consentAccepted,
            sensitiveInfoConsent,
            emergencyContactAuthorityConfirmed,
            answers: (event.applicationQuestions ?? []).map(
              (question): ApplicationAnswer => ({
                questionId: question.id,
                label: question.label,
                value: customAnswers[question.id] ?? "",
              }),
            ),
          });
        }}
      >
        <div className="report-dialog-head">
          <div>
            <p className="eyebrow">
              {isWaitlist ? "キャンセル待ち" : "参加申請"}
            </p>
            <h2 id="application-dialog-title">
              {isWaitlist ? "キャンセル待ちに登録" : "参加申請を確認"}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="閉じる"
            data-dialog-initial-focus
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="application-event-summary">
          <strong>{event.title}</strong>
          <span>
            <CalendarDays size={14} />
            {event.startAtLabel}
            {event.endAtLabel ? ` - ${event.endAtLabel}` : ""}
          </span>
          <span>
            <MapPin size={14} />
            {event.meetingPoint || event.location}
          </span>
          <span>
            <UsersRound size={14} />
            {isWaitlist
              ? "現在満員です。空きが出た場合に通知します。"
              : `残り${Math.max(event.capacity - event.applicantCount, 0)}名`}
          </span>
        </div>
        <div className="application-policy">
          <strong>キャンセルについて</strong>
          <p>
            {event.cancellationPolicy ||
              "参加できなくなった場合は、活動ページから早めにキャンセルしてください。"}
          </p>
        </div>
        {event.feeType === "有料" && (
          <div className="application-policy">
            <strong>有料イベントの申込内容</strong>
            <p>
              参加費 {Number(event.feeAmount ?? 0).toLocaleString("ja-JP")}
              円（税込） ／追加費用 {event.additionalFees || "なし"}
            </p>
            <p>支払方法：{event.paymentMethod}</p>
            <p>支払時期：{event.paymentTiming}</p>
          </div>
        )}
        <Field label="主催者へのメッセージ（任意）">
          <textarea
            maxLength={500}
            value={participantMessage}
            placeholder="参加したい理由や事前に伝えたいこと"
            onChange={(changeEvent) =>
              setParticipantMessage(changeEvent.target.value)
            }
          />
        </Field>
        {(event.applicationQuestions ?? []).map((question) => (
          <Field key={question.id} label={question.label}>
            {question.type === "textarea" ? (
              <textarea
                required={question.required}
                maxLength={1000}
                value={String(customAnswers[question.id] ?? "")}
                onChange={(changeEvent) =>
                  setCustomAnswers((current) => ({
                    ...current,
                    [question.id]: changeEvent.target.value,
                  }))
                }
              />
            ) : question.type === "select" ? (
              <select
                required={question.required}
                value={String(customAnswers[question.id] ?? "")}
                onChange={(changeEvent) =>
                  setCustomAnswers((current) => ({
                    ...current,
                    [question.id]: changeEvent.target.value,
                  }))
                }
              >
                <option value="">選択してください</option>
                {(question.options ?? []).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : question.type === "checkbox" ? (
              <label>
                <input
                  type="checkbox"
                  required={question.required}
                  checked={Boolean(customAnswers[question.id])}
                  onChange={(changeEvent) =>
                    setCustomAnswers((current) => ({
                      ...current,
                      [question.id]: changeEvent.target.checked,
                    }))
                  }
                />
                確認しました
              </label>
            ) : (
              <input
                required={question.required}
                maxLength={1000}
                value={String(customAnswers[question.id] ?? "")}
                onChange={(changeEvent) =>
                  setCustomAnswers((current) => ({
                    ...current,
                    [question.id]: changeEvent.target.value,
                  }))
                }
              />
            )}
          </Field>
        ))}
        <Field label="配慮してほしいこと（任意）">
          <textarea
            maxLength={500}
            value={accessibilityNeeds}
            placeholder="移動、聴覚、食事など必要な配慮"
            onChange={(changeEvent) =>
              setAccessibilityNeeds(changeEvent.target.value)
            }
          />
        </Field>
        {accessibilityNeeds.trim() && (
          <label className="application-consent">
            <input
              required
              type="checkbox"
              checked={sensitiveInfoConsent}
              onChange={(changeEvent) =>
                setSensitiveInfoConsent(changeEvent.target.checked)
              }
            />
            <span>
              入力内容に健康・障害等の要配慮個人情報が含まれる場合、その取得と
              {event.organizationName}への提供に明示的に同意します
            </span>
          </label>
        )}
        <Field label="緊急時の連絡先（任意・主催者のみ閲覧）">
          <input
            maxLength={200}
            value={emergencyContact}
            placeholder="電話番号または連絡方法"
            onChange={(changeEvent) =>
              setEmergencyContact(changeEvent.target.value)
            }
          />
        </Field>
        {emergencyContact.trim() && (
          <label className="application-consent">
            <input
              required
              type="checkbox"
              checked={emergencyContactAuthorityConfirmed}
              onChange={(changeEvent) =>
                setEmergencyContactAuthorityConfirmed(
                  changeEvent.target.checked,
                )
              }
            />
            <span>
              本人以外の連絡先の場合、その方へ利用目的と主催者への提供を知らせ、
              適法に提供できることを確認しました
            </span>
          </label>
        )}
        <label className="application-consent">
          <input
            required
            type="checkbox"
            checked={consentAccepted}
            onChange={(changeEvent) =>
              setConsentAccepted(changeEvent.target.checked)
            }
          />
          <span>
            表示名、プロフィール画像、申請内容、配慮事項、緊急連絡先、参加・出欠情報を
            {event.organizationName}へイベント運営のため提供することに同意します
          </span>
        </label>
        <div className="report-dialog-actions">
          <button className="text-button" type="button" onClick={onClose}>
            戻る
          </button>
          <button
            className="primary-action"
            type="submit"
            disabled={
              isSubmitting ||
              !consentAccepted ||
              Boolean(accessibilityNeeds.trim() && !sensitiveInfoConsent) ||
              Boolean(
                emergencyContact.trim() && !emergencyContactAuthorityConfirmed,
              )
            }
          >
            {isSubmitting ? (
              <Loader2 size={16} className="spin" />
            ) : isWaitlist ? (
              <History size={16} />
            ) : (
              <Check size={16} />
            )}
            {isWaitlist ? "キャンセル待ちに登録" : "参加申請を送信"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
