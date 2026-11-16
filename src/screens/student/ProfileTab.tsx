import {
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Heart,
  Loader2,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Field } from "../../components/Field";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ImageCropDialog } from "../../components/ImageCropDialog";
import { LegalDialog } from "../../components/LegalDialog";
import {
  NoticeBanner,
  SectionHeading,
} from "../../components/ui/AppPrimitives";
import type { LegalDocument } from "../../content/legalMetadata";
import { useNoticeState } from "../../hooks/useNoticeState";
import {
  getFirebaseErrorMessage,
  validateImageSourceFile,
} from "../../lib/appLogic";
import { indexEventsById, revokeObjectUrl } from "../../lib/eventUtils";
import type {
  AccountDeletionRequest,
  ActivityRecord,
  AizuEvent,
  AppUser,
  EventApplication,
  NotificationPreferences,
} from "../../types/domain";
import { AccountDeletionPanel } from "../shared/AccountDeletionPanel";
import { ProfileEditor } from "./ProfileEditor";

export function ProfileTab({
  appUser,
  applications,
  activities,
  activityByMonth,
  savedEventIds,
  events,
  hasMoreSavedEvents,
  notificationPreferences,
  accountDeletionRequest,
  onSaveProfile,
  onSaveNotificationPreferences,
  onRequestAccountDeletion,
  onCancelAccountDeletion,
  onOpenActivity,
  onOpenCreatorDashboard,
  onOpenSavedEvent,
  onLoadMoreSavedEvents,
  onLogout,
}: {
  appUser: AppUser;
  applications: EventApplication[];
  activities: ActivityRecord[];
  activityByMonth: { month: number; count: number }[];
  savedEventIds: string[];
  events: AizuEvent[];
  hasMoreSavedEvents: boolean;
  notificationPreferences: NotificationPreferences;
  accountDeletionRequest: AccountDeletionRequest | null;
  onSaveProfile: (
    updates: {
      displayName: string;
      department: string;
      grade: number;
      interests: string[];
      currentActivities: string;
      wantToTry: string;
      profileImageFile: File | null;
    },
    onImageUploadProgress?: (progress: number) => void,
  ) => Promise<void>;
  onSaveNotificationPreferences: (
    updates: Partial<Omit<NotificationPreferences, "userId">>,
  ) => Promise<void>;
  onRequestAccountDeletion: (reason: string) => Promise<void>;
  onCancelAccountDeletion: () => Promise<void>;
  onOpenActivity: () => void;
  onOpenCreatorDashboard: () => void;
  onOpenSavedEvent: (eventId: string) => void;
  onLoadMoreSavedEvents: () => void;
  onLogout: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDiscardConfirmationOpen, setIsDiscardConfirmationOpen] =
    useState(false);
  const [displayName, setDisplayName] = useState(appUser.displayName);
  const [department, setDepartment] = useState(appUser.department);
  const [grade, setGrade] = useState(appUser.grade);
  const [interestText, setInterestText] = useState(
    appUser.interests.join(", "),
  );
  const [currentActivities, setCurrentActivities] = useState(
    appUser.currentActivities ?? "",
  );
  const [wantToTry, setWantToTry] = useState(appUser.wantToTry ?? "");
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(
    appUser.profileImageUrl ?? null,
  );
  const [profileImageSourceFile, setProfileImageSourceFile] =
    useState<File | null>(null);
  const [profileImageSourcePreview, setProfileImageSourcePreview] = useState<
    string | null
  >(null);
  const [isProfileImageReviewOpen, setIsProfileImageReviewOpen] =
    useState(false);
  const [profileImageInputKey, setProfileImageInputKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(
    null,
  );
  const [profileMessage, profileMessageTone, setProfileMessage] =
    useNoticeState();
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(
    null,
  );
  const [isNotificationSettingsOpen, setIsNotificationSettingsOpen] =
    useState(false);
  const [areAllSavedEventsVisible, setAreAllSavedEventsVisible] =
    useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const totalActivities = activityByMonth.reduce(
    (sum, item) => sum + item.count,
    0,
  );
  const earnedBadges = [
    activities.length >= 1 ? "初参加" : null,
    activities.length >= 3 ? "参加3回" : null,
    activities.length >= 5 ? "参加5回" : null,
  ].filter(Boolean) as string[];
  const profileMeta = [
    appUser.university,
    appUser.department,
    appUser.grade > 0 ? `${appUser.grade}年` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const startEditing = () => {
    revokeObjectUrl(profileImagePreview);
    revokeObjectUrl(profileImageSourcePreview);
    setDisplayName(appUser.displayName);
    setDepartment(appUser.department);
    setGrade(appUser.grade);
    setInterestText(appUser.interests.join(", "));
    setCurrentActivities(appUser.currentActivities ?? "");
    setWantToTry(appUser.wantToTry ?? "");
    setProfileImageFile(null);
    setProfileImagePreview(appUser.profileImageUrl ?? null);
    setProfileImageSourceFile(null);
    setProfileImageSourcePreview(null);
    setIsProfileImageReviewOpen(false);
    setProfileMessage("");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    revokeObjectUrl(profileImagePreview);
    revokeObjectUrl(profileImageSourcePreview);
    setProfileImageFile(null);
    setProfileImagePreview(appUser.profileImageUrl ?? null);
    setProfileImageSourceFile(null);
    setProfileImageSourcePreview(null);
    setIsProfileImageReviewOpen(false);
    setIsDiscardConfirmationOpen(false);
    setIsEditing(false);
  };

  const cancelImageReview = () => {
    setIsProfileImageReviewOpen(false);
    if (!profileImageFile) {
      revokeObjectUrl(profileImageSourcePreview);
      setProfileImageSourceFile(null);
      setProfileImageSourcePreview(null);
      setProfileImagePreview(appUser.profileImageUrl ?? null);
      setProfileImageInputKey((current) => current + 1);
    }
  };
  const hasUnsavedChanges =
    profileImageFile !== null ||
    displayName.trim() !== appUser.displayName.trim() ||
    department.trim() !== appUser.department.trim() ||
    grade !== appUser.grade ||
    JSON.stringify(
      interestText
        .split(",")
        .map((interest) => interest.trim())
        .filter(Boolean)
        .slice(0, 5),
    ) !== JSON.stringify(appUser.interests) ||
    currentActivities.trim() !== (appUser.currentActivities ?? "").trim() ||
    wantToTry.trim() !== (appUser.wantToTry ?? "").trim();
  const requestCloseEditor = () => {
    if (isSaving) return;
    if (isProfileImageReviewOpen) {
      cancelImageReview();
      return;
    }
    if (hasUnsavedChanges) setIsDiscardConfirmationOpen(true);
    else cancelEditing();
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    const interests = interestText
      .split(",")
      .map((interest) => interest.trim())
      .filter(Boolean)
      .slice(0, 5);
    setIsSaving(true);
    setImageUploadProgress(profileImageFile ? 0 : null);
    setProfileMessage("");
    try {
      await onSaveProfile(
        {
          displayName: displayName.trim().slice(0, 60) || "名前未設定",
          department: department.trim().slice(0, 80),
          grade: Math.max(0, Math.min(6, grade)),
          interests,
          currentActivities: currentActivities.trim().slice(0, 240),
          wantToTry: wantToTry.trim().slice(0, 240),
          profileImageFile,
        },
        setImageUploadProgress,
      );
      revokeObjectUrl(profileImagePreview);
      revokeObjectUrl(profileImageSourcePreview);
      setProfileImageFile(null);
      setProfileImagePreview(null);
      setProfileImageSourceFile(null);
      setProfileImageSourcePreview(null);
      setIsEditing(false);
      setProfileMessage("プロフィールを更新しました。", "success");
    } catch (error) {
      setProfileMessage(getFirebaseErrorMessage(error), "error");
    } finally {
      setIsSaving(false);
      setImageUploadProgress(null);
    }
  };

  const eventsById = useMemo(() => indexEventsById(events), [events]);
  const visibleSavedEvents = useMemo(
    () =>
      savedEventIds
        .map((eventId) => eventsById.get(eventId))
        .filter((event): event is AizuEvent => event !== undefined),
    [eventsById, savedEventIds],
  );

  return (
    <section className="tab-page profile-page">
      <div className="profile-overview">
        <div className="profile-hero">
          <div className="profile-avatar">
            {appUser.profileImageUrl ? (
              <img src={appUser.profileImageUrl} alt="プロフィール画像" />
            ) : (
              <CircleUserRound size={35} />
            )}
          </div>
          <div className="profile-copy">
            <h1>{appUser.displayName}</h1>
            {profileMeta && <p>{profileMeta}</p>}
            <div className="interest-list">
              {appUser.interests.map((interest) => (
                <span key={interest}>{interest}</span>
              ))}
            </div>
            {(appUser.currentActivities || appUser.wantToTry) && (
              <div className="profile-intentions">
                {appUser.currentActivities && (
                  <div>
                    <span>今やっていること</span>
                    <strong>{appUser.currentActivities}</strong>
                  </div>
                )}
                {appUser.wantToTry && (
                  <div>
                    <span>やってみたいこと</span>
                    <strong>{appUser.wantToTry}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="profile-edit-button"
            title="プロフィールを編集"
            type="button"
            onClick={startEditing}
          >
            <Settings size={16} />
            編集
          </button>
        </div>
        <div className="profile-stats" aria-label="活動の概要">
          <span>
            <strong>{totalActivities}</strong>
            <small>参加回数</small>
          </span>
          <span>
            <strong>{applications.length}</strong>
            <small>申請数</small>
          </span>
          <span>
            <strong>{earnedBadges.length}</strong>
            <small>バッジ</small>
          </span>
        </div>
      </div>
      {profileMessage && (
        <NoticeBanner message={profileMessage} tone={profileMessageTone} />
      )}
      {isEditing && (
        <ProfileEditor
          dirty={hasUnsavedChanges}
          onClose={requestCloseEditor}
          onSubmit={(event) => void saveProfile(event)}
        >
          <div className="profile-edit-head">
            <div>
              <h3 id="profile-edit-title">プロフィール編集</h3>
            </div>
            <div className="profile-edit-actions">
              <button
                className="secondary-action"
                type="button"
                disabled={isSaving}
                onClick={requestCloseEditor}
              >
                <ChevronLeft size={16} />
                キャンセル
              </button>
              <button
                className="primary-action"
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 size={17} className="spin" />
                ) : (
                  <Check size={17} />
                )}
                保存
              </button>
            </div>
          </div>
          <div
            className="field"
            role="group"
            aria-labelledby="profile-image-field-label"
          >
            <span id="profile-image-field-label">プロフィール画像</span>
            <div className="image-picker">
              <div className="profile-image-preview">
                {profileImagePreview ? (
                  <img
                    src={profileImagePreview}
                    alt="プロフィール画像のプレビュー"
                  />
                ) : (
                  <CircleUserRound size={27} />
                )}
              </div>
              {profileImageFile && profileImageSourceFile && (
                <button
                  className="image-recrop-button"
                  type="button"
                  onClick={() => setIsProfileImageReviewOpen(true)}
                >
                  元の写真から再調整
                </button>
              )}
              <input
                key={profileImageInputKey}
                type="file"
                aria-label="プロフィール画像"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    validateImageSourceFile(file, "プロフィール画像");
                    revokeObjectUrl(profileImagePreview);
                    revokeObjectUrl(profileImageSourcePreview);
                    const sourcePreview = URL.createObjectURL(file);
                    setProfileImageSourceFile(file);
                    setProfileImageSourcePreview(sourcePreview);
                    setProfileImageFile(null);
                    setProfileImagePreview(sourcePreview);
                    setProfileMessage("");
                    setIsProfileImageReviewOpen(true);
                  } catch (error) {
                    setProfileMessage(getFirebaseErrorMessage(error), "error");
                    event.target.value = "";
                  }
                }}
              />
              <small>JPEG・PNG・WebP / 20MB未満（保存時に自動圧縮）</small>
            </div>
          </div>
          {isSaving && imageUploadProgress !== null && (
            <div className="image-upload-progress" role="status">
              <span>プロフィール画像を送信中</span>
              <strong>{imageUploadProgress}%</strong>
              <progress
                max={100}
                value={imageUploadProgress}
                aria-label="プロフィール画像の送信進捗"
              />
            </div>
          )}
          <Field label="表示名">
            <input
              value={displayName}
              maxLength={60}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="学科">
              <input
                value={department}
                maxLength={80}
                onChange={(event) => setDepartment(event.target.value)}
              />
            </Field>
            <Field label="学年">
              <input
                type="number"
                min={0}
                max={6}
                value={grade > 0 ? grade : ""}
                onChange={(event) => setGrade(Number(event.target.value))}
              />
            </Field>
          </div>
          <Field label="興味分野（カンマ区切り）">
            <input
              value={interestText}
              maxLength={200}
              onChange={(event) => setInterestText(event.target.value)}
            />
          </Field>
          <Field label="今やっていること（任意）">
            <textarea
              value={currentActivities}
              maxLength={240}
              placeholder="例：学生団体の運営、英語の勉強"
              onChange={(event) => setCurrentActivities(event.target.value)}
            />
          </Field>
          <Field label="やってみたいこと（任意）">
            <textarea
              value={wantToTry}
              maxLength={240}
              placeholder="例：地域イベントの運営、ものづくり"
              onChange={(event) => setWantToTry(event.target.value)}
            />
          </Field>
        </ProfileEditor>
      )}
      {isDiscardConfirmationOpen && (
        <ConfirmDialog
          title="変更を破棄しますか？"
          description="保存していないプロフィールの変更があります。"
          confirmLabel="変更を破棄する"
          danger
          onClose={() => setIsDiscardConfirmationOpen(false)}
          onConfirm={cancelEditing}
        />
      )}
      {isProfileImageReviewOpen &&
        profileImageSourcePreview &&
        profileImageSourceFile && (
          <ImageCropDialog
            title="プロフィール画像の範囲を調整"
            imageUrl={profileImageSourcePreview}
            imageFile={profileImageSourceFile}
            alt="プロフィール画像の確認用プレビュー"
            aspect={1}
            circular
            maxOutputWidth={1024}
            onCancel={cancelImageReview}
            onConfirm={(file, previewUrl) => {
              if (profileImagePreview !== profileImageSourcePreview) {
                revokeObjectUrl(profileImagePreview);
              }
              setProfileImageFile(file);
              setProfileImagePreview(previewUrl);
              setIsProfileImageReviewOpen(false);
            }}
          />
        )}
      <details className="profile-section profile-activity-section">
        <summary>
          <span>月別の活動実績</span>
          <ChevronDown size={18} />
        </summary>
        <div className="profile-activity-content">
          <SectionHeading
            title="活動実績"
            action="詳しく見る"
            onClick={onOpenActivity}
          />
          <div className="mini-month-grid">
            {activityByMonth.map((item) => (
              <div
                className={`mini-month level-${Math.min(item.count, 3)}`}
                key={item.month}
              >
                <span>{item.month}月</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </div>
      </details>
      <div className="profile-section saved-events-section">
        <SectionHeading title="保存したイベント" />
        {visibleSavedEvents.length === 0 ? (
          <div className="empty-inline">
            <Heart size={22} />
            <p>
              {savedEventIds.length === 0
                ? "保存したイベントはありません。"
                : "保存したイベントは現在公開されていません。"}
            </p>
          </div>
        ) : (
          <div className="saved-event-list">
            {(areAllSavedEventsVisible
              ? visibleSavedEvents
              : visibleSavedEvents.slice(0, 3)
            ).map((event) => (
              <button
                className="saved-event-item"
                key={event.id}
                type="button"
                onClick={() => onOpenSavedEvent(event.id)}
              >
                <img
                  src={event.imageUrl}
                  alt={`${event.title}の画像`}
                  loading="lazy"
                />
                <span>
                  <strong>{event.title}</strong>
                  <small>
                    {event.startAtLabel} · {event.location}
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
            {visibleSavedEvents.length > 3 && (
              <button
                className="saved-events-toggle"
                type="button"
                aria-expanded={areAllSavedEventsVisible}
                onClick={() =>
                  setAreAllSavedEventsVisible((current) => !current)
                }
              >
                {areAllSavedEventsVisible
                  ? "表示を少なくする"
                  : `保存した${visibleSavedEvents.length}件をすべて見る`}
                <ChevronDown size={16} />
              </button>
            )}
            {hasMoreSavedEvents &&
              (areAllSavedEventsVisible || visibleSavedEvents.length <= 3) && (
                <button
                  className="secondary-action"
                  type="button"
                  onClick={onLoadMoreSavedEvents}
                >
                  保存したイベントをさらに読み込む
                </button>
              )}
          </div>
        )}
      </div>
      <div className="settings-list">
        <button
          className="settings-row"
          type="button"
          onClick={() => setIsNotificationSettingsOpen((current) => !current)}
        >
          <div className="settings-icon">
            <Bell size={18} />
          </div>
          <span>
            <strong>通知設定</strong>
          </span>
          <ChevronRight
            size={17}
            className={isNotificationSettingsOpen ? "rotate-90" : ""}
          />
        </button>
        {isNotificationSettingsOpen && (
          <div className="notification-settings-panel">
            {(
              [
                ["newEvents", "新着イベント"],
                ["applicationUpdates", "申請状況の更新"],
                ["chatMessages", "メッセージ"],
                ["eventReminders", "開催前のリマインド"],
              ] as const
            ).map(([key, label]) => (
              <label className="preference-row" key={key}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={notificationPreferences[key]}
                  disabled={isSavingNotifications}
                  onChange={async (event) => {
                    setIsSavingNotifications(true);
                    try {
                      await onSaveNotificationPreferences({
                        [key]: event.target.checked,
                      });
                    } catch (error) {
                      setProfileMessage(
                        getFirebaseErrorMessage(error),
                        "error",
                      );
                    } finally {
                      setIsSavingNotifications(false);
                    }
                  }}
                />
              </label>
            ))}
          </div>
        )}
        <button
          className="settings-row"
          type="button"
          onClick={onOpenCreatorDashboard}
        >
          <div className="settings-icon">
            <Plus size={18} />
          </div>
          <span>
            <strong>イベントを企画する</strong>
          </span>
          <ChevronRight size={17} />
        </button>
        <button
          className="settings-row"
          type="button"
          onClick={() => setLegalDocument("terms")}
        >
          <div className="settings-icon">
            <ShieldCheck size={18} />
          </div>
          <span>
            <strong>利用規約</strong>
          </span>
          <ChevronRight size={17} />
        </button>
        <button
          className="settings-row"
          type="button"
          onClick={() => setLegalDocument("privacy")}
        >
          <div className="settings-icon">
            <ShieldCheck size={18} />
          </div>
          <span>
            <strong>プライバシーポリシー</strong>
          </span>
          <ChevronRight size={17} />
        </button>
        <button className="settings-row" type="button" onClick={onLogout}>
          <div className="settings-icon">
            <LogOut size={18} />
          </div>
          <span>
            <strong>ログアウト</strong>
          </span>
          <ChevronRight size={17} />
        </button>
      </div>
      <AccountDeletionPanel
        request={accountDeletionRequest}
        onRequest={onRequestAccountDeletion}
        onCancel={onCancelAccountDeletion}
      />
      {legalDocument && (
        <LegalDialog
          document={legalDocument}
          onClose={() => setLegalDocument(null)}
        />
      )}
    </section>
  );
}
