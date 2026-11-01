// The emulator permits more Firestore accesses than live Storage Rules.
// Count actual document paths requested by its evaluator instead of relying
// only on allow/deny results. Synthetic documents never contact a live service.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const roots = [
  process.env.npm_config_cache,
  path.join(os.homedir(), ".npm"),
].filter(Boolean);
const candidates = roots
  .flatMap((root) => {
    const cache = path.join(root, "_npx");
    if (!fs.existsSync(cache)) return [];
    return fs
      .readdirSync(cache)
      .map((id) =>
        path.join(cache, id, "node_modules/firebase-tools/package.json"),
      );
  })
  .filter((file) => fs.existsSync(file));
assert.ok(candidates.length, "Run via Firebase CLI emulators:exec first");
candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
const cli = path.dirname(candidates[0]);
const require = createRequire(candidates[0]);
const { StorageRulesRuntime } = require(
  `${cli}/lib/emulator/storage/rules/runtime.js`,
);
const { EmulatorRegistry } = require(`${cli}/lib/emulator/registry.js`);
const value = (data) =>
  typeof data === "string"
    ? { stringValue: data }
    : typeof data === "boolean"
      ? { booleanValue: data }
      : Array.isArray(data)
        ? { arrayValue: { values: data.map(value) } }
        : {
            mapValue: {
              fields: Object.fromEntries(
                Object.entries(data).map(([key, item]) => [key, value(item)]),
              ),
            },
          };
let documents;
let accesses;
const originalClient = EmulatorRegistry.client;
EmulatorRegistry.client = () => ({
  get: async (name) => {
    const key = name.split("/documents/")[1];
    accesses.add(key);
    if (!documents.has(key)) throw new Error("Synthetic document not found");
    return {
      body: { name, fields: value(documents.get(key)).mapValue.fields },
    };
  },
});
const runtime = new StorageRulesRuntime();
let checked = 0;
try {
  await runtime.start(false);
  const { ruleset, issues } = await runtime.loadRuleset({
    files: [
      {
        name: "storage.rules",
        content: fs.readFileSync("storage.rules", "utf8"),
      },
    ],
  });
  assert.ok(ruleset, JSON.stringify(issues));
  const run = async (label, object, method, allowed, count, options = {}) => {
    accesses = new Set();
    documents = new Map([
      [
        "users/budget-user",
        { status: options.status ?? "active", role: options.role ?? "student" },
      ],
      [
        "events/budget-event",
        { createdBy: "budget-user", status: "published" },
      ],
    ]);
    const token =
      [
        { alg: "none", typ: "JWT" },
        {
          user_id: "budget-user",
          email_verified: options.verified !== false,
          ...(options.mfa
            ? { firebase: { sign_in_second_factor: "totp" } }
            : {}),
        },
      ]
        .map((data) => Buffer.from(JSON.stringify(data)).toString("base64url"))
        .join(".") + ".";
    const file = { name: object, size: 1, contentType: "image/png" };
    const result = await ruleset.verify({
      projectId: "demo-aizu-storage-budget",
      method,
      path: `/b/synthetic-bucket/o/${object}`,
      token,
      file: {
        before: method === "get" ? file : undefined,
        after: method === "create" ? file : undefined,
      },
    });
    assert.equal(result.permitted === true, allowed, label);
    assert.equal(accesses.size, count, `${label}: unexpected document paths`);
    assert.ok(accesses.size <= 2, `${label}: live Storage limit exceeded`);
    checked++;
    console.log(`PASS budget ${label}: ${accesses.size}/2 documents`);
  };
  await run("profile read", "profile-images/owner/photo.png", "get", true, 1);
  await run(
    "profile write",
    "profile-images/budget-user/photo.png",
    "create",
    true,
    1,
  );
  await run(
    "event image write",
    "event-images/budget-user/budget-event/photo.png",
    "create",
    true,
    2,
  );
  await run(
    "event report write",
    "event-reports/budget-user/budget-event/photo.png",
    "create",
    true,
    2,
  );
  await run(
    "admin MFA read",
    "profile-images/owner/photo.png",
    "get",
    true,
    1,
    { role: "admin", mfa: true },
  );
  await run(
    "admin without MFA",
    "profile-images/owner/photo.png",
    "get",
    false,
    1,
    { role: "admin" },
  );
  await run(
    "suspended read",
    "profile-images/owner/photo.png",
    "get",
    false,
    1,
    { status: "suspended" },
  );
  await run(
    "unverified read",
    "profile-images/owner/photo.png",
    "get",
    false,
    0,
    { verified: false },
  );
  await run(
    "direct chat upload",
    "chat-attachments/room/budget-user/file",
    "create",
    false,
    0,
  );
  await run(
    "direct chat metadata",
    "chat-attachments/room/budget-user/file",
    "get",
    false,
    0,
  );
  console.log(`Storage document access budget: ${checked} cases passed`);
} finally {
  await runtime.stop();
  EmulatorRegistry.client = originalClient;
}
