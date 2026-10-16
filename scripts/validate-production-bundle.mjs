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
const requiredEventImagePrefixes = [
  "event-community-",
  "event-learning-",
  "event-volunteer-",
];
const emittedEventImages = new Set();

async function scanDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const filePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await scanDirectory(filePath);
        return;
      }
      requiredEventImagePrefixes.forEach((prefix) => {
        if (entry.name.startsWith(prefix) && entry.name.endsWith(".svg")) {
          emittedEventImages.add(prefix);
        }
      });
      if (!textExtensions.has(extname(entry.name))) return;
      const contents = await readFile(filePath, "utf8");
      forbiddenPatterns.forEach(([label, pattern]) => {
        if (pattern.test(contents)) findings.push(`${label}: ${filePath}`);
      });
    }),
  );
}

await scanDirectory("dist");

requiredEventImagePrefixes.forEach((prefix) => {
  if (!emittedEventImages.has(prefix)) {
    findings.push(`missing emitted event image: ${prefix}*.svg`);
  }
});

if (findings.length > 0) {
  throw new Error(
    `Production bundle contains development-only values:\n${findings.join("\n")}`,
  );
}

console.log("Production bundle verified: no test or emulator values found.");
