import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
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
  validateRoleRuntimeContract,
  validateRoleSupervisionEvidence,
  validateRunManifestSemantics,
  validateScaffold,
} from "./validate-scaffold.mjs";

const clone = (value) => structuredClone(value);
const zero40 = "0".repeat(40);
const hash = (digit) => digit.repeat(64);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
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

  it("cross-binds private package provenance without leaking it into the manifest", () => {
    const contract = readJson("experiment/canonical-contract.json");
    const golden = readJson("experiment/golden-run/golden-run.json");
    golden.packages[0].snapshotRole = "Tfinal";
    golden.packages[2].snapshotRole = "B0";
    golden.blindedPackageManifest.mappingSeedSha256 = hash("f");
    assert.match(
      validateGoldenRun(golden, contract).join("\n"),
      /registered snapshot|seed or gate commitment/i,
    );
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
        golden.cliRuntimeStdoutByInvocation,
      ),
      [],
    );
  });

  it("binds smoke prompts separately and freezes PowerShell 7 string-safe execution", () => {
    const lock = readJson("experiment/lock.json");
    const normal = clone(
      readJson("experiment/golden-run/golden-run.json").cliRuntimeContract,
    );
    const smoke = clone(normal);
    smoke.smokeMode = true;
    smoke.promptSha256 = lock.runnerSmokePromptSha256;
    assert.deepEqual(validateCliRuntimeContract(normal, lock), []);
    assert.deepEqual(validateCliRuntimeContract(smoke, lock), []);
    smoke.promptSha256 = lock.neutralBuilderPromptSha256;
    assert.match(
      validateCliRuntimeContract(smoke, lock).join("\n"),
      /prompt commitment mismatch/,
    );
    normal.promptSha256 = lock.runnerSmokePromptSha256;
    assert.match(
      validateCliRuntimeContract(normal, lock).join("\n"),
      /prompt commitment mismatch/,
    );

    const runnerSources = [
      "scripts/run-cli-builders.ps1",
      "scripts/run-cli-role.ps1",
    ].map((relative) => readFileSync(path.join(root, relative), "utf8"));
    for (const source of runnerSources) {
      assert.match(source, /ConvertFrom-Json -DateKind String/);
      assert.match(source, /\[System\.Environment\]::ProcessPath/);
      assert.match(source, /RedirectStandardError = \$true/);
      assert.match(source, /Invoke-NativeCapture \$contract\.cliPath/);
      assert.match(source, /Assert-JsonSchema \$schemaPath \$contractFullPath/);
    }
    const hostBytes = readFileSync(lock.powerShellHostPath);
    assert.equal(sha256(hostBytes), lock.powerShellHostSha256);
    assert.equal(
      spawnSync(
        lock.powerShellHostPath,
        ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"],
        {
          encoding: "utf8",
        },
      ).stdout.trim(),
      lock.powerShellVersion,
    );
    const isoCheck = spawnSync(
      lock.powerShellHostPath,
      [
        "-NoProfile",
        "-Command",
        '$value = \'{"deadline":"2026-07-21T00:00:00Z"}\' | ConvertFrom-Json -DateKind String; if ($value.deadline -isnot [string]) { exit 9 }; [Console]::Write($value.deadline)',
      ],
      { encoding: "utf8" },
    );
    assert.equal(isoCheck.status, 0, isoCheck.stderr);
    assert.equal(isoCheck.stdout, "2026-07-21T00:00:00Z");
    const stderrAuthCheck = spawnSync(
      lock.powerShellHostPath,
      [
        "-NoProfile",
        "-Command",
        [
          '$ErrorActionPreference = "Stop"',
          "$psi = [System.Diagnostics.ProcessStartInfo]::new()",
          "$psi.FileName = [System.Environment]::ProcessPath",
          "$psi.UseShellExecute = $false",
          "$psi.RedirectStandardOutput = $true",
          "$psi.RedirectStandardError = $true",
          '[void]$psi.ArgumentList.Add("-NoProfile")',
          '[void]$psi.ArgumentList.Add("-Command")',
          "[void]$psi.ArgumentList.Add('[Console]::Error.Write(\"Logged in using ChatGPT\")')",
          "$process = [System.Diagnostics.Process]::new()",
          "$process.StartInfo = $psi",
          "[void]$process.Start()",
          "$stdout = $process.StandardOutput.ReadToEndAsync()",
          "$stderr = $process.StandardError.ReadToEndAsync()",
          "$process.WaitForExit()",
          '$combined = "$($stdout.GetAwaiter().GetResult())`n$($stderr.GetAwaiter().GetResult())"',
          'if ($process.ExitCode -ne 0 -or $combined -notlike "*Logged in using ChatGPT*") { exit 10 }',
        ].join("; "),
      ],
      { encoding: "utf8" },
    );
    assert.equal(stderrAuthCheck.status, 0, stderrAuthCheck.stderr);
  });

  it("rejects invalid builder and role contracts before any Codex launch", () => {
    const temp = mkdtempSync(
      path.join(os.tmpdir(), "protocol-contract-preflight-"),
    );
    try {
      const lock = readJson("experiment/lock.json");
      const lockedPath = (relative) => path.join(root, relative);
      const bytesHash = (relative) =>
        sha256(readFileSync(lockedPath(relative)));
      const invalidId = `c${"3".repeat(32)}`;
      const cases = [];

      const builder = clone(
        readJson("experiment/golden-run/golden-run.json").cliRuntimeContract,
      );
      builder.lockPath = lockedPath("experiment/lock.json");
      builder.lockSha256 = bytesHash("experiment/lock.json");
      builder.contractSchemaPath = lockedPath(
        "experiment/schemas/cli-runtime-contract.schema.json",
      );
      builder.contractSchemaSha256 = bytesHash(
        "experiment/schemas/cli-runtime-contract.schema.json",
      );
      builder.invocations[0].invocationId = invalidId;
      builder.evidenceRoot = path.join(temp, "builder-evidence-must-not-exist");
      const builderPath = path.join(temp, "invalid-builder.json");
      writeFileSync(builderPath, JSON.stringify(builder));
      cases.push([
        "scripts/run-cli-builders.ps1",
        builderPath,
        builder.evidenceRoot,
      ]);

      const role = clone(
        readJson("experiment/templates/role-runtime-contract.json"),
      );
      role.invocationId = invalidId;
      role.lockPath = lockedPath("experiment/lock.json");
      role.lockSha256 = bytesHash("experiment/lock.json");
      role.contractSchemaPath = lockedPath(
        "experiment/schemas/role-runtime-contract.schema.json",
      );
      role.contractSchemaSha256 = bytesHash(
        "experiment/schemas/role-runtime-contract.schema.json",
      );
      role.runnerPath = lockedPath("scripts/run-cli-role.ps1");
      role.runnerSha256 = bytesHash("scripts/run-cli-role.ps1");
      role.evidenceSchemaPath = lockedPath(
        "experiment/schemas/cli-supervision-evidence.schema.json",
      );
      role.evidenceSchemaSha256 = bytesHash(
        "experiment/schemas/cli-supervision-evidence.schema.json",
      );
      role.promptTemplatePath = lockedPath(
        "experiment/prompts/blinded-reviewer.md",
      );
      role.promptTemplateSha256 = bytesHash(
        "experiment/prompts/blinded-reviewer.md",
      );
      role.artifactSchemaPath = lockedPath(
        "experiment/schemas/review.schema.json",
      );
      role.artifactSchemaSha256 = bytesHash(
        "experiment/schemas/review.schema.json",
      );
      role.evidenceRoot = path.join(temp, "role-evidence-must-not-exist");
      const rolePath = path.join(temp, "invalid-role.json");
      writeFileSync(rolePath, JSON.stringify(role));
      cases.push(["scripts/run-cli-role.ps1", rolePath, role.evidenceRoot]);

      for (const [runner, contractPath, evidenceRoot] of cases) {
        const result = spawnSync(
          lock.powerShellHostPath,
          [
            "-NoProfile",
            "-File",
            lockedPath(runner),
            "-ContractPath",
            contractPath,
          ],
          { cwd: root, encoding: "utf8" },
        );
        assert.notEqual(result.status, 0, runner);
        assert.match(
          `${result.stdout}\n${result.stderr}`,
          /Runtime contract schema invalid/,
        );
        assert.equal(existsSync(evidenceRoot), false);
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
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

  it("binds every non-builder role contract to frozen runner, prompt, evidence, and artifact schemas", () => {
    const contract = readJson(
      "experiment/templates/role-runtime-contract.json",
    );
    const lock = readJson("experiment/lock.json");
    contract.contractSchemaSha256 = lock.roleRuntimeSchemaSha256;
    contract.runnerSha256 = lock.roleRunnerSha256;
    contract.evidenceSchemaSha256 = lock.supervisionEvidenceSchemaSha256;
    contract.promptTemplateSha256 = lock.reviewerPromptTemplateSha256;
    contract.artifactSchemaSha256 = lock.reviewArtifactSchemaSha256;
    assert.deepEqual(validateRoleRuntimeContract(contract, lock), []);
    contract.promptTemplateSha256 = hash("f");
    contract.artifactSchemaSha256 = hash("e");
    assert.match(
      validateRoleRuntimeContract(contract, lock).join("\n"),
      /prompt-template|artifact-schema/i,
    );
  });

  it("strictly reconciles general role JSONL, usage, hashes, and final artifact binding", () => {
    const contract = readJson(
      "experiment/templates/role-runtime-contract.json",
    );
    const result = readJson(
      "experiment/templates/cli-supervision-evidence.json",
    );
    const raw =
      `${JSON.stringify({ type: "thread.started", thread_id: "role-thread-1" })}\n` +
      `${JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 2 } })}\n`;
    result.contractSha256 = hash("1");
    result.artifactSchemaSha256 = contract.artifactSchemaSha256;
    result.processId = 321;
    result.started = true;
    result.stdinDelivered = true;
    result.exitCode = 0;
    result.argv = [
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
      "read-only",
      "--json",
      "-C",
      contract.workdir,
      "-o",
      contract.finalPath,
      "-",
    ];
    result.argvSha256 = sha256(result.argv.join("\0"));
    result.promptSha256 = contract.promptSha256;
    result.stdoutSha256 = sha256(raw);
    result.finalSha256 = hash("2");
    result.finalSchemaValid = true;
    result.artifactBindingValid = true;
    result.threadIds = ["role-thread-1"];
    result.turnCompleted = true;
    result.rawJsonlValid = true;
    result.usage = { input_tokens: 10, output_tokens: 2 };
    result.usageUnavailableReason = null;
    assert.deepEqual(
      validateRoleSupervisionEvidence(result, contract, raw),
      [],
    );
    result.unauthorizedToolOrWriteDetected = true;
    result.finalSchemaValid = false;
    assert.match(
      validateRoleSupervisionEvidence(result, contract, raw).join("\n"),
      /unauthorized|artifact\/contract binding/i,
    );
    assert.match(
      validateRoleSupervisionEvidence(result, contract).join("\n"),
      /raw JSONL is required/i,
    );
  });

  it("packages deterministic blinded snapshots and rejects traversal, nesting, and source drift", () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), "protocol-package-test-"));
    try {
      const source = path.join(temp, "source");
      mkdirSync(path.join(source, "docs"), { recursive: true });
      mkdirSync(path.join(source, "tests", "public"), { recursive: true });
      mkdirSync(path.join(source, "scripts"), { recursive: true });
      for (const [relative, contents] of [
        ["docs/permissions-playground-spec.md", "spec\n"],
        ["docs/public-test-contract.md", "contract\n"],
        ["tests/public/example.test.ts", "export {};\n"],
        ["scripts/run-public-tests.mjs", "export {};\n"],
        ["package.json", "{}\n"],
        [
          "package-lock.json",
          '{"packages":{"node_modules/baseline-browser-mapping":{}}}\n',
        ],
        ["src.txt", "neutral source\n"],
      ])
        writeFileSync(path.join(source, relative), contents);
      for (const args of [
        ["init", "-b", "main"],
        ["config", "core.autocrlf", "false"],
        ["add", "."],
        [
          "-c",
          "user.name=Protocol Test",
          "-c",
          "user.email=protocol@example.invalid",
          "commit",
          "-m",
          "fixture",
        ],
      ])
        assert.equal(spawnSync("git", args, { cwd: source }).status, 0);
      const commit = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: source,
        encoding: "utf8",
      }).stdout.trim();
      const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], {
        cwd: source,
        encoding: "utf8",
      }).stdout.trim();
      const clones = ["one", "two", "three"].map((name) => {
        const destination = path.join(temp, name);
        assert.equal(
          spawnSync("git", [
            "-c",
            "core.autocrlf=false",
            "clone",
            "--quiet",
            source,
            destination,
          ]).status,
          0,
        );
        assert.equal(
          spawnSync("git", ["config", "core.autocrlf", "false"], {
            cwd: destination,
          }).status,
          0,
        );
        return destination;
      });
      const gateFiles = [
        "docs/permissions-playground-spec.md",
        "docs/public-test-contract.md",
        "tests/public/example.test.ts",
        "scripts/run-public-tests.mjs",
        "package.json",
        "package-lock.json",
      ];
      const frozenGateSetSha256 = sha256(
        gateFiles
          .sort()
          .map(
            (relative) =>
              `${relative}\0${sha256(readFileSync(path.join(clones[0], relative)))}\n`,
          )
          .join(""),
      );
      const mapping = {
        mappingSeedSha256: hash("a"),
        randomizedOrder: ["X", "Y", "Z"],
        frozenGateSetSha256,
        provenance: {
          candidateIds: ["candidate-synthetic-one", "candidate-synthetic-two"],
          runIds: ["run-synthetic-one", "run-synthetic-two"],
          evidencePaths: [path.join(temp, "private-evidence")],
          roleArtifactNames: ["review-artifact.json", "fix-artifact.json"],
        },
        packages: ["X", "Y", "Z"].map((packageLabel, index) => ({
          packageLabel,
          sourceRole: ["B0", "T0", "Tfinal"][index],
          sourcePath: clones[index],
          sourceCommit: commit,
          sourceTree: tree,
          sourceRef: "refs/heads/main",
        })),
      };
      const mappingPath = path.join(temp, "mapping.json");
      writeFileSync(mappingPath, JSON.stringify(mapping));
      const run = (suffix) =>
        spawnSync(
          process.execPath,
          [
            "scripts/package-blinded-snapshots.mjs",
            "--mapping",
            mappingPath,
            "--output-root",
            path.join(temp, `output-${suffix}`),
            "--manifest",
            path.join(temp, `manifest-${suffix}.json`),
          ],
          { cwd: root, encoding: "utf8" },
        );
      const first = run("one");
      const second = run("two");
      assert.equal(first.status, 0, first.stderr);
      assert.equal(second.status, 0, second.stderr);
      assert.deepEqual(
        JSON.parse(first.stdout).packages.map(
          ({ packageSha256 }) => packageSha256,
        ),
        JSON.parse(second.stdout).packages.map(
          ({ packageSha256 }) => packageSha256,
        ),
      );
      const firstManifest = JSON.parse(first.stdout);
      assert.equal(
        Object.hasOwn(firstManifest.packages[0], "sourceRole"),
        false,
      );
      assert.equal(
        Object.hasOwn(firstManifest.packages[0], "sourceCommit"),
        false,
      );
      assert.equal(
        existsSync(path.join(temp, "output-one", "X", ".git")),
        false,
      );
      assert.equal(
        readdirSync(path.join(temp, "output-one")).sort().join(""),
        "XYZ",
      );
      mapping.packages[0].packageLabel = "../escape";
      writeFileSync(mappingPath, JSON.stringify(mapping));
      assert.notEqual(run("escape").status, 0);
      mapping.packages[0].packageLabel = "X";
      mapping.packages[0].sourceCommit = "0".repeat(40);
      writeFileSync(mappingPath, JSON.stringify(mapping));
      assert.notEqual(run("drift").status, 0);
      mapping.packages[0].sourceCommit = commit;
      writeFileSync(mappingPath, JSON.stringify(mapping));
      const nested = spawnSync(
        process.execPath,
        [
          "scripts/package-blinded-snapshots.mjs",
          "--mapping",
          mappingPath,
          "--output-root",
          path.join(clones[0], "nested-output"),
          "--manifest",
          path.join(temp, "nested-manifest.json"),
        ],
        { cwd: root },
      );
      assert.notEqual(nested.status, 0);
      const exactLeakCases = [
        ["source-path", clones[1]],
        ["source-ref", "refs/heads/main"],
        ["source-commit", commit],
        ["source-tree", tree],
        ["run-id", "run-synthetic-one"],
        ["candidate-id", "candidate-synthetic-one"],
        ["artifact-name", "review-artifact.json"],
        ["source-role", "B0"],
      ];
      for (const [name, marker] of exactLeakCases) {
        const leakSource = path.join(temp, `leak-${name}`);
        assert.equal(
          spawnSync("git", [
            "-c",
            "core.autocrlf=false",
            "clone",
            "--quiet",
            source,
            leakSource,
          ]).status,
          0,
        );
        assert.equal(
          spawnSync("git", ["config", "core.autocrlf", "false"], {
            cwd: leakSource,
          }).status,
          0,
        );
        writeFileSync(path.join(leakSource, "leak.txt"), `${marker}\n`);
        assert.equal(
          spawnSync("git", ["add", "."], { cwd: leakSource }).status,
          0,
        );
        assert.equal(
          spawnSync(
            "git",
            [
              "-c",
              "user.name=Protocol Test",
              "-c",
              "user.email=protocol@example.invalid",
              "commit",
              "-m",
              `exact ${name} leak`,
            ],
            { cwd: leakSource },
          ).status,
          0,
        );
        mapping.packages[0].sourcePath = leakSource;
        mapping.packages[0].sourceCommit = spawnSync(
          "git",
          ["rev-parse", "HEAD"],
          { cwd: leakSource, encoding: "utf8" },
        ).stdout.trim();
        mapping.packages[0].sourceTree = spawnSync(
          "git",
          ["rev-parse", "HEAD^{tree}"],
          { cwd: leakSource, encoding: "utf8" },
        ).stdout.trim();
        writeFileSync(mappingPath, JSON.stringify(mapping));
        assert.notEqual(run(`lineage-${name}`).status, 0, name);
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
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
