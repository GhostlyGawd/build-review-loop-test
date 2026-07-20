import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const readJson = (relativePath) =>
  JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));

const requiredFiles = [
  "README.md",
  "docs/permissions-playground-spec.md",
  "docs/public-test-contract.md",
  "experiment/protocol.md",
  "experiment/rubric.md",
  "experiment/lock.json",
  "experiment/prompts/baseline-builder.md",
  "experiment/prompts/treatment-builder.md",
  "experiment/prompts/blinded-reviewer.md",
  "experiment/prompts/fixer.md",
  "experiment/prompts/blinded-evaluator.md",
  "tests/public/evaluate.test.ts",
  "tests/public/ui.test.tsx",
  "package.json",
  "package-lock.json",
  ".github/workflows/ci.yml",
];

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(root, relativePath)))
    failures.push(`missing required file: ${relativePath}`);
}

const implementationFiles = [
  "src/permissions/model.ts",
  "src/permissions/evaluate.ts",
  "src/PermissionsPlayground.tsx",
];
const implementationCount = implementationFiles.filter((file) =>
  existsSync(path.join(root, file)),
).length;
if (
  implementationCount !== 0 &&
  implementationCount !== implementationFiles.length
) {
  failures.push("implementation activation boundary is partial");
}

const schemaPairs = [
  ["experiment/schemas/experiment-lock.schema.json", "experiment/lock.json"],
  [
    "experiment/schemas/experiment-manifest.schema.json",
    "experiment/templates/experiment-manifest.json",
  ],
  [
    "experiment/schemas/run-manifest.schema.json",
    "experiment/templates/run-manifest.json",
  ],
  ["experiment/schemas/review.schema.json", "experiment/templates/review.json"],
  ["experiment/schemas/fix.schema.json", "experiment/templates/fix.json"],
  ["experiment/schemas/cost.schema.json", "experiment/templates/cost.json"],
  [
    "experiment/schemas/evaluation.schema.json",
    "experiment/templates/evaluation.json",
  ],
];
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: false,
});

for (const [schemaPath, dataPath] of schemaPairs) {
  try {
    const validate = ajv.compile(readJson(schemaPath));
    if (!validate(readJson(dataPath))) {
      failures.push(
        `${dataPath} does not validate: ${ajv.errorsText(validate.errors)}`,
      );
    }
  } catch (error) {
    failures.push(
      `${schemaPath} could not be compiled: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const lock = readJson("experiment/lock.json");
const placeholders = [
  lock.commonStartCommit,
  lock.hiddenSuiteSha256,
  lock.treatmentSkillCommit,
  lock.treatmentSkillManifestSha256,
];
if (
  lock.freezeState === "provisional" &&
  placeholders.some((value) => !value.startsWith("UNSET_"))
) {
  failures.push("provisional lock must retain all explicit UNSET placeholders");
}
if (
  lock.freezeState === "frozen" &&
  placeholders.some((value) => value.startsWith("UNSET_"))
) {
  failures.push("frozen lock contains an UNSET placeholder");
}

const evaluationTemplate = readJson("experiment/templates/evaluation.json");
const maxima = Object.fromEntries(
  evaluationTemplate.items.map(({ id, maximum }) => [id, maximum]),
);
const expectedMaxima = {
  A1: 6,
  A2: 8,
  A3: 10,
  A4: 10,
  A5: 7,
  A6: 7,
  A7: 2,
  B1: 5,
  B2: 5,
  B3: 5,
  C1: 6,
  C2: 4,
  C3: 5,
  D1: 4,
  D2: 4,
  D3: 2,
  E1: 3,
  E2: 3,
  E3: 2,
  E4: 2,
};
if (JSON.stringify(maxima) !== JSON.stringify(expectedMaxima))
  failures.push("evaluation maxima do not match rubric");
if (Object.values(maxima).reduce((sum, value) => sum + value, 0) !== 100) {
  failures.push("rubric maxima do not total 100");
}

const testFiles = readdirSync(path.join(root, "tests"), { recursive: true })
  .filter((entry) => typeof entry === "string")
  .map((entry) => entry.replaceAll("\\", "/"));
if (testFiles.some((entry) => entry.toLowerCase().includes("hidden"))) {
  failures.push(
    "hidden test material must not exist in the repository tests directory",
  );
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  `Scaffold validation passed (${schemaPairs.length} schema/data pairs; ${implementationCount === 0 ? "implementation intentionally absent" : "implementation active"}).`,
);
