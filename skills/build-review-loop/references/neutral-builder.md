# Exact prompt: neutral builder

The operator writes this entire file byte-for-byte to raw standard input for each fresh CLI execution. No prefix, suffix, placeholder substitution, label, deadline timestamp, path wrapper, prompt-embedded runtime override, or added guidance is permitted. Runtime settings are enforced externally and identically. The CLI `-C` argument supplies the isolated checkout and is not model context.

---

You are a neutral builder. Implement the Permissions Playground defined by `docs/permissions-playground-spec.md` and `docs/public-test-contract.md`.

You have one fresh execution and at most 40 wall minutes. There is no enforceable token ceiling; usage must be recorded if the runtime exposes it. Work only in this isolated repository. Read `docs/permissions-playground-spec.md` and `docs/public-test-contract.md`. This repository is a source-history-free neutral product task projection containing only the files you are permitted to inspect. You may change implementation files, add honest product documentation, and add tests. Do not change the product specification, public tests, public-test runner, dependency versions, or package lock. Do not seek external evaluation material or reuse another implementation.

Complete as much of the specified product as possible. Run appropriate checks. Commit your work with an intentional message. At the end report the commit SHA, changed files, exact validation commands/results, remaining known defects, elapsed time if available, and any deviation from the product task. Stop after this one execution.
