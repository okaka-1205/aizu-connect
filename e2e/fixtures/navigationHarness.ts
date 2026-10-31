import { createElement, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { useStudentNavigation } from "../../src/hooks/useStudentNavigation";
import type { AizuEvent } from "../../src/types/domain";

const example: AizuEvent = {
  id: "navigation-example",
  title: "一覧更新の確認用イベント",
  summary: "URLと選択状態の確認",
  category: "地域活動",
  location: "会津若松市",
  startAtLabel: "日時未設定",
  organizationName: "確認用主催者",
  status: "published",
  capacity: 1,
  applicantCount: 0,
  imageUrl: "",
  tags: [],
};

function NavigationHarness() {
  const [events, setEvents] = useState([example]);
  const { selectedEventId, setSelectedEventId } = useStudentNavigation(events);
  const closeAndRefresh = (value: "" | null) => {
    setSelectedEventId(value);
    setEvents((current) => [...current]);
  };
  return createElement(
    "main",
    null,
    createElement(
      "output",
      { "aria-label": "選択イベント" },
      selectedEventId || "閉じた状態",
    ),
    createElement(
      "button",
      { onClick: () => closeAndRefresh("") },
      "空文字で閉じて一覧更新",
    ),
    createElement(
      "button",
      { onClick: () => closeAndRefresh(null) },
      "nullで閉じて一覧更新",
    ),
    createElement(
      "button",
      { onClick: () => setSelectedEventId(example.id) },
      "イベントを開く",
    ),
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Navigation test root is missing");
createRoot(container).render(
  createElement(StrictMode, null, createElement(NavigationHarness)),
);
