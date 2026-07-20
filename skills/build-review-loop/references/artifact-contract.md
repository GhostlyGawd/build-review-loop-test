# Artifact contract (schema version 2)

Use UTF-8 JSON. Use sorted keys only where canonicalization is required. Do not persist secrets.

```text
RUN_DIR/
  run.json
  evidence.jsonl
  builders/<candidate-id>/attestation.json
  arms/baseline/arm.json
  arms/treatment/arm.json
  arms/treatment/cycles/01/review.json
  arms/treatment/cycles/01/fix.json          # only for nonempty findings
  arms/treatment/cycles/01/public-gates.json # after every fix
  evaluation/package-map.json                # sealed from evaluator
  evaluation/blind.json
  evaluation/unblinded.json
```

## Run contract

Require `run.json` to contain:

```json
{
  "schema_version": 2,
  "experimental": true,
  "portability_claim": false,
  "valid": true,
  "invalidation": null,
  "common_start": {"commit": "40 lowercase hex", "tree": "40 lowercase hex"},
  "builder_prompt_sha256": "64 lowercase hex",
  "builder_config_sha256": "64 lowercase hex",
  "delegation": {
    "root_role": "orchestration_only",
    "implementation": true, "review": true, "fix": true,
    "test": true, "evaluation": true, "git": true
  },
  "role_policy": {
    "builder": {"max_tokens": 1, "timeout_seconds": 1, "environment_sha256": "64 lowercase hex", "model_settings_sha256": "64 lowercase hex"},
    "reviewer": {}, "fixer": {}, "tester": {}, "evaluator": {},
    "unblinder": {}, "git_worker": {}
  },
  "public_gates": ["nonempty immutable command"],
  "hidden_suites": ["nonempty sealed suite ID or command"],
  "max_treatment_cycles": 5,
  "assignment": {
    "method": "sha256-baseline-treatment-v2",
    "seed_hex": "64 lowercase hex",
    "seed_generated_after_both_freezes": true,
    "sorted_candidate_ids": ["candidate-a", "candidate-b"],
    "baseline": "candidate-a or candidate-b",
    "treatment": "the other candidate",
    "event_sequence": 3
  }
}
```

Require all seven role-policy entries. Each freezes a positive integer `max_tokens`, positive integer `timeout_seconds`, and hashes of exact environment and model-setting bytes. `token_cost` in worker artifacts is separate telemetry: require a nonnegative integer when measured or JSON `null` when unavailable; reject strings and estimates. A completed valid comparison uses `invalidation: null`; on any invalidation, preserve the evidence and reason but do not emit a valid comparison result.

### Candidate assignment algorithm

Generate `seed_hex` with a CSPRNG as exactly 32 random bytes only after both initial snapshots and attestations freeze. Candidate IDs must be distinct, nonempty UTF-8 strings without NUL. Sort their UTF-8 byte strings lexicographically as `id0`, `id1`. Compute:

```text
material = b"build-review-loop-assignment-v2\x00"
         + bytes.fromhex(seed_hex)
         + len(id0).to_bytes(8, "big") + id0
         + len(id1).to_bytes(8, "big") + id1
digest = SHA256(material)
baseline = sorted_candidate_ids[digest[0] & 1]
treatment = the other sorted candidate ID
```

This is the only candidate-assignment algorithm. Record the direct baseline/treatment mapping and sorted IDs so the validator can recompute it.

## Builder attestations

Each `builders/<candidate-id>/attestation.json` requires the candidate ID; a globally unique builder instance ID; `skill_exposed: false`; matching common start commit/tree and prompt/config hashes; an initial snapshot; `frozen: true`; a positive `freeze_event_sequence`; and token cost. Both attestations must name the same prompt/config hashes and common start. Their evidence events must precede the assignment event.

## Arms and treatment cycles

Each `arm.json` requires `role`, matching `candidate_id`, `initial_snapshot`, `final_snapshot`, `cycle_count`, `stop_reason`, `convergence_verified`, and token cost.

- Baseline: initial equals final, cycle count is `0`, stop reason is `baseline_frozen`, convergence is JSON `null`, and no baseline `cycles` directory is allowed.
- Treatment: use only cycles numbered contiguously from 1. Stop reason is `zero_findings` with convergence `true`, or `max_cycles` with convergence `false` and exactly five cycles.

`review.json` requires the cycle, unique reviewer ID, `context: "current_snapshot_only"`, input snapshot, token cost, and `findings`. A finding has exactly these authoritative required fields (extensions are allowed):

```json
{
  "id": "stable cycle-local ID",
  "severity": "critical|high|medium|low",
  "title": "concise defect",
  "evidence": "specific path, symbol, or observed behavior",
  "impact": "why it matters",
  "required_change": "bounded outcome",
  "acceptance_check": "observable proof"
}
```

For nonempty findings, require `fix.json` with matching cycle, unique fixer ID, `context: "current_findings_only"`, input/output snapshots, all addressed finding IDs, changed paths, and token cost. Require `public-gates.json` with matching cycle/output snapshot, unique tester ID, token cost, and one ordered result per frozen public gate. A result contains exact `command`, integer `exit_code`, and nonempty `output_digest`. Allow no fix or gate file after an empty review. The final snapshot follows the last fix, or the empty review input snapshot. Cycle 5 with findings still requires its fix and gates.

## Three-snapshot blind evaluation

Require `evaluation/package-map.json` to be sealed from the evaluator and to map `X`, `Y`, and `Z` bijectively to `baseline_final`, `treatment_initial`, and `treatment_final`, with each mapped snapshot matching the corresponding arm artifact. Require `randomization_method: "system_csprng_shuffle_v1"` and a SHA-256 digest of the raw randomization record; preserve that raw record outside the evaluator packet.

Require `evaluation/blind.json` to contain a fresh evaluator ID, `blind_labels: ["X", "Y", "Z"]`, `history_free: true`, and `excluded_context` including `identities`, `assignment`, `mapping`, `history`, and `costs`. For every label, require results for every frozen public gate and hidden suite, plus this exact rubric:

| Dimension | Points |
| --- | ---: |
| `functional_correctness` | 50 |
| `code_quality_maintainability` | 15 |
| `test_quality` | 15 |
| `security_safety` | 10 |
| `requirements_scope` | 10 |

Each dimension needs an integer score from zero through its weight and nonempty evidence. Require the declared total to equal the five scores and evaluator token cost to be measured or null. The evaluator may and must run both frozen suites; testing is an explicit exception to read-only comparison, but editing remains forbidden.

Require `evaluation/unblinded.json` to freeze after blind evaluation and contain the direct package mapping, copied totals by semantic snapshot, `primary_delta` equal to treatment-final minus baseline, and `secondary_delta` equal to treatment-final minus treatment-initial. Keep scoring unchanged during unblinding.

## Append-only evidence

Write one JSON object per line with `sequence` starting at 1, `kind`, `payload`, `previous_event_hash`, and `event_hash`. The first previous hash is null; each later value equals the prior event hash. Compute `event_hash` as SHA-256 of canonical UTF-8 JSON for the event with `event_hash` omitted: recursively sort object keys and use separators `,` and `:` without insignificant whitespace.

The validator cross-checks the two `builder_frozen` events and later `assignment` event against attestations and the assignment record. The chain proves internal order and mutation detection; retain storage history to support an append-only claim.

Run `python scripts/validate_artifacts.py RUN_DIR`. Exit 0 proves only this minimum structural contract, not genuine worker freshness, isolation, safety, CSPRNG quality, semantic finding correctness, or absence of undisclosed channels.
