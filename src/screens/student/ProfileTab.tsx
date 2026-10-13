import {
  Bell,
  Check,
  ChevronRight,
  CircleUserRound,
  Heart,
  Loader2,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Field } from "../../components/Field";
import { ImageCropDialog } from "../../components/ImageCropDialog";
import { LegalDialog } from "../../components/LegalDialog";
import {
  NoticeBanner,
  SectionHeading,
} from "../../components/ui/AppPrimitives";
import type { LegalDocument } from "../../content/legalDocuments";
import { useNoticeState } from "../../hooks/useNoticeState";
import { getFirebaseErrorMessage, validateImageFile } from "../../lib/appLogic";
import { revokeObjectUrl } from "../../lib/eventUtils";
import type {
  AccountDeletionRequest,
  ActivityRecord,
  AizuEvent,
  AppUser,
  EventApplication,
  NotificationPreferences,
} from "../../types/domain";
import { AccountDeletionPanel } from "../shared/AccountDeletionPanel";

export function ProfileTab({
  appUser,
  applications,
  activities,
  activityByMonth,
  savedEventIds,
  events,
  notificationPreferences,
  accountDeletionRequest,
  onSaveProfile,
  onSaveNotificationPreferences,
  onRequestAccountDeletion,
  onCancelAccountDeletion,
  onOpenActivity,
  onOpenCreatorDashboard,
  onOpenSavedEvent,
  onLogout,
}: {
  appUser: AppUser;
  applications: EventApplication[];
  activities: ActivityRecord[];
  activityByMonth: { month: number; count: number }[];
  savedEventIds: string[];
  events: AizuEvent[];
  notificationPreferences: NotificationPreferences;
  accountDeletionRequest: AccountDeletionRequest | null;
  onSaveProfile: (updates: {
    displayName: string;
    department: string;
    grade: number;
    interests: string[];
    currentActivities: string;
    wantToTry: string;
    profileImageFile: File | null;
  }) => Promise<void>;
  onSaveNotificationPreferences: (
    updates: Partial<Omit<NotificationPreferences, "userId">>,
  ) => Promise<void>;
  onRequestAccountDeletion: (reason: string) => Promise<void>;
  onCancelAccountDeletion: () => Promise<void>;
  onOpenActivity: () => void;
  onOpenCreatorDashboard: () => void;
  onOpenSavedEvent: (eventId: string) => void;
  onLogout: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
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
  const [isProfileImageReviewOpen, setIsProfileImageReviewOpen] =
    useState(false);
  const [profileImageInputKey, setProfileImageInputKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [profileMessage, profileMessageTone, setProfileMessage] =
    useNoticeState();
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(
    null,
  );
  const [isNotificationSettingsOpen, setIsNotificationSettingsOpen] =
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
    setDisplayName(appUser.displayName);
    setDepartment(appUser.department);
    setGrade(appUser.grade);
    setInterestText(appUser.interests.join(", "));
    setCurrentActivities(appUser.currentActivities ?? "");
    setWantToTry(appUser.wantToTry ?? "");
    setProfileImageFile(null);
    setProfileImagePreview(appUser.profileImageUrl ?? null);
    setIsProfileImageReviewOpen(false);
    setProfileMessage("");
    setIsEditing(true);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const interests = interestText
      .split(",")
      .map((interest) => interest.trim())
      .filter(Boolean)
      .slice(0, 5);
    setIsSaving(true);
    setProfileMessage("");
    try {
      await onSaveProfile({
        displayName: displayName.trim().slice(0, 60) || "名前未設定",
        department: department.trim().slice(0, 80),
        grade: Math.max(0, Math.min(6, grade)),
        interests,
        currentActivities: currentActivities.trim().slice(0, 240),
        wantToTry: wantToTry.trim().slice(0, 240),
        profileImageFile,
      });
      revokeObjectUrl(profileImagePreview);
      setProfileImageFile(null);
      setProfileImagePreview(null);
      setIsEditing(false);
      setProfileMessage("プロフィールを更新しました。", "success");
    } catch (error) {
      setProfileMessage(getFirebaseErrorMessage(error), "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="tab-page">
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
          <p>{profileMeta || "プロフィール未設定"}</p>
          <div className="interest-list">
            {appUser.interests.map((interest) => (
              <span key={interest}>{interest}</span>
            ))}
          </div>
          <div className="profile-intentions">
            <div>
              <span>今やっていること</span>
              <strong>{appUser.currentActivities || "これから見つける"}</strong>
            </div>
            <div>
              <span>やってみたいこと</span>
              <strong>{appUser.wantToTry || "気になる活動を探してみる"}</strong>
            </div>
          </div>
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
      {profileMessage && (
        <NoticeBanner message={profileMessage} tone={profileMessageTone} />
      )}
      {isEditing && (
        <form
          className="profile-edit-panel"
          onSubmit={(event) => void saveProfile(event)}
        >
          <div className="profile-edit-head">
            <div>
              <p className="eyebrow">編集</p>
              <h3>プロフィール編集</h3>
            </div>
            <button
              className="icon-button"
              title="閉じる"
              type="button"
              onClick={() => {
                revokeObjectUrl(profileImagePreview);
                setProfileImageFile(null);
                setProfileImagePreview(appUser.profileImageUrl ?? null);
                setIsProfileImageReviewOpen(false);
                setIsEditing(false);
              }}
            >
              <X size={17} />
            </button>
          </div>
          <Field label="プロフィール画像">
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
              <input
                key={profileImageInputKey}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    validateImageFile(file, "プロフィール画像");
                    revokeObjectUrl(profileImagePreview);
                    setProfileImageFile(file);
                    setProfileImagePreview(URL.createObjectURL(file));
                    setProfileMessage("");
                    setIsProfileImageReviewOpen(true);
                  } catch (error) {
                    setProfileMessage(getFirebaseErrorMessage(error), "error");
                    event.target.value = "";
                  }
                }}
              />
              <small>JPEG・PNG・WebP / 5MB未満</small>
            </div>
          </Field>
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
          <button className="primary-action" type="submit" disabled={isSaving}>
            {isSaving ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <Check size={17} />
            )}
            保存する
          </button>
        </form>
      )}
      {isProfileImageReviewOpen && profileImagePreview && profileImageFile && (
        <ImageCropDialog
          title="プロフィール画像の範囲を調整"
          imageUrl={profileImagePreview}
          imageFile={profileImageFile}
          alt="プロフィール画像の確認用プレビュー"
          aspect={1}
          circular
          maxOutputWidth={1024}
          onCancel={() => {
            revokeObjectUrl(profileImagePreview);
            setIsProfileImageReviewOpen(false);
            setProfileImageFile(null);
            setProfileImagePreview(appUser.profileImageUrl ?? null);
            setProfileImageInputKey((current) => current + 1);
          }}
          onConfirm={(file, previewUrl) => {
            revokeObjectUrl(profileImagePreview);
            setProfileImageFile(file);
            setProfileImagePreview(previewUrl);
            setIsProfileImageReviewOpen(false);
          }}
        />
      )}
      <div className="profile-stats">
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
      <div className="profile-section">
        <SectionHeading
          eyebrow="参加履歴"
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
      <div className="profile-section saved-events-section">
        <SectionHeading eyebrow="保存済み" title="保存したイベント" />
        {savedEventIds.length === 0 ? (
          <div className="empty-inline">
            <Heart size={22} />
            <p>気になるイベントを保存すると、ここからすぐ開けます。</p>
          </div>
        ) : (
          <div className="saved-event-list">
            {savedEventIds.map((eventId) => {
              const event = events.find((item) => item.id === eventId);
              if (!event) return null;
              return (
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
              );
            })}
          </div>
        )}
      </div>
      <div className="settings-list">
        <div>
          <div className="settings-icon">
            <ShieldCheck size={18} />
          </div>
          <span>
            <strong>学生確認済み</strong>
            <small>会津大学メールで確認しています</small>
          </span>
          <Check size={17} />
        </div>
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
            <small>新着イベントを受け取る</small>
          </span>
          <ChevronRight
            size={17}
            className={isNotificationSettingsOpen ? "rotate-90" : ""}
          />
        </button>
        {isNotificationSettingsOpen && (
          <div className="notification-settings-panel">
            <div>
              <strong>通知を受け取る</strong>
              <small>新着・申請・メッセージの通知を管理します。</small>
            </div>
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
            <small>企画申請と参加者管理を開く</small>
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
            <small>サービスの利用条件を確認する</small>
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
            <small>個人情報の取り扱いを確認する</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <div>
          <div className="settings-icon">
            <LogOut size={18} />
          </div>
          <button type="button" onClick={onLogout}>
            <strong>ログアウト</strong>
            <small>この端末からログアウト</small>
          </button>
          <ChevronRight size={17} />
        </div>
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
