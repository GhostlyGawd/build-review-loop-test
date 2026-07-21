# Isolation procedure

## Establish neutral candidates

1. Have a delegated Git worker verify a clean frozen source and resolve the common start commit/tree.
2. Create two new, non-nested candidate directories from that exact start using independent worktrees, clones, or equivalent copy-on-write environments. Never use the root checkout as a candidate.
3. Separate writable caches, temporary files, dependencies, databases, ports, process namespaces, credentials, services, and evidence paths. The only shared-CWD exception is one direct read of the builder's opaque assignment envelope; all repository operations use its assigned worktree afterward.
4. Freeze exact builder prompt/config/schema bytes. Give each fresh builder the same prompt/config, role budget, environment, model-setting policy, and common start. Give each a distinct 24-character opaque worker key, candidate ID, safe worktree, build branch, base branch, task-leaf file, envelope hash, and attestation. Do not expose this skill.
5. Require the pair to differ only in those five opaque/workspace fields. Worktrees must be distinct, non-nested canonical children of the frozen workspace root; all four branches must differ. Keep common start and prompt/config/schema commitments identical.
6. Freeze both envelope attestations and snapshots before generating the assignment seed. A builder derives `[a-z0-9_]+` only from its task name and reads `<coordination-directory>\<task-leaf>.json` directly. Never list that directory or read a sibling assignment.

## Maintain role isolation

- Keep the baseline immutable and worker-free until blind evaluation.
- Create a new history-free reviewer, fixer, and tester whenever the treatment cycle requires that role. Never fork them from conversations containing prior roles or cycles.
- Build reviewer packets from the current treatment snapshot and frozen public inputs only. Build fixer packets from only the current findings and snapshot.
- Keep the hidden suite sealed until the evaluator packet. The evaluator receives anonymous B0/T0/Tfinal packages labeled only X/Y/Z, exact frozen public materials, and no mapping, provenance, history, findings, fixes, identities, prompts, costs, cycles, or skill.
- Delegate Git work to dedicated workers. The root may select, dispatch, verify, stop, and record, but may not implement, review, fix, test, evaluate, or operate Git.

## Detect contamination

Before every handoff, record snapshot commit/tree, allowed paths, worker ID, packet hash, envelope/schema hash, frozen one-turn wall budget, cost/environment/model binding, and clean/dirty state. Invalidate for assignment-directory listing, sibling assignment reads, envelope/path/attestation mismatch, mismatched starts, byte-unequal builder inputs, skill exposure, early assignment/redraw, shared mutable paths, cross-candidate reads, baseline mutation, worker reuse, changed gates/commitments/rubric, unexpected network/remotes, inherited role history, evaluator leakage, sentinel execution data, or evidence-chain failure.

Quarantine processes and credentials on suspected leakage. Preserve sanitized evidence and stop when isolation cannot be restored without changing the frozen protocol. Cleanup is separately authorized destructive work: validate exact candidate paths first and never recursively delete a repository root, home directory, unresolved variable, or broad glob.
