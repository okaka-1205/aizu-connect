import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const lock = JSON.parse(
  fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
);
const outputPath = path.join(root, "public", "open-source-notices.txt");

const packageEntries = Object.entries(lock.packages)
  .filter(([packagePath, metadata]) =>
    packagePath.startsWith("node_modules/") && metadata.dev !== true,
  )
  .map(([packagePath, metadata]) => {
    const absolutePath = path.join(root, packagePath);
    const packageJsonPath = path.join(absolutePath, "package.json");
    const packageJson = fs.existsSync(packageJsonPath)
      ? JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
      : {};
    const licenseFile = fs.existsSync(absolutePath)
      ? fs
          .readdirSync(absolutePath)
          .find((fileName) =>
            /^(licen[cs]e|copying|notice)(\.|$)/i.test(fileName),
          )
      : undefined;
    return {
      name:
        packageJson.name ??
        packagePath.slice(packagePath.lastIndexOf("node_modules/") + 13),
      version: metadata.version ?? packageJson.version ?? "unknown",
      license: metadata.license ?? packageJson.license ?? "SEE UPSTREAM",
      repository:
        typeof packageJson.repository === "string"
          ? packageJson.repository
          : packageJson.repository?.url ?? packageJson.homepage ?? "",
      licenseText: licenseFile
        ? fs
            .readFileSync(path.join(absolutePath, licenseFile), "utf8")
            .replace(/\r\n?/g, "\n")
            .split("\n")
            .map((line) => line.replace(/[ \t]+$/u, ""))
            .join("\n")
            .trim()
        : "",
    };
  })
  .sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(
      `${right.name}@${right.version}`,
    ),
  );

const licenseGroups = new Map();
for (const dependency of packageEntries) {
  if (!dependency.licenseText) continue;
  const users = licenseGroups.get(dependency.licenseText) ?? [];
  users.push(`${dependency.name}@${dependency.version}`);
  licenseGroups.set(dependency.licenseText, users);
}

const lines = [
  "Aizu Connect Open Source Software Notices",
  "==========================================",
  "",
  "This file lists production dependencies from package-lock.json and reproduces",
  "license or notice texts shipped in their installed packages. Dependencies that",
  "do not ship a separate text file remain listed with their declared SPDX license",
  "and upstream repository. This notice does not change any upstream license.",
  "",
  "PACKAGE INVENTORY",
  "-----------------",
  ...packageEntries.map(
    ({ name, version, license, repository }) =>
      `${name}@${version} | ${license}${repository ? ` | ${repository}` : ""}`,
  ),
  "",
  "LICENSE AND NOTICE TEXTS",
  "------------------------",
];

for (const [licenseText, users] of [...licenseGroups.entries()].sort(
  ([, left], [, right]) => left[0].localeCompare(right[0]),
)) {
  lines.push("", `Applies to: ${users.join(", ")}`, "", licenseText, "");
}

fs.writeFileSync(outputPath, `${lines.join("\n").trimEnd()}\n`, "utf8");
console.log(
  `Generated ${path.relative(root, outputPath)} for ${packageEntries.length} production packages.`,
);
