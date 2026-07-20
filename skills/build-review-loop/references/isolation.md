# Isolation procedure

## Establish neutral candidates

1. Have a delegated Git worker verify a clean frozen source and resolve the common start commit/tree.
2. Create two new, non-nested candidate directories from that exact start using independent worktrees, clones, or equivalent copy-on-write environments. Never use the root checkout as a candidate.
3. Separate writable caches, temporary files, dependencies, databases, ports, process namespaces, credentials, services, and evidence paths. Permit only explicitly frozen read-only inputs.
4. Freeze exact builder prompt/config bytes. Give each fresh builder the same bytes, role budget, environment, model-setting policy, and common start. Do not expose this skill.
5. Use opaque candidate IDs. Freeze both snapshots and attestations before generating the assignment seed. Keep assignment state inaccessible to builders.

## Maintain role isolation

- Keep the baseline immutable and worker-free until blind evaluation.
- Create a new history-free reviewer, fixer, and tester whenever the treatment cycle requires that role. Never fork them from conversations containing prior roles or cycles.
- Build reviewer packets from the current treatment snapshot and frozen public inputs only. Build fixer packets from only the current findings and snapshot.
- Keep hidden suites sealed until the evaluator packet. The evaluator receives three anonymous snapshot packages, frozen suite definitions, and no mapping, provenance, history, findings, fixes, identities, or costs.
- Delegate Git work to dedicated workers. The root may select, dispatch, verify, stop, and record, but may not implement, review, fix, test, evaluate, or operate Git.

## Detect contamination

Before every handoff, record snapshot commit/tree, allowed paths, worker ID, packet hash, frozen role policy, and clean/dirty state. Invalidate for mismatched starts, byte-unequal builder inputs, skill exposure, early assignment, shared mutable paths, cross-candidate reads, baseline mutation, worker reuse, changed gates, unexpected network/remotes, inherited role history, evaluator leakage, or evidence-chain failure.

Quarantine processes and credentials on suspected leakage. Preserve sanitized evidence and stop when isolation cannot be restored without changing the frozen protocol. Cleanup is separately authorized destructive work: validate exact candidate paths first and never recursively delete a repository root, home directory, unresolved variable, or broad glob.
