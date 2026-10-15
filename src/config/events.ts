import communityEventImage from "../assets/event-community.svg?no-inline";
import learningEventImage from "../assets/event-learning.svg?no-inline";
import volunteerEventImage from "../assets/event-volunteer.svg?no-inline";
import type { Tab } from "../types/domain";

export const EVENT_PAGE_SIZE = 24;

export const tabLabels: Record<Tab, string> = {
  home: "ホーム",
  search: "イベントを探す",
  activity: "活動",
  messages: "メッセージ",
  profile: "プロフィール",
};

export const eventTemplates = [
  {
    key: "交流会",
    label: "交流会",
    category: "交流・コミュニティ",
    title: "学生と地域の交流会",
    summary:
      "初めての人も参加しやすい少人数の交流会です。会津で活動する人と話し、地域の取り組みを知ることができます。",
    takeaways: ["地域の人とつながる", "話すきっかけを作る", "地域の活動を知る"],
    beginnerLevel: "初参加歓迎" as const,
    imageUrl: communityEventImage,
  },
  {
    key: "勉強会",
    label: "勉強会",
    category: "学び・制作",
    title: "はじめての学び合い会",
    summary:
      "テーマに興味がある人が集まり、短いインプットと作業時間で学びを形にするイベントです。",
    takeaways: [
      "新しいテーマを学ぶ",
      "小さな成果物を作る",
      "一緒に学ぶ仲間を見つける",
    ],
    beginnerLevel: "誰でも歓迎" as const,
    imageUrl: learningEventImage,
  },
  {
    key: "ボランティア",
    label: "地域ボランティア",
    category: "ボランティア",
    title: "地域を手伝うボランティア",
    summary:
      "地域の現場でできることを一緒に手伝い、活動後に振り返りまで行うイベントです。",
    takeaways: ["地域課題を知る", "現場で動く経験を得る", "活動実績として残す"],
    beginnerLevel: "初参加歓迎" as const,
    imageUrl: volunteerEventImage,
  },
] as const;

export const defaultTakeaways = [
  "地域とつながる",
  "初めてのことを体験する",
  "活動実績として残す",
];
