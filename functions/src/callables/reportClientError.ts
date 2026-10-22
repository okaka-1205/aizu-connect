import {logger} from "firebase-functions";
import {FieldValue} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";
import {
  sanitizeClientErrorText,
  sanitizeClientPath,
} from "../applicationLogic";
import {utcDateKey} from "../lib/adminMetrics";
import {db} from "../lib/firebaseAdmin";

const isFunctionsEmulator = process.env.FUNCTIONS_EMULATOR === "true";
const enforceCallableAppCheck =
  !isFunctionsEmulator &&
  (process.env.ENFORCE_CALLABLE_APP_CHECK ??
    process.env.ENFORCE_ADMIN_APP_CHECK) === "true";

const optionalClientText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const clientErrorId = (value: unknown) => {
  const normalized = optionalClientText(value, 32).toUpperCase();
  return /^[A-Z0-9]{8,32}$/.test(normalized) ? normalized : "UNKNOWN";
};

export const reportClientError = onCall(
  {
    region: "asia-northeast1",
    enforceAppCheck: enforceCallableAppCheck,
    timeoutSeconds: 15,
    memory: "256MiB",
    maxInstances: 3,
  },
  async (request) => {
    const errorId = clientErrorId(request.data?.errorId);
    logger.error("Client render error", {
      errorId,
      userId: request.auth?.uid ?? null,
      name: sanitizeClientErrorText(request.data?.name, 80),
      clientMessage: sanitizeClientErrorText(request.data?.message, 500),
      componentStack: sanitizeClientErrorText(
        request.data?.componentStack,
        3000,
      ),
      path: sanitizeClientPath(request.data?.path),
    });
    const metricDate = utcDateKey(new Date());
    await db
      .doc(`operationalMetrics/clientErrors_${metricDate}`)
      .set(
        {
          kind: "client_errors",
          date: metricDate,
          count: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      )
      .catch((error) => {
        logger.warn("Unable to update client error metrics", {
          errorId,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      });
    return {accepted: true, errorId};
  },
);
