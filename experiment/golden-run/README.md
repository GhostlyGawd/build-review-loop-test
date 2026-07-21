# Prospective conformance fixture

`golden-run.json` is synthetic protocol evidence used only to test execution-mode validation. It demonstrates a valid completed run that preserves one historical invalid rehearsal without candidate contents. `invalid-current.json` demonstrates a currently invalid run with structured evidence commitments and no evaluation conclusion or scored outcome. Both fixtures contain the same two synthetic opaque workspace-assignment envelopes and separate envelope-hash attestations; those coordinates are not candidate evidence.

Their identifiers and snapshots are deterministically derived test values, not candidate output, hidden-suite input, or experiment evidence. They must never be interpreted as executed experiments.
