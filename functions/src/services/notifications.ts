import {db} from "../lib/firebaseAdmin";

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
) => {
  try {
    await db.doc(path).create(data);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code !== 6 && code !== "already-exists") throw error;
  }
};
