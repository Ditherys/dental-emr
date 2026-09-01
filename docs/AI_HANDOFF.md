# AI Handoff - Unified Clinical Chart workspace, Task 9 (review fixes, round 4)

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

This checkpoint is the fifth commit of Task 9. Rounds 1-4 of the review were
applied on top of `5dce284` as `372f1e0`, `6b5eaa2`, `4c8e3c5` and this commit.
The sections below describe the task as it now stands, with the review-fix
sections at the end, in order.

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
  child tables **and the examination-level staging and grading risk inputs**
  (round 1, finding 2), nulls rendered as `~` so `(3, null, 2)` and `(3, 2)`
  cannot collide, aggregate order pinned to the `C` collation. An AFTER
  constraint trigger refuses any
  `derived_`/`confirmed_measurement_fingerprint` that is not the true digest. It
  runs when a fingerprint column changes **and, unconditionally, on the
  DRAFT -> FINAL transition** (round 1, finding 1), and any change to the
  measurements it covers withdraws the whole classification block, so a stored
  fingerprint can never outlive its evidence.
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
- `supabase/tests/periodontal_full_chart.test.sql` (118 assertions after round 1)

### Files changed

- `supabase/tests/periodontal_charting.test.sql` - new section 7b only; nothing
  weakened (see below).
- `supabase/tests/periodontal_current_state_guard.test.sql` - one assertion
  added; nothing weakened.
- `scripts/remote-database-test-guard.mjs` - the new suite registered.
- `scripts/remote-database-test-guard.test.mjs`,
  `scripts/migration-privilege-lint.test.mjs` - inventory expectations
  (109 suites; 325 migration files; 491 created functions after rounds 1 and 2).
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

- **`public.amend_periodontal_examination(uuid,uuid,uuid)` is now revoked from
  every browser and service role** (round 1, finding 3). It accepts no amendment
  reason, so the DRAFT it creates can never be finalized - and that
  unfinalizable DRAFT permanently consumes the predecessor's only successor
  slot, because both the RPC's own duplicate guard and
  `periodontal_examinations_one_amendment_idx` key on
  `(organization_id, predecessor_examination_id)` regardless of status and no
  delete path exists for a DRAFT examination. One click of Amend would have made
  that examination unamendable forever.
- **Requirement recorded for Task 11**: `amend_periodontal_examination_v2` must
  accept a bounded amendment reason **and must be able to ADOPT or DISCARD a
  pre-existing reason-less DRAFT successor**, not merely insert a new row. Any
  predecessor amended before the revoke already has one, and an unconditional
  insert would fail for it.
- **The Amend control in `PerioWorkspace` now fails closed rather than
  poisoning.** The shipped path
  (`service.ts` -> `perio-actions.ts` -> `odontogram-section.tsx` -> `onAmend`)
  still exists; the server action catches the `42501` and returns a mapped
  not-authorized result. Task 12 rebuilds that surface.
- **`create_periodontal_examination` and `finalize_periodontal_examination`
  still use `private.resolve_actor_provider`, not
  `private.require_active_actor_provider`. The schema does NOT contain this.**
  The first commit claimed it did; round 1 disproved that and the claim is
  withdrawn. `finalize_periodontal_examination` sets
  `finalized_provider_id = coalesce(v_provider_id, v_exam.examined_provider_id,
  v_provider_id)`, so an actor with **no** provider link can finalize a DRAFT
  somebody else opened and the record is attributed to **that other clinician's**
  provider id. `resolve_actor_provider` also ignores the acting branch and
  `provider_branches.is_active` entirely. The pgTAP case only covers the narrow
  situation where the provider-less actor opened the draft himself with a null
  `examined_provider_id`. Pre-existing; **Task 11 owns those RPCs and must fix
  this.**
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

### Requirements Task 11 MUST honour

Both of these fail closed, but neither failure explains itself. They are stated
here, in the migration headers, in the relevant `comment on function`, and - for
the first - pinned by a pgTAP assertion that will still be there when Task 11
arrives.

1. **`amend_periodontal_examination_v2` must be able to ADOPT or DISCARD a
   pre-existing reason-less DRAFT successor, not merely insert a new row.**
   `periodontal_examinations_one_amendment_idx` keys on
   `(organization_id, predecessor_examination_id)` **regardless of status**, and
   there is no delete path for a DRAFT examination. Any predecessor someone
   amended through the old three-argument RPC before it was revoked already has
   a DRAFT sitting in its only successor slot; an unconditional insert returns
   `23505` for it, forever.
2. **Never write the examination-level risk inputs and a measurement fingerprint
   in the same `UPDATE`.** A `SET` expression is evaluated against the
   **pre-update** row while the AFTER verification trigger recomputes the digest
   against the **post-update** row, and the digest now covers the risk inputs.
   A mixed statement therefore raises
   `23514 derived measurement fingerprint does not match the examination measurements`
   even though the caller did nothing obviously wrong. Write the risk inputs in
   one statement, then derive and fingerprint in the next.

### Next bounded task

Task 10 of the plan - port the pure periodontal calculation and classification
logic onto this model. Do not start it until this review round is accepted.
`20260901010202`-`20260901010205` are reserved by Task 11's brief;
`20260901010232` onward are free.

## Review fixes applied in this commit (round 1)

Round 1 returned no Critical, three Important and six Minor findings. Three
Important and three Minor are fixed here; three Minor were ledgered by the
controller for Task 11 and deliberately not touched.

1. **A FINAL examination could permanently carry a fingerprint that never
   matched its measurements (Important).** The verification fired only when a
   fingerprint column itself changed and only on the examination row, so writing
   a true digest on a DRAFT, editing a child measurement and then finalizing
   produced an immutable record whose provenance was a lie. `20260901010210`
   closes it in the schema in two independent layers: statement-level triggers
   on all four child tables plus a row-level trigger on the examination withdraw
   the **whole** classification block - derived, confirmed, confirmer and
   override reason - whenever anything the digest covers changes; and
   finalization now re-verifies both fingerprints unconditionally on the
   DRAFT -> FINAL transition.
2. **The digest omitted the examination-level risk inputs (Important).**
   `age_years_snapshot`, `smoking_status`, `cigarettes_per_day`,
   `diabetes_status`, `hba1c_percent`, `teeth_lost_to_periodontitis` and
   `radiographic_bone_loss_percent` are staging and grading determinants and are
   mutable on a DRAFT, yet changing one left the fingerprint valid. They are now
   a fifth segment of the canonical digest. **Consequence for Task 11**: a SET
   expression sees the pre-update row while the AFTER verification sees the
   post-update row, so the risk inputs and a fingerprint must not be written in
   the same UPDATE. Write the risk inputs, then derive.
3. **The shipped amend path was a reachable dead end that poisoned the
   predecessor (Important).** `public.amend_periodontal_examination(uuid,uuid,uuid)`
   is reachable from shipped browser code and accepts no amendment reason, so
   the DRAFT it creates can never be finalized **and permanently consumes the
   predecessor's only successor slot**. Its browser grant is revoked, the
   registry records `supersededFrom` naming the revoking object migration, and
   the Task 11 requirement is written down: the replacement must be able to
   **adopt or discard** a pre-existing reason-less DRAFT successor.
4. **`keratinized_gingiva_mm` widened to `numeric(3,1)` (Minor).** The band is
   charted to 0.5 mm and the adjacent `gingival_thickness_mm` was already
   `numeric(3,1)`.
5. **Browser/database precision drift closed (Minor).** The validators claimed
   to mirror the CHECK constraints but accepted an HbA1c of 7.44 that
   `numeric(3,1)` silently rounds to 7.4. `isUnknownScale1NumberInRange` now
   enforces the scale for HbA1c, gingival thickness and keratinized width.
6. **`confirmed_by ... on delete set null` documented (Minor).** A column comment
   records that deleting a confirming user cannot succeed while a confirmation
   stands, that this mirrors the pre-existing `examined_by`/`finalized_by`
   pattern, and that it fails closed rather than quietly losing an author.

### A claim from the first commit that did not survive, and is withdrawn

The first commit said the schema blocked the worst provider-less case. It does
not. `finalize_periodontal_examination` sets
`finalized_provider_id = coalesce(v_provider_id, v_exam.examined_provider_id,
v_provider_id)`, so an actor with no provider link can finalize a DRAFT somebody
else opened and the record is attributed to that other clinician's provider id;
`resolve_actor_provider` also ignores the acting branch and
`provider_branches.is_active`. The pgTAP case only covers the narrow situation
where the provider-less actor opened the draft himself. Pre-existing, Task 11
owns it, and the mitigation is not carried forward.

### Files added this round

- `supabase/migrations/20260901010210_periodontal_classification_staleness_repair.sql`
- `supabase/migrations/20260901010211_periodontal_classification_staleness_repair_grants.sql`

### Existing test assertions changed this round, and why

- `odontogram_permission_contract.test.sql`: the "authenticated receives every
  reviewed O5/O8 signature" assertion listed
  `amend_periodontal_examination(uuid,uuid,uuid)`, which is now revoked. The
  clause was **replaced by a stronger assertion**, mirroring how the same file
  already handles the superseded `record_tooth_clinical_entry_v3` and the two v3
  relationship writers: the boundary is denied to `authenticated`, `anon`,
  `service_role` and `public`. Nothing was weakened.
- `periodontal_full_chart.test.sql`: 111 -> 118 assertions. Nothing changed; the
  staleness, digest-coverage, precision and revoke cases were added.
- `scripts/boundary-privilege-invariant.test.mjs`: the revoked signature left the
  effective-final fixture with a comment saying why; approved-key count
  266 -> 265.
- `scripts/migration-privilege-lint.test.mjs`: 321 -> 323 files, 486 -> 491
  created functions. The security-definer count is unchanged at 361 - none of
  the new helpers is `SECURITY DEFINER`.

### A pre-existing defect this round surfaced, unrelated to Task 9

`supabase/tests/clinical_treatment_events_v2.test.sql` assertion 80 fails
between 16:00 and 24:00 UTC. `public.post_charge` sets
`v_service_date := statement_timestamp()::date` - the **UTC** date - while the
test, and the rest of the clinical stack, use
`timezone('Asia/Manila', statement_timestamp())::date`. For a Philippine clinic
every charge posted after 00:00 Manila is dated to the previous day in the
ledger. `post_charge` is untouched by Task 9 and no periodontal object is on that
path. Flagged for the controller; it belongs to the billing domain (ADR-026).
**Round 2: the controller confirmed this and authorized the fix. See the round-2
section below.**

### Round-1 commands and observed results

- **RED probe for finding 1**, isolated so the failure prints:
  `not ok 1 - a new measurement resets the derived fingerprint` and
  `ok 2 - RED probe: the stored fingerprint no longer matches its measurements` -
  the defect reproduced exactly as described.
- **RED for the suite**: `periodontal_full_chart.test.sql` aborted at
  `ERROR: trigger "perio_site_reset_classification_update" for table
  "periodontal_site_measurements" does not exist`.
- `npm run db:migrate:local` - applied `20260901010210` and `20260901010211`.
- `npm run db:types:local` - regenerated; **no diff**, because `numeric(3,1)` and
  `smallint` both map to `number`.
- `npm run security:migrations` - **passed**; 323 files, 3135 statements, 1324
  privilege statements, 90 grant-terminals, 398 approved final privileges.
- `npm run test:unit -- src/lib/odontogram/perio.test.ts src/lib/odontogram/schema.test.ts`
  - **2 files, 33/33 passed.**
- `npm run typecheck` - **passed, no output.**
- `npm run lint` - **0 errors**, the same 3 pre-existing warnings.
- `npx vitest run scripts/` - **13 files, 287/287 passed.**
- `npm run test:db:local` - **54 suites pass, then halts at
  `clinical_treatment_events_v2.test.sql`** for the unrelated UTC/Manila reason
  above. Earlier today, before 16:00 UTC, the same command halted at
  `treatment_plans.test.sql` after 83 suites. Both periodontal suites, the new
  suite and `odontogram_permission_contract` pass in that run.
- `periodontal_full_chart.test.sql` run directly - **118 assertions,
  P1_TEST_PASS.** `periodontal_charting`, `periodontal_current_state_guard`,
  `odontogram_permission_contract`, `odontogram_revamp_relationship_perio`,
  `odontogram_rpcs_v2` and `clinical_rpcs` - all **P1_TEST_PASS**.
- A first attempt to run every suite directly **while `test:db:local` was still
  running** produced three spurious failures from lock contention
  (`ERROR: deadlock detected` in `calendar_sync_rpcs`, plus `foundation_rls` and
  `clinical_treatment_events_v2`). Re-run serially, `foundation_rls` passes and
  the calendar suite passes. That first run is not evidence and is recorded here
  only so the discarded output is not mistaken for a result.

## Review fixes applied in this commit (round 2)

Round 2 accepted every round-1 fix and added one authorization: correct the
charge posting-date derivation reported as a concern in round 1. Nothing else
was changed.

### The defect, confirmed by the controller and fixed here

`public.post_charge` derived the posting date it writes onto a charge as
`statement_timestamp()::date`. The database runs in UTC; the whole clinical stack
derives its date as `timezone('Asia/Manila', statement_timestamp())::date`. The
two disagree between 16:00 and 24:00 UTC, which for a Philippine clinic is
**00:00 to 08:00 Manila - the entire morning session**. Every charge posted in
that window was dated to the previous day in the ledger while the clinical record
it belongs to carried the correct day.

Observed directly on the live database while writing the fix:

```
tz  | ts_raw                        | utc_date   | manila_date
UTC | 2026-09-01 16:23:06.161414+00 | 2026-09-01 | 2026-09-02
```

The service-date / posting-date split itself is untouched: it is ordinary
double-entry practice and was accepted in Task 6. What changed is only the
timezone the posting date is derived in.

### Scope of the correction

`20260901010220` is a guarded forward replacement of one expression. Amounts,
allocation, attribution, permissions, grants and the append-only posture are
untouched; `CREATE OR REPLACE` preserves the ACL, `SECURITY DEFINER` and the
empty search path. The appointment-linked branch
(`v_service_date := v_appointment_starts::date`) is preserved and the migration
fails closed if it has gone missing. `20260901010221` asserts the boundary did
not move.

The controller identified two call sites, `20260828010500:630` and
`20260828010502:81`. Both are the same statement: `20260828010502` recreated
`public.post_charge` and carried the defect forward, so **only one survives in
the live catalog**. The migration guard asserts exactly one occurrence and
refuses to apply otherwise.

### Three further occurrences escalated rather than fixed in round 2

The same UTC expression appeared in three other billing functions. Each changes
what the system **accepts or reports** rather than what it records, which is a
billing behaviour decision reserved to the controller, and none of them blocked
the database gate. They were named for a ruling rather than guessed at.
**The controller ruled in round 3 that all three be fixed; they are, in
`20260901010230`. Listed here as they stood at the time of the escalation:**

- `public.post_charge_with_attribution_override` -
  `if p_service_date > statement_timestamp()::date` - between 00:00 and 08:00
  Manila this **rejects a valid same-day service date** as being in the future.
- `public.correct_charge_attribution` -
  `if p_corrected_service_date > statement_timestamp()::date` - same rejection on
  the correction path.
- `public.list_pending_pdc` -
  `(cheque.date_due - statement_timestamp()::date)::integer` - days-until-due is
  off by one in the same window.

Also **not** changed, and further from this task: seven patient-domain
`p_birth_date > current_date` guards (`create_patient` x2,
`find_duplicate_candidates`, `private.validate_patient_birth_date`,
`public_submit_booking_request`, `search_patients`, `update_patient`), which
reject a Manila-today birth date in the same window, and
`public.get_treatment_plan_completion_context`, which offers
`current_date::text` as a default service date to the completion surface.

### Files added this round

- `supabase/migrations/20260901010220_charge_posting_date_philippine_clinical_date.sql`
- `supabase/migrations/20260901010221_charge_posting_date_philippine_clinical_date_grants.sql`

### Files changed this round

- `scripts/migration-privilege-lint.test.mjs` - migration file count 323 -> 325.
- `docs/AI_HANDOFF.md` - this section, plus an explicit
  "Requirements Task 11 MUST honour" section.

No test assertion was changed, weakened or deleted this round. No periodontal
object was touched.

### Round-2 commands and observed results

- **RED, before the fix**: `clinical_treatment_events_v2.test.sql`
  `not ok 80 - the ledger keeps the posting date, which is deliberately not the service date`,
  `have: 2026-09-01 / want: 2026-09-02`.
- **Pre-fix billing baseline**, so a green suite afterwards could not be mistaken
  for a suite that had encoded the bug: `billing_charge_ledger`,
  `billing_authorization`, `postdated_cheques` and `financial_analytics` all
  **P1_TEST_PASS**; `procedure_installment_schedules` emitted no sentinel (the
  documented pre-existing failure). **No billing suite encoded the UTC behaviour
  as expected**, so nothing had to be weakened to make the fix pass.
- `npm run db:migrate:local` - applied `20260901010220` and `20260901010221`.
  Verified in the catalog: line 65 still
  `v_service_date := v_appointment_starts::date;`, line 67 now
  `v_service_date := (pg_catalog.timezone('Asia/Manila', pg_catalog.statement_timestamp()))::date;`.
- **After the fix**: `clinical_treatment_events_v2` **P1_TEST_PASS**;
  `billing_charge_ledger`, `billing_authorization`, `postdated_cheques`,
  `financial_analytics` all still **P1_TEST_PASS**;
  `procedure_installment_schedules` unchanged (still no sentinel, same as before
  the fix).
- `npm run test:db:local` - **82 suites pass, then halts at
  `treatment_plans.test.sql`.** The gate is back to the documented
  pre-existing halt point; round 1's halt on `clinical_treatment_events_v2` is
  gone.
- **Every one of the 109 pgTAP suites run directly, serially**: **106 pass**;
  the only failures are the three documented pre-existing ones -
  `treatment_plans`, `seed_security_fixtures`, `procedure_installment_schedules`.
- `npm run security:migrations` - **passed**; 325 files, 3138 statements, 1324
  privilege statements, 90 grant-terminals, **398 approved final privileges,
  unchanged**.
- `npm run db:types:local` - regenerated, **no diff** (a function body changed,
  no schema did).
- `npm run typecheck` - **passed, no output.**
- `npm run lint` - **0 errors**, the same 3 pre-existing warnings.
- `npx vitest run scripts/` - **13 files, 287/287 passed** after the file-count
  update.
- `git diff --check` - clean.

## Review fixes applied in this commit (round 3)

Round 3 ruled on the two items round 2 escalated. One was authorized and is
fixed; the other was deliberately declined, and the reasoning matters more than
the decision.

### Ruling accepted: the three remaining billing date guards are fixed

`20260901010230` repairs the same UTC-date expression in the three functions
round 2 named. Guarded replace per function, each target verified to occur
exactly once, each step failing closed on `55000`, and a post-condition refusing
to apply if any `statement_timestamp()::date` or `current_date` survives in the
repaired body.

Measured on the live database before the fix, which is the whole defect in one
row:

```
manila_today | utc_today  | manila_today_rejected_as_future | pdc_days_utc | pdc_days_manila
2026-09-02   | 2026-09-01 | t                               |            9 |               8
```

- `public.post_charge_with_attribution_override` -
  `if p_service_date > statement_timestamp()::date` refused **today's own date**
  during the 00:00-08:00 Manila window, telling the clinician it was in the
  future. Worse than the posting-date bug fixed in round 2: a wrongly recorded
  date can be corrected afterwards; a false rejection blocks the work and gives a
  reason that is not true.
- `public.correct_charge_attribution` - the same false rejection on the
  correction path, so the route out of a mis-dated charge was itself shut during
  those eight hours.
- `public.list_pending_pdc` - read-only, off by one: a cheque due in eight days
  reported as nine.

The bounds themselves are unchanged - a genuinely future service date is still
refused, the mandatory bounded correction reason is still mandatory, and the PDC
countdown still counts down. Only the definition of "today" moved, from the
server's timezone to the clinic's. `20260901010231` asserts that all **four**
repaired billing functions now agree, because a partial repair is the failure
mode worth catching: it would leave the ledger internally inconsistent.
**Framing correction (round 4):** that migration's own header says it asserts
"the whole billing surface now agrees on what today means". That was overstated
and the file is applied, so the sentence cannot be edited. What it actually
asserts - correctly - is that the **four repaired functions** agree. See the
round-4 section for the exact list of what agrees and what does not.

### Ruling accepted: the repository-wide sweep is NOT done here

The controller declined the seven patient-domain `p_birth_date > current_date`
guards (`create_patient` x2, `find_duplicate_candidates`,
`private.validate_patient_birth_date`, `public_submit_booking_request`,
`search_patients`, `update_patient`) and
`public.get_treatment_plan_completion_context`'s `current_date` default service
date. Their breadth is the point: this is a **repository-wide timezone
convention defect**, not a set of individual bugs, and the right response is one
deliberate sweep with its own review rather than incremental patching discovered
task by task by whichever agent happens to be nearby.

**Recommended shape of that sweep, recorded here as the controller asked:**

1. Add a shared helper - `private.clinic_today()` or equivalent - returning
   `timezone('Asia/Manila', statement_timestamp())::date`, so the convention has
   one definition instead of being retyped at every call site. It should be
   `stable`, `set search_path = ''`, and revoked from every browser and service
   role like the other private helpers.
2. Replace every remaining bare `statement_timestamp()::date` / `current_date` in
   a clinical or financial path with it, in one reviewed migration.
3. **Add a lint or test that fails on any NEW bare occurrence** in those paths.
   Without step 3 the convention will be retyped by the next person who needs a
   date, and the sweep will have bought one clean moment rather than a property.
   `scripts/migration-privilege-lint.mjs` already parses every migration into
   statements and is the natural place to host it.

Until that sweep runs, the declined sites still misbehave between 16:00 and
24:00 UTC. All fail closed - they reject rather than corrupt - which is why they
can wait; none of them blocks the database gate. The exact count and list are in
the round-4 section, which supersedes the "eight" stated here: the correct
figure is **eight**, and round 4 verified it against the live catalog rather
than by enumeration from memory.

### Files added this round

- `supabase/migrations/20260901010230_billing_date_guards_philippine_clinical_date.sql`
- `supabase/migrations/20260901010231_billing_date_guards_philippine_clinical_date_grants.sql`

### Files changed this round

- `scripts/migration-privilege-lint.test.mjs` - migration file count 325 -> 327.
- `docs/AI_HANDOFF.md` - this section, plus three round-2 statements the ruling
  falsified.

No test assertion was changed, weakened or deleted this round. No periodontal
object was touched.

### Round-3 commands and observed results

- **RED, arithmetic rather than anecdotal.** The guard predicate evaluated with
  `p_service_date = ` Manila today returned **`t`** - that is the RPC raising
  `invalid input` on a valid same-day date - and the PDC countdown differed by
  one day (9 UTC vs 8 Manila). Both shown in the table above.
- **Before/after billing and PDC suites**, run before touching anything so a
  green run afterwards could not be mistaken for a suite that had encoded the
  bug:

  | Suite | Before | After |
  | --- | --- | --- |
  | `billing_charge_ledger` | `P1_TEST_PASS` | `P1_TEST_PASS` |
  | `billing_authorization` | `P1_TEST_PASS` | `P1_TEST_PASS` |
  | `postdated_cheques` | `P1_TEST_PASS` | `P1_TEST_PASS` |
  | `financial_analytics` | `P1_TEST_PASS` | `P1_TEST_PASS` |
  | `clinical_treatment_events_v2` | `P1_TEST_PASS` | `P1_TEST_PASS` |
  | `procedure_installment_schedules` | no sentinel | no sentinel (unchanged) |

  **No billing or PDC assertion encoded the UTC behaviour**, so nothing had to be
  weakened and nothing was. I also read the two suites that reference the three
  repaired functions first: `billing_authorization` and `financial_analytics`
  assert only their grants and definer posture, never a date value or a
  future-date rejection.
- `npm run db:migrate:local` - applied `20260901010230` and `20260901010231`.
  Verified in the catalog: all three expressions now read
  `(pg_catalog.timezone('Asia/Manila', pg_catalog.statement_timestamp()))::date`.
- `npm run test:db:local` - **82 suites pass, then halts at
  `treatment_plans.test.sql`** - the documented pre-existing point, unchanged
  from round 2.
- **All 109 pgTAP suites run directly and serially: 106 pass**, only the three
  documented pre-existing failures (`treatment_plans`,
  `seed_security_fixtures`, `procedure_installment_schedules`).
- `npm run security:migrations` - **passed**; 327 files, 3143 statements, 1324
  privilege statements, 90 grant-terminals, **398 approved final privileges,
  unchanged**.
- `npm run db:types:local` - regenerated, **no diff** (three function bodies
  changed, no schema did).
- `npm run typecheck` - **passed, no output.**
- `npm run lint` - **0 errors**, the same 3 pre-existing warnings.
- `npx vitest run scripts/` - **13 files, 287/287 passed** after the file-count
  update.
- `git diff --check` - clean.

## Review fixes applied in this commit (round 4)

Round 4 asked for one substantive fix: a ninth UTC-date site at
`20260828020400_odontogram_rpcs.sql:3074`, inside
`public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,uuid,bigint,date)`.

### The ninth site does not exist, and the live path is already correct

That function was **dropped**, by
`20260828020527_atomic_treatment_completion.sql:13`:

```
drop function if exists public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,uuid,bigint,date);
```

The line the review cited is dead code inside an applied historical migration; it
can never execute again. The live catalog holds only the seven-argument
replacement `(uuid,uuid,integer,bigint,text,jsonb,text)`, which takes **no
service date at all**. It delegates to
`private.complete_treatment_plan_item_with_charge_serialized_impl`, which calls
`public.post_charge` and then reads the posted `service_date` back out of the
charge row to stamp the clinical entry, bridge and implant components.

So the path is already correct - and correct **because of round 2**. Fixing
`post_charge` transitively fixed the service date on this charge-creating
clinical path, including the `effective_at` of everything materialized from it.
That was not something round 2 set out to do and is worth recording.

No migration was written for a function that does not exist, and there is no
fifth function for the `20260901010231`-style assertions to cover.

### The real defect was in the registry, and there were three of them

The review's other observation was exact: `scripts/approved-final-grants.mjs`
carried neither `supersededBy` nor `supersededFrom` for that signature, so on the
registry's own account it remained an approved `authenticated` privilege.

Rather than check the one entry, every registered function grant was
cross-checked against the live catalog with `to_regprocedure`. **Three** entries
name functions that no longer exist and carried no supersede marker - all in
`odontogramO5Grants`, all dropped long ago:

| Registry entry | Dropped by | Replaced by |
| --- | --- | --- |
| `transition_treatment_plan_item_execution(uuid,uuid,integer,text,text)` | `20260828020526` | `(uuid,uuid,integer,text,text,text)` |
| `correct_treatment_plan_item_execution(uuid,uuid,integer,text,text)` | `20260828020526` | `(uuid,uuid,integer,text,text,text)` |
| `complete_treatment_plan_item_with_charge(uuid,uuid,integer,uuid,bigint,date)` | `20260828020527` | `(uuid,uuid,integer,bigint,text,jsonb,text)` |

All three now carry `supersededFrom` naming the **object migration that drops
them** - never a grants file - and `supersededBy` naming the registered
replacement. The nested-ternary marker chain became a named lookup map,
`ODONTOGRAM_O5_SUPERSEDED`, because six markers in a ternary chain is not
readable. **The refactor was proved equivalent**: the full resolved
`TERMINAL_MIGRATIONS` structure was dumped before and after and differed in
exactly the three intended markers and nothing else.

Effect: the observable final boundary set drops from 265 to 262 browser-reachable
keys, and `scripts/boundary-privilege-invariant.test.mjs` no longer expects three
privileges the database cannot hold.

### Framing correction: precisely who agrees on what "today" means

`20260901010231`'s header claims it asserts that "the whole billing surface now
agrees". That was overstated, and the file is applied so the sentence stands.
What it actually asserts, correctly, is that the four repaired functions agree.
Verified against the live catalog rather than from memory:

**Derive the Philippine clinical date (repaired in rounds 2 and 3) - 4:**
`post_charge`, `post_charge_with_attribution_override`,
`correct_charge_attribution`, `list_pending_pdc`. Eleven functions in total
reference `Asia/Manila`, the other seven being the clinical stack that always
did.

**Still derive from the server clock - 8, all deferred to the sweep by the
controller's round-3 ruling:** `private.validate_patient_birth_date`,
`public.create_patient` (two signatures), `public.find_duplicate_candidates`,
`public.public_submit_booking_request`, `public.search_patients`,
`public.update_patient` - the seven patient birth-date guards - and
`public.get_treatment_plan_completion_context`, which offers `current_date` as a
default service date.

Eight is the correct figure and it was measured, not counted from memory. The
recommended sweep - `private.clinic_today()` plus a lint that fails on any new
bare occurrence - is unchanged and remains the named residual.

### Nits

- `scripts/approved-final-grants.mjs` - the round-1 comment block was glued to
  the end of an unrelated constant line. Separated.
- `supabase/tests/periodontal_full_chart.test.sql` - the unused
  `perio_reset_probe` temporary table is removed. It was dead scaffolding from an
  approach I abandoned.
- `20260901010231`'s bounds assertions check substring presence of the
  `if p_service_date >` prefix rather than that the branch still raises. The
  review was right that this reads stronger than it is. The file is applied and
  cannot be edited; no new migration was written for a readability point alone.
  Recorded here so the next reader is not misled about what that assertion
  proves.

### Files changed this round

- `scripts/approved-final-grants.mjs` - three supersede markers added, marker
  chain turned into a verified-equivalent lookup map, glued comment separated.
- `scripts/boundary-privilege-invariant.test.mjs` - three non-existent
  signatures removed from the effective-final fixture with a comment saying why;
  approved-key count 265 -> 262.
- `supabase/tests/periodontal_full_chart.test.sql` - dead temporary table
  removed.
- `docs/AI_HANDOFF.md` - this section, the framing correction, and two further
  Task 11 requirements.

**No migration was added this round**, because the reported defect had no live
target. No test assertion was weakened, deleted or inverted.

### Round-4 commands and observed results

- **Catalog proof that the ninth site is gone**: the exhaustive scan for
  `(statement_timestamp|now|clock_timestamp|transaction_timestamp)()::date` and
  `current_date` across every `public`/`private` function returns eight
  functions, none of them a treatment-completion RPC; and
  `complete_treatment_plan_item_with_charge` exists only in its seven-argument
  form, with no UTC date expression.
- **Registry cross-check**: all 271 registered function grants tested with
  `to_regprocedure`; exactly three resolve to nothing and lacked a marker.
- **Registry refactor equivalence**: before/after dump of `TERMINAL_MIGRATIONS`
  differed in exactly 3 markers, 0 other changes, same terminal order, same
  grant counts.
- Billing and PDC suites, unchanged by this round because no database object
  changed: `billing_charge_ledger`, `billing_authorization`, `postdated_cheques`,
  `financial_analytics`, `clinical_treatment_events_v2` all **P1_TEST_PASS**;
  `procedure_installment_schedules` still no sentinel.
  `periodontal_full_chart` and `odontogram_permission_contract` **P1_TEST_PASS**.
- `npm run test:db:local` - **82 suites pass, then halts at
  `treatment_plans.test.sql`**, the documented pre-existing point.
- **All 109 pgTAP suites run directly and serially: 106 pass**, only the three
  documented pre-existing failures.
- `npm run security:migrations` - **passed**; 327 files, 398 approved final
  privileges, unchanged.
- `npm run typecheck` - **passed, no output.**
- `npm run lint` - **0 errors**, the same 3 pre-existing warnings.
- `npx vitest run scripts/` - **13 files, 287/287 passed.**
- `git diff --check` - clean.
