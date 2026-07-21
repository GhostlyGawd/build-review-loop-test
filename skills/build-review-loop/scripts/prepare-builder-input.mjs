import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2)
  args.set(process.argv[index], process.argv[index + 1]);
const required = [
  "--source",
  "--destination-a",
  "--destination-b",
  "--allowlist",
  "--manifest",
  "--source-commit",
  "--source-tree",
];
for (const name of required)
  if (!args.get(name)) throw new Error(`Missing ${name}`);

const pathKey = (candidate) => path.resolve(candidate).toLowerCase();
const assertNoLinkAncestors = (candidate) => {
  let cursor = path.resolve(candidate);
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor)
      throw new Error(`No existing ancestor: ${candidate}`);
    cursor = parent;
  }
  while (true) {
    if (lstatSync(cursor).isSymbolicLink())
      throw new Error(
        `Symlink, junction, or reparse ancestor forbidden: ${cursor}`,
      );
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
};
const canonicalProspective = (candidate) => {
  const requested = path.resolve(candidate);
  assertNoLinkAncestors(requested);
  const missing = [];
  let cursor = requested;
  while (!existsSync(cursor)) {
    missing.unshift(path.basename(cursor));
    cursor = path.dirname(cursor);
  }
  const canonical = path.join(realpathSync.native(cursor), ...missing);
  if (pathKey(canonical) !== pathKey(requested))
    throw new Error(
      `Physical path alias or reparse ancestor forbidden: ${candidate}`,
    );
  return canonical;
};
const sourceRequested = path.resolve(args.get("--source"));
assertNoLinkAncestors(sourceRequested);
const source = realpathSync.native(sourceRequested);
if (pathKey(source) !== pathKey(sourceRequested))
  throw new Error("Source path must not use a physical alias");
const destinations = [
  canonicalProspective(args.get("--destination-a")),
  canonicalProspective(args.get("--destination-b")),
];
const allowlistRequested = path.resolve(args.get("--allowlist"));
assertNoLinkAncestors(allowlistRequested);
const allowlistPath = realpathSync.native(allowlistRequested);
if (pathKey(allowlistPath) !== pathKey(allowlistRequested))
  throw new Error("Allowlist path must not use a physical alias");
const manifestPath = canonicalProspective(args.get("--manifest"));
const nestedOrEqual = (left, right) => {
  const relative = path.relative(left, right);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};
if (
  destinations.some(
    (destination) =>
      nestedOrEqual(source, destination) || nestedOrEqual(destination, source),
  )
)
  throw new Error(
    "Source and builder destinations must be separate and nonnested",
  );
if (
  nestedOrEqual(destinations[0], destinations[1]) ||
  nestedOrEqual(destinations[1], destinations[0])
)
  throw new Error("Builder destinations must be separate and nonnested");
for (const destination of destinations)
  if (
    nestedOrEqual(destination, manifestPath) ||
    nestedOrEqual(path.dirname(manifestPath), destination)
  )
    throw new Error(
      "Private manifest and builder destinations must be separate and nonnested",
    );
if (!nestedOrEqual(source, allowlistPath))
  throw new Error("Allowlist must be bound inside the source repository");
if (
  nestedOrEqual(source, manifestPath) ||
  nestedOrEqual(path.dirname(manifestPath), source)
)
  throw new Error("Source and private manifest must be separate and nonnested");
const git = (cwd, gitArgs, env = {}) =>
  execFileSync("git", gitArgs, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  }).trim();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceCommit = git(source, ["rev-parse", "HEAD"]);
const sourceTree = git(source, ["rev-parse", "HEAD^{tree}"]);
if (
  sourceCommit !== args.get("--source-commit") ||
  sourceTree !== args.get("--source-tree")
)
  throw new Error("Source commit/tree binding mismatch");
if (git(source, ["status", "--porcelain=v1"]))
  throw new Error("Source must be clean");

const allowlistBytes = readFileSync(allowlistPath);
const allowlist = JSON.parse(allowlistBytes);
if (
  allowlist.version !== "1.0.0" ||
  !Array.isArray(allowlist.files) ||
  allowlist.files.length === 0
)
  throw new Error("Invalid builder allowlist");
const forbiddenDestination =
  /(^|\/)(?:experiment|skills?|sealed-hidden-suite|evidence|role-artifacts?|\.git)(?:\/|$)/i;
const forbiddenContext =
  /\bexperiment\b|review[- ]loop|hidden[- ]suite|sealed-hidden-suite|candidate[- ]?[ab]\b|treatment[- ]loop|role[- ]artifacts?|common[- ]start|external skills?|source[- ]lineage|lineage[_ -]sentinel|experiment\//i;
const seen = new Set();
const records = allowlist.files
  .map(({ source: sourcePath, destination }) => {
    if (
      typeof sourcePath !== "string" ||
      typeof destination !== "string" ||
      path.isAbsolute(sourcePath) ||
      path.isAbsolute(destination) ||
      sourcePath.includes("..") ||
      destination.includes("..") ||
      destination.includes("\\") ||
      forbiddenDestination.test(destination) ||
      seen.has(destination)
    )
      throw new Error(`Unsafe or duplicate allowlist entry: ${destination}`);
    seen.add(destination);
    const absolute = path.resolve(source, sourcePath);
    if (!absolute.startsWith(`${source}${path.sep}`) || !existsSync(absolute))
      throw new Error(`Missing allowlisted source: ${sourcePath}`);
    if (
      !lstatSync(absolute).isFile() ||
      realpathSync.native(absolute) !== absolute
    )
      throw new Error(
        `Allowlisted source must be a regular non-symlink file: ${sourcePath}`,
      );
    const bytes = readFileSync(absolute);
    if (forbiddenContext.test(bytes.toString("utf8")))
      throw new Error(
        `Forbidden contextual disclosure in projected file: ${destination}`,
      );
    return {
      path: destination,
      sha256: sha256(bytes),
      bytes: bytes.length,
      sourcePath,
      absolute,
    };
  })
  .sort((left, right) =>
    Buffer.from(left.path).compare(Buffer.from(right.path)),
  );
const projectionSha256 = sha256(
  Buffer.concat(
    records.flatMap(({ path: filePath, sha256: hash, bytes }) => [
      Buffer.from(`${filePath}\0${hash}\0${bytes}\n`, "utf8"),
    ]),
  ),
);

let projectionCommit;
let projectionTree;
for (const destination of destinations) {
  if (existsSync(destination))
    throw new Error(`Destination must not exist: ${destination}`);
  mkdirSync(destination, { recursive: true });
  if (pathKey(realpathSync.native(destination)) !== pathKey(destination))
    throw new Error("Created destination resolved through a physical alias");
  for (const record of records) {
    const output = path.join(destination, ...record.path.split("/"));
    mkdirSync(path.dirname(output), { recursive: true });
    cpSync(record.absolute, output, { errorOnExist: true, force: false });
  }
  git(destination, ["init", "--initial-branch=builder-start"]);
  git(destination, ["config", "core.autocrlf", "false"]);
  git(destination, ["config", "user.name", "Builder Input Projector"]);
  git(destination, ["config", "user.email", "builder-input@invalid.local"]);
  git(destination, ["add", "--all"]);
  const commitEnv = {
    GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
  };
  git(
    destination,
    ["commit", "-m", "Initialize neutral product task"],
    commitEnv,
  );
  const currentCommit = git(destination, ["rev-parse", "HEAD"]);
  const currentTree = git(destination, ["rev-parse", "HEAD^{tree}"]);
  if (
    projectionCommit &&
    (projectionCommit !== currentCommit || projectionTree !== currentTree)
  )
    throw new Error("Projected repositories diverged");
  projectionCommit = currentCommit;
  projectionTree = currentTree;
  if (
    git(destination, ["remote"]) ||
    git(destination, ["status", "--porcelain=v1"])
  )
    throw new Error("Projected repository is not isolated and clean");
  if (Number(git(destination, ["rev-list", "--count", "HEAD"])) !== 1)
    throw new Error("Projection must have exactly one root commit");
}
if (git(source, ["status", "--porcelain=v1"]))
  throw new Error("Source changed during projection preparation");

const manifest = {
  version: "1.0.0",
  sourceCommit,
  sourceTree,
  allowlistSha256: sha256(allowlistBytes),
  projectionSha256,
  projectionCommit,
  projectionTree,
  files: records.map(({ path: filePath, sha256: hash, bytes }) => ({
    path: filePath,
    sha256: hash,
    bytes,
  })),
};
mkdirSync(path.dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  flag: "wx",
});
