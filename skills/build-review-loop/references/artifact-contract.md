# Public protocol-v2.4 artifact contract

The bundled [canonical-contract.json](canonical-contract.json) is authoritative. Its domain-separated canonical SHA-256 is `541985e02a49b79910282a6e7f26e43fbde3ae500ebfcdf9cef6d031f1a74b49`. The byte-exact golden execution fixture has canonical SHA-256 `ae96dc2d0f34635ebe979745c5055404943f5ba7578f8bfa325925bebc6070d1`; the invalid-current fixture has canonical SHA-256 `67ff46e219d7dcacfe083db59c31785ca7ce496837f0b0c7ff602267af3b01e0`.

## Frozen runtime

Bind:

- PowerShell host: `C:\Users\rhenm\AppData\Local\pwsh7\pwsh.exe`, version `7.6.2`, SHA-256 `99ec38d8c4910fd5f2feeeec4dedb5076ff39a08ca21e12642822bc8d989e316`; launch `pwsh -NoProfile -File`.
- Codex CLI: `C:\Users\rhenm\.codex\plugins\.plugin-appserver\codex.exe`, version `codex-cli 0.145.0-alpha.18`, SHA-256 `20d611ef1c9851f4da1cb4609beb6763904f72275cb91517b2400639ca1c28c4`; auth status `Logged in using ChatGPT`.
- Model/reasoning: `gpt-5.4` and `xhigh`, pinned in exact argv after approval mode and before `exec`.
- Builder prompt/config: `5c9f6a87c18295f500a228a5c31fa4afafd74d8122c3cf3e8f8b112e50c88db0` and `f3c706ac3fd3180748aadcfebb6e17171103f1184be7bbdf9af5704a2bb445b4`.
- Smoke prompt: `135c5fc59fe72b4b37d924cd6f1a14e4f2a3b7b59711cc12294e81f52cbfd6a2`; harmless smoke only.
- Builder runner/schema: `24653c35386be28f09aa5719617ca5ab612a67c1fb8700bd7503abe72569ff25` / `c18db758a6b40194e64c88d3842522ade28ff831806c6315e3c5348e92934c33`.
- Role runner/schema/evidence schema: `385830cc00bebca1541040dababf9496610064d94eb252a02c8de7d77cf6cea3` / `25a30d43ceb77e7bd4b908f8e577dc6ea0c7f9eb41c61f7c8c77af83f528632f` / `f6c18acea89f5cfac3b2fe6ad84871f563e217d884b14ecb29e6606bb99dcd89`.

Every successful supervision record binds the contract, invocation, observed process/thread, exact argv and prompt, raw stdout/stderr/final hashes, lifecycle, schema/artifact result, isolation policy, and trusted usage/metadata or explicit absence reasons. Every model role is fresh, ephemeral, one turn, and never resumed.

## Assignment and treatment

After both initial builder artifacts seal, draw exactly 32 OS-CSPRNG bytes once. UTF-8-byte-sort candidate IDs and hash the registered domain, seed, uint64be lengths, and ID bytes. `digest[0] & 1` selects baseline; the other is treatment. Baseline has zero cycles and `baseline-zero-cycles`.

Treatment uses at most five fresh reviewer/fixer/tester cycles. Reviewer findings use exactly the nine canonical fields and registered IDs/severities/rubric items. Zero findings stops before fixer/tester. Otherwise the fixer handles only that sealed finding set and a fresh tester runs exact `npm run check` components.

## Blinded packages and seals

The private mapping schema SHA-256 is `2d0a96f27d43f511c26b57a49dfef5c05acfe0f5dfb1f8419f724d524513fb74`. It binds exactly one B0/T0/Tfinal source to each X/Y/Z label, randomized order, exact `refs/*`, source commit/tree/path, frozen-gate hash, mapping-seed hash, and private candidate/run/evidence/artifact-name provenance.

The packager SHA-256 is `98cf033b59916e36a871034ba23a1bcfb06c0783f9e5b9fd04596caca6a216ec`; manifest schema SHA-256 is `4d9d8397fc068cdf511e99bae6980ed2d2ef5410e5128385043f1c426cdb8bd5`. The evaluator-facing package seal includes only label, content hash, file count, `historyFree: true`, `lineageScanPassed: true`, and `timestampsNormalized: true`. It must omit source role/ref/path/commit/tree and provenance.

Blinding is mapping blinding, not proof that implementation lineage is intrinsically unknowable. Use a fresh evaluator per single package in randomized order. Record sequence, mapping guess/confidence, diagnostics, and seal time. Seal each artifact before launching the next; revisions are forbidden. Unblind after all three seals.

## Gates, scores, and evidence

Tester command is `npm run check`, with ordered components: format check, lint, typecheck, scaffold validation, protocol tests, optional public tests, build. Evaluator public command is `npm run test:public`. Hidden suite ID is `permissions-playground-sealed-v2`, command `node sealed-hidden-suite/run.mjs`, SHA-256 `a6f38c08eff3fd23fca3299f0777adbea4001d3ac3147272511ff9babd98a19b`.

Canonical JSON accepts only null, booleans, safe integers, strings, arrays, and objects. Sort object keys by UTF-8 bytes, preserve arrays, use JSON escaping, emit no insignificant whitespace or trailing newline, and hash `permissions-playground/canonical-json-v1\x00 || canonical-json`.

Evidence sequence starts at 0 with null predecessor; each later predecessor equals the prior canonical artifact hash. A completed run is exactly valid or invalid. Valid requires null active invalidation, three sealed evaluations, and outcome. Invalid requires structured active invalidation and null evaluations/outcome. Never score an active invalidation.

Templates are non-executable. Execution rejects zero/sentinel/provisional values, duplicate runtime identity, wrong model/reasoning/argv, inherited history/resume, missing lifecycle/usage treatment, unsafe paths, package provenance leakage, broken seals, and any canonical divergence.
