import { ChevronRight, FileText, Plus } from "lucide-react";
import { Field } from "../../../components/Field";
import { eventTemplates } from "../../../config/events";
import {
  getFirebaseErrorMessage,
  validateImageSourceFile,
} from "../../../lib/appLogic";
import { revokeObjectUrl } from "../../../lib/eventUtils";
import type {
  AizuEvent,
  ApplicationQuestion,
  SetNotice,
} from "../../../types/domain";
import type { OrganizationEventEditor } from "../hooks/useOrganizationEventEditor";

export function EventBasicsFields({
  editor,
  setNotice,
}: {
  editor: OrganizationEventEditor;
  setNotice: SetNotice;
}) {
  const {
    title,
    setTitle,
    summary,
    setSummary,
    templateKey,
    beginnerLevel,
    setBeginnerLevel,
    takeawayText,
    setTakeawayText,
    applicationQuestions,
    setApplicationQuestions,
    eventImageFile,
    setEventImageFile,
    eventImagePreview,
    setEventImagePreview,
    eventImageSourceFile,
    setEventImageSourceFile,
    eventImageSourcePreview,
    setEventImageSourcePreview,
    setIsEventImageReviewOpen,
    eventImageInputKey,
    eventFormStep,
    selectedTemplate,
    moveToEventFormStep,
    applyTemplate,
  } = editor;
  return (
    <details
      className="event-form-section event-form-collapsible"
      data-event-form-step="1"
      open
      hidden={eventFormStep !== 1}
    >
      <summary>
        <span className="event-form-step">1</span>
        <span className="event-form-section-title">
          <strong>基本情報</strong>
          <small>活動の内容と魅力を入力</small>
        </span>
        <ChevronRight className="event-form-section-chevron" size={18} />
      </summary>
      <div className="event-form-section-body">
        <div className="template-picker" aria-label="企画テンプレート">
          {eventTemplates.map((template) => (
            <button
              className={templateKey === template.key ? "active" : ""}
              key={template.key}
              type="button"
              onClick={() => applyTemplate(template)}
            >
              <FileText size={15} />
              {template.label}
            </button>
          ))}
        </div>
        <Field label="活動名">
          <input
            required
            maxLength={80}
            placeholder={selectedTemplate.title}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label="活動の概要">
          <textarea
            required
            maxLength={220}
            placeholder={selectedTemplate.summary}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </Field>
        <Field label="イベントで体験できること（1行ずつ）">
          <textarea
            required
            maxLength={180}
            placeholder={selectedTemplate.takeaways.join("\n")}
            value={takeawayText}
            onChange={(event) => setTakeawayText(event.target.value)}
          />
        </Field>
        <div className="application-question-editor">
          <div className="role-card-head">
            <div>
              <strong>申込時の質問</strong>
              <small>最大8問。回答は参加者一覧で確認できます。</small>
            </div>
            <button
              type="button"
              disabled={applicationQuestions.length >= 8}
              onClick={() =>
                setApplicationQuestions((current) => [
                  ...current,
                  {
                    id: `question_${Date.now()}`,
                    label: "",
                    type: "text",
                    required: false,
                    containsSensitiveInfo: false,
                    options: [],
                  },
                ])
              }
            >
              <Plus size={14} />
              質問を追加
            </button>
          </div>
          {applicationQuestions.map((question, index) => (
            <div className="application-question-row" key={question.id}>
              <input
                aria-label={`申込質問${index + 1}`}
                maxLength={120}
                required
                placeholder="例：参加目的を教えてください"
                value={question.label}
                onChange={(event) =>
                  setApplicationQuestions((current) =>
                    current.map((item) =>
                      item.id === question.id
                        ? { ...item, label: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <select
                aria-label={`申込質問${index + 1}の形式`}
                value={question.type}
                onChange={(event) =>
                  setApplicationQuestions((current) =>
                    current.map((item) =>
                      item.id === question.id
                        ? {
                            ...item,
                            type: event.target
                              .value as ApplicationQuestion["type"],
                          }
                        : item,
                    ),
                  )
                }
              >
                <option value="text">1行入力</option>
                <option value="textarea">複数行</option>
                <option value="select">選択式</option>
                <option value="checkbox">確認チェック</option>
              </select>
              {question.type === "select" && (
                <input
                  className="application-question-options"
                  aria-label={`申込質問${index + 1}の選択肢`}
                  placeholder="選択肢をカンマ区切りで入力"
                  value={(question.options ?? []).join(",")}
                  onChange={(event) =>
                    setApplicationQuestions((current) =>
                      current.map((item) =>
                        item.id === question.id
                          ? {
                              ...item,
                              options: event.target.value
                                .split(",")
                                .map((value) => value.trim())
                                .filter(Boolean)
                                .slice(0, 8),
                            }
                          : item,
                      ),
                    )
                  }
                />
              )}
              <label className="application-question-toggle">
                <input
                  type="checkbox"
                  checked={question.required}
                  onChange={(event) =>
                    setApplicationQuestions((current) =>
                      current.map((item) =>
                        item.id === question.id
                          ? {
                              ...item,
                              required: event.target.checked,
                            }
                          : item,
                      ),
                    )
                  }
                />
                必須
              </label>
              <label className="application-question-toggle">
                <input
                  type="checkbox"
                  checked={question.containsSensitiveInfo === true}
                  onChange={(event) =>
                    setApplicationQuestions((current) =>
                      current.map((item) =>
                        item.id === question.id
                          ? {
                              ...item,
                              containsSensitiveInfo: event.target.checked,
                            }
                          : item,
                      ),
                    )
                  }
                />
                健康・障害等の要配慮情報を含む
              </label>
              <button
                className="muted application-question-delete"
                type="button"
                onClick={() =>
                  setApplicationQuestions((current) =>
                    current.filter((item) => item.id !== question.id),
                  )
                }
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <Field label="初心者歓迎度">
          <select
            value={beginnerLevel}
            onChange={(event) =>
              setBeginnerLevel(event.target.value as AizuEvent["beginnerLevel"])
            }
          >
            <option>初参加歓迎</option>
            <option>誰でも歓迎</option>
            <option>少し経験者向け</option>
          </select>
        </Field>
        <div
          className="field"
          role="group"
          aria-labelledby="event-image-field-label"
        >
          <span id="event-image-field-label">イベント写真</span>
          <div className="image-picker event-image-picker">
            <div className="event-image-preview">
              {eventImagePreview ? (
                <img src={eventImagePreview} alt="イベント画像のプレビュー" />
              ) : (
                <span>活動の様子が伝わる写真を選択</span>
              )}
            </div>
            {eventImageFile && eventImageSourceFile && (
              <button
                className="image-recrop-button"
                type="button"
                onClick={() => setIsEventImageReviewOpen(true)}
              >
                元の写真から再調整
              </button>
            )}
            <input
              key={eventImageInputKey}
              type="file"
              aria-label="イベント写真"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  validateImageSourceFile(file, "イベント画像");
                  revokeObjectUrl(eventImagePreview);
                  revokeObjectUrl(eventImageSourcePreview);
                  const sourcePreview = URL.createObjectURL(file);
                  setEventImageSourceFile(file);
                  setEventImageSourcePreview(sourcePreview);
                  setEventImageFile(null);
                  setEventImagePreview(sourcePreview);
                  setNotice("");
                  setIsEventImageReviewOpen(true);
                } catch (error) {
                  setNotice(getFirebaseErrorMessage(error), "error");
                  event.target.value = "";
                }
              }}
            />
            <small>JPEG・PNG・WebP / 20MB未満（保存時に自動圧縮）</small>
          </div>
        </div>
        <button
          className="secondary-action event-form-next"
          type="button"
          onClick={() => moveToEventFormStep(2)}
        >
          開催情報へ
          <ChevronRight size={16} />
        </button>
      </div>
    </details>
  );
}
