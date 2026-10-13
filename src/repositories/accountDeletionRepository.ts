import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { AccountDeletionRequest } from "../types/domain";

export const subscribeAccountDeletionRequest = (
  userId: string,
  onValue: (request: AccountDeletionRequest | null) => void,
  onError: (error: Error) => void,
) =>
  onSnapshot(
    doc(db, "accountDeletionRequests", userId),
    (snapshot) =>
      onValue(
        snapshot.exists() ? (snapshot.data() as AccountDeletionRequest) : null,
      ),
    onError,
  );

export const submitAccountDeletionRequest = (userId: string, reason: string) =>
  setDoc(doc(db, "accountDeletionRequests", userId), {
    userId,
    status: "submitted",
    reason: reason.trim().slice(0, 500),
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

export const cancelAccountDeletionRequest = (userId: string) =>
  updateDoc(doc(db, "accountDeletionRequests", userId), {
    status: "cancelled",
    updatedAt: serverTimestamp(),
  });
