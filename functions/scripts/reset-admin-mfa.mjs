import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {loadFirebaseCliOAuth} from "./lib/firebase-cli-credential.mjs";

const EXPECTED_PROJECT_ID = "aizu-connect-prod";
const CONFIRMATION = "RESET_ADMIN_MFA";
const email = process.argv[2]?.trim().toLowerCase();
const projectId =
  process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "";
const execute = process.argv.includes("--execute");
const confirmation = process.argv
  .find((argument) => argument.startsWith("--confirm="))
  ?.slice("--confirm=".length);
const useFirebaseCliCredentials = process.argv.includes(
  "--use-firebase-cli-credentials",
);

if (!email) {
  throw new Error(
    "Usage: npm run admin:reset-mfa -- admin@example.com [--execute --confirm=RESET_ADMIN_MFA]",
  );
}
if (projectId !== EXPECTED_PROJECT_ID) {
  throw new Error(
    `GCLOUD_PROJECT must be exactly ${EXPECTED_PROJECT_ID}; received ${projectId || "(empty)"}.`,
  );
}
if (execute && confirmation !== CONFIRMATION) {
  throw new Error(
    `Execution requires --confirm=${CONFIRMATION}. Run without --execute for a preview.`,
  );
}

const credential = () => {
  if (!useFirebaseCliCredentials) return applicationDefault();
  const {clientId, clientSecret, refreshToken} = loadFirebaseCliOAuth();
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "aizu-mfa-adc-"));
  const credentialPath = join(
    temporaryDirectory,
    "application-default-credentials.json",
  );
  writeFileSync(
    credentialPath,
    JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      type: "authorized_user",
    }),
    { encoding: "utf8", mode: 0o600 },
  );
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath;
  process.once("exit", () => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });
  return applicationDefault();
};

initializeApp({credential: credential(), projectId});

const auth = getAuth();
const user = await auth.getUserByEmail(email);
const adminProfile = await getFirestore().doc(`users/${user.uid}`).get();
if (
  !adminProfile.exists ||
  adminProfile.get("role") !== "admin" ||
  adminProfile.get("status") !== "active"
) {
  throw new Error("The target must be an active Firestore administrator.");
}

console.log(
  JSON.stringify(
    {
      mode: execute ? "execute" : "preview",
      projectId,
      email,
      uid: user.uid,
      enrolledFactors: user.multiFactor?.enrolledFactors?.length ?? 0,
    },
    null,
    2,
  ),
);

if (!execute) {
  console.log(
    `Preview only. After confirming the administrator's identity, re-run with --execute --confirm=${CONFIRMATION}.`,
  );
  process.exit(0);
}

await auth.updateUser(user.uid, {
  multiFactor: {enrolledFactors: []},
});
await auth.revokeRefreshTokens(user.uid);
console.log("Administrator MFA factors cleared and refresh tokens revoked.");
