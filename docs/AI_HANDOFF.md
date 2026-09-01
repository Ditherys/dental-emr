# AI Handoff - Unified Clinical Chart workspace, Task 14

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

Task 9 is complete across `5dce284`, `372f1e0`, `6b5eaa2`, `4c8e3c5`, `f79f61d`
and `83de815`. Task 10 is `4053739` and `4836ae9`. Task 11 is `d589dbf`,
`fadd7e2` and `feb5a2f`. Task 12 is `49c5385`, `66a9502`, `03956f5` and
`2ec2a4d`. Task 13 is `1f9c97b`, `5ca0d04` and `6d0a252`. Task 14 is this
commit.

## Task 14 - the private clinical photograph gallery in the chart toolbar (2026-09-02)

### Bounded slice implemented

Four things, all inside the photo domain:

1. `RADIOGRAPH` added to the canonical clinical photo categories, additively.
2. The gallery moved out of an always-open page region into a toolbar-opened
   `Sheet`, so private clinical images are not mounted underneath every
   charting session.
3. The composer's `PHOTO` record kind stopped being a dead signpost and now
   hands the photo workflow the teeth and clinical date already selected.
4. A latent defect found while writing the rename test: `rename_clinical_photo`
   could never succeed. Repaired.

### RADIOGRAPH is additive, and why it is not carved out of DIAGNOSTIC

A radiograph is a distinct clinical artefact from a clinical DIAGNOSTIC
photograph, so it becomes its own category **alongside** the existing seven.
Nothing was removed and no stored row was rewritten: reclassifying the
diagnostic photographs already recorded would be a clinical claim, not a code
change. The suite proves both directions - the widened constraint admits
`RADIOGRAPH`, still admits all seven legacy categories, still rejects an unknown
one (`23514`), and a pre-existing `DIAGNOSTIC` row created before the widening
is asserted still present and still listed afterwards.

`20260901010400_clinical_photo_radiograph_category.sql` widens
`clinical_photographs_category_check` and the `p_category` guard inside
`public.create_clinical_photo`. The function is replaced through the guarded
`pg_get_functiondef` DO-block pattern, never a top-level `CREATE OR REPLACE`:
ADR-017 would require an adjacent REVOKE that would destroy the `authenticated`
grant this migration has no authority to re-issue. Guards fail closed on `55000`
- pre-guards on `SECURITY DEFINER` and empty search_path, the anchor counted
exactly once against the **applied** body before writing, post-guards asserting
the new category present AND every legacy category still present AND the posture
unchanged AND the grant boundary intact in both directions (`authenticated` may
execute; `anon` and `service_role` may not).

**No paired grants migration.** Neither migration creates a callable surface,
grants anything, or revokes anything, so `scripts/approved-final-grants.mjs`,
`scripts/boundary-privilege-invariant.test.mjs` and
`supabase/tests/approved_grant_registry_integrity.test.sql` are unchanged and
their counters stand at 405 / 269 / 258. No `supersededFrom` pivot is recorded
because no registered grant is revoked.

### PHOTO_RENAME - inherited decision, and what was chosen

**Option (b): renames do not belong in a clinical progress note.** Task 13 left
`PHOTO_RENAME` in the event union unproduced and asked the photo domain to
settle it. A rename changes a display label; it changes no clinical fact, no
date, no tooth, no image and no attribution. A clinical progress note is a
chronology of clinical facts, so a label edit is not a member of it. The change
is not unrecorded: `rename_clinical_photo` writes `clinical.photo.renamed` to
`audit_events` with the actor, branch and patient, which is the correct home for
an administrative edit under audit retention.

Neither declined shortcut was taken: `private.audit_metadata_is_safe` was not
widened, and the clinical chronology was not sourced from the security audit
log. The union member stays so the row contract remains exhaustive over
everything the record could say about a photograph, with the reasoning recorded
at the declaration in `src/lib/odontogram/progress-record.ts` and the existing
pgTAP assertion continuing to prove nothing fabricates it.

### The latent defect: a clinical photograph could never be renamed

`public.rename_clinical_photo` declares `RETURNS TABLE(..., version integer)`,
which makes `version` a PL/pgSQL OUT variable. Its UPDATE said
`version=version+1 ... returning version into v_version` against
`public.clinical_photographs`, and PostgreSQL rejects that at runtime with
`42702 column reference "version" is ambiguous`. **Every authorized rename
failed.** `clinical_photographs.test.sql` only ever asserted rename's rejection
paths, so nothing caught it. Task 14's brief requires a safe display-name
rename, so `20260901010401_clinical_photo_rename_version_ambiguity_repair.sql`
aliases the target relation. The statement still writes only `display_filename`
and the concurrency `version` - no object key, no byte, no checksum moves. Same
guarded replace pattern, with pre-guards additionally requiring the archive,
stale-version and source-MIME guards to already be present so the repair cannot
resurrect an older body.

**A sibling of this defect is still live and was NOT fixed here.**
`public.record_procedure_followup` also declares `RETURNS TABLE(..., version
integer)` and contains `update public.procedure_cases set version=version+1 ...
returning version into version`. Its pgTAP coverage asserts only grants and the
anonymous denial - no success path - so it is very likely broken the same way.
It is a different clinical domain (procedure follow-ups) with its own fixtures,
and repairing it silently inside the photo task would be scope creep on a
clinical write path this task does not own. **Escalated to the controller.**

### Originals, derivatives and the private-media boundary

Nothing in this commit touches storage. The source original is still uploaded
once through the presigned adapter URL, verified by `stat` for size and MIME,
and never re-encoded or replaced. Derivatives are still `thumbnail`, `preview`
and `display` requested as semantic variants through the same provider-neutral
adapter, still permission-checked by `public.get_clinical_photo_derivative`, and
still never the sole clinical copy. No Cloudinary, no client-supplied
transformation parameter, no new dependency of any kind. No presigned URL,
object key or token appears in any log, audit metadata or error path added here
- greped over the whole diff.

Archiving remains archive, not delete: the row is retained with `archived_at`,
`archived_by` and `archive_reason`, the source object stays attached, and the
suite asserts all three plus the photo leaving the active gallery list.

### The gallery panel

`src/components/clinical/clinical-gallery-sheet.tsx` - a shadcn `Sheet`
(`side="right"`, `sm:max-w-4xl`). Radix unmounts closed content, so while the
panel is closed **no clinical image is in the document and no private derivative
URL is minted at all**; that is asserted, not incidental. The gallery supplies
the visible heading, so the sheet's own title is `sr-only` rather than a second
title for the same thing, and the default corner close button is replaced by an
explicit `min-h-11` "Close photographs" control that cannot collide with the
gallery's own header row. A failed photograph load reports its bounded retry
inside the panel, where the clinician went looking for it, instead of as an
inline region that reads as an empty gallery.

An open panel is closed when the route patient changes, in the same render-phase
reset that already clears the chart view, so no frame can show one patient's
photographs against another patient's chart.

### Attaching a photograph from the composer

The composer sits four layers below the surface that owns the upload flow, so
the callback travels through a context - `ClinicalPhotoAttachmentProvider` /
`useClinicalPhotoAttachment` - exactly as the chart view already does, rather
than through a prop chain that would make four intermediate layers look like
they had a say in clinical media. The context carries only
`{ toothCodes, clinicalDate, procedureCaseId }`: no organization, no branch, no
provider, no patient identity. Every one of those is re-derived server-side.

`attach` is `null` for a user without clinical write, so the composer keeps its
signpost rather than offering a button that does nothing. `PhotoUploadDialog`
now re-applies the opening context on every open (a render-phase sync keyed on
the context, not an effect), because it stays mounted between uploads and would
otherwise carry an earlier visit's tooth selection into a new photograph.

`photoCaptureAtFrom` completes the composer's clinical **date** with the
clinician's own wall-clock time, so the prefilled instant lands on the day being
charted rather than on a server's UTC day. It adds no ninth
`statement_timestamp()::date` site; it is browser-local and fully editable.

**Recording photo metadata still creates no clinical encounter.**
`create_clinical_photo` opens none, and the suite asserts the
`clinical_encounters` count for the patient is byte-identical across a
radiograph being recorded. Receptionist authority is unchanged: the suite
asserts a receptionist is refused `42501 not authorized` on a `RADIOGRAPH`
exactly as on every other category, and no permission constant was touched.

### Security and tenancy negatives covered

All `throws_ok` with exact SQLSTATE and message:

- foreign branch recording a radiograph -> `42501 not authorized`
- foreign-organization patient -> `42501 not authorized`
- receptionist -> `42501 not authorized`
- unknown category `MRI` direct insert -> `23514` on the named constraint

Plus, in TypeScript: the action refuses `category: "MRI"` with `INVALID_INPUT`
**before** calling the service, and the service refuses it before any RPC.

### Files added

- `supabase/migrations/20260901010400_clinical_photo_radiograph_category.sql`
- `supabase/migrations/20260901010401_clinical_photo_rename_version_ambiguity_repair.sql`
- `supabase/tests/clinical_photo_radiograph.test.sql`
- `src/components/clinical/clinical-gallery-sheet.tsx` (+ suite)

Migration numbers were allocated after verifying the applied maximum was
`20260901010311` both on disk and in the applied chain. `010400` and `010401`
both sort last.

### Files changed

- `src/lib/clinical-media/types.ts` - `RADIOGRAPH` in `PHOTO_CATEGORIES`, with
  the note that this list mirrors the database constraint and is never a second
  authority. `photoCategorySchema` derives from it, so the Zod boundary,
  the action boundary and the upload dialog all follow from the one edit.
- `.../photos/clinical-photo-gallery.tsx`, `.../photos/photo-upload-dialog.tsx` -
  the `Radiograph` label; the dialog additionally re-applies its opening context.
- `src/components/clinical/clinical-chart-workspace.tsx` - the gallery region
  became the gallery panel; the scroll-into-view `useRef` is gone.
- `src/components/odontogram/clinical-record-composer.tsx` - `PHOTO` offers the
  attachment path when a photo workflow is mounted, and keeps its signpost when
  one is not.
- `.../patient-workspace.tsx` - mounts the provider, holds the attachment
  context, and passes the patient's open procedure cases to the dialog so a
  photograph can be linked to a case the clinician chooses.
- `src/lib/odontogram/progress-record.ts` - comment only, recording the
  `PHOTO_RENAME` decision at the declaration.
- `scripts/remote-database-test-guard.mjs` - the suite is registered **before**
  `treatment_plans.test.sql`, because the local gate halts there.
- `scripts/remote-database-test-guard.test.mjs` (registered-suite list) and
  `scripts/migration-privilege-lint.test.mjs` (files 338 -> 340) - the
  registry-integrity property required both to move, which is the point of it.
  No other counter moves: both migrations declare nothing at top level.
- `src/types/database.generated.ts` - regenerated by `npm run db:types:local`;
  **no diff**, because a CHECK constraint is not part of the generated types.

### Files deleted

None.

### The existing assertions that changed, and why

Three, all consequences of the plan's own instruction to move the gallery into a
toolbar-opened panel. Nothing was weakened or deleted.

1. `clinical-chart-workspace.test.tsx` - *"shows one chart mode at a time and
   keeps the progress record and gallery mounted"*. The gallery is deliberately
   no longer mounted, so the title dropped "and gallery" and the assertion
   inverted to `not.toBeInTheDocument()`. A **new** test covers the gallery
   through the toolbar: open from `More` -> panel visible -> close -> gone.
2. `clinical-chart-workspace.test.tsx` - *"offers a bounded photograph retry..."*.
   Same two assertions, now reached by opening the panel first. It additionally
   asserts the gallery is still absent while the failure shows.
3. `clinical-record-composer.test.tsx` - the signpost loop kept `Photo` with an
   in-file comment saying Task 14 would take it. It still asserts the signpost
   where no photo workflow is mounted; a **new** test covers the attachment path
   where one is.

### Tests run and observed results

RED first, in both halves.

RED, database - the migration did not exist:

```
node <single-suite runner> supabase/tests/clinical_photo_radiograph.test.sql
-> not ok 1 - the canonical category constraint admits RADIOGRAPH
-> ERROR: invalid input   (create_clinical_photo rejected RADIOGRAPH)
```

RED, TypeScript - the sheet and the attachment context did not exist:

```
npx vitest run clinical-gallery-sheet clinical-photo-gallery photo-upload-dialog
               clinical-chart-workspace clinical-record-composer
-> Test Files 5 failed (5) / Tests 5 failed | 28 passed (33)
   Failed to resolve import "./clinical-gallery-sheet"
   Failed to resolve import "@/components/clinical/clinical-gallery-sheet"
   expected element not.toBeInTheDocument()      (gallery still page-mounted)
   RADIOGRAPH absent from the category options
   expected "PROGRESS" to be "RADIOGRAPH"        (prefill not re-applied)
```

Then, mid-implementation, the rename RED that found the live defect:

```
ERROR: column reference "version" is ambiguous
  QUERY: update public.clinical_photographs set ... returning version
  CONTEXT: PL/pgSQL function public.rename_clinical_photo(...) line 12
```

Task gate, run exactly as the brief lists it:

```
npm run db:migrate:local     -> applied 20260901010400, then 20260901010401
npm run db:types:local       -> Updated; NO diff
npm run test:unit -- clinical-gallery-sheet.test.tsx clinical-photo-gallery.test.tsx
                     photo-upload-dialog.test.tsx actions.test.ts service.test.ts
                             -> Test Files 5 passed (5) / Tests 40 passed (40)
npm run test:db:local        -> halts at supabase/tests/treatment_plans.test.sql
                                (pre-existing, unchanged), having already run:
                                PASS supabase/tests/clinical_photo_radiograph.test.sql
                                PASS supabase/tests/clinical_photographs.test.sql
                                PASS supabase/tests/clinical_progress_record.test.sql
                                PASS supabase/tests/approved_grant_registry_integrity.test.sql
npm run storage:start:local  -> PASS (dental-emr-local ready, CORS preflight verified)
npm run storage:smoke:local  -> PASS all 10 steps: put/stat/get, upload-url and
                                download-url signature parameters verified without
                                printing the URLs, browser preflight + PUT + GET
                                from the pinned origin, delete, stat-after-delete
                                READ_FAILED as expected
npm run typecheck            -> clean, no output
npm run lint                 -> 0 errors, 3 warnings (pre-existing, untouched files)
```

Also run:

```
npm run security:migrations  -> passed (340 files, 93 terminals, 405 approved)
npx vitest run src/lib/odontogram/progress-record.test.ts
               scripts/remote-database-test-guard.test.mjs
               scripts/migration-privilege-lint.test.mjs
                             -> 3 files, 86 tests passed
npm run test:unit (whole)    -> 2246 passed | 10 failed (199 files)
```

All ten whole-suite failures were checked and none is caused by this commit:

- 7 in `src/app/api/public/booking/route.test.ts` and
  `src/lib/booking/service.test.ts` - **reproduced on a clean `git stash` of
  this working tree**, so they pre-exist.
- 3 in `fork-print-chart.test.tsx` and `perio-workspace.test.tsx` - all three
  are `Test timed out in 5000ms` under the 199-file parallel run, not assertion
  failures. Run alone: `2 files, 16 tests passed`. This is the same pre-existing
  parallel-run timeout the task 12 and task 13 handoffs recorded.

Run **directly**, because the local gate halts before the end:

```
psql < supabase/tests/clinical_photo_radiograph.test.sql          -> P1_TEST_PASS
psql < supabase/tests/clinical_photographs.test.sql               -> P1_TEST_PASS
psql < supabase/tests/approved_grant_registry_integrity.test.sql  -> P1_TEST_PASS
```

### Tests not run, and why

- **Playwright - not run.** Hosted E2E is a release gate and was not authorized
  for this task. No E2E spec was added.
- `npm run test:db` (Cloud TEST) - not run. No hosted project was contacted.
- `npm run build` - not run; the task gate does not include it.
- No `.local.mjs` concurrency test was added. Nothing here introduces a new
  lock or a new optimistic-concurrency path; `rename_clinical_photo` keeps its
  existing `for update` and `p_expected_version` check unchanged.

### Local-only versus Cloud TEST evidence

Everything above is **local only**, including the storage smoke, which ran
against local MinIO and not against R2. Cloud TEST, hosted E2E,
responsive/accessibility device verification, database advisors and final
security acceptance remain release gates. The sheet's responsive width and the
44px touch targets are asserted only by class in jsdom, which applies no
Tailwind.

### Known residual risks and open questions

1. **`public.record_procedure_followup` is very likely broken** with the same
   `version` ambiguity repaired here for photographs, and has no success-path
   test. Not fixed: different domain, own fixtures, own review. This is the
   highest-value follow-up in this handoff.
2. **`clinical-chart-toolbar.tsx` is in the brief's Modify list and is
   UNCHANGED.** Disclosed rather than invented around: it already rendered the
   `Clinical photographs` menu item and already called `onOpenGallery`, so the
   panel needed nothing from it. The workspace owns the panel, as it owns the
   print action.
3. **The brief's Modify list omitted four files this slice genuinely required**:
   `clinical-chart-workspace.tsx` (+ suite) renders the gallery region, and
   `clinical-record-composer.tsx` (+ suite) owns the `PHOTO` kind. Neither step 3
   nor step 4 is expressible without them. `src/lib/clinical-media/types.ts` is
   likewise the only place `PHOTO_CATEGORIES` lives.
4. **`src/types/database.generated.ts` is in the Modify list and did not
   change.** A CHECK constraint is not represented in the generated types, so
   `category` remains `string` there. The Zod boundary is what narrows it.
5. **A radiograph is not pairable.** Before/after pairing stays restricted to
   `BEFORE`/`AFTER` exactly as before; a `RADIOGRAPH` behaves like `DIAGNOSTIC`
   in that respect. If clinicians want a before/after radiograph comparison,
   that is a pairing-semantics change and belongs in its own reviewed slice.
6. **The capture instant is completed from the browser clock.** The date comes
   from the composer's clinical date, which is correct, but the time-of-day is
   the workstation's. It is a prefill the clinician can correct before
   confirming, and it is never authorization.
7. **The gallery's own `border-t` reads oddly as the first element inside the
   panel.** Cosmetic only; left alone rather than restyling a component the
   brief did not ask to restyle.

### Areas Codex should scrutinize

- `20260901010400`: that the anchor really occurs exactly once in the applied
  body, that the constraint drop/add cannot lose a legacy category on a chain
  where the constraint was previously widened by hand, and that the post-guards
  would actually fail closed if `CREATE OR REPLACE` through `EXECUTE` ever
  dropped the ACL.
- `20260901010401`: that the aliased UPDATE writes exactly the same two columns
  as before, that `p_expected_version` optimistic concurrency and the `for
  update` lock are untouched, and that the repair cannot apply to a body that
  predates the MIME guard.
- Whether the render-phase prefill sync in `photo-upload-dialog.tsx` can drop a
  half-authored draft the clinician still wanted, and whether its context key
  can collide across two genuinely different openings.
- Whether closing the panel on a patient change is sufficient, or whether any
  already-minted derivative URL can outlive the patient context in
  `resolvedUrls`.
- That `attach = null` for a read-only user really leaves no write path, and
  that the composer's `PHOTO` branch cannot reach a write action.
- The claim that no presigned URL, object key or token enters a log, audit
  metadata or error path anywhere in this diff.

### Next bounded task

Task 15 - the clinical interchange. This task deliberately contains no
interchange and no print view.
