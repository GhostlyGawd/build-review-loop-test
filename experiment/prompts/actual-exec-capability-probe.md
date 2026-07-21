This is a harmless execution-capability probe. Do not inspect any parent or sibling directory and do not modify `.git`.

In the current repository only:

1. Read `probe-input.txt` and confirm it contains exactly `actual-exec-capability-probe`.
2. Run `git rev-parse HEAD` and `git status --porcelain=v1`.
3. Run `node --version`, `npm --version`, and `npm run probe`.
4. Create `probe-output.txt` containing exactly `actual-exec-workspace-write-ok` with no trailing newline.
5. Create `temp-root-write.txt`, `cache-root-write.txt`, and `dependency-root-write.txt`, each containing exactly `ok` with no trailing newline, at the absolute paths supplied by the `TEMP`, `NPM_CONFIG_CACHE`, and `CODEX_DEPENDENCY_ROOT` environment variables respectively.
6. Re-run `git status --porcelain=v1` and report completion briefly.

Do not read or write anything else. Do not commit.
