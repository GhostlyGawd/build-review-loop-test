# Public test and implementation contract

The Phase 1 branch intentionally omits these three files:

1. `src/permissions/model.ts`
2. `src/permissions/evaluate.ts`
3. `src/PermissionsPlayground.tsx`

They are the activation boundary. `npm run test:public` exits with code 1 and lists missing files until all three exist. `npm run check` accepts only the all-three-absent Phase 1 state. A partial implementation is always an error. Once all three files exist, both commands run the same Vitest suite and any failure fails CI.

The public suite dynamically imports the required modules only after activation, preventing the Phase 1 compiler and bundler from treating their deliberate absence as a broken import. Tests cover:

- exact fixture IDs and evaluator examples;
- default deny, enabled filtering, inheritance, specificity, tied deny precedence, sorted winners, and input immutability;
- required regions, checker initial state, live result, all 36 matrix cells, enable/delete/reset behavior, add behavior, and core accessible names.

Public assertions are minimum acceptance evidence, not a complete quality review. Passing them does not guarantee that every edge case or usability requirement is satisfied.

Builders may add tests but MUST NOT edit, skip, delete, or weaken `tests/public/**`, `scripts/run-public-tests.mjs`, or the activation file list. Operators must invalidate an arm if that occurs before blinded evaluation.

After implementing the component, replace the placeholder in `src/main.tsx` with a render of the default export from `src/PermissionsPlayground.tsx`. The placeholder is not part of the product contract.
