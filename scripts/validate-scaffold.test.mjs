import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  canonicalHash,
  readJson,
  root,
  validateArtifactMode,
  validateCliRuntimeContract,
  validateCliSupervisionEvidence,
  validateAssignmentSemantics,
  validateCanonicalContract,
  validateCostSemantics,
  validateEvaluationSemantics,
  validateExperimentConclusion,
  validateGoldenRun,
  validateNeutralBuilderPrompt,
  validateOutcomeSemantics,
  validateRunManifestSemantics,
  validateScaffold,
} from "./validate-scaffold.mjs";

const clone = (value) => structuredClone(value);
const zero40 = "0".repeat(40);
const hash = (digit) => digit.repeat(64);
const snapshot = (number) => ({
  commit: `${number}`.repeat(40),
  sealedAt: "2026-07-20T00:00:00Z",
  treeSha256: `${number}`.repeat(64),
  packageProcedure: "frozen-test-procedure",
});

describe("protocol 2.4.0-draft cross-contract validation", () => {
  it("accepts the prospective scaffold and seeded assignment algorithms", () => {
    assert.deepEqual(validateScaffold().failures, []);
    assert.deepEqual(
      validateAssignmentSemantics(
        readJson("experiment/templates/experiment-manifest.json"),
      ),
      [],
    );
  });

  it("enforces a byte-frozen zero-cycle baseline", () => {
    const run = clone(readJson("experiment/templates/run-manifest.json"));
    run.assignedArm = "baseline";
    run.initialSnapshot = snapshot(1);
    run.finalSnapshot = clone(run.initialSnapshot);
    run.stopReason = "baseline-zero-cycles";
    run.status = "valid";
    assert.deepEqual(validateRunManifestSemantics(run), []);

    run.cycles.push({});
    assert.match(
      validateRunManifestSemantics(run).join("\n"),
      /baseline must have exactly zero treatment cycles/,
    );
  });

  it("accepts exactly five contiguous treatment cycles and rejects a sixth", () => {
    const run = clone(readJson("experiment/templates/run-manifest.json"));
    run.assignedArm = "treatment";
    run.initialSnapshot = snapshot(1);
    run.cycles = Array.from({ length: 5 }, (_, index) => ({
      number: index + 1,
      inputSnapshot: snapshot(index + 1),
      reviewArtifactSha256: hash("a"),
      reviewFindingCount: 1,
      fixArtifactSha256: hash("b"),
      testArtifactSha256: hash("c"),
      outputSnapshot: snapshot(index + 2),
      decision: index === 4 ? "max-cycles" : "continue",
    }));
    run.finalSnapshot = snapshot(6);
    run.stopReason = "max-cycles";
    run.convergence = false;
    run.status = "valid";
    assert.deepEqual(validateRunManifestSemantics(run), []);

    run.cycles.push({ ...run.cycles[4], number: 6 });
    assert.match(
      validateRunManifestSemantics(run).join("\n"),
      /may not exceed five cycles/,
    );
  });

  it("stops a zero-finding cycle before fixer and tester", () => {
    const run = clone(readJson("experiment/templates/run-manifest.json"));
    run.assignedArm = "treatment";
    run.initialSnapshot = snapshot(1);
    run.finalSnapshot = clone(run.initialSnapshot);
    run.cycles = [
      {
        number: 1,
        inputSnapshot: clone(run.initialSnapshot),
        reviewArtifactSha256: hash("a"),
        reviewFindingCount: 0,
        fixArtifactSha256: null,
        testArtifactSha256: null,
        outputSnapshot: null,
        decision: "zero-findings",
      },
    ];
    run.stopReason = "zero-findings";
    run.convergence = true;
    run.status = "valid";
    assert.deepEqual(validateRunManifestSemantics(run), []);

    run.cycles[0].testArtifactSha256 = hash("c");
    assert.match(
      validateRunManifestSemantics(run).join("\n"),
      /must stop before fixer and tester/,
    );
  });

  it("checks rubric arithmetic, anchors, and registered caps", () => {
    const evaluation = clone(readJson("experiment/templates/evaluation.json"));
    assert.deepEqual(validateEvaluationSemantics(evaluation), []);

    evaluation.items[0].score = 1;
    evaluation.sectionTotals.functional = 1;
    evaluation.uncappedTotal = 1;
    evaluation.finalTotal = 1;
    assert.match(
      validateEvaluationSemantics(evaluation).join("\n"),
      /A1 score is not a written rubric anchor/,
    );

    evaluation.items[0].score = 0;
    evaluation.sectionTotals.functional = 0;
    evaluation.uncappedTotal = 0;
    evaluation.capConditions.executableInjectionOrUnexpectedNetwork = true;
    assert.match(
      validateEvaluationSemantics(evaluation).join("\n"),
      /capsApplied does not match/,
    );
  });

  it("checks X/Y/Z bijection, both deltas, and baseline tie selection", () => {
    const outcome = clone(readJson("experiment/templates/outcome.json"));
    assert.deepEqual(validateOutcomeSemantics(outcome), []);

    outcome.scores = { B0: 50, T0: 40, Tfinal: 55 };
    outcome.primaryTfinalMinusB0 = 5;
    outcome.secondaryTfinalMinusT0 = 15;
    outcome.mainSelection = "treatment";
    assert.deepEqual(validateOutcomeSemantics(outcome), []);

    outcome.mainSelection = "baseline";
    assert.match(
      validateOutcomeSemantics(outcome).join("\n"),
      /main selection/,
    );
  });

  it("enforces prospective one-turn role budgets with null token ceilings", () => {
    const cost = clone(readJson("experiment/templates/cost.json"));
    assert.deepEqual(validateCostSemantics(cost), []);
    cost.wallSecondsMaximum = 5400;
    assert.match(validateCostSemantics(cost).join("\n"), /wall budget/);
  });

  it("accepts the canonical contract and golden fixture in execution mode", () => {
    const contract = readJson("experiment/canonical-contract.json");
    const golden = readJson("experiment/golden-run/golden-run.json");
    assert.deepEqual(validateCanonicalContract(contract), []);
    assert.deepEqual(validateGoldenRun(golden, contract), []);
    assert.equal(golden.canonicalContractSha256, canonicalHash(contract));
  });

  it("rejects authoritative finding-field and severity divergence", () => {
    const contract = readJson("experiment/canonical-contract.json");
    contract.finding.requiredFields.splice(5, 1);
    contract.finding.severities = ["critical", "major", "minor", "note"];
    const failures = validateCanonicalContract(contract).join("\n");
    assert.match(failures, /finding fields/);
    assert.match(failures, /finding severities/);
  });

  it("rejects baseline stop-reason divergence", () => {
    const contract = readJson("experiment/canonical-contract.json");
    contract.stopping.baselineStopReason = "baseline-frozen";
    assert.match(
      validateCanonicalContract(contract).join("\n"),
      /baseline stop reason/,
    );
  });

  it("rejects X/Y/Z domain bytes and ordering divergence", () => {
    const contract = readJson("experiment/canonical-contract.json");
    contract.evaluationRandomization.domainUtf8 = "wrong-domain\n";
    contract.evaluationRandomization.labelsByRank = ["Z", "Y", "X"];
    assert.match(
      validateCanonicalContract(contract).join("\n"),
      /X\/Y\/Z randomization/,
    );
  });

  it("rejects evidence sequence, predecessor, and artifact-hash divergence", () => {
    const contract = readJson("experiment/canonical-contract.json");
    const golden = readJson("experiment/golden-run/golden-run.json");
    golden.evidenceChain[0].sequence = 1;
    golden.evidenceChain[1].previousSha256 = "f".repeat(64);
    golden.evidenceChain[2].artifactSha256 = "e".repeat(64);
    const failures = validateGoldenRun(golden, contract).join("\n");
    assert.match(failures, /sequence/);
    assert.match(failures, /predecessor/);
    assert.match(failures, /artifact hash/);
  });

  it("rejects evaluation shape, anchors, arithmetic, and tie-policy divergence", () => {
    const contract = readJson("experiment/canonical-contract.json");
    const golden = readJson("experiment/golden-run/golden-run.json");
    golden.evaluations[0].items[0].id = "A2";
    golden.evaluations[0].items[1].score = 1;
    golden.evaluations[0].sectionTotals.functional = 49;
    golden.outcome.mainSelection = "treatment";
    const failures = validateGoldenRun(golden, contract).join("\n");
    assert.match(failures, /rubric ID|rubric anchor|subtotal/);
    assert.match(failures, /main selection/);
  });

  it("rejects role-budget and maxTokens divergence", () => {
    const contract = readJson("experiment/canonical-contract.json");
    contract.roles.unblinder.wallSecondsMaximum = 301;
    contract.costPolicy.maxTokens = 1;
    const failures = validateCanonicalContract(contract).join("\n");
    assert.match(failures, /unblinder wall budget/);
    assert.match(failures, /maxTokens policy/);
  });

  it("rejects public-gate and hidden-suite binding divergence", () => {
    const contract = readJson("experiment/canonical-contract.json");
    contract.gates.testerCommand = "npm test";
    contract.hiddenSuite.sha256 = "f".repeat(64);
    const failures = validateCanonicalContract(contract).join("\n");
    assert.match(failures, /public gate commands/);
    assert.match(failures, /hidden-suite binding/);
  });

  it("binds every golden builder freeze to canonical and lock prompt/config commitments", () => {
    const contract = readJson("experiment/canonical-contract.json");
    const golden = readJson("experiment/golden-run/golden-run.json");
    golden.builderFreezes["candidate-a"].promptSha256 = hash("e");
    assert.match(
      validateGoldenRun(golden, contract).join("\n"),
      /prompt commitment drift/,
    );

    const configDrift = readJson("experiment/golden-run/golden-run.json");
    configDrift.builderFreezes["candidate-b"].configSha256 = hash("d");
    assert.match(
      validateGoldenRun(configDrift, contract).join("\n"),
      /config commitment drift/,
    );

    contract.builderFreeze.configSha256 = hash("c");
    assert.match(
      validateCanonicalContract(contract).join("\n"),
      /builder prompt\/config commitments/,
    );
  });

  it("accepts the frozen CLI runtime contract and concurrent evidence", () => {
    const golden = readJson("experiment/golden-run/golden-run.json");
    assert.deepEqual(validateCliRuntimeContract(golden.cliRuntimeContract), []);
    assert.deepEqual(
      validateCliSupervisionEvidence(
        golden.cliRuntimeEvidence,
        golden.cliRuntimeContract,
      ),
      [],
    );
  });

  it("rejects binary, argv-order, resume, and config drift", () => {
    const golden = readJson("experiment/golden-run/golden-run.json");
    golden.cliRuntimeContract.cliSha256 = hash("f");
    golden.cliRuntimeContract.invariantArgv = [
      "exec",
      "-a",
      "never",
      "resume",
      "--config",
      "x=y",
    ];
    const failures = validateCliRuntimeContract(golden.cliRuntimeContract).join(
      "\n",
    );
    assert.match(failures, /binary|cli/i);
    assert.match(failures, /argv|ephemeral|resume|config/i);
  });

  it("rejects missing lifecycle, timeout, nonzero exit, and unauthorized writes", () => {
    const golden = readJson("experiment/golden-run/golden-run.json");
    const result = golden.cliRuntimeEvidence.results[0];
    result.threadIds = [];
    result.turnCompleted = false;
    result.timedOut = true;
    result.exitCode = 1;
    result.unauthorizedToolOrWriteDetected = true;
    const failures = validateCliSupervisionEvidence(
      golden.cliRuntimeEvidence,
      golden.cliRuntimeContract,
    ).join("\n");
    assert.match(failures, /thread|lifecycle/i);
    assert.match(failures, /timeout|exit/i);
    assert.match(failures, /unauthorized/i);
  });

  it("rejects duplicated process and thread IDs and differing prompt bytes", () => {
    const golden = readJson("experiment/golden-run/golden-run.json");
    const [left, right] = golden.cliRuntimeEvidence.results;
    right.processId = left.processId;
    right.threadIds = [...left.threadIds];
    right.promptSha256 = hash("e");
    const failures = validateCliSupervisionEvidence(
      golden.cliRuntimeEvidence,
      golden.cliRuntimeContract,
    ).join("\n");
    assert.match(failures, /process/i);
    assert.match(failures, /thread/i);
    assert.match(failures, /prompt/i);
  });

  it("requires unavailable reasons for unobservable runtime metadata", () => {
    const golden = readJson("experiment/golden-run/golden-run.json");
    golden.cliRuntimeEvidence.results[0].runtimeModelUnavailableReason = "";
    assert.match(
      validateCliSupervisionEvidence(
        golden.cliRuntimeEvidence,
        golden.cliRuntimeContract,
      ).join("\n"),
      /unavailable reason/i,
    );
  });

  it("requires raw-stdin/current-checkout neutral builder prose", () => {
    const prompt = readFileSync(
      path.join(root, "experiment/prompts/neutral-builder.md"),
      "utf8",
    );
    assert.deepEqual(validateNeutralBuilderPrompt(prompt), []);
    assert.match(
      validateNeutralBuilderPrompt(
        prompt.replace(
          "The operator writes this entire file byte-for-byte to raw standard input",
          "The operator may wrap this file before standard input",
        ),
      ).join("\n"),
      /raw standard input|wrapper/i,
    );
  });

  it("accepts a valid outcome with a preserved invalid attempt", () => {
    const golden = readJson("experiment/golden-run/golden-run.json");
    assert.equal(golden.invalidAttempts.length, 5);
    assert.deepEqual(validateExperimentConclusion(golden), []);
  });

  it("accepts an invalid current run only without evaluations or outcome", () => {
    const invalid = readJson("experiment/golden-run/invalid-current.json");
    assert.deepEqual(validateExperimentConclusion(invalid), []);
  });

  it("rejects an invalid current run carrying a scored outcome", () => {
    const invalid = readJson("experiment/golden-run/invalid-current.json");
    invalid.outcome = { score: 100 };
    const failures = validateExperimentConclusion(invalid).join("\n");
    assert.match(failures, /outcome must be null/);
    assert.match(failures, /active invalidation forbids/);
  });

  it("rejects arbitrary completed experiment status", () => {
    const invalid = readJson("experiment/golden-run/invalid-current.json");
    invalid.status = "blocked";
    assert.match(
      validateExperimentConclusion(invalid).join("\n"),
      /status must be valid or invalid/,
    );
  });

  it("exposes explicit template and execution CLI modes", () => {
    const cases = [
      ["template", "experiment/templates/run-manifest.json"],
      ["execution", "experiment/golden-run/golden-run.json"],
      ["execution", "experiment/golden-run/invalid-current.json"],
    ];
    for (const [mode, input] of cases) {
      const result = spawnSync(
        process.execPath,
        ["scripts/validate-scaffold.mjs", "--mode", mode, "--input", input],
        { cwd: root, encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, new RegExp(`^${mode} validation passed:`));
    }
    const missingMode = spawnSync(
      process.execPath,
      [
        "scripts/validate-scaffold.mjs",
        "--input",
        "experiment/golden-run/golden-run.json",
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(missingMode.status, 1);
    assert.match(missingMode.stderr, /both required/);
  });

  it("rejects zero hashes and seeds in execution mode", () => {
    const failures = validateArtifactMode(
      { snapshotSha256: "0".repeat(64), seedHex: "0".repeat(64) },
      "execution",
    );
    assert.equal(failures.length, 2);
  });

  it("rejects required-at-run, placeholder, and sentinel IDs", () => {
    const failures = validateArtifactMode(
      {
        operator: "required-at-run",
        workerId: "template-worker-id",
        snapshotId: "sentinel-snapshot",
      },
      "execution",
    );
    assert.equal(failures.length, 3);
  });

  it("rejects duplicate worker IDs", () => {
    const contract = readJson("experiment/canonical-contract.json");
    const golden = readJson("experiment/golden-run/golden-run.json");
    golden.workers[1].workerId = golden.workers[0].workerId;
    assert.match(
      validateGoldenRun(golden, contract).join("\n"),
      /worker IDs must be unique/,
    );
  });

  it("rejects unchanged templates in execution mode", () => {
    const template = readJson("experiment/templates/run-manifest.json");
    assert.match(
      validateArtifactMode(template, "execution", [template]).join("\n"),
      /unchanged from a template/,
    );
  });

  it("rejects a provisional lock in execution mode", () => {
    const lock = readJson("experiment/lock.json");
    lock.freezeState = "provisional";
    assert.match(
      validateArtifactMode(lock, "execution").join("\n"),
      /provisional lock/,
    );
  });
});

assert.equal(zero40.length, 40);
