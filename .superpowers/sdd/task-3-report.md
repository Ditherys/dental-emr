# Task 3 Report — O2 Clinical Detail Persistence

Date: 2026-08-30
Base: `02f051cddc19b99fe66b7bef8937a3ff435f06a3`

## Implementation

- Added tenant-scoped, RLS-enabled, zero-grant `tooth_clinical_entry_details`, with a composite tenant FK, one-detail-per-entry uniqueness, bounded JSON, and discriminated feature checks.
- Added renderer-independent Zod validation and `ClinicalFeatureDetail` input typing. The existing O5 RPC call derives its clinical code from validated detail.
- Added and registered pgTAP coverage; regenerated database types locally.

## TDD evidence

RED: the focused service test failed because the old DTO required `clinicalCode` and rejected `detail`/`idempotencyKey`.

GREEN: `npx vitest run src/lib/odontogram/service.test.ts` passed after strict feature-detail validation and service mapping.

## Verification

- `npm run db:migrate:local` — PASS (guarded local forward migrations; no reset)
- `npm run db:types:local` and `npm run db:types:check -- --local` — PASS
- `npm run test:db:local` — PASS
- `npx vitest run src/lib/odontogram` — PASS (10 files, 148 tests)
- `npm run typecheck`, `npm run security:migrations`, `git diff --check` — PASS

## Self-review / concerns

- `20260830010001_odontogram_feature_details_code_compatibility.sql` is a required forward correction after the first O2 migration was already applied locally; it retains existing `EXTRACTION` and `IMPLANT` execution codes. No applied migration was rewritten.
- The detail table deliberately has no browser grant or direct-write service path. A later narrow audited RPC must create detail rows atomically with clinical entries.
- Cloud TEST is deferred under ADR-029.
