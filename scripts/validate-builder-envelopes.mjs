import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canonicalHash,
  readJson,
  root,
  validateArtifactMode,
  validateAssignmentEnvelope,
  validateAssignmentEnvelopePair,
} from "./validate-scaffold.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
};
const loadExplicit = (input) => {
  const absolute = path.resolve(input);
  return {
    absolute,
    value: JSON.parse(readFileSync(absolute, "utf8")),
  };
};

const failures = [];
const lock = readJson("experiment/lock.json");
let envelopes;
let attestations;
let sourcePaths = [];

const fixturePath = option("--fixture");
const singlePath = option("--single");
const firstPath = option("--first");
const secondPath = option("--second");

if (fixturePath) {
  const fixture = JSON.parse(
    readFileSync(path.resolve(root, fixturePath), "utf8"),
  );
  envelopes = fixture.assignmentEnvelopes;
  attestations = fixture.assignmentEnvelopeAttestations;
  failures.push(
    ...validateAssignmentEnvelopePair(envelopes, attestations, lock),
  );
} else if (singlePath) {
  const loaded = loadExplicit(singlePath);
  envelopes = [loaded.value];
  sourcePaths = [loaded.absolute];
  failures.push(
    ...validateArtifactMode(loaded.value, "execution"),
    ...validateAssignmentEnvelope(loaded.value, lock, loaded.absolute),
  );
} else if (firstPath && secondPath) {
  const loaded = [loadExplicit(firstPath), loadExplicit(secondPath)];
  envelopes = loaded.map(({ value }) => value);
  sourcePaths = loaded.map(({ absolute }) => absolute);
  attestations = envelopes.map((envelope) => ({
    opaqueCandidateId: envelope.opaqueCandidateId,
    envelopeSha256: canonicalHash(envelope),
  }));
  envelopes.forEach((envelope) =>
    failures.push(...validateArtifactMode(envelope, "execution")),
  );
  failures.push(
    ...validateAssignmentEnvelopePair(
      envelopes,
      attestations,
      lock,
      sourcePaths,
    ),
  );
} else {
  failures.push(
    "use --fixture PATH, --single ASSIGNMENT.json, or both --first and --second assignment paths",
  );
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "valid",
      envelopeCount: envelopes.length,
      envelopeSha256: envelopes.map(canonicalHash),
      sourcePaths,
    },
    null,
    2,
  ),
);
