import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

if (process.argv.length < 3) throw new Error("At least one path is required");

const canonicalProspective = (candidate) => {
  if (
    typeof candidate !== "string" ||
    candidate.length === 0 ||
    candidate.includes("\0")
  )
    throw new Error("Every path must be a nonempty NUL-free string");
  const requested = path.resolve(candidate);
  const missing = [];
  let cursor = requested;
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor)
      throw new Error(`No existing ancestor: ${candidate}`);
    missing.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.join(realpathSync.native(cursor), ...missing);
};

process.stdout.write(
  `${JSON.stringify(process.argv.slice(2).map(canonicalProspective))}\n`,
);
