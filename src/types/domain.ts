import type { Timestamp } from "firebase/firestore";
import type { Filter } from "../lib/appLogic";

export type AccountStatus =
  | "active"
  | "pending_approval"
  | "pending"
  | "email_unverified"
  | "profile_incomplete"
  | "rejected"
  | "suspended";

export type Tab = "home" | "search" | "activity" | "messages" | "profile";
export type NoticeTone = "success" | "error" | "info";
export type SetNotice = (message: string, tone?: NoticeTone) => void;
export type UserRole = "student" | "organization" | "admin";
export type SearchDateFilter = "すべて" | "今週" | "今月";
export type SearchSort = "開催が近い順" | "人気順" | "新着順";
export type SearchDayFilter = "すべて" | "平日" | "土日";
export type SearchTimeFilter = "すべて" | "午前" | "午後" | "夜";
export type SearchFeeFilter = "すべて" | "無料" | "有料";
export type SearchFormatFilter =
  "すべて" | "現地" | "オンライン" | "ハイブリッド";
export type SearchView = "list" | "calendar";

export type AppUser = {
  uid: string;
  role: UserRole;
  status: AccountStatus;
  email: string | null;
  displayName: string;
  university: string;
  department: string;
  grade: number;
  interests: string[];
  currentActivities?: string;
  wantToTry?: string;
  profileImageUrl?: string;
  organizationId?: string;
  organizationName?: string;
  reviewReason?: string;
  moderationReason?: string;
  termsVersion?: string;
  privacyVersion?: string;
  legalAcceptedAt?: Timestamp;
  eligibilityConfirmedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type AizuEvent = {
  id: string;
  title: string;
  summary: string;
  category: string;
  location: string;
  startAtLabel: string;
  startAt?: Timestamp;
  endAtLabel?: string;
  endAt?: Timestamp;
  feeType?: "無料" | "有料";
  feeAmount?: number;
  commercialSellerName?: string;
  commercialSellerAddress?: string;
  commercialSellerPhone?: string;
  commercialResponsiblePerson?: string;
  paymentMethod?: string;
  paymentTiming?: string;
  additionalFees?: string;
  eventFormat?: "現地" | "オンライン" | "ハイブリッド";
  meetingPoint?: string;
  accessInfo?: string;
  bringItems?: string;
  cancellationPolicy?: string;
  weatherPolicy?: string;
  accessibility?: string;
  contactMethod?: string;
  organizationName: string;
  status:
    | "published"
    | "pending_review"
    | "revision_required"
    | "cancelled"
    | "unpublished";
  capacity: number;
  applicantCount: number;
  imageUrl: string;
  tags: string[];
  templateKey?: string;
  beginnerLevel?: "初参加歓迎" | "少し経験者向け" | "誰でも歓迎";
  takeaways?: string[];
  atmosphere?: string;
  organizerDescription?: string;
  organizerExperience?: string;
  revisionReason?: string;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  cancellationReason?: string;
  cancelledAt?: Timestamp;
  moderationReason?: string;
  organizationId?: string;
  organizationVerified?: boolean;
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type EventApplication = {
  id: string;
  eventId: string;
  eventTitle: string;
  studentId: string;
  studentName: string;
  studentProfileImageUrl?: string;
  organizationName: string;
  organizationId?: string;
  status:
    | "pending"
    | "waitlisted"
    | "confirmed"
    | "rejected"
    | "attended"
    | "absent"
    | "cancelled";
  participantMessage?: string;
  accessibilityNeeds?: string;
  emergencyContact?: string;
  consentAccepted?: boolean;
  sensitiveInfoConsent?: boolean;
  emergencyContactAuthorityConfirmed?: boolean;
  organizerNote?: string;
  waitlistPosition?: number;
  createdAt?: Timestamp;
};

export type ChatRoom = {
  id: string;
  roomType?: "application" | "event";
  applicationId: string;
  eventId: string;
  eventTitle: string;
  studentId: string;
  studentName?: string;
  organizationName: string;
  organizationId?: string;
  participantIds: string[];
  status: "active" | "read_only" | "closed";
  lastMessageText: string;
  lastMessageAt?: Timestamp;
  pinnedMessage?: string;
  organizerNotice?: string;
  updatedAt?: Timestamp;
};

export type ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  type: "text" | "system" | "image" | "file";
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  createdAt?: Timestamp;
};

export type ChatReadReceipt = {
  userId: string;
  readAt?: Timestamp;
};

export type ChatPreference = {
  userId: string;
  roomId: string;
  muted: boolean;
  updatedAt?: Timestamp;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  targetType?: string;
  targetId?: string;
  createdAt?: Timestamp;
};

export type ReportTarget = {
  targetType: "event" | "message";
  targetId: string;
  title: string;
};

export type ReportRecord = {
  id: string;
  targetType: "event" | "message" | "organization" | "user";
  targetId: string;
  targetTitle?: string;
  reason: string;
  description?: string;
  status: "submitted" | "reviewing" | "resolved" | "dismissed";
  resolution?: string;
  resolvedAt?: Timestamp;
  createdAt?: Timestamp;
};

export type ActivityRecord = {
  id: string;
  userId: string;
  eventId: string;
  title: string;
  organizationName: string;
  certificateId?: string;
  participantRole?: string;
  takeaways?: string[];
  activityYear: number;
  activityMonth: number;
  verificationStatus: "verified" | "revoked";
  createdAt?: Timestamp;
};

export type SavedSearch = {
  userId: string;
  searchText: string;
  category: Filter;
  dateFilter: SearchDateFilter;
  dayFilter: SearchDayFilter;
  timeFilter: SearchTimeFilter;
  feeFilter: SearchFeeFilter;
  formatFilter: SearchFormatFilter;
  onlyAvailable: boolean;
  onlyBeginner: boolean;
  updatedAt?: Timestamp;
};

export type PublicOrganizerProfile = {
  userId: string;
  displayName: string;
  description: string;
  experience: string;
  publishedEventCount: number;
  verified: boolean;
  updatedAt?: Timestamp;
};

export type AuditLog = {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: "event" | "user" | "report";
  targetId: string;
  targetTitle: string;
  reason: string;
  createdAt?: Timestamp;
};

export type AccountDeletionRequest = {
  userId: string;
  status: "submitted" | "cancelled";
  reason: string;
  requestedAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ApplicationDetails = {
  participantMessage: string;
  accessibilityNeeds: string;
  emergencyContact: string;
  consentAccepted: boolean;
  sensitiveInfoConsent: boolean;
  emergencyContactAuthorityConfirmed: boolean;
};

export type NotificationPreferences = {
  userId: string;
  newEvents: boolean;
  applicationUpdates: boolean;
  chatMessages: boolean;
  eventReminders: boolean;
};
