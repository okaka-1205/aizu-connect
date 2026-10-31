import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  Compass,
  ExternalLink,
  FileText,
  Flag,
  Heart,
  Loader2,
  Map,
  MapPin,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogAccessibility } from "../../hooks/useDialogAccessibility";
import { defaultTakeaways } from "../../config/events";
import { auth, db } from "../../lib/firebase";
import {
  downloadEventCalendar,
  googleCalendarUrl,
  hasRequiredCommerceDisclosure,
} from "../../lib/eventUtils";
import type {
  AizuEvent,
  EventReport,
  PublicOrganizerProfile,
} from "../../types/domain";

export function EventDrawer({
  event,
  applied,
  onApply,
  onReport,
  isLoading,
  previewMode = false,
  onClose,
}: {
  event: AizuEvent;
  applied: boolean;
  onApply: () => void;
  onReport: () => void;
  isLoading: boolean;
  previewMode?: boolean;
  onClose: () => void;
}) {
  const hasCommerceDisclosure = hasRequiredCommerceDisclosure(event);
  const canApply = Boolean(event.createdBy) && hasCommerceDisclosure;
  const capacity = Number(event.capacity ?? 0);
  const applicantCount = Number(event.applicantCount ?? 0);
  const remainingSlots = Math.max(0, capacity - applicantCount);
  const organizerVerified =
    event.organizationVerified ?? Boolean(event.createdBy);
  const [organizerProfile, setOrganizerProfile] =
    useState<PublicOrganizerProfile | null>(null);
  const [pastEvents, setPastEvents] = useState<AizuEvent[]>([]);
  const [eventReport, setEventReport] = useState<EventReport | null>(null);
  const [organizerSaved, setOrganizerSaved] = useState(false);
  const dialogRef = useDialogAccessibility<HTMLElement>(onClose, () => {
    const activeTabButton = document.querySelector<HTMLElement>(
      '.bottom-nav [aria-current="page"]',
    );
    return activeTabButton ?? document.getElementById("student-main");
  });
  useEffect(() => {
    if (!event.createdBy) {
      setOrganizerProfile(null);
      return;
    }
    void getDoc(doc(db, "publicOrganizerProfiles", event.createdBy))
      .then((snapshot) =>
        setOrganizerProfile(
          snapshot.exists()
            ? (snapshot.data() as PublicOrganizerProfile)
            : null,
        ),
      )
      .catch(() => setOrganizerProfile(null));
  }, [event.createdBy]);
  useEffect(() => {
    if (!event.createdBy || previewMode) return;
    const userId = auth.currentUser?.uid;
    void Promise.all([
      getDocs(
        query(
          collection(db, "events"),
          where("createdBy", "==", event.createdBy),
          where("status", "==", "published"),
          where("startAt", "<", Timestamp.now()),
          orderBy("startAt", "desc"),
          limit(6),
        ),
      ),
      getDoc(doc(db, "eventReports", event.id)).catch(() => null),
      userId
        ? getDoc(
            doc(db, "savedOrganizers", `${userId}_${event.createdBy}`),
          ).catch(() => null)
        : Promise.resolve(null),
    ]).then(([eventSnapshot, reportSnapshot, favoriteSnapshot]) => {
      setPastEvents(
        eventSnapshot.docs
          .filter((eventDocument) => eventDocument.id !== event.id)
          .map(
            (eventDocument) =>
              ({ id: eventDocument.id, ...eventDocument.data() }) as AizuEvent,
          )
          .slice(0, 5),
      );
      setEventReport(
        reportSnapshot?.exists() && reportSnapshot.data().status === "published"
          ? (reportSnapshot.data() as EventReport)
          : null,
      );
      setOrganizerSaved(Boolean(favoriteSnapshot?.exists()));
    });
  }, [event.createdBy, event.id, previewMode]);

  const toggleOrganizerSaved = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId || !event.createdBy) return;
    const favoriteRef = doc(
      db,
      "savedOrganizers",
      `${userId}_${event.createdBy}`,
    );
    if (organizerSaved) {
      await deleteDoc(favoriteRef);
      setOrganizerSaved(false);
      return;
    }
    await setDoc(favoriteRef, {
      userId,
      organizationId: event.createdBy,
      organizationName: event.organizationName,
      createdAt: serverTimestamp(),
    });
    setOrganizerSaved(true);
  };

  return createPortal(
    <div className="detail-overlay" role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-detail-title"
        tabIndex={-1}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="detail-panel-head">
          <span>{previewMode ? "公開前プレビュー" : "イベント詳細"}</span>
          <button
            className="icon-button"
            title="閉じる"
            type="button"
            data-dialog-initial-focus
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="detail-visual" aria-hidden="true">
          <img src={event.imageUrl} alt={`${event.title}の画像`} />
          <div className="detail-visual-shade" />
          <div className="detail-visual-copy">
            <span className="detail-visual-badge">{event.category}</span>
            <strong>{event.organizationName}</strong>
            <span>
              <MapPin size={14} /> {event.location}
            </span>
            <span>
              <CalendarDays size={14} /> {event.startAtLabel}
              {event.endAtLabel ? ` - ${event.endAtLabel}` : ""}
            </span>
          </div>
        </div>
        <div className="detail-panel-content">
          <p className="eyebrow">{event.category}</p>
          <h2 id="event-detail-title">{event.title}</h2>
          <p className="detail-summary">{event.summary}</p>
          <section className="detail-section detail-value-section">
            <h3>このイベントでできること</h3>
            <div className="value-chip-grid">
              {(event.takeaways?.length ? event.takeaways : defaultTakeaways)
                .slice(0, 3)
                .map((takeaway) => (
                  <span key={takeaway}>
                    <CheckCircle2 size={15} />
                    {takeaway}
                  </span>
                ))}
            </div>
          </section>
          <div className="detail-facts">
            <span>
              <CalendarDays size={16} /> {event.startAtLabel}
              {event.endAtLabel ? ` - ${event.endAtLabel}` : ""}
            </span>
            <span>
              <MapPin size={16} /> {event.location}
            </span>
            <span>
              <UsersRound size={16} /> 定員 {capacity}名
            </span>
            <span>
              <UsersRound size={16} /> {event.beginnerLevel ?? "誰でも歓迎"}
            </span>
            <span>
              <FileText size={16} />
              {event.feeType ?? "無料"}
              {event.feeType === "有料" && event.feeAmount
                ? ` ${event.feeAmount.toLocaleString("ja-JP")}円`
                : ""}
            </span>
            <span>
              <Compass size={16} /> {event.eventFormat ?? "現地"}
            </span>
          </div>
          <section className="detail-section">
            <h3>日時・場所など</h3>
            <dl className="event-guidance-list">
              <div>
                <dt>集合場所</dt>
                <dd>{event.meetingPoint || event.location}</dd>
              </div>
              <div>
                <dt>アクセス</dt>
                <dd>{event.accessInfo || "申請後に主催者から案内します"}</dd>
              </div>
              <div>
                <dt>持ち物・服装</dt>
                <dd>{event.bringItems || "特になし"}</dd>
              </div>
              <div>
                <dt>キャンセル</dt>
                <dd>
                  {event.cancellationPolicy ||
                    "参加できない場合は早めにキャンセルしてください"}
                </dd>
              </div>
              <div>
                <dt>天候・中止時</dt>
                <dd>
                  {event.weatherPolicy ||
                    "変更がある場合は通知と全体チャットで案内します"}
                </dd>
              </div>
              <div>
                <dt>参加時の配慮</dt>
                <dd>
                  {event.accessibility ||
                    "必要な配慮は申請時に主催者へ伝えられます"}
                </dd>
              </div>
              <div>
                <dt>連絡方法</dt>
                <dd>
                  {event.contactMethod ||
                    "申請後の全体チャットで主催者へ連絡できます"}
                </dd>
              </div>
            </dl>
            <div className="detail-secondary-actions">
              <a
                href={googleCalendarUrl(event)}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!event.startAt}
              >
                <CalendarPlus size={15} />
                Googleカレンダー
                <ExternalLink size={12} />
              </a>
              <button
                type="button"
                onClick={() => downloadEventCalendar(event)}
                disabled={!event.startAt}
              >
                <CalendarPlus size={15} />
                Appleカレンダー
              </button>
              {(event.eventFormat ?? "現地") !== "オンライン" && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.meetingPoint || event.location)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Map size={15} />
                  地図で確認
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </section>
          {event.feeType === "有料" && (
            <section className="detail-section commerce-disclosure">
              <h3>特定商取引法に基づく表示</h3>
              {!hasCommerceDisclosure ? (
                <p className="form-notice">
                  必要な表示事項を確認中です。確認が完了するまで申込みはできません。
                </p>
              ) : (
                <dl className="event-guidance-list">
                  <div>
                    <dt>販売・役務提供事業者</dt>
                    <dd>{event.commercialSellerName}</dd>
                  </div>
                  <div>
                    <dt>運営責任者</dt>
                    <dd>{event.commercialResponsiblePerson}</dd>
                  </div>
                  <div>
                    <dt>所在地</dt>
                    <dd>{event.commercialSellerAddress}</dd>
                  </div>
                  <div>
                    <dt>電話番号</dt>
                    <dd>{event.commercialSellerPhone}</dd>
                  </div>
                  <div>
                    <dt>参加費</dt>
                    <dd>
                      {Number(event.feeAmount ?? 0).toLocaleString("ja-JP")}
                      円（税込）
                    </dd>
                  </div>
                  <div>
                    <dt>追加費用</dt>
                    <dd>{event.additionalFees}</dd>
                  </div>
                  <div>
                    <dt>支払方法</dt>
                    <dd>{event.paymentMethod}</dd>
                  </div>
                  <div>
                    <dt>支払時期</dt>
                    <dd>{event.paymentTiming}</dd>
                  </div>
                  <div>
                    <dt>提供時期</dt>
                    <dd>{event.startAtLabel}</dd>
                  </div>
                  <div>
                    <dt>キャンセル・返金</dt>
                    <dd>{event.cancellationPolicy}</dd>
                  </div>
                </dl>
              )}
            </section>
          )}
          <div className="tag-row detail-tags">
            {event.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="organizer-card">
            <div className="organizer-icon">
              <UsersRound size={17} />
            </div>
            <div className="organizer-copy">
              <small>主催</small>
              <strong>{event.organizationName}</strong>
              {organizerVerified && (
                <span className="verified-organizer">
                  <ShieldCheck size={13} /> 承認済み主催者
                </span>
              )}
              <p>
                {organizerProfile?.description ||
                  event.organizerDescription ||
                  "参加者が安心して参加できるよう、事前連絡と当日の案内を行います。"}
              </p>
              <small>
                {organizerProfile
                  ? `公開イベント ${organizerProfile.publishedEventCount}件`
                  : event.organizerExperience || "Aizu Connectで活動を企画"}
              </small>
            </div>
            {!previewMode && (
              <button
                type="button"
                aria-pressed={organizerSaved}
                onClick={() => void toggleOrganizerSaved()}
              >
                <Heart
                  size={15}
                  fill={organizerSaved ? "currentColor" : "none"}
                />
                {organizerSaved ? "主催者を保存済み" : "主催者を保存"}
              </button>
            )}
          </div>
          {eventReport && (
            <section className="detail-section">
              <h3>開催後の活動報告</h3>
              <strong>{eventReport.title}</strong>
              <p>{eventReport.summary}</p>
              <div className="event-report-images">
                {eventReport.imageUrls.slice(0, 4).map((imageUrl) => (
                  <img key={imageUrl} src={imageUrl} alt="活動報告" />
                ))}
              </div>
            </section>
          )}
          {pastEvents.length > 0 && (
            <section className="detail-section">
              <h3>同じ主催者の過去・公開イベント</h3>
              <ul>
                {pastEvents.map((pastEvent) => (
                  <li key={pastEvent.id}>{pastEvent.title}</li>
                ))}
              </ul>
            </section>
          )}
          {!previewMode && (
            <button
              className="detail-inline-report text-button"
              type="button"
              onClick={onReport}
            >
              <Flag size={14} /> 掲載を通報
            </button>
          )}
          <div className="detail-action-bar">
            <div className="detail-trust-row">
              <span>
                <UsersRound size={15} />
                {remainingSlots > 0
                  ? `残り${remainingSlots}名`
                  : "満員・キャンセル待ち受付中"}
              </span>
              {!previewMode && (
                <button
                  className="text-button"
                  type="button"
                  onClick={onReport}
                >
                  <Flag size={14} /> 掲載を通報
                </button>
              )}
            </div>
            {previewMode ? (
              <button
                className="primary-action"
                type="button"
                onClick={onClose}
              >
                <Check size={17} />
                プレビューを閉じる
              </button>
            ) : (
              <button
                className="primary-action"
                type="button"
                disabled={applied || isLoading || !canApply}
                onClick={onApply}
              >
                {isLoading && <Loader2 size={17} className="spin" />}
                {applied
                  ? "申請済み"
                  : canApply
                    ? remainingSlots > 0
                      ? "このイベントに参加する"
                      : "キャンセル待ちに登録する"
                    : "現在申請できません"}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
