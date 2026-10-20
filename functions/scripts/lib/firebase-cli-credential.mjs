import {createRequire} from "node:module";
import {existsSync, readdirSync, statSync} from "node:fs";
import {homedir} from "node:os";
import {join, resolve} from "node:path";

const packageRoots = () => {
  const roots = [resolve("node_modules/firebase-tools")];
  const npxRoot = join(homedir(), ".npm", "_npx");
  if (existsSync(npxRoot)) {
    roots.push(
      ...readdirSync(npxRoot).map((entry) =>
        join(npxRoot, entry, "node_modules", "firebase-tools"),
      ),
    );
  }
  return roots
    .filter((root) => existsSync(join(root, "lib", "auth.js")))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
};

export const loadFirebaseCliOAuth = () => {
  const firebaseToolsRoot = packageRoots()[0];
  if (!firebaseToolsRoot) {
    throw new Error(
      "Firebase CLI module was not found. Run npx -y firebase-tools@latest --version first.",
    );
  }
  const require = createRequire(import.meta.url);
  const {getGlobalDefaultAccount} = require(
    join(firebaseToolsRoot, "lib", "auth.js"),
  );
  const {clientId, clientSecret} = require(
    join(firebaseToolsRoot, "lib", "api.js"),
  );
  const refreshToken = getGlobalDefaultAccount()?.tokens?.refresh_token;
  if (!refreshToken) throw new Error("Firebase CLI is not logged in.");
  return {clientId: clientId(), clientSecret: clientSecret(), refreshToken};
};
