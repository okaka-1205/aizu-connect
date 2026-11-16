import { Timestamp } from "firebase/firestore";
import { createRoot } from "react-dom/client";
import { useRef, useState } from "react";
import "../../src/index.css";
import eventImage from "../../src/assets/event-community.svg?no-inline";
import { EventDrawer } from "../../src/screens/shared/EventDrawer";
import { NotificationPanel } from "../../src/screens/shared/StudentOverlays";
import { MessagesTab } from "../../src/screens/shared/MessagesTab";
import { ActivityTab } from "../../src/screens/student/ActivityTab";
import { NoticeBanner } from "../../src/components/ui/AppPrimitives";
import type {
  AizuEvent,
  ChatMessage,
  ChatRoom,
  EventApplication,
  NotificationItem,
} from "../../src/types/domain";

const sampleEvent: AizuEvent = {
  id: "experience-event",
  title: "地域の人と一緒につくる、はじめての交流イベント",
  summary: "地域で活動する仲間と交流しながら、ものづくりを体験します。".repeat(
    6,
  ),
  category: "交流・コミュニティ",
  location: "会津若松市・地域交流センター",
  startAtLabel: "2026/11/20(金) 10:00",
  endAtLabel: "12:00",
  organizationName: "地域交流チーム",
  status: "published",
  capacity: 20,
  applicantCount: 7,
  imageUrl: eventImage,
  tags: ["地域交流", "ものづくり"],
  accessInfo: "会津若松駅から徒歩10分。会場入口でスタッフが案内します。",
  bringItems: "動きやすい服装、飲み物、筆記用具",
};

const statuses: EventApplication["status"][] = [
  "pending",
  "waitlisted",
  "confirmed",
  "attended",
  "cancelled",
  "rejected",
  "absent",
];
const sampleApplications: EventApplication[] = statuses.map((status) => ({
  id: status,
  eventId: `event-${status}`,
  eventTitle: `確認用イベント ${status}`,
  studentId: "student",
  studentName: "学生",
  organizationName: "地域交流チーム",
  status,
  eventEndAt: Timestamp.fromMillis(1),
}));

const sampleRooms: ChatRoom[] = ["ものづくり体験", "地域の交流会"].map(
  (title, index) => ({
    id: `room-${index}`,
    roomType: "event",
    applicationId: "application",
    eventId: `event-${index}`,
    eventTitle: title,
    studentId: "student",
    organizationName: "地域交流チーム",
    status: "active",
    lastMessageText: "当日の集合場所をお知らせします。",
    pinnedMessage: "会場入口で受付を済ませてから集合してください。",
    organizerNotice: "当日の変更は、このチャットからお知らせします。",
  }),
);

export function Harness() {
  const screen = new URLSearchParams(location.search).get("screen");
  const [applications, setApplications] = useState(sampleApplications);
  const [notificationOpen, setNotificationOpen] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: "unread",
      title:
        "集合場所と当日の持ち物が変更になりました。参加前に必ずこちらのお知らせをご確認ください。",
      body: "会場は駅前の地域交流センターです。",
      type: "event",
      isRead: false,
      createdAt: Timestamp.now(),
    },
    {
      id: "read",
      title: "参加申請を受け付けました",
      body: "主催者が申請内容を確認しています。",
      type: "application",
      isRead: true,
      createdAt: Timestamp.fromMillis(1),
    },
  ]);
  const trigger = useRef<HTMLButtonElement>(null);
  const [outsideCount, setOutsideCount] = useState(0);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <strong>Aizu Connect</strong>
        </div>
      </header>
      <main className="app-content">
        {screen === "chat" &&
          new URLSearchParams(location.search).has("notice") && (
            <NoticeBanner
              message="参加申請を送信しました。全体チャットを確認できます。"
              tone="success"
            />
          )}
        {screen === "detail" && (
          <EventDrawer
            event={sampleEvent}
            applied={false}
            isLoading={false}
            onApply={() => undefined}
            onReport={() => undefined}
            onClose={() => history.back()}
          />
        )}
        {screen === "activity" && (
          <ActivityTab
            applications={applications}
            activities={[
              {
                id: "certificate",
                userId: "student",
                eventId: "event-attended",
                title: "証明済みの地域交流会",
                organizationName: "地域交流チーム",
                certificateId: "AC-UI-CHECK",
                activityYear: 2026,
                activityMonth: 11,
                verificationStatus: "verified",
              },
            ]}
            activityYear={2026}
            activityByMonth={Array.from({ length: 12 }, (_, index) => ({
              month: index + 1,
              count: index === 10 ? 1 : 0,
            }))}
            events={[]}
            userName="学生"
            setSelectedEventId={() => undefined}
            setActiveTab={() => undefined}
            onOpenMessages={() => undefined}
            onCancelApplication={() => undefined}
            onCheckIn={async (application) => {
              setApplications((current) =>
                current.map((item) =>
                  item.id === application.id
                    ? { ...item, status: "attended" }
                    : item,
                ),
              );
            }}
          />
        )}
        {screen === "notifications" && (
          <>
            <button
              ref={trigger}
              className="secondary-action"
              aria-controls="notification-panel"
              aria-expanded={notificationOpen}
              onClick={() => setNotificationOpen((current) => !current)}
            >
              通知を開く
            </button>
            <button
              className="secondary-action outside-notification"
              style={{ position: "fixed", bottom: 100, left: 16 }}
              onClick={() => setOutsideCount((count) => count + 1)}
            >
              通知の外側
            </button>
            <output aria-label="外側の操作回数">{outsideCount}</output>
            <input
              aria-label="通知の外で検索"
              style={{
                position: "fixed",
                bottom: 160,
                left: 16,
                width: 220,
                height: 44,
              }}
            />
            {notificationOpen && (
              <NotificationPanel
                notifications={notifications}
                hasMore
                onLoadMore={() => undefined}
                onClose={(restoreFocus = true) => {
                  setNotificationOpen(false);
                  if (restoreFocus)
                    requestAnimationFrame(() => trigger.current?.focus());
                }}
                onRead={async (notification) => {
                  setNotifications((current) =>
                    current.map((item) =>
                      item.id === notification.id
                        ? { ...item, isRead: true }
                        : item,
                    ),
                  );
                }}
                onReadAll={async () => {
                  await new Promise((resolve) => setTimeout(resolve, 250));
                  setNotifications((current) =>
                    current.map((item) => ({ ...item, isRead: true })),
                  );
                }}
              />
            )}
          </>
        )}
        {screen === "chat" && (
          <MessagesTab
            rooms={sampleRooms}
            activeRoomId={activeRoom}
            messages={messages}
            draft={draft}
            currentUserId="student"
            currentUserRole="student"
            onSelectRoom={setActiveRoom}
            onCloseRoom={() => setActiveRoom(null)}
            onOpenActivity={() => undefined}
            onDraftChange={setDraft}
            onSend={() => {
              if (!draft.trim()) return;
              setMessages((current) => [
                ...current,
                {
                  id: `message-${current.length}`,
                  roomId: activeRoom!,
                  senderId: "student",
                  senderName: "学生",
                  type: "text",
                  text: draft,
                },
              ]);
              setDraft("");
            }}
          />
        )}
      </main>
      <nav className="bottom-nav" aria-label="メインナビゲーション">
        {["ホーム", "探す", "活動", "メッセージ", "プロフィール"].map(
          (label) => (
            <button className="tab-button" key={label}>
              {label}
            </button>
          ),
        )}
      </nav>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Harness />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
