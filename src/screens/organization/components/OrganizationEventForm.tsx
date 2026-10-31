import { Check, Eye, Loader2, Plus, X } from "lucide-react";
import type { SetNotice } from "../../../types/domain";
import type { OrganizationEventEditor } from "../hooks/useOrganizationEventEditor";
import { EventAdvancedFields } from "./EventAdvancedFields";
import { EventBasicsFields } from "./EventBasicsFields";
import { EventScheduleFields } from "./EventScheduleFields";

export function OrganizationEventForm({
  editor,
  setNotice,
}: {
  editor: OrganizationEventEditor;
  setNotice: SetNotice;
}) {
  const {
    editingEventId,
    setIsEventPreviewOpen,
    eventFormStep,
    setEventFormStep,
    eventFormRef,
    draftSavedAt,
    isDraftSaving,
    isLoading,
    eventImageUploadProgress,
    moveToEventFormStep,
    clearEventForm,
    createEvent,
  } = editor;
  return (
    <section className="role-card event-form-card">
      <div className="role-card-head">
        <div>
          <p className="eyebrow">イベント登録</p>
          <h2>{editingEventId ? "イベントを編集" : "新しいイベント"}</h2>
        </div>
        {editingEventId ? (
          <button
            className="icon-button"
            type="button"
            title="編集をやめる"
            onClick={clearEventForm}
          >
            <X size={18} />
          </button>
        ) : (
          <Plus size={20} />
        )}
      </div>
      <form
        ref={eventFormRef}
        className="role-form event-plan-form"
        onSubmit={(event) => void createEvent(event)}
        onInvalid={(event) => {
          const section = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-event-form-step]",
          );
          const step = Number(section?.dataset.eventFormStep);
          if (step === 1 || step === 2 || step === 3) setEventFormStep(step);
        }}
      >
        <nav className="event-form-progress" aria-label="企画作成の手順">
          {["基本情報", "開催情報", "詳細・確認"].map((label, index) => {
            const step = (index + 1) as 1 | 2 | 3;
            return (
              <button
                className={
                  eventFormStep === step
                    ? "active"
                    : eventFormStep > step
                      ? "complete"
                      : ""
                }
                key={label}
                type="button"
                aria-current={eventFormStep === step ? "step" : undefined}
                onClick={() => moveToEventFormStep(step)}
              >
                <span>{step}</span>
                {label}
              </button>
            );
          })}
        </nav>
        <EventBasicsFields editor={editor} setNotice={setNotice} />
        <EventScheduleFields editor={editor} />
        <EventAdvancedFields editor={editor} />
        <div className="event-form-foot" hidden={eventFormStep !== 3}>
          <small className="draft-save-status" role="status">
            {editingEventId
              ? "変更内容は審査後に反映されます"
              : isDraftSaving
                ? "下書きを保存中…"
                : draftSavedAt
                  ? `下書き保存済み・${draftSavedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
                  : "入力するとこの端末へ自動保存されます"}
          </small>
          <div className="row-actions">
            <button
              className="secondary-action"
              type="button"
              onClick={() => setIsEventPreviewOpen(true)}
            >
              <Eye size={16} />
              公開前プレビュー
            </button>
            <button
              className="primary-action"
              disabled={isLoading}
              type="submit"
            >
              {isLoading ? (
                <Loader2 size={17} className="spin" />
              ) : (
                <Check size={17} />
              )}
              {editingEventId ? "変更を審査へ送る" : "企画を申請する"}
            </button>
          </div>
          {isLoading && eventImageUploadProgress !== null && (
            <div className="image-upload-progress" role="status">
              <span>イベント画像を送信中</span>
              <strong>{eventImageUploadProgress}%</strong>
              <progress
                max={100}
                value={eventImageUploadProgress}
                aria-label="イベント画像の送信進捗"
              />
            </div>
          )}
        </div>
      </form>
    </section>
  );
}
