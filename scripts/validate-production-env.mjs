import { loadEnv } from "vite";
import { join } from "node:path";

const env = loadEnv("production", process.cwd(), "");
const requiredKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_APP_CHECK_SITE_KEY",
  "VITE_LEGAL_OPERATOR_NAME",
  "VITE_LEGAL_OPERATOR_ADDRESS",
  "VITE_LEGAL_REPRESENTATIVE",
  "VITE_LEGAL_CONTACT_EMAIL",
];
const missingKeys = requiredKeys.filter((key) => !env[key]?.trim());

if (missingKeys.length > 0) {
  throw new Error(
    `Production Firebase configuration is incomplete: ${missingKeys.join(", ")}`,
  );
}

const unsafeValues = [
  env.VITE_FIREBASE_PROJECT_ID,
  env.VITE_FIREBASE_AUTH_DOMAIN,
  env.VITE_FIREBASE_STORAGE_BUCKET,
].join(" ");

if (/demo-aizu|aizu-connect-dev|localhost|127\.0\.0\.1/i.test(unsafeValues)) {
  throw new Error(
    "Production build cannot use development, demo, or local Firebase services.",
  );
}

if (env.VITE_USE_FIREBASE_EMULATORS === "true") {
  throw new Error("Production build cannot connect to Firebase emulators.");
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.VITE_LEGAL_CONTACT_EMAIL)) {
  throw new Error("VITE_LEGAL_CONTACT_EMAIL must be a valid public contact.");
}

const legalValues = [
  env.VITE_LEGAL_OPERATOR_NAME,
  env.VITE_LEGAL_OPERATOR_ADDRESS,
  env.VITE_LEGAL_REPRESENTATIVE,
  env.VITE_LEGAL_CONTACT_EMAIL,
].join(" ");

if (
  /未設定|todo|example\.(com|jp)|your[-_ ]?(name|address)/i.test(legalValues)
) {
  throw new Error(
    "Production legal operator information contains placeholders.",
  );
}

const functionsEnv = loadEnv(
  env.VITE_FIREBASE_PROJECT_ID,
  join(process.cwd(), "functions"),
  "",
);

if (functionsEnv.ENFORCE_ADMIN_APP_CHECK !== "true") {
  throw new Error(
    "Production admin functions must enforce App Check. " +
      `Set ENFORCE_ADMIN_APP_CHECK=true in functions/.env.${env.VITE_FIREBASE_PROJECT_ID}.`,
  );
}

console.log(
  `Production Firebase configuration and App Check verified: ${env.VITE_FIREBASE_PROJECT_ID}`,
);
