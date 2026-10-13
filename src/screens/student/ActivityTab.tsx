import {
  CalendarDays,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  History,
  Link as LinkIcon,
  Loader2,
  MessageCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { BrandMark, SectionHeading } from "../../components/ui/AppPrimitives";
import { useDialogAccessibility } from "../../hooks/useDialogAccessibility";
import { getFirebaseErrorMessage } from "../../lib/appLogic";
import type {
  ActivityRecord,
  AizuEvent,
  EventApplication,
  Tab,
} from "../../types/domain";
import { applicationStatusLabel } from "../shared/applicationStatus";

function ApplicationStatusTimeline({
  status,
}: {
  status: EventApplication["status"];
}) {
  const terminal = status === "rejected" || status === "cancelled";
  const currentStep =
    status === "pending" || status === "waitlisted"
      ? 1
      : status === "confirmed"
        ? 2
        : 3;
  return (
    <div className={`application-timeline ${terminal ? "terminal" : ""}`}>
      {[
        ["申請", 1],
        ["参加確定", 2],
        ["活動実績", 3],
      ].map(([label, step]) => (
        <span
          className={Number(step) <= currentStep && !terminal ? "done" : ""}
          key={label}
        >
          <i>
            {Number(step) < currentStep && !terminal ? (
              <Check size={11} />
            ) : (
              step
            )}
          </i>
          {label}
        </span>
      ))}
      {terminal && <strong>{applicationStatusLabel(status)}</strong>}
    </div>
  );
}

export function ActivityTab(props: {
  applications: EventApplication[];
  activities: ActivityRecord[];
  userName: string;
  activityYear: number;
  activityByMonth: { month: number; count: number }[];
  events: AizuEvent[];
  setSelectedEventId: (id: string) => void;
  setActiveTab: (tab: Tab) => void;
  onOpenMessages: (eventId: string) => void;
  onCancelApplication: (application: EventApplication) => void;
  onCheckIn: (application: EventApplication, code: string) => Promise<void>;
}) {
  const [selectedCertificate, setSelectedCertificate] =
    useState<ActivityRecord | null>(null);
  const [checkInCodes, setCheckInCodes] = useState<Record<string, string>>({});
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState("");
  const [checkInErrorId, setCheckInErrorId] = useState<string | null>(null);
  const verifiedActivities = props.activities.filter(
    (activity) => activity.verificationStatus === "verified",
  );
  const uniqueOrganizations = new Set(
    verifiedActivities.map((activity) => activity.organizationName),
  ).size;
  const portfolioTakeaways = Array.from(
    new Set(verifiedActivities.flatMap((activity) => activity.takeaways ?? [])),
  ).slice(0, 5);
  return (
    <section className="tab-page activity-page">
      <div className="page-title">
        <div>
          <h1>参加履歴</h1>
          <p>申請中・参加予定・参加済みのイベントを確認できます。</p>
        </div>
        <div className="activity-total">
          <strong>{props.applications.length}</strong>
          <span>申請</span>
        </div>
      </div>
      <SectionHeading
        className="activity-upcoming-heading"
        title="これから参加するイベント"
        action="イベントを探す"
        onClick={() => props.setActiveTab("search")}
      />
      <div className="application-list activity-upcoming-list">
        {props.applications.length === 0 ? (
          <div className="empty-inline">
            <CalendarDays size={26} />
            <p>まだ参加予定はありません。</p>
            <button type="button" onClick={() => props.setActiveTab("search")}>
              イベントを探す
            </button>
          </div>
        ) : (
          props.applications.map((application) => {
            const relatedEvent = props.events.find(
              (item) => item.id === application.eventId,
            );
            const eventDate = relatedEvent?.startAt?.toDate();
            return (
              <div className="application-item" key={application.id}>
                <div className="date-block">
                  <strong>{eventDate?.getDate() ?? "--"}</strong>
                  <span>
                    {eventDate ? `${eventDate.getMonth() + 1}月` : "予定"}
                  </span>
                </div>
                <div className="application-copy">
                  <strong>{application.eventTitle}</strong>
                  <span>{application.organizationName}</span>
                  <small>
                    {application.status === "confirmed"
                      ? "参加確定。開催前にメッセージで詳細を確認しましょう。"
                      : application.status === "waitlisted"
                        ? `キャンセル待ち${application.waitlistPosition ? ` ${application.waitlistPosition}番目` : ""}です。空きが出たら通知します。`
                        : application.status === "attended"
                          ? "出席が確認され、活動実績に反映されています。"
                          : application.status === "rejected"
                            ? "今回は参加できませんでした。別の活動を探してみましょう。"
                            : "申請後の連絡はメッセージから確認できます。"}
                  </small>
                  <ApplicationStatusTimeline status={application.status} />
                  <div className="application-quick-actions">
                    {relatedEvent && (
                      <button
                        type="button"
                        onClick={() => {
                          props.setSelectedEventId(relatedEvent.id);
                          props.setActiveTab("search");
                        }}
                      >
                        <Eye size={13} />
                        詳細を見る
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => props.onOpenMessages(application.eventId)}
                    >
                      <MessageCircle size={13} />
                      連絡を見る
                    </button>
                  </div>
                  {application.status === "confirmed" && (
                    <form
                      className="student-check-in"
                      onSubmit={(submitEvent) => {
                        submitEvent.preventDefault();
                        const code = checkInCodes[application.id] ?? "";
                        if (!/^\d{6}$/.test(code)) {
                          setCheckInError(
                            "6桁の受付コードを入力してください。",
                          );
                          setCheckInErrorId(application.id);
                          return;
                        }
                        setCheckingInId(application.id);
                        setCheckInError("");
                        setCheckInErrorId(null);
                        void props
                          .onCheckIn(application, code)
                          .catch((error) => {
                            setCheckInError(getFirebaseErrorMessage(error));
                            setCheckInErrorId(application.id);
                          })
                          .finally(() => setCheckingInId(null));
                      }}
                    >
                      <input
                        aria-label={`${application.eventTitle}の受付コード`}
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        placeholder="当日の6桁受付コード"
                        value={checkInCodes[application.id] ?? ""}
                        onChange={(changeEvent) =>
                          setCheckInCodes((current) => ({
                            ...current,
                            [application.id]: changeEvent.target.value.replace(
                              /\D/g,
                              "",
                            ),
                          }))
                        }
                      />
                      <button
                        type="submit"
                        disabled={checkingInId === application.id}
                      >
                        {checkingInId === application.id ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <Check size={13} />
                        )}
                        受付する
                      </button>
                    </form>
                  )}
                  {checkInError && checkInErrorId === application.id && (
                    <small className="inline-error">{checkInError}</small>
                  )}
                </div>
                <span className="status-chip">
                  {applicationStatusLabel(application.status)}
                </span>
                {["pending", "waitlisted", "confirmed"].includes(
                  application.status,
                ) && (
                  <button
                    className="text-button application-cancel"
                    type="button"
                    onClick={() => props.onCancelApplication(application)}
                  >
                    キャンセル
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="activity-card activity-overview">
        <div className="activity-card-head">
          <div>
            <p className="eyebrow">年間記録</p>
            <h3>{props.activityYear}年</h3>
          </div>
          <CalendarDays size={20} />
        </div>
        <div className="portfolio-summary">
          <span>
            <strong>{verifiedActivities.length}</strong>
            <small>証明済み活動</small>
          </span>
          <span>
            <strong>{uniqueOrganizations}</strong>
            <small>つながった主催</small>
          </span>
          <span>
            <strong>{portfolioTakeaways.length}</strong>
            <small>経験タグ</small>
          </span>
        </div>
        {portfolioTakeaways.length > 0 && (
          <div className="portfolio-tags">
            {portfolioTakeaways.map((takeaway) => (
              <span key={takeaway}>{takeaway}</span>
            ))}
          </div>
        )}
        <div className="month-grid">
          {props.activityByMonth.map((item) => (
            <div
              className={`month-cell level-${Math.min(item.count, 3)}`}
              key={item.month}
            >
              <span>{item.month}月</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
        <div className="legend">
          <span>
            <i className="level-0" /> 参加なし
          </span>
          <span>
            <i className="level-1" /> 1件
          </span>
          <span>
            <i className="level-2" /> 2件
          </span>
          <span>
            <i className="level-3" /> 3件以上
          </span>
        </div>
      </div>
      <SectionHeading
        className="activity-completed-heading"
        title="参加したイベント"
      />
      <div className="activity-history activity-completed-list">
        {props.activities.length === 0 ? (
          <div className="empty-inline">
            <History size={24} />
            <p>出席確認された活動がここに表示されます。</p>
          </div>
        ) : (
          props.activities.map((activity) => (
            <article className="activity-history-item" key={activity.id}>
              <div className="activity-history-icon">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <strong>{activity.title}</strong>
                <span>{activity.organizationName}</span>
                <small>
                  {activity.activityYear}年{activity.activityMonth}月 ·{" "}
                  {activity.verificationStatus === "verified"
                    ? "主催者確認済み"
                    : "無効"}
                </small>
                <div className="certificate-card">
                  <span>
                    <ShieldCheck size={14} />
                    活動証明 {activity.certificateId ?? activity.id}
                  </span>
                  <small>{activity.participantRole ?? "参加者"}</small>
                </div>
                <button
                  className="certificate-open-button"
                  type="button"
                  onClick={() => setSelectedCertificate(activity)}
                >
                  <FileText size={14} />
                  証明書を表示・共有
                </button>
                {activity.takeaways && activity.takeaways.length > 0 && (
                  <div className="activity-takeaways">
                    {activity.takeaways.slice(0, 3).map((takeaway) => (
                      <span key={takeaway}>{takeaway}</span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </div>
      {selectedCertificate && (
        <CertificateDialog
          activity={selectedCertificate}
          userName={props.userName}
          onClose={() => setSelectedCertificate(null)}
        />
      )}
    </section>
  );
}

function CertificateDialog({
  activity,
  userName,
  onClose,
}: {
  activity: ActivityRecord;
  userName: string;
  onClose: () => void;
}) {
  const [shareNotice, setShareNotice] = useState("");
  const dialogRef = useDialogAccessibility<HTMLElement>(onClose, () => {
    const activeTabButton = document.querySelector<HTMLElement>(
      '.bottom-nav [aria-current="page"]',
    );
    return activeTabButton ?? document.getElementById("student-main");
  });
  const shareText = `${userName}さんは「${activity.title}」に参加しました。活動証明: ${activity.certificateId ?? activity.id}`;
  const shareCertificate = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "Aizu Connect 活動証明",
        text: shareText,
      });
      return;
    }
    await navigator.clipboard.writeText(shareText);
    setShareNotice("共有用テキストをコピーしました。");
  };
  return createPortal(
    <div
      className="image-review-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        ref={dialogRef}
        className="certificate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="certificate-title"
        tabIndex={-1}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="image-review-head no-print">
          <div>
            <p className="eyebrow">活動の記録</p>
            <h2 id="certificate-title">活動証明書</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="閉じる"
            data-dialog-initial-focus
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="certificate-sheet">
          <BrandMark />
          <p>Aizu Connect 活動証明</p>
          <h3>活動証明書</h3>
          <strong>{userName} 様</strong>
          <p>
            下記の活動へ参加し、主催者による出席確認が完了したことを証明します。
          </p>
          <dl>
            <div>
              <dt>活動名</dt>
              <dd>{activity.title}</dd>
            </div>
            <div>
              <dt>主催</dt>
              <dd>{activity.organizationName}</dd>
            </div>
            <div>
              <dt>参加年月</dt>
              <dd>
                {activity.activityYear}年{activity.activityMonth}月
              </dd>
            </div>
            <div>
              <dt>証明番号</dt>
              <dd>{activity.certificateId ?? activity.id}</dd>
            </div>
          </dl>
          {(activity.takeaways ?? []).length > 0 && (
            <div className="certificate-skills">
              {(activity.takeaways ?? []).map((takeaway) => (
                <span key={takeaway}>{takeaway}</span>
              ))}
            </div>
          )}
          <small>発行: Aizu Connect / 主催者確認済み</small>
        </div>
        {shareNotice && (
          <div
            className="form-message no-print"
            role="status"
            aria-live="polite"
          >
            {shareNotice}
          </div>
        )}
        <div className="image-review-actions no-print">
          <button
            className="secondary-action"
            type="button"
            onClick={() => void shareCertificate()}
          >
            <LinkIcon size={16} />
            共有
          </button>
          <button
            className="primary-action"
            type="button"
            onClick={() => window.print()}
          >
            <Download size={16} />
            PDFとして印刷
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
