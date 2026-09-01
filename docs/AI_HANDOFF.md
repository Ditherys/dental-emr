# AI Handoff - Unified Clinical Chart workspace, Task 9

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

## Task 9 - Expand the canonical periodontal and peri-implant data model (2026-09-01)

### Bounded slice implemented

Schema, constraints, triggers, indexes, domain types and tests only. **No RPC
was added, no grant changed, and no UI was built.** Task 10 (calculations),
Task 11 (draft/autosave/finalize/amend/compare RPCs) and Task 12 (workspace UI)
build on this and are deliberately absent.

The five existing periodontal tables were **extended**, never duplicated:

- **Unknown became representable.** `periodontal_site_measurements.gingival_margin_mm`,
  `bleeding_on_probing`, `suppuration` and `periodontal_plaque_measurements.plaque_present`
  lost their `NOT NULL DEFAULT 0/false`. A site nobody assessed was previously
  indistinguishable from a healthy site. Derived `cal_mm` is a generated column,
  so an unknown margin now yields an unknown CAL instead of silently reporting
  the probing depth as the attachment level.
- **Surface indices with applicability.** The plaque table gained
  `plaque_index` (Silness-Loe), `gingival_index` (Loe-Silness),
  `modified_plaque_index` and `modified_bleeding_index` (Mombelli), each bounded
  0-3. A table check refuses both families on one surface; a constraint trigger
  on **both** the surface and the tooth table refuses each family against the
  wrong implant context, reading the authoritative flag from the tooth row
  rather than duplicating it.
- **Tooth and implant properties.** `keratinized_gingiva_mm` (0-15),
  `gingival_thickness_mm` (0.1-9.9), `gingival_phenotype` (THIN/THICK),
  `miller_recession_class` (I-IV), `cej_visible`, `root_concavity`. The last
  three are refused in an implant context - an implant has no root, no
  cemento-enamel junction and no interdental attachment to classify Miller
  recession against. Miller mobility was already refused there.
- **Examination risk inputs.** `age_years_snapshot` (0-130), `smoking_status`
  (NEVER/FORMER/CURRENT), `cigarettes_per_day` (0-100, current smokers only),
  `diabetes_status` (NONE/TYPE_1/TYPE_2/OTHER), `hba1c_percent` (3.0-20.0),
  `teeth_lost_to_periodontitis` (0-32), `radiographic_bone_loss_percent` (0-100).
- **Derived versus clinician-confirmed classification.** `derived_*` and
  `confirmed_*` diagnosis / stage / grade / extent are separate columns and
  never overwrite one another. A confirmation must name its user, its
  tenant-safe provider, its time and its fingerprint; a confirmation that
  departs from the derived result requires a bounded non-empty
  `classification_override_reason`. Health, gingivitis, peri-implant health and
  peri-implant mucositis are never staged or graded.
- **Fingerprint provenance that cannot be forged.**
  `private.periodontal_measurement_digest(uuid,uuid)` is the single definition of
  "the measurements of this examination" - a SHA-256 hex digest over the four
  child tables, nulls rendered as `~` so `(3, null, 2)` and `(3, 2)` cannot
  collide, aggregate order pinned to the `C` collation. An AFTER constraint
  trigger refuses any `derived_`/`confirmed_measurement_fingerprint` that is not
  the true digest at write time. It runs only when a fingerprint column changes,
  so an ordinary later edit costs nothing.
- **Amendment lineage.** `amendment_reason` is bounded, non-empty, accepted only
  with a predecessor, and **mandatory once the amendment is FINAL**. A DRAFT
  amendment may still be autosaved without one; the authoritative record that
  replaces finalized clinical history may not exist unexplained.
- **`public.amend_periodontal_examination` and
  `private.enforce_periodontal_tooth_context` were repaired in place** (same
  signatures, no grant change) so the amendment clone and the inferred-context
  merge carry every new column. Without that, an amendment would have silently
  discarded the whole expansion - the exact silent overwrite the amendment path
  exists to prevent.

### Why

The periodontal tables carried six-site probing, a signed margin, BOP,
suppuration, O'Leary plaque, Miller mobility and Glickman furcation, and nothing
else. Task 10 cannot compute a 2018 stage or grade from that, Task 11 has no
classification to version, and Task 12 has no peri-implant record to render.
Two defects also had to be closed first: an unassessed measurement was recorded
as a healthy one, and an amendment could replace a finalized examination without
saying why.

### Specifications relied on

- `.superpowers/sdd/2026-09-01-unified-clinical-chart-workspace/task-9-brief.md`
  and `global-constraints.md`.
- `CLAUDE.md` / `AGENTS.md`: RLS on every exposed tenant table; tenant-safe
  composite foreign keys; narrow grants; negative authorization tests in the
  same checkpoint; guarded forward-only migrations; signed/finalized clinical
  history preserved by versioning/amendment, never silent overwrite; no client
  supplied organization, branch, patient, encounter or provider.
- ADR-028 (renderer domain boundary), ADR-030 (longitudinal record revamp).

### Migration numbering

The controller allocated `20260901010200`/`010201` and the current maximum was
independently re-verified as `20260901010144` in the local `schema_migrations`
table before the files were written. The allocation was correct and was used
unchanged.

### Files added

- `supabase/migrations/20260901010200_full_periodontal_model.sql`
- `supabase/migrations/20260901010201_full_periodontal_model_grants.sql`
- `supabase/tests/periodontal_full_chart.test.sql` (111 assertions)

### Files changed

- `supabase/tests/periodontal_charting.test.sql` - new section 7b only; nothing
  weakened (see below).
- `supabase/tests/periodontal_current_state_guard.test.sql` - one assertion
  added; nothing weakened.
- `scripts/remote-database-test-guard.mjs` - the new suite registered.
- `scripts/remote-database-test-guard.test.mjs`,
  `scripts/migration-privilege-lint.test.mjs` - inventory expectations
  (109 suites; 321 migration files; 486 created functions).
- `src/lib/odontogram/perio.ts` (+`perio.test.ts`) - canonical bounds, value
  domains, `deriveCal`, and validators for surface indices, tooth/implant
  properties, risk inputs and classification.
- `src/lib/odontogram/schema.ts` - the periodontal DTO now models nullable
  margin/CAL/BOP/suppuration/plaque, and the canonical value-domain enums are
  exported.
- `src/lib/odontogram/types.ts` - the value-domain types re-exported.
- `src/components/odontogram/perio-chart.tsx`,
  `perio-workspace.tsx`, `fork-odontogram.tsx` - the minimum required to keep
  compiling against a nullable measurement. An unknown CAL renders as "-" and
  raises no periodontal alert.
- `src/types/database.generated.ts` - regenerated (`npm run db:types:local`).

### Files deleted

None.

### Security and tenancy decisions

- **No grant changed, and none was needed.** Task 9 adds no browser-callable
  function. `20260901010201` therefore issues no `GRANT` and no `REVOKE`, is
  **not** registered as a grant-terminal in `scripts/approved-final-grants.mjs`
  (registering an empty terminal would add a boundary pivot where the boundary
  did not move), and instead **asserts** the boundary fail-closed: it refuses to
  apply if any periodontal table holds a browser/service DML privilege, if RLS
  is off on any of them, if either new private helper became callable, or if any
  of the four periodontal boundary functions lost `SECURITY DEFINER` /
  `search_path = ''`.
- **Tenant-safe foreign key.** `confirmed_provider_id` is constrained by
  `perio_exam_organization_confirmed_provider_fk` on
  `(organization_id, confirmed_provider_id) -> providers(organization_id, id)`.
  pgTAP proves a provider from another organization is refused `23503`.
- **The private helpers are unreachable.** `private.periodontal_measurement_digest`,
  `private.enforce_perio_classification_fingerprint` and
  `private.validate_perio_surface_index_context` are revoked from `public`,
  `anon`, `authenticated` and `service_role` adjacent to creation, and all three
  carry `set search_path = ''`.
- **FINAL immutability is a trigger, not application code.**
  `private.protect_finalized_perio_examination` and
  `private.reject_finalized_perio_child_mutation` reject the whole row and carry
  no column list, so they already covered every column added here. The suite
  proves that for the new columns rather than assuming it: a FINAL examination
  refuses a new risk input, a new confirmed classification and a fingerprint
  rewrite (`P0001`), and its children refuse a suppuration edit, a surface-index
  edit and a new tooth-property row (`P0001`).
- **Amendment lineage is constraints, not application code.**
  `perio_exam_amendment_reason_bounded_check`,
  `perio_exam_amendment_reason_scope_check` and
  `perio_exam_final_amendment_reason_check`, plus the pre-existing tenant-safe
  predecessor FK, the FINAL-predecessor/same-patient constraint trigger, and the
  pre-existing partial unique index
  `periodontal_examinations_one_amendment_idx` which already makes the chain
  non-forking.
- **Classification override is a constraint.**
  `perio_exam_override_reason_required_check` refuses a confirmation that
  differs from the derived classification without a reason. The reason stays on
  the RLS-protected row and is never copied into an audit event.

### Negative authorization and integrity cases covered (pgTAP)

Receptionist creating a periodontal examination (`42501 not authorized`);
a dentist from another organization against a foreign patient (`42501`); an
owner **with** an active provider link succeeding and being attributed to their
own provider; an owner **without** one opening a draft but being refused
finalization (`23514 periodontal_examinations_finalized_state_check`); a
confirming provider from another organization (`23503`); every new measurement
bound (`23514`, named constraint); the natural-tooth index family on an implant
and the peri-implant family on a natural tooth, from **both** write orders
(`23514`, trigger message); Miller class / CEJ / root concavity on an implant
(`23514`); furcation on an implant (`23514`); a seventh row on an existing
tooth/site pair (`23505`); a forked supersession chain (`23505`); a blank
amendment reason, a reason without a predecessor, and a FINAL amendment without
one (`23514`); a diagnosis outside the canonical set, a stage outside I-IV, a
staged gingivitis, a derived classification without its fingerprint, a
malformed fingerprint, a forged derived fingerprint and a forged confirmation
fingerprint (`23514`); and every FINAL immutability case (`P0001`).

### Existing test assertions changed, and why

**No existing assertion was weakened, deleted or altered.** Two suites gained
assertions:

- `periodontal_charting.test.sql`: a new section 7b asserts that the six sites
  of tooth 21, inserted in section 4l with no gingival margin, now carry a null
  margin and a null CAL, that their BOP and suppuration are null, and that the
  four explicitly scored plaque surfaces from section 5a still carry a boolean.
  Every pre-existing assertion, including the CAL derivation cases, passes
  unchanged because they all pass an explicit margin.
- `periodontal_current_state_guard.test.sql`: one assertion added proving the
  existing `save_periodontal_measurements` boundary still writes explicit
  `0/false` rather than unknowns, so no already-shipped write path silently
  became "not assessed".

The two script inventory tests were updated for the new counts, which is
mechanical.

### Commands run and observed results (local only)

- **RED gate, before implementation.**
  `docker exec -i supabase_db_local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/periodontal_full_chart.test.sql`
  - the boundary assertions 1-3 passed against the unchanged schema and the run
  then **aborted with
  `ERROR: function "private.periodontal_measurement_digest(uuid,uuid)" does not exist`**,
  every following statement reporting
  `ERROR: current transaction is aborted`.
- `npm run db:migrate:local` - applied `20260901010200` and `20260901010201`.
  The **first attempt failed closed** on the migration's own guard
  (`amend_periodontal_examination exam clone target not found exactly once`,
  SQLSTATE 55000): `20260828020400` is a CRLF file, so the stored function body
  carries CR characters no LF anchor could match. Both sides are now normalized
  to LF before matching and the anchors are counted by exact substring, never by
  regex. **Proved by replay**: the schema was torn down and the migration
  applied again from a deliberately CRLF-converted copy of both files, which
  succeeded and left both repaired bodies carrying the new columns.
- `npm run db:types:local` - **`Updated src/types/database.generated.ts.`**
- `npm run security:migrations` - **passed**; 321 files, 3099 statements, 1318
  privilege statements, 90 grant-terminals, 398 approved final privileges
  (unchanged - this task grants nothing).
- `npm run test:unit -- src/lib/odontogram/perio.test.ts src/lib/odontogram/schema.test.ts`
  - **2 files, 31/31 passed.**
- `npm run typecheck` - **passed, no output.**
- `npm run lint` - **0 errors**, the same 3 pre-existing warnings.
- `npm run test:db:local` - **halts at `treatment_plans.test.sql`**, the first of
  the three verified pre-existing failures. Everything before it passes,
  including `periodontal_charting`, `periodontal_full_chart`,
  `odontogram_permission_contract`, `odontogram_revamp_relationship_perio`,
  `odontogram_rpcs_v2`, `clinical_rpcs`, `clinical_record_composer` and
  `treatment_plan_actor_provider`.
- **Every one of the 109 pgTAP suites run directly**: 106 `P1_TEST_PASS`; the
  only failures are the three documented pre-existing ones -
  `treatment_plans.test.sql`, `seed_security_fixtures.test.sql` and
  `procedure_installment_schedules.test.sql`.
- `npx vitest run scripts/` - **13 files, 287/287 passed.**
- `npm run test:unit` (whole suite) - the pre-existing booking failures and the
  documented parallel-load flakes only. `perio-workspace.test.tsx`, which this
  task touched, **passes 7/7 when run alone**; it times out only under parallel
  load, exactly as recorded for Task 8.
- `git diff --check` - clean (only the repository's usual LF/CRLF notices).

### Not run, and why

- No `.local.mjs` concurrency test was added, so none was registered or run for
  this task. This checkpoint introduces no new advisory lock and no new
  concurrent write path.
- Playwright, responsive/accessibility device verification, Cloud TEST, hosted
  database tests and advisors: hosted access is not authorized. This checkpoint
  may be described only as locally implemented and locally verified.
- `npm run build`: not in the task gate and not run.

### Known residual risks and open questions

- **The currently granted `public.amend_periodontal_examination` cannot produce
  a FINAL amendment.** It creates the DRAFT correctly and now clones the full
  expanded record, but it has no parameter for the amendment reason, so
  `finalize_periodontal_examination` on that draft is refused by
  `perio_exam_final_amendment_reason_check`. This is deliberate and fail-closed:
  a supersession of finalized clinical history must say why. **Task 11 owns the
  reason-carrying amend boundary and must close this gap.** Revoking and
  re-granting the amend signature here would have churned a browser boundary in
  a task that adds none.
- **`create_periodontal_examination` and `finalize_periodontal_examination`
  still use `private.resolve_actor_provider`, not
  `private.require_active_actor_provider`.** They therefore allow an actor with
  no provider link to open a draft, and the branch is not checked when resolving
  the provider. The schema stops the worst case - such a draft cannot be
  finalized, proved by pgTAP - but the global constraint asks for
  `require_active_actor_provider` on every clinical write. **Flagged for the
  controller; Task 11 owns those RPCs.**
- **The plaque table is now a surface-record table.** It is still named
  `periodontal_plaque_measurements`. Renaming it would be a destructive
  migration for no functional gain; the table comment states what it holds.
- **The classification block is not cloned into an amendment.** A corrected
  measurement set must be re-derived and re-confirmed, and the predecessor's
  fingerprint would not match the successor's measurements. The examination-level
  risk snapshot **is** cloned, because the patient's risk at that visit is
  unchanged.
- **`perio_exam_org_encounter_idx` and `perio_exam_org_patient_draft_idx` are
  added for reads Task 11 and Task 12 will perform.** They are unused today.
- **No second single-successor index was created.** `20260828020508` already
  created `periodontal_examinations_one_amendment_idx` on exactly
  `(organization_id, predecessor_examination_id) where predecessor_examination_id
  is not null`. The suite now asserts it by name so it cannot be dropped
  silently. The redundant non-unique
  `periodontal_examinations_organization_predecessor_idx` from `20260828020200`
  was left alone as out of scope.
- **The digest depends on the `C` collation being available** for its aggregate
  ordering. It is a per-database provenance value and is never compared across
  databases.

### Next bounded task

Task 10 of the plan - port the pure periodontal calculation and classification
logic onto this model. Do not start it until this checkpoint is reviewed.
`20260901010202` onward are free.
