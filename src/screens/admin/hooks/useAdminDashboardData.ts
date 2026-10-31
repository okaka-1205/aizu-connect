import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useCallback, useEffect, useState } from "react";
import { getFirebaseErrorMessage } from "../../../lib/appLogic";
import { db, functions } from "../../../lib/firebase";
import type {
  AccountDeletionRequest,
  AdminUsageMetrics,
  AizuEvent,
  AppUser,
  AuditLog,
  ReportRecord,
  SetNotice,
} from "../../../types/domain";

export function useAdminDashboardData({
  setNotice,
  setIsLoading,
}: {
  setNotice: SetNotice;
  setIsLoading: (loading: boolean) => void;
}) {
  const [pendingEvents, setPendingEvents] = useState<AizuEvent[]>([]);
  const [pendingUsers, setPendingUsers] = useState<AppUser[]>([]);
  const [pendingReports, setPendingReports] = useState<ReportRecord[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<
    AccountDeletionRequest[]
  >([]);
  const [deletionRequestUsers, setDeletionRequestUsers] = useState<
    Record<string, AppUser>
  >({});
  const [managedUsers, setManagedUsers] = useState<AppUser[]>([]);
  const [managedEvents, setManagedEvents] = useState<AizuEvent[]>([]);
  const [pendingEventQueryLimit, setPendingEventQueryLimit] = useState(50);
  const [pendingUserQueryLimit, setPendingUserQueryLimit] = useState(50);
  const [pendingReportQueryLimit, setPendingReportQueryLimit] = useState(50);
  const [deletionRequestQueryLimit, setDeletionRequestQueryLimit] =
    useState(50);
  const [hasMorePendingEvents, setHasMorePendingEvents] = useState(false);
  const [hasMorePendingUsers, setHasMorePendingUsers] = useState(false);
  const [hasMorePendingReports, setHasMorePendingReports] = useState(false);
  const [hasMoreDeletionRequests, setHasMoreDeletionRequests] = useState(false);
  const [managedUserQueryLimit, setManagedUserQueryLimit] = useState(50);
  const [managedEventQueryLimit, setManagedEventQueryLimit] = useState(50);
  const [hasMoreManagedUsers, setHasMoreManagedUsers] = useState(false);
  const [hasMoreManagedEvents, setHasMoreManagedEvents] = useState(false);
  const [auditLogQueryLimit, setAuditLogQueryLimit] = useState(50);
  const [hasMoreAuditLogs, setHasMoreAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [usageMetrics, setUsageMetrics] = useState<AdminUsageMetrics | null>(
    null,
  );
  const [isUsageMetricsLoading, setIsUsageMetricsLoading] = useState(true);
  const [usageMetricsError, setUsageMetricsError] = useState("");

  const loadUsageMetrics = useCallback(async () => {
    setIsUsageMetricsLoading(true);
    setUsageMetricsError("");
    try {
      const callable = httpsCallable<void, AdminUsageMetrics>(
        functions,
        "getAdminDashboardMetrics",
      );
      const result = await callable();
      setUsageMetrics(result.data);
    } catch (error) {
      setUsageMetricsError(getFirebaseErrorMessage(error));
    } finally {
      setIsUsageMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsageMetrics();
  }, [loadUsageMetrics]);

  const loadReviewQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const [eventSnapshot, reportSnapshot, userSnapshot] = await Promise.all([
        getDocs(
          query(
            collection(db, "events"),
            where("status", "==", "pending_review"),
            orderBy("createdAt", "desc"),
            limit(pendingEventQueryLimit),
          ),
        ),
        getDocs(
          query(
            collection(db, "reports"),
            where("status", "==", "submitted"),
            orderBy("createdAt", "desc"),
            limit(pendingReportQueryLimit),
          ),
        ),
        getDocs(
          query(
            collection(db, "users"),
            where("status", "in", ["pending_approval", "pending"]),
            orderBy("createdAt", "desc"),
            limit(pendingUserQueryLimit),
          ),
        ),
      ]);
      setPendingEvents(
        eventSnapshot.docs.map((eventDoc) => ({
          id: eventDoc.id,
          ...eventDoc.data(),
        })) as AizuEvent[],
      );
      setHasMorePendingEvents(eventSnapshot.size === pendingEventQueryLimit);
      setPendingUsers(
        userSnapshot.docs
          .map((userDoc) => ({
            uid: userDoc.id,
            ...(userDoc.data() as Omit<AppUser, "uid">),
          }))
          .filter((user) => user.role !== "admin") as AppUser[],
      );
      setHasMorePendingUsers(userSnapshot.size === pendingUserQueryLimit);
      setPendingReports(
        reportSnapshot.docs.map((reportDoc) => ({
          id: reportDoc.id,
          ...reportDoc.data(),
        })) as ReportRecord[],
      );
      setHasMorePendingReports(reportSnapshot.size === pendingReportQueryLimit);
    } finally {
      setIsLoading(false);
    }
  }, [
    pendingEventQueryLimit,
    pendingReportQueryLimit,
    pendingUserQueryLimit,
    setIsLoading,
  ]);

  useEffect(() => {
    const eventUnsubscribe = onSnapshot(
      query(
        collection(db, "events"),
        where("status", "==", "pending_review"),
        orderBy("createdAt", "desc"),
        limit(pendingEventQueryLimit),
      ),
      (snapshot) => {
        setHasMorePendingEvents(snapshot.size === pendingEventQueryLimit);
        setPendingEvents(
          snapshot.docs.map((eventDoc) => ({
            id: eventDoc.id,
            ...eventDoc.data(),
          })) as AizuEvent[],
        );
      },
      () => setNotice("イベント審査キューを取得できませんでした。", "error"),
    );
    const userUnsubscribe = onSnapshot(
      query(
        collection(db, "users"),
        where("status", "in", ["pending_approval", "pending"]),
        orderBy("createdAt", "desc"),
        limit(pendingUserQueryLimit),
      ),
      (snapshot) => {
        setHasMorePendingUsers(snapshot.size === pendingUserQueryLimit);
        setPendingUsers(
          snapshot.docs
            .map((userDoc) => ({
              uid: userDoc.id,
              ...(userDoc.data() as Omit<AppUser, "uid">),
            }))
            .filter((user) => user.role !== "admin") as AppUser[],
        );
      },
      () => setNotice("アカウント審査キューを取得できませんでした。", "error"),
    );
    const reportUnsubscribe = onSnapshot(
      query(
        collection(db, "reports"),
        where("status", "==", "submitted"),
        orderBy("createdAt", "desc"),
        limit(pendingReportQueryLimit),
      ),
      (snapshot) => {
        setHasMorePendingReports(snapshot.size === pendingReportQueryLimit);
        setPendingReports(
          snapshot.docs.map((reportDoc) => ({
            id: reportDoc.id,
            ...reportDoc.data(),
          })) as ReportRecord[],
        );
      },
      () => setNotice("通報キューを取得できませんでした。", "error"),
    );
    const deletionRequestUnsubscribe = onSnapshot(
      query(
        collection(db, "accountDeletionRequests"),
        where("status", "==", "submitted"),
        orderBy("requestedAt", "desc"),
        limit(deletionRequestQueryLimit),
      ),
      (snapshot) => {
        setHasMoreDeletionRequests(snapshot.size === deletionRequestQueryLimit);
        const requests = snapshot.docs.map(
          (requestDoc) => requestDoc.data() as AccountDeletionRequest,
        );
        setDeletionRequests(requests);
        void Promise.all(
          requests.map(async (request) => {
            const userSnapshot = await getDoc(doc(db, "users", request.userId));
            if (!userSnapshot.exists()) return null;
            return {
              uid: userSnapshot.id,
              ...(userSnapshot.data() as Omit<AppUser, "uid">),
            } as AppUser;
          }),
        )
          .then((users) =>
            setDeletionRequestUsers(
              Object.fromEntries(
                users
                  .filter((user): user is AppUser => Boolean(user))
                  .map((user) => [user.uid, user]),
              ),
            ),
          )
          .catch(() =>
            setNotice(
              "退会申請者のアカウント情報を取得できませんでした。",
              "error",
            ),
          );
      },
      () => setNotice("退会申請を取得できませんでした。", "error"),
    );
    return () => {
      eventUnsubscribe();
      userUnsubscribe();
      reportUnsubscribe();
      deletionRequestUnsubscribe();
    };
  }, [
    deletionRequestQueryLimit,
    pendingEventQueryLimit,
    pendingReportQueryLimit,
    pendingUserQueryLimit,
    setNotice,
  ]);

  useEffect(() => {
    const usersUnsubscribe = onSnapshot(
      query(
        collection(db, "users"),
        orderBy("createdAt", "desc"),
        limit(managedUserQueryLimit),
      ),
      (snapshot) => {
        setHasMoreManagedUsers(snapshot.size === managedUserQueryLimit);
        setManagedUsers(
          snapshot.docs
            .map((userDoc) => ({
              uid: userDoc.id,
              ...(userDoc.data() as Omit<AppUser, "uid">),
            }))
            .filter((user) => user.role !== "admin") as AppUser[],
        );
      },
      () => setNotice("ユーザー管理データを取得できませんでした。", "error"),
    );
    const eventsUnsubscribe = onSnapshot(
      query(
        collection(db, "events"),
        where("status", "in", ["published", "unpublished"]),
        orderBy("createdAt", "desc"),
        limit(managedEventQueryLimit),
      ),
      (snapshot) => {
        setHasMoreManagedEvents(snapshot.size === managedEventQueryLimit);
        setManagedEvents(
          snapshot.docs
            .map(
              (eventDoc) =>
                ({
                  id: eventDoc.id,
                  ...eventDoc.data(),
                }) as AizuEvent,
            )
            .filter((event) =>
              ["published", "unpublished"].includes(event.status),
            ) as AizuEvent[],
        );
      },
      () =>
        setNotice("公開イベント管理データを取得できませんでした。", "error"),
    );
    const auditUnsubscribe = onSnapshot(
      query(
        collection(db, "auditLogs"),
        orderBy("createdAt", "desc"),
        limit(auditLogQueryLimit + 1),
      ),
      (snapshot) => {
        setHasMoreAuditLogs(snapshot.size > auditLogQueryLimit);
        setAuditLogs(
          snapshot.docs.slice(0, auditLogQueryLimit).map((auditDoc) => ({
            id: auditDoc.id,
            ...auditDoc.data(),
          })) as AuditLog[],
        );
      },
      () => setNotice("監査履歴を取得できませんでした。", "error"),
    );
    return () => {
      usersUnsubscribe();
      eventsUnsubscribe();
      auditUnsubscribe();
    };
  }, [
    auditLogQueryLimit,
    managedEventQueryLimit,
    managedUserQueryLimit,
    setNotice,
  ]);
  return {
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
  };
}
