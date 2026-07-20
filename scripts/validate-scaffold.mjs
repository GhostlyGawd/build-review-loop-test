import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const readJson = (relativePath) =>
  JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const sha256Bytes = (value) => createHash("sha256").update(value).digest("hex");
const uint64be = (value) => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(value));
  return buffer;
};

export const rubricMaxima = {
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

const allowedScores = {
  A1: [0, 3, 6],
  A2: [0, 4, 8],
  A3: [0, 4, 7, 10],
  A4: [0, 4, 7, 10],
  A5: [0, 4, 7],
  A6: [0, 4, 7],
  A7: [0, 1, 2],
  B1: [0, 3, 5],
  B2: [0, 3, 5],
  B3: [0, 3, 5],
  C1: [0, 3, 6],
  C2: [0, 2, 4],
  C3: [0, 3, 5],
  D1: [0, 2, 4],
  D2: [0, 2, 4],
  D3: [0, 1, 2],
  E1: [0, 1, 2, 3],
  E2: [0, 1, 2, 3],
  E3: [0, 1, 2],
  E4: [0, 1, 2],
};

const sameSnapshot = (left, right) =>
  left != null &&
  right != null &&
  left.commit === right.commit &&
  left.treeSha256 === right.treeSha256;

export function validateAssignmentSemantics(manifest) {
  const failures = [];
  const { assignment, evaluationRandomization } = manifest;
  const sortedIds = ["candidate-a", "candidate-b"]
    .map((id) => Buffer.from(id, "utf8"))
    .sort(Buffer.compare);
  const expectedAssignmentDigest = sha256Bytes(
    Buffer.concat([
      Buffer.from("build-review-loop-assignment-v2\0", "ascii"),
      Buffer.from(assignment.seedHex, "hex"),
      uint64be(sortedIds[0].length),
      sortedIds[0],
      uint64be(sortedIds[1].length),
      sortedIds[1],
    ]),
  );
  if (assignment.digestSha256 !== expectedAssignmentDigest)
    failures.push("assignment digest does not match the recorded 32-byte seed");
  const expectedDraw =
    Number.parseInt(expectedAssignmentDigest.slice(0, 2), 16) & 1;
  if (assignment.draw !== expectedDraw)
    failures.push("assignment draw is not digest byte 0 least-significant bit");
  const sortedLabels = sortedIds.map((id) => id.toString("utf8"));
  const expectedMapping = Object.fromEntries(
    sortedLabels.map((id, index) => [
      id,
      index === expectedDraw ? "baseline" : "treatment",
    ]),
  );
  if (JSON.stringify(assignment.mapping) !== JSON.stringify(expectedMapping))
    failures.push("assignment mapping does not match the registered algorithm");
  if (new Set(Object.values(assignment.mapping)).size !== 2)
    failures.push("assignment must map exactly one candidate to each arm");

  const expectedEvaluationDigest = sha256(
    `permissions-playground/protocol-v2/evaluation\n${evaluationRandomization.seedHex}`,
  );
  if (evaluationRandomization.digestSha256 !== expectedEvaluationDigest)
    failures.push("evaluation digest does not match the recorded 32-byte seed");
  const ranked = ["B0", "T0", "Tfinal"]
    .map((snapshot) => [
      snapshot,
      sha256(`${expectedEvaluationDigest}\n${snapshot}`),
    ])
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([snapshot]) => snapshot);
  const expectedBlindMapping = { X: ranked[0], Y: ranked[1], Z: ranked[2] };
  if (
    JSON.stringify(evaluationRandomization.mapping) !==
    JSON.stringify(expectedBlindMapping)
  )
    failures.push("X/Y/Z mapping does not match the registered rank algorithm");
  if (new Set(Object.values(evaluationRandomization.mapping)).size !== 3)
    failures.push("X/Y/Z mapping must be a bijection over B0/T0/Tfinal");
  return failures;
}

export function validateRunManifestSemantics(run) {
  const failures = [];
  run.cycles.forEach((cycle, index) => {
    if (cycle.number !== index + 1)
      failures.push("treatment cycle numbers must be contiguous from 1");
    if (cycle.reviewFindingCount === 0) {
      if (
        cycle.decision !== "zero-findings" ||
        cycle.fixArtifactSha256 !== null ||
        cycle.testArtifactSha256 !== null ||
        cycle.outputSnapshot !== null
      )
        failures.push("zero-findings cycle must stop before fixer and tester");
    } else if (
      cycle.fixArtifactSha256 === null ||
      cycle.testArtifactSha256 === null ||
      cycle.outputSnapshot === null
    ) {
      failures.push("nonzero-finding cycle requires fixer, tester, and output");
    }
    if (index === 0 && run.initialSnapshot !== null) {
      if (!sameSnapshot(cycle.inputSnapshot, run.initialSnapshot))
        failures.push(
          "cycle 1 input must equal the treatment initial snapshot",
        );
    } else if (index > 0) {
      const prior = run.cycles[index - 1].outputSnapshot;
      if (!sameSnapshot(cycle.inputSnapshot, prior))
        failures.push("each cycle input must equal the prior cycle output");
    }
  });

  if (run.assignedArm === "baseline") {
    if (run.cycles.length !== 0)
      failures.push("baseline must have exactly zero treatment cycles");
    if (!sameSnapshot(run.initialSnapshot, run.finalSnapshot))
      failures.push(
        "baseline final snapshot must equal its frozen initial snapshot",
      );
    if (run.stopReason !== "baseline-zero-cycles")
      failures.push("baseline stop reason must be baseline-zero-cycles");
    if (run.convergence !== null)
      failures.push("baseline convergence must be null because no loop ran");
  }

  if (run.assignedArm === "treatment" && run.status === "valid") {
    const last = run.cycles.at(-1);
    if (!last) failures.push("valid treatment must record at least one cycle");
    if (run.cycles.length > 5)
      failures.push("treatment may not exceed five cycles");
    if (
      run.stopReason === "zero-findings" &&
      last?.decision !== "zero-findings"
    )
      failures.push("zero-findings stop must be the final cycle decision");
    if (run.stopReason === "zero-findings" && run.convergence !== true)
      failures.push("zero-findings stop requires convergence true");
    if (
      run.stopReason === "max-cycles" &&
      (run.cycles.length !== 5 || last?.decision !== "max-cycles")
    )
      failures.push("max-cycles stop requires exactly five cycles");
    if (run.stopReason === "max-cycles" && run.convergence !== false)
      failures.push("max-cycles stop requires convergence false");
    const expectedFinal =
      last?.outputSnapshot ?? last?.inputSnapshot ?? run.initialSnapshot;
    if (!sameSnapshot(run.finalSnapshot, expectedFinal))
      failures.push(
        "treatment final snapshot does not match its stopping snapshot",
      );
  }

  run.evidenceChain.forEach((link, index) => {
    if (link.sequence !== index)
      failures.push("evidence-chain sequence must be contiguous from zero");
    const expectedPrevious =
      index === 0 ? null : run.evidenceChain[index - 1].artifactSha256;
    if (link.previousSha256 !== expectedPrevious)
      failures.push("evidence-chain predecessor hash mismatch");
  });
  return failures;
}

export function validateEvaluationSemantics(evaluation) {
  const failures = [];
  const ids = Object.keys(rubricMaxima);
  if (evaluation.items.map(({ id }) => id).join(",") !== ids.join(","))
    failures.push("evaluation items must contain each rubric ID once in order");
  for (const item of evaluation.items) {
    if (item.maximum !== rubricMaxima[item.id])
      failures.push(`${item.id} maximum does not match the frozen rubric`);
    if (!allowedScores[item.id]?.includes(item.score))
      failures.push(`${item.id} score is not a written rubric anchor`);
  }
  const sectionGroups = {
    functional: ids.filter((id) => id.startsWith("A")),
    robustnessSecurity: ids.filter((id) => id.startsWith("B")),
    accessibilityUsability: ids.filter((id) => id.startsWith("C")),
    testEffectiveness: ids.filter((id) => id.startsWith("D")),
    maintainabilityDocs: ids.filter((id) => id.startsWith("E")),
  };
  const scores = Object.fromEntries(
    evaluation.items.map(({ id, score }) => [id, score]),
  );
  for (const [section, sectionIds] of Object.entries(sectionGroups)) {
    const expected = sectionIds.reduce((sum, id) => sum + scores[id], 0);
    if (evaluation.sectionTotals[section] !== expected)
      failures.push(`${section} subtotal arithmetic is incorrect`);
  }
  const expectedUncapped = Object.values(evaluation.sectionTotals).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (evaluation.uncappedTotal !== expectedUncapped)
    failures.push("uncapped total does not equal section totals");

  const expectedCaps = [];
  if (evaluation.capConditions.buildFailedOrCannotRender) {
    expectedCaps.push("functional-section-10");
    if (evaluation.sectionTotals.functional > 10)
      failures.push("functional build/render cap was not applied to section A");
  }
  if (evaluation.capConditions.defaultAllow) {
    expectedCaps.push("default-allow-A2-A3-combined-4");
    if (scores.A2 + scores.A3 > 4)
      failures.push("default-allow cap was not applied to A2+A3");
  }
  let expectedFinal = expectedUncapped;
  if (evaluation.capConditions.executableInjectionOrUnexpectedNetwork) {
    expectedCaps.push("overall-security-50");
    expectedFinal = Math.min(expectedFinal, 50);
  }
  if (JSON.stringify(evaluation.capsApplied) !== JSON.stringify(expectedCaps))
    failures.push(
      "capsApplied does not match cap conditions in registered order",
    );
  if (evaluation.finalTotal !== expectedFinal)
    failures.push(
      "finalTotal does not apply the registered overall cap arithmetic",
    );
  return failures;
}

export function validateOutcomeSemantics(outcome) {
  const failures = [];
  if (new Set(Object.values(outcome.packageMapping)).size !== 3)
    failures.push("outcome X/Y/Z mapping must be a bijection");
  if (
    outcome.primaryTfinalMinusB0 !==
    outcome.scores.Tfinal - outcome.scores.B0
  )
    failures.push("primary Tfinal-B0 arithmetic is incorrect");
  if (
    outcome.secondaryTfinalMinusT0 !==
    outcome.scores.Tfinal - outcome.scores.T0
  )
    failures.push("secondary Tfinal-T0 arithmetic is incorrect");
  const expectedWinner =
    outcome.scores.Tfinal > outcome.scores.B0 ? "treatment" : "baseline";
  if (outcome.mainSelection !== expectedWinner)
    failures.push(
      "main selection must choose the higher score and baseline on ties",
    );
  return failures;
}

export function validateCostSemantics(cost) {
  const failures = [];
  const maxima = {
    builder: 2400,
    reviewer: 900,
    fixer: 1500,
    tester: 900,
    evaluator: 1800,
  };
  if (cost.wallSecondsMaximum !== maxima[cost.role])
    failures.push("role wall budget does not match protocol");
  if (cost.wallSeconds > cost.wallSecondsMaximum)
    failures.push("recorded role wall time exceeds its prospective budget");
  if (
    ["reviewer", "fixer", "tester"].includes(cost.role) &&
    cost.cycle === null
  )
    failures.push("cycle role cost must name its cycle");
  if (
    !["reviewer", "fixer", "tester"].includes(cost.role) &&
    cost.cycle !== null
  )
    failures.push("non-cycle role cost must have a null cycle");
  if (cost.role === "evaluator" && cost.packageLabel !== null)
    failures.push("one evaluator turn covers all X/Y/Z packages");
  return failures;
}

export function validateScaffold() {
  const failures = [];
  const requiredFiles = [
    "README.md",
    "docs/permissions-playground-spec.md",
    "docs/public-test-contract.md",
    "experiment/protocol.md",
    "experiment/rubric.md",
    "experiment/lock.json",
    "experiment/builder-config.json",
    "experiment/treatment-loop-algorithm.md",
    "experiment/prompts/neutral-builder.md",
    "experiment/prompts/blinded-reviewer.md",
    "experiment/prompts/fixer.md",
    "experiment/prompts/tester.md",
    "experiment/prompts/blinded-evaluator.md",
    "experiment/schemas/finding.schema.json",
    "experiment/schemas/test.schema.json",
    "experiment/schemas/outcome.schema.json",
    "experiment/templates/test.json",
    "experiment/templates/outcome.json",
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
  for (const obsolete of [
    "experiment/prompts/baseline-builder.md",
    "experiment/prompts/treatment-builder.md",
  ]) {
    if (existsSync(path.join(root, obsolete)))
      failures.push(`obsolete builder prompt remains: ${obsolete}`);
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
  )
    failures.push("implementation activation boundary is partial");

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
    [
      "experiment/schemas/review.schema.json",
      "experiment/templates/review.json",
    ],
    ["experiment/schemas/fix.schema.json", "experiment/templates/fix.json"],
    ["experiment/schemas/test.schema.json", "experiment/templates/test.json"],
    ["experiment/schemas/cost.schema.json", "experiment/templates/cost.json"],
    [
      "experiment/schemas/evaluation.schema.json",
      "experiment/templates/evaluation.json",
    ],
    [
      "experiment/schemas/outcome.schema.json",
      "experiment/templates/outcome.json",
    ],
  ];
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictTypes: false,
    validateFormats: false,
  });
  ajv.addSchema(readJson("experiment/schemas/finding.schema.json"));
  for (const [schemaPath, dataPath] of schemaPairs) {
    try {
      const validate = ajv.compile(readJson(schemaPath));
      if (!validate(readJson(dataPath)))
        failures.push(
          `${dataPath} does not validate: ${ajv.errorsText(validate.errors)}`,
        );
    } catch (error) {
      failures.push(
        `${schemaPath} could not be compiled: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const lock = readJson("experiment/lock.json");
  const commitmentKeys = [
    "lockParentCommit",
    "hiddenSuiteSha256",
    "treatmentSkillCommit",
    "treatmentSkillTree",
    "treatmentSkillManifestSha256",
    "treatmentAlgorithmSha256",
    "neutralBuilderPromptSha256",
    "neutralBuilderConfigSha256",
  ];
  const algorithmText = readFileSync(
    path.join(root, "experiment/treatment-loop-algorithm.md"),
    "utf8",
  );
  const actualPromptHash = sha256(
    readFileSync(
      path.join(root, "experiment/prompts/neutral-builder.md"),
      "utf8",
    ),
  );
  const actualConfigHash = sha256(
    readFileSync(path.join(root, "experiment/builder-config.json"), "utf8"),
  );
  const actualAlgorithmHash = sha256(algorithmText);
  if (
    !lock.neutralBuilderPromptSha256.startsWith("UNSET_") &&
    lock.neutralBuilderPromptSha256 !== actualPromptHash
  )
    failures.push("neutral builder prompt hash mismatch");
  if (
    !lock.neutralBuilderConfigSha256.startsWith("UNSET_") &&
    lock.neutralBuilderConfigSha256 !== actualConfigHash
  )
    failures.push("neutral builder config hash mismatch");
  if (
    !lock.treatmentAlgorithmSha256.startsWith("UNSET_") &&
    lock.treatmentAlgorithmSha256 !== actualAlgorithmHash
  )
    failures.push("treatment algorithm hash mismatch");
  const finalSkillCommitments = {
    treatmentSkillCommit: "de1747fb46ed5b052e5507d2cd3c5c02cf87d73b",
    treatmentSkillTree: "d53d15935764d36a3f9272bbc0ae5c5c30008288",
    treatmentSkillManifestSha256:
      "45ccaed2d7812d646595c2cc7c27ff1c942ceefad8006d2093448a18e3e1ccb2",
  };
  for (const [key, expected] of Object.entries(finalSkillCommitments)) {
    if (!lock[key].startsWith("UNSET_") && lock[key] !== expected)
      failures.push(`${key} does not match the supplied final skill-v1 freeze`);
  }
  if (lock.freezeState === "provisional") {
    if (!commitmentKeys.some((key) => lock[key].startsWith("UNSET_")))
      failures.push(
        "provisional lock must retain at least one explicit UNSET commitment",
      );
  } else {
    if (commitmentKeys.some((key) => lock[key].startsWith("UNSET_")))
      failures.push("frozen lock contains an UNSET commitment");
    if (lock.neutralBuilderPromptSha256 !== actualPromptHash)
      failures.push("locked neutral builder prompt hash mismatch");
    if (lock.neutralBuilderConfigSha256 !== actualConfigHash)
      failures.push("locked neutral builder config hash mismatch");
    if (lock.treatmentAlgorithmSha256 !== actualAlgorithmHash)
      failures.push("locked treatment algorithm hash mismatch");
  }

  const builderConfig = readJson("experiment/builder-config.json");
  if (
    builderConfig.turnLimit !== 1 ||
    builderConfig.wallSecondsMaximum !== 2400 ||
    builderConfig.tokenCeiling !== null ||
    !builderConfig.tokenCeilingUnavailableReason
  )
    failures.push(
      "neutral builder config violates prospective budget invariants",
    );
  const neutralPrompt = readFileSync(
    path.join(root, "experiment/prompts/neutral-builder.md"),
    "utf8",
  );
  if (
    /treatment skill|review-loop skill|use the provided skill/i.test(
      neutralPrompt,
    )
  )
    failures.push("neutral builder prompt exposes treatment skill information");

  failures.push(
    ...validateAssignmentSemantics(
      readJson("experiment/templates/experiment-manifest.json"),
    ),
    ...validateRunManifestSemantics(
      readJson("experiment/templates/run-manifest.json"),
    ),
    ...validateEvaluationSemantics(
      readJson("experiment/templates/evaluation.json"),
    ),
    ...validateOutcomeSemantics(readJson("experiment/templates/outcome.json")),
    ...validateCostSemantics(readJson("experiment/templates/cost.json")),
  );

  if (
    Object.values(rubricMaxima).reduce((sum, value) => sum + value, 0) !== 100
  )
    failures.push("rubric maxima do not total 100");
  const testFiles = readdirSync(path.join(root, "tests"), { recursive: true })
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.replaceAll("\\", "/"));
  if (testFiles.some((entry) => entry.toLowerCase().includes("hidden")))
    failures.push(
      "hidden test material must not exist in the repository tests directory",
    );

  return { failures, schemaPairCount: schemaPairs.length, implementationCount };
}

const isEntrypoint =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  const { failures, schemaPairCount, implementationCount } = validateScaffold();
  if (failures.length > 0) {
    console.error(failures.map((failure) => `- ${failure}`).join("\n"));
    process.exit(1);
  }
  console.log(
    `Protocol 2.0.0 scaffold validation passed (${schemaPairCount} schema/data pairs; ${implementationCount === 0 ? "implementation intentionally absent" : "implementation active"}).`,
  );
}
