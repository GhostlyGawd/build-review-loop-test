# Public protocol-v2.4 artifact contract

The bundled [canonical-contract.json](canonical-contract.json) is authoritative. Its domain-separated canonical SHA-256 is `604741c82d917d2cb5901ba4b1c046d29e2091ce4c91a68a514b713a24348b01`. The byte-exact golden execution fixture has canonical SHA-256 `27d1f5ae5338926e5b51641d1fe08199fe3f1d84037d6cc94fe25412fe66a4d5`; the invalid-current fixture has canonical SHA-256 `67ff46e219d7dcacfe083db59c31785ca7ce496837f0b0c7ff602267af3b01e0`.

## Frozen runtime

Bind:

- PowerShell host: `C:\Users\rhenm\AppData\Local\pwsh7\pwsh.exe`, version `7.6.2`, SHA-256 `99ec38d8c4910fd5f2feeeec4dedb5076ff39a08ca21e12642822bc8d989e316`; launch `pwsh -NoProfile -File`.
- Codex CLI: `C:\Users\rhenm\.codex\plugins\.plugin-appserver\codex.exe`, version `codex-cli 0.145.0-alpha.18`, SHA-256 `20d611ef1c9851f4da1cb4609beb6763904f72275cb91517b2400639ca1c28c4`; auth status `Logged in using ChatGPT`.
- Model/reasoning: `gpt-5.4` and `xhigh`, pinned in exact argv after approval mode and before `exec`.
- Builder prompt/config: `bc4fb241c627b3d87093936b5485dff30c761eae0b7fcb0697f98932929935fd` and `f3c706ac3fd3180748aadcfebb6e17171103f1184be7bbdf9af5704a2bb445b4`.
- Smoke prompt: `135c5fc59fe72b4b37d924cd6f1a14e4f2a3b7b59711cc12294e81f52cbfd6a2`; harmless smoke only.
- Canonical path helper: `194af01d50aac44f741644e6f32bc73f75f72ccb118e9d721780ef2b2bc9ab0e`.
- Builder runner/schema: `b2e848a193c28d93893829a3dceeba323999193a0d96acee8848d0eff06e70b7` / `665016233b950a2f39f0bbee1f5f75b530980d3bcd979e543943cf976b0a2689`.
- Role runner/schema/evidence schema: `f78ec27cc30f66a58464be6f5b60a4437808b97ec85186916171ee22e9b6b3b4` / `ac620774663e6ce8dd9917f760f6f53eeb8063e70b88240999ffc6bef6184c5a` / `b43690cdb988df31e3a778acf8021052fa0e9dae0767f518d9c8c126a8866556`.
- Projection allowlist/schema/preparer: `37af679c4f3f71cbd9e28b810897d4ff82c7c47cf4421a9d661b8b90947aef5b` / `b044646ede4fef4543a4950e5842f51997dc3b65e6bfabad7eeb1ff84caf0bb5` / `68e186914a0dd99e0b91f0851d45f8081086fffadae8d2949050e29ea1b832b3`.

Every successful supervision record binds the contract, invocation, observed process/thread, exact argv and prompt, raw stdout/stderr/final hashes, lifecycle, schema/artifact result, isolation policy, and trusted usage/metadata or explicit absence reasons. Every model role is fresh, ephemeral, one turn, and never resumed.

## Assignment and treatment

After both initial builder artifacts seal, draw exactly 32 OS-CSPRNG bytes once. UTF-8-byte-sort candidate IDs and hash the registered domain, seed, uint64be lengths, and ID bytes. `digest[0] & 1` selects baseline; the other is treatment. Baseline has zero cycles and `baseline-zero-cycles`.

Treatment uses at most five fresh reviewer/fixer/tester cycles. Reviewer findings use exactly the nine canonical fields and registered IDs/severities/rubric items. Zero findings stops before fixer/tester. Otherwise the fixer handles only that sealed finding set and a fresh tester runs exact `npm run check` components.

## Blinded packages and seals

The private mapping schema SHA-256 is `2d0a96f27d43f511c26b57a49dfef5c05acfe0f5dfb1f8419f724d524513fb74`. It binds exactly one B0/T0/Tfinal source to each X/Y/Z label, randomized order, exact `refs/*`, source commit/tree/path, frozen-gate hash, mapping-seed hash, and private candidate/run/evidence/artifact-name provenance.

The packager SHA-256 is `98ef96dd16f37a14fa4a56b324a0274dd3aa29010d296244e695fe42663478d7`; manifest schema SHA-256 is `4d9d8397fc068cdf511e99bae6980ed2d2ef5410e5128385043f1c426cdb8bd5`. The evaluator-facing package seal includes only label, content hash, file count, `historyFree: true`, `lineageScanPassed: true`, and `timestampsNormalized: true`. It must omit source role/ref/path/commit/tree and provenance.

Blinding is mapping blinding, not proof that implementation lineage is intrinsically unknowable. Use a fresh evaluator per single package in randomized order. Record sequence, mapping guess/confidence, diagnostics, and seal time. Seal each artifact before launching the next; revisions are forbidden. Unblind after all three seals.

## Gates, scores, and evidence

Tester command is `npm run check`, with ordered components: format check, lint, typecheck, scaffold validation, protocol tests, optional public tests, build. Evaluator public command is `npm run test:public`. Hidden suite ID is `permissions-playground-sealed-v2`, command `node sealed-hidden-suite/run.mjs`, SHA-256 `a6f38c08eff3fd23fca3299f0777adbea4001d3ac3147272511ff9babd98a19b`.

Canonical JSON accepts only null, booleans, safe integers, strings, arrays, and objects. Sort object keys by UTF-8 bytes, preserve arrays, use JSON escaping, emit no insignificant whitespace or trailing newline, and hash `permissions-playground/canonical-json-v1\x00 || canonical-json`.

Evidence sequence starts at 0 with null predecessor; each later predecessor equals the prior canonical artifact hash. A completed run is exactly valid or invalid. Valid requires null active invalidation, three sealed evaluations, and outcome. Invalid requires structured active invalidation and null evaluations/outcome. Never score an active invalidation.

Templates are non-executable. Execution rejects zero/sentinel/provisional values, duplicate runtime identity, wrong model/reasoning/argv, inherited history/resume, missing lifecycle/usage treatment, unsafe paths, package provenance leakage, broken seals, and any canonical divergence.

## Portable repository manifest

`MANIFEST.sha256` hashes canonical Git/index blob bytes, never smudged worktree bytes. Generation and validation use `validation/manifest_tool.py`; entries cover `.gitattributes`, `skills/`, and `validation/`, exclude the manifest itself, and are sorted by repository path. The committed LF policy improves checkout consistency, but correctness does not depend on checkout line endings: an LF Git blob still validates when a local worktree file is CRLF.
