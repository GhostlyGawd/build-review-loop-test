import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
const frozenGatePaths = [
  "docs/permissions-playground-spec.md",
  "docs/public-test-contract.md",
  "tests/public",
  "scripts/run-public-tests.mjs",
  "package.json",
  "package-lock.json",
];
export function frozenGateSetHash(base = root) {
  const records = [];
  const add = (absolute, relative) => {
    if (statSync(absolute).isDirectory()) {
      for (const name of readdirSync(absolute).sort(compareUtf8))
        add(path.join(absolute, name), `${relative}/${name}`);
    } else records.push([relative, sha256Bytes(readFileSync(absolute))]);
  };
  for (const relative of frozenGatePaths)
    add(path.join(base, relative), relative);
  records.sort(([left], [right]) => compareUtf8(left, right));
  return sha256(
    records.map(([name, digest]) => `${name}\0${digest}\n`).join(""),
  );
}

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
  if (
    evaluation.mappingGuess === "unknown" &&
    evaluation.mappingGuessConfidence !== 0
  )
    failures.push("unknown mapping guess requires zero confidence");
  if (
    typeof evaluation.mappingGuessEvidence !== "string" ||
    evaluation.mappingGuessEvidence.length === 0
  )
    failures.push("mapping guess requires observable diagnostic evidence");
  if (
    Number.isNaN(Date.parse(evaluation.evaluatedAt)) ||
    Number.isNaN(Date.parse(evaluation.sealedAt)) ||
    Date.parse(evaluation.sealedAt) < Date.parse(evaluation.evaluatedAt)
  )
    failures.push("evaluation seal must be at or after evaluation completion");
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
  if (cost.role === "evaluator" && cost.packageLabel === null)
    failures.push("each evaluator turn must name exactly one package");
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

export function validateNeutralBuilderPrompt(promptText) {
  const required = [
    "The operator writes this entire file byte-for-byte to raw standard input for each fresh CLI execution.",
    "The CLI `-C` argument supplies the isolated checkout and is not model context.",
    "You are a neutral builder. The current checkout is the frozen common-start commit.",
    "No prefix, suffix, placeholder substitution, candidate label, deadline timestamp, path wrapper, prompt-embedded runtime override, or added guidance is permitted.",
  ];
  return required
    .filter((clause) => !promptText.includes(clause))
    .map((clause) => `neutral builder assignment prose missing: ${clause}`);
}

export const cliInvariantArgv = [
  "-a",
  "never",
  "-m",
  "gpt-5.4",
  "-c",
  'model_reasoning_effort="xhigh"',
  "exec",
  "--ephemeral",
  "--ignore-user-config",
  "--skip-git-repo-check",
  "--sandbox",
  "workspace-write",
  "--json",
];
const cliTail = (invocation) => [
  "-C",
  invocation.workdir,
  "-o",
  invocation.finalPath,
  "-",
];

export function validateCliRuntimeContract(
  contract,
  lock = readJson("experiment/lock.json"),
) {
  const failures = [];
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictTypes: false,
  });
  const validate = ajv.compile(
    readJson("experiment/schemas/cli-runtime-contract.schema.json"),
  );
  if (!validate(contract))
    failures.push(
      `CLI runtime contract schema failure: ${ajv.errorsText(validate.errors)}`,
    );
  if (
    JSON.stringify(contract.invariantArgv) !== JSON.stringify(cliInvariantArgv)
  )
    failures.push("CLI invariant argv or global-before-exec ordering mismatch");
  if (
    !contract.invariantArgv?.includes("--ephemeral") ||
    contract.invariantArgv?.includes("resume")
  )
    failures.push("CLI runtime must be ephemeral and never resumed");
  if (
    contract.cliPath !== lock.cliBinaryPath ||
    contract.cliVersion !== lock.cliVersion ||
    contract.cliSha256 !== lock.cliBinarySha256
  )
    failures.push("CLI binary path/version/hash commitment mismatch");
  const expectedPromptSha256 = contract.smokeMode
    ? lock.runnerSmokePromptSha256
    : lock.neutralBuilderPromptSha256;
  if (contract.promptSha256 !== expectedPromptSha256)
    failures.push("CLI raw stdin prompt commitment mismatch");
  if (contract.authStatus !== "Logged in using ChatGPT")
    failures.push("CLI ChatGPT auth attestation mismatch");
  if (contract.contractSchemaSha256 !== lock.cliRuntimeSchemaSha256)
    failures.push("CLI contract schema does not match frozen lock");
  if (!Array.isArray(contract.invocations) || contract.invocations.length !== 2)
    return [...failures, "CLI runtime requires exactly two invocations"];
  for (const field of [
    "invocationId",
    "workdir",
    "finalPath",
    "stdoutPath",
    "stderrPath",
    "evidencePath",
    "tempRoot",
    "cacheRoot",
    "dependencyRoot",
    "port",
  ]) {
    const values = contract.invocations.map(
      (entry) => entry[field]?.toLowerCase?.() ?? entry[field],
    );
    if (new Set(values).size !== 2)
      failures.push(`CLI invocations duplicate ${field}`);
  }
  const roots = contract.invocations.map(({ workdir }) =>
    path.win32.resolve(workdir),
  );
  const evidenceRoot = path.win32.resolve(contract.evidenceRoot ?? "");
  const beneath = (rootPath, candidate) => {
    const relative = path.win32.relative(rootPath, candidate);
    return (
      relative !== "" &&
      !relative.startsWith("..") &&
      !path.win32.isAbsolute(relative)
    );
  };
  if (beneath(roots[0], roots[1]) || beneath(roots[1], roots[0]))
    failures.push("CLI workdirs must be nonnested independent clones");
  for (const [index, invocation] of contract.invocations.entries()) {
    if (
      beneath(roots[index], evidenceRoot) ||
      beneath(evidenceRoot, roots[index])
    )
      failures.push(
        `CLI invocation ${index} evidence/workdir roots are nested`,
      );
    for (const field of [
      "finalPath",
      "stdoutPath",
      "stderrPath",
      "evidencePath",
      "tempRoot",
      "cacheRoot",
      "dependencyRoot",
    ])
      if (!beneath(evidenceRoot, path.win32.resolve(invocation[field] ?? "")))
        failures.push(`CLI invocation ${index} ${field} escapes evidenceRoot`);
  }
  return failures;
}

export function validateCliSupervisionEvidence(
  evidence,
  contract,
  rawStdoutByInvocation = null,
) {
  const failures = [];
  if (!Array.isArray(evidence.results) || evidence.results.length !== 2)
    return ["CLI supervision requires exactly two results"];
  const threadIds = [];
  const processIds = [];
  evidence.results.forEach((result, index) => {
    const invocation = contract.invocations[index];
    const expectedArgv = [...cliInvariantArgv, ...cliTail(invocation)];
    if (JSON.stringify(result.argv) !== JSON.stringify(expectedArgv))
      failures.push(`CLI result ${index} argv differs or is reordered`);
    if (result.invocationId !== invocation.invocationId)
      failures.push(`CLI result ${index} invocation ID mismatch`);
    if (!nonzeroSha256(result.contractSha256))
      failures.push(`CLI result ${index} contract hash missing`);
    if (!nonzeroSha256(result.finalSha256))
      failures.push(`CLI result ${index} final artifact hash missing`);
    if (result.argvSha256 !== sha256(result.argv.join("\0")))
      failures.push(`CLI result ${index} argv hash mismatch`);
    if (result.promptSha256 !== contract.promptSha256)
      failures.push(`CLI result ${index} prompt differs`);
    if (!result.started || !result.stdinDelivered)
      failures.push(`CLI result ${index} did not start with raw stdin`);
    if (result.timedOut) failures.push(`CLI result ${index} timed out`);
    if (result.exitCode !== 0)
      failures.push(`CLI result ${index} exit was nonzero`);
    if (result.unauthorizedToolOrWriteDetected === true)
      failures.push(
        `CLI result ${index} detected an unauthorized tool or write`,
      );
    if (
      result.unauthorizedToolOrWriteDetected == null &&
      !result.unauthorizedToolOrWriteUnavailableReason
    )
      failures.push(
        `CLI result ${index} lacks unauthorized-write absence reason`,
      );
    if (!result.turnCompleted)
      failures.push(`CLI result ${index} lacks turn.completed`);
    if (!result.rawJsonlValid)
      failures.push(`CLI result ${index} contains malformed JSONL`);
    if (!Array.isArray(result.threadIds) || result.threadIds.length !== 1)
      failures.push(
        `CLI result ${index} must have exactly one thread.started ID`,
      );
    else threadIds.push(result.threadIds[0]);
    if (result.processId == null)
      failures.push(`CLI result ${index} lacks process ID`);
    else processIds.push(result.processId);
    if (
      result.sandboxMode !== "workspace-write" ||
      result.inputDisposition !== "authorized-worktree-write"
    )
      failures.push(`CLI result ${index} isolation policy mismatch`);
    if (result.usage == null && !result.usageUnavailableReason)
      failures.push(`CLI result ${index} missing usage and unavailable reason`);
    if (result.usage != null && result.usageUnavailableReason != null)
      failures.push(`CLI result ${index} usage has a false unavailable reason`);
    const raw = rawStdoutByInvocation?.[result.invocationId];
    if (raw == null) {
      failures.push(
        `CLI result ${index} raw JSONL is required for reconciliation`,
      );
    } else {
      if (result.stdoutSha256 !== sha256(raw))
        failures.push(`CLI result ${index} stdout hash mismatch`);
      const events = [];
      for (const line of raw.split(/\r?\n/u).filter((value) => value.trim())) {
        try {
          events.push(JSON.parse(line));
        } catch {
          failures.push(`CLI result ${index} malformed raw JSONL`);
        }
      }
      const rawThreads = events
        .filter(({ type }) => type === "thread.started")
        .map(({ thread_id: id }) => id);
      const turnEvents = events.filter(({ type }) => type === "turn.completed");
      if (JSON.stringify(rawThreads) !== JSON.stringify(result.threadIds))
        failures.push(
          `CLI result ${index} thread IDs do not reconcile to raw JSONL`,
        );
      if ((turnEvents.length === 1) !== result.turnCompleted)
        failures.push(
          `CLI result ${index} lifecycle does not reconcile to raw JSONL`,
        );
      if (
        turnEvents.length === 1 &&
        JSON.stringify(turnEvents[0].usage ?? null) !==
          JSON.stringify(result.usage)
      )
        failures.push(
          `CLI result ${index} usage does not reconcile to turn.completed`,
        );
    }
    for (const field of [
      "runtimeModel",
      "runtimeProvider",
      "reasoningSetting",
    ]) {
      if (result[field] == null && !result[`${field}UnavailableReason`])
        failures.push(
          `CLI result ${index} null ${field} lacks unavailable reason`,
        );
      if (result[field] != null && result.metadataSource !== "trusted-jsonl")
        failures.push(
          `CLI result ${index} ${field} is not trusted JSONL metadata`,
        );
    }
  });
  if (new Set(threadIds).size !== 2)
    failures.push("CLI thread.started IDs must be distinct");
  if (new Set(processIds).size !== 2)
    failures.push("CLI OS process IDs must be distinct");
  if (evidence.valid !== (failures.length === 0))
    failures.push("CLI supervision valid flag disagrees with evidence");
  return failures;
}

export function validateRoleRuntimeContract(
  contract,
  lock = readJson("experiment/lock.json"),
) {
  const failures = [];
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictTypes: false,
  });
  const validate = ajv.compile(
    readJson("experiment/schemas/role-runtime-contract.schema.json"),
  );
  if (!validate(contract))
    failures.push(
      `role runtime contract schema failure: ${ajv.errorsText(validate.errors)}`,
    );
  if (
    contract.cliPath !== lock.cliBinaryPath ||
    contract.cliVersion !== lock.cliVersion ||
    contract.cliSha256 !== lock.cliBinarySha256
  )
    failures.push("role runtime CLI binding mismatch");
  if (contract.contractSchemaSha256 !== lock.roleRuntimeSchemaSha256)
    failures.push("role runtime schema lock mismatch");
  if (
    contract.runnerSha256 !== lock.roleRunnerSha256 ||
    contract.evidenceSchemaSha256 !== lock.supervisionEvidenceSchemaSha256
  )
    failures.push("role runner/evidence schema lock mismatch");
  const promptLocks = {
    reviewer: lock.reviewerPromptTemplateSha256,
    fixer: lock.fixerPromptTemplateSha256,
    tester: lock.testerPromptTemplateSha256,
    evaluator: lock.evaluatorPromptTemplateSha256,
  };
  const artifactLocks = {
    reviewer: lock.reviewArtifactSchemaSha256,
    fixer: lock.fixArtifactSchemaSha256,
    tester: lock.testArtifactSchemaSha256,
    evaluator: lock.evaluationArtifactSchemaSha256,
  };
  if (contract.promptTemplateSha256 !== promptLocks[contract.role])
    failures.push("role prompt-template lock mismatch");
  if (contract.artifactSchemaSha256 !== artifactLocks[contract.role])
    failures.push("role artifact-schema lock mismatch");
  return failures;
}

export function validateRoleSupervisionEvidence(
  result,
  contract,
  rawStdout = null,
) {
  const expected = [
    "-a",
    "never",
    "-m",
    "gpt-5.4",
    "-c",
    'model_reasoning_effort="xhigh"',
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--skip-git-repo-check",
    "--sandbox",
    contract.sandboxMode,
    "--json",
    "-C",
    contract.workdir,
    "-o",
    contract.finalPath,
    "-",
  ];
  const failures = [];
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictTypes: false,
    validateFormats: false,
  });
  const validate = ajv.compile(
    readJson("experiment/schemas/cli-supervision-evidence.schema.json"),
  );
  if (!validate(result))
    failures.push(
      `role evidence schema failure: ${ajv.errorsText(validate.errors)}`,
    );
  if (JSON.stringify(result.argv) !== JSON.stringify(expected))
    failures.push("role result argv differs or is reordered");
  if (
    result.role !== contract.role ||
    result.invocationId !== contract.invocationId
  )
    failures.push("role result identity mismatch");
  if (
    !result.started ||
    !result.stdinDelivered ||
    result.timedOut ||
    result.exitCode !== 0 ||
    !result.turnCompleted ||
    !result.rawJsonlValid ||
    result.threadIds?.length !== 1 ||
    !result.processId
  )
    failures.push("role result lifecycle invalid");
  if (result.argvSha256 !== sha256(result.argv.join("\0")))
    failures.push("role result argv hash mismatch");
  if (result.promptSha256 !== contract.promptSha256)
    failures.push("role result prompt mismatch");
  if (
    !nonzeroSha256(result.contractSha256) ||
    result.artifactSchemaSha256 !== contract.artifactSchemaSha256 ||
    !nonzeroSha256(result.finalSha256) ||
    result.finalSchemaValid !== true ||
    result.artifactBindingValid !== true
  )
    failures.push("role result artifact/contract binding invalid");
  if (
    result.sandboxMode !== contract.sandboxMode ||
    result.inputDisposition !== contract.inputDisposition
  )
    failures.push("role result isolation mismatch");
  if (result.usage == null && !result.usageUnavailableReason)
    failures.push("role result missing usage reason");
  if (result.usage != null && result.usageUnavailableReason != null)
    failures.push("role result usage has a false unavailable reason");
  if (result.unauthorizedToolOrWriteDetected)
    failures.push("role result detected an unauthorized tool or write");
  if (
    result.unauthorizedToolOrWriteDetected == null &&
    !result.unauthorizedToolOrWriteUnavailableReason
  )
    failures.push("role result lacks unauthorized-write absence reason");
  for (const field of ["runtimeModel", "runtimeProvider", "reasoningSetting"]) {
    if (result[field] == null && !result[`${field}UnavailableReason`])
      failures.push(`role result null ${field} lacks unavailable reason`);
    if (result[field] != null && result.metadataSource !== "trusted-jsonl")
      failures.push(`role result ${field} is not trusted JSONL metadata`);
  }
  if (rawStdout == null)
    failures.push("role raw JSONL is required for reconciliation");
  else {
    if (result.stdoutSha256 !== sha256(rawStdout))
      failures.push("role result stdout hash mismatch");
    const lines = rawStdout.split(/\r?\n/u).filter((line) => line.trim());
    const events = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        failures.push("role raw JSONL malformed");
      }
    }
    const threads = events
      .filter(({ type }) => type === "thread.started")
      .map(({ thread_id: id }) => id);
    const turns = events.filter(({ type }) => type === "turn.completed");
    if (
      JSON.stringify(threads) !== JSON.stringify(result.threadIds) ||
      turns.length !== 1
    )
      failures.push("role raw lifecycle reconciliation failed");
    if (
      turns.length === 1 &&
      JSON.stringify(turns[0].usage ?? null) !== JSON.stringify(result.usage)
    )
      failures.push("role usage reconciliation failed");
  }
  return failures;
}

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
  const lock = readJson("experiment/lock.json");
  const fileSha256 = (relativePath) =>
    sha256(readFileSync(path.join(root, relativePath)));
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
  const cliModelRoles = ["builder", "reviewer", "fixer", "tester", "evaluator"];
  if (
    JSON.stringify(contract.cliRuntime.modelRoleCoverage) !==
      JSON.stringify(cliModelRoles) ||
    !contract.cliRuntime.roleLaunchRule?.includes("every model-bearing role")
  )
    failures.push("canonical CLI runtime does not cover every model role");
  for (const [role, maximum] of Object.entries(expectedRoleBudgets)) {
    if (contract.roles[role]?.wallSecondsMaximum !== maximum)
      failures.push(`canonical ${role} wall budget diverges`);
    if (
      cliModelRoles.includes(role) &&
      contract.roles[role]?.executionRuntime !== "fresh-external-cli-subprocess"
    )
      failures.push(`canonical ${role} CLI subprocess policy diverges`);
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
      "5c9f6a87c18295f500a228a5c31fa4afafd74d8122c3cf3e8f8b112e50c88db0" ||
    contract.builderFreeze?.smokePromptSha256 !==
      fileSha256("experiment/prompts/runner-smoke.md") ||
    contract.builderFreeze?.smokePromptSha256 !==
      lock.runnerSmokePromptSha256 ||
    contract.builderFreeze?.configSha256 !==
      "f3c706ac3fd3180748aadcfebb6e17171103f1184be7bbdf9af5704a2bb445b4" ||
    contract.builderFreeze?.rule !==
      "each builder receives the exact raw prompt bytes on stdin under an otherwise identical frozen external CLI execution; only opaque invocation ID and runtime coordinate paths differ"
  )
    failures.push("canonical builder prompt/config commitments diverge");
  if (
    contract.cliRuntime?.launchCommand !== "pwsh -NoProfile -File" ||
    contract.cliRuntime?.powerShellHost?.path !== lock.powerShellHostPath ||
    contract.cliRuntime?.powerShellHost?.version !== lock.powerShellVersion ||
    contract.cliRuntime?.powerShellHost?.sha256 !== lock.powerShellHostSha256 ||
    contract.cliRuntime?.schemaSha256 !==
      fileSha256("experiment/schemas/cli-runtime-contract.schema.json") ||
    contract.cliRuntime?.schemaSha256 !== lock.cliRuntimeSchemaSha256 ||
    contract.cliRuntime?.runnerSha256 !==
      fileSha256("scripts/run-cli-builders.ps1") ||
    contract.cliRuntime?.runnerSha256 !== lock.cliRunnerSha256 ||
    contract.cliRuntime?.binarySha256 !==
      "20d611ef1c9851f4da1cb4609beb6763904f72275cb91517b2400639ca1c28c4" ||
    JSON.stringify(contract.cliRuntime?.invariantArgv) !==
      JSON.stringify(cliInvariantArgv) ||
    JSON.stringify(contract.cliRuntime?.perInvocationArgv) !==
      JSON.stringify(["-C", "<workdir>", "-o", "<final-path>", "-"]) ||
    contract.cliRuntime?.v4Evidence?.contractSha256 !==
      "d1a47087dc0bfcf85638e6c9faef4c7399c98626556747f1fda31e0a67e0645d"
  )
    failures.push("canonical external CLI runtime contract diverges");
  if (
    contract.cliRuntime?.roleRuntime?.schemaSha256 !==
      fileSha256("experiment/schemas/role-runtime-contract.schema.json") ||
    contract.cliRuntime?.roleRuntime?.schemaSha256 !==
      lock.roleRuntimeSchemaSha256 ||
    contract.cliRuntime?.roleRuntime?.runnerSha256 !==
      fileSha256("scripts/run-cli-role.ps1") ||
    contract.cliRuntime?.roleRuntime?.runnerSha256 !== lock.roleRunnerSha256 ||
    contract.cliRuntime?.roleRuntime?.evidenceSchemaSha256 !==
      fileSha256("experiment/schemas/cli-supervision-evidence.schema.json") ||
    contract.cliRuntime?.roleRuntime?.evidenceSchemaSha256 !==
      lock.supervisionEvidenceSchemaSha256 ||
    contract.cliRuntime?.roleRuntime?.outputSchemaPolicy !==
      "codex exec supports --output-schema, but authoritative final schemas require supervisor-observed runtime identity; omit the flag until distinct frozen pre-injection schemas exist, then inject observed identity and validate the authoritative final schema" ||
    contract.evaluation?.packageScriptSha256 !==
      fileSha256("scripts/package-blinded-snapshots.mjs") ||
    contract.evaluation?.packageScriptSha256 !==
      lock.blindedPackageScriptSha256 ||
    contract.evaluation?.packageManifestSchemaSha256 !==
      fileSha256("experiment/schemas/blinded-package-manifest.schema.json") ||
    contract.evaluation?.packageManifestSchemaSha256 !==
      lock.blindedPackageSchemaSha256 ||
    contract.evaluation?.packageMappingSchemaSha256 !==
      fileSha256("experiment/schemas/blinded-package-mapping.schema.json") ||
    contract.evaluation?.packageMappingSchemaSha256 !==
      lock.blindedPackageMappingSchemaSha256
  )
    failures.push(
      "canonical role runtime or blinded packaging contract diverges",
    );
  const promptBindings = {
    reviewer: [
      "experiment/prompts/blinded-reviewer.md",
      "reviewerPromptTemplateSha256",
    ],
    fixer: ["experiment/prompts/fixer.md", "fixerPromptTemplateSha256"],
    tester: ["experiment/prompts/tester.md", "testerPromptTemplateSha256"],
    evaluator: [
      "experiment/prompts/blinded-evaluator.md",
      "evaluatorPromptTemplateSha256",
    ],
  };
  const artifactBindings = {
    reviewer: [
      "experiment/schemas/review.schema.json",
      "reviewArtifactSchemaSha256",
    ],
    fixer: ["experiment/schemas/fix.schema.json", "fixArtifactSchemaSha256"],
    tester: ["experiment/schemas/test.schema.json", "testArtifactSchemaSha256"],
    evaluator: [
      "experiment/schemas/evaluation.schema.json",
      "evaluationArtifactSchemaSha256",
    ],
  };
  for (const [role, [relativePath, lockField]] of Object.entries(
    promptBindings,
  )) {
    const expected = fileSha256(relativePath);
    if (
      contract.cliRuntime?.roleRuntime?.promptTemplateSha256?.[role] !==
        expected ||
      lock[lockField] !== expected
    )
      failures.push(`canonical ${role} prompt-template binding diverges`);
  }
  for (const [role, [relativePath, lockField]] of Object.entries(
    artifactBindings,
  )) {
    const expected = fileSha256(relativePath);
    if (
      contract.cliRuntime?.roleRuntime?.artifactSchemaSha256?.[role] !==
        expected ||
      lock[lockField] !== expected
    )
      failures.push(`canonical ${role} artifact-schema binding diverges`);
  }
  const expectedRubricHash = fileSha256("experiment/rubric.md");
  const expectedGateHash = frozenGateSetHash();
  if (
    contract.evaluation?.rubricSha256 !== expectedRubricHash ||
    lock.rubricSha256 !== expectedRubricHash ||
    contract.evaluation?.frozenGateSetSha256 !== expectedGateHash ||
    lock.frozenGateSetSha256 !== expectedGateHash
  )
    failures.push("canonical rubric or frozen-gate binding diverges");
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
  failures.push(
    ...validateCliRuntimeContract(fixture.cliRuntimeContract, lock),
    ...validateCliSupervisionEvidence(
      fixture.cliRuntimeEvidence,
      fixture.cliRuntimeContract,
      fixture.cliRuntimeStdoutByInvocation,
    ),
  );
  for (const [index, [candidate, freeze]] of Object.entries(
    fixture.builderFreezes,
  ).entries()) {
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
    const invocation = fixture.cliRuntimeContract.invocations[index];
    const evidence = fixture.cliRuntimeEvidence.results[index];
    if (
      freeze.runtimeInvocationId !== invocation?.invocationId ||
      freeze.runtimeEvidenceSha256 !== canonicalHash(evidence) ||
      fixture.runs[candidate]?.runtimeInvocationId !==
        freeze.runtimeInvocationId ||
      fixture.runs[candidate]?.runtimeEvidenceSha256 !==
        freeze.runtimeEvidenceSha256
    )
      failures.push(`golden ${candidate} runtime evidence binding mismatch`);
  }
  const roleEvidence = new Map(
    (fixture.roleRuntimeEvidence ?? []).map((entry) => [
      entry.invocationId,
      entry,
    ]),
  );
  const roleArtifacts = [
    ...(fixture.reviews ?? []),
    ...(fixture.fixes ?? []),
    ...(fixture.tests ?? []),
    ...(fixture.evaluations ?? []),
  ];
  for (const artifact of roleArtifacts) {
    const evidence = roleEvidence.get(artifact.runtimeInvocationId);
    if (
      !evidence ||
      !evidence.lifecycleComplete ||
      evidence.invocationId !== artifact.runtimeInvocationId ||
      evidence.processId !== artifact.runtimeProcessId ||
      evidence.threadId !== artifact.runtimeThreadId
    )
      failures.push(
        "golden downstream artifact/runtime evidence binding mismatch",
      );
  }
  const evidenceInvocationIds = [...roleEvidence.values()].map(
    ({ invocationId }) => invocationId,
  );
  const evidenceProcessIds = [...roleEvidence.values()].map(
    ({ processId }) => processId,
  );
  const evidenceThreadIds = [...roleEvidence.values()].map(
    ({ threadId }) => threadId,
  );
  if (
    new Set(evidenceInvocationIds).size !== evidenceInvocationIds.length ||
    new Set(evidenceProcessIds).size !== evidenceProcessIds.length ||
    new Set(evidenceThreadIds).size !== evidenceThreadIds.length
  )
    failures.push(
      "golden downstream runtime identities must be globally fresh",
    );
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
  const packageAjv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictTypes: false,
  });
  const validatePackageManifest = packageAjv.compile(
    readJson("experiment/schemas/blinded-package-manifest.schema.json"),
  );
  if (!validatePackageManifest(fixture.blindedPackageManifest))
    failures.push(
      `golden blinded-package manifest schema failure: ${packageAjv.errorsText(validatePackageManifest.errors)}`,
    );
  if (
    JSON.stringify(fixture.blindedPackageManifest?.randomizedOrder) !==
    JSON.stringify(fixture.evaluationRandomization.order)
  )
    failures.push("golden blinded-package order diverges from randomization");
  const expectedMappingSeedSha256 = sha256(
    Buffer.from(fixture.evaluationRandomization.seedHex, "hex"),
  );
  if (
    fixture.blindedPackageManifest?.mappingSeedSha256 !==
      expectedMappingSeedSha256 ||
    fixture.blindedPackageManifest?.frozenGateSetSha256 !==
      lock.frozenGateSetSha256
  )
    failures.push("golden blinded-package seed or gate commitment diverges");
  const snapshotCommits = {
    B0: baseline.initialSnapshot.commit,
    T0: treatment.initialSnapshot.commit,
    Tfinal: treatment.finalSnapshot.commit,
  };
  for (const entry of fixture.packages ?? []) {
    const expectedRole =
      fixture.evaluationRandomization.mapping?.[entry.packageLabel];
    if (
      expectedRole !== entry.snapshotRole ||
      snapshotCommits[entry.snapshotRole] !== entry.sourceCommit
    )
      failures.push(
        `golden blinded package ${entry.packageLabel} is not bound to its registered snapshot`,
      );
  }
  fixture.evaluations.forEach((evaluation, index) => {
    failures.push(...validateEvaluationSemantics(evaluation));
    if (evaluation.packageLabel !== fixture.packages[index].packageLabel)
      failures.push("golden evaluation/package label mismatch");
    if (
      evaluation.packageSha256 !==
      fixture.blindedPackageManifest?.packages?.[index]?.packageSha256
    )
      failures.push("golden evaluation package hash mismatch");
    if (
      evaluation.publicTests.command !== contract.gates.evaluatorPublicCommand
    )
      failures.push("golden evaluator public command diverges");
    if (evaluation.hiddenTests.command !== contract.hiddenSuite.command)
      failures.push("golden evaluator hidden command diverges");
    if (
      evaluation.evaluationSequence !== index + 1 ||
      evaluation.revisionAllowed !== false
    )
      failures.push(
        "golden evaluations must be sequentially sealed without revision",
      );
  });
  if (
    new Set(
      fixture.evaluations.map(({ evaluatorWorkerId }) => evaluatorWorkerId),
    ).size !== 3
  )
    failures.push("golden evaluation requires one fresh evaluator per package");
  const evaluatorCosts = fixture.costs.filter(
    ({ role }) => role === "evaluator",
  );
  for (let index = 0; index < fixture.evaluations.length; index += 1) {
    const evaluation = fixture.evaluations[index];
    const worker = evaluatorCosts.find(
      ({ workerId }) => workerId === evaluation.evaluatorWorkerId,
    );
    if (
      !worker ||
      Date.parse(evaluation.sealedAt) < Date.parse(evaluation.evaluatedAt) ||
      Date.parse(evaluation.sealedAt) > Date.parse(worker.completedAt)
    )
      failures.push("golden evaluator seal is outside its worker lifecycle");
    const nextWorker = evaluatorCosts.find(
      ({ workerId }) =>
        workerId === fixture.evaluations[index + 1]?.evaluatorWorkerId,
    );
    if (
      nextWorker &&
      Date.parse(nextWorker.startedAt) <= Date.parse(evaluation.sealedAt)
    )
      failures.push("golden next evaluator launched before prior seal");
  }
  const unblinder = fixture.costs.find(({ role }) => role === "unblinder");
  if (
    !unblinder ||
    Date.parse(unblinder.startedAt) <=
      Math.max(
        ...fixture.evaluations.map(({ sealedAt }) => Date.parse(sealedAt)),
      )
  )
    failures.push("golden unblinding began before all evaluations were sealed");
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
    "experiment/prompts/runner-smoke.md",
    "experiment/prompts/blinded-reviewer.md",
    "experiment/prompts/fixer.md",
    "experiment/prompts/tester.md",
    "experiment/prompts/blinded-evaluator.md",
    "experiment/schemas/finding.schema.json",
    "experiment/schemas/test.schema.json",
    "experiment/schemas/outcome.schema.json",
    "experiment/schemas/experiment-status.schema.json",
    "experiment/schemas/cli-runtime-contract.schema.json",
    "experiment/schemas/role-runtime-contract.schema.json",
    "experiment/schemas/cli-supervision-evidence.schema.json",
    "experiment/schemas/blinded-package-manifest.schema.json",
    "experiment/schemas/blinded-package-mapping.schema.json",
    "experiment/templates/test.json",
    "experiment/templates/outcome.json",
    "experiment/templates/experiment-status.json",
    "experiment/templates/cli-runtime-contract.json",
    "experiment/templates/role-runtime-contract.json",
    "experiment/templates/cli-supervision-evidence.json",
    "experiment/templates/blinded-package-manifest.json",
    "experiment/templates/blinded-package-mapping.json",
    "scripts/run-cli-builders.ps1",
    "scripts/run-cli-role.ps1",
    "scripts/package-blinded-snapshots.mjs",
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
    "experiment/schemas/assignment-envelope.schema.json",
    "experiment/templates/assignment-envelope.json",
    "scripts/validate-builder-envelopes.mjs",
  ]) {
    if (existsSync(path.join(root, obsolete)))
      failures.push(`obsolete protocol artifact remains: ${obsolete}`);
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
    [
      "experiment/schemas/cli-runtime-contract.schema.json",
      "experiment/templates/cli-runtime-contract.json",
    ],
    [
      "experiment/schemas/role-runtime-contract.schema.json",
      "experiment/templates/role-runtime-contract.json",
    ],
    [
      "experiment/schemas/cli-supervision-evidence.schema.json",
      "experiment/templates/cli-supervision-evidence.json",
    ],
    [
      "experiment/schemas/blinded-package-manifest.schema.json",
      "experiment/templates/blinded-package-manifest.json",
    ],
    [
      "experiment/schemas/blinded-package-mapping.schema.json",
      "experiment/templates/blinded-package-mapping.json",
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
  const actualSmokePromptHash = sha256(
    readFileSync(path.join(root, "experiment/prompts/runner-smoke.md"), "utf8"),
  );
  const actualConfigHash = sha256(
    readFileSync(path.join(root, "experiment/builder-config.json"), "utf8"),
  );
  const actualAlgorithmHash = sha256(algorithmText);
  const actualCliSchemaHash = sha256(
    readFileSync(
      path.join(root, "experiment/schemas/cli-runtime-contract.schema.json"),
      "utf8",
    ),
  );
  const actualCliRunnerHash = sha256(
    readFileSync(path.join(root, "scripts/run-cli-builders.ps1"), "utf8"),
  );
  const actualRoleSchemaHash = sha256(
    readFileSync(
      path.join(root, "experiment/schemas/role-runtime-contract.schema.json"),
      "utf8",
    ),
  );
  const actualRoleRunnerHash = sha256(
    readFileSync(path.join(root, "scripts/run-cli-role.ps1"), "utf8"),
  );
  const actualEvidenceSchemaHash = sha256(
    readFileSync(
      path.join(
        root,
        "experiment/schemas/cli-supervision-evidence.schema.json",
      ),
      "utf8",
    ),
  );
  const actualPackageSchemaHash = sha256(
    readFileSync(
      path.join(
        root,
        "experiment/schemas/blinded-package-manifest.schema.json",
      ),
      "utf8",
    ),
  );
  const actualPackageMappingSchemaHash = sha256(
    readFileSync(
      path.join(root, "experiment/schemas/blinded-package-mapping.schema.json"),
      "utf8",
    ),
  );
  const actualPackageScriptHash = sha256(
    readFileSync(
      path.join(root, "scripts/package-blinded-snapshots.mjs"),
      "utf8",
    ),
  );
  const actualReviewerPromptHash = sha256(
    readFileSync(path.join(root, "experiment/prompts/blinded-reviewer.md")),
  );
  const actualFixerPromptHash = sha256(
    readFileSync(path.join(root, "experiment/prompts/fixer.md")),
  );
  const actualTesterPromptHash = sha256(
    readFileSync(path.join(root, "experiment/prompts/tester.md")),
  );
  const actualEvaluatorPromptHash = sha256(
    readFileSync(path.join(root, "experiment/prompts/blinded-evaluator.md")),
  );
  const actualReviewSchemaHash = sha256(
    readFileSync(path.join(root, "experiment/schemas/review.schema.json")),
  );
  const actualFixSchemaHash = sha256(
    readFileSync(path.join(root, "experiment/schemas/fix.schema.json")),
  );
  const actualTestSchemaHash = sha256(
    readFileSync(path.join(root, "experiment/schemas/test.schema.json")),
  );
  const actualEvaluationSchemaHash = sha256(
    readFileSync(path.join(root, "experiment/schemas/evaluation.schema.json")),
  );
  const actualRubricHash = sha256(
    readFileSync(path.join(root, "experiment/rubric.md")),
  );
  const actualFrozenGateSetHash = frozenGateSetHash();
  const canonicalContract = readJson("experiment/canonical-contract.json");
  const goldenRun = readJson("experiment/golden-run/golden-run.json");
  const invalidCurrent = readJson("experiment/golden-run/invalid-current.json");
  const finalCommitments = {
    protocolVersion: "2.4.0-draft",
    protocolStatus: "provisional",
    supersedesLockCommit: "0fc2e5c6d0cc2355310f10e4f04fcf8e2131d636",
    lockParentCommit: null,
    hiddenSuiteId: "permissions-playground-sealed-v2",
    hiddenSuiteSha256:
      "a6f38c08eff3fd23fca3299f0777adbea4001d3ac3147272511ff9babd98a19b",
    treatmentSkillCommit: null,
    treatmentSkillTree: null,
    treatmentSkillManifestSha256: null,
    treatmentAlgorithmSha256: actualAlgorithmHash,
    neutralBuilderPromptSha256: actualPromptHash,
    runnerSmokePromptSha256: actualSmokePromptHash,
    neutralBuilderConfigSha256: actualConfigHash,
    powerShellHostPath: String.raw`C:\Users\rhenm\AppData\Local\pwsh7\pwsh.exe`,
    powerShellVersion: "7.6.2",
    powerShellHostSha256:
      "99ec38d8c4910fd5f2feeeec4dedb5076ff39a08ca21e12642822bc8d989e316",
    cliBinaryPath: String.raw`C:\Users\rhenm\.codex\plugins\.plugin-appserver\codex.exe`,
    cliVersion: "codex-cli 0.145.0-alpha.18",
    cliBinarySha256:
      "20d611ef1c9851f4da1cb4609beb6763904f72275cb91517b2400639ca1c28c4",
    cliAuthStatus: "Logged in using ChatGPT",
    cliRuntimeSchemaSha256: actualCliSchemaHash,
    cliRunnerSha256: actualCliRunnerHash,
    roleRuntimeSchemaSha256: actualRoleSchemaHash,
    roleRunnerSha256: actualRoleRunnerHash,
    supervisionEvidenceSchemaSha256: actualEvidenceSchemaHash,
    reviewerPromptTemplateSha256: actualReviewerPromptHash,
    fixerPromptTemplateSha256: actualFixerPromptHash,
    testerPromptTemplateSha256: actualTesterPromptHash,
    evaluatorPromptTemplateSha256: actualEvaluatorPromptHash,
    reviewArtifactSchemaSha256: actualReviewSchemaHash,
    fixArtifactSchemaSha256: actualFixSchemaHash,
    testArtifactSchemaSha256: actualTestSchemaHash,
    evaluationArtifactSchemaSha256: actualEvaluationSchemaHash,
    rubricSha256: actualRubricHash,
    frozenGateSetSha256: actualFrozenGateSetHash,
    blindedPackageSchemaSha256: actualPackageSchemaHash,
    blindedPackageMappingSchemaSha256: actualPackageMappingSchemaHash,
    blindedPackageScriptSha256: actualPackageScriptHash,
    v4SmokeContractSha256:
      "d1a47087dc0bfcf85638e6c9faef4c7399c98626556747f1fda31e0a67e0645d",
    v4SmokeSupervisorSha256:
      "2d1c8408af254da00f892217ea2df3863671986249605c4ef8d2431c897d9a25",
    v4SmokeSupervisionSha256:
      "06ed787a595abe3a22334e099a35af1a11e2a2a855e54aa7f37a386d28ea20c1",
    v4SmokePromptSha256:
      "5e099d26f1aa21ca6077051d681e974b1a9b3ae182dafe26741b4937c0c98a8a",
    runnerSmokeContractSha256: null,
    runnerSmokeSupervisionSha256: null,
    runnerSmokeAttestationSha256: null,
    canonicalContractSha256: canonicalHash(canonicalContract),
    goldenFixtureSha256: canonicalHash(goldenRun),
    invalidCurrentFixtureSha256: canonicalHash(invalidCurrent),
    freezeState: "provisional",
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
    builderConfig.executionLimit !== 1 ||
    builderConfig.wallSecondsMaximum !== 2400 ||
    builderConfig.maxTokens !== null ||
    !builderConfig.maxTokensUnavailableReason ||
    builderConfig.cliPath !== lock.cliBinaryPath ||
    JSON.stringify(builderConfig.invariantArgv) !==
      JSON.stringify(cliInvariantArgv)
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
  failures.push(...validateNeutralBuilderPrompt(neutralPrompt));

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
    `Protocol 2.4.0-draft provisional scaffold validation passed (${schemaPairCount} schema/data pairs; CLI runtime and golden execution fixtures accepted; ${implementationCount === 0 ? "implementation intentionally absent" : "implementation active"}).`,
  );
}
