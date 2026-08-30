# Task 6 Report — O5 permission, RPC, provider, and idempotency boundary

Date: 2026-08-30

## Implemented O5 evidence

- Current bridge and implant browser DTOs are provider-free. The final implant
  contract requires `chargeId`, optional `occurredAt`, and `idempotencyKey`.
- `record_current_implant_component_v3` is the exact six-argument,
  charge-linked RPC. It resolves the active linked provider server-side;
  client `treatingProviderId` and `executedAt` are rejected by strict input
  schemas.
- Generated database types, the service RPC call, server action, and implant
  workflow all use that exact contract. No RPC-name cast remains.
- The permission contract grants only
  `record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,uuid,text)`
  to `authenticated` and explicitly denies the retired five-argument overload.
  Provider-accepting legacy signatures remain revoked. No base-table,
  service-role, anon, or PUBLIC execute grant was introduced.
- The existing durable actor/organization/key idempotency table is preserved.
  pgTAP covers implant v3 creation, repeat identity, changed-fingerprint
  conflict, authorization denials, and graph rollback. A local two-session
  runner sends the same request/key concurrently and proves one canonical
  implant component and idempotency row.

## Local verification

- `npm run db:migrate:local` — PASS (up to date; no reset or hosted write).
- `npm run db:types:local` — PASS.
- `npm run security:migrations` — PASS.
- Focused service/action Vitest — PASS (29 tests).
- `npm run typecheck` — PASS.
- `git diff --check` — PASS.
- `npm run test:db:local` — all O5 suites, including
  `odontogram_permission_contract` and `odontogram_rpcs_v2`, PASS; the runner
  subsequently stops at the pre-existing `treatment_plans.test.sql` sentinel.

Cloud TEST and release acceptance remain pending; local completion does not
authorize production use.
