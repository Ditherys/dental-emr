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

Follow-up evidence: migrations `20260830010410`–`20260830010414` correct amendment ordering (predecessor cancellation precedes successor insert), use organization+actor+key serialization, repair the emitted regex/audit metadata, and remove the mistakenly retained historical one-to-one constraint. Migration `20260830010415` adds the ADR-030 `DENTIST:payment.record` role grant while the payment RPC continues to require clinical read access for dentist actors. The focused synthetic pgTAP fixture now exercises create replay/conflict, amend history/replay, cancel, complete, cross-tenant denial, allocation non-mutation, dentist payment authorization/actor derivation, dentist clinical-read denial, and receptionist payment authorization (20/20 behavioral assertions in the 24-test suite). The generated relationship metadata marks schedules-to-procedure-cases as many-to-one.

Additional local evidence:

- `npm run db:migrate:local` applied `20260830010415_dentist_payment_record_permission.sql`.
- `supabase/tests/procedure_installment_schedules_concurrency.local.mjs` runs two authenticated sessions for one OWNER through active branches A and B with the same key. Because branch is part of the normalized request fingerprint, exactly one request commits and the other receives the expected `22023` idempotency conflict; the test proves one schedule exists for the case and no raw unique violation occurs.
- The local runner imports and executes the concurrency probe after the existing billing and odontogram probes.
- Focused local pgTAP suites `procedure_installment_schedules.test.sql` and `billing_permission_contract.test.sql`, `npm run security:migrations`, `npm run lint`, and `npm run typecheck` pass.

Residual: Cloud TEST, authenticated E2E, responsive/accessibility, advisor, and security gates remain deferred under ADR-029. The full local database runner retains the previously documented unrelated baseline treatment-plan residual and has not been claimed as a clean full-suite pass.
