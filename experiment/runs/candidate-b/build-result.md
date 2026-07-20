# Candidate B build result

- Common start: `1b1375e5fa182abd667ddbf77efc27358b162ff7`
- Preregistration lock commit: `b5d6538b75680888709d86d15041dc41ecde8712`
- Lock-file SHA-256: `74f65bc6b74dfb0ce0b73437f1e302f9ba72052dd73172de9891e3f9eda0bf3b`
- Build snapshot: `cd66ab1c9f76eeb72167e58722be96d199ecb635`
- Git tree: `86662dae30e20378d01bc99273d024fe534cfc91`
- Archived-tree SHA-256: `ddd46028266fa66c4b85907c73203d0c2972e6321fd240eeca57171db6cc7c49`
- Model/config: Codex agent based on GPT-5; reasoning setting and provider configuration were not exposed to the builder.
- Usage: input, cached input, output, total tokens, and USD cost are `null` because the provider did not expose role-level usage telemetry.

## Verification

- Node `v22.23.1`; npm `11.11.0`.
- Clean `npm ci`: exit 0; 240 packages installed; 0 vulnerabilities reported.
- Full `npm run check`: exit 0; formatting, lint, typecheck, frozen scaffold validation, 14/14 public tests, and production build passed.
- Full Vitest run: exit 0; 22/22 tests passed across four files.
- Production Chromium: one `h1`, 36 accessible matrix results, no Vite overlay or application errors.
- Desktop 1440 × 1000: explicit-deny and allowed interactions captured from the production preview.
- Narrow 320 × 800: document horizontal pan blocked; both wide semantic tables retain independent horizontal scrolling; Tab focus reached `Reset policy`.

## Result and limitations

The complete frozen product contract is implemented. The application remains an educational, fixed-domain, in-memory simulator and is not a production authorization system. No known implementation defects remain. No protocol deviation was recorded. The run status remains `pending` because later blinded review/fix/evaluation stages are outside this builder session.
