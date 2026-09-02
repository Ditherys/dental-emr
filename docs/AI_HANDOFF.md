# AI Handoff - Unified Clinical Chart workspace, Task 15

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

Task 9 is complete across `5dce284`, `372f1e0`, `6b5eaa2`, `4c8e3c5`, `f79f61d`
and `83de815`. Task 10 is `4053739` and `4836ae9`. Task 11 is `d589dbf`,
`fadd7e2` and `feb5a2f`. Task 12 is `49c5385`, `66a9502`, `03956f5` and
`2ec2a4d`. Task 13 is `1f9c97b`, `5ca0d04` and `6d0a252`. Task 14 is `c0485f6`
and `eb442f6`. Task 15 is this commit.

## Task 15 - the staged clinical interchange (2026-09-02)

### Bounded slice implemented

Import and export for the clinical chart, built around one organising rule:

> **Parsing is not a clinical write.**

A bounded upload becomes a tenant- and patient-scoped staging batch of
normalized candidates classified `NEW`, `DUPLICATE`, `CONFLICT` or
`UNSUPPORTED`. Nothing about that touches the chart. Only afterwards, and only a
clinician with an active provider link at the acting branch, may select
supported candidates and apply them - in one transaction, through the existing
managed-visit writer, appending records and never replacing anything.

Export is the mirror: registered and audited server-side **before** any document
exists or any download is offered, generated from authorized projections, and
never carrying a signed media URL or clinical text in a filename.

### What ADR-030 actually authorizes

ADR-030 decision 2 amends O12 to include "staged FHIR/JSON import, authorized
FHIR/JSON/PDF/SVG/PNG output, and private clinical photographs", and its
consequences section states the contract this task implements almost verbatim:
"Import is staged, tenant-scoped, bounded, reviewable, and dentist-confirmed;
parsing alone never writes canonical clinical state. Export is generated from
authorized canonical data, server-side permission-checked, and audited."

It authorizes a **mapping**, not a widening. Its revisit triggers name "the
interchange needs unsupported clinical mappings" explicitly, so the accepted
subset here is deliberately exactly the seven clinical codes the clinical record
composer already writes and the surfaces the canonical model already has.
`fhir-candidates.ts` moves from documentation-only to the tested mapping under
that authority, and says so at the top of the file.

### The staging schema - `20260901010410`

Three public tables, one private request-key table, three append-only guards.

- `public.clinical_import_batches` - format, **source digest**, staged count,
  `STAGED`/`APPLIED`/`ARCHIVED` lifecycle, tenant-safe composite foreign keys to
  branch, patient, `organization_members` and the applied encounter, plus shape
  checks pairing each lifecycle timestamp with its actor and reason.
- `public.clinical_import_candidates` - the normalized candidate in **typed,
  constrained columns**: FDI tooth pattern, the seven clinical codes, a
  containment/cardinality check on `surfaces`, a bounded note, and for an
  unrecognized resource a bounded `unsupported_label` plus a fixed
  `unsupported_reason`. A cross-column shape check makes the two candidate kinds
  mutually exclusive, and `applied_at` can only ever exist on a `TOOTH_FINDING`.
- `public.clinical_export_records` - who exported what shape of record, and
  nothing about the content.
- `private.clinical_interchange_idempotency` - actor-scoped request keys for
  staging, apply and export.

**The uploaded file is never stored, in any form.** What is retained is its
SHA-256 digest and the fields the reviewed parser produced. There is no jsonb
blob column and no place for one, which is the strongest available form of "do
not keep the untrusted document".

All three public tables have RLS enabled and **no policy at all**, and every
browser role is revoked on them - the same deny-by-default posture
`clinical_photographs` uses. The only reachable surface is the RPC boundary.

### The boundary - `20260901010411`

`private.clinical_import_candidate_classification` decides what a candidate is
against the patient's **live** canonical findings. Liveness is the projection's
own definition of `CURRENT`: not voided in place, **not withdrawn by an
append-only `tooth_clinical_entry_voids` row**, and not superseded. The
`voided_at` column alone would have been wrong here.

- `create_clinical_import_batch_v1(branch, patient, format, digest, candidates, key)`
  requires `patient.clinical.write`, derives organization and actor, validates
  the patient against the derived tenant, and **writes no clinical record and
  opens no encounter**. It revalidates every candidate: a **closed key
  allowlist** (which is what refuses `__proto__`, `constructor`, `prototype` and
  equally any embedded `organizationId`/`branchId`/`providerId`/`createdBy`), the
  FDI ranges, the accepted codes, surface membership and distinctness,
  whole-tooth versus surface compatibility, the bounded note, and the Philippine
  clinical-date bound. It then **re-derives the classification from the canonical
  chart and refuses a submitted classification that disagrees**, so a client can
  neither hide a conflict nor invent a duplicate.
- `get_clinical_import_batch_v1(branch, patient, batch)` - read-only projection,
  `patient.clinical.read`, foreign batch refused as unauthorized rather than
  reported absent, page bounded at 500. Every column reference is qualified
  against its own OUT parameter names, and it has a **success-path test**.
- `apply_clinical_import_batch_v1(branch, patient, batch, candidate_ids, key)` -
  requires `patient.clinical.write` **plus** `private.require_active_actor_provider`
  at the acting branch, taken *before* anything is written. Only a `STAGED`
  batch of this tenant, patient and branch; only candidate ids in that batch (a
  foreign id is `42501`, not a validation message); only supported `NEW` or
  `DUPLICATE` candidates. Each selected candidate is written through
  **`public.record_visit_tooth_findings`** with a deterministic per-candidate
  request key, so the managed visit, the derived provider, the clinical
  revalidation and the per-entry audit event are the reviewed ones and no
  authorization is duplicated.
- `archive_clinical_import_batch_v1` - bounded reason, `STAGED` only, reason
  stays on the RLS-protected row and never enters the audit event.
- `record_clinical_export_v1(branch, patient, format, scope, key)` - requires
  `patient.clinical.read`, holds format and scope to server-side allowlists, and
  returns a **synthetic-safe patient code** derived from the stored patient
  number and stripped to a filename alphabet, plus the Philippine clinical date.

Advisory-lock **seed 8** is new and exclusive to the interchange. Seeds 0-7
belong to the visit lifecycle, the composer and the periodontal workflows and are
untouched; seed 8 is always taken before the seed-2 and seed-1/0 locks
`record_visit_tooth_findings` takes, so lock ordering stays structural.

`private.audit_metadata_is_safe` was **not** widened. All three interchange audit
events carry `'{}'::jsonb`; the batch or export identifier lives in `entity_id`,
where it belongs.

### Grants - `20260901010412`

Five `execute` grants to `authenticated` and nothing else. **No table privilege
on any of the three new tables.** Nothing is revoked, so no registered grant is
superseded and no `supersededFrom` pivot is recorded.

### The parser

`src/lib/odontogram/interchange/normalize.ts` is a pure function of `(sourceText,
format)`. It opens nothing, fetches nothing and cannot reach a clinical table -
the only write the whole module can reach is the staging RPC, one call away in
`service.ts`. One depth-bounded walk decides whether the file may be read at all,
before any mapping happens:

| Rejection | Proven by |
| --- | --- |
| `SOURCE_TOO_LARGE` (1 MiB) | parser test + action schema test |
| `EMPTY_SOURCE` | parser test |
| `XML_NOT_SUPPORTED` | parser test (XML and HTML) |
| `NOT_JSON` | parser test |
| `INVALID_ENCODING` (NUL, lone surrogate) | parser test |
| `PROTOTYPE_POLLUTION` | parser test (3 shapes) **and** pgTAP `22023` |
| `EXECUTABLE_CONTENT` | parser test (`<script`, `javascript:`) |
| `EXTERNAL_REFERENCE` | parser test (`https:`, `file:`, `fullUrl`) |
| `EMBEDDED_AUTHORITY` | parser test (6 keys) **and** pgTAP `22023` |
| `DEPTH_EXCEEDED` | parser test |
| `UNKNOWN_VERSION` / `UNSUPPORTED_FORMAT` | parser test |
| `TOO_MANY_CANDIDATES` (500) | parser test **and** pgTAP `22023` |

Only absolute URIs on a five-entry terminology allowlist survive the external
reference check, so a document that names any other host is refused whole.

**A resource-level reference is ignored rather than rejected.** A FHIR
`Condition` may legitimately carry `subject`, `encounter`, `asserter`, `recorder`
and `performer`; the parser never reads any of them, and a test asserts the
normalized candidate has exactly six keys and matches none of those strings.
Envelope-level authority keys are a different matter and refuse the file. Whose
patient, whose branch and whose clinical authorship a record carries are decided
by the signed-in actor and the acting branch. Always.

An unrecognized record is not dropped and not applied: it becomes an
`UNSUPPORTED` candidate carrying a bounded label and a fixed reason, visible in
the review table with its checkbox disabled, and refused by the apply RPC.

### The review surface

Import is behind the toolbar's `More` menu, as the brief requires; export is its
own control beside it, because nesting a menu inside a menu item is not a
control. The dialog shows format, counts and a row per candidate; **only
supported `NEW` candidates are selected by default**; `CONFLICT` and
`UNSUPPORTED` checkboxes are disabled; and Apply stays disabled until an explicit
confirmation naming the signed-in provider and the clinical date is ticked. A
discarded review archives its batch rather than leaving it pending. An open
review is cleared during render when the route patient changes.

### Exports

`record_clinical_export_v1` runs first, always. For the two document formats the
server then builds them from `getPatientOdontogram` and
`get_clinical_progress_record_v1`; for PDF, SVG and PNG it returns only the
filename it may use and the browser produces the bytes from the **closed
renderer's** SVG. `sanitizeChartExportSvg` removes `script`, `style`,
`foreignObject`, `image` and anchors, strips every `on*` handler, every `href` and
`xlink:href`, and any attribute whose value points somewhere - `url(...)` fills
included - then clamps root width and height to 4096. `clampExportScale` holds a
raster export to 4x. `clinicalExportFilename` throws on a non-ISO date and emits
`clinical-chart-<code>-<date>.<ext>` and nothing else.

### Security and tenancy negatives covered

pgTAP, all `throws_ok` with exact SQLSTATE and message:

- foreign-organization patient staged against -> `42501 not authorized`
- foreign-organization branch as acting context -> `42501 not authorized`
- receptionist staging -> `42501 not authorized`
- dental assistant (clinical read only) staging -> `42501 not authorized`
- foreign-organization clinician reading the batch -> `42501 not authorized`
- receptionist applying -> `42501 not authorized`
- clinician with no active provider link at the acting branch applying ->
  `42501 not authorized`
- a candidate id that is not in this batch -> `42501 not authorized`
- a `CONFLICT` candidate -> `P0001 invalid state`
- an `UNSUPPORTED` candidate -> `P0001 invalid state`
- re-applying an `APPLIED` batch under a new key -> `P0001 invalid state`
- archiving an `APPLIED` batch -> `P0001 invalid state`
- applying an `ARCHIVED` batch -> `P0001 invalid state`
- bad tooth code / anterior occlusal surface / `__proto__` / embedded
  `organizationId` / mislabelled classification / unknown format / bad digest /
  501 candidates -> `22023 invalid input`
- unknown export format / unknown export scope -> `22023 invalid input`
- receptionist exporting -> `42501 not authorized`
- foreign-organization patient exported -> `42501 not authorized`
- rewriting a stored candidate -> `42501 import candidates are append-only`

Plus the positive properties that matter: staging leaves the tooth-entry count
and the encounter count byte-identical; every refused apply leaves the chart
exactly as it was; apply writes exactly the selected candidate and **not** the
unselected `DUPLICATE`; the pre-existing entry is asserted unchanged by version
and code; the applied entry carries the derived provider and the managed
encounter; the replay writes no second entry; and both audit events carry
`'{}'::jsonb`.

### Files added

- `supabase/migrations/20260901010410_clinical_interchange_staging.sql`
- `supabase/migrations/20260901010411_clinical_interchange_rpcs.sql`
- `supabase/migrations/20260901010412_clinical_interchange_rpcs_grants.sql`
- `supabase/tests/clinical_interchange.test.sql` (72 assertions)
- `src/lib/odontogram/interchange/{schema,normalize,service}.ts` (+ suites)
- `src/lib/odontogram/clinical-export.ts` (+ suite)
- `src/lib/odontogram/fhir-candidates.test.ts`
- `src/components/odontogram/clinical-import-dialog.tsx` (+ suite)
- `src/components/odontogram/clinical-export-menu.tsx` (+ suite)
- `src/app/(emr)/patients/[patientId]/odontogram-interchange-actions.ts` (+ suite)

Migration numbers were allocated after verifying the applied maximum was
`20260901010402` both on disk and in the applied chain. `010410`, `010411` and
`010412` all sort last.

### Files changed

- `src/lib/odontogram/fhir-candidates.ts` - promoted from documentation-only to
  the accepted ADR-030 mapping subset. Every pre-ADR-030 export is retained
  unchanged so nothing that read them breaks.
- `src/components/odontogram/clinical-chart-toolbar.tsx` (+ suite) - the
  `interchange` prop, the `More` menu item, the export control, and a
  render-phase reset of the open review on a patient change.
- `src/components/clinical/clinical-chart-workspace.tsx` and
  `src/app/(emr)/patients/[patientId]/clinical-section.tsx` - pass the
  interchange context through. **Neither is on the brief's file list**; they are
  the only places holding the route patient and the acting branch, so step 5 is
  not expressible without them.
- `scripts/remote-database-test-guard.mjs` (+ its suite) - the new suite is
  registered **before** `treatment_plans.test.sql`, because the local gate halts
  there.
- `scripts/approved-final-grants.mjs` - five new approved grants under a new
  terminal registration, each with its own reason. No supersede pivot: nothing
  is revoked.
- `scripts/boundary-privilege-invariant.test.mjs` - the mirror function list
  gains the same five signatures; `approved.size` 269 -> 274.
- `scripts/migration-privilege-lint.test.mjs` - files 341 -> 344, tables
  128 -> 132, functions 508 -> 517, SECURITY DEFINER 369 -> 378, each with the
  reason recorded inline.
- `supabase/tests/approved_grant_registry_integrity.test.sql` - 258 -> 263
  entries, regenerated from the registry so the two cannot drift.
- `src/types/database.generated.ts` - regenerated by `npm run db:types:local`.

### Files deleted

None.

### Existing assertions changed

**None.** No existing test assertion was weakened, deleted or rewritten. The
toolbar's "does not recreate the fork control wall" count of 12 buttons still
holds because it renders without `interchange`, and every interchange assertion
is a new test.

### Tests run and observed results

RED first, in both halves.

RED, TypeScript - the modules did not exist:

```
npx vitest run src/lib/odontogram/interchange/schema.test.ts
               src/lib/odontogram/interchange/normalize.test.ts
               src/lib/odontogram/fhir-candidates.test.ts
               src/lib/odontogram/clinical-export.test.ts
-> Test Files 4 failed (4) / Tests 9 failed | 1 passed (10)
   Failed to resolve import "./schema" from .../interchange/normalize.test.ts
   Failed to resolve import "./clinical-export"
   Failed to resolve import "./schema"
   TypeError: snomedToClinicalCode is not a function
   TypeError: fhirSurfaceToCanonicalSurfaces is not a function
   TypeError: canonicalSurfaceToFhirSurface is not a function
   TypeError: isSupportedFdiToothCode is not a function
```

RED, database - the boundary did not exist:

```
node <single-suite runner> supabase/tests/clinical_interchange.test.sql
-> ERROR: function "public.create_clinical_import_batch_v1(uuid,uuid,text,text,jsonb,uuid)"
          does not exist
```

Task gate, run exactly as the brief lists it:

```
npm run db:migrate:local     -> applied 010410, 010411, 010412; re-run reports
                                {"upToDate":true}
npm run db:types:local       -> Updated; +297 lines (the five functions and the
                                three new tables)
npm run security:migrations  -> passed (344 files, 3283 statements,
                                94 terminals, 410 approved)
npm run test:unit -- <the brief's eight files>
                             -> Test Files 8 passed (8) / Tests 117 passed (117)
npm run test:db:local        -> halts at supabase/tests/treatment_plans.test.sql
                                (pre-existing, unchanged), having already run:
                                PASS supabase/tests/clinical_interchange.test.sql
                                PASS supabase/tests/approved_grant_registry_integrity.test.sql
                                PASS supabase/tests/clinical_record_composer.test.sql
                                PASS supabase/tests/unified_clinical_visit.test.sql
                                PASS supabase/tests/odontogram_permission_contract.test.sql
                                PASS supabase/tests/clinical_progress_record.test.sql
                                ... 88 suites PASS in total before the halt
npm run typecheck            -> clean, no output
npm run lint                 -> 0 errors, 3 warnings (pre-existing, untouched
                                files)
```

Also run:

```
node <single-suite runner> supabase/tests/clinical_interchange.test.sql
                             -> P1_TEST_PASS (72 assertions)
node <single-suite runner> supabase/tests/approved_grant_registry_integrity.test.sql
                             -> P1_TEST_PASS
node <single-suite runner> supabase/tests/treatment_plans.test.sql
                             -> not ok 9 "treatment_plan_items has only the
                                approved fields and the canonical centavo
                                estimate" (the pre-existing halt; nothing in this
                                commit touches treatment_plan_items)
npx vitest run scripts/      -> 13 files, 288 tests passed
npm run test:unit (whole)    -> 2366 passed | 13 failed (207 files)
```

All thirteen whole-suite failures were checked and none is caused by this commit:

- 7 in `src/app/api/public/booking/route.test.ts` and
  `src/lib/booking/service.test.ts` - **reproduced on a clean `git stash -u` of
  this working tree** (`Tests 7 failed | 18 passed`), so they pre-exist. The same
  seven are recorded in the task 12, 13 and 14 handoffs.
- 6 in `fork-print-chart.test.tsx`, `perio-workspace.test.tsx` and
  `fork-package.test.ts` - all `Test timed out` under the 207-file parallel run
  rather than assertion failures. Run alone they pass, which is the same
  pre-existing parallel-run timeout earlier handoffs recorded.

### Tests not run, and why

- **Playwright - not run.** Hosted E2E is a release gate and was not authorized
  for this task. No E2E spec was added.
- `npm run test:db` (Cloud TEST) - not run. No hosted project was contacted.
- `npm run build` - not run; the task gate does not include it.
- `npm run storage:*` - not run. Nothing in this commit touches object storage.
- No `.local.mjs` concurrency test was added. The interchange takes a new
  advisory-lock seed and an actor-scoped request key on the same pattern the
  composer already has concurrency coverage for; a dedicated race test for two
  simultaneous applies of the same batch is a genuine gap and is listed below.

### Local-only versus Cloud TEST evidence

Everything above is **local only**. Cloud TEST, hosted E2E,
responsive/accessibility device verification, database advisors and final
security acceptance remain release gates. The dialog's responsive table scroll
and its 44px targets are asserted only by class in jsdom, which applies no
Tailwind. The PNG raster path is never exercised in jsdom - `canvas.toBlob` does
not exist there - so it is implemented and typed but not proven.

### Known residual risks and open questions

1. **Import provenance is batch-level, not entry-level.**
   `tooth_clinical_entries.provenance` admits only `LEGACY_PHASE15` and
   `INTERNAL`. Adding an `IMPORTED` value would mean widening a CHECK on the
   canonical clinical table and either a second insert path or replacing an
   applied granted function - both larger clinical decisions than this brief
   authorizes. Provenance is therefore the join batch -> `applied_encounter_id`
   -> entries, plus per-candidate `applied_at` and the audit event. An entry
   recorded manually in the same visit is not distinguishable from an imported
   one. **This is the one place where the brief's wording is met in substance
   rather than literally, and the controller should decide whether an ADR-030
   revisit is wanted.**
2. **Source size is bounded in TypeScript only.** The RPC never sees the source,
   only its digest, so SQL cannot re-check 1 MiB. Candidate count, string
   lengths, array lengths and every value domain **are** bounded in both places.
3. **Apply calls `record_visit_tooth_findings` once per candidate**, so a
   500-candidate batch makes 500 nested calls in one transaction, each taking an
   advisory lock and writing an idempotency row. Correct and bounded, but the
   cost is linear and untested at the ceiling; grouping candidates that share a
   code, surface set, date and note would reduce it and is a safe later
   refinement.
4. **No concurrency test for two simultaneous applies of one batch.** The
   `for update` on the batch row plus the seed-8 request lock should serialize
   them, and the per-candidate deterministic key should make the loser a replay,
   but that is reasoned rather than proven.
5. **A `resolved` Condition round-trips asymmetrically.** The exporter emits
   non-active statuses honestly; the importer's accepted subset is `active` only,
   so such a Condition re-imports as `UNSUPPORTED` rather than silently as an
   active finding. Narrowing on the way in is the safe direction, and it is
   documented at the builder.
6. **Export requires only `patient.clinical.read`**, so a dental assistant may
   export a chart. That follows the existing clinical read boundary and the
   progress record still withholds money without `billing.read`, but it is a
   policy point worth confirming.
7. **The progress export is bounded by the projection's default page** (200
   rows). A very long chronology exports its first page only, with no marker
   saying so.
8. **Two files outside the brief's list changed** -
   `clinical-chart-workspace.tsx` and `clinical-section.tsx` - because they are
   the only holders of the route patient and acting branch. Both changes are
   pass-through props.

### Areas Codex should scrutinize

- That `create_clinical_import_batch_v1` genuinely cannot reach a clinical table
  on any path, including the replay branch and every raise.
- That the closed key allowlist in the staging loop is exhaustive in both
  branches, and that no candidate field can carry an identifier forward.
- That the re-derived classification cannot disagree with
  `private.clinical_import_candidate_classification`'s own liveness definition -
  particularly the `tooth_clinical_entry_voids` and successor clauses.
- That `apply_clinical_import_batch_v1` cannot write a candidate outside
  `p_candidate_ids`, cannot write one twice across a retry, and that the
  `for update` on the batch plus seed 8 really serialize two concurrent applies.
- That `private.require_active_actor_provider` really runs before the first
  `record_visit_tooth_findings` call on every path.
- That the three append-only triggers admit exactly the intended transitions and
  nothing else, and that `raise insufficient_privilege` in a BEFORE trigger fails
  closed for a superuser-owned definer as well as for a browser role.
- That `sanitizeChartExportSvg` cannot be made to keep a URL - nested quotes,
  unquoted attributes, or an `<image>` split across a line.
- The claim that no signed URL, object key, token or clinical text appears in any
  filename, audit metadata, log or error path added here.

### Next bounded task

Task 16 - the print view and the fork removal. This task deliberately contains
neither, and did not touch the SVG generator or the fork package.
