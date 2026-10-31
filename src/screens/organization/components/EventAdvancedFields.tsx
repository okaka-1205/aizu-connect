import { ChevronLeft, ChevronRight } from "lucide-react";
import { Field } from "../../../components/Field";
import type { OrganizationEventEditor } from "../hooks/useOrganizationEventEditor";

export function EventAdvancedFields({
  editor,
}: {
  editor: OrganizationEventEditor;
}) {
  const {
    editingEventId,
    accessInfo,
    setAccessInfo,
    bringItems,
    setBringItems,
    cancellationPolicy,
    setCancellationPolicy,
    weatherPolicy,
    setWeatherPolicy,
    accessibility,
    setAccessibility,
    contactMethod,
    setContactMethod,
    organizerDescription,
    setOrganizerDescription,
    organizerExperience,
    setOrganizerExperience,
    eventFormStep,
    moveToEventFormStep,
  } = editor;
  return (
    <details
      className="event-form-section event-form-advanced"
      data-event-form-step="3"
      key={editingEventId ?? "new-event"}
      open
      hidden={eventFormStep !== 3}
    >
      <summary>
        <span className="event-form-step">3</span>
        <span className="event-form-section-title">
          <strong>詳細設定</strong>
          <small>持ち物・中止時対応・主催者情報</small>
        </span>
        <ChevronRight className="event-form-section-chevron" size={18} />
      </summary>
      <div className="event-form-section-body">
        <Field label="アクセス方法">
          <textarea
            maxLength={300}
            value={accessInfo}
            placeholder="最寄り駅、駐車場、入室方法など"
            onChange={(event) => setAccessInfo(event.target.value)}
          />
        </Field>
        <Field label="持ち物・服装">
          <textarea
            required
            maxLength={300}
            value={bringItems}
            onChange={(event) => setBringItems(event.target.value)}
          />
        </Field>
        <Field label="キャンセル方針">
          <textarea
            required
            maxLength={500}
            value={cancellationPolicy}
            onChange={(event) => setCancellationPolicy(event.target.value)}
          />
        </Field>
        <Field label="雨天・中止時の対応">
          <textarea
            required
            maxLength={500}
            value={weatherPolicy}
            onChange={(event) => setWeatherPolicy(event.target.value)}
          />
        </Field>
        <Field label="バリアフリー・必要な配慮">
          <textarea
            required
            maxLength={500}
            value={accessibility}
            onChange={(event) => setAccessibility(event.target.value)}
          />
        </Field>
        <Field label="問い合わせ方法">
          <textarea
            required
            maxLength={300}
            value={contactMethod}
            onChange={(event) => setContactMethod(event.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="主催者紹介">
            <textarea
              required
              maxLength={500}
              value={organizerDescription}
              onChange={(event) => setOrganizerDescription(event.target.value)}
            />
          </Field>
          <Field label="主催・開催実績">
            <textarea
              required
              maxLength={300}
              value={organizerExperience}
              onChange={(event) => setOrganizerExperience(event.target.value)}
            />
          </Field>
        </div>
        <button
          className="secondary-action"
          type="button"
          onClick={() => moveToEventFormStep(2)}
        >
          <ChevronLeft size={16} />
          開催情報へ戻る
        </button>
      </div>
    </details>
  );
}
