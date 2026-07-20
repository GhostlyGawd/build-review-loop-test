# Frozen treatment-loop algorithm

For the current treatment snapshot, perform cycles 1 through 5 as follows:

1. Spawn a fresh, history-free reviewer with only the current snapshot and the frozen public task, criteria, and gates. The reviewer does not edit files and does not run tests. It emits authoritative findings conforming to `experiment/schemas/finding.schema.json`.
2. If the findings array is empty, stop immediately with `stopReason` `zero-findings` and `convergence` `true`. Do not invoke a fixer or tester for that cycle.
3. If findings are nonempty, spawn a fresh, history-free fixer with only the current snapshot, current findings, frozen task/criteria, allowed paths, immutable gates, and safety boundaries. The fixer makes the smallest coherent changes responsive to the findings and seals its output.
4. Spawn a fresh, history-free tester with only the fixer output and the frozen public gates. The tester makes no edits and runs the frozen public gate `npm run check` exactly, preserving its component command results.
5. Continue to the next cycle using the sealed fixer output as the current treatment snapshot. Do not pass role transcripts, prior-cycle findings, prior-cycle artifacts, or accumulated history.
6. If cycle 5 has nonempty findings, still perform its fixer and tester, then stop with `stopReason` `max-cycles` and `convergence` `false`.

Baseline receives zero workers and zero cycles.
