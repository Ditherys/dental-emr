# Odontogram O0 — Independent review, baseline, and source pin

**Acceptance authority:** Project owner
**O0 status:** Re-accepted by the project owner on 2026-08-29; O1-O14 local
completion is authorized under ADR-029. Cloud TEST and final release acceptance
remain pending.
**Date:** 2026-08-28

## Scope

O0 of `docs/plans/odontogram-integration-plan.md`: independent review of the
integration boundary, baseline of the fork and the EMR, and a verified
source pin.

## Reviewed inputs

- `docs/specs/odontogram-integration.md` (SHA-256
  `FA02B768C760652A6D04066EDCEEC3956B928AC62BAEB321E8F325450C5C0DAE` per
  `docs/BILLING_ODONTOGRAM_ACCEPTANCE_REVIEW.md`).
- `docs/plans/odontogram-integration-plan.md` (SHA-256
  `C706E813860133B8240F3868E4277BFBC6C9961D5C77C3E7A0F014439C7D2F0A`).
- `docs/plans/015-odontogram.md` and `docs/plans/016-treatment-plans.md`.
- `docs/BILLING_ODONTOGRAM_ACCEPTANCE_REVIEW.md` (B0–B11 completion
  prerequisite confirmed by the same owner acceptance record).
- `docs/decisions/ADR-026-billing-ledger-provider-compensation.md`,
  `docs/decisions/ADR-027-billing-local-verification.md`.
- `src/lib/odontogram/{types,schema,errors,service}.ts` (Phase 15 baseline).
- `supabase/migrations/20260827013100_tooth_conditions.sql`,
  `20260827013200_odontogram_rpcs.sql`,
  `20260827013201_odontogram_rpcs_grants.sql`,
  `20260827013300_treatment_plans.sql`,
  `20260827013400_treatment_plan_rpcs.sql`,
  `20260827013401_treatment_plan_rpcs_grants.sql`.
- `src/app/(emr)/patients/[patientId]/odontogram-section.tsx`,
  matching `odontogram-actions.ts`, and the patient actions/tests.
- `C:\Users\Latitude 7430\Desktop\React-Odontogram-Modul` fork at
  `5e28d931feefe4c3382513dbb0f5a9db9cf9948c`: `package.json`, `LICENSE`,
  `src/index.ts`, `src/App.tsx`, `src/odontogram.ts`, and the fork's
  regression suites.

## Source pin

| Item | Value |
| --- | --- |
| Controlled source URL | `https://github.com/Ditherys/React-Odontogram-Modul` |
| Pinned commit | `5e28d931feefe4c3382513dbb0f5a9db9cf9948c` (short `5e28d93`) |
| Pinned commit subject | `fix: preserve measured occlusal hit height` |
| License | MIT (copyright 2026 Zoltán Dul) |
| Working-tree semantic check | `git diff --ignore-space-at-eol --ignore-cr-at-eol --exit-code` returns `0`. Remaining tracked modifications are pure CRLF/LF line-ending differences in `package-lock.json`, `src/__tests__/parity/fhir-golden.json`, and `src/__tests__/parity/roundtrip-golden.json`; untracked content (`.learnings/`, `.playwright-cli/`, `.superpowers/`, `output/playwright/`, etc.) is out of scope per the plan and is **not** a source input. |
| License and pin recorded in | `docs/decisions/ADR-028-odontogram-renderer-domain-boundary.md` and `THIRD_PARTY_NOTICES.md` |

## Baseline results

Recorded 2026-08-28 on the local Windows + PowerShell + Docker Desktop
workstation.

### Fork — `npm test` and `npm run build:lib`

- `npm test` (Vitest, jsdom): **190 files passed, 1 skipped (191 total) /
  1952 tests passed, 2 skipped (1954 total).** Two `vitest-pool` worker
  timeouts were reported as unhandled errors on
  `src/__tests__/tier2-rewire.test.tsx` and `src/__tests__/parity.test.ts`
  after a 7.5-minute run. No test in those files failed; the warnings are
  worker startup timeouts on a Windows + jsdom forks pool, not assertions.
  Full baseline log:
  `.playwright-cli/fork-test-baseline.log`.
- `npm run build:lib` (Vite lib build + `unplugin:dts`): **succeeded in
  34.52s**, 110 modules transformed, dist written. Full baseline log:
  `.playwright-cli/fork-buildlib-baseline.log`.

### EMR — focused existing odontogram and treatment-plan suites

- `npx vitest run src/lib/odontogram src/lib/treatment-plan`: **2 files
  passed / 22 tests passed.**
- `npx vitest run` (full unit suite): **128 files passed / 1292 tests
  passed.** Note: the prior `docs/AI_HANDOFF.md` recorded
  `127 files / 1285 tests` with five pre-existing failures in
  `scripts/boundary-privilege-invariant.test.mjs` (fixture omits the B6
  terminal RPC grants). Today's run is clean across all 128 files because
  the B6/B7/B8–B11 work has added 7 new test files / 7 new tests and
  corrected the boundary fixture, leaving the previously missing B6 grants
  in `approved-final-grants.mjs` matched. Full baseline log:
  `.playwright-cli/emr-full-unit-baseline.log`.
- pgTAP for the existing odontogram / treatment-plan domain is not
  included in the O0 scope; the legacy `scripts/run-local-database-tests.mjs`
  entry point is intentionally bypassed per the pre-existing
  `seed_security_fixtures` residual recorded in the user's authorization
  message. The first migration that requires pgTAP evidence is O2
  (`odontogram_domain_expansion.test.sql`), per the plan.

## Boundary decisions

Recorded in `docs/decisions/ADR-028-odontogram-renderer-domain-boundary.md`.
Key points:

- PostgreSQL/Supabase is the system of record; renderer is a projection.
- FDI is canonical; Universal/Palmer are display conversions.
- No new runtime dependency is added. The fork's
  `dompurify` / `jspdf` / `@types/fhir` are not installed.
- The fork's demo application, Classic renderer, localStorage persistence,
  FHIR R4 export/import, PDF export, tour, theme/language controls, and
  demo build/deployment infrastructure are excluded.
- Bridge, implant, and periodontal data become first-class relational
  structures with append-only history; FINAL rows are immutable;
  amendments are new DRAFT rows that supersede in a single transaction;
  voids and resolutions are append-only events.
- Correction writes are OWNER/ADMIN-only by default; the precise
  permission contract is fixed at O5.

## Excluded content (in scope of the O0 review but not a source input)

- Untracked `.learnings/`, `.playwright-cli/`, `.superpowers/`,
  `output/playwright/`, and similar output directories in the fork
  working tree. Treated as out of scope by the plan.
- Tracked modifications that resolve only to CRLF/LF line-ending
  differences under `git diff --ignore-space-at-eol --ignore-cr-at-eol`.
  The semantic content of `package-lock.json`, the FHIR parity golden,
  and the roundtrip parity golden is identical to the pinned commit; the
  diff is line-ending noise from the Windows checkout.

## Migration sequence reservation

- Reserved odontogram migration numbers (post-billing): `20260828020000`,
  `20260828020100`, `20260828020200`, `20260828020300`,
  `20260828020350`, `20260828020400`, `20260828020401`. As of this O0
  evidence, no file in `supabase/migrations/` matches any of these
  numbers. No silent renumbering is permitted; the plan's stop-and-revise
  rule applies.

## Acceptance gate

On 2026-08-29 the project owner confirmed the following and authorized local
O1-O14 completion under ADR-029:

1. The fork pin `5e28d931feefe4c3382513dbb0f5a9db9cf9948c` is accepted.
2. The boundary decisions in ADR-028 are accepted.
3. The pre-existing `seed_security_fixtures` residual in the local
   database and the deferred full `test:db:local` runner are accepted as
   known O0 obstacles; O2 will rely on direct focused pgTAP, not the
   broken full runner.
4. Local transient Playwright artifacts remain out of source control and must
   be cleaned or ignored before the checkpoint is accepted.

This re-acceptance does not waive Cloud TEST, independent release review, or
production security gates.
