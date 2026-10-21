import {HttpsError} from "firebase-functions/v2/https";

export const requiredDocumentId = (value: unknown) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) {
    throw new HttpsError("invalid-argument", "対象IDが不正です。");
  }
  return value;
};
