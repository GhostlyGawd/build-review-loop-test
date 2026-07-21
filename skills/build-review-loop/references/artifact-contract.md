# Public protocol-v2 artifact contract

Treat bundled [canonical-contract.json](canonical-contract.json) as authoritative. Its domain-separated canonical SHA-256 is `05a869d36aca6c9c146c56fa8f6432438d5c7e2c87fd944f822f660747e0d6f5`. Use bundled `../tests/fixtures/golden-run.json` as the byte-identical valid-with-history execution example; its canonical SHA-256 is `e53d8ecffdd1717e369acf312b2ba649726c511d7d31b1a58346cf734b7ffc69`. The byte-identical `../tests/fixtures/invalid-current.json` example has canonical SHA-256 `2911016d16fca74949d93f1b9488d0d09013ac4658f412d3b8d4789e2f7969ff`. Do not invent alternate field names or layouts.

## Frozen bindings and costs

Bind these exact public commands:

```text
tester: npm run check
components, in order:
  npm run format:check
  npm run lint
  npm run typecheck
  npm run validate:scaffold
  npm run test:protocol
  npm run test:public:if-implemented
  npm run build
evaluator public: npm run test:public
evaluator hidden: node sealed-hidden-suite/run.mjs
hidden ID: permissions-playground-sealed-v2
hidden SHA-256: a6f38c08eff3fd23fca3299f0777adbea4001d3ac3147272511ff9babd98a19b
```

Freeze one turn and wall maxima: builder 2400, reviewer 900, fixer 1500, tester 900, evaluator 1800, unblinder 300, Git worker 600 seconds. Every cost record binds `environmentSha256`; model roles bind `modelConfigSha256`, while deterministic unblinder/Git roles may use null only with a reason. Require `maxTokens: null` and a nonempty `maxTokensUnavailableReason`. Use provider-reported nonnegative totals when available; otherwise keep `totalTokens` and `usd` null with `source: "unavailable"`.

Every builder freeze must bind prompt SHA-256 `7aa6ed9b0583ea2d5e555f26a354b2a9887851b2ded6e1930ec00772376e7b82` and config SHA-256 `caf42a587e56b1b9ffcacf29047fbc69e80cba52188d6f4363a489ec84a5b40b`. Each value must equal both the canonical commitment and its corresponding preregistration lock commitment; equality between builders alone is insufficient.

## Assignment and stopping

After both initial artifacts freeze, draw exactly 32 OS-CSPRNG bytes once. UTF-8-byte-sort candidate IDs as id0/id1. Hash, in order:

```text
b"build-review-loop-assignment-v2\x00"
+ raw seed bytes
+ uint64be(len(id0)) + id0
+ uint64be(len(id1)) + id1
```

Use `digest[0] & 1` as baseline index; the other is treatment. Record seed, digest, draw, mapping, generator, timestamp, and the two frozen evidence hashes. Baseline uses exactly `baseline-zero-cycles`, zero cycles, identical initial/final snapshots, and null convergence. Treatment stops on `zero-findings` or after the fifth nonempty review/fix/test as `max-cycles` with false convergence.

## Exact findings

Reject additional or missing fields. Require:

```json
{
  "id": "cycle-1-reviewer-01",
  "severity": "critical|high|medium|low",
  "title": "nonempty",
  "evidence": ["specific evidence"],
  "expected": "nonempty",
  "actual": "nonempty",
  "rubricItems": ["A1"],
  "verification": "nonempty",
  "duplicateOf": null
}
```

IDs match `^cycle-[1-5]-reviewer-[0-9]{2}$`; rubric items are unique registered IDs; `duplicateOf` is null or another registered finding ID.

## Blind X/Y/Z evaluation

Draw a separate 32-byte seed and record lowercase `seedHex`. Compute `digestSha256 = SHA256(UTF8("permissions-playground/protocol-v2/evaluation\n" + seedHex))`. For each snapshot name B0, T0, Tfinal, compute `SHA256(UTF8(digestSha256 + "\n" + snapshotName))`. Sort by lowercase rank digest, then UTF-8 snapshot name, and assign positions to X/Y/Z.

Each of the three evaluation artifacts requires exact `publicTests` and `hiddenTests` result objects, exactly 20 items in this order, written-anchor scores, exact maxima, evidence/rationale, section totals, uncapped/final totals, cap conditions, caps applied, uncertainties, and hashes:

| Section | Items (`maximum`; anchors) | Maximum |
| --- | --- | ---: |
| `functional` | A1 (6; 0/3/6), A2 (8; 0/4/8), A3 (10; 0/4/7/10), A4 (10; 0/4/7/10), A5 (7; 0/4/7), A6 (7; 0/4/7), A7 (2; 0/1/2) | 50 |
| `robustnessSecurity` | B1 (5; 0/3/5), B2 (5; 0/3/5), B3 (5; 0/3/5) | 15 |
| `accessibilityUsability` | C1 (6; 0/3/6), C2 (4; 0/2/4), C3 (5; 0/3/5) | 15 |
| `testEffectiveness` | D1 (4; 0/2/4), D2 (4; 0/2/4), D3 (2; 0/1/2) | 10 |
| `maintainabilityDocs` | E1 (3; 0/1/2/3), E2 (3; 0/1/2/3), E3 (2; 0/1/2), E4 (2; 0/1/2) | 10 |

Registered caps are `functional-section-10` when build/render fails, `default-allow-A2-A3-combined-4`, and overall `overall-security-50` for executable injection/unexpected network. Emit caps in that order. The outcome maps X/Y/Z bijectively to B0/T0/Tfinal, copies final totals, computes `primaryTfinalMinusB0` and `secondaryTfinalMinusT0`, and selects baseline on an exact B0/Tfinal tie.

## Canonical evidence and modes

Canonical JSON accepts null, booleans, safe integers, strings, arrays, and objects. Sort object keys by ascending UTF-8 bytes; preserve arrays; use JSON escaping; emit no insignificant whitespace/trailing newline. Hash the bytes `b"permissions-playground/canonical-json-v1\x00" + canonical_json_utf8`.

Evidence sequence begins at 0; first `previousSha256` is null; each later predecessor is the prior `artifactSha256`; every artifact hash uses the canonical algorithm. Execution mode rejects zero 40/64-character hashes or seeds, template/sentinel/placeholder/required-at-run strings, provisional locks, duplicate invocation IDs, and any public-contract divergence. Template mode is never executable.

Completed status is exactly `valid` or `invalid`. Valid records require `activeInvalidation: null`, exactly three evaluations, and a scored outcome. Their `invalidAttempts` array may be empty or retain prior structured attempts. Invalid current records require a structured `activeInvalidation` with ID, scope, code, reason, timestamp, evidence SHA-256, and preserved-artifact SHA-256; both `evaluations` and `outcome` must be null. Preserved attempts use the corresponding `attemptId` and `invalidatedAt` fields. All evidence hashes are nonzero.

Validate an integrated run:

```text
python scripts/validate_artifacts.py RUN.json --mode execution
python scripts/validate_artifacts.py tests/fixtures/golden-run.json --mode execution --expect-golden
python scripts/validate_artifacts.py tests/fixtures/invalid-current.json --mode execution
python scripts/validate_artifacts.py TEMPLATE.json --mode template
```
