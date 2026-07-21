# Public protocol-v2.8 artifact contract

The bundled [canonical-contract.json](canonical-contract.json) is authoritative. Its domain-separated canonical SHA-256 is `3746ce11f3e88da50bf14baaaceaa1275fd85316cc253f48a316b5d90f8d9702`. The byte-exact golden execution fixture has canonical SHA-256 `f1eca7c7a007113b23a3224c932591ce4b6498aaf4a094d4a223fc04a4126a17`; the invalid-current fixture has canonical SHA-256 `ac69fe8c0cd5430961986abb0104f85d3449da356bbe6dea8b77b4425b181de1`.

## Frozen runtime

Bind:

- PowerShell host: `C:\Users\rhenm\AppData\Local\pwsh7\pwsh.exe`, version `7.6.2`, SHA-256 `99ec38d8c4910fd5f2feeeec4dedb5076ff39a08ca21e12642822bc8d989e316`; launch `pwsh -NoProfile -File`.
- Codex CLI: `C:\Users\rhenm\.codex\plugins\.plugin-appserver\codex.exe`, version `codex-cli 0.145.0-alpha.18`, SHA-256 `20d611ef1c9851f4da1cb4609beb6763904f72275cb91517b2400639ca1c28c4`; auth status `Logged in using ChatGPT`.
- Model/reasoning: `gpt-5.4` and `xhigh`, pinned in exact argv after approval mode and before `exec`.
- Builder prompt/config: `5ed878d3be56824f94d3a72a40606c111dbfdfc1631bdf98b6ca7fe75ffebd56` and `8d64a062c76ba8bdbd436b99d42cd7566ae2601821e009315afe8e37800f323b`.
- Smoke prompt: `135c5fc59fe72b4b37d924cd6f1a14e4f2a3b7b59711cc12294e81f52cbfd6a2`; harmless smoke only.
- Canonical path helper: `194af01d50aac44f741644e6f32bc73f75f72ccb118e9d721780ef2b2bc9ab0e`.
- Builder runner/schema: `27aad97dd9a82df4436eef538b9f5c234c653f385c934e4e6e33f69e9574e44a` / `528afafa2841bca334223709ca8cbeed0ffc075395e043fe951d72c5410eaa8b`.
- Role runner/schema/evidence schema: `890f057b8433322f1875e79cb045bf8701c944418e02f8f29094290fa482bf1e` / `8299ae086c66368543916d510fea3ffef0203bfda996f916715df27782756521` / `934d2229bead568ef70eeb3334e4125d7999ee23d5f7a4976fbfbf4d5bfa5d58`.
- Actual-exec probe evidence/script/schema: `1ffa7412800fa2134169f641ba5d978cb09845edc137b852cb351b209052cb47` / `6ade4210d63206e85c742b470a03a68988e4fc9991490361af01fece8e93f4c1` / `9423ca50210ed63f70496026a0ade4f1f7b4e938557b44ca9d211d04ee9eea6a`. It proves workspace/add-dir writes and the protected-boundary/supervisor checks; its retained attestation does not independently bind the Git/Node/npm command events or outputs requested by the prompt.
- Projection allowlist/schema/preparer: `37af679c4f3f71cbd9e28b810897d4ff82c7c47cf4421a9d661b8b90947aef5b` / `b044646ede4fef4543a4950e5842f51997dc3b65e6bfabad7eeb1ff84caf0bb5` / `68e186914a0dd99e0b91f0851d45f8081086fffadae8d2949050e29ea1b832b3`.

Every successful supervision record binds the contract, invocation, observed process/thread, exact argv and prompt, raw stdout/stderr/final hashes, lifecycle, schema/artifact result, isolation policy, and trusted usage/metadata or explicit absence reasons. Supervisor commit helper output must be one explicit JSON object; nonzero, empty, malformed, null, or multiple-object output fails closed. Every model role is fresh, ephemeral, one turn, and never resumed.

## Assignment and treatment

After both initial builder artifacts seal, draw exactly 32 OS-CSPRNG bytes once. UTF-8-byte-sort candidate IDs and hash the registered domain, seed, uint64be lengths, and ID bytes. `digest[0] & 1` selects baseline; the other is treatment. Baseline has zero cycles and `baseline-zero-cycles`.

Treatment uses at most five fresh reviewer/fixer/tester cycles. Reviewer findings use exactly the nine canonical fields and registered IDs/severities/rubric items. Zero findings stops before fixer/tester. Otherwise the fixer handles only that sealed finding set and a fresh tester runs exact `npm run check` components.

## Blinded packages and seals

The private mapping schema SHA-256 is `2d0a96f27d43f511c26b57a49dfef5c05acfe0f5dfb1f8419f724d524513fb74`. It binds exactly one B0/T0/Tfinal source to each X/Y/Z label, randomized order, exact `refs/*`, source commit/tree/path, frozen-gate hash, mapping-seed hash, and private candidate/run/evidence/artifact-name provenance.

The packager SHA-256 is `98ef96dd16f37a14fa4a56b324a0274dd3aa29010d296244e695fe42663478d7`; manifest schema SHA-256 is `4d9d8397fc068cdf511e99bae6980ed2d2ef5410e5128385043f1c426cdb8bd5`. The evaluator-facing package seal includes only label, content hash, file count, `historyFree: true`, `lineageScanPassed: true`, and `timestampsNormalized: true`. It must omit source role/ref/path/commit/tree and provenance.

Blinding is mapping blinding, not proof that implementation lineage is intrinsically unknowable. Use a fresh evaluator per single package in randomized order. Record sequence, mapping guess/confidence, diagnostics, and seal time. Seal each artifact before launching the next; revisions are forbidden. Unblind after all three seals.

## Gates, scores, and evidence

Tester command is the projected candidate's `npm run check`, with exactly five ordered components: format check, lint, typecheck, public tests, build. The protocol repository's maintainer checks are not candidate gates. Evaluator public command is `npm run test:public`. Hidden suite ID is `permissions-playground-sealed-v2`, command `node sealed-hidden-suite/run.mjs`, SHA-256 `a6f38c08eff3fd23fca3299f0777adbea4001d3ac3147272511ff9babd98a19b`.

Canonical JSON accepts only null, booleans, safe integers, strings, arrays, and objects. Sort object keys by UTF-8 bytes, preserve arrays, use JSON escaping, emit no insignificant whitespace or trailing newline, and hash `permissions-playground/canonical-json-v1\x00 || canonical-json`.

Evidence sequence starts at 0 with null predecessor; each later predecessor equals the prior canonical artifact hash. A completed run is exactly valid or invalid. Valid requires null active invalidation, three sealed evaluations, and outcome. Invalid requires structured active invalidation and null evaluations/outcome. Never score an active invalidation.

Templates are non-executable. Execution rejects zero/sentinel/provisional values, duplicate runtime identity, wrong model/reasoning/argv, inherited history/resume, missing lifecycle/usage treatment, unsafe paths, package provenance leakage, broken seals, and any canonical divergence.

## Portable repository manifest

`MANIFEST.sha256` hashes canonical Git/index blob bytes, never smudged worktree bytes. Generation and validation use `validation/manifest_tool.py`; entries cover `.gitattributes`, `skills/`, and `validation/`, exclude the manifest itself, and are sorted by repository path. The committed LF policy improves checkout consistency, but correctness does not depend on checkout line endings: an LF Git blob still validates when a local worktree file is CRLF.
