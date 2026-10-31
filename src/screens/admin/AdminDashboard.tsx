import {
  CalendarDays,
  Eye,
  Flag,
  History,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { NoticeBanner } from "../../components/ui/AppPrimitives";
import { useNoticeState } from "../../hooks/useNoticeState";
import {
  getFirebaseErrorMessage,
  isAizuUniversityEmail,
} from "../../lib/appLogic";
import { formatChatTime, preferredScrollBehavior } from "../../lib/eventUtils";
import type { AizuEvent, AppUser } from "../../types/domain";
import {
  ActionReasonDialog,
  EmptyRoleState,
  QueuePagination,
  RoleShell,
} from "../shared/RoleScreenPrimitives";
import { deriveAdminDashboardView } from "./adminDashboardLogic";
import { AdminOverview } from "./components/AdminOverview";
import { AdminUsageOverview } from "./components/AdminUsageOverview";
import { AssignmentControls } from "./components/AssignmentControls";
import { useAdminActions } from "./hooks/useAdminActions";
import { useAdminDashboardData } from "./hooks/useAdminDashboardData";

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [notice, noticeTone, setNotice] = useNoticeState();
  const [isLoading, setIsLoading] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [adminSearch, setAdminSearch] = useState("");
  const [managedUserStatus, setManagedUserStatus] = useState<
    "active" | "suspended" | "rejected"
  >("active");
  const [reasonAction, setReasonAction] = useState<{
    title: string;
    description: string;
    label: string;
    placeholder: string;
    confirmLabel: string;
    danger?: boolean;
    action: (reason: string) => Promise<void>;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    danger?: boolean;
    action: () => Promise<void>;
  } | null>(null);
  const {
    pendingEvents,
    pendingUsers,
    pendingReports,
    deletionRequests,
    deletionRequestUsers,
    managedUsers,
    managedEvents,
    setPendingEventQueryLimit,
    setPendingUserQueryLimit,
    setPendingReportQueryLimit,
    setDeletionRequestQueryLimit,
    hasMorePendingEvents,
    hasMorePendingUsers,
    hasMorePendingReports,
    hasMoreDeletionRequests,
    setManagedUserQueryLimit,
    setManagedEventQueryLimit,
    hasMoreManagedUsers,
    hasMoreManagedEvents,
    setAuditLogQueryLimit,
    hasMoreAuditLogs,
    auditLogs,
    usageMetrics,
    isUsageMetricsLoading,
    usageMetricsError,
    loadUsageMetrics,
    loadReviewQueue,
  } = useAdminDashboardData({ setNotice, setIsLoading });

  const {
    visiblePendingEvents,
    visiblePendingUsers,
    visiblePendingReports,
    visibleDeletionRequests,
    visibleManagedUsers,
    visibleManagedEvents,
    oldestPendingDays,
    processedToday,
  } = deriveAdminDashboardView({
    search: adminSearch,
    pendingEvents,
    pendingUsers,
    pendingReports,
    deletionRequests,
    deletionRequestUsers,
    managedUsers,
    managedEvents,
    managedUserStatus,
    auditLogs,
  });
  const {
    approveEvent,
    requestEventRevision,
    approveUser,
    rejectUser,
    resolveReport,
    updateManagedUserStatus,
    updateManagedEventStatus,
    deleteManagedEvent,
    deleteManagedUser,
  } = useAdminActions({ setNotice, setIsLoading, setReasonAction });

  const reviewQueueHasMore =
    hasMorePendingEvents ||
    hasMorePendingUsers ||
    hasMorePendingReports ||
    hasMoreDeletionRequests;

  const eventRiskFlags = (event: AizuEvent) =>
    [
      event.organizationVerified === false ? "未承認主催者" : null,
      !event.cancellationPolicy ? "キャンセル方針なし" : null,
      !event.meetingPoint ? "集合案内なし" : null,
      !event.accessibility ? "配慮情報なし" : null,
      event.feeType === "有料" && !event.feeAmount ? "料金未確定" : null,
      event.feeType === "有料" &&
      ![
        event.commercialSellerName,
        event.commercialSellerAddress,
        event.commercialSellerPhone,
        event.commercialResponsiblePerson,
        event.paymentMethod,
        event.paymentTiming,
        event.additionalFees,
      ].every(Boolean)
        ? "特商法表示不足"
        : null,
    ].filter(Boolean) as string[];
  const userRiskFlags = (user: AppUser) =>
    [
      !user.email ? "メール未設定" : null,
      user.role === "student" &&
      user.email &&
      !isAizuUniversityEmail(user.email)
        ? "学外メール"
        : null,
      !user.department ? "所属未設定" : null,
    ].filter(Boolean) as string[];

  const goToAdminHome = () => {
    setAdminSearch("");
    setExpandedEventId(null);
    setManagedUserStatus("active");
    window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
  };

  return (
    <RoleShell
      title="Aizu Connect運営"
      subtitle="管理者コンソール"
      icon={<ShieldCheck size={19} />}
      onHome={goToAdminHome}
      onLogout={onLogout}
    >
      {notice && <NoticeBanner message={notice} tone={noticeTone} />}
      <AdminOverview
        search={adminSearch}
        onSearchChange={setAdminSearch}
        pendingEvents={pendingEvents.length}
        pendingUsers={pendingUsers.length}
        pendingReports={pendingReports.length}
        deletionRequests={deletionRequests.length}
        hasMorePendingEvents={hasMorePendingEvents}
        hasMorePendingUsers={hasMorePendingUsers}
        hasMorePendingReports={hasMorePendingReports}
        hasMoreDeletionRequests={hasMoreDeletionRequests}
        oldestPendingDays={oldestPendingDays}
        processedToday={processedToday}
        reviewQueueHasMore={reviewQueueHasMore}
      />
      <AdminUsageOverview
        metrics={usageMetrics}
        isLoading={isUsageMetricsLoading}
        error={usageMetricsError}
        onRefresh={() => void loadUsageMetrics()}
      />
      <div className="role-grid">
        <section className="role-card">
          <div className="role-card-head">
            <div>
              <p className="eyebrow">公開申請</p>
              <h2>イベント審査</h2>
            </div>
            <CalendarDays size={20} />
          </div>
          <div
            className={`role-list admin-scroll-list ${
              visiblePendingEvents.length > 10 ? "is-scrollable" : ""
            }`}
            role={visiblePendingEvents.length > 10 ? "region" : undefined}
            aria-label={
              visiblePendingEvents.length > 10 ? "イベント審査一覧" : undefined
            }
            tabIndex={visiblePendingEvents.length > 10 ? 0 : undefined}
          >
            {visiblePendingEvents.length === 0 ? (
              <EmptyRoleState text="審査待ちのイベントはありません。" />
            ) : (
              visiblePendingEvents.map((event) => (
                <article className="admin-review-item" key={event.id}>
                  <AssignmentControls targetType="event" targetId={event.id} />
                  <div className="review-row">
                    <div>
                      <strong>{event.title}</strong>
                      <small>
                        {event.organizationName} · {event.startAtLabel}
                      </small>
                      {eventRiskFlags(event).length > 0 && (
                        <div className="risk-chip-row">
                          {eventRiskFlags(event).map((risk) => (
                            <span key={risk}>{risk}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="row-actions">
                      <button
                        className="muted"
                        type="button"
                        aria-expanded={expandedEventId === event.id}
                        onClick={() =>
                          setExpandedEventId((current) =>
                            current === event.id ? null : event.id,
                          )
                        }
                      >
                        <Eye size={14} />
                        {expandedEventId === event.id
                          ? "内容を閉じる"
                          : "内容を見る"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmation({
                            title: "イベントを公開しますか？",
                            description: `「${event.title}」を学生向けのイベント一覧へ公開します。`,
                            confirmLabel: "公開する",
                            action: () => approveEvent(event),
                          })
                        }
                      >
                        公開する
                      </button>
                      <button
                        className="muted"
                        type="button"
                        onClick={() =>
                          setReasonAction({
                            title: "イベントを差し戻す",
                            description: `「${event.title}」を非公開のまま主催者へ戻します。`,
                            label: "修正してほしい内容",
                            placeholder:
                              "不足情報と、公開に必要な修正を具体的に入力してください",
                            confirmLabel: "差し戻す",
                            danger: true,
                            action: (reason) =>
                              requestEventRevision(event, reason),
                          })
                        }
                      >
                        差し戻す
                      </button>
                    </div>
                  </div>
                  {expandedEventId === event.id && (
                    <div className="admin-event-preview">
                      <img
                        src={event.imageUrl}
                        alt={`${event.title}の審査用画像`}
                      />
                      <div>
                        <div className="admin-event-preview-head">
                          <span>{event.category}</span>
                          <strong>
                            {event.beginnerLevel ?? "初心者歓迎度 未設定"}
                          </strong>
                        </div>
                        <p>{event.summary}</p>
                        <dl>
                          <div>
                            <dt>日時</dt>
                            <dd>{event.startAtLabel}</dd>
                          </div>
                          <div>
                            <dt>場所</dt>
                            <dd>{event.location}</dd>
                          </div>
                          <div>
                            <dt>定員</dt>
                            <dd>{event.capacity}名</dd>
                          </div>
                        </dl>
                        {event.takeaways && event.takeaways.length > 0 && (
                          <div className="value-chip-grid compact">
                            {event.takeaways.slice(0, 3).map((takeaway) => (
                              <span key={takeaway}>{takeaway}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
          <QueuePagination
            label="イベント審査"
            loadedCount={pendingEvents.length}
            pageSize={50}
            hasMore={hasMorePendingEvents}
            disabled={isLoading}
            onLoadMore={() =>
              setPendingEventQueryLimit((current) => current + 50)
            }
          />
        </section>
        <section className="role-card">
          <div className="role-card-head">
            <div>
              <p className="eyebrow">利用申請</p>
              <h2>アカウント審査</h2>
            </div>
            <button
              className="icon-button"
              title="審査キューを更新"
              type="button"
              onClick={() =>
                void loadReviewQueue().catch((error) =>
                  setNotice(getFirebaseErrorMessage(error), "error"),
                )
              }
              disabled={isLoading}
            >
              <RefreshCw size={17} className={isLoading ? "spin" : ""} />
            </button>
          </div>
          <div
            className={`role-list admin-scroll-list ${
              visiblePendingUsers.length > 10 ? "is-scrollable" : ""
            }`}
            role={visiblePendingUsers.length > 10 ? "region" : undefined}
            aria-label={
              visiblePendingUsers.length > 10 ? "アカウント審査一覧" : undefined
            }
            tabIndex={visiblePendingUsers.length > 10 ? 0 : undefined}
          >
            {visiblePendingUsers.length === 0 ? (
              <EmptyRoleState text="審査待ちはありません。個人アカウントはメール認証後に自動で有効化されます。" />
            ) : (
              visiblePendingUsers.map((user) => (
                <div className="review-row" key={user.uid}>
                  <AssignmentControls targetType="user" targetId={user.uid} />
                  <div>
                    <strong>{user.displayName}</strong>
                    <small>
                      {user.role === "organization" ? "主催者・団体" : "学生"} ·{" "}
                      {user.email}
                    </small>
                    <small>
                      {user.university} · {user.department} · {user.status}
                    </small>
                    {userRiskFlags(user).length > 0 && (
                      <div className="risk-chip-row">
                        {userRiskFlags(user).map((risk) => (
                          <span key={risk}>{risk}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmation({
                          title: "アカウントを承認しますか？",
                          description: `${user.displayName}さんがAizu Connectを利用できるようになります。`,
                          confirmLabel: "承認する",
                          action: () => approveUser(user),
                        })
                      }
                    >
                      承認する
                    </button>
                    <button
                      className="muted"
                      type="button"
                      onClick={() =>
                        setReasonAction({
                          title: "アカウントを見送る",
                          description: `${user.displayName}さんへ理由を表示して利用を制限します。`,
                          label: "見送り理由",
                          placeholder:
                            "不足している確認情報や、再申請に必要な内容を入力してください",
                          confirmLabel: "理由を添えて見送る",
                          danger: true,
                          action: (reason) => rejectUser(user, reason),
                        })
                      }
                    >
                      見送る
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <QueuePagination
            label="アカウント審査"
            loadedCount={pendingUsers.length}
            pageSize={50}
            hasMore={hasMorePendingUsers}
            disabled={isLoading}
            onLoadMore={() =>
              setPendingUserQueryLimit((current) => current + 50)
            }
          />
        </section>
      </div>
      <section className="role-card admin-deletion-card">
        <div className="role-card-head">
          <div>
            <p className="eyebrow">削除申請</p>
            <h2>退会・データ削除</h2>
          </div>
          <Trash2 size={20} />
        </div>
        {visibleDeletionRequests.length === 0 ? (
          <EmptyRoleState text="対応待ちの退会申請はありません。" />
        ) : (
          <div
            className={`role-list admin-scroll-list ${
              visibleDeletionRequests.length > 10 ? "is-scrollable" : ""
            }`}
            role={visibleDeletionRequests.length > 10 ? "region" : undefined}
            aria-label={
              visibleDeletionRequests.length > 10
                ? "退会・データ削除申請一覧"
                : undefined
            }
            tabIndex={visibleDeletionRequests.length > 10 ? 0 : undefined}
          >
            {visibleDeletionRequests.map((request) => {
              const user =
                deletionRequestUsers[request.userId] ??
                managedUsers.find((item) => item.uid === request.userId);
              const deletionTarget =
                user ??
                ({
                  uid: request.userId,
                  displayName: `ユーザー ${request.userId}`,
                  email: "",
                } as AppUser);
              return (
                <div className="review-row" key={request.userId}>
                  <AssignmentControls
                    targetType="deletion"
                    targetId={request.userId}
                  />
                  <div>
                    <strong>{deletionTarget.displayName}</strong>
                    <small>
                      {deletionTarget.email || request.userId} ·{" "}
                      {request.requestedAt
                        ? formatChatTime(request.requestedAt)
                        : "申請日時を確認中"}
                    </small>
                    <p>{request.reason}</p>
                  </div>
                  <button
                    className="danger-action"
                    type="button"
                    disabled={isLoading}
                    onClick={() =>
                      setReasonAction({
                        title: "退会申請を承認して削除",
                        description: `${deletionTarget.displayName}さんの認証アカウントと関連データを完全に削除します。この操作は元に戻せません。`,
                        label: "本人確認・対応記録",
                        placeholder:
                          "本人確認方法と、削除を実行する判断を記録してください",
                        confirmLabel: "アカウントを完全に削除",
                        danger: true,
                        action: (reason) =>
                          deleteManagedUser(
                            deletionTarget,
                            `${reason}\n本人申請: ${request.reason}`,
                          ),
                      })
                    }
                  >
                    <Trash2 size={14} />
                    削除を実行
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <QueuePagination
          label="退会申請"
          loadedCount={deletionRequests.length}
          pageSize={50}
          hasMore={hasMoreDeletionRequests}
          disabled={isLoading}
          onLoadMore={() =>
            setDeletionRequestQueryLimit((current) => current + 50)
          }
        />
      </section>
      <section className="role-card admin-report-card">
        <div className="role-card-head">
          <div>
            <p className="eyebrow">未対応</p>
            <h2>通報</h2>
          </div>
          <Flag size={20} />
        </div>
        {visiblePendingReports.length === 0 ? (
          <EmptyRoleState text="確認が必要な通報はありません。" />
        ) : (
          <div
            className={`role-list admin-scroll-list ${
              visiblePendingReports.length > 10 ? "is-scrollable" : ""
            }`}
            role={visiblePendingReports.length > 10 ? "region" : undefined}
            aria-label={
              visiblePendingReports.length > 10 ? "通報一覧" : undefined
            }
            tabIndex={visiblePendingReports.length > 10 ? 0 : undefined}
          >
            {visiblePendingReports.map((report) => (
              <div className="review-row" key={report.id}>
                <AssignmentControls targetType="report" targetId={report.id} />
                <div>
                  <strong>{report.targetTitle || "対象コンテンツ"}</strong>
                  <small>
                    {report.targetType === "event" ? "イベント" : "メッセージ"}{" "}
                    · {report.reason}
                  </small>
                  {report.description && <small>{report.description}</small>}
                </div>
                <div className="row-actions">
                  {report.targetType === "event" && (
                    <button
                      className="danger-action"
                      type="button"
                      disabled={isLoading}
                      onClick={() =>
                        setReasonAction({
                          title: "通報対象イベントを削除",
                          description: `「${report.targetTitle || "対象イベント"}」を、申請・チャットを含めて削除します。この操作は元に戻せません。`,
                          label: "削除理由・対応記録",
                          placeholder:
                            "確認した違反内容と、削除が必要な理由を入力してください",
                          confirmLabel: "イベントを削除する",
                          danger: true,
                          action: (reason) =>
                            deleteManagedEvent(
                              {
                                id: report.targetId,
                                title: report.targetTitle || "対象イベント",
                              } as AizuEvent,
                              reason,
                            ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                      対象を削除
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() =>
                      setReasonAction({
                        title: "通報を対応済みにする",
                        description: `「${report.targetTitle || "対象コンテンツ"}」の確認が完了したものとしてキューを閉じます。`,
                        label: "対応内容・記録",
                        placeholder:
                          "確認した内容と、実施した対応を入力してください",
                        confirmLabel: "対応済みにする",
                        action: (reason) =>
                          resolveReport(report, "resolved", reason),
                      })
                    }
                  >
                    対応済み
                  </button>
                  <button
                    className="muted"
                    type="button"
                    disabled={isLoading}
                    onClick={() =>
                      setReasonAction({
                        title: "問題なしとして閉じる",
                        description:
                          "この通報は対応キューから外れ、提出済みの状態には戻せません。",
                        label: "問題なしと判断した理由",
                        placeholder: "確認した事実と判断根拠を入力してください",
                        confirmLabel: "問題なしとして閉じる",
                        danger: true,
                        action: (reason) =>
                          resolveReport(report, "dismissed", reason),
                      })
                    }
                  >
                    問題なし
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <QueuePagination
          label="通報"
          loadedCount={pendingReports.length}
          pageSize={50}
          hasMore={hasMorePendingReports}
          disabled={isLoading}
          onLoadMore={() =>
            setPendingReportQueryLimit((current) => current + 50)
          }
        />
      </section>
      <div className="role-grid admin-operations-grid">
        <section className="role-card">
          <div className="role-card-head">
            <div>
              <p className="eyebrow">アカウント</p>
              <h2>ユーザー管理</h2>
            </div>
            <UsersRound size={20} />
          </div>
          <div className="admin-status-tabs" aria-label="ユーザー状態">
            {(
              [
                ["active", "利用中"],
                ["suspended", "停止中"],
                ["rejected", "見送り"],
              ] as const
            ).map(([status, label]) => (
              <button
                className={managedUserStatus === status ? "active" : ""}
                type="button"
                key={status}
                onClick={() => setManagedUserStatus(status)}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className={`role-list admin-compact-list admin-scroll-list ${
              visibleManagedUsers.length > 10 ? "is-scrollable" : ""
            }`}
            role={visibleManagedUsers.length > 10 ? "region" : undefined}
            aria-label={
              visibleManagedUsers.length > 10 ? "ユーザー管理一覧" : undefined
            }
            tabIndex={visibleManagedUsers.length > 10 ? 0 : undefined}
          >
            {visibleManagedUsers.length === 0 ? (
              <EmptyRoleState text="条件に合うユーザーはいません。" />
            ) : (
              visibleManagedUsers.map((user) => (
                <div className="review-row" key={user.uid}>
                  <div>
                    <strong>{user.displayName}</strong>
                    <small>
                      {user.email} ·{" "}
                      {user.role === "organization" ? "団体" : "学生"}
                    </small>
                    {(user.moderationReason || user.reviewReason) && (
                      <small>
                        理由: {user.moderationReason || user.reviewReason}
                      </small>
                    )}
                  </div>
                  <div className="row-actions">
                    {user.status === "active" ? (
                      <button
                        className="muted"
                        type="button"
                        disabled={isLoading}
                        onClick={() =>
                          setReasonAction({
                            title: "アカウントを停止",
                            description: `${user.displayName}さんの利用を停止します。`,
                            label: "停止理由",
                            placeholder:
                              "違反内容、確認事項、復旧条件を入力してください",
                            confirmLabel: "利用を停止する",
                            danger: true,
                            action: (reason) =>
                              updateManagedUserStatus(
                                user,
                                "suspended",
                                reason,
                              ),
                          })
                        }
                      >
                        停止
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() =>
                          setReasonAction({
                            title: "アカウントを復旧",
                            description: `${user.displayName}さんの利用を再開します。`,
                            label: "復旧理由",
                            placeholder:
                              "確認済みの内容と、復旧可能と判断した理由を入力してください",
                            confirmLabel: "利用を再開する",
                            action: (reason) =>
                              updateManagedUserStatus(user, "active", reason),
                          })
                        }
                      >
                        復旧
                      </button>
                    )}
                    <button
                      className="danger-action"
                      type="button"
                      disabled={isLoading}
                      onClick={() =>
                        setReasonAction({
                          title: "ユーザーを完全に削除",
                          description: `${user.displayName}さんの認証アカウント、参加申請、チャット、プロフィールを削除します。この操作は元に戻せません。`,
                          label: "削除理由・対応記録",
                          placeholder:
                            "削除が必要な理由と、事前に確認した内容を入力してください",
                          confirmLabel: "ユーザーを削除する",
                          danger: true,
                          action: (reason) => deleteManagedUser(user, reason),
                        })
                      }
                    >
                      <Trash2 size={14} />
                      削除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {hasMoreManagedUsers && (
            <button
              className="admin-load-more"
              type="button"
              disabled={isLoading}
              onClick={() =>
                setManagedUserQueryLimit((current) => current + 50)
              }
            >
              さらに50件読み込む
            </button>
          )}
        </section>
        <section className="role-card">
          <div className="role-card-head">
            <div>
              <p className="eyebrow">イベント</p>
              <h2>公開中のイベント</h2>
            </div>
            <CalendarDays size={20} />
          </div>
          <div
            className={`role-list admin-compact-list admin-scroll-list ${
              visibleManagedEvents.length > 10 ? "is-scrollable" : ""
            }`}
            role={visibleManagedEvents.length > 10 ? "region" : undefined}
            aria-label={
              visibleManagedEvents.length > 10
                ? "公開イベント管理一覧"
                : undefined
            }
            tabIndex={visibleManagedEvents.length > 10 ? 0 : undefined}
          >
            {visibleManagedEvents.length === 0 ? (
              <EmptyRoleState text="管理対象のイベントはありません。" />
            ) : (
              visibleManagedEvents.map((event) => (
                <div className="review-row" key={event.id}>
                  <div>
                    <strong>{event.title}</strong>
                    <small>
                      {event.organizationName} ·{" "}
                      {event.status === "published" ? "公開中" : "非公開"}
                    </small>
                    {event.moderationReason && (
                      <small>理由: {event.moderationReason}</small>
                    )}
                  </div>
                  <div className="row-actions">
                    <button
                      className={event.status === "published" ? "muted" : ""}
                      type="button"
                      disabled={isLoading}
                      onClick={() =>
                        setReasonAction({
                          title:
                            event.status === "published"
                              ? "イベントを非公開"
                              : "イベントを再公開",
                          description: `「${event.title}」の公開状態を変更します。`,
                          label:
                            event.status === "published"
                              ? "非公開にする理由"
                              : "再公開する理由",
                          placeholder:
                            event.status === "published"
                              ? "安全確認の内容と主催者への案内を入力してください"
                              : "修正・確認済みの内容を入力してください",
                          confirmLabel:
                            event.status === "published"
                              ? "非公開にする"
                              : "再公開する",
                          danger: event.status === "published",
                          action: (reason) =>
                            updateManagedEventStatus(
                              event,
                              event.status === "published"
                                ? "unpublished"
                                : "published",
                              reason,
                            ),
                        })
                      }
                    >
                      {event.status === "published" ? "非公開" : "再公開"}
                    </button>
                    <button
                      className="danger-action"
                      type="button"
                      disabled={isLoading}
                      onClick={() =>
                        setReasonAction({
                          title: "イベントを完全に削除",
                          description: `「${event.title}」と参加申請・チャットを削除します。この操作は元に戻せません。`,
                          label: "削除理由・対応記録",
                          placeholder:
                            "違反内容や削除依頼など、削除が必要な理由を入力してください",
                          confirmLabel: "イベントを削除する",
                          danger: true,
                          action: (reason) => deleteManagedEvent(event, reason),
                        })
                      }
                    >
                      <Trash2 size={14} />
                      削除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {hasMoreManagedEvents && (
            <button
              className="admin-load-more"
              type="button"
              disabled={isLoading}
              onClick={() =>
                setManagedEventQueryLimit((current) => current + 50)
              }
            >
              さらに50件読み込む
            </button>
          )}
        </section>
      </div>
      <section className="role-card audit-log-card">
        <div className="role-card-head">
          <div>
            <p className="eyebrow">記録</p>
            <h2>操作履歴</h2>
          </div>
          <History size={20} />
        </div>
        {auditLogs.length === 0 ? (
          <EmptyRoleState text="管理操作を行うと、理由と日時がここに残ります。" />
        ) : (
          <div
            className={`audit-log-list admin-scroll-list ${
              auditLogs.length > 10 ? "is-scrollable" : ""
            }`}
            role={auditLogs.length > 10 ? "region" : undefined}
            aria-label={auditLogs.length > 10 ? "操作履歴一覧" : undefined}
            tabIndex={auditLogs.length > 10 ? 0 : undefined}
          >
            {auditLogs.map((audit) => (
              <div key={audit.id}>
                <span>
                  <strong>{audit.targetTitle}</strong>
                  <small>
                    {audit.actorName} · {audit.action}
                  </small>
                </span>
                <p>{audit.reason}</p>
                <time>{formatChatTime(audit.createdAt)}</time>
              </div>
            ))}
          </div>
        )}
        {hasMoreAuditLogs && (
          <button
            className="admin-load-more"
            type="button"
            disabled={isLoading}
            onClick={() => setAuditLogQueryLimit((current) => current + 50)}
          >
            過去の操作履歴をさらに50件読み込む
          </button>
        )}
      </section>
      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.confirmLabel}
          danger={confirmation.danger}
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            const action = confirmation.action;
            setConfirmation(null);
            void action();
          }}
        />
      )}
      {reasonAction && (
        <ActionReasonDialog
          title={reasonAction.title}
          description={reasonAction.description}
          label={reasonAction.label}
          placeholder={reasonAction.placeholder}
          confirmLabel={reasonAction.confirmLabel}
          danger={reasonAction.danger}
          onClose={() => setReasonAction(null)}
          onConfirm={(reason) => void reasonAction.action(reason)}
        />
      )}
    </RoleShell>
  );
}
