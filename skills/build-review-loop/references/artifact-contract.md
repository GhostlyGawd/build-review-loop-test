# Artifact contract

Use UTF-8 JSON with sorted keys where canonicalization is required. Do not persist secrets. The validator accepts this minimum layout:

```text
RUN_DIR/
  run.json
  evidence.jsonl
  arms/X/arm.json
  arms/X/cycles/01/review.json
  arms/X/cycles/01/fix.json          # required only for nonempty findings
  arms/X/cycles/01/public-gates.json # required after every fix
  arms/Y/...
  evaluation/blind.json
```

## `run.json`

Require:

```json
{
  "schema_version": 1,
  "experimental": true,
  "portability_claim": false,
  "base_commit": "40 lowercase hex characters",
  "builder_prompt_sha256": "64 lowercase hex characters",
  "assignment": {
    "performed_after_both_freezes": true,
    "method": "sha256-seed-parity-v1",
    "seed_hex": "64 lowercase hex characters",
    "X": "opaque candidate ID",
    "Y": "different opaque candidate ID"
  },
  "public_gates": ["nonempty command"],
  "max_cycles": 5
}
```

For `sha256-seed-parity-v1`, sort the two distinct UTF-8 candidate IDs lexically as `a`, `b`; compute `SHA256(bytes.fromhex(seed_hex) + b"\0" + a.encode() + b"\0" + b.encode())`; assign `X` to `a` when the first digest byte is even and to `b` when odd, then assign `Y` to the other candidate. Generate and record the seed only after both initial freeze attestations.

## `arm.json`

Require `label` (`X` or `Y`), matching `candidate_id`, `base_commit`, `builder_prompt_sha256`, `initial_frozen_before_assignment: true`, `initial_snapshot`, `final_snapshot`, `stop_reason` (`zero_findings` or `max_cycles`), `convergence_verified` (boolean), and `token_cost` (nonnegative integer or null). Both arms' builder prompt hashes must match `run.json`; candidate IDs must match the post-freeze assignment. A zero-findings stop requires convergence true. A max-cycles stop requires exactly five cycles and convergence false.

## Cycle files

`review.json` requires `cycle` (1–5), a globally unique `reviewer_instance_id`, `context: "current_snapshot_only"`, `snapshot`, `token_cost`, and `findings`.

Each finding requires exactly these actionable fields (extensions are allowed):

```json
{
  "id": "stable cycle-local ID",
  "severity": "critical|high|medium|low",
  "title": "concise defect",
  "evidence": "specific path, symbol, or observed behavior",
  "impact": "why it matters",
  "required_change": "bounded outcome, not implementation micromanagement",
  "acceptance_check": "observable proof of resolution"
}
```

For nonempty findings, require `fix.json` with matching `cycle`, a globally unique `fixer_instance_id`, `context: "current_findings_only"`, `input_snapshot`, `output_snapshot`, `addressed_finding_ids`, `changed_paths`, and `token_cost`. Require `public-gates.json` with matching cycle/snapshot, `tester_instance_id`, `token_cost`, and one result per frozen gate. Each result contains `command`, `exit_code`, and `output_digest`. No fix or gates file is allowed after an empty review.

The final cycle must be the first empty review or cycle 5. If cycle 5 contains findings, its fix and public gates are still required and convergence remains unverified.

## `blind.json`

Require `evaluator_instance_id`, `blind_labels: ["X", "Y"]`, `excluded_context` containing `identities`, `assignment`, `history`, and `costs`, `winner` (`X`, `Y`, or `tie`), nonempty `rubric`, nonempty `evidence`, and `token_cost` (nonnegative integer or null).

## Append-only evidence

Write one JSON object per line with `sequence` starting at 1, `kind`, `payload`, `previous_event_hash`, and `event_hash`. The first previous hash is null. For later events it equals the prior `event_hash`.

Compute `event_hash` as SHA-256 of canonical UTF-8 JSON for the event with `event_hash` omitted: sort object keys recursively and use separators `,` and `:` with no insignificant whitespace. Append new lines only. The chain proves internal order and mutation detection; preserve the file and storage history to support an append-only claim.

Run `python scripts/validate_artifacts.py RUN_DIR`. Exit 0 means the minimum structural contract passes; it does not prove worker freshness, filesystem isolation, safety, finding correctness, or absence of undisclosed channels.
