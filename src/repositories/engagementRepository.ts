import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import type { AdminAssignment, EventReport } from "../types/domain";

export const saveEventSurvey = (
  userId: string,
  eventId: string,
  rating: number,
  comment: string,
  wouldRecommend: boolean,
) =>
  setDoc(
    doc(db, "eventSurveys", eventId, "responses", userId),
    {
      eventId,
      userId,
      rating: Math.max(1, Math.min(5, Math.round(rating))),
      comment: comment.trim().slice(0, 1000),
      wouldRecommend,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

export const saveUserBlock = (
  blockerId: string,
  blockedId: string,
  reason = "",
) =>
  setDoc(doc(db, "userBlocks", `${blockerId}_${blockedId}`), {
    blockerId,
    blockedId,
    reason: reason.trim().slice(0, 300),
    createdAt: serverTimestamp(),
  });

export const editChatMessage = async (
  roomId: string,
  messageId: string,
  nextText: string,
) => {
  const manage = httpsCallable(functions, "manageChatMessage");
  await manage({ roomId, messageId, action: "edit", text: nextText });
};

export const deleteChatMessage = async (
  roomId: string,
  messageId: string,
) => {
  const manage = httpsCallable(functions, "manageChatMessage");
  await manage({ roomId, messageId, action: "delete" });
};

export const saveEventReport = (
  report: Omit<EventReport, "createdAt" | "updatedAt" | "publishedAt">,
) =>
  setDoc(
    doc(db, "eventReports", report.eventId),
    {
      ...report,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(report.status === "published"
        ? { publishedAt: serverTimestamp() }
        : {}),
    },
    { merge: true },
  );

export const saveAdminAssignment = (assignment: AdminAssignment) =>
  setDoc(
    doc(
      db,
      "adminAssignments",
      `${assignment.targetType}_${assignment.targetId}`,
    ),
    { ...assignment, updatedAt: serverTimestamp() },
    { merge: true },
  );
