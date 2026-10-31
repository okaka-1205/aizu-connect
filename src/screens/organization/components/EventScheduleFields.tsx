import { ChevronLeft, ChevronRight } from "lucide-react";
import { Field } from "../../../components/Field";
import { categories, toDateTimeLocalValue } from "../../../lib/appLogic";
import type { AizuEvent } from "../../../types/domain";
import type { OrganizationEventEditor } from "../hooks/useOrganizationEventEditor";

export function EventScheduleFields({
  editor,
}: {
  editor: OrganizationEventEditor;
}) {
  const {
    organizationName,
    location,
    setLocation,
    startAtInput,
    setStartAtInput,
    endAtInput,
    setEndAtInput,
    capacity,
    setCapacity,
    category,
    setCategory,
    feeType,
    setFeeType,
    feeAmount,
    setFeeAmount,
    commercialSellerName,
    setCommercialSellerName,
    commercialSellerAddress,
    setCommercialSellerAddress,
    commercialSellerPhone,
    setCommercialSellerPhone,
    commercialResponsiblePerson,
    setCommercialResponsiblePerson,
    paymentMethod,
    setPaymentMethod,
    paymentTiming,
    setPaymentTiming,
    additionalFees,
    setAdditionalFees,
    eventFormat,
    setEventFormat,
    meetingPoint,
    setMeetingPoint,
    cancellationDeadlineInput,
    setCancellationDeadlineInput,
    eventFormStep,
    moveToEventFormStep,
  } = editor;
  return (
    <details
      className="event-form-section event-form-collapsible"
      data-event-form-step="2"
      open
      hidden={eventFormStep !== 2}
    >
      <summary>
        <span className="event-form-step">2</span>
        <span className="event-form-section-title">
          <strong>開催情報</strong>
          <small>日時・場所・参加条件を入力</small>
        </span>
        <ChevronRight className="event-form-section-chevron" size={18} />
      </summary>
      <div className="event-form-section-body">
        <div className="form-grid">
          <Field label="カテゴリ">
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories
                .filter((item) => item !== "すべて")
                .map((item) => (
                  <option key={item}>{item}</option>
                ))}
            </select>
          </Field>
          <Field label="定員">
            <input
              type="number"
              min={1}
              max={1000}
              value={capacity}
              onChange={(event) => setCapacity(Number(event.target.value))}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="開始日時">
            <input
              type="datetime-local"
              required
              value={startAtInput}
              min={toDateTimeLocalValue(new Date())}
              onChange={(event) => {
                const value = event.target.value;
                setStartAtInput(value);
                if (!endAtInput && value) {
                  const start = new Date(value);
                  setEndAtInput(
                    toDateTimeLocalValue(
                      new Date(start.getTime() + 2 * 60 * 60 * 1000),
                    ),
                  );
                }
              }}
              onInput={(event) => {
                const value = event.currentTarget.value;
                setStartAtInput(value);
                if (!endAtInput && value) {
                  const start = new Date(value);
                  setEndAtInput(
                    toDateTimeLocalValue(
                      new Date(start.getTime() + 2 * 60 * 60 * 1000),
                    ),
                  );
                }
              }}
            />
          </Field>
          <Field label="終了日時">
            <input
              type="datetime-local"
              required
              value={endAtInput}
              min={startAtInput || toDateTimeLocalValue(new Date())}
              onChange={(event) => setEndAtInput(event.target.value)}
              onInput={(event) => setEndAtInput(event.currentTarget.value)}
            />
          </Field>
          <Field label="キャンセル期限">
            <input
              type="datetime-local"
              value={cancellationDeadlineInput}
              max={startAtInput || undefined}
              onChange={(event) =>
                setCancellationDeadlineInput(event.target.value)
              }
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="開催形式">
            <select
              value={eventFormat}
              onChange={(event) =>
                setEventFormat(event.target.value as AizuEvent["eventFormat"])
              }
            >
              <option>現地</option>
              <option>オンライン</option>
              <option>ハイブリッド</option>
            </select>
          </Field>
          <Field label="料金">
            <select
              value={feeType}
              onChange={(event) =>
                setFeeType(event.target.value as AizuEvent["feeType"])
              }
            >
              <option>無料</option>
              <option>有料</option>
            </select>
          </Field>
        </div>
        {feeType === "有料" && (
          <div className="commerce-disclosure-form">
            <p>
              有料イベントは、申込前に特定商取引法に基づく表示を参加者へ示します。
            </p>
            <Field label="参加費（税込・円）">
              <input
                type="number"
                min={1}
                max={1_000_000}
                required
                value={feeAmount}
                onChange={(event) => setFeeAmount(Number(event.target.value))}
              />
            </Field>
            <div className="form-grid">
              <Field label="販売・役務提供事業者名">
                <input
                  required
                  maxLength={120}
                  placeholder={organizationName}
                  value={commercialSellerName}
                  onChange={(event) =>
                    setCommercialSellerName(event.target.value)
                  }
                />
              </Field>
              <Field label="運営責任者名">
                <input
                  required
                  maxLength={80}
                  value={commercialResponsiblePerson}
                  onChange={(event) =>
                    setCommercialResponsiblePerson(event.target.value)
                  }
                />
              </Field>
            </div>
            <Field label="事業者所在地">
              <input
                required
                maxLength={240}
                autoComplete="street-address"
                value={commercialSellerAddress}
                onChange={(event) =>
                  setCommercialSellerAddress(event.target.value)
                }
              />
            </Field>
            <Field label="事業者電話番号">
              <input
                required
                maxLength={40}
                type="tel"
                autoComplete="tel"
                value={commercialSellerPhone}
                onChange={(event) =>
                  setCommercialSellerPhone(event.target.value)
                }
              />
            </Field>
            <div className="form-grid">
              <Field label="支払方法">
                <input
                  required
                  maxLength={200}
                  placeholder="例：当日受付で現金"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                />
              </Field>
              <Field label="支払時期">
                <input
                  required
                  maxLength={200}
                  placeholder="例：イベント当日の受付時"
                  value={paymentTiming}
                  onChange={(event) => setPaymentTiming(event.target.value)}
                />
              </Field>
            </div>
            <Field label="参加費以外の追加費用">
              <input
                required
                maxLength={200}
                placeholder="ない場合は「なし」"
                value={additionalFees}
                onChange={(event) => setAdditionalFees(event.target.value)}
              />
            </Field>
          </div>
        )}
        <div className="form-grid">
          <Field label="開催エリア・場所">
            <input
              required
              maxLength={80}
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          </Field>
          <Field label="集合場所・オンラインURL案内">
            <input
              required
              maxLength={160}
              value={meetingPoint}
              onChange={(event) => setMeetingPoint(event.target.value)}
            />
          </Field>
        </div>
        <div className="event-form-step-actions">
          <button
            className="secondary-action"
            type="button"
            onClick={() => moveToEventFormStep(1)}
          >
            <ChevronLeft size={16} />
            基本情報へ
          </button>
          <button
            className="primary-action"
            type="button"
            onClick={() => moveToEventFormStep(3)}
          >
            詳細・確認へ
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </details>
  );
}
