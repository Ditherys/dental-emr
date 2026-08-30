# Task 10 (O8/O9) implementation report

## Status

Implementation is ready for independent review. The UI completion flow is
mounted only for server-authorized, open/in-progress cases.

## Implemented

- Forward-only O8 completion migrations `20260830010418` through `20260830010429`, including RLS/no table grants, provider derivation, idempotency, explicit finding-resolution links, immutable execution completion, completion context, approved final RPC grant registration, pre-charge immutable-materialization guards, and the clinical detail/extraction repair.
- Structured treatment-plan fields replace drawing UI/types/includes; legacy drawing response fields are explicitly transformed at the read boundary rather than broadly stripped.
- `PlanModePanel` confirmation component and focused tests: patient, procedure, date, signed-in dentist, selected findings, exact PHP amount; it has no provider selector or payment collection control.
- `completeTreatmentAction` has server authorization for clinical write plus billing charge; completion input contains no provider identity.
- New registered pgTAP fixture proves selected-only resolution, unchanged acknowledged plan JSON, exact retry result, rollback on invalid downstream bridge validation, and linked execution completion.
- Added `get_treatment_plan_completion_context`: an authenticated, security-definer
  DTO that derives the acknowledged patient, signed-in active dentist, server
  service date, unresolved patient findings, and only OPEN/IN_PROGRESS case
  versions from trusted rows. It requires clinical read/write plus billing.charge;
  it grants no base-table privilege.
- `TreatmentPlanSection` loads that context only when clinical write is available,
  mounts `PlanModePanel` per returned case, and sends the authoritative
  case/item/version with a generated idempotency key to `completeTreatmentAction`.
  Clinical completions require explicitly selected detail values; bridge and
  implant completions use the frozen plan design. There is no provider selector,
  payment form, placeholder action, drawing UI, or drawing server action.
- Added the missing ordinal implant completion schema used by the database chain
  normalizer and a forward idempotency repair: the durable replay record now
  fingerprints case/item/version/findings/amount/payload. Reusing a key for a
  different case or payload returns `idempotency conflict` rather than another
  case's result.
- Current bridge and implant materialization now retain a source link to their
  immutable PLAN_DESIGN records. The atomic pgTAP fixture includes a synthetic
  bridge design and proves the CURRENT bridge preserves that source ID.
- A plan-linked completion now locks its materialization contract and relevant
  PLAN_DESIGN row, scopes the design to the case patient and item plan, and
  rejects a changed bridge/implant payload before `post_charge`. Clinical
  completion is constrained to the contract tooth and an explicit safe mapping:
  ROOT_CANAL -> ROOT_CANAL, CROWN -> RESTORATION with crown type, and generic
  OTHER -> RESTORATION or OTHER; unsupported extraction completion is rejected.
- Planned extraction now uses the canonical, renderer-independent payload
  `{ code: "TOOTH_STATE", state: "EXTRACTION_WOUND" }`, which materializes an
  `EXTRACTION` clinical entry with no unsupported feature-detail row. Detail
  bearing clinical completions persist the matching required `feature_code`.

## Verification

- `npm run db:migrate:local`: forward-applied local migrations 10423–10429; no reset.
- `npm run test:db:local`: the updated atomic suite passed after migration
  10429, as did all suites before the existing `treatment_plans.test.sql`
  completion-marker residual.
- `npm run test:unit -- src/lib/treatment-plan src/components/odontogram 'src/app/(emr)/patients/[patientId]/treatment-plan-section.test.tsx'`: 15 files / 83 tests passed.
- `npm run typecheck`: passed.
- `npm run security:migrations`: passed after adding the final-grant registry entry.
- `git diff --check`: passed (only line-ending warnings emitted).

## Residual gates

1. Investigate the unrelated `treatment_plans.test.sql` completion-marker failure before treating the full local DB suite as green.
2. Cloud TEST, E2E/responsive/accessibility, advisor, full release review, and
   final owner acceptance remain deferred mandatory gates under ADR-029.
