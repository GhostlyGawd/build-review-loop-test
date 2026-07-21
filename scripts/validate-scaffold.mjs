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
const canonicalDomain = Buffer.from(
  "permissions-playground/canonical-json-v1\0",
  "ascii",
);
const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new TypeError("canonical JSON numbers must be safe integers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort(compareUtf8)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError(`unsupported canonical JSON type: ${typeof value}`);
}

export const canonicalHash = (value) =>
  sha256Bytes(
    Buffer.concat([canonicalDomain, Buffer.from(canonicalJson(value), "utf8")]),
  );
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
    unblinder: 300,
    git_worker: 600,
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
  if (cost.maxTokens !== null || !cost.maxTokensUnavailableReason)
    failures.push("unavailable maxTokens must be null with a reason");
  if (!cost.environmentSha256)
    failures.push("every cost record must bind the environment hash");
  if (
    ["builder", "reviewer", "fixer", "tester", "evaluator"].includes(
      cost.role,
    ) &&
    !cost.modelConfigSha256
  )
    failures.push("model role cost must bind the model/config hash");
  if (
    ["unblinder", "git_worker"].includes(cost.role) &&
    cost.modelConfigSha256 === null &&
    !cost.modelConfigUnavailableReason
  )
    failures.push("non-model role must explain unavailable model/config hash");
  return failures;
}

const walkValues = (value, visit, pathParts = []) => {
  visit(value, pathParts);
  if (Array.isArray(value))
    value.forEach((item, index) =>
      walkValues(item, visit, [...pathParts, index]),
    );
  else if (value && typeof value === "object")
    Object.entries(value).forEach(([key, item]) =>
      walkValues(item, visit, [...pathParts, key]),
    );
};

export function validateArtifactMode(value, mode, templateValues = []) {
  if (!new Set(["template", "execution"]).has(mode))
    return ["validation mode must be explicitly template or execution"];
  if (mode === "template") return [];
  const failures = [];
  walkValues(value, (item, pathParts) => {
    if (typeof item !== "string") return;
    const location = pathParts.join(".");
    if (/^(0{40}|0{64})$/.test(item))
      failures.push(`execution record contains zero hash/seed at ${location}`);
    if (/required-at-run|template-|placeholder|sentinel/i.test(item))
      failures.push(
        `execution record contains a template sentinel at ${location}`,
      );
    if (pathParts.at(-1) === "freezeState" && item === "provisional")
      failures.push("execution record cannot use a provisional lock");
  });
  for (const template of templateValues) {
    if (canonicalJson(value) === canonicalJson(template))
      failures.push("execution record is unchanged from a template");
  }
  return failures;
}

const sha256Pattern = /^[0-9a-f]{64}$/;
const nonzeroSha256 = (value) =>
  typeof value === "string" && sha256Pattern.test(value) && !/^0+$/.test(value);
const exactKeys = (value, expected) =>
  value != null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort(compareUtf8)) ===
    JSON.stringify([...expected].sort(compareUtf8));

export function validateExperimentConclusion(record) {
  const failures = [];
  const activeFields = [
    "invalidationId",
    "scope",
    "code",
    "reason",
    "detectedAt",
    "evidenceSha256",
    "preservedArtifactSha256",
  ];
  const attemptFields = [
    "attemptId",
    "scope",
    "code",
    "reason",
    "invalidatedAt",
    "evidenceSha256",
    "preservedArtifactSha256",
  ];
  const validateInvalidation = (value, fields, timestampField, label) => {
    if (!exactKeys(value, fields)) {
      failures.push(`${label} must contain exactly the canonical fields`);
      return;
    }
    for (const field of fields.slice(0, 4)) {
      if (typeof value[field] !== "string" || value[field].length === 0)
        failures.push(`${label}.${field} must be a non-empty string`);
    }
    if (
      typeof value[timestampField] !== "string" ||
      Number.isNaN(Date.parse(value[timestampField]))
    )
      failures.push(`${label}.${timestampField} must be a timestamp`);
    for (const field of ["evidenceSha256", "preservedArtifactSha256"]) {
      if (!nonzeroSha256(value[field]))
        failures.push(`${label}.${field} must be a nonzero SHA-256`);
    }
  };

  if (!new Set(["valid", "invalid"]).has(record.status))
    failures.push("completed experiment status must be valid or invalid");
  if (!Array.isArray(record.invalidAttempts))
    failures.push("invalidAttempts must be an array");
  else
    record.invalidAttempts.forEach((attempt, index) =>
      validateInvalidation(
        attempt,
        attemptFields,
        "invalidatedAt",
        `invalidAttempts[${index}]`,
      ),
    );

  if (record.status === "valid") {
    if (record.activeInvalidation !== null)
      failures.push("valid experiment activeInvalidation must be null");
    if (!Array.isArray(record.evaluations) || record.evaluations.length !== 3)
      failures.push("valid experiment requires exactly three evaluations");
    if (record.outcome == null)
      failures.push("valid experiment requires a scored outcome");
  }
  if (record.status === "invalid") {
    validateInvalidation(
      record.activeInvalidation,
      activeFields,
      "detectedAt",
      "activeInvalidation",
    );
    if (record.evaluations !== null)
      failures.push("invalid experiment evaluations must be null");
    if (record.outcome !== null)
      failures.push("invalid experiment outcome must be null");
  }
  if (record.activeInvalidation != null && record.outcome != null)
    failures.push("active invalidation forbids a scored outcome");
  return failures;
}

export function validateCanonicalContract(contract) {
  const failures = [];
  const findingSchema = readJson("experiment/schemas/finding.schema.json");
  const exactFindingFields = [
    "id",
    "severity",
    "title",
    "evidence",
    "expected",
    "actual",
    "rubricItems",
    "verification",
    "duplicateOf",
  ];
  if (
    JSON.stringify(contract.finding.requiredFields) !==
      JSON.stringify(exactFindingFields) ||
    JSON.stringify(findingSchema.required) !==
      JSON.stringify(exactFindingFields)
  )
    failures.push("canonical finding fields diverge from finding.schema.json");
  if (
    JSON.stringify(contract.finding.severities) !==
    JSON.stringify(["critical", "high", "medium", "low"])
  )
    failures.push("canonical finding severities diverge");
  if (contract.stopping.baselineStopReason !== "baseline-zero-cycles")
    failures.push("canonical baseline stop reason diverges");
  if (
    contract.evaluationRandomization.domainUtf8 !==
      "permissions-playground/protocol-v2/evaluation\n" ||
    contract.evaluationRandomization.rankMaterial !==
      "64 lowercase digest-hex ASCII bytes followed by newline and snapshot-name UTF-8 bytes" ||
    JSON.stringify(contract.evaluationRandomization.labelsByRank) !==
      JSON.stringify(["X", "Y", "Z"])
  )
    failures.push("canonical X/Y/Z randomization bytes or ordering diverge");
  if (
    contract.evidenceChain.sequenceStartsAt !== 0 ||
    contract.evidenceChain.firstPreviousSha256 !== null ||
    contract.evidenceChain.linkRule !==
      "entry[n].previousSha256 equals entry[n-1].artifactSha256"
  )
    failures.push("canonical evidence-chain algorithm diverges");
  const expectedRubric = Object.entries(rubricMaxima).map(([id, maximum]) => ({
    id,
    maximum,
    anchors: allowedScores[id],
  }));
  if (
    JSON.stringify(contract.evaluation.rubricItems) !==
    JSON.stringify(expectedRubric)
  )
    failures.push("canonical rubric IDs, anchors, or maxima diverge");
  if (
    JSON.stringify(contract.evaluation.sectionMaxima) !==
    JSON.stringify({
      functional: 50,
      robustnessSecurity: 15,
      accessibilityUsability: 15,
      testEffectiveness: 10,
      maintainabilityDocs: 10,
    })
  )
    failures.push("canonical rubric section maxima diverge");
  const expectedRoleBudgets = {
    builder: 2400,
    reviewer: 900,
    fixer: 1500,
    tester: 900,
    evaluator: 1800,
    unblinder: 300,
    git_worker: 600,
  };
  for (const [role, maximum] of Object.entries(expectedRoleBudgets)) {
    if (contract.roles[role]?.wallSecondsMaximum !== maximum)
      failures.push(`canonical ${role} wall budget diverges`);
  }
  if (
    contract.costPolicy.maxTokens !== null ||
    contract.costPolicy.maxTokensUnavailableReasonRequired !== true
  )
    failures.push("canonical unavailable maxTokens policy diverges");
  const expectedGates = [
    "npm run format:check",
    "npm run lint",
    "npm run typecheck",
    "npm run validate:scaffold",
    "npm run test:protocol",
    "npm run test:public:if-implemented",
    "npm run build",
  ];
  if (
    contract.builderFreeze?.promptSha256 !==
      "7aa6ed9b0583ea2d5e555f26a354b2a9887851b2ded6e1930ec00772376e7b82" ||
    contract.builderFreeze?.configSha256 !==
      "caf42a587e56b1b9ffcacf29047fbc69e80cba52188d6f4363a489ec84a5b40b" ||
    contract.builderFreeze?.rule !==
      "every builder freeze must equal both canonical hashes and the corresponding lock commitments"
  )
    failures.push("canonical builder prompt/config commitments diverge");
  if (
    JSON.stringify(contract.invalidation?.completedStatuses) !==
      JSON.stringify(["valid", "invalid"]) ||
    JSON.stringify(contract.invalidation?.activeInvalidationFields) !==
      JSON.stringify([
        "invalidationId",
        "scope",
        "code",
        "reason",
        "detectedAt",
        "evidenceSha256",
        "preservedArtifactSha256",
      ]) ||
    JSON.stringify(contract.invalidation?.invalidAttemptFields) !==
      JSON.stringify([
        "attemptId",
        "scope",
        "code",
        "reason",
        "invalidatedAt",
        "evidenceSha256",
        "preservedArtifactSha256",
      ])
  )
    failures.push("canonical invalidation state contract diverges");
  if (
    contract.gates.testerCommand !== "npm run check" ||
    contract.gates.evaluatorPublicCommand !== "npm run test:public" ||
    JSON.stringify(contract.gates.componentCommands) !==
      JSON.stringify(expectedGates)
  )
    failures.push("canonical public gate commands diverge");
  if (
    contract.hiddenSuite.id !== "permissions-playground-sealed-v2" ||
    contract.hiddenSuite.command !== "node sealed-hidden-suite/run.mjs" ||
    contract.hiddenSuite.sha256 !==
      "a6f38c08eff3fd23fca3299f0777adbea4001d3ac3147272511ff9babd98a19b"
  )
    failures.push("canonical hidden-suite binding diverges");
  return failures;
}

const resolveArtifactKey = (fixture, artifactKey) =>
  artifactKey.split(".").reduce((value, key) => value?.[key], fixture);

export function validateGoldenRun(
  fixture,
  contract,
  lock = readJson("experiment/lock.json"),
) {
  const failures = validateArtifactMode(fixture, "execution", [
    readJson("experiment/templates/experiment-manifest.json"),
    readJson("experiment/templates/run-manifest.json"),
    readJson("experiment/templates/evaluation.json"),
    readJson("experiment/templates/outcome.json"),
    readJson("experiment/templates/cost.json"),
  ]);
  if (fixture.fixtureKind !== "prospective-conformance")
    failures.push("golden fixture kind must be prospective-conformance");
  if (fixture.canonicalContractSha256 !== canonicalHash(contract))
    failures.push("golden fixture canonical-contract hash mismatch");
  failures.push(...validateExperimentConclusion(fixture));
  for (const [candidate, freeze] of Object.entries(fixture.builderFreezes)) {
    if (
      freeze.promptSha256 !== contract.builderFreeze.promptSha256 ||
      freeze.promptSha256 !== lock.neutralBuilderPromptSha256
    )
      failures.push(`golden ${candidate} prompt commitment drift`);
    if (
      freeze.configSha256 !== contract.builderFreeze.configSha256 ||
      freeze.configSha256 !== lock.neutralBuilderConfigSha256
    )
      failures.push(`golden ${candidate} config commitment drift`);
  }
  const bindings = fixture.bindings;
  if (
    JSON.stringify(bindings.publicGates) !==
      JSON.stringify(contract.gates.componentCommands) ||
    bindings.testerCommand !== contract.gates.testerCommand ||
    bindings.evaluatorPublicCommand !== contract.gates.evaluatorPublicCommand ||
    bindings.evaluatorHiddenCommand !== contract.hiddenSuite.command ||
    bindings.hiddenSuiteId !== contract.hiddenSuite.id ||
    bindings.hiddenSuiteSha256 !== contract.hiddenSuite.sha256
  )
    failures.push("golden fixture gate or hidden-suite binding diverges");

  const workerIds = fixture.workers.map(({ workerId }) => workerId);
  if (new Set(workerIds).size !== workerIds.length)
    failures.push("golden fixture worker IDs must be unique");
  const roleSet = [...new Set(fixture.workers.map(({ role }) => role))].sort();
  if (
    JSON.stringify(roleSet) !==
    JSON.stringify(Object.keys(contract.roles).sort())
  )
    failures.push("golden fixture worker registry must cover all seven roles");

  failures.push(...validateAssignmentSemantics(fixture));
  for (const [snapshot, rankDigest] of Object.entries(
    fixture.evaluationRandomization.rankDigests,
  )) {
    const expected = sha256(
      `${fixture.evaluationRandomization.digestSha256}\n${snapshot}`,
    );
    if (rankDigest !== expected)
      failures.push(`golden ${snapshot} rank digest diverges`);
  }

  const baseline = fixture.runs["candidate-a"];
  if (
    baseline.assignedArm !== "baseline" ||
    baseline.stopReason !== "baseline-zero-cycles" ||
    baseline.cycles.length !== 0 ||
    !sameSnapshot(baseline.initialSnapshot, baseline.finalSnapshot)
  )
    failures.push("golden baseline must freeze at zero cycles");
  const treatment = fixture.runs["candidate-b"];
  if (
    treatment.assignedArm !== "treatment" ||
    treatment.cycles.length !== 1 ||
    treatment.cycles[0].reviewFindingCount !== 0 ||
    treatment.cycles[0].decision !== "zero-findings" ||
    treatment.cycles[0].fixerWorkerId !== null ||
    treatment.cycles[0].testerWorkerId !== null ||
    treatment.stopReason !== "zero-findings" ||
    treatment.convergence !== true
  )
    failures.push("golden treatment zero-findings cycle diverges");
  if (
    fixture.reviews.length !== 1 ||
    fixture.reviews[0].findings.length !== 0 ||
    fixture.fixes.length !== 0 ||
    fixture.tests.length !== 0
  )
    failures.push("golden zero-findings run must not invoke fixer or tester");

  const labels = fixture.packages.map(({ packageLabel }) => packageLabel);
  if (JSON.stringify(labels) !== JSON.stringify(["X", "Y", "Z"]))
    failures.push("golden packages must be exactly X/Y/Z");
  fixture.evaluations.forEach((evaluation, index) => {
    failures.push(...validateEvaluationSemantics(evaluation));
    if (evaluation.packageLabel !== fixture.packages[index].packageLabel)
      failures.push("golden evaluation/package label mismatch");
    if (evaluation.packageSha256 !== canonicalHash(fixture.packages[index]))
      failures.push("golden evaluation package hash mismatch");
    if (
      evaluation.publicTests.command !== contract.gates.evaluatorPublicCommand
    )
      failures.push("golden evaluator public command diverges");
    if (evaluation.hiddenTests.command !== contract.hiddenSuite.command)
      failures.push("golden evaluator hidden command diverges");
  });
  failures.push(...validateOutcomeSemantics(fixture.outcome));
  for (const [label, artifactHash] of Object.entries(
    fixture.outcome.evaluationArtifactHashes,
  )) {
    const evaluation = fixture.evaluations.find(
      ({ packageLabel }) => packageLabel === label,
    );
    if (!evaluation || artifactHash !== canonicalHash(evaluation))
      failures.push(`golden outcome evaluation hash mismatch for ${label}`);
  }

  const costWorkerIds = fixture.costs.map(({ workerId }) => workerId);
  if (new Set(costWorkerIds).size !== costWorkerIds.length)
    failures.push("golden cost worker IDs must be unique across invocations");
  fixture.costs.forEach((cost) => {
    failures.push(...validateCostSemantics(cost));
    if (cost.environmentSha256 !== fixture.environment.environmentSha256)
      failures.push("golden cost environment hash diverges");
  });

  fixture.evidenceChain.forEach((entry, index) => {
    if (entry.sequence !== index)
      failures.push(
        "golden evidence sequence must start at zero and be contiguous",
      );
    const expectedPrevious =
      index === 0 ? null : fixture.evidenceChain[index - 1].artifactSha256;
    if (entry.previousSha256 !== expectedPrevious)
      failures.push("golden evidence predecessor hash mismatch");
    const artifact = resolveArtifactKey(fixture, entry.artifactKey);
    if (
      artifact === undefined ||
      entry.artifactSha256 !== canonicalHash(artifact)
    )
      failures.push(
        `golden evidence artifact hash mismatch at ${entry.artifactKey}`,
      );
  });
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
    "experiment/canonical-contract.json",
    "experiment/golden-run/README.md",
    "experiment/golden-run/golden-run.json",
    "experiment/golden-run/invalid-current.json",
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
    "experiment/schemas/experiment-status.schema.json",
    "experiment/templates/test.json",
    "experiment/templates/outcome.json",
    "experiment/templates/experiment-status.json",
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
    [
      "experiment/schemas/experiment-status.schema.json",
      "experiment/templates/experiment-status.json",
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
      failures.push(...validateArtifactMode(readJson(dataPath), "template"));
    } catch (error) {
      failures.push(
        `${schemaPath} could not be compiled: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const lock = readJson("experiment/lock.json");
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
  const canonicalContract = readJson("experiment/canonical-contract.json");
  const goldenRun = readJson("experiment/golden-run/golden-run.json");
  const invalidCurrent = readJson("experiment/golden-run/invalid-current.json");
  const finalCommitments = {
    protocolVersion: "2.2.0-frozen",
    protocolStatus: "locked",
    supersedesLockCommit: "b5c1d5f21e3d2f7e4ecf67dfee1eeb365ee041b9",
    lockParentCommit: "bc0a704d94f739d55d7cda2eff42253df4440142",
    hiddenSuiteId: "permissions-playground-sealed-v2",
    hiddenSuiteSha256:
      "a6f38c08eff3fd23fca3299f0777adbea4001d3ac3147272511ff9babd98a19b",
    treatmentSkillCommit: "7f313955de0dc2c85f66c8efb5d0ca4badf423c8",
    treatmentSkillTree: "8ce31af123de1e537e2e9aa84fc33909004212fd",
    treatmentSkillManifestSha256:
      "f4ae6da4ee8335a9a798e9ab1113d6760cd7ce58a3e6dbaedfa18f60194e76eb",
    treatmentAlgorithmSha256: actualAlgorithmHash,
    neutralBuilderPromptSha256: actualPromptHash,
    neutralBuilderConfigSha256: actualConfigHash,
    canonicalContractSha256: canonicalHash(canonicalContract),
    goldenFixtureSha256: canonicalHash(goldenRun),
    invalidCurrentFixtureSha256: canonicalHash(invalidCurrent),
    freezeState: "frozen",
  };
  for (const [key, expected] of Object.entries(finalCommitments)) {
    if (lock[key] !== expected)
      failures.push(`${key} does not match the final integrated lock`);
  }
  failures.push(
    ...validateCanonicalContract(canonicalContract),
    ...validateGoldenRun(goldenRun, canonicalContract, lock),
    ...validateExperimentConclusion(invalidCurrent),
  );

  const builderConfig = readJson("experiment/builder-config.json");
  if (
    builderConfig.turnLimit !== 1 ||
    builderConfig.wallSecondsMaximum !== 2400 ||
    builderConfig.maxTokens !== null ||
    !builderConfig.maxTokensUnavailableReason
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
  const args = process.argv.slice(2);
  const modeIndex = args.indexOf("--mode");
  const inputIndex = args.indexOf("--input");
  if (modeIndex !== -1 || inputIndex !== -1) {
    if (
      modeIndex === -1 ||
      inputIndex === -1 ||
      !args[modeIndex + 1] ||
      !args[inputIndex + 1]
    ) {
      console.error(
        "--mode template|execution and --input PATH are both required",
      );
      process.exit(1);
    }
    const mode = args[modeIndex + 1];
    const inputPath = path.resolve(root, args[inputIndex + 1]);
    if (!inputPath.startsWith(`${root}${path.sep}`)) {
      console.error("--input must resolve inside the protocol repository");
      process.exit(1);
    }
    const relativeInput = path.relative(root, inputPath).replaceAll("\\", "/");
    const value = JSON.parse(readFileSync(inputPath, "utf8"));
    const failures = validateArtifactMode(value, mode);
    if (mode === "template") {
      if (!relativeInput.startsWith("experiment/templates/"))
        failures.push(
          "template mode input must be under experiment/templates/",
        );
      else {
        const schemaPath = `experiment/schemas/${path.basename(relativeInput, ".json")}.schema.json`;
        if (!existsSync(path.join(root, schemaPath)))
          failures.push(`no registered schema for template: ${relativeInput}`);
        else {
          const ajv = new Ajv2020({
            allErrors: true,
            strict: true,
            strictTypes: false,
            validateFormats: false,
          });
          ajv.addSchema(readJson("experiment/schemas/finding.schema.json"));
          const validate = ajv.compile(readJson(schemaPath));
          if (!validate(value))
            failures.push(
              `${relativeInput} does not validate: ${ajv.errorsText(validate.errors)}`,
            );
        }
      }
    }
    if (mode === "execution") {
      if (relativeInput === "experiment/golden-run/golden-run.json")
        failures.push(
          ...validateGoldenRun(
            value,
            readJson("experiment/canonical-contract.json"),
            readJson("experiment/lock.json"),
          ),
        );
      else if (relativeInput === "experiment/golden-run/invalid-current.json")
        failures.push(...validateExperimentConclusion(value));
      else
        failures.push(
          "execution mode input must be a registered golden fixture",
        );
    }
    if (failures.length > 0) {
      console.error(failures.map((failure) => `- ${failure}`).join("\n"));
      process.exit(1);
    }
    console.log(`${mode} validation passed: ${relativeInput}`);
    process.exit(0);
  }
  const { failures, schemaPairCount, implementationCount } = validateScaffold();
  if (failures.length > 0) {
    console.error(failures.map((failure) => `- ${failure}`).join("\n"));
    process.exit(1);
  }
  console.log(
    `Protocol 2.2.0-frozen scaffold validation passed (${schemaPairCount} schema/data pairs; golden execution fixtures accepted; ${implementationCount === 0 ? "implementation intentionally absent" : "implementation active"}).`,
  );
}
