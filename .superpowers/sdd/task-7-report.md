# Task 7 report — O8 follow-up repair

This report supersedes the earlier pre-review completion claim.

Forward-only local migrations `20260830010406` through `20260830010409` add durable, RLS-protected replay records for schedule and payment writes. They retain normalized JSON request fingerprints and canonical schedule results. A narrow request-key serialization wrapper makes exact same-key create/lifecycle retries wait and replay rather than reaching a duplicate-key or invalid-state path. Changed requests using the same key fail with `22023`. Payment retries use a parallel receipt-operation record; payment ledger rows remain append-only and `received_by` remains `auth.uid()`-derived.

The lifecycle writer now validates raw amended row shapes, calendar dates, centavo bounds, and a trimmed bounded reason with `22023`. It writes bounded billing audit events for create and lifecycle actions. Schedule base tables and replay tables retain zero browser/service-role grants; only the three reviewed RPCs are restored to `authenticated` in registered grant-terminal migrations.

The treatment-plan writer now supplies the trusted `procedureCaseId` rather than a plan item ID. The installment confirmation validates every row before formatting with `BigInt`.

Fresh local evidence:

- `npm run db:migrate:local` applied the forward-only chain through `20260830010409`.
- `npm run db:types:local` regenerated `src/types/database.generated.ts`.
- `npm run security:migrations` passed (247 migrations; 72 grant terminals; 367 approved final privileges).
- Direct local pgTAP schedule suite passes after the new chain.
- Focused Vitest: 7 files / 70 tests passed.
- `npm run typecheck` passed.

Residual: the focused pgTAP suite currently proves replay-boundary catalog/security invariants; an independent reviewer should expand synthetic actor/fixture execution and the external two-session concurrency probe before final release acceptance. Cloud TEST remains required and deferred under ADR-029.
