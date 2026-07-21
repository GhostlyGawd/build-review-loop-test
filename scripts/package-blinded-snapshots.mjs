import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0 ? [...pairs, [value, all[index + 1]]] : pairs,
      [],
    ),
);
if (!args["--mapping"] || !args["--output-root"] || !args["--manifest"])
  throw new Error("--mapping, --output-root, and --manifest are required");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const normalizedPath = (candidate) => {
  const absolute = path.resolve(candidate);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = realpathSync(path.dirname(absolute));
  return path.join(parent, path.basename(absolute));
};
const nestedOrEqual = (left, right) => {
  const leftPath = normalizedPath(left).toLowerCase();
  const rightPath = normalizedPath(right).toLowerCase();
  const relative = path.relative(leftPath, rightPath);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== "..")
  );
};
const assertSeparate = (left, right, label) => {
  if (nestedOrEqual(left, right) || nestedOrEqual(right, left))
    throw new Error(`${label} must be separate and nonnested`);
};
const runGit = (directory, gitArgs) => {
  const result = spawnSync("git", ["-C", directory, ...gitArgs], {
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(`git ${gitArgs.join(" ")} failed for ${directory}`);
  return result.stdout.trim();
};
const walkFiles = (rootDirectory, relativeRoot = "") => {
  const files = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = path
        .relative(rootDirectory, absolute)
        .replaceAll("\\", "/");
      const info = lstatSync(absolute);
      if (info.isSymbolicLink())
        throw new Error(`symlink forbidden: ${relative}`);
      if (info.isDirectory()) walk(absolute);
      else
        files.push([
          `${relativeRoot}${relative}`,
          sha256(readFileSync(absolute)),
        ]);
    }
  };
  walk(rootDirectory);
  return files;
};

const mappingPath = normalizedPath(args["--mapping"]);
const outputRoot = normalizedPath(args["--output-root"]);
const manifestPath = normalizedPath(args["--manifest"]);
const mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
const mappingSchemaPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "experiment",
  "schemas",
  "blinded-package-mapping.schema.json",
);
const validateMapping = new Ajv2020({
  allErrors: true,
  strict: true,
  strictTypes: false,
  validateFormats: false,
}).compile(JSON.parse(readFileSync(mappingSchemaPath, "utf8")));
if (!validateMapping(mapping))
  throw new Error(
    `mapping schema invalid: ${validateMapping.errors
      .map(({ instancePath, message }) => `${instancePath} ${message}`)
      .join("; ")}`,
  );
if (!Array.isArray(mapping.packages) || mapping.packages.length !== 3)
  throw new Error("mapping must contain exactly three packages");
const expectedLabels = ["X", "Y", "Z"];
const expectedRoles = ["B0", "T0", "Tfinal"];
const packageLabels = mapping.packages.map(({ packageLabel }) => packageLabel);
const sourceRoles = mapping.packages.map(({ sourceRole }) => sourceRole);
if (
  [...packageLabels].sort().join("\0") !== expectedLabels.join("\0") ||
  packageLabels.some((label) => !expectedLabels.includes(label))
)
  throw new Error("package labels must be the exact X/Y/Z set");
if ([...sourceRoles].sort().join("\0") !== [...expectedRoles].sort().join("\0"))
  throw new Error("source roles must be the exact B0/T0/Tfinal set");
if (
  !Array.isArray(mapping.randomizedOrder) ||
  mapping.randomizedOrder.join("\0") !== packageLabels.join("\0")
)
  throw new Error("package order must equal randomizedOrder");
if (!/^[0-9a-f]{64}$/u.test(mapping.mappingSeedSha256))
  throw new Error("mappingSeedSha256 must be lowercase SHA-256 hex");
if (!/^[0-9a-f]{64}$/u.test(mapping.frozenGateSetSha256))
  throw new Error("frozenGateSetSha256 must be lowercase SHA-256 hex");
const provenance = mapping.provenance;
for (const key of [
  "candidateIds",
  "runIds",
  "evidencePaths",
  "roleArtifactNames",
]) {
  if (
    !Array.isArray(provenance?.[key]) ||
    provenance[key].length === 0 ||
    provenance[key].some(
      (value) => typeof value !== "string" || value.trim().length === 0,
    )
  )
    throw new Error(`mapping provenance ${key} must be nonempty strings`);
}
if (provenance.evidencePaths.some((value) => !path.isAbsolute(value)))
  throw new Error("mapping provenance evidencePaths must be absolute");
if (
  mapping.packages.some(
    ({ sourceRef }) =>
      typeof sourceRef !== "string" || !sourceRef.startsWith("refs/"),
  )
)
  throw new Error("every source snapshot requires an exact sourceRef");
if (existsSync(manifestPath)) throw new Error("manifest path must not exist");
assertSeparate(outputRoot, manifestPath, "manifest and output root");
assertSeparate(outputRoot, mappingPath, "mapping and output root");

const sources = mapping.packages.map(({ sourcePath }) =>
  normalizedPath(sourcePath),
);
for (let left = 0; left < sources.length; left += 1) {
  if (!statSync(sources[left]).isDirectory())
    throw new Error("sourcePath must be a directory");
  assertSeparate(sources[left], outputRoot, "source and output root");
  assertSeparate(sources[left], manifestPath, "source and manifest");
  assertSeparate(sources[left], mappingPath, "source and mapping");
  for (let right = left + 1; right < sources.length; right += 1)
    assertSeparate(sources[left], sources[right], "source snapshots");
}
if (existsSync(outputRoot) && readdirSync(outputRoot).length !== 0)
  throw new Error("output root must be absent or empty");

const gatePaths = [
  "docs/permissions-playground-spec.md",
  "docs/public-test-contract.md",
  "tests/public",
  "scripts/run-public-tests.mjs",
  "package.json",
  "package-lock.json",
];
const gateSetFor = (source) => {
  const records = [];
  for (const relative of gatePaths) {
    const absolute = path.join(source, relative);
    if (!existsSync(absolute))
      throw new Error(`frozen gate missing: ${relative}`);
    if (statSync(absolute).isDirectory())
      records.push(...walkFiles(absolute, `${relative}/`));
    else records.push([relative, sha256(readFileSync(absolute))]);
  }
  records.sort(([left], [right]) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
  );
  return sha256(
    records.map(([name, digest]) => `${name}\0${digest}\n`).join(""),
  );
};
for (const source of sources) {
  if (gateSetFor(source) !== mapping.frozenGateSetSha256)
    throw new Error("source frozen-gate commitment mismatch");
}

mkdirSync(outputRoot, { recursive: true });
const forbiddenPath =
  /(^|\/)(\.git|\.cache|coverage|dist|experiment|node_modules|role-artifacts?|transcripts?|evidence)(\/|$)|(^|\/)(review|fix|test|cost|outcome|assignment|manifest)[^/]*\.json$/iu;
const markerVariants = (value, isPath = false) => {
  const text = String(value).toLowerCase();
  if (!isPath) return [text];
  return [
    ...new Set([text, text.replaceAll("\\", "/"), text.replaceAll("/", "\\")]),
  ];
};
const exactLineageMarkers = [
  ...mapping.packages.flatMap((spec, index) => [
    ...markerVariants(spec.sourceRef),
    ...markerVariants(spec.sourceCommit),
    ...markerVariants(spec.sourceTree),
    ...markerVariants(sources[index], true),
  ]),
  ...provenance.candidateIds.flatMap((value) => markerVariants(value)),
  ...provenance.runIds.flatMap((value) => markerVariants(value)),
  ...provenance.evidencePaths.flatMap((value) =>
    markerVariants(path.resolve(value), true),
  ),
  ...provenance.roleArtifactNames.flatMap((value) => markerVariants(value)),
  ...markerVariants(mappingPath, true),
].filter((value) => value.length > 0);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const exactRolePatterns = mapping.packages.map(
  ({ sourceRole }) =>
    new RegExp(`(^|[^a-z0-9])${escapeRegExp(sourceRole)}([^a-z0-9]|$)`, "iu"),
);
const containsPrivateLineage = (value) => {
  const text = value.toLowerCase();
  return (
    exactLineageMarkers.some((marker) => text.includes(marker)) ||
    exactRolePatterns.some((pattern) => pattern.test(value))
  );
};
const policy =
  "verify core.autocrlf=false clean source ref/commit/tree and frozen gates; exclude git/protocol/role/evidence artifacts; reject exact private mapping/provenance markers; allow generic product/dependency vocabulary; normalize mtimes; hash sorted relative-path,NUL,file-hash records";
const epoch = new Date("2000-01-01T00:00:00.000Z");
const results = [];
for (const [index, spec] of mapping.packages.entries()) {
  const source = sources[index];
  if (!existsSync(path.join(source, ".git")))
    throw new Error("source snapshot must be an independent Git clone");
  if (runGit(source, ["config", "--bool", "core.autocrlf"]) !== "false")
    throw new Error("source snapshot must bind core.autocrlf=false");
  if (
    runGit(source, ["rev-parse", "HEAD"]) !== spec.sourceCommit ||
    runGit(source, ["rev-parse", "HEAD^{tree}"]) !== spec.sourceTree
  )
    throw new Error("source commit/tree does not match mapping");
  if (runGit(source, ["rev-parse", spec.sourceRef]) !== spec.sourceCommit)
    throw new Error("source ref does not resolve to mapped commit");
  if (runGit(source, ["status", "--porcelain=v1"]) !== "")
    throw new Error("source snapshot must be clean");
  const destination = path.join(outputRoot, spec.packageLabel);
  cpSync(source, destination, {
    recursive: true,
    filter: (entry) => {
      const relative = path.relative(source, entry).replaceAll("\\", "/");
      return relative === "" || !forbiddenPath.test(relative);
    },
  });
  const files = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = path
        .relative(destination, absolute)
        .replaceAll("\\", "/");
      if (containsPrivateLineage(relative))
        throw new Error(
          `private lineage marker forbidden in path: ${relative}`,
        );
      const info = lstatSync(absolute);
      if (info.isSymbolicLink())
        throw new Error(`symlink forbidden: ${relative}`);
      if (info.isDirectory()) {
        walk(absolute);
        utimesSync(absolute, epoch, epoch);
      } else {
        const bytes = readFileSync(absolute);
        if (containsPrivateLineage(bytes.toString("utf8")))
          throw new Error(`private lineage marker forbidden: ${relative}`);
        files.push([relative, sha256(bytes)]);
        utimesSync(absolute, epoch, epoch);
      }
    }
  };
  walk(destination);
  utimesSync(destination, epoch, epoch);
  files.sort(([left], [right]) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
  );
  const packageSha256 = sha256(
    files.map(([name, digest]) => `${name}\0${digest}\n`).join(""),
  );
  results.push({
    packageLabel: spec.packageLabel,
    packageSha256,
    fileCount: files.length,
    historyFree: !existsSync(path.join(destination, ".git")),
    lineageScanPassed: true,
    timestampsNormalized: true,
  });
}
const manifest = {
  manifestVersion: "1.0.0",
  mappingSeedSha256: mapping.mappingSeedSha256,
  randomizedOrder: mapping.randomizedOrder,
  frozenGateSetSha256: mapping.frozenGateSetSha256,
  packages: results,
  sanitizationPolicySha256: sha256(policy),
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  flag: "wx",
});
process.stdout.write(`${JSON.stringify(manifest)}\n`);
