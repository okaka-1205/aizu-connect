import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const forbiddenPatterns = [
  ["E2E Firebase project", /demo-aizu-connect/i],
  ["local Auth emulator", /127\.0\.0\.1:19099/i],
  ["test student account", /student-e2e@u-aizu\.ac\.jp/i],
  ["development admin account", /admin@aizu-connect\.local/i],
  ["development admin password", /admin123/i],
  ["test password", /password123/i],
  ["placeholder image service", /placehold\.co/i],
];
const textExtensions = new Set([".css", ".html", ".js", ".json", ".map"]);
const findings = [];

async function scanDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const filePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await scanDirectory(filePath);
        return;
      }
      if (!textExtensions.has(extname(entry.name))) return;
      const contents = await readFile(filePath, "utf8");
      forbiddenPatterns.forEach(([label, pattern]) => {
        if (pattern.test(contents)) findings.push(`${label}: ${filePath}`);
      });
    }),
  );
}

await scanDirectory("dist");

if (findings.length > 0) {
  throw new Error(
    `Production bundle contains development-only values:\n${findings.join("\n")}`,
  );
}

console.log("Production bundle verified: no test or emulator values found.");
