import {
  applicationDefault,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {loadFirebaseCliOAuth} from "./lib/firebase-cli-credential.mjs";

const EXPECTED_PROJECT_ID = "aizu-connect-prod";
const EXPECTED_STORAGE_BUCKET = "aizu-connect-prod.firebasestorage.app";
const RESET_EMULATOR_PROJECT_ID = "demo-aizu-connect-reset";
const CONFIRMATION = "RESET_NON_ADMIN_ACCOUNTS";
const projectId =
  process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "";
const isResetEmulator = Boolean(
  process.env.FIREBASE_AUTH_EMULATOR_HOST &&
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_STORAGE_EMULATOR_HOST,
);
const requiredProjectId = isResetEmulator
  ? RESET_EMULATOR_PROJECT_ID
  : EXPECTED_PROJECT_ID;
const execute = process.argv.includes("--execute");
const confirmation = process.argv
  .find((argument) => argument.startsWith("--confirm="))
  ?.slice("--confirm=".length);
const useFirebaseCliCredentials = process.argv.includes(
  "--use-firebase-cli-credentials",
);

if (projectId !== requiredProjectId) {
  throw new Error(
    `GCLOUD_PROJECT must be exactly ${requiredProjectId}; received ${projectId || "(empty)"}.`,
  );
}
if (execute && confirmation !== CONFIRMATION) {
  throw new Error(
    `Execution requires --confirm=${CONFIRMATION}. Run without --execute for a preview.`,
  );
}

const credential = () => {
  if (!useFirebaseCliCredentials) return applicationDefault();
  const {
    clientId,
    clientSecret,
    refreshToken: cliRefreshToken,
  } = loadFirebaseCliOAuth();
  const temporaryCredentialDirectory = mkdtempSync(
    join(tmpdir(), "aizu-connect-adc-"),
  );
  const temporaryCredentialPath = join(
    temporaryCredentialDirectory,
    "application-default-credentials.json",
  );
  writeFileSync(
    temporaryCredentialPath,
    JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: cliRefreshToken,
      type: "authorized_user",
    }),
    { encoding: "utf8", mode: 0o600 },
  );
  process.env.GOOGLE_APPLICATION_CREDENTIALS = temporaryCredentialPath;
  process.once("exit", () => {
    rmSync(temporaryCredentialDirectory, { recursive: true, force: true });
  });
  return applicationDefault();
};

initializeApp({
  ...(isResetEmulator ? {} : { credential: credential() }),
  projectId,
  storageBucket: isResetEmulator
    ? `${projectId}.appspot.com`
    : EXPECTED_STORAGE_BUCKET,
});

const auth = getAuth();
const db = getFirestore();
const bucket = getStorage().bucket();

const resetCollections = [
  "studentProfiles",
  "organizations",
  "accountDeletionRequests",
  "events",
  "eventApplications",
  "chatRooms",
  "activities",
  "reports",
  "savedEvents",
  "savedSearches",
  "chatPreferences",
  "publicOrganizerProfiles",
  "thirdPartyProvisionLogs",
  "eventCheckIns",
  "functionReceipts",
];
const adminScopedCollections = [
  { name: "legalConsents", ownerField: "userId" },
  { name: "notifications", ownerField: "recipientId" },
  { name: "notificationPreferences", ownerField: null },
];
const accountDataCollections = [
  ...resetCollections,
  ...adminScopedCollections.map(({ name }) => name),
];
const accountStoragePrefixes = [
  "profile-images/",
  "event-images/",
  "chat-attachments/",
];

const listAuthUsers = async () => {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
};

const countCollection = async (collectionName) =>
  (await db.collection(collectionName).count().get()).data().count;

const countStoragePrefix = async (prefix) => {
  const [files] = await bucket.getFiles({ prefix });
  return files.length;
};

const usersSnapshot = await db.collection("users").get();
const firestoreAdminIds = new Set(
  usersSnapshot.docs
    .filter((document) => document.data().role === "admin")
    .map((document) => document.id),
);
const activeFirestoreAdminIds = new Set(
  usersSnapshot.docs
    .filter(
      (document) =>
        document.data().role === "admin" &&
        document.data().status === "active",
    )
    .map((document) => document.id),
);
const authUsers = await listAuthUsers();
const preservedAdminIds = firestoreAdminIds;
const authUserIds = new Set(authUsers.map((user) => user.uid));
const operationalAdminIds = new Set(
  [...activeFirestoreAdminIds].filter((uid) => authUserIds.has(uid)),
);

if (firestoreAdminIds.size === 0 || operationalAdminIds.size === 0) {
  throw new Error(
    "Reset aborted: at least one active Firestore administrator with a matching Authentication user is required.",
  );
}

const authUserIdsToDelete = authUsers
  .map((user) => user.uid)
  .filter((uid) => !preservedAdminIds.has(uid));
const firestoreUserIdsToDelete = usersSnapshot.docs
  .map((document) => document.id)
  .filter((uid) => !preservedAdminIds.has(uid));
const accountIdsToDelete = [
  ...new Set([...authUserIdsToDelete, ...firestoreUserIdsToDelete]),
];
const collectionCounts = Object.fromEntries(
  await Promise.all(
    accountDataCollections.map(async (collectionName) => [
      collectionName,
      await countCollection(collectionName),
    ]),
  ),
);
const storageCounts = Object.fromEntries(
  await Promise.all(
    accountStoragePrefixes.map(async (prefix) => [
      prefix,
      await countStoragePrefix(prefix),
    ]),
  ),
);

console.log(
  JSON.stringify(
    {
      mode: execute ? "execute" : "preview",
      projectId,
      preservedAdministrators: preservedAdminIds.size,
      authUsersToDelete: authUserIdsToDelete.length,
      firestoreUsersToDelete: firestoreUserIdsToDelete.length,
      collectionCounts,
      storageCounts,
    },
    null,
    2,
  ),
);

if (!execute) {
  console.log(
    `Preview only. Re-run with --execute --confirm=${CONFIRMATION} to reset the listed non-admin account data.`,
  );
  process.exit(0);
}

for (const collectionName of resetCollections) {
  await db.recursiveDelete(db.collection(collectionName));
}
for (const { name, ownerField } of adminScopedCollections) {
  const snapshot = await db.collection(name).get();
  for (const document of snapshot.docs) {
    const ownerId = ownerField
      ? String(document.data()[ownerField] ?? "")
      : document.id;
    if (!preservedAdminIds.has(ownerId)) {
      await db.recursiveDelete(document.ref);
    }
  }
}
for (const userId of firestoreUserIdsToDelete) {
  await db.recursiveDelete(db.doc(`users/${userId}`));
}
for (let index = 0; index < authUserIdsToDelete.length; index += 1000) {
  const batch = authUserIdsToDelete.slice(index, index + 1000);
  const result = await auth.deleteUsers(batch);
  if (result.failureCount > 0) {
    throw new Error(
      `Failed to delete ${result.failureCount} Authentication users.`,
    );
  }
}
for (const userId of accountIdsToDelete) {
  await bucket.deleteFiles({ prefix: `profile-images/${userId}/`, force: true });
}
await bucket.deleteFiles({ prefix: "event-images/", force: true });
await bucket.deleteFiles({ prefix: "chat-attachments/", force: true });

const remainingAuthUsers = await listAuthUsers();
const remainingUserDocs = await db.collection("users").get();
const remainingCollectionCounts = Object.fromEntries(
  await Promise.all(
    accountDataCollections.map(async (collectionName) => [
      collectionName,
      await countCollection(collectionName),
    ]),
  ),
);
const remainingStorageCounts = Object.fromEntries(
  await Promise.all(
    accountStoragePrefixes.map(async (prefix) => [
      prefix,
      await countStoragePrefix(prefix),
    ]),
  ),
);
const remainingNonAdminProfileFiles = (
  await Promise.all(
    accountIdsToDelete.map((userId) =>
      countStoragePrefix(`profile-images/${userId}/`),
    ),
  )
).reduce((total, count) => total + count, 0);

const hasUnexpectedAuthUser = remainingAuthUsers.some(
  (user) => !preservedAdminIds.has(user.uid),
);
const hasUnexpectedUserDocument = remainingUserDocs.docs.some(
  (document) => document.data().role !== "admin",
);
const expectedAdminScopedCounts = Object.fromEntries(
  await Promise.all(
    adminScopedCollections.map(async ({ name, ownerField }) => {
      const snapshot = await db.collection(name).get();
      const unexpectedDocuments = snapshot.docs.filter((document) => {
        const ownerId = ownerField
          ? String(document.data()[ownerField] ?? "")
          : document.id;
        return !preservedAdminIds.has(ownerId);
      });
      return [name, unexpectedDocuments.length];
    }),
  ),
);
const hasRemainingAccountData = resetCollections.some(
  (name) => remainingCollectionCounts[name] !== 0,
) || Object.values(expectedAdminScopedCounts).some((count) => count !== 0);
const hasRemainingStorageData =
  remainingNonAdminProfileFiles !== 0 ||
  remainingStorageCounts["event-images/"] !== 0 ||
  remainingStorageCounts["chat-attachments/"] !== 0;

if (
  hasUnexpectedAuthUser ||
  hasUnexpectedUserDocument ||
  hasRemainingAccountData ||
  hasRemainingStorageData
) {
  throw new Error("Post-reset verification failed.");
}

console.log(
  JSON.stringify(
    {
      status: "completed",
      preservedAdministrators: remainingUserDocs.size,
      remainingAuthUsers: remainingAuthUsers.length,
      remainingCollectionCounts,
      remainingStorageCounts,
    },
    null,
    2,
  ),
);
