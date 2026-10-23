import {Timestamp} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";
import {requireAdmin} from "../lib/adminAuthorization";
import {percentage, recentUtcDateKeys} from "../lib/adminMetrics";
import {db} from "../lib/firebaseAdmin";

const isFunctionsEmulator = process.env.FUNCTIONS_EMULATOR === "true";
const enforceCallableAppCheck =
  !isFunctionsEmulator &&
  (process.env.ENFORCE_CALLABLE_APP_CHECK ??
    process.env.ENFORCE_ADMIN_APP_CHECK) === "true";

export const getAdminDashboardMetrics = onCall(
  {
    region: "asia-northeast1",
    // Allow the callable transport to reach Firebase's token validation. The
    // handler still requires an active admin with verified email and TOTP.
    invoker: "public",
    enforceAppCheck: enforceCallableAppCheck,
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 3,
  },
  async (request) => {
    await requireAdmin(
      request.auth?.uid,
      request.auth?.token.email_verified === true,
      request.auth?.token.firebase?.sign_in_second_factor,
    );

    const thirtyDaysAgo = Timestamp.fromMillis(
      Date.now() - 30 * 24 * 60 * 60 * 1_000,
    );
    const users = db.collection("users");
    const events = db.collection("events");
    const applications = db.collection("eventApplications");
    const errorMetricRefs = recentUtcDateKeys(7).map((date) =>
      db.doc(`operationalMetrics/clientErrors_${date}`),
    );

    const [
      totalUsersSnapshot,
      activeUsersSnapshot,
      organizationUsersSnapshot,
      newUsersSnapshot,
      publishedEventsSnapshot,
      totalApplicationsSnapshot,
      recentApplicationsSnapshot,
      successfulApplicationsSnapshot,
      cancelledApplicationsSnapshot,
      errorMetricSnapshots,
    ] = await Promise.all([
      users.count().get(),
      users.where("status", "==", "active").count().get(),
      users.where("role", "==", "organization").count().get(),
      users.where("createdAt", ">=", thirtyDaysAgo).count().get(),
      events.where("status", "==", "published").count().get(),
      applications.count().get(),
      applications.where("createdAt", ">=", thirtyDaysAgo).count().get(),
      applications
        .where("status", "in", ["confirmed", "attended"])
        .count()
        .get(),
      applications.where("status", "==", "cancelled").count().get(),
      db.getAll(...errorMetricRefs),
    ]);

    const totalApplications = totalApplicationsSnapshot.data().count;
    const successfulApplications =
      successfulApplicationsSnapshot.data().count;
    const cancelledApplications = cancelledApplicationsSnapshot.data().count;
    const clientErrors7Days = errorMetricSnapshots.reduce(
      (total, snapshot) => total + Number(snapshot.data()?.count ?? 0),
      0,
    );

    return {
      totalUsers: totalUsersSnapshot.data().count,
      activeUsers: activeUsersSnapshot.data().count,
      organizationUsers: organizationUsersSnapshot.data().count,
      newUsers30Days: newUsersSnapshot.data().count,
      publishedEvents: publishedEventsSnapshot.data().count,
      totalApplications,
      applications30Days: recentApplicationsSnapshot.data().count,
      applicationCompletionRate: percentage(
        successfulApplications,
        totalApplications,
      ),
      cancellationRate: percentage(cancelledApplications, totalApplications),
      clientErrors7Days,
      generatedAt: new Date().toISOString(),
    };
  },
);
