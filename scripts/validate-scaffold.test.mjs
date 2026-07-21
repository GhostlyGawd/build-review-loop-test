import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  canonicalHash,
  preflightAggregateHash,
  readJson,
  remainingRoleWaitMilliseconds,
  roleWaitFromAbsoluteDeadline,
  root,
  validateArtifactMode,
  validateActualExecPermissionProbe,
  validateCliRuntimeContract,
  validateCliSupervisionEvidence,
  validateAssignmentSemantics,
  validateCanonicalContract,
  validateCostSemantics,
  validateEvaluationSemantics,
  validateExperimentConclusion,
  validateFinalLockEvidence,
  validateGoldenRun,
  validateNeutralBuilderPrompt,
  validateOutcomeSemantics,
  validateRoleArtifactChronology,
  validateRoleRuntimeContract,
  validateRoleSupervisionEvidence,
  validateRunManifestSemantics,
  validateScaffold,
} from "./validate-scaffold.mjs";

const clone = (value) => structuredClone(value);
const zero40 = "0".repeat(40);
const hash = (digit) => digit.repeat(64);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exactClrInternalErrorStatus = 0x80131506;
const normalizeDiagnostic = (value) =>
  (value ?? "").replaceAll("\r\n", "\n").trim();
const isExactClrStartupCrash = (result) =>
  result.status === exactClrInternalErrorStatus &&
  result.signal === null &&
  (result.error === undefined || result.error === null) &&
  normalizeDiagnostic(result.stdout) === "" &&
  normalizeDiagnostic(result.stderr) ===
    "Fatal error.\nInternal CLR error. (0x80131506)";
const snapshot = (number) => ({
  commit: `${number}`.repeat(40),
  sealedAt: "2026-07-20T00:00:00Z",
  treeSha256: `${number}`.repeat(64),
  packageProcedure: "frozen-test-procedure",
});

const supervisorJsonHelperBlock = (relative) => {
  const source = readFileSync(path.join(root, relative), "utf8");
  const start = source.indexOf("# SUPERVISOR_JSON_HELPER_START");
  const end = source.indexOf("# SUPERVISOR_JSON_HELPER_END");
  assert.ok(start >= 0 && end > start, `${relative} helper markers missing`);
  return source.slice(start, end + "# SUPERVISOR_JSON_HELPER_END".length);
};

const runGit = (cwd, args, env = {}) =>
  spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

const windowsShortPath = (absolute) => {
  if (process.platform !== "win32") return null;
  const suffix = [];
  let cursor = path.resolve(absolute);
  while (path.dirname(cursor) !== cursor) {
    const parent = path.dirname(cursor);
    const name = path.basename(cursor);
    const result = spawnSync("cmd.exe", ["/d", "/c", "dir", "/x", parent], {
      encoding: "utf8",
    });
    if (result.status !== 0) return null;
    const line = result.stdout
      .split(/\r?\n/u)
      .find((value) => value.trimEnd().endsWith(` ${name}`));
    if (line) {
      const fields = line.trim().split(/\s+/u);
      const alias = fields.at(-2);
      if (
        alias &&
        alias !== "<DIR>" &&
        alias.toLowerCase() !== name.toLowerCase()
      )
        return path.join(parent, alias, ...suffix);
    }
    suffix.unshift(name);
    cursor = parent;
  }
  return null;
};

const createProjectionFixture = (entries, contents, layout = {}) => {
  const temporaryRoot = mkdtempSync(
    path.join(root, "node_modules", "builder-projection-"),
  );
  const source = path.join(temporaryRoot, "source");
  mkdirSync(source);
  for (const [relative, content] of Object.entries(contents)) {
    const absolute = path.join(source, ...relative.split("/"));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  const allowlist = path.join(source, "fixture-allowlist.json");
  writeFileSync(
    allowlist,
    `${JSON.stringify({ version: "1.0.0", files: entries }, null, 2)}\n`,
  );
  assert.equal(runGit(source, ["init", "--initial-branch=source"]).status, 0);
  assert.equal(
    runGit(source, ["config", "user.name", "Projection Test"]).status,
    0,
  );
  assert.equal(
    runGit(source, ["config", "user.email", "projection@invalid.local"]).status,
    0,
  );
  assert.equal(runGit(source, ["add", "--all"]).status, 0);
  assert.equal(runGit(source, ["commit", "-m", "source fixture"]).status, 0);
  const sourceCommit = runGit(source, ["rev-parse", "HEAD"]).stdout.trim();
  const sourceTree = runGit(source, ["rev-parse", "HEAD^{tree}"]).stdout.trim();
  const sourceArgument = layout.useShortSource
    ? windowsShortPath(source)
    : source;
  let destinationA = layout.destinationAInsideSource
    ? path.join(source, "builder-a")
    : path.join(temporaryRoot, "builder-a");
  if (layout.destinationParentJunction) {
    const physicalParent = path.join(temporaryRoot, "physical-parent");
    const aliasParent = path.join(temporaryRoot, "alias-parent");
    mkdirSync(physicalParent);
    symlinkSync(physicalParent, aliasParent, "junction");
    destinationA = path.join(aliasParent, "builder-a");
  }
  const destinationB = layout.destinationBInsideA
    ? path.join(destinationA, "builder-b")
    : path.join(temporaryRoot, "builder-b");
  const manifest = layout.manifestInsideA
    ? path.join(destinationA, "manifest.json")
    : layout.manifestInsideSource
      ? path.join(source, "private-manifest.json")
      : path.join(temporaryRoot, "private", "manifest.json");
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts/prepare-builder-input.mjs"),
      "--source",
      sourceArgument ?? source,
      "--destination-a",
      destinationA,
      "--destination-b",
      destinationB,
      "--allowlist",
      allowlist,
      "--manifest",
      manifest,
      "--source-commit",
      sourceCommit,
      "--source-tree",
      sourceTree,
    ],
    { encoding: "utf8" },
  );
  return {
    temporaryRoot,
    sourceCommit,
    destinationA,
    destinationB,
    manifest,
    result,
    shortSourceAvailable: !layout.useShortSource || sourceArgument != null,
  };
};

const createBuilderRunnerFixture = () => {
  const temporaryRoot = mkdtempSync(
    path.join(root, "node_modules", "builder-runner-"),
  );
  const source = path.join(temporaryRoot, "source");
  mkdirSync(source);
  const allowlist = readJson("experiment/builder-input-allowlist.json");
  for (const entry of allowlist.files) {
    const target = path.join(source, ...entry.source.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(root, ...entry.source.split("/")), target);
  }
  const fixtureAllowlist = path.join(
    source,
    "experiment",
    "builder-input-allowlist.json",
  );
  mkdirSync(path.dirname(fixtureAllowlist), { recursive: true });
  copyFileSync(
    path.join(root, "experiment/builder-input-allowlist.json"),
    fixtureAllowlist,
  );
  for (const args of [
    ["init", "--initial-branch=source"],
    ["config", "user.name", "Runner Test"],
    ["config", "user.email", "runner@invalid.local"],
    ["add", "--all"],
    ["commit", "-m", "runner fixture"],
  ])
    assert.equal(runGit(source, args).status, 0);
  const sourceCommit = runGit(source, ["rev-parse", "HEAD"]).stdout.trim();
  const sourceTree = runGit(source, ["rev-parse", "HEAD^{tree}"]).stdout.trim();
  const workA = path.join(temporaryRoot, "builder-a");
  const workB = path.join(temporaryRoot, "builder-b");
  const manifestPath = path.join(temporaryRoot, "private", "manifest.json");
  const prepare = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts/prepare-builder-input.mjs"),
      "--source",
      source,
      "--destination-a",
      workA,
      "--destination-b",
      workB,
      "--allowlist",
      fixtureAllowlist,
      "--manifest",
      manifestPath,
      "--source-commit",
      sourceCommit,
      "--source-tree",
      sourceTree,
    ],
    { encoding: "utf8" },
  );
  assert.equal(prepare.status, 0, prepare.stderr);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const lock = clone(readJson("experiment/lock.json"));
  const lockedPath = (relative) => path.join(root, relative);
  const bytesHash = (relative) => sha256(readFileSync(lockedPath(relative)));
  lock.cliRuntimeSchemaSha256 = bytesHash(
    "experiment/schemas/cli-runtime-contract.schema.json",
  );
  lock.cliRunnerSha256 = bytesHash("scripts/run-cli-builders.ps1");
  lock.canonicalPathHelperSha256 = bytesHash("scripts/canonicalize-paths.mjs");
  lock.builderInputPreparationScriptSha256 = bytesHash(
    "scripts/prepare-builder-input.mjs",
  );
  lock.supervisionEvidenceSchemaSha256 = bytesHash(
    "experiment/schemas/cli-supervision-evidence.schema.json",
  );
  const shadowLockPath = path.join(temporaryRoot, "private", "lock.json");
  writeFileSync(shadowLockPath, `${JSON.stringify(lock, null, 2)}\n`);
  const evidenceRoot = path.join(temporaryRoot, "evidence");
  const runtimeRoot = path.join(temporaryRoot, "runtime");
  const contract = clone(
    readJson("experiment/golden-run/golden-run.json").cliRuntimeContract,
  );
  Object.assign(contract, {
    cliPath: lock.cliBinaryPath,
    cliVersion: lock.cliVersion,
    cliSha256: lock.cliBinarySha256,
    authStatus: lock.cliAuthStatus,
    lockPath: shadowLockPath,
    lockSha256: sha256(readFileSync(shadowLockPath)),
    contractSchemaPath: lockedPath(
      "experiment/schemas/cli-runtime-contract.schema.json",
    ),
    contractSchemaSha256: lock.cliRuntimeSchemaSha256,
    canonicalPathHelperPath: lockedPath("scripts/canonicalize-paths.mjs"),
    canonicalPathHelperSha256: lock.canonicalPathHelperSha256,
    sourceCommonStartCommit: sourceCommit,
    sourceCommonStartTree: sourceTree,
    commonStartCommit: manifest.projectionCommit,
    commonStartTree: manifest.projectionTree,
    builderInputManifestPath: manifestPath,
    builderInputManifestSha256: sha256(readFileSync(manifestPath)),
    builderInputManifestSchemaPath: lockedPath(
      "experiment/schemas/builder-input-manifest.schema.json",
    ),
    builderInputManifestSchemaSha256: lock.builderInputManifestSchemaSha256,
    builderInputAllowlistPath: fixtureAllowlist,
    builderInputAllowlistSha256: lock.builderInputAllowlistSha256,
    builderInputPreparationScriptPath: lockedPath(
      "scripts/prepare-builder-input.mjs",
    ),
    builderInputPreparationScriptSha256:
      lock.builderInputPreparationScriptSha256,
    builderInputProjectionSha256: manifest.projectionSha256,
    promptPath: lockedPath("experiment/prompts/runner-smoke.md"),
    promptSha256: lock.runnerSmokePromptSha256,
    evidenceRoot,
    smokeMode: true,
  });
  for (const [index, workdir] of [workA, workB].entries()) {
    const output = path.join(evidenceRoot, index === 0 ? "a" : "b");
    Object.assign(contract.invocations[index], {
      workdir,
      finalPath: path.join(output, "final.json"),
      stdoutPath: path.join(output, "stdout.jsonl"),
      stderrPath: path.join(output, "stderr.txt"),
      evidencePath: path.join(output, "evidence.json"),
      postStatePath: path.join(output, "post-state.json"),
      tempRoot: path.join(runtimeRoot, index === 0 ? "a-temp" : "b-temp"),
      cacheRoot: path.join(runtimeRoot, index === 0 ? "a-cache" : "b-cache"),
      dependencyRoot: path.join(runtimeRoot, index === 0 ? "a-deps" : "b-deps"),
      port: 43001 + index,
    });
  }
  const run = () => {
    const contractPath = path.join(temporaryRoot, "private", "contract.json");
    writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
    const argv = [
      "-NoProfile",
      "-File",
      lockedPath("scripts/run-cli-builders.ps1"),
      "-ContractPath",
      contractPath,
    ];
    let result;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      result = spawnSync(lock.powerShellHostPath, argv, {
        cwd: root,
        encoding: "utf8",
        timeout: 120000,
      });
      if (!isExactClrStartupCrash(result)) break;
    }
    return result;
  };
  return {
    temporaryRoot,
    workA,
    workB,
    manifestPath,
    evidenceRoot,
    contract,
    run,
  };
};

const createRoleRunnerFixture = () => {
  const temporaryRoot = mkdtempSync(
    path.join(root, "node_modules", "role-runner-"),
  );
  const workdir = path.join(temporaryRoot, "role-workdir");
  mkdirSync(workdir);
  writeFileSync(path.join(workdir, "README.md"), "neutral role fixture\n");
  for (const args of [
    ["init", "--initial-branch=role-input"],
    ["config", "core.autocrlf", "false"],
    ["config", "user.name", "Role Runner Test"],
    ["config", "user.email", "role-runner@invalid.local"],
    ["add", "--all"],
    ["commit", "-m", "role fixture"],
  ])
    assert.equal(runGit(workdir, args).status, 0);
  const inputCommit = runGit(workdir, ["rev-parse", "HEAD"]).stdout.trim();
  const inputTree = runGit(workdir, ["rev-parse", "HEAD^{tree}"]).stdout.trim();
  const lockedPath = (relative) => path.join(root, relative);
  const bytesHash = (relative) => sha256(readFileSync(lockedPath(relative)));
  const lock = clone(readJson("experiment/lock.json"));
  lock.roleRuntimeSchemaSha256 = bytesHash(
    "experiment/schemas/role-runtime-contract.schema.json",
  );
  lock.roleRunnerSha256 = bytesHash("scripts/run-cli-role.ps1");
  lock.supervisionEvidenceSchemaSha256 = bytesHash(
    "experiment/schemas/cli-supervision-evidence.schema.json",
  );
  lock.canonicalPathHelperSha256 = bytesHash("scripts/canonicalize-paths.mjs");
  const privateRoot = path.join(temporaryRoot, "private");
  mkdirSync(privateRoot);
  const shadowLockPath = path.join(privateRoot, "lock.json");
  writeFileSync(shadowLockPath, `${JSON.stringify(lock, null, 2)}\n`);
  const templatePath = lockedPath("experiment/prompts/blinded-reviewer.md");
  const substitutions = {
    CANDIDATE_LABEL: "candidate-alias-test",
    CYCLE_NUMBER: "1",
    SNAPSHOT_COMMIT: inputCommit,
    WALL_CLOCK_DEADLINE_ISO: new Date(Date.now() + 60_000).toISOString(),
  };
  let rendered = readFileSync(templatePath, "utf8");
  for (const [key, value] of Object.entries(substitutions))
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  const promptPath = path.join(privateRoot, "reviewer-prompt.md");
  writeFileSync(promptPath, rendered);
  const evidenceRoot = path.join(temporaryRoot, "evidence");
  const runtimeRoot = path.join(temporaryRoot, "role-runtime");
  const contract = clone(
    readJson("experiment/templates/role-runtime-contract.json"),
  );
  Object.assign(contract, {
    role: "reviewer",
    candidateLabel: substitutions.CANDIDATE_LABEL,
    cycle: 1,
    invocationId: `d${"8".repeat(31)}`,
    cliPath: lock.cliBinaryPath,
    cliVersion: lock.cliVersion,
    cliSha256: lock.cliBinarySha256,
    authStatus: lock.cliAuthStatus,
    lockPath: shadowLockPath,
    lockSha256: sha256(readFileSync(shadowLockPath)),
    contractSchemaPath: lockedPath(
      "experiment/schemas/role-runtime-contract.schema.json",
    ),
    contractSchemaSha256: lock.roleRuntimeSchemaSha256,
    canonicalPathHelperPath: lockedPath("scripts/canonicalize-paths.mjs"),
    canonicalPathHelperSha256: lock.canonicalPathHelperSha256,
    runnerPath: lockedPath("scripts/run-cli-role.ps1"),
    runnerSha256: lock.roleRunnerSha256,
    evidenceSchemaPath: lockedPath(
      "experiment/schemas/cli-supervision-evidence.schema.json",
    ),
    evidenceSchemaSha256: lock.supervisionEvidenceSchemaSha256,
    promptTemplatePath: templatePath,
    promptTemplateSha256: lock.reviewerPromptTemplateSha256,
    promptSubstitutions: substitutions,
    artifactSchemaPath: lockedPath("experiment/schemas/review.schema.json"),
    artifactSchemaSha256: lock.reviewArtifactSchemaSha256,
    inputCommit,
    inputTree,
    promptPath,
    promptSha256: sha256(readFileSync(promptPath)),
    workdir,
    evidenceRoot,
    finalPath: path.join(evidenceRoot, "final.json"),
    stdoutPath: path.join(evidenceRoot, "stdout.jsonl"),
    stderrPath: path.join(evidenceRoot, "stderr.txt"),
    evidencePath: path.join(evidenceRoot, "evidence.json"),
    tempRoot: path.join(runtimeRoot, "temp"),
    cacheRoot: path.join(runtimeRoot, "cache"),
    dependencyRoot: path.join(runtimeRoot, "deps"),
    deadlineSeconds: 60,
  });
  const run = () => {
    const contractPath = path.join(privateRoot, "role-contract.json");
    writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
    const argv = [
      "-NoProfile",
      "-File",
      lockedPath("scripts/run-cli-role.ps1"),
      "-ContractPath",
      contractPath,
    ];
    let result;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      result = spawnSync(lock.powerShellHostPath, argv, {
        cwd: root,
        encoding: "utf8",
        timeout: 120000,
      });
      if (!isExactClrStartupCrash(result)) break;
    }
    return result;
  };
  const setDeadline = (deadline) => {
    contract.promptSubstitutions.WALL_CLOCK_DEADLINE_ISO = deadline;
    let prompt = readFileSync(templatePath, "utf8");
    for (const [key, value] of Object.entries(contract.promptSubstitutions))
      prompt = prompt.replaceAll(`{{${key}}}`, value);
    writeFileSync(promptPath, prompt);
    contract.promptSha256 = sha256(readFileSync(promptPath));
  };
  return {
    temporaryRoot,
    workdir,
    promptPath,
    evidenceRoot,
    contract,
    run,
    setDeadline,
  };
};

describe("protocol 2.8.0 locked cross-contract validation", () => {
  it("parses populated supervisor JSON and fails closed on malformed, empty, or nonzero helper results", () => {
    const builderBlock = supervisorJsonHelperBlock(
      "scripts/run-cli-builders.ps1",
    );
    const roleBlock = supervisorJsonHelperBlock("scripts/run-cli-role.ps1");
    assert.equal(roleBlock, builderBlock);
    for (const relative of [
      "scripts/run-cli-builders.ps1",
      "scripts/run-cli-role.ps1",
    ]) {
      const source = readFileSync(path.join(root, relative), "utf8");
      assert.doesNotMatch(
        source,
        /candidateCommitScriptPath[^\r\n]*\|\s*ConvertFrom-JsonLiteral/u,
      );
      assert.match(source, /Convert-RequiredJsonHelperOutput/u);
    }

    const temporaryRoot = mkdtempSync(
      path.join(root, "node_modules", "supervisor-json-helper-"),
    );
    const workdir = path.join(temporaryRoot, "candidate");
    const indexPath = path.join(temporaryRoot, "private", "index");
    const harnessPath = path.join(temporaryRoot, "harness.ps1");
    mkdirSync(workdir);
    try {
      for (const args of [
        ["init", "--initial-branch=fixture"],
        ["config", "core.autocrlf", "false"],
        ["config", "user.name", "Supervisor JSON Test"],
        ["config", "user.email", "supervisor-json@invalid.local"],
      ])
        assert.equal(runGit(workdir, args).status, 0);
      writeFileSync(path.join(workdir, "base.txt"), "base\n");
      assert.equal(runGit(workdir, ["add", "--all"]).status, 0);
      assert.equal(runGit(workdir, ["commit", "-m", "fixture"]).status, 0);
      const parent = runGit(workdir, ["rev-parse", "HEAD"]).stdout.trim();
      writeFileSync(path.join(workdir, "change.txt"), "change\n");
      writeFileSync(
        harnessPath,
        [
          "param([string]$Mode,[string]$CommitScript,[string]$Workdir,[string]$ExpectedParent,[string]$IndexPath)",
          '$ErrorActionPreference = "Stop"',
          "function ConvertFrom-JsonLiteral([string]$Json) { return $Json | ConvertFrom-Json -DateKind String }",
          builderBlock,
          'if ($Mode -eq "success") {',
          "  $LASTEXITCODE = 0",
          '  $output = @(& $CommitScript -Workdir $Workdir -ExpectedParent $ExpectedParent -TemporaryIndexPath $IndexPath -Message "Seal helper regression" -Timestamp "2026-07-21T00:00:00Z")',
          '  $value = Convert-RequiredJsonHelperOutput $output $LASTEXITCODE "Candidate commit helper"',
          "  if ($null -eq $value.commit) { exit 91 }",
          "  $value | ConvertTo-Json -Compress",
          "  exit 0",
          "}",
          "try {",
          '  if ($Mode -eq "malformed") { [void](Convert-RequiredJsonHelperOutput @("{") 0 "Candidate commit helper") }',
          '  elseif ($Mode -eq "empty") { [void](Convert-RequiredJsonHelperOutput @() 0 "Candidate commit helper") }',
          '  elseif ($Mode -eq "nonzero") { [void](Convert-RequiredJsonHelperOutput @("{`"commit`":`"ignored`"}") 7 "Candidate commit helper") }',
          "  else { exit 92 }",
          "  exit 93",
          "} catch { [Console]::Error.Write($_.Exception.Message); exit 23 }",
          "",
        ].join("\n"),
      );
      const lock = readJson("experiment/lock.json");
      const invoke = (mode) =>
        spawnSync(
          lock.powerShellHostPath,
          [
            "-NoProfile",
            "-File",
            harnessPath,
            "-Mode",
            mode,
            "-CommitScript",
            path.join(root, "scripts/commit-candidate.ps1"),
            "-Workdir",
            workdir,
            "-ExpectedParent",
            parent,
            "-IndexPath",
            indexPath,
          ],
          { encoding: "utf8" },
        );
      const success = invoke("success");
      assert.equal(success.status, 0, success.stderr);
      const committed = JSON.parse(success.stdout);
      assert.equal(committed.parent, parent);
      assert.equal(
        runGit(workdir, ["rev-parse", "HEAD"]).stdout.trim(),
        committed.commit,
      );
      assert.equal(runGit(workdir, ["status", "--porcelain=v1"]).stdout, "");

      for (const [mode, diagnostic] of [
        ["malformed", /malformed JSON/i],
        ["empty", /empty output/i],
        ["nonzero", /exited nonzero with code 7/i],
      ]) {
        const result = invoke(mode);
        assert.equal(result.status, 23, `${mode}: ${result.stderr}`);
        assert.match(result.stderr, diagnostic);
      }
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("preserves the exact five-stage candidate tester gate", () => {
    const schema = readJson("experiment/schemas/test.schema.json");
    const componentResults = schema.properties.componentResults;
    assert.equal(componentResults.minItems, 5);
    assert.equal(componentResults.maxItems, 5);
    assert.deepEqual(
      componentResults.prefixItems.map((entry) => entry.$ref),
      [
        "#/$defs/formatCheck",
        "#/$defs/lint",
        "#/$defs/typecheck",
        "#/$defs/publicTests",
        "#/$defs/build",
      ],
    );
    const contract = readJson("experiment/canonical-contract.json");
    assert.deepEqual(contract.gates.componentCommands, [
      "npm run format:check",
      "npm run lint",
      "npm run typecheck",
      "npm run test:public",
      "npm run build",
    ]);
    assert.equal(contract.gates.testerCommand, "npm run check");
  });
  it("retries only the exact CLR startup crash signature", () => {
    const exact = {
      status: exactClrInternalErrorStatus,
      signal: null,
      error: undefined,
      stdout: "",
      stderr: "Fatal error.\r\nInternal CLR error. (0x80131506)\r\n",
    };
    assert.equal(isExactClrStartupCrash(exact), true);
    assert.equal(
      isExactClrStartupCrash({
        ...exact,
        stderr: `${exact.stderr}product failure`,
      }),
      false,
    );
    assert.equal(isExactClrStartupCrash({ ...exact, status: 1 }), false);
    assert.equal(
      isExactClrStartupCrash({ ...exact, signal: "SIGTERM" }),
      false,
    );
    assert.equal(
      isExactClrStartupCrash({ ...exact, error: new Error("spawn failed") }),
      false,
    );
  });

  it("binds actual-exec permissions to the builder runtime dimensions", () => {
    const lock = readJson("experiment/lock.json");
    const probe = readJson(
      "experiment/preflight/actual-exec-permission-probe-2.7.0.json",
    );
    const builderConfig = readJson("experiment/builder-config.json");
    assert.deepEqual(validateActualExecPermissionProbe(probe, lock), []);
    assert.deepEqual(probe.invariantArgv, builderConfig.invariantArgv);
    const builderRunner = readFileSync(
      path.join(root, "scripts/run-cli-builders.ps1"),
      "utf8",
    );
    for (const literal of [
      'windows.sandbox="elevated"',
      "sandbox_workspace_write.network_access=false",
      "--ignore-rules",
      'Environment["TEMP"]',
      'Environment["TMP"]',
      'Environment["NPM_CONFIG_CACHE"]',
      'Environment["CODEX_DEPENDENCY_ROOT"]',
      'Environment["PORT"]',
    ])
      assert.ok(builderRunner.includes(literal), literal);
  });
  it("seals allowed candidate changes without hooks and rejects frozen or in-worktree indexes", () => {
    const temporaryRoot = mkdtempSync(
      path.join(root, "node_modules", "supervisor-commit-"),
    );
    const workdir = path.join(temporaryRoot, "candidate");
    mkdirSync(workdir);
    try {
      writeFileSync(path.join(workdir, "seed.txt"), "seed");
      for (const args of [
        ["init", "--initial-branch=main"],
        ["config", "core.autocrlf", "false"],
        ["config", "user.name", "Commit Test"],
        ["config", "user.email", "commit-test@example.invalid"],
        ["add", "--all"],
        ["commit", "-m", "root"],
      ])
        assert.equal(runGit(workdir, args).status, 0);
      const parent = runGit(workdir, ["rev-parse", "HEAD"]).stdout.trim();
      const hookCanary = path.join(temporaryRoot, "hook-ran.txt");
      const hook = path.join(workdir, ".git", "hooks", "post-commit");
      writeFileSync(hook, `#!/bin/sh\necho ran > "${hookCanary}"\n`);
      chmodSync(hook, 0o755);
      writeFileSync(path.join(workdir, "allowed.txt"), "allowed");
      const seal = spawnSync(
        readJson("experiment/lock.json").powerShellHostPath,
        [
          "-NoProfile",
          "-File",
          path.join(root, "scripts/commit-candidate.ps1"),
          "-Workdir",
          workdir,
          "-ExpectedParent",
          parent,
          "-TemporaryIndexPath",
          path.join(temporaryRoot, "runtime", "index"),
          "-Message",
          "Seal test candidate",
          "-Timestamp",
          "2026-07-21T18:00:00Z",
        ],
        { encoding: "utf8" },
      );
      assert.equal(seal.status, 0, seal.stderr);
      const sealed = JSON.parse(seal.stdout);
      assert.equal(sealed.parent, parent);
      assert.equal(existsSync(hookCanary), false);
      assert.equal(runGit(workdir, ["status", "--porcelain=v1"]).stdout, "");
      assert.equal(
        runGit(workdir, ["rev-list", "--parents", "-n", "1", "HEAD"])
          .stdout.trim()
          .split(" ").length,
        2,
      );

      const sealedHead = runGit(workdir, ["rev-parse", "HEAD"]).stdout.trim();
      writeFileSync(path.join(workdir, "package.json"), "{}\n");
      const frozen = spawnSync(
        readJson("experiment/lock.json").powerShellHostPath,
        [
          "-NoProfile",
          "-File",
          path.join(root, "scripts/commit-candidate.ps1"),
          "-Workdir",
          workdir,
          "-ExpectedParent",
          sealedHead,
          "-TemporaryIndexPath",
          path.join(temporaryRoot, "runtime", "frozen-index"),
          "-Message",
          "Reject frozen path",
          "-Timestamp",
          "2026-07-21T18:01:00Z",
        ],
        { encoding: "utf8" },
      );
      assert.notEqual(frozen.status, 0);
      assert.match(frozen.stderr, /frozen path/i);
      rmSync(path.join(workdir, "package.json"));
      writeFileSync(path.join(workdir, "second.txt"), "second");
      const nestedIndex = spawnSync(
        readJson("experiment/lock.json").powerShellHostPath,
        [
          "-NoProfile",
          "-File",
          path.join(root, "scripts/commit-candidate.ps1"),
          "-Workdir",
          workdir,
          "-ExpectedParent",
          sealedHead,
          "-TemporaryIndexPath",
          path.join(workdir, "nested-index"),
          "-Message",
          "Reject nested index",
          "-Timestamp",
          "2026-07-21T18:02:00Z",
        ],
        { encoding: "utf8" },
      );
      assert.notEqual(nestedIndex.status, 0);
      assert.match(nestedIndex.stderr, /outside the candidate/i);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("projects only allowlisted bytes into identical one-root builder repositories", () => {
    const fixture = createProjectionFixture(
      [{ source: "product.txt", destination: "product.txt" }],
      {
        "product.txt": "neutral product task\n",
        "experiment/secret.txt": "SEALED_HIDDEN_SENTINEL\n",
      },
    );
    try {
      assert.equal(fixture.result.status, 0, fixture.result.stderr);
      const manifest = JSON.parse(readFileSync(fixture.manifest, "utf8"));
      assert.deepEqual(
        manifest.files.map(({ path: filePath }) => filePath),
        ["product.txt"],
      );
      assert.equal(
        existsSync(path.join(fixture.destinationA, "experiment")),
        false,
      );
      const aCommit = runGit(fixture.destinationA, [
        "rev-parse",
        "HEAD",
      ]).stdout.trim();
      const bCommit = runGit(fixture.destinationB, [
        "rev-parse",
        "HEAD",
      ]).stdout.trim();
      assert.equal(aCommit, bCommit);
      assert.equal(
        runGit(fixture.destinationA, [
          "rev-list",
          "--count",
          "HEAD",
        ]).stdout.trim(),
        "1",
      );
      assert.notEqual(aCommit, fixture.sourceCommit);
      assert.equal(runGit(fixture.destinationA, ["remote"]).stdout.trim(), "");
      assert.equal(
        runGit(fixture.destinationA, [
          "config",
          "--get",
          "core.autocrlf",
        ]).stdout.trim(),
        "false",
      );
    } finally {
      rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects projected experiment, skill, hidden, evidence, role, git, and lineage contamination", () => {
    const cases = [
      ["experiment/private.txt", "neutral\n"],
      ["skills/private.txt", "neutral\n"],
      ["sealed-hidden-suite/private.txt", "neutral\n"],
      ["evidence/private.txt", "neutral\n"],
      ["role-artifacts/private.txt", "neutral\n"],
      [".git/private.txt", "neutral\n"],
      ["product.txt", "LINEAGE_SENTINEL\n"],
    ];
    for (const [destination, content] of cases) {
      const fixture = createProjectionFixture(
        [{ source: "input.txt", destination }],
        { "input.txt": content },
      );
      try {
        assert.notEqual(fixture.result.status, 0, destination);
      } finally {
        rmSync(fixture.temporaryRoot, { recursive: true, force: true });
      }
    }
  });

  it("rejects nested source, builder, and private-manifest paths", () => {
    for (const layout of [
      { destinationAInsideSource: true },
      { destinationBInsideA: true },
      { manifestInsideA: true },
      { manifestInsideSource: true },
      { destinationParentJunction: true },
    ]) {
      const fixture = createProjectionFixture(
        [{ source: "input.txt", destination: "input.txt" }],
        { "input.txt": "neutral\n" },
        layout,
      );
      try {
        assert.notEqual(fixture.result.status, 0);
      } finally {
        rmSync(fixture.temporaryRoot, { recursive: true, force: true });
      }
    }
  });

  it("rejects ignored builder contamination before model launch", () => {
    const fixture = createBuilderRunnerFixture();
    try {
      const ignored = path.join(fixture.workA, "node_modules", "private.txt");
      mkdirSync(path.dirname(ignored), { recursive: true });
      writeFileSync(ignored, "PRIVATE_IGNORED_CONTEXT\n");
      assert.equal(
        runGit(fixture.workA, ["status", "--porcelain=v1"]).stdout,
        "",
      );
      const result = fixture.run();
      assert.notEqual(result.status, 0);
      assert.match(
        `${result.stdout}\n${result.stderr}`,
        /visible filesystem contains unmanifested/i,
      );
      assert.equal(existsSync(fixture.evidenceRoot), false);
    } finally {
      rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects private runtime inputs nested inside a builder before model launch", () => {
    const fixture = createBuilderRunnerFixture();
    try {
      const nestedManifest = path.join(
        fixture.workA,
        "node_modules",
        "private-manifest.json",
      );
      mkdirSync(path.dirname(nestedManifest), { recursive: true });
      copyFileSync(fixture.manifestPath, nestedManifest);
      fixture.contract.builderInputManifestPath = nestedManifest;
      fixture.contract.builderInputManifestSha256 = sha256(
        readFileSync(nestedManifest),
      );
      const result = fixture.run();
      assert.notEqual(result.status, 0);
      assert.match(
        `${result.stdout}\n${result.stderr}`,
        /private builder input and workdir.*physically distinct and nonnested/i,
      );
      assert.equal(existsSync(fixture.evidenceRoot), false);
      const runnerSource = readFileSync(
        path.join(root, "scripts/run-cli-builders.ps1"),
        "utf8",
      );
      assert.ok(
        runnerSource.indexOf("Private builder input and workdir") <
          runnerSource.indexOf("$started = $process.Start()"),
        "alias rejection gate must execute before the model process start",
      );
    } finally {
      rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects every schema-valid builder containment overlap before evidence or model launch", () => {
    const cases = [
      [
        "duplicate outputs",
        (contract) => {
          contract.invocations[1].stdoutPath =
            contract.invocations[0].stdoutPath;
        },
      ],
      [
        "nested outputs",
        (contract) => {
          contract.invocations[1].stdoutPath = path.join(
            contract.invocations[0].finalPath,
            "nested.jsonl",
          );
        },
      ],
      [
        "runtime under output",
        (contract) => {
          contract.invocations[0].tempRoot = path.join(
            contract.invocations[0].finalPath,
            "temp",
          );
        },
      ],
      [
        "output under runtime",
        (contract) => {
          contract.invocations[0].finalPath = path.join(
            contract.invocations[0].tempRoot,
            "final.json",
          );
        },
      ],
      [
        "runtime under evidence",
        (contract) => {
          contract.invocations[0].tempRoot = path.join(
            contract.evidenceRoot,
            "temp",
          );
        },
      ],
      [
        "nested cross-builder runtime",
        (contract) => {
          contract.invocations[1].cacheRoot = path.join(
            contract.invocations[0].tempRoot,
            "nested-cache",
          );
        },
      ],
      [
        "runtime under other workdir",
        (contract) => {
          contract.invocations[1].dependencyRoot = path.join(
            contract.invocations[0].workdir,
            "deps",
          );
        },
      ],
      [
        "duplicate cross-builder workdir",
        (contract) => {
          contract.invocations[1].workdir = contract.invocations[0].workdir;
        },
      ],
    ];
    for (const [label, mutate] of cases) {
      const fixture = createBuilderRunnerFixture();
      try {
        mutate(fixture.contract);
        const result = fixture.run();
        const diagnostic = `${result.stdout}\n${result.stderr}`;
        assert.notEqual(result.status, 0, label);
        assert.match(
          diagnostic,
          /physically distinct and nonnested|beneath evidenceRoot/i,
          label,
        );
        assert.doesNotMatch(diagnostic, /thread\.started/i, label);
        assert.equal(existsSync(fixture.evidenceRoot), false, label);
      } finally {
        rmSync(fixture.temporaryRoot, { recursive: true, force: true });
      }
    }
    const source = readFileSync(
      path.join(root, "scripts/run-cli-builders.ps1"),
      "utf8",
    );
    for (const gate of [
      "Assert-PathsSeparate $workdirPaths[0] $workdirPaths[1]",
      "Assert-PathsSeparate $authoritativeOutputPaths[$left] $authoritativeOutputPaths[$right]",
      "Assert-PathsSeparate $runtimeRoot $runtimeRootPaths[$right]",
      "Assert-PathsSeparate $privatePath $runtimeRoot",
    ]) {
      assert.ok(
        source.indexOf(gate) < source.indexOf("CreateDirectory($evidenceRoot)"),
      );
      assert.ok(
        source.indexOf(gate) < source.indexOf("$started = $process.Start()"),
      );
    }
  });

  it("rejects a junction-aliased builder workdir before model launch", () => {
    const fixture = createBuilderRunnerFixture();
    try {
      const alias = path.join(fixture.temporaryRoot, "builder-a-alias");
      symlinkSync(fixture.workA, alias, "junction");
      fixture.contract.invocations[0].workdir = alias;
      const result = fixture.run();
      assert.notEqual(result.status, 0);
      assert.match(
        `${result.stdout}\n${result.stderr}`,
        /symlink, junction, or reparse point/i,
      );
      assert.equal(existsSync(fixture.evidenceRoot), false);
    } finally {
      rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("canonicalizes real Windows 8.3 aliases and rejects aliased private builder input before model launch", (testContext) => {
    const fixture = createBuilderRunnerFixture();
    try {
      const shortWorkdir = windowsShortPath(fixture.workA);
      if (shortWorkdir == null) {
        testContext.skip(
          "Windows 8.3 alias unavailable for the temporary builder root",
        );
        return;
      }
      const helper = spawnSync(
        process.execPath,
        [
          path.join(root, "scripts/canonicalize-paths.mjs"),
          fixture.workA,
          shortWorkdir,
        ],
        { encoding: "utf8" },
      );
      assert.equal(helper.status, 0, helper.stderr);
      const [longCanonical, shortCanonical] = JSON.parse(helper.stdout);
      assert.equal(shortCanonical.toLowerCase(), longCanonical.toLowerCase());
      const nestedManifest = path.join(
        fixture.workA,
        ".git",
        "private-manifest.json",
      );
      copyFileSync(fixture.manifestPath, nestedManifest);
      fixture.contract.invocations[0].workdir = shortWorkdir;
      fixture.contract.builderInputManifestPath = nestedManifest;
      fixture.contract.builderInputManifestSha256 = sha256(
        readFileSync(nestedManifest),
      );
      const result = fixture.run();
      assert.notEqual(result.status, 0);
      assert.match(
        `${result.stdout}\n${result.stderr}`,
        /private builder input and workdir.*physically distinct and nonnested/i,
      );
      assert.equal(existsSync(fixture.evidenceRoot), false);
      const runnerSource = readFileSync(
        path.join(root, "scripts/run-cli-builders.ps1"),
        "utf8",
      );
      assert.ok(
        runnerSource.indexOf("Private builder input and workdir") <
          runnerSource.indexOf("$started = $process.Start()"),
        "8.3 alias rejection gate must execute before model process start",
      );
    } finally {
      rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects a real Windows 8.3 source alias in builder preparation", (testContext) => {
    const fixture = createProjectionFixture(
      [{ source: "input.txt", destination: "input.txt" }],
      { "input.txt": "neutral\n" },
      { useShortSource: true },
    );
    try {
      if (!fixture.shortSourceAvailable) {
        testContext.skip(
          "Windows 8.3 alias unavailable for the preparer source root",
        );
        return;
      }
      assert.notEqual(fixture.result.status, 0);
      assert.match(fixture.result.stderr, /physical alias/i);
    } finally {
      rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects real Windows 8.3 alias nesting in the role runner before model launch", (testContext) => {
    const fixture = createRoleRunnerFixture();
    try {
      const shortWorkdir = windowsShortPath(fixture.workdir);
      if (shortWorkdir == null) {
        testContext.skip(
          "Windows 8.3 alias unavailable for the temporary role root",
        );
        return;
      }
      const nestedPrompt = path.join(
        fixture.workdir,
        ".git",
        "private-role-prompt.md",
      );
      copyFileSync(fixture.promptPath, nestedPrompt);
      fixture.contract.workdir = shortWorkdir;
      fixture.contract.promptPath = nestedPrompt;
      fixture.contract.promptSha256 = sha256(readFileSync(nestedPrompt));
      const result = fixture.run();
      assert.notEqual(result.status, 0);
      assert.match(
        `${result.stdout}\n${result.stderr}`,
        /private role runtime input and workdir.*physically distinct and nonnested/i,
      );
      assert.equal(existsSync(fixture.evidenceRoot), false);
      const runnerSource = readFileSync(
        path.join(root, "scripts/run-cli-role.ps1"),
        "utf8",
      );
      assert.ok(
        runnerSource.indexOf("Private role runtime input and workdir") <
          runnerSource.indexOf("$started = $process.Start()"),
        "role alias rejection gate must execute before the model process start",
      );
    } finally {
      rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects stale and malformed absolute role deadlines before evidence or model launch", () => {
    for (const deadline of ["2000-01-01T00:00:00Z", "2026-02-30T00:00:00Z"]) {
      const fixture = createRoleRunnerFixture();
      try {
        fixture.setDeadline(deadline);
        const result = fixture.run();
        assert.notEqual(result.status, 0);
        assert.match(
          `${result.stdout}\n${result.stderr}`,
          /absolute deadline is (expired|malformed)/i,
        );
        assert.equal(existsSync(fixture.evidenceRoot), false);
      } finally {
        rmSync(fixture.temporaryRoot, { recursive: true, force: true });
      }
    }
    const runnerSource = readFileSync(
      path.join(root, "scripts/run-cli-role.ps1"),
      "utf8",
    );
    assert.ok(
      runnerSource.indexOf("Role prompt absolute deadline is expired") <
        runnerSource.indexOf("CreateDirectory($evidenceRoot)"),
    );
    assert.ok(
      runnerSource.indexOf("Role prompt absolute deadline is malformed") <
        runnerSource.indexOf("$started = $process.Start()"),
    );
  });

  it("rejects every schema-valid role containment overlap before evidence or model launch", () => {
    const cases = [
      [
        "duplicate outputs",
        (contract) => {
          contract.stdoutPath = contract.finalPath;
        },
      ],
      [
        "nested outputs",
        (contract) => {
          contract.stdoutPath = path.join(contract.finalPath, "nested.jsonl");
        },
      ],
      [
        "runtime under output",
        (contract) => {
          contract.tempRoot = path.join(contract.finalPath, "temp");
        },
      ],
      [
        "output under runtime",
        (contract) => {
          contract.finalPath = path.join(contract.tempRoot, "final.json");
        },
      ],
      [
        "runtime under evidence",
        (contract) => {
          contract.tempRoot = path.join(contract.evidenceRoot, "temp");
        },
      ],
      [
        "nested runtime roots",
        (contract) => {
          contract.tempRoot = path.join(contract.cacheRoot, "nested-temp");
        },
      ],
      [
        "runtime under workdir",
        (contract) => {
          contract.dependencyRoot = path.join(contract.workdir, "deps");
        },
      ],
      [
        "evidence under output",
        (contract) => {
          contract.evidenceRoot = path.join(contract.finalPath, "evidence");
        },
      ],
    ];
    for (const [label, mutate] of cases) {
      const fixture = createRoleRunnerFixture();
      try {
        mutate(fixture.contract);
        const result = fixture.run();
        const diagnostic = `${result.stdout}\n${result.stderr}`;
        assert.notEqual(result.status, 0);
        assert.match(
          diagnostic,
          /physically distinct and nonnested|direct children/i,
          label,
        );
        assert.doesNotMatch(diagnostic, /thread\.started/i, label);
        assert.equal(existsSync(fixture.evidenceRoot), false);
      } finally {
        rmSync(fixture.temporaryRoot, { recursive: true, force: true });
      }
    }
    const runnerSource = readFileSync(
      path.join(root, "scripts/run-cli-role.ps1"),
      "utf8",
    );
    assert.ok(
      runnerSource.indexOf("Assert-PathsSeparate $evidenceRoot $workdir") <
        runnerSource.indexOf("CreateDirectory($evidenceRoot)"),
    );
    assert.ok(
      runnerSource.indexOf(
        "Assert-PathsSeparate $runtimeRoot $physical[$runtimeRootKeys[$right]]",
      ) < runnerSource.indexOf("$started = $process.Start()"),
    );
  });

  it("charges deterministic pre-wait delay to the floored monotonic deadline budget", () => {
    const withoutDelay = roleWaitFromAbsoluteDeadline(1000.9, 0.1, 0);
    const afterInjectedDelay = roleWaitFromAbsoluteDeadline(
      1000.9,
      0.1,
      250.25,
    );
    assert.equal(withoutDelay, 1000);
    assert.equal(afterInjectedDelay, 749);
    assert.ok(afterInjectedDelay < withoutDelay);
    assert.equal(remainingRoleWaitMilliseconds(10, 8.001), 1);
    assert.equal(remainingRoleWaitMilliseconds(10, 9.001), 0);
    assert.equal(remainingRoleWaitMilliseconds(10, 10.001), 0);
    const runnerSource = readFileSync(
      path.join(root, "scripts/run-cli-role.ps1"),
      "utf8",
    );
    const clockOrigin = runnerSource.indexOf(
      "$deadlineBudgetStopwatch = [System.Diagnostics.Stopwatch]::StartNew()",
    );
    const wallCapture = runnerSource.indexOf(
      "$startedAt = [System.DateTimeOffset]::UtcNow",
    );
    const budgetCalculation = runnerSource.indexOf(
      "$deadlineBudgetMilliseconds = [System.Math]::Floor",
    );
    const waitCalculation = runnerSource.indexOf(
      "$deadlineBudgetStopwatch.Elapsed.TotalMilliseconds",
    );
    assert.ok(clockOrigin < wallCapture);
    assert.ok(wallCapture < budgetCalculation);
    assert.ok(budgetCalculation < waitCalculation);
  });

  it("accepts the prospective scaffold and seeded assignment algorithms", () => {
    assert.deepEqual(validateScaffold().failures, []);
    assert.deepEqual(
      validateAssignmentSemantics(
        readJson("experiment/templates/experiment-manifest.json"),
      ),
      [],
    );
  });

  it("binds the final lock to P/S/A/B/C, abort, and permission evidence", () => {
    const lock = readJson("experiment/lock.json");
    const evidence = readJson("experiment/preflight/final-lock-evidence.json");
    const inventory = readJson(
      "experiment/preflight/operational-parent-inventory.json",
    );
    assert.equal(
      evidence.gateAggregateSha256,
      preflightAggregateHash(evidence),
    );
    assert.deepEqual(validateFinalLockEvidence(evidence, inventory, lock), []);
    assert.equal(
      lock.supersedesFinalizationCommit,
      "e2c892e3b88702fcbd9a2049926d4a28b94efa4a",
    );
    assert.equal(lock.treatmentSkillManifestEntryCount, 63);
    assert.equal(lock.treatmentSkillManifestCommentLineCount, 3);
    assert.equal(lock.treatmentSkillManifestPhysicalLineCount, 66);
    assert.equal(lock.treatmentSkillManifestByteSource, "canonical-git-blob");
    assert.equal(lock.runnerSmokeContractSha256, null);
    assert.equal(lock.runnerSmokeSupervisionSha256, null);
    assert.equal(lock.runnerSmokeAttestationSha256, null);

    const tamperedEvidence = clone(evidence);
    tamperedEvidence.gates.A.artifacts.contractSha256 = hash("0");
    assert.match(
      validateFinalLockEvidence(tamperedEvidence, inventory, lock).join("\n"),
      /aggregate hash mismatch/,
    );

    const resealedGateEvidence = clone(evidence);
    const resealedGateLock = clone(lock);
    resealedGateEvidence.gates.A.artifacts.contractSha256 = hash("0");
    resealedGateEvidence.gateAggregateSha256 =
      preflightAggregateHash(resealedGateEvidence);
    resealedGateLock.gateAggregateSha256 =
      resealedGateEvidence.gateAggregateSha256;
    assert.match(
      validateFinalLockEvidence(
        resealedGateEvidence,
        inventory,
        resealedGateLock,
      ).join("\n"),
      /A\/B\/C gate facts changed/,
    );

    const tamperedInventory = clone(inventory);
    const prompt = tamperedInventory.files.find(
      ({ source }) => source === "experiment/prompts/neutral-builder.md",
    );
    prompt.sha256 = hash("0");
    assert.match(
      validateFinalLockEvidence(evidence, tamperedInventory, lock).join("\n"),
      /operational byte diverges/,
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
    for (const result of golden.cliRuntimeEvidence.results) {
      assert.match(result.postStatePath, /post-state\.json$/);
      assert.match(result.postStateSha256, /^[0-9a-f]{64}$/);
    }
    delete golden.cliRuntimeEvidence.results[0].postStateSha256;
    assert.match(
      validateCliSupervisionEvidence(
        golden.cliRuntimeEvidence,
        golden.cliRuntimeContract,
        golden.cliRuntimeStdoutByInvocation,
      ).join("\n"),
      /post-state hash|postStateSha256|schema/i,
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
    const builderSource = runnerSources[0];
    const finalGraphGate = builderSource.indexOf(
      "Assert-PathsSeparate $privatePath $runtimeRoot",
    );
    const outputParentCreation = builderSource.indexOf(
      "CreateDirectory([System.IO.Path]::GetDirectoryName($outputPath))",
    );
    const builderModelStart = builderSource.indexOf(
      "$started = $process.Start()",
    );
    assert.ok(finalGraphGate < outputParentCreation);
    assert.ok(outputParentCreation < builderModelStart);
    assert.match(
      builderSource,
      /\$null -eq \$_\.finalSha256/,
      "exit zero without an authoritative final output must remain invalid",
    );
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
        const argv = [
          "-NoProfile",
          "-File",
          lockedPath(runner),
          "-ContractPath",
          contractPath,
        ];
        let result;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          result = spawnSync(lock.powerShellHostPath, argv, {
            cwd: root,
            encoding: "utf8",
          });
          if (!isExactClrStartupCrash(result)) break;
        }
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
    contract.canonicalPathHelperSha256 = lock.canonicalPathHelperSha256;
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
      "-c",
      'windows.sandbox="elevated"',
      "-c",
      "sandbox_workspace_write.network_access=false",
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--json",
      "--add-dir",
      contract.tempRoot,
      "--add-dir",
      contract.cacheRoot,
      "--add-dir",
      contract.dependencyRoot,
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
    result.inputCommit = contract.inputCommit;
    result.supervisorCommitScriptSha256 = readJson(
      "experiment/lock.json",
    ).candidateCommitScriptSha256;
    result.threadIds = ["role-thread-1"];
    result.turnCompleted = true;
    result.rawJsonlValid = true;
    result.usage = { input_tokens: 10, output_tokens: 2 };
    result.usageUnavailableReason = null;
    assert.deepEqual(
      validateRoleSupervisionEvidence(result, contract, raw),
      [],
    );
    const exitAfterDeadline = clone(result);
    exitAfterDeadline.completedAt = "2026-07-20T00:15:00.001Z";
    exitAfterDeadline.completionObservedAt = "2026-07-20T00:15:00.001Z";
    assert.match(
      validateRoleSupervisionEvidence(exitAfterDeadline, contract, raw).join(
        "\n",
      ),
      /chronology\/deadline/i,
    );
    const observationAfterTolerance = clone(result);
    observationAfterTolerance.completionObservedAt = "2026-07-20T00:15:02.001Z";
    assert.match(
      validateRoleSupervisionEvidence(
        observationAfterTolerance,
        contract,
        raw,
      ).join("\n"),
      /chronology\/deadline/i,
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

  it("rejects role artifact timestamps before launch or after observed completion", () => {
    const evidence = {
      startedAt: "2026-07-21T12:00:00.000Z",
      completedAt: "2026-07-21T12:05:00.000Z",
    };
    const artifact = clone(evidence);
    assert.deepEqual(validateRoleArtifactChronology(artifact, evidence), []);
    artifact.startedAt = "2026-07-21T11:59:59.999Z";
    assert.match(
      validateRoleArtifactChronology(artifact, evidence).join("\n"),
      /supervisor-observed/i,
    );
    artifact.startedAt = evidence.startedAt;
    artifact.completedAt = "2026-07-21T12:05:00.001Z";
    assert.match(
      validateRoleArtifactChronology(artifact, evidence).join("\n"),
      /supervisor-observed/i,
    );
  });

  it("packages deterministic blinded snapshots and rejects traversal, physical-alias nesting, and source drift", (testContext) => {
    const temp = mkdtempSync(
      path.join(root, "node_modules", "protocol-package-test-"),
    );
    try {
      const source = path.join(temp, "source");
      mkdirSync(path.join(source, "docs"), { recursive: true });
      mkdirSync(path.join(source, "tests", "public"), { recursive: true });
      mkdirSync(path.join(source, "scripts"), { recursive: true });
      for (const [relative, contents] of [
        [".gitignore", "private-cache/\n"],
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
      for (const clonePath of clones) {
        const ignoredPrivate = path.join(
          clonePath,
          "private-cache",
          "hidden-context.txt",
        );
        mkdirSync(path.dirname(ignoredPrivate), { recursive: true });
        writeFileSync(ignoredPrivate, "PRIVATE_IGNORED_CONTEXT\n");
        assert.equal(
          spawnSync("git", ["status", "--porcelain=v1"], {
            cwd: clonePath,
            encoding: "utf8",
          }).stdout,
          "",
        );
      }
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
        existsSync(path.join(temp, "output-one", "X", "private-cache")),
        false,
      );
      assert.equal(
        readFileSync(path.join(temp, "output-one", "X", ".gitignore"), "utf8"),
        "private-cache/\n",
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
      const shortSource = windowsShortPath(clones[0]);
      if (shortSource == null) {
        testContext.diagnostic(
          "Windows 8.3 alias unavailable for packager nesting regression",
        );
      } else {
        const aliasNested = spawnSync(
          process.execPath,
          [
            "scripts/package-blinded-snapshots.mjs",
            "--mapping",
            mappingPath,
            "--output-root",
            path.join(shortSource, "nested-alias-output"),
            "--manifest",
            path.join(temp, "nested-alias-manifest.json"),
          ],
          { cwd: root, encoding: "utf8" },
        );
        assert.notEqual(aliasNested.status, 0);
        assert.match(aliasNested.stderr, /separate and nonnested/i);
      }
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
