# Isolation procedure

## Establish arms

1. Have a delegated Git worker verify the frozen base commit and a clean source state.
2. Create two non-nested, dedicated arm directories from that exact commit using independent Git worktrees, clones, or equivalent copy-on-write environments. Resolve and record absolute paths before any recursive operation.
3. Give each arm separate build caches, temporary directories, dependency state, process namespaces where available, and output/evidence directories. Do not share writable symlinks, generated files, databases, ports, credentials, or background services.
4. Restrict each worker to its assigned absolute arm and evidence path. Permit only read-only task inputs explicitly named in the packet.
5. Confirm both candidates' base commit, tree, prompt hash, status, and freeze attestation before randomized X/Y assignment.

## Maintain blindness

- Use opaque candidate IDs until post-freeze assignment and only `X`/`Y` afterward.
- Create a new worker instance for every reviewer, fixer, tester, and evaluator role required to be fresh. Do not fork from a conversation containing another role's history.
- Construct reviewer packets from the current snapshot plus frozen public inputs, never from accumulated conversation state.
- Keep assignment seed/mapping and worker identities outside arm-visible and evaluator-visible directories.
- Do not expose timestamps or path names that reveal identity when preparing evaluator snapshots.

## Detect contamination

Before each handoff, record the snapshot commit/tree, allowed path set, worker-instance ID, packet hash, and clean/dirty state. Invalidate on an unexpected base, shared mutable inode/path, cross-arm read, unexpected remote/network effect, prior-role context, or evidence-chain failure. Quarantine processes and credentials on any suspected leak; preserve sanitized evidence and stop if isolation cannot be restored without changing the frozen protocol.

Cleanup is a separately authorized destructive operation. Validate exact arm paths first; never recursively delete a repository root, home directory, unresolved variable, or broad glob.
