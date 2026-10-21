import {HttpsError} from "firebase-functions/v2/https";
import {db} from "./firebaseAdmin";

export type AdminActor = {
  uid: string;
  displayName: string;
};

export const requireAdmin = async (
  userId: string | undefined,
  emailVerified: boolean,
  secondFactor: unknown,
): Promise<AdminActor> => {
  if (!userId || !emailVerified) {
    throw new HttpsError("unauthenticated", "ログインが必要です。");
  }
  const snapshot = await db.doc(`users/${userId}`).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.role !== "admin" || data?.status !== "active") {
    throw new HttpsError(
      "permission-denied",
      "有効な管理者権限を確認できませんでした。",
    );
  }
  if (process.env.FUNCTIONS_EMULATOR !== "true" && secondFactor !== "totp") {
    throw new HttpsError(
      "failed-precondition",
      "管理操作には認証アプリによる二段階認証が必要です。",
    );
  }
  return {
    uid: userId,
    displayName: String(data.displayName || "Aizu Connect 運営").slice(0, 80),
  };
};
