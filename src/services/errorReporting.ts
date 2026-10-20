import { httpsCallable } from "firebase/functions";
import { ensureAppCheck, functions } from "../lib/firebase";

export type ClientErrorReport = {
  errorId: string;
  name: string;
  message: string;
  componentStack: string;
  path: string;
};

export const createErrorReference = () => {
  const randomId = globalThis.crypto?.randomUUID?.().replaceAll("-", "");
  return (randomId ?? `${Date.now()}${Math.random().toString(16).slice(2)}`)
    .slice(0, 12)
    .toUpperCase();
};

export const reportClientError = async (report: ClientErrorReport) => {
  await ensureAppCheck();
  const submit = httpsCallable<ClientErrorReport, { accepted: boolean }>(
    functions,
    "reportClientError",
  );
  await submit(report);
};
