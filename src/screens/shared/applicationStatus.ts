import type { EventApplication } from "../../types/domain";

export const applicationStatusLabel = (status: EventApplication["status"]) => {
  const labels: Record<EventApplication["status"], string> = {
    pending: "主催者確認中",
    waitlisted: "キャンセル待ち",
    confirmed: "参加確定",
    rejected: "見送り",
    attended: "出席確認済み",
    absent: "欠席扱い",
    cancelled: "キャンセル済み",
  };
  return labels[status];
};
