import {db} from "../lib/firebaseAdmin";
import {isLiveResource} from "./resourceLifecycle";

export const notificationEnabled = async (
  userId: string,
  key: "newEvents" | "applicationUpdates" | "chatMessages" | "eventReminders",
) => {
  const snapshot = await db.doc(`notificationPreferences/${userId}`).get();
  return snapshot.data()?.[key] !== false;
};

export const createNotificationOnce = async (
  path: string,
  data: Record<string, unknown>,
  guard?: (transaction: FirebaseFirestore.Transaction) => Promise<boolean>,
) => {
  if (typeof data.recipientId !== "string") return;
  const recipientId = data.recipientId;
  await db.runTransaction(async (transaction) => {
    const ref = db.doc(path);
    const [notification, recipient] = await transaction.getAll(
      ref,
      db.doc(`users/${recipientId}`),
    );
    if (notification.exists || !isLiveResource(recipient)) return;
    if (guard && !(await guard(transaction))) return;
    transaction.create(ref, data);
  });
};
