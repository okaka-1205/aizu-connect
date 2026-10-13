import { useEffect, useState } from "react";
import { getFirebaseErrorMessage } from "../lib/appLogic";
import {
  cancelAccountDeletionRequest,
  submitAccountDeletionRequest,
  subscribeAccountDeletionRequest,
} from "../repositories/accountDeletionRepository";
import type { AccountDeletionRequest, AppUser } from "../types/domain";
import type { SetNotice } from "../types/domain";

export function useAccountDeletion({
  appUser,
  enabled,
  setNotice,
}: {
  appUser: AppUser | null;
  enabled: boolean;
  setNotice: SetNotice;
}) {
  const [request, setRequest] = useState<AccountDeletionRequest | null>(null);

  useEffect(() => {
    if (!appUser || !enabled || appUser.role === "admin") {
      setRequest(null);
      return;
    }
    return subscribeAccountDeletionRequest(appUser.uid, setRequest, (error) =>
      setNotice(getFirebaseErrorMessage(error), "error"),
    );
  }, [appUser, enabled, setNotice]);

  return {
    accountDeletionRequest: request,
    requestAccountDeletion: async (reason: string) => {
      if (appUser) await submitAccountDeletionRequest(appUser.uid, reason);
    },
    cancelAccountDeletion: async () => {
      if (appUser) await cancelAccountDeletionRequest(appUser.uid);
    },
  };
}
