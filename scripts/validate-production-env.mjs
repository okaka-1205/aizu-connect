import { loadEnv } from "vite";

const env = loadEnv("production", process.cwd(), "");
const requiredKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
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

if (/demo-aizu|localhost|127\.0\.0\.1/i.test(unsafeValues)) {
  throw new Error("Production build cannot use demo or local Firebase services.");
}

if (env.VITE_USE_FIREBASE_EMULATORS === "true") {
  throw new Error("Production build cannot connect to Firebase emulators.");
}

console.log(
  `Production Firebase configuration verified: ${env.VITE_FIREBASE_PROJECT_ID}`,
);
