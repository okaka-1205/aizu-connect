import {applicationDefault, initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {loadFirebaseCliOAuth} from "./lib/firebase-cli-credential.mjs";

const EXPECTED_PROJECT_ID = "aizu-connect-prod";
const projectId =
  process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "";
const targetDatabase = process.argv[2]?.trim() ?? "";
const useFirebaseCliCredentials = process.argv.includes(
  "--use-firebase-cli-credentials",
);

if (projectId !== EXPECTED_PROJECT_ID) {
  throw new Error(
    `GCLOUD_PROJECT must be exactly ${EXPECTED_PROJECT_ID}; received ${projectId || "(empty)"}.`,
  );
}
if (!/^restore-drill-\d{8}$/.test(targetDatabase)) {
  throw new Error(
    "Target database must match restore-drill-YYYYMMDD. This command is read-only.",
  );
}

const credential = () => {
  if (!useFirebaseCliCredentials) return applicationDefault();
  const {clientId, clientSecret, refreshToken} = loadFirebaseCliOAuth();
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "aizu-restore-adc-"));
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
    {encoding: "utf8", mode: 0o600},
  );
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath;
  process.once("exit", () => {
    rmSync(temporaryDirectory, {recursive: true, force: true});
  });
  return applicationDefault();
};

const app = initializeApp({credential: credential(), projectId});
const source = getFirestore(app, "(default)");
const target = getFirestore(app, targetDatabase);
const collections = [
  "users",
  "events",
  "eventApplications",
  "chatRooms",
  "notifications",
];

const count = async (database, collectionName) =>
  (await database.collection(collectionName).count().get()).data().count;

const results = await Promise.all(
  collections.map(async (collectionName) => {
    const [sourceCount, targetCount] = await Promise.all([
      count(source, collectionName),
      count(target, collectionName),
    ]);
    return {
      collection: collectionName,
      sourceCount,
      targetCount,
      matches: sourceCount === targetCount,
    };
  }),
);

console.log(
  JSON.stringify(
    {
      projectId,
      sourceDatabase: "(default)",
      targetDatabase,
      readOnly: true,
      verifiedAt: new Date().toISOString(),
      results,
      allCountsMatch: results.every((result) => result.matches),
    },
    null,
    2,
  ),
);

if (!results.every((result) => result.matches)) process.exitCode = 1;
