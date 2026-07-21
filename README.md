# Permissions Playground review-loop experiment

This repository is the private prospective source scaffold for protocol version 2.4.0-draft. Before builder launch, a deterministic allowlist projects only neutral Permissions Playground task files into two byte-identical, freshly initialized one-root Git repositories. Builders never receive this repository, its history, README, experiment material, skills, hidden material, or evidence.

## Status

- Phase: protocol 2.4.0-draft provisional lock, before builder exposure and final runner smoke
- Product: intentionally not implemented on this branch
- Public contract tests: committed but gated until all required implementation files exist
- Hidden tests: sealed externally; the existing v2 commitment remains unchanged
- Treatment algorithm: exact skill-v1 flow incorporated and content-addressed
- Experiment lock: 2.4.0-draft provisional; the skill and final runner-smoke commitments remain null until their prospective gates complete
- License: none has been granted; no license file is included

Do not present this branch as a completed application or executable experiment. A passing scaffold check establishes internal consistency only.

## Five-minute setup

Requires Node.js 22 and npm 11.11.0.

```sh
npm ci
npm run check
npm run dev
```

`npm run dev` serves an honest placeholder page. `npm run test:public` intentionally exits nonzero until all three implementation modules exist. `npm run check` accepts only the all-files-absent scaffold state or a complete implementation, and also runs protocol semantic tests.

## Experiment flow

```mermaid
flowchart LR
  S[Private source common start] --> I[Allowlisted neutral projection]
  I --> A[Neutral build A]
  I --> C[Neutral build B]
  A --> Z[Seal both initial snapshots]
  C --> Z
  Z --> R[32-byte CSPRNG assignment]
  R --> B[B0 baseline frozen: zero cycles]
  R --> T[T0 treatment initial]
  T --> L[Up to 5 fresh reviewer/fixer/tester cycles]
  L --> F[Tfinal]
  B --> P[History-free X/Y/Z packages]
  T --> P
  F --> P
  P --> E[Blind public + sealed hidden evaluation]
  E --> O[Primary Tfinal-B0; secondary Tfinal-T0]
```

The winner promoted to `main` is the higher-scoring of B0 and Tfinal; an exact tie selects baseline.

- [`docs/permissions-playground-spec.md`](docs/permissions-playground-spec.md): unchanged frozen product semantics
- [`docs/public-test-contract.md`](docs/public-test-contract.md): unchanged activation and public-test contract
- [`experiment/protocol.md`](experiment/protocol.md): assignment, freshness, budgets, evidence, evaluation, and invalidation
- [`experiment/canonical-contract.json`](experiment/canonical-contract.json): machine-readable transcription of the normative public protocol
- [`experiment/golden-run/`](experiment/golden-run/): synthetic prospective execution-mode conformance record
- [`experiment/rubric.md`](experiment/rubric.md): unchanged 100-point 50/15/15/10/10 rubric
- [`experiment/prompts/neutral-builder.md`](experiment/prompts/neutral-builder.md) and [`experiment/builder-config.json`](experiment/builder-config.json): identical neutral construction inputs
- [`experiment/builder-input-allowlist.json`](experiment/builder-input-allowlist.json), [`experiment/schemas/builder-input-manifest.schema.json`](experiment/schemas/builder-input-manifest.schema.json), and [`scripts/prepare-builder-input.mjs`](scripts/prepare-builder-input.mjs): hash-bound source-to-product projection policy, private manifest contract, and deterministic two-repository preparer
- [`experiment/treatment-loop-algorithm.md`](experiment/treatment-loop-algorithm.md): exact frozen skill-v1 flow
- [`experiment/schemas/`](experiment/schemas/): machine-readable artifact contracts and the authoritative finding schema
- [`experiment/templates/`](experiment/templates/): prospective, non-evidentiary artifact examples
- [`experiment/lock.json`](experiment/lock.json): provisional 2.4 commitments; final runner-smoke and treatment-skill fields remain null

## Architecture and boundaries

The scaffold contains protocol documents, schemas, test contracts, public tests, parameterized supervisors, a deterministic builder-input projector, a deterministic blinding packager, and a Vite placeholder. First prepare two neutral repositories with `node scripts/prepare-builder-input.mjs` and the exact bound source commit/tree, allowlist, destinations, and private manifest arguments. The preparer rejects symlink, junction, or reparse-point ancestors and uses native realpath canonicalization through each prospective path's nearest existing physical parent before enforcing nonnesting. Then invoke neutral construction as `pwsh -NoProfile -File scripts/run-cli-builders.ps1 -ContractPath <absolute-contract.json>`. Before creating evidence directories or launching a model, the builder runner validates the private manifest and projection-policy hashes; uses the frozen `scripts/canonicalize-paths.mjs` helper to collapse existing and prospective short-name or other physical aliases; proves every private input and runtime output physically separate from both workdirs; and requires the complete visible filesystem outside root `.git` to equal the manifest's exact file, directory, byte, and hash set. It also checks the aggregate projection hash, identical one-root commit/tree, disabled remotes, and `core.autocrlf=false`. After each model exits, it preserves a deterministic full visible-filesystem snapshot and hash outside the workdir; legitimate ignored build output is recorded rather than treated as a dirty tracked-file failure. Invoke one reviewer, fixer, tester, or evaluator as `pwsh -NoProfile -File scripts/run-cli-role.ps1 -ContractPath <absolute-role-contract.json>`. Both runners hash-bind and use the same canonical-path helper for every private/workdir/evidence/output comparison, require the frozen PowerShell 7 host, schema-validate the complete runtime contract before any Codex launch, use frozen `gpt-5.4`/`xhigh` argv, raw stdin, fresh external processes, and content-addressed evidence. `smokeMode: true` is reserved for the exact committed harmless runner-smoke prompt; normal construction accepts only the neutral builder prompt. Although this CLI exposes `--output-schema`, role argv omits it until a distinct pre-injection schema is frozen: the authoritative final schema requires observed runtime identity, which the supervisor—not the model—must inject.

Create evaluator inputs with `node scripts/package-blinded-snapshots.mjs --mapping <private-mapping.json> --output-root <fresh-output-directory> --manifest <private-manifest.json>`. Prepare each clean independent source clone with `git -c core.autocrlf=false clone ...` and retain `core.autocrlf=false`; this keeps frozen gate bytes stable before history-free export. The packager exports only regular blobs enumerated by the bound `HEAD` tree, reading each blob from Git rather than recursively copying the working filesystem. Ignored or untracked private files therefore cannot enter a package. The mapping supplies the exact X/Y/Z order, B0/T0/Tfinal source clones, source refs, commit/tree bindings, frozen public-gate-set hash, and exact private provenance markers (candidate/run IDs, evidence paths, and role-artifact names). Generic product or dependency vocabulary is allowed; exact private markers and Git/protocol/evidence artifacts are rejected. The manifest must remain outside the output root.

Evaluators own the sealed hidden suite outside this repository. Each fresh evaluator receives exactly one history-free package labeled only X, Y, or Z and never sees lineage, assignment, another package, role artifacts, or Git metadata. It seals one score and post-score mapping diagnostic before the next evaluator starts. The browser product is specified to use local in-memory state only: no authentication, backend, network calls, credentials, persistence, or personal data.

## Limitations, security, and provenance

This is a two-candidate pilot, not a statistically powered benchmark. Its results are descriptive for this task and frozen provider configuration. Isolation is an audited procedural boundary plus the CLI sandbox, not kernel-enforced proof against every child-process, network, junction, or reparse-point escape. Operators must use non-reparse, nonnested roots and audit pre/post Git and evidence commitments. Public tests expose examples and contracts, not hidden cases. Hidden fixtures must never be committed to a candidate or protocol branch.

The diagram above is the truthful visual for this protocol scaffold. Product screenshots are deferred because no product exists yet; a promoted implementation must later capture sanitized real UI evidence with alt text and provenance. The specification and protocol materials are original project work. Dependency provenance remains pinned in `package-lock.json`.

## Contributing and support

This private experiment is not accepting general contributions. Operators must record deviations and invalid attempts after they occur rather than pre-populating evidence or silently repairing them. Repository-owner support is the only support channel during the pilot.
