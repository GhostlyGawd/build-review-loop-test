import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "src/permissions/model.ts",
  "src/permissions/evaluate.ts",
  "src/PermissionsPlayground.tsx",
];
const missing = required.filter(
  (relativePath) => !existsSync(path.join(root, relativePath)),
);
const allowAbsent = process.argv.includes("--allow-absent");

if (missing.length > 0) {
  if (missing.length !== required.length) {
    console.error(
      `Partial implementation is invalid. Missing: ${missing.join(", ")}`,
    );
    process.exit(1);
  }
  if (allowAbsent) {
    console.log(
      "Public tests not activated: all three implementation files are intentionally absent.",
    );
    process.exit(0);
  }
  console.error(
    `Implementation intentionally absent. Required files: ${required.join(", ")}`,
  );
  process.exit(1);
}

const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const result = spawnSync(process.execPath, [vitest, "run", "tests/public"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
