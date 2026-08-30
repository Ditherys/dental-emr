# Odontogram and Longitudinal Dental Record Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Proposed — requires independent review and explicit project-owner execution approval

**Goal:** Replace the buggy patient odontogram workspace with the controlled fork's measured clinical behavior, backed by a complete chronological treatment, procedure-balance, installment, import/export, and clinical-photo record.

**Architecture:** Rebuild the renderer adapter and patient workspace while preserving PostgreSQL/Supabase as the canonical system of record. Add only renderer-independent, organization-scoped clinical structures; use narrow audited RPCs, the existing append-only billing ledger, and the existing S3 abstraction. Execute as guarded forward-only O1-O14 checkpoints on `main`; never reset the database.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, TypeScript strict, Tailwind CSS, shadcn/ui, Lucide, Zod 4, Supabase/PostgreSQL, pgTAP, Vitest/Testing Library, Playwright/axe, MinIO locally, Cloudflare R2 in production, and the project-controlled `Ditherys/React-Odontogram-Modul` fork pinned to `5e28d931feefe4c3382513dbb0f5a9db9cf9948c`.

## Global Constraints

- Work on `main`; do not create a branch or worktree.
- The approved design is `docs/superpowers/specs/2026-08-30-odontogram-clinical-record-revamp-design.md`.
- Before implementation, amend the conflicting odontogram O12/ADR-029 language and the billing dentist-payment permission contract.
- Organization is the tenant boundary; branch is operational context inside one organization.
- Never trust client-supplied organization, actor, provider, uploader, collector, role, or audit identity.
- Every exposed tenant table requires RLS, zero unsafe browser base-table DML, application authorization, and narrow audited RPCs.
- All `SECURITY DEFINER` functions use `set search_path = ''`, default revoke, exact terminal grants, and schema-qualified names.
- Existing migrations are immutable. Add guarded forward migrations only; `npm run db:reset:local` is prohibited.
- Clinical/legal finalized records and financial ledger rows are append-only; corrections are attributed amendments, reversals, voids, or replacements.
- Monetary values are PHP integer centavos represented as `bigint` in PostgreSQL and base-10 digit strings in JSON/forms; never use JavaScript `number` for money.
- The treating provider and payment recorder are derived from authenticated server context.
- The Classic renderer, Reset Mouth, Reset Tooth, drawing authoring, fork demo/localStorage persistence, and arbitrary runtime plugins are absent.
- Preserve the controlled fork MIT notice and exact reviewed pin. Do not replace it with npm/upstream/another renderer.
- MinIO remains local object storage and R2 remains production storage behind `src/lib/storage/`; do not add Cloudinary.
- Clinical originals remain private and immutable; derivatives use only `thumbnail`, `preview`, and `display` variants.
- Use deterministic synthetic fixtures only. Never expose real clinical data, original filenames, image bytes, tokens, or presigned URLs in logs/test artifacts.
- Read the relevant Next.js 16 guide in `node_modules/next/dist/docs/` immediately before implementing any Server Action or Route Handler.
- Cloud TEST, hosted authenticated E2E, responsive/accessibility, advisor, and security gates remain mandatory before release. Local O14 is not production approval.

## Planned File Structure

### Canonical odontogram domain

- Modify `src/lib/odontogram/clinical-codes.ts` — complete controlled vocabulary.
- Create `src/lib/odontogram/feature-contract.ts` — exhaustive fork-to-canonical mapping.
- Create `src/lib/odontogram/chart-projection.ts` — canonical DTO to renderer state.
- Create `src/lib/odontogram/progress-record.ts` — typed chronological event projection.
- Modify `src/lib/odontogram/schema.ts`, `types.ts`, `service.ts`, and `errors.ts` — bounded server contracts.
- Keep `src/lib/odontogram/fhir-candidates.ts` only until the reviewed interchange module replaces it.

### Treatment and billing

- Modify `src/lib/treatment-plan/schema.ts`, `src/lib/treatment-plan/types.ts`, `src/lib/treatment-plan/service.ts`, and `src/lib/treatment-plan/execution.ts` — structured plan details and procedure-case execution.
- Modify `src/lib/billing/schema.ts`, `src/lib/billing/types.ts`, and `src/lib/billing/service.ts` — installment schedules and bounded dentist payment path.
- Modify patient billing/treatment actions and components under `src/app/(emr)/patients/[patientId]/`.

### Renderer and workspace

- Rewrite `src/components/odontogram/measured-chart.tsx`, `measured-tooth.tsx`, `overlay-registry.ts`, `odontogram-toolbar.tsx`, and `tooth-inspector.tsx`.
- Create `src/components/odontogram/current-status-panel.tsx`, `src/components/odontogram/plan-mode-panel.tsx`, `src/components/odontogram/progress-record-table.tsx`, `src/components/odontogram/odontogram-settings.tsx`, `src/components/odontogram/odontogram-help.tsx`, `src/components/odontogram/import-review-dialog.tsx`, and `src/components/odontogram/export-menu.tsx`.
- Evolve `src/app/(emr)/patients/[patientId]/odontogram-section.tsx` into the patient-scoped orchestrator.

### Clinical media

- Create `src/lib/clinical-media/schema.ts`, `src/lib/clinical-media/types.ts`, `src/lib/clinical-media/service.ts`, `src/lib/clinical-media/processor.ts`, and `src/lib/clinical-media/filename.ts`.
- Create `src/app/(emr)/patients/[patientId]/photos/clinical-photo-gallery.tsx`, `src/app/(emr)/patients/[patientId]/photos/photo-upload-dialog.tsx`, `src/app/(emr)/patients/[patientId]/photos/before-after-compare.tsx`, and `src/app/(emr)/patients/[patientId]/photos/actions.ts`.
- Create server-only processing under `src/lib/clinical-media/processor.ts`; do not process image bytes in client state beyond upload/authorized display.

### Interchange and print

- Create `src/lib/odontogram/interchange/json.ts`, `src/lib/odontogram/interchange/fhir.ts`, `src/lib/odontogram/interchange/staging.ts`, and `src/lib/odontogram/interchange/export-audit.ts`.
- Create `src/app/(emr)/patients/[patientId]/odontogram/interchange/import/route.ts` and `src/app/(emr)/patients/[patientId]/odontogram/interchange/export/route.ts`.
- Create `src/app/(emr)/patients/[patientId]/odontogram/print/page.tsx`.

### Forward migrations

Create, in this exact order:

1. `supabase/migrations/20260830010000_odontogram_feature_details.sql`
2. `supabase/migrations/20260830010100_procedure_cases_and_plan_details.sql`
3. `supabase/migrations/20260830010200_odontogram_revamp_permission_contract.sql`
4. `supabase/migrations/20260830010300_odontogram_revamp_rpcs.sql`
5. `supabase/migrations/20260830010301_odontogram_revamp_rpcs_grants.sql`
6. `supabase/migrations/20260830010400_procedure_installment_schedules.sql`
7. `supabase/migrations/20260830010500_clinical_photographs.sql`
8. `supabase/migrations/20260830010600_clinical_photo_rpcs.sql`
9. `supabase/migrations/20260830010601_clinical_photo_rpcs_grants.sql`
10. `supabase/migrations/20260830010700_odontogram_import_staging.sql`
11. `supabase/migrations/20260830010800_odontogram_interchange_and_progress_rpcs.sql`
12. `supabase/migrations/20260830010801_odontogram_interchange_and_progress_grants.sql`
13. `supabase/migrations/20260830010900_odontogram_drawing_retirement.sql`
14. `supabase/migrations/20260830011000_odontogram_revamp_terminal_grants.sql`

---

### Task 1: Amend the Authoritative Contracts Before Code

**Files:**
- Modify: `docs/specs/odontogram-integration.md`
- Modify: `docs/plans/odontogram-integration-plan.md`
- Modify: `docs/specs/billing-ledger-provider-compensation.md`
- Modify: `docs/plans/billing-ledger-provider-compensation-plan.md`
- Modify: `docs/decisions/ADR-026-billing-ledger-provider-compensation.md`
- Create: `docs/decisions/ADR-030-odontogram-longitudinal-record-revamp.md`
- Modify: `docs/AI_HANDOFF.md`

**Interfaces:**
- Consumes: approved design specification and ADR-029 local-only boundary.
- Produces: an accepted authority chain for revised O1-O14, dentist `payment.record`, O12 interchange/media, and guarded drawing retirement.

- [ ] **Step 1: Write the decision amendment**

Add ADR-030 with these normative decisions:

```markdown
## Decision

1. Rebuild the odontogram workspace/adapter while preserving canonical clinical,
   ledger, tenancy, audit, and file foundations.
2. Amend O12 to include staged FHIR/JSON import, authorized FHIR/JSON/PDF/SVG/PNG
   output, and private clinical photographs.
3. Grant DENTIST `payment.record` only for an already clinically authorized
   patient and an active permitted receiving branch; preserve all cross-branch
   allocation checks and deny adjustment/refund/void/analytics by default.
4. Retire drawing UI/writes immediately. Physical drawing-table cleanup is a
   guarded O13 forward migration that fails on unrecognized data.
5. Preserve ADR-029's local-only completion and deferred Cloud TEST gate.
```

- [ ] **Step 2: Amend the accepted specs and O12/O14 matrices**

Replace the old O12 exclusion with the exact four-stage contract: staged import,
authorized export, private photo gallery, and chronological progress projection.
Add the bounded dentist payment permission and the new migration list.

- [ ] **Step 3: Verify the documents do not conflict**

Run:

```powershell
rg -n "Do not add fork JSON|no FHIR/import/export|DENTIST.*billing.read only|drawing canvas" docs/specs docs/plans docs/decisions
git diff --check
```

Expected: no still-authoritative prohibition conflicts with ADR-030; historical
records may remain quoted only when explicitly marked superseded.

- [ ] **Step 4: Commit the authority checkpoint**

```powershell
git add docs/specs/odontogram-integration.md docs/plans/odontogram-integration-plan.md docs/specs/billing-ledger-provider-compensation.md docs/plans/billing-ledger-provider-compensation-plan.md docs/decisions/ADR-026-billing-ledger-provider-compensation.md docs/decisions/ADR-030-odontogram-longitudinal-record-revamp.md docs/AI_HANDOFF.md
git commit -m "docs: authorize odontogram longitudinal record revamp"
```

### Task 2: O1 — Complete the Renderer-Independent Feature Contract

**Files:**
- Modify: `src/lib/odontogram/clinical-codes.ts`
- Create: `src/lib/odontogram/feature-contract.ts`
- Create: `src/lib/odontogram/feature-contract.test.ts`
- Create: `src/lib/odontogram/chart-projection.ts`
- Create: `src/lib/odontogram/chart-projection.test.ts`
- Modify: `src/lib/odontogram/state.ts`
- Modify: `src/lib/odontogram/state.test.ts`

**Interfaces:**
- Consumes: existing `ClinicalEntry`, bridge, implant, perio, dentition, restoration, endodontic, and prosthesis vocabularies.
- Produces: `ClinicalFeatureCode`, `ClinicalFeatureDetail`, `ToothRenderState`, `FEATURE_CONTRACT`, and `projectPatientChart(dto)`.

- [ ] **Step 1: Write failing exhaustiveness and transition tests**

```ts
it.each([
  "MISSING", "EXTRACTION_WOUND", "IMPLANT", "ROOT_CANAL",
  "CARIES", "RESTORATION", "CROWN", "ORTHODONTIC", "PERIAPICAL_LESION",
] as const)("maps %s to one canonical detail and renderer layer", (code) => {
  expect(FEATURE_CONTRACT[code].canonicalTable).toBeTruthy();
  expect(FEATURE_CONTRACT[code].rendererLayers.length).toBeGreaterThan(0);
});

it("renders a fixture instead of natural anatomy after missing -> implant", () => {
  const tooth = projectPatientChart(missingThenImplantFixture).teeth.get(11)!;
  expect(tooth.anatomy).toBe("IMPLANT_FIXTURE");
  expect(tooth.showNaturalCrown).toBe(false);
});

it("keeps crown anatomy and adds a root-fill layer for completed endodontics", () => {
  const tooth = projectPatientChart(rootCanalFixture).teeth.get(11)!;
  expect(tooth.rootTreatment).toBe("COMPLETE");
  expect(tooth.layers).toContain("ROOT_FILL_COMPLETE");
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `npm run test:unit -- src/lib/odontogram/feature-contract.test.ts src/lib/odontogram/chart-projection.test.ts`

Expected: FAIL because the new contract/projection modules do not exist.

- [ ] **Step 3: Implement the exhaustive discriminated unions**

```ts
export type ClinicalFeatureDetail =
  | { code: "CARIES"; depth: "ENAMEL" | "DENTIN" | "PULPAL"; icdas: 0|1|2|3|4|5|6|null; cars: string|null; radiographicDepth: string|null }
  | { code: "RESTORATION"; restorationType: RestorationType; material: RestorationMaterial | FillingMaterial; marginalLeakage: boolean }
  | { code: "ROOT_CANAL"; state: Exclude<EndoState, "none"> }
  | { code: "TOOTH_STATE"; state: "PRESENT"|"MISSING"|"EXTRACTION_WOUND"|"SUBGINGIVAL"|"RADIX"|"BROKEN"|"CROWN_PREPARATION" }
  | { code: "ORTHODONTIC"; appliance: "BRACKET"|"BAND"; movement: "DRIFT"|"INTRUSION"|"EXTRUSION"|"ROTATION"|null }
  | { code: "OTHER"; controlledCode: string };

export interface ToothRenderState {
  fdi: number;
  anatomy: "NATURAL" | "MISSING" | "EXTRACTION_WOUND" | "IMPLANT_FIXTURE" | "IMPLANT_ABUTMENT" | "IMPLANT_CROWN";
  showNaturalCrown: boolean;
  rootTreatment: "NONE" | "MEDICAMENT" | "COMPLETE" | "INCOMPLETE";
  current: readonly ClinicalFeatureDetail[];
  planned: readonly ClinicalFeatureDetail[];
  layers: readonly string[];
}

export type RendererLayer = ToothRenderState["layers"][number];
export type FeatureContractRow = {
  canonicalTable: "tooth_clinical_entries"|"dental_bridges"|"dental_implant_components"|"periodontal_examinations";
  rendererLayers: readonly RendererLayer[];
};
```

Make `FEATURE_CONTRACT` satisfy `Record<ClinicalFeatureCode, FeatureContractRow>`
so TypeScript fails when any reviewed fork feature has no mapping.

- [ ] **Step 4: Run the O1 test gate**

Run: `npm run test:unit -- src/lib/odontogram/clinical-codes.test.ts src/lib/odontogram/state.test.ts src/lib/odontogram/feature-contract.test.ts src/lib/odontogram/chart-projection.test.ts`

Expected: PASS; modules have no React, DOM, Supabase, storage, FHIR, or fork-global imports.

- [ ] **Step 5: Commit O1**

```powershell
git add src/lib/odontogram
git commit -m "feat: complete canonical odontogram feature contract"
```

### Task 3: O2 — Expand Clinical Detail Persistence

**Files:**
- Create: `supabase/migrations/20260830010000_odontogram_feature_details.sql`
- Create: `supabase/tests/odontogram_feature_details.test.sql`
- Modify: `src/lib/odontogram/schema.ts`
- Modify: `src/lib/odontogram/types.ts`
- Modify: `src/lib/odontogram/service.ts`
- Modify: `src/lib/odontogram/service.test.ts`
- Modify: `src/types/database.generated.ts` through the generator only.

**Interfaces:**
- Consumes: `ClinicalFeatureDetail` from Task 2.
- Produces: organization-safe `tooth_clinical_entry_details` rows and `RecordToothClinicalEntryInput.detail`.

- [ ] **Step 1: Write failing pgTAP constraints**

```sql
select extensions.ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.tooth_clinical_entry_details'::regclass),
  'clinical details enforce RLS'
);
select extensions.throws_ok(
  $$insert into public.tooth_clinical_entry_details
      (organization_id, entry_id, feature_code, detail)
    values (:org_a, :entry_b, 'ROOT_CANAL', '{"state":"COMPLETE"}')$$,
  '23503', null, 'cross-tenant detail linkage is rejected'
);
```

- [ ] **Step 2: Run the new pgTAP file and verify failure**

Run: `npm run db:start:local; npm run db:migrate:local; npm run db:provision:local; npm run test:db:local`

Expected: the new test fails because the details table/migration is absent. Never run `db:reset:local`.

- [ ] **Step 3: Add the constrained one-to-one detail table**

```sql
create table public.tooth_clinical_entry_details (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entry_id uuid not null,
  feature_code text not null,
  detail jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint tooth_clinical_entry_details_entry_fk foreign key (organization_id, entry_id)
    references public.tooth_clinical_entries(organization_id, id) on delete restrict,
  constraint tooth_clinical_entry_details_entry_key unique (organization_id, entry_id),
  constraint tooth_clinical_entry_details_object_check check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 4096)
);
revoke all on public.tooth_clinical_entry_details from public, anon, authenticated, service_role;
alter table public.tooth_clinical_entry_details enable row level security;
```

Add feature-code-specific database checks for allowed keys/ranges and validate
the same discriminated union with Zod before the RPC. Expand the parent
`clinical_code` constraint forward-only; do not rewrite the O2 migration.

- [ ] **Step 4: Extend DTO parsing and service tests**

```ts
export const recordToothClinicalEntryInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  toothCode: toothCodeSchema,
  surfaces: z.array(toothClinicalSurfaceSchema).min(1).max(7),
  kind: clinicalKindSchema,
  status: clinicalStatusSchema,
  detail: clinicalFeatureDetailSchema,
  notes: boundedNullableText(2000),
  occurredAt: isoTimestamp.optional(),
  idempotencyKey: idempotencyKeySchema,
}).strict();
```

- [ ] **Step 5: Verify and commit O2**

Run: `npm run test:db:local; npm run db:types:local; npm run test:unit -- src/lib/odontogram; npm run typecheck`

Expected: PASS and `src/types/database.generated.ts` matches the local schema.

```powershell
git add supabase/migrations/20260830010000_odontogram_feature_details.sql supabase/tests/odontogram_feature_details.test.sql src/lib/odontogram src/types/database.generated.ts
git commit -m "feat: persist complete odontogram clinical details"
```

### Task 4: O2/O8 — Procedure Cases and Structured Plan Details

**Files:**
- Create: `supabase/migrations/20260830010100_procedure_cases_and_plan_details.sql`
- Create: `supabase/tests/procedure_cases_and_plan_details.test.sql`
- Modify: `src/lib/treatment-plan/schema.ts`
- Modify: `src/lib/treatment-plan/types.ts`
- Modify: `src/lib/treatment-plan/service.ts`
- Modify: `src/lib/treatment-plan/execution.ts`
- Modify: `src/lib/treatment-plan/service.test.ts`
- Modify: `src/lib/treatment-plan/execution.test.ts`

**Interfaces:**
- Produces: `procedure_cases`, `procedure_case_events`, `TreatmentPlanItem.priority`, `sequence`, `surfaces`, `notes`, and `procedureCaseId` links used by chronology, charge, follow-up, and photos.

- [ ] **Step 1: Write failing case-isolation and frozen-plan tests**

```sql
select extensions.throws_ok(
  $$insert into public.procedure_cases (organization_id, patient_id, branch_id, procedure_id, opened_by)
    values (:org_a, :patient_b, :branch_a, :procedure_a, :user_a)$$,
  '23503', null, 'a case cannot cross tenant patient ownership'
);
select extensions.throws_ok(
  $$update public.treatment_plan_items set notes = 'changed' where id = :acknowledged_item$$,
  'P0001', 'treatment_plan_items are immutable when parent plan is PRESENTED/ACKNOWLEDGED',
  'acknowledged structured plan details remain frozen'
);
```

- [ ] **Step 2: Add normalized case/event and plan columns**

```sql
create table public.procedure_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  patient_id uuid not null,
  origin_branch_id uuid not null,
  procedure_id uuid not null,
  treatment_plan_item_id uuid,
  charge_id uuid,
  opened_by uuid not null,
  opened_at timestamptz not null,
  status text not null check (status in ('OPEN','COMPLETED','CANCELLED')),
  version integer not null default 1 check (version > 0),
  unique (organization_id, id),
  unique (organization_id, treatment_plan_item_id),
  unique (organization_id, charge_id)
);
```

Add same-organization composite FKs, RLS, deny-by-default grants, indexes on
`(organization_id, patient_id, opened_at, id)` and `(organization_id, charge_id)`.
Add `priority`, `sequence_no`, `surfaces text[]`, and `notes` to plan items with
bounded checks. Create append-only `procedure_case_events` for treatment,
adjustment/follow-up, completion, cancellation, and correction events.

- [ ] **Step 3: Extend plan DTOs**

```ts
export const treatmentPrioritySchema = z.enum(["URGENT", "HIGH", "ROUTINE", "ELECTIVE"]);
export const planItemDetailFields = {
  priority: treatmentPrioritySchema,
  sequenceNo: z.number().int().min(1).max(999),
  surfaces: z.array(toothClinicalSurfaceSchema).max(7),
  notes: z.string().trim().max(4000).nullable(),
};
```

- [ ] **Step 4: Verify and commit the case model**

Run: `npm run test:db:local; npm run test:unit -- src/lib/treatment-plan; npm run typecheck`

Expected: PASS; one plan item/case/charge link cannot be attached across tenants.

```powershell
git add supabase/migrations/20260830010100_procedure_cases_and_plan_details.sql supabase/tests/procedure_cases_and_plan_details.test.sql src/lib/treatment-plan
git commit -m "feat: add procedure cases and structured treatment plans"
```

### Task 5: O3/O4 — Complete Relationship and Periodontal Domain Coverage

**Files:**
- Modify: `src/lib/odontogram/bridge.ts`
- Modify: `src/lib/odontogram/implant.ts`
- Modify: `src/lib/odontogram/perio.ts`
- Modify: `src/lib/odontogram/validation.ts`
- Modify: `src/lib/odontogram/bridge.test.ts`
- Modify: `src/lib/odontogram/implant.test.ts`
- Modify: `src/lib/odontogram/perio.test.ts`
- Modify: `src/lib/odontogram/validation.test.ts`
- Create: `supabase/tests/odontogram_revamp_relationship_perio.test.sql`
- Modify forward-only behavior through `20260830010300_odontogram_revamp_rpcs.sql`; do not edit applied O3/O4 migrations.

**Interfaces:**
- Produces: validated mixed-support bridges, immutable implant component chains, complete six-site/plaque/mobility/furcation inputs, and case-level periodontal classification inputs.

- [ ] **Step 1: Add failing domain tests**

```ts
it("rejects a pontic with a natural or implant support id", () => {
  expect(validateBridgeUnits([{ tooth_fdi: "12", ordinal: 1, role: "PONTIC", support_kind: "NATURAL_TOOTH", support_component_id: null }]).ok).toBe(false);
});

it("rejects Miller mobility for an implant-context site", () => {
  expect(validatePerioToothMeasurement({ toothFdi: "11", mobilityMiller: "M1", implantContext: true }).ok).toBe(false);
});
```

- [ ] **Step 2: Fill the fork parity gaps**

Add CEJ visibility, root concavity, gingival thickness, Miller recession,
plaque index, gingival index, stage/grade/extent source inputs, peri-implant
mucositis, and bounded bone-loss class only where persisted inputs exist.
Keep derived diagnoses reproducible and attribute controlled overrides.

- [ ] **Step 3: Add pgTAP relationship and finalization negatives**

Test cross-tenant component FKs, post-final child insert/update/delete denial,
amendment lineage, missing-tooth perio denial, implant furcation denial, and
atomic bridge/current-chain amendment under concurrency.

- [ ] **Step 4: Verify and commit O3/O4 domain work**

Run: `npm run test:unit -- src/lib/odontogram/bridge.test.ts src/lib/odontogram/implant.test.ts src/lib/odontogram/perio.test.ts src/lib/odontogram/validation.test.ts; npm run test:db:local`

Expected: PASS.

```powershell
git add src/lib/odontogram supabase/tests/odontogram_revamp_relationship_perio.test.sql
git commit -m "feat: complete odontogram relationship and perio rules"
```

### Task 6: O5 — Permission, RPC, Provider, and Idempotency Boundary

**Files:**
- Create: `supabase/migrations/20260830010200_odontogram_revamp_permission_contract.sql`
- Create: `supabase/migrations/20260830010300_odontogram_revamp_rpcs.sql`
- Create: `supabase/migrations/20260830010301_odontogram_revamp_rpcs_grants.sql`
- Create: `supabase/tests/odontogram_revamp_permission_contract.test.sql`
- Create: `supabase/tests/odontogram_revamp_rpcs.test.sql`
- Modify: `src/lib/odontogram/schema.ts`
- Modify: `src/lib/odontogram/types.ts`
- Modify: `src/lib/odontogram/service.ts`
- Modify: `src/lib/odontogram/errors.ts`
- Modify: `src/app/(emr)/patients/[patientId]/odontogram-actions.ts`
- Modify: `src/lib/odontogram/service.test.ts`
- Modify: `src/app/(emr)/patients/[patientId]/odontogram-actions.test.ts`

**Interfaces:**
- Produces: `record_tooth_clinical_entry_v3`, `record_direct_treatment_with_charge`, `record_procedure_followup`, `get_patient_odontogram_v3`, and provider-free client inputs.

- [ ] **Step 1: Write negative authorization tests first**

```sql
select extensions.throws_ok(
  $$select public.record_direct_treatment_with_charge(:branch_a, :patient_b, :procedure_a, '100000', '{}'::jsonb, :idem)$$,
  '42501', 'not authorized', 'Organization A dentist cannot treat Organization B patient'
);
select extensions.throws_ok(
  $$select public.record_current_implant_component(:branch_a, :patient_a, :foreign_provider, now(), null, '[]'::jsonb)$$,
  '42501', null, 'a caller cannot forge the treating provider'
);
```

- [ ] **Step 2: Remove provider identity from browser schemas**

```ts
export const recordCurrentBridgeInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  units: z.array(bridgeUnitSchema).min(2).max(16),
  occurredAt: isoTimestamp.optional(),
  idempotencyKey: idempotencyKeySchema,
}).strict();
```

Apply the same rule to implants and direct/planned completion. RPCs resolve
`providers.linked_user_id = auth.uid()` and verify active same-organization
branch assignment.

- [ ] **Step 3: Implement narrow RPCs with safe definer form**

```sql
declare
  v_actor_user_id uuid := (select auth.uid());
  v_organization_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_actor_user_id is null or v_organization_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;
```

Use that exact authorization prologue inside
`public.record_procedure_followup(uuid,uuid,text,timestamptz,text)`, then lock the
same-organization case `for update`, resolve the active provider through
`providers.linked_user_id = v_actor_user_id`, validate bounded notes/time and
idempotency, append one event and one audit row, and return only event ID/version.
Terminate the migration with:

```sql
revoke all on function public.record_procedure_followup(uuid,uuid,text,timestamptz,text)
from public, anon, authenticated, service_role;
```

The implemented body must use schema-qualified objects and return only bounded
IDs/version. The grants migration grants exact reviewed signatures to
`authenticated` and the grant registry.

- [ ] **Step 4: Add service/action contract tests**

Assert unknown keys, caller-supplied provider IDs, stale versions, duplicate
idempotency keys, foreign patients, and invalid branches fail. Assert action
errors expose only `NOT_AUTHORIZED`, `INVALID_INPUT`, `STALE_VERSION`,
`INVALID_STATE`, `CONFLICT`, or `FAILED`.

- [ ] **Step 5: Verify and commit O5**

Run: `npm run test:db:local; npm run security:migrations; npm run test:unit -- src/lib/odontogram 'src/app/(emr)/patients/[patientId]/odontogram-actions.test.ts'; npm run typecheck`

Expected: PASS with no unsafe base grants and no client provider field.

```powershell
git add supabase/migrations/20260830010200_odontogram_revamp_permission_contract.sql supabase/migrations/20260830010300_odontogram_revamp_rpcs.sql supabase/migrations/20260830010301_odontogram_revamp_rpcs_grants.sql supabase/tests/odontogram_revamp_permission_contract.test.sql supabase/tests/odontogram_revamp_rpcs.test.sql src/lib/odontogram 'src/app/(emr)/patients/[patientId]/odontogram-actions.ts' 'src/app/(emr)/patients/[patientId]/odontogram-actions.test.ts'
git commit -m "feat: harden odontogram mutation boundary"
```

### Task 7: O8 — Dentist Payments and Universal Installment Schedules

**Files:**
- Create: `supabase/migrations/20260830010400_procedure_installment_schedules.sql`
- Create: `supabase/tests/procedure_installment_schedules.test.sql`
- Modify: `supabase/tests/billing_permission_contract.test.sql`
- Modify: `supabase/tests/billing_authorization.test.sql`
- Modify: `src/lib/billing/schema.ts`
- Modify: `src/lib/billing/types.ts`
- Modify: `src/lib/billing/service.ts`
- Modify: `src/lib/billing/schema.test.ts`
- Modify: `src/lib/billing/service.test.ts`
- Modify: `src/app/(emr)/patients/[patientId]/billing-actions.ts`
- Modify: `src/app/(emr)/patients/[patientId]/billing-actions.test.ts`
- Modify: `src/app/(emr)/patients/[patientId]/procedure-payment-summary.tsx`
- Create: `src/app/(emr)/patients/[patientId]/installment-schedule-dialog.tsx`
- Create: `src/app/(emr)/patients/[patientId]/installment-schedule-dialog.test.tsx`

**Interfaces:**
- Produces: `InstallmentScheduleDTO`, `createProcedureInstallmentSchedule`, and a dentist-bounded `recordPaymentAction`.

- [ ] **Step 1: Write permission and allocation isolation failures**

```sql
select extensions.lives_ok(
  $$select public.record_payment(:dentist_branch, :authorized_patient, :cash_method, '250000', null, :idem)$$,
  'a dentist may record payment for an authorized patient at an active branch'
);
select extensions.throws_ok(
  $$select public.allocate_payment(:branch_a, :payment_a, :orthodontic_charge_b, :patient_a, '100000', :idem2)$$,
  '42501', null, 'a filling payment cannot mutate an inaccessible orthodontic charge'
);
```

- [ ] **Step 2: Implement installment expectations, not a second ledger**

```sql
create table public.procedure_installment_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  procedure_case_id uuid not null,
  version integer not null default 1,
  status text not null check (status in ('ACTIVE','COMPLETED','CANCELLED')),
  created_by uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, procedure_case_id)
);
```

Add append-only schedule items `(due_date, expected_centavos, ordinal)` and
schedule amendment events. Actual balance always comes from charge allocations;
schedule rows never post revenue or collection.

Expose the same shape in `src/lib/billing/types.ts`:

```ts
export type InstallmentScheduleDTO = {
  scheduleId: string;
  procedureCaseId: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  version: number;
  items: Array<{ ordinal: number; dueDate: string; expectedCentavos: string }>;
};
```

- [ ] **Step 3: Add bounded dentist payment authorization**

The application action must require `payment.record` at the receiving branch.
The RPC must additionally verify a DENTIST actor has current clinical access to
the patient and active branch assignment. It derives `recorded_by = auth.uid()`;
it never accepts a collector ID.

- [ ] **Step 4: Test money as strings and UI confirmation**

```ts
expect(recordPayment).toHaveBeenCalledWith({
  branchId, patientId, paymentMethodId,
  amountCentavos: "2500000",
  reference: null,
  idempotencyKey: expect.any(String),
});
```

Test procedure charge confirmation shows exact formatted PHP amount and that
payment allocation changes only the selected case balance. The installment
dialog records due date/expected amount rows for any procedure case and labels
them as expectations; it shows actual ledger allocations separately.

- [ ] **Step 5: Verify and commit billing extension**

Run: `npm run test:db:local; npm run test:unit -- src/lib/billing 'src/app/(emr)/patients/[patientId]/billing-actions.test.ts' 'src/app/(emr)/patients/[patientId]/procedure-payment-summary.test.tsx'; npm run typecheck`

Expected: PASS.

```powershell
git add supabase/migrations/20260830010400_procedure_installment_schedules.sql supabase/tests/procedure_installment_schedules.test.sql supabase/tests/billing_permission_contract.test.sql supabase/tests/billing_authorization.test.sql src/lib/billing 'src/app/(emr)/patients/[patientId]/billing-actions.ts' 'src/app/(emr)/patients/[patientId]/billing-actions.test.ts' 'src/app/(emr)/patients/[patientId]/procedure-payment-summary.tsx' 'src/app/(emr)/patients/[patientId]/installment-schedule-dialog.tsx' 'src/app/(emr)/patients/[patientId]/installment-schedule-dialog.test.tsx'
git commit -m "feat: support dentist payments and procedure installments"
```

### Task 8: O6 — Rebuild the Measured Renderer Adapter

**Files:**
- Rewrite: `src/components/odontogram/measured-chart.tsx`
- Rewrite: `src/components/odontogram/measured-tooth.tsx`
- Rewrite: `src/components/odontogram/overlay-registry.ts`
- Modify: `src/components/odontogram/measured-assets.ts`
- Modify: `src/components/odontogram/styles.css`
- Modify: `src/components/odontogram/renderer.test.tsx`
- Create: `src/components/odontogram/feature-parity.test.tsx`
- Create: `src/components/odontogram/odontogram-settings.tsx`
- Create: `src/components/odontogram/odontogram-settings.test.tsx`
- Create: `src/components/odontogram/odontogram-help.tsx`
- Create: `src/components/odontogram/odontogram-help.test.tsx`
- Modify: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Consumes: `ToothRenderState` and relationship projections from Tasks 2-6.
- Produces: `<MeasuredChart projection mode selectedFdi onSelect />` with no persistence or clinical mutation capability.

- [ ] **Step 1: Port fork regression fixtures as failing EMR tests**

```tsx
render(<MeasuredChart projection={missingProjection} mode="CURRENT" />);
expect(screen.getByTestId("tooth-11")).toHaveAttribute("data-anatomy", "MISSING");

rerender(<MeasuredChart projection={implantProjection} mode="CURRENT" />);
expect(screen.getByTestId("tooth-11")).toHaveAttribute("data-anatomy", "IMPLANT_FIXTURE");
expect(screen.getByTestId("tooth-11").querySelector('[data-layer="natural-crown"]')).toBeNull();
```

Add root canal, restoration material, planned/current patterns, bridge
abutment/pontic, primary/mixed dentition, and notation fixtures.

- [ ] **Step 2: Implement an allowlisted overlay registry**

```ts
export const OVERLAY_REGISTRY: Readonly<Record<RendererLayer, OverlayRenderer>> = {
  ROOT_FILL_COMPLETE: renderRootFillComplete,
  ROOT_FILL_INCOMPLETE: renderRootFillIncomplete,
  CARIES: renderCaries,
  RESTORATION: renderRestoration,
  PLANNED: renderPlannedPattern,
};
```

No dynamic import from user data, `dangerouslySetInnerHTML`, arbitrary SVG,
global fork state, localStorage, reset callback, or Classic path is allowed.

Implement FDI/Universal/Palmer, permanent/primary/mixed dentition, layer
visibility, label/density, language, and export preferences in
`odontogram-settings.tsx`. Persist only harmless user display preferences.
`odontogram-help.tsx` provides contextual keyboard/touch/charting guidance,
license/source credits, and uses the global EMR theme rather than a fork theme.

- [ ] **Step 3: Verify attribution and build**

Run: `npm run test:unit -- src/components/odontogram; npm run lint; npm run typecheck; npm run build; git diff --check`

Expected: PASS; MIT notice and pinned SHA remain present.

- [ ] **Step 4: Commit O6**

```powershell
git add src/components/odontogram THIRD_PARTY_NOTICES.md
git commit -m "feat: rebuild measured odontogram renderer"
```

### Task 9: O7 — Build Current Status Workspace and Chronological Record

**Files:**
- Rewrite: `src/app/(emr)/patients/[patientId]/odontogram-section.tsx`
- Create: `src/components/odontogram/current-status-panel.tsx`
- Create: `src/components/odontogram/procedure-followup-dialog.tsx`
- Create: `src/components/odontogram/progress-record-table.tsx`
- Create: `src/lib/odontogram/progress-record.ts`
- Modify: `src/components/odontogram/odontogram-toolbar.tsx`
- Modify: `src/components/odontogram/tooth-inspector.tsx`
- Create: `src/components/odontogram/current-status-panel.test.tsx`
- Create: `src/components/odontogram/procedure-followup-dialog.test.tsx`
- Create: `src/components/odontogram/progress-record-table.test.tsx`

**Interfaces:**
- Consumes: `PatientOdontogramDTO`, `ProgressEventDTO[]`, record/amend/void actions.
- Produces: patient-keyed Current Status UI and oldest-to-newest progress table.

- [ ] **Step 1: Write failing patient and chronology tests**

```tsx
expect(screen.getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
  expect.stringContaining("15 Aug 2026"),
  expect.stringContaining("30 Aug 2026"),
]);

rerender(<OdontogramSection patientId={patientB} {...propsB} />);
expect(screen.queryByText("Tooth 11 selected")).not.toBeInTheDocument();
```

Assert no Reset, Classic, drawing, provider picker, grouped case accordion, or
hover-only critical control appears.

- [ ] **Step 2: Implement the event DTO and columns**

```ts
export type ProgressEventDTO = {
  eventId: string;
  eventType: "FINDING"|"PLAN"|"TREATMENT"|"FOLLOWUP"|"CHARGE"|"PAYMENT"|"PERIO"|"PHOTO"|"IMPORT";
  occurredAt: string;
  recordedAt: string;
  procedureCaseId: string | null;
  toothCodes: string[];
  surfaces: ToothClinicalSurface[];
  actorDisplay: string;
  procedureDisplay: string | null;
  note: string | null;
  chargeCentavos: string | null;
  paymentCentavos: string | null;
  caseBalanceCentavos: string | null;
};
```

Use TanStack Table only if sorting/filtering complexity justifies it; default
order remains chronological ascending. Do not copy mutable balances into
clinical narrative.

Current Status includes direct/unplanned treatment and follow-up entry. The
follow-up dialog requires an existing procedure case, records occurred date and
notes, and defaults to no new charge. A new charge is possible only by invoking
the separate confirmed-procedure workflow.

- [ ] **Step 3: Implement dense responsive composition**

Desktop: toolbar/chart/inspector plus table below. Tablet: chart plus sheet.
Phone: stepwise chart-to-inspector and stacked progress rows. Keep 44px touch
targets and internal chart pan/zoom without page overflow.

- [ ] **Step 4: Verify and commit O7**

Run: `npm run test:unit -- 'src/app/(emr)/patients/[patientId]/odontogram-section.test.tsx' src/components/odontogram; npm run lint; npm run typecheck`

Expected: PASS.

```powershell
git add 'src/app/(emr)/patients/[patientId]/odontogram-section.tsx' 'src/app/(emr)/patients/[patientId]/odontogram-section.test.tsx' src/components/odontogram src/lib/odontogram/progress-record.ts
git commit -m "feat: add patient odontogram status workspace"
```

### Task 10: O8/O9 — Plan Mode, Explicit Resolution, and Atomic Completion

**Files:**
- Create: `src/components/odontogram/plan-mode-panel.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/treatment-plan-section.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/treatment-plan-actions.ts`
- Modify: `src/lib/treatment-plan/schema.ts`
- Modify: `src/lib/treatment-plan/types.ts`
- Modify: `src/lib/treatment-plan/service.ts`
- Modify: `src/lib/treatment-plan/execution.ts`
- Modify: `src/lib/treatment-plan/service.test.ts`
- Modify: `src/lib/treatment-plan/execution.test.ts`
- Modify: `src/components/odontogram/bridge-workflow.tsx`
- Modify: `src/components/odontogram/implant-workflow.tsx`
- Modify: `src/components/odontogram/bridge-workflow.test.tsx`
- Create: `src/components/odontogram/implant-workflow.test.tsx`
- Create: `supabase/tests/odontogram_atomic_completion_revamp.test.sql`.

**Interfaces:**
- Produces: `CompleteTreatmentInput { caseId, planItemId?, expectedVersion, resolvedFindingIds, amountCentavos, completion, idempotencyKey }` without provider identity.

- [ ] **Step 1: Write lifecycle and exact-resolution failures**

```ts
export type BridgeCompletionPayload = { kind: "BRIDGE"; units: BridgeUnitDTO[] };
export type ImplantCompletionPayload = { kind: "IMPLANT"; components: ImplantComponentPayloadDTO[] };
export type CompleteTreatmentInput = {
  actingBranchId: string;
  caseId: string;
  planItemId?: string;
  expectedVersion: number;
  resolvedFindingIds: string[];
  amountCentavos: string;
  completion: ClinicalFeatureDetail | BridgeCompletionPayload | ImplantCompletionPayload;
  idempotencyKey: string;
};

expect(completeTreatmentInputSchema.safeParse({
  actingBranchId, caseId, resolvedFindingIds: [], amountCentavos: "5000000",
  completion: crownPayload, idempotencyKey: "complete-1",
}).success).toBe(true);
```

Add database tests proving only selected findings are resolved, acknowledged
proposal JSON remains unchanged, double completion returns the original result,
and charge failure rolls back clinical completion.

- [ ] **Step 2: Replace drawing with structured plan fields**

Remove `DrawingCanvas`, `saveTreatmentPlanDrawingAction`, drawing inputs/types,
and drawing include-set UI. Render procedure, teeth/surfaces, estimate, priority,
sequence, alternatives, and notes. Presented/acknowledged plans are read-only.

- [ ] **Step 3: Implement the confirmation dialog**

The final confirmation shows patient, procedure, service date, selected resolved
findings, exact PHP charge, and signed-in dentist. It has no provider selector
and does not combine payment entry with charge confirmation.

- [ ] **Step 4: Verify bridge/implant materialization**

Test draft -> frozen plan -> accepted/in-progress -> completed relationship;
natural/mixed bridge units, implant fixture/abutment/crown sequence, amendment,
void, reload, and planned/current visual distinction.

- [ ] **Step 5: Run and commit O8/O9**

Run: `npm run test:db:local; npm run test:unit -- src/lib/treatment-plan src/components/odontogram 'src/app/(emr)/patients/[patientId]/treatment-plan-section.test.tsx'; npm run typecheck`

Expected: PASS.

```powershell
git add src/lib/treatment-plan src/components/odontogram 'src/app/(emr)/patients/[patientId]/treatment-plan-section.tsx' 'src/app/(emr)/patients/[patientId]/treatment-plan-section.test.tsx' 'src/app/(emr)/patients/[patientId]/treatment-plan-actions.ts' 'src/app/(emr)/patients/[patientId]/treatment-plan-actions.test.ts' supabase/tests/odontogram_atomic_completion_revamp.test.sql
git commit -m "feat: replace drawing plans with structured execution"
```

### Task 11: O10/O11 — Periodontal, Accessibility, and Responsive Hardening

**Files:**
- Modify: `src/components/odontogram/perio-workspace.tsx`
- Modify: `src/components/odontogram/perio-chart.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/perio-actions.ts`
- Modify: `src/components/odontogram/a11y.test.tsx`
- Create: `e2e/odontogram-responsive-accessibility.spec.ts`

**Interfaces:**
- Consumes: finalized/amended perio DTO and responsive odontogram workspace.
- Produces: keyboard-safe six-site entry and guarded `@responsive` E2E coverage.

- [ ] **Step 1: Write keyboard/focus/component failures**

```tsx
await user.keyboard("{ArrowRight}");
expect(screen.getByRole("spinbutton", { name: /tooth 11 buccal probing depth/i })).toHaveFocus();
await user.keyboard("{Escape}");
expect(screen.getByRole("button", { name: /tooth 11/i })).toHaveFocus();
```

- [ ] **Step 2: Implement complete perio UI**

Persist granular batches (max 200 rows), show derived CAL and source inputs,
disable invalid missing-tooth/implant fields, finalize with confirmation, and
amend through attributed history rather than edit finalized children.

- [ ] **Step 3: Add guarded Playwright coverage**

```ts
test("@responsive odontogram remains touch-safe and non-color-dependent", async ({ page }) => {
  await page.goto(`/patients/${syntheticPatientId}?section=odontogram`);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  await expect(page.getByRole("button", { name: /tooth 11/i })).toBeVisible();
});
```

Cover 360, 430, iPad portrait/landscape, and 1440 widths through the existing
Playwright matrix; never record traces containing credentials or patient data.

- [ ] **Step 4: Verify and commit O10/O11**

Run: `npm run test:unit -- src/components/odontogram 'src/app/(emr)/patients/[patientId]/perio-actions.test.ts'; npm run test:e2e:list; npm run lint; npm run typecheck`

Expected: unit tests pass and guarded E2E specs are discoverable. Hosted E2E execution remains deferred.

```powershell
git add src/components/odontogram 'src/app/(emr)/patients/[patientId]/perio-actions.ts' 'src/app/(emr)/patients/[patientId]/perio-actions.test.ts' e2e/odontogram-responsive-accessibility.spec.ts
git commit -m "feat: harden periodontal and responsive charting"
```

### Task 12: O12 — Clinical Photograph Metadata and Private Derivatives

**Files:**
- Modify: `package.json`, `package-lock.json` only after dependency gate passes.
- Create: `supabase/migrations/20260830010500_clinical_photographs.sql`
- Create: `supabase/migrations/20260830010600_clinical_photo_rpcs.sql`
- Create: `supabase/migrations/20260830010601_clinical_photo_rpcs_grants.sql`
- Create: `supabase/tests/clinical_photographs.test.sql`
- Create: `src/lib/clinical-media/schema.ts`
- Create: `src/lib/clinical-media/types.ts`
- Create: `src/lib/clinical-media/service.ts`
- Create: `src/lib/clinical-media/processor.ts`
- Create: `src/lib/clinical-media/filename.ts`
- Create: `src/lib/clinical-media/schema.test.ts`
- Create: `src/lib/clinical-media/service.test.ts`
- Create: `src/lib/clinical-media/processor.test.ts`
- Create: `src/lib/clinical-media/filename.test.ts`

**Interfaces:**
- Produces: `ClinicalPhotoDTO`, `ClinicalPhotoVariant`, `proposeDisplayFilename`, `processClinicalPhoto`, and authorized photo RPCs.

- [ ] **Step 1: Run the image dependency gate**

Run:

```powershell
npm view sharp version license engines repository --json
npm install --save-exact sharp
npm audit --omit=dev --audit-level=high
npm run build
```

Expected: reviewed current Sharp metadata, Apache-2.0 license, supported Node/Windows
runtime, no new high-severity production advisory, and successful Next build. If
any gate fails, revert only `package.json`/`package-lock.json`, record the issue,
and stop this task for an ADR update; do not substitute an external image SaaS.

- [ ] **Step 2: Write filename and processing failures**

```ts
expect(proposeDisplayFilename({ captureDate: "2026-08-30", category: "AFTER", toothCodes: ["11"], sequence: 1, extension: "jpg" }))
  .toBe("2026-08-30_after_tooth-11_01.jpg");
expect(() => sanitizeDisplayFilename("../Patient Name.jpg", "image/jpeg")).toThrow();
```

Test checksum preservation, EXIF stripping in derivatives, exact bounded
dimensions, retry idempotency, and no recursive derivative processing.

- [ ] **Step 3: Add metadata, pairing, and derivative tables**

```sql
create table public.clinical_photographs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  patient_id uuid not null,
  source_file_id uuid not null,
  procedure_case_id uuid,
  category text not null check (category in ('BEFORE','PROGRESS','AFTER','DIAGNOSTIC','INTRAORAL','EXTRAORAL','OTHER')),
  display_filename text not null,
  original_client_filename text not null,
  capture_at timestamptz not null,
  tooth_codes text[] not null default '{}',
  surfaces text[] not null default '{}',
  note text,
  processing_status text not null check (processing_status in ('PENDING','PROCESSING','READY','FAILED')),
  created_by uuid not null,
  version integer not null default 1,
  unique (organization_id, id),
  unique (organization_id, source_file_id)
);
```

Add same-org composite FKs, a one-to-one optional pairing table with role
BEFORE/AFTER, `clinical_photo_derivatives` with enum variant and opaque object
key, processing attempts, RLS, zero base grants, and patient/date/category/
procedure indexes. Original filenames are excluded from ordinary list RPCs.

- [ ] **Step 4: Implement private processing**

```ts
export const PHOTO_VARIANTS = {
  thumbnail: { width: 320, height: 240, fit: "inside" },
  preview: { width: 1280, height: 960, fit: "inside" },
  display: { width: 2048, height: 1536, fit: "inside" },
} as const;

export type ClinicalPhotoVariant = keyof typeof PHOTO_VARIANTS;
export type ClinicalPhotoDTO = {
  photoId: string;
  patientId: string;
  procedureCaseId: string | null;
  category: "BEFORE"|"PROGRESS"|"AFTER"|"DIAGNOSTIC"|"INTRAORAL"|"EXTRAORAL"|"OTHER";
  displayFilename: string;
  captureAt: string;
  toothCodes: string[];
  surfaces: string[];
  note: string | null;
  processingStatus: "PENDING"|"PROCESSING"|"READY"|"FAILED";
  pairedPhotoId: string | null;
  version: number;
};
```

Use the storage adapter to read the original and write new opaque derivative
keys. Validate magic bytes/decoded type (JPEG, PNG, or WebP), size and dimensions;
auto-rotate, strip metadata, preserve the source object/checksum, and update
processing state through an authorized/idempotent server path.

- [ ] **Step 5: Verify and commit media backend**

Run: `npm run storage:start:local; npm run storage:smoke:local; npm run test:db:local; npm run test:unit -- src/lib/clinical-media src/lib/storage; npm run security:secrets; npm run typecheck; npm run build`

Expected: PASS using synthetic generated images only.

```powershell
git add package.json package-lock.json supabase/migrations/20260830010500_clinical_photographs.sql supabase/migrations/20260830010600_clinical_photo_rpcs.sql supabase/migrations/20260830010601_clinical_photo_rpcs_grants.sql supabase/tests/clinical_photographs.test.sql src/lib/clinical-media
git commit -m "feat: add private clinical photograph pipeline"
```

### Task 13: O12 — Patient Photo Gallery and Chronology Integration

**Files:**
- Create: `src/app/(emr)/patients/[patientId]/photos/actions.ts`
- Create: `src/app/(emr)/patients/[patientId]/photos/clinical-photo-gallery.tsx`
- Create: `src/app/(emr)/patients/[patientId]/photos/photo-upload-dialog.tsx`
- Create: `src/app/(emr)/patients/[patientId]/photos/before-after-compare.tsx`
- Create: `src/app/(emr)/patients/[patientId]/photos/actions.test.ts`
- Create: `src/app/(emr)/patients/[patientId]/photos/clinical-photo-gallery.test.tsx`
- Create: `src/app/(emr)/patients/[patientId]/photos/photo-upload-dialog.test.tsx`
- Create: `src/app/(emr)/patients/[patientId]/photos/before-after-compare.test.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/page.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/patient-workspace.tsx`

**Interfaces:**
- Consumes: clinical-media service and `patient.clinical.read/write` authorization.
- Produces: patient gallery, safe upload/rename/pair/archive actions, private preview URLs, and PHOTO progress events.

- [ ] **Step 1: Write role and UI failures**

```tsx
expect(screen.getByLabelText("Display filename")).toHaveValue("2026-08-30_after_tooth-11_01.jpg");
expect(screen.getByRole("button", { name: "Confirm and add to record" })).toBeEnabled();
expect(screen.queryByText("original-camera-name.jpg")).not.toBeInTheDocument();
```

Action tests must prove receptionist upload denial, dentist upload success,
foreign-patient denial, stale rename rejection, and no original filename or URL
in error results.

- [ ] **Step 2: Implement upload and confirmation**

Use a presigned original upload. The confirm action verifies storage facts,
creates photo metadata, triggers idempotent processing, and returns only
`photoId`, `version`, and processing status. Do not increase Server Action body
limits or send image bytes through a Server Action.

- [ ] **Step 3: Implement gallery and comparison**

Use private derivative URLs minted only after clinical-read authorization.
Filter by date/category/procedure/tooth/photographer. Pairing is optional and
audited. A later rename updates display metadata with expected version and an
audit event; it never changes object keys.

- [ ] **Step 4: Verify and commit gallery UI**

Run: `npm run test:unit -- 'src/app/(emr)/patients/[patientId]/photos' 'src/app/(emr)/patients/[patientId]/patient-workspace.test.tsx'; npm run lint; npm run typecheck; npm run build`

Expected: PASS.

```powershell
git add 'src/app/(emr)/patients/[patientId]/photos' 'src/app/(emr)/patients/[patientId]/page.tsx' 'src/app/(emr)/patients/[patientId]/patient-workspace.tsx' 'src/app/(emr)/patients/[patientId]/patient-workspace.test.tsx'
git commit -m "feat: add patient clinical photo gallery"
```

### Task 14: O12 — Staged Import, Authorized Export, Print, and Progress RPC

**Files:**
- Create: `supabase/migrations/20260830010700_odontogram_import_staging.sql`
- Create: `supabase/migrations/20260830010800_odontogram_interchange_and_progress_rpcs.sql`
- Create: `supabase/migrations/20260830010801_odontogram_interchange_and_progress_grants.sql`
- Create: `supabase/tests/odontogram_interchange_progress.test.sql`
- Create: `src/lib/odontogram/interchange/json.ts`
- Create: `src/lib/odontogram/interchange/fhir.ts`
- Create: `src/lib/odontogram/interchange/staging.ts`
- Create: `src/lib/odontogram/interchange/export-audit.ts`
- Create: `src/lib/odontogram/interchange/json.test.ts`
- Create: `src/lib/odontogram/interchange/fhir.test.ts`
- Create: `src/lib/odontogram/interchange/staging.test.ts`
- Create: `src/lib/odontogram/interchange/export-audit.test.ts`
- Create: `src/app/(emr)/patients/[patientId]/odontogram/interchange/import/route.ts`
- Create: `src/app/(emr)/patients/[patientId]/odontogram/interchange/export/route.ts`
- Create: `src/components/odontogram/import-review-dialog.tsx`
- Create: `src/components/odontogram/export-menu.tsx`
- Create: `src/components/odontogram/import-review-dialog.test.tsx`
- Create: `src/components/odontogram/export-menu.test.tsx`
- Create: `src/app/(emr)/patients/[patientId]/odontogram/print/page.tsx`

**Interfaces:**
- Produces: `ImportBatchDTO`, `ImportDiffRow`, `stageOdontogramImport`, `acceptOdontogramImport`, `listPatientDentalProgress`, and audited exports.

- [ ] **Step 1: Write staging and tenant-isolation failures**

```sql
select extensions.is(
  (select count(*) from public.tooth_clinical_entries where patient_id = :patient_a),
  0::bigint,
  'parsing/staging alone does not write canonical clinical truth'
);
select extensions.throws_ok(
  $$select public.accept_odontogram_import(:branch_a, :batch_b, :accepted_rows, :idem)$$,
  '42501', 'not authorized', 'foreign-tenant staged imports cannot be accepted'
);
```

- [ ] **Step 2: Implement bounded staging tables**

Create `odontogram_import_batches` and `odontogram_import_rows` with organization,
patient, format/version, status, uploader, expiry, source checksum, row status,
bounded normalized payload/diff, RLS, no base DML, and indexes. Raw files stay
private and are removed through the bounded retention path.

- [ ] **Step 3: Implement pure mappings**

```ts
export type ImportRowDisposition = "NEW" | "DUPLICATE" | "CONFLICT" | "UNSUPPORTED";
export type ImportDiffRow = {
  rowId: string;
  disposition: ImportRowDisposition;
  toothCode: string | null;
  summary: string;
  selectable: boolean;
};
export type ImportBatchDTO = {
  batchId: string;
  format: "EMR_JSON_V1" | "FHIR_R4";
  status: "STAGED" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  rows: ImportDiffRow[];
};
export type PatientDentalRecordDTO = {
  odontogram: PatientOdontogramDTO;
  progressEvents: ProgressEventDTO[];
  treatmentPlans: TreatmentPlanDetail[];
  photos: ClinicalPhotoDTO[];
};
export type ParsedImport = {
  sourceFormat: "EMR_JSON_V1" | "FHIR_R4";
  rows: Array<{ sourceIndex: number; normalized: ClinicalFeatureDetail | null; disposition: ImportRowDisposition; summary: string }>;
};
export type EmrOdontogramExportV1 = {
  schema: "dental-emr.odontogram.v1";
  exportedAt: string;
  chart: PatientOdontogramDTO;
};
export type FhirBundle = {
  resourceType: "Bundle";
  type: "collection";
  timestamp: string;
  entry: Array<{ resource: Record<string, unknown> }>;
};
export function parseEmrOdontogramJson(input: unknown): ParsedImport;
export function parseSupportedFhirR4Bundle(input: unknown): ParsedImport;
export function toEmrOdontogramJson(dto: PatientDentalRecordDTO): EmrOdontogramExportV1;
export function toSupportedFhirR4(dto: PatientDentalRecordDTO): FhirBundle;
```

JSON includes a fixed schema version. FHIR supports only documented mappings;
unsupported resources are shown, not guessed. Accepting rows requires dentist
confirmation and appends provenance transactionally.

- [ ] **Step 4: Implement Next.js 16 Route Handlers**

```ts
export async function POST(request: Request, context: RouteContext<'/patients/[patientId]/odontogram/interchange/import'>) {
  const { patientId } = await context.params;
  // authenticate, authorize, enforce Content-Length and 512 KiB parsed limit,
  // stage only, and return a bounded diff identifier.
}
```

Use request-time authorization; do not cache. JSON/FHIR export is generated
server-side after audit. SVG/PNG export serializes only the already-authorized
measured chart at fixed sizes after an audit action succeeds. PDF uses the
dedicated print page and browser Save as PDF; no jsPDF dependency is added.

- [ ] **Step 5: Implement the chronological RPC**

`list_patient_dental_progress(branch, patient, after_cursor, limit)` returns a
bounded union projection of clinical, plan/execution, case/follow-up, charge,
payment/allocation, perio, photo, and accepted-import events. Order by
`occurred_at ASC, recorded_at ASC, event_id ASC`; use a stable cursor and max
100 rows. Apply existing patient and branch-specific financial visibility so
hidden-branch descriptions/providers never leak.

- [ ] **Step 6: Verify and commit O12 interchange**

Run: `npm run test:db:local; npm run test:unit -- src/lib/odontogram/interchange src/components/odontogram; npm run lint; npm run typecheck; npm run build; npm run security:secrets`

Expected: PASS; staged import alone creates no clinical entry and exports contain no raw fork state.

```powershell
git add supabase/migrations/20260830010700_odontogram_import_staging.sql supabase/migrations/20260830010800_odontogram_interchange_and_progress_rpcs.sql supabase/migrations/20260830010801_odontogram_interchange_and_progress_grants.sql supabase/tests/odontogram_interchange_progress.test.sql src/lib/odontogram/interchange 'src/app/(emr)/patients/[patientId]/odontogram' src/components/odontogram/import-review-dialog.tsx src/components/odontogram/export-menu.tsx
git commit -m "feat: add staged odontogram interchange and progress record"
```

### Task 15: O13 — Retire Drawing and Obsolete Mutation Paths

**Files:**
- Create: `supabase/migrations/20260830010900_odontogram_drawing_retirement.sql`
- Create: `supabase/migrations/20260830011000_odontogram_revamp_terminal_grants.sql`
- Create: `supabase/tests/odontogram_revamp_retirement.test.sql`
- Modify: `src/lib/treatment-plan/schema.ts`
- Modify: `src/lib/treatment-plan/types.ts`
- Modify: `src/lib/treatment-plan/service.ts`
- Modify: `src/lib/treatment-plan/service.test.ts`
- Modify: `src/lib/documents/include-set.ts`
- Modify: `src/lib/documents/render.ts`
- Modify: `src/lib/documents/service.ts`
- Modify: `src/lib/documents/render.test.ts`
- Modify: `src/lib/documents/service.test.ts`
- Modify: `src/app/(emr)/patients/[patientId]/treatment-plan-section.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/treatment-plan-section.test.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/treatment-plan-actions.ts`
- Modify: `src/app/(emr)/patients/[patientId]/treatment-plan-actions.test.ts`
- Modify: `scripts/approved-final-grants.mjs`

**Interfaces:**
- Consumes: all new read/write paths proven in Tasks 2-14.
- Produces: one canonical mutation model; no drawing authoring or obsolete Phase 15/fork demo entry points.

- [ ] **Step 1: Write absence and migration-safety tests**

```sql
select extensions.is(
  to_regprocedure('public.save_treatment_plan_drawing(uuid,uuid,integer,jsonb)'),
  null::regprocedure,
  'drawing mutation RPC is retired'
);
select extensions.is(
  to_regclass('public.treatment_plan_drawings'),
  null::regclass,
  'drawing table is retired after guarded cleanup'
);
```

- [ ] **Step 2: Implement guarded retirement**

The migration must revoke/terminate drawing RPC grants first, assert every row
matches the deterministic synthetic-development marker defined in the accepted
fixtures, delete only those confirmed rows, then drop the function/table. If an
unrecognized row exists, raise an exception and leave all data/schema intact.
Do not alter frozen historical document snapshots already generated; stop
rendering or offering drawing in new documents.

- [ ] **Step 3: Remove application references**

Remove drawing schemas/types/services/actions/components/tests and `drawing`
from new document include sets. Keep an explicit compatibility parser only if
required to read an immutable historical synthetic snapshot; it must be
read-only and unreachable from patient chart mutation UI.

- [ ] **Step 4: Run absence scans and full local gate**

Run:

```powershell
rg -n "Reset Mouth|Reset Tooth|Classic|DrawingCanvas|saveTreatmentPlanDrawing|save_treatment_plan_drawing|localStorage|jsPDF" src supabase/migrations supabase/tests
npm run test:db:local
npm run security:migrations
npm run lint
npm run typecheck
npm run test:unit
npm run build
git diff --check
```

Expected: no live product references; explicitly named migration-history text
may remain only where necessary to revoke/drop old objects.

- [ ] **Step 5: Commit O13**

```powershell
git add supabase/migrations/20260830010900_odontogram_drawing_retirement.sql supabase/migrations/20260830011000_odontogram_revamp_terminal_grants.sql supabase/tests/odontogram_revamp_retirement.test.sql src/lib/treatment-plan src/lib/documents 'src/app/(emr)/patients/[patientId]/treatment-plan-section.tsx' 'src/app/(emr)/patients/[patientId]/treatment-plan-actions.ts' scripts
git commit -m "refactor: retire odontogram drawing and legacy mutations"
```

### Task 16: O14 — Full Local Regression, Review, and Handoff

**Files:**
- Create: `e2e/odontogram-clinical-record.spec.ts`
- Modify: `scripts/remote-database-test-guard.mjs`
- Modify: `scripts/remote-database-test-guard.test.mjs`
- Modify: `docs/AI_HANDOFF.md`
- Create: `docs/ODONTOGRAM_REVAMP_LOCAL_ACCEPTANCE.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: requirement-to-test trace, fresh local evidence, deferred hosted gate list, and independent-review checkpoint.

- [ ] **Step 1: Add the authenticated end-to-end specification**

Cover with deterministic synthetic data:

```ts
test("patient plan -> treatment -> charge -> partial payment -> follow-up -> photo -> chronology", async ({ page }) => {
  // sign in as synthetic dentist; record finding and acknowledged plan;
  // complete exact finding with confirmed charge; record partial payment;
  // add adjustment without a second charge; upload paired synthetic photos;
  // assert one oldest-to-newest progress record and case-specific balance.
});
```

Also cover direct/unplanned treatment, receptionist payment, dentist payment,
wrong-case allocation denial, missing -> implant, root canal layer, bridge roles,
perio finalization, staged import, each export, patient switch, and authorization
negatives. Keep traces off and screenshots synthetic.

- [ ] **Step 2: Run the complete authorized local command set**

```powershell
npm run db:start:local
npm run db:migrate:local
npm run db:provision:local
npm run storage:start:local
npm run storage:smoke:local
npm run test:db:local
npm run db:types:local
npm run db:types:check
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run security:migrations
npm run security:secrets
npm run security:audit
npm run test:e2e:list
git diff --check
```

Expected: every local gate passes. `test:e2e:list` proves guarded hosted specs are
discoverable; it is not evidence that hosted authenticated E2E passed.

- [ ] **Step 3: Perform skeptical independent review**

Review the entire O1-O14 diff for tenant leakage, forged identity/branch,
over-broad RLS/grants, unsafe definers/search paths, cross-tenant FKs,
non-repeatable migrations, race conditions, missing audit, sensitive logging,
fork data becoming canonical, renderer reset/Classic/drawing remnants, arbitrary
image transformations, derivative recursion, and missing negative tests.

- [ ] **Step 4: Record honest local acceptance evidence**

`docs/ODONTOGRAM_REVAMP_LOCAL_ACCEPTANCE.md` must label O14 exactly:

```markdown
Locally implemented and verified; Cloud TEST database, authenticated E2E,
responsive/accessibility, advisor/security gates, independent release review,
and final project-owner release acceptance pending. Not approved for real
provider/patient use or production deployment.
```

Update `docs/AI_HANDOFF.md` with exact commits, tests actually run, failures and
resolutions, residual risks, and deferred gates. Do not claim unrun evidence.

- [ ] **Step 5: Commit the local O14 checkpoint**

```powershell
git add e2e docs/AI_HANDOFF.md docs/ODONTOGRAM_REVAMP_LOCAL_ACCEPTANCE.md src/types/database.generated.ts
git commit -m "test: record odontogram revamp local verification"
git status --short
```

Expected: clean working tree unless clearly documented user-owned changes exist.

## Requirement-to-Task Trace

| Approved requirement | Tasks |
| --- | --- |
| Rebuild UI/adapter, preserve foundations | 1, 2, 8, 9, 15 |
| Every fork feature except Classic/reset | 2, 3, 5, 8, 10, 11, 14 |
| Missing -> implant and root-canal anatomy | 2, 8, 10 |
| Structured plan notes/priority/sequence/alternatives | 4, 10 |
| Exact finding resolution and signed-in dentist | 6, 10 |
| Chronological record below chart | 4, 9, 14 |
| Immutable confirmed charge | 6, 7, 10 |
| Dentist/receptionist payment and case-specific balance | 4, 7, 9, 16 |
| Any-procedure installments and follow-ups | 4, 7, 9 |
| Patient gallery, before/after, safe rename | 12, 13, 14 |
| Original/derivative media security | 12, 13 |
| Staged FHIR/JSON import and authorized exports | 14 |
| Drawing history retirement | 1, 10, 15 |
| Tenancy, RLS, audit, migration safety | 3-7, 12, 14-16 |
| Responsive/accessibility and deferred Cloud TEST | 11, 16 |

## Execution Order and Stop Gates

Execute Tasks 1-16 in order. Stop and request project-owner direction if:

- authoritative amendments are not accepted before schema work;
- a migration would need to rewrite applied history or use a reset;
- any drawing row fails the synthetic-data guard;
- Sharp fails maintenance/license/security/Windows/Next build review;
- a clinical feature cannot be mapped without an unresolved clinical decision;
- an RLS or composite-FK invariant would need weakening;
- real patient data, production credentials, or production access is encountered;
- Cloud TEST or production activity is proposed without separate authorization.
