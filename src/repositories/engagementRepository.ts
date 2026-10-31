import {
  average,
  collection,
  count,
  deleteField,
  doc,
  documentId,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import type {
  AdminAssignment,
  EventReport,
  EventSurveyResponse,
} from "../types/domain";

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

export const EVENT_SURVEY_PAGE_SIZE = 50;

export const loadEventSurveyPage = async (
  eventId: string,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
) => {
  const snapshot = await getDocs(
    query(
      collection(db, "eventSurveys", eventId, "responses"),
      orderBy("createdAt", "desc"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(EVENT_SURVEY_PAGE_SIZE + 1),
    ),
  );
  const documents = snapshot.docs.slice(0, EVENT_SURVEY_PAGE_SIZE);
  return {
    responses: documents.map((response) => ({
      ...response.data(),
      eventId,
      userId: response.id,
    })) as EventSurveyResponse[],
    cursor: documents.at(-1) ?? null,
    hasMore: snapshot.size > EVENT_SURVEY_PAGE_SIZE,
  };
};

export const loadEventSurveySummary = async (eventId: string) => {
  const responses = collection(db, "eventSurveys", eventId, "responses");
  const [summary, recommendations] = await Promise.all([
    getAggregateFromServer(responses, {
      responseCount: count(),
      averageRating: average("rating"),
    }),
    getCountFromServer(query(responses, where("wouldRecommend", "==", true))),
  ]);
  return {
    responseCount: summary.data().responseCount,
    averageRating: summary.data().averageRating ?? 0,
    recommendationCount: recommendations.data().count,
  };
};

type AssignmentRead = {
  resolve: (assignment: AdminAssignment | null) => void;
  reject: (error: unknown) => void;
};

const ASSIGNMENT_BATCH_SIZE = 30;
const pendingAssignmentReads = new Map<
  string,
  Promise<AdminAssignment | null>
>();
const queuedAssignmentReads = new Map<string, AssignmentRead>();
let assignmentFlushScheduled = false;

const toAdminAssignment = (data: DocumentData) =>
  ({
    ...data,
    status: data.status === "done" ? "completed" : data.status,
  }) as AdminAssignment;

const readAssignmentIndividually = async (
  id: string,
  request: AssignmentRead,
) => {
  try {
    const snapshot = await getDoc(doc(db, "adminAssignments", id));
    const assignment = snapshot.exists()
      ? toAdminAssignment(snapshot.data())
      : null;
    pendingAssignmentReads.delete(id);
    request.resolve(assignment);
  } catch (error) {
    pendingAssignmentReads.delete(id);
    request.reject(error);
  }
};

const readAssignmentBatch = async (requests: [string, AssignmentRead][]) => {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, "adminAssignments"),
        where(
          documentId(),
          "in",
          requests.map(([id]) => id),
        ),
      ),
    );
    const assignments = new Map(
      snapshot.docs.map((document) => [
        document.id,
        toAdminAssignment(document.data()),
      ]),
    );
    for (const [id, request] of requests) {
      // A cache-only query cannot prove that an individual document is absent.
      if (snapshot.metadata.fromCache && !assignments.has(id)) {
        void readAssignmentIndividually(id, request);
        continue;
      }
      pendingAssignmentReads.delete(id);
      request.resolve(assignments.get(id) ?? null);
    }
  } catch (error) {
    for (const [id, request] of requests) {
      pendingAssignmentReads.delete(id);
      request.reject(error);
    }
  }
};

const flushAssignmentReads = () => {
  assignmentFlushScheduled = false;
  const requests = Array.from(queuedAssignmentReads);
  queuedAssignmentReads.clear();
  for (
    let offset = 0;
    offset < requests.length;
    offset += ASSIGNMENT_BATCH_SIZE
  ) {
    void readAssignmentBatch(
      requests.slice(offset, offset + ASSIGNMENT_BATCH_SIZE),
    );
  }
};

export const loadAdminAssignment = (
  targetType: AdminAssignment["targetType"],
  targetId: string,
): Promise<AdminAssignment | null> => {
  const id = `${targetType}_${targetId}`;
  const pending = pendingAssignmentReads.get(id);
  if (pending) return pending;
  const request = new Promise<AdminAssignment | null>((resolve, reject) => {
    queuedAssignmentReads.set(id, { resolve, reject });
  });
  pendingAssignmentReads.set(id, request);
  if (!assignmentFlushScheduled) {
    assignmentFlushScheduled = true;
    queueMicrotask(flushAssignmentReads);
  }
  return request;
};

export const editChatMessage = async (
  roomId: string,
  messageId: string,
  nextText: string,
) => {
  const manage = httpsCallable(functions, "manageChatMessage");
  await manage({ roomId, messageId, action: "edit", text: nextText });
};

export const deleteChatMessage = async (roomId: string, messageId: string) => {
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

export const saveAdminAssignment = (assignment: AdminAssignment) => {
  const { dueAt, ...fields } = assignment;
  return setDoc(
    doc(
      db,
      "adminAssignments",
      `${assignment.targetType}_${assignment.targetId}`,
    ),
    { ...fields, dueAt: dueAt ?? deleteField(), updatedAt: serverTimestamp() },
    { merge: true },
  );
};
