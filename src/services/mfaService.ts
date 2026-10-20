import {
  getMultiFactorResolver,
  getIdToken,
  multiFactor,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";

const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";

export const isMultiFactorRequiredError = (
  error: unknown,
): error is MultiFactorError =>
  errorCode(error) === "auth/multi-factor-auth-required";

export const createMultiFactorResolver = (error: MultiFactorError) =>
  getMultiFactorResolver(auth, error);

export const hasTotpEnrollment = (user: User) =>
  multiFactor(user).enrolledFactors.some(
    (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID,
  );

export const completeTotpSignIn = async (
  resolver: MultiFactorResolver,
  verificationCode: string,
) => {
  const hint = resolver.hints.find(
    (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID,
  );
  if (!hint) {
    throw new Error("このアカウントで利用できる認証アプリがありません。");
  }
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(
    hint.uid,
    verificationCode,
  );
  return resolver.resolveSignIn(assertion);
};

export type TotpEnrollment = {
  qrCodeUrl: string;
  secret: TotpSecret;
  secretKey: string;
};

export const beginTotpEnrollment = async (
  user: User,
): Promise<TotpEnrollment> => {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  return {
    qrCodeUrl: secret.generateQrCodeUrl(
      user.email ?? "admin",
      "Aizu Connect",
    ),
    secret,
    secretKey: secret.secretKey,
  };
};

export const completeTotpEnrollment = async (
  user: User,
  enrollment: TotpEnrollment,
  verificationCode: string,
) => {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
    enrollment.secret,
    verificationCode,
  );
  await multiFactor(user).enroll(assertion, "Aizu Connect 管理者");
  await getIdToken(user, true);
};
