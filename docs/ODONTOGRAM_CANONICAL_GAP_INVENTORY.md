# Odontogram canonical gap inventory

Frozen baseline for the Unified Clinical Chart Workspace plan (Tasks 1-17).

## 1. Scope and method

This inventory records **only gaps verified by direct inspection** of this
repository and of the local Supabase Postgres schema at the baseline below. It
deliberately records no speculation about the internals of later tasks; where a
gap's owning task is not determinable from the accepted plan's task titles, that
is stated instead of guessed.

Baseline:

- Git commit `bde1b56` (`docs: plan unified clinical chart workspace`), clean tree.
- Local Supabase container `supabase_db_local`.
- `supabase_migrations.schema_migrations` versions compared against
  `supabase/migrations/*.sql` filename versions: **identical, no drift**
  (296 migrations, `20260813020000` .. `20260901010001`).
- `public.clinical_encounters` live column list compared against
  `supabase/migrations/20260827012900_clinical_schema.sql`: identical.

Inspected: `clinical_encounters` DDL/indexes/RLS, every function whose body
inserts into `clinical_encounters`, every `authenticated`-executable clinical /
odontogram / periodontal / treatment-plan function, the periodontal tables, the
photo tables, `treatment_plan_drawings`, the patient workspace route and its
sections, renderer imports, and both database-test registries.

## 2. Verified current state

### 2.1 Encounter model

`public.clinical_encounters` columns: `id, organization_id, branch_id,
patient_id, appointment_id, treating_provider_id, status, version, created_by,
created_at, updated_at, finalized_at`.

- `status` is checked to `('OPEN','FINALIZED')`; `finalized_at` is tied to it.
- Tenant-safe composite foreign keys exist for branch, patient, appointment and
  provider.
- Indexes: `(organization_id, patient_id, status)` and
  `(organization_id, branch_id, status)`.
- RLS is enabled and **no policy exists**; the table is reachable only through
  `security definer` RPCs.
- There is **no clinical date**, **no per-day identity**, and **no uniqueness**
  of any kind on open encounters. Nothing prevents an unbounded number of
  simultaneous `OPEN` encounters for the same patient, branch, provider and day.

### 2.2 Encounter creation boundary

Exactly two functions insert into `public.clinical_encounters`:

| Function | `authenticated` execute (baseline) |
| --- | --- |
| `public.create_clinical_encounter(uuid,uuid,uuid,uuid)` | no (already revoked by `20260901010001`) |
| `public.create_clinical_encounter_v2(uuid,uuid,uuid)` | **yes** |

`create_clinical_encounter_v2` derives the provider through
`private.require_active_actor_provider`, but it is an unconditional *create*: it
takes no idempotency key, records no clinical date, and produces a new `OPEN`
encounter on every call. It is the "manual open" boundary the managed lifecycle
supersedes.

No other browser-callable function creates an encounter.
`create_periodontal_examination`, `record_tooth_clinical_entry_v3`,
`record_current_bridge_v3` and `record_current_implant_component_v3` all consume
an encounter or patient identity that already exists.

### 2.3 Periodontal coverage

`public.periodontal_examinations.encounter_id` is **NOT NULL**. Every
periodontal examination therefore requires an encounter to exist first, which
makes the managed visit lifecycle a hard prerequisite for the periodontal
workspace, not an optional convenience.

Measurement coverage today: `periodontal_site_measurements` (probing depth,
gingival margin, CAL, BOP, suppuration, tooth present, implant context),
`periodontal_tooth_measurements` (Miller mobility, notes, implant context),
`periodontal_furcation_measurements` (entrance, grade),
`periodontal_plaque_measurements` (per-surface plaque).

### 2.4 Clinical UI fragmentation

The patient workspace is a query-parameter section switcher
(`src/app/(emr)/patients/[patientId]/patient-sections.ts`) with sections
`overview, account, demographics, contacts, relationships, referrals, clinical,
intake, files`. Inside the `clinical` section,
`clinical-section.tsx` renders a second, nested tab strip:
`records | odontogram | treatment-plans`. Clinical photographs live on a
separate route (`patients/[patientId]/photos`), and files on another
(`patients/[patientId]/files`). There is no single chart work surface.

### 2.5 Renderer coupling

`react-advanced-odontogram` is a `file:vendor/react-advanced-odontogram`
dependency and is imported at runtime by `src/app/layout.tsx` (global CSS),
`src/components/odontogram/fork-odontogram.tsx` and
`src/components/odontogram/fork-print-chart.tsx`. Canonical data is already
kept renderer-independent behind `src/lib/odontogram/fork-adapter.ts`, but the
runtime package is still on the critical render path.

### 2.6 Storage boundaries

- `clinical_photographs` stores metadata plus `source_file_id`, checksum, size
  and a `processing_status` lifecycle; bytes live in the private object store,
  never in Postgres.
- `treatment_plan_drawings` stores a `drawing jsonb` blob keyed uniquely by
  `(organization_id, plan_id)` and capped at 65536 bytes.
- `procedure_cases` links patient, procedure, `treatment_plan_item_id` and
  `charge_id`; there is no mutable patient-balance column anywhere in the
  billing model.

### 2.7 Test registries

- `scripts/remote-database-test-guard.mjs` exports `DATABASE_TEST_SUITES`, the
  ordered pgTAP registry. `scripts/remote-database-test-guard.test.mjs` asserts
  it equals `supabase/tests/*.test.sql` on disk **exactly**, so a new suite must
  be added in both places.
- `scripts/run-local-database-tests.mjs` runs that registry and then each
  `*.local.mjs` concurrency test explicitly; `.local.mjs` files are not
  auto-discovered.
- Pre-existing red at this baseline: `supabase/tests/treatment_plans.test.sql`
  fails assertion 7 (`treatment_plan_items has only the approved fields and the
  canonical centavo estimate`). It is unrelated to this plan and it halts
  `npm run test:db:local` before the registered `.local.mjs` tests run.

## 3. Verified gaps

| # | Verified gap | Evidence | Owning task | Forward migration |
| --- | --- | --- | --- | --- |
| G1 | No clinical date on an encounter; a visit has no per-day identity | §2.1 | Task 1 | `20260901010100_unified_clinical_visit_lifecycle.sql` |
| G2 | No uniqueness or idempotency on open encounters; repeated or concurrent opens duplicate the visit | §2.1, §2.2 | Task 1 | `20260901010100_unified_clinical_visit_lifecycle.sql` |
| G3 | The browser can create an encounter through an unmanaged path (`create_clinical_encounter_v2`) | §2.2 | Task 1 | `20260901010101_unified_clinical_visit_lifecycle_grants.sql` |
| G4 | No server-side single entry point for later clinical writes to obtain an encounter and provider attribution | §2.2, §2.3 | Task 1 (consumed by Tasks 5, 6, 7, 8, 11, 15) | `20260901010100_unified_clinical_visit_lifecycle.sql` |
| G5 | Clinical work is split across a section switcher plus a nested tab strip plus two sibling routes | §2.4 | Task 2 (unified workspace shell) | none (UI) |
| G6 | The odontogram renders through a runtime third-party package on the critical path | §2.5 | Task 3 (EMR-owned renderer), Task 16 (package removal) | none (UI/dependency) |
| G7 | No responsive/toolbar composition for the chart work surface | §2.4 | Task 4 | none (UI) |
| G8 | Findings, treatments, bridges and implants are recorded through separate panels rather than one composer | §2.4, §2.2 | Tasks 5, 6, 7 | not determinable from task titles alone |
| G9 | Treatment planning is a sibling tab rather than a chart mode | §2.4 | Task 8 | not determinable from task titles alone |
| G10 | Periodontal model lacks the expanded canonical/peri-implant coverage the workspace needs, and has no draft/autosave/finalize/amend/compare RPC set | §2.3 | Tasks 9, 10, 11, 12 | not determinable from task titles alone |
| G11 | No canonical chronological progress-record projection (today's progress record is assembled client-side in `src/lib/odontogram/progress-record.ts`) | §2.4 | Task 13 | not determinable from task titles alone |
| G12 | The clinical gallery is a separate route rather than a chart-toolbar surface | §2.4, §2.6 | Task 14 | none (UI) |
| G13 | No staged FHIR/JSON import or permissioned canonical export | `src/lib/odontogram/fhir-candidates.ts` exists as candidate mapping only; no import/export RPC is `authenticated`-executable | Task 15 | not determinable from task titles alone |
| G14 | Print/help/export presentation still depends on the fork package | §2.5 | Task 16 | none (UI/dependency) |
| G15 | Superseded UI paths remain, and the local acceptance gate is currently red on an unrelated suite | §2.4, §2.7 | Task 17 | none |

"Not determinable from task titles alone" means the accepted plan names the task
but this inventory has not read that task's brief; the migration filename is
fixed by that task's own brief and must not be invented here.

## 4. Legacy compatibility data that must remain readable

- Every existing `clinical_encounters` row (both `OPEN` and `FINALIZED`) created
  before the managed lifecycle. These carry `managed_visit = false` and
  `clinical_date = null` and are never resumed, finalized, deleted, reconciled
  or rewritten by the managed lifecycle.
- `public.create_clinical_encounter(uuid,uuid,uuid,uuid)` and
  `public.create_clinical_encounter_v2(uuid,uuid,uuid)` remain defined so
  historical behaviour stays inspectable; only their browser reachability is
  withdrawn.
- `tooth_conditions` and `odontogram_legacy_resolutions` remain the legacy
  odontogram read/resolution surface.
- Historical read, finalize and amend paths keep their `authenticated` grants:
  `list_clinical_encounters`, `get_clinical_encounter_detail`,
  `finalize_clinical_encounter`, `amend_clinical_note`,
  `amend_tooth_clinical_entry`, `amend_current_bridge`,
  `amend_current_implant_component`, `amend_periodontal_examination`.

## 5. Mutation boundaries withdrawn from the browser

| Boundary | When | Replacement |
| --- | --- | --- |
| `public.create_clinical_encounter(uuid,uuid,uuid,uuid)` | already revoked in `20260901010001` | `create_clinical_encounter_v2` (itself now superseded) |
| `public.create_clinical_encounter_v2(uuid,uuid,uuid)` | Task 1, `20260901010101_unified_clinical_visit_lifecycle_grants.sql` | `public.start_or_resume_clinical_visit(uuid,uuid,uuid,uuid)` |

Nothing else is revoked in Task 1. No read, finalize or amend grant is touched.

One boundary is recorded here as **ambiguous and deliberately left in place**:
`public.add_treatment_plan_discussion(uuid,uuid,uuid,text,text)` accepts a
client-supplied `p_treating_provider_id`. It creates no encounter, so it is out
of the managed lifecycle's scope, but it is the last browser-callable clinical
function that accepts a provider identifier as an argument. Flagged for the
controller rather than changed here.

## 6. Canonical source for every workspace projection

| Workspace projection | Canonical source |
| --- | --- |
| Active visit / encounter identity | `public.clinical_encounters` (managed rows), obtained only through `public.start_or_resume_clinical_visit` |
| Treating provider attribution | `private.require_active_actor_provider` over `public.providers` + `public.provider_branches`; never client input |
| Clinical date | derived server-side from `Asia/Manila` inside the lifecycle RPC; never client input |
| Tooth findings / treatments | `public.tooth_clinical_entries` (+ `_surfaces`, `_details`, `_voids`) |
| Bridges | `public.dental_bridges`, `public.dental_bridge_units`, `public.dental_bridge_voids` |
| Implants | `public.dental_implant_components`, `public.dental_implant_component_voids` |
| Periodontal chart | `public.periodontal_examinations` + the four measurement tables |
| Treatment plans | `public.treatment_plans`, `public.treatment_plan_items`, `public.treatment_plan_drawings` |
| Charges / cases / payments | `public.charges`, `public.procedure_cases`, `public.payments`, `public.payment_allocations` and their append-only void/reversal/refund tables (no mutable balance column) |
| Photographs | `public.clinical_photographs` + `public.clinical_photo_derivatives`; bytes in the private object store |
| Legacy odontogram entries | `public.tooth_conditions`, resolved through `public.odontogram_legacy_resolutions` |
| Audit trail | `public.audit_events` (bounded allow-listed metadata only) |

Renderer payloads, SVG attributes, browser state, local storage and fork demo
data are never canonical. Every reload rebuilds the chart from the sources above.
