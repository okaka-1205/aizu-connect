import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {test} from "node:test";

const validator = resolve("scripts/validate-production-env.mjs");

test("production App Check guard follows the effective callable setting", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "aizu-app-check-"));
  try {
    mkdirSync(resolve(directory, "functions"));
    writeFileSync(resolve(directory, ".env.production"), [
      "VITE_FIREBASE_API_KEY=test-key",
      "VITE_FIREBASE_AUTH_DOMAIN=aizu-connect-prod.firebaseapp.com",
      "VITE_FIREBASE_PROJECT_ID=aizu-connect-prod",
      "VITE_FIREBASE_STORAGE_BUCKET=aizu-connect-prod.firebasestorage.app",
      "VITE_FIREBASE_MESSAGING_SENDER_ID=123",
      "VITE_FIREBASE_APP_ID=test-app",
      "VITE_FIREBASE_APP_CHECK_SITE_KEY=test-site-key",
      "VITE_LEGAL_CONTACT_EMAIL=contact@aizu-connect.test",
    ].join("\n"));

    const run = (callableSetting) => {
      writeFileSync(resolve(directory, "functions/.env.aizu-connect-prod"), [
        "ENFORCE_ADMIN_APP_CHECK=true",
        ...(callableSetting === undefined ? [] : [`ENFORCE_CALLABLE_APP_CHECK=${callableSetting}`]),
      ].join("\n"));
      const childEnv = {...process.env, ENFORCE_ADMIN_APP_CHECK: "true"};
      delete childEnv.ENFORCE_CALLABLE_APP_CHECK;
      if (callableSetting !== undefined) childEnv.ENFORCE_CALLABLE_APP_CHECK = callableSetting;
      try {
        execFileSync(process.execPath, [validator], {
          cwd: directory,
          env: childEnv,
          stdio: "pipe",
        });
        return true;
      } catch (error) {
        assert.equal(error.status, 1);
        return false;
      }
    };

    assert.equal(run(undefined), true, "legacy admin setting should enforce all callables");
    assert.equal(run("false"), false, "explicit false must not bypass the release guard");
    assert.equal(run("true"), true, "explicit true should pass");
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});
