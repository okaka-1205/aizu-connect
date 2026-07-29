import { initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
if (
  import.meta.env.PROD &&
  typeof appCheckSiteKey === "string" &&
  appCheckSiteKey.length > 0
) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
export const auth = getAuth(app);
auth.languageCode = "ja";
export const db = getFirestore(app);
export const functions = getFunctions(app, "asia-northeast1");
export const storage = getStorage(app);

const emulatorState = globalThis as typeof globalThis & {
  __AIZU_CONNECT_EMULATORS_CONNECTED__?: boolean;
};

const firestoreEmulatorPort = Number(
  import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT ?? 8080,
);
const functionsEmulatorPort = Number(
  import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT ?? 5001,
);
const storageEmulatorPort = Number(
  import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT ?? 9199,
);

if (
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true" &&
  !emulatorState.__AIZU_CONNECT_EMULATORS_CONNECTED__
) {
  connectAuthEmulator(
    auth,
    import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099",
    { disableWarnings: true },
  );
  connectFirestoreEmulator(db, "127.0.0.1", firestoreEmulatorPort);
  connectFunctionsEmulator(functions, "127.0.0.1", functionsEmulatorPort);
  connectStorageEmulator(storage, "127.0.0.1", storageEmulatorPort);
  emulatorState.__AIZU_CONNECT_EMULATORS_CONNECTED__ = true;
}

export const authPersistenceReady = setPersistence(
  auth,
  browserLocalPersistence,
).catch(() => setPersistence(auth, browserSessionPersistence));
