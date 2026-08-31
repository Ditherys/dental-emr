# Unified Clinical Chart Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Complete one task, update `docs/AI_HANDOFF.md`, commit the checkpoint, and stop for independent review before starting the next task.

**Goal:** Replace the fragmented clinical tabs and demo-style odontogram integration with one database-backed, full-width Clinical Chart workspace that uses the controlled fork's anatomical capabilities, supports complete periodontal/peri-implant charting, and records dated, attributed, immutable clinical and financial history.

**Architecture:** PostgreSQL/Supabase remains canonical. Server actions validate untrusted input and call narrow, tenant-safe RPCs; RLS remains the final tenant boundary. The controlled fork at commit `5e28d931feefe4c3382513dbb0f5a9db9cf9948c` is a reviewed source reference, not a runtime state owner or moving dependency. Port only the approved anatomy assets, closed layer activation logic, and pure periodontal calculations into EMR-owned modules, preserve the MIT notice and source manifest, and render canonical DTO projections. The workspace is a native Next.js/React composition with a temporary tooth drawer, one shared record composer, three chart modes, and a server-projected chronological record.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, TypeScript strict, Tailwind CSS 4, shadcn/ui, Lucide, React Hook Form, Zod 4, Supabase/PostgreSQL with RLS and pgTAP, Vitest/Testing Library, Playwright, MinIO/R2 storage abstraction.

---

## Execution protocol and global constraints

- Work on `main` in `C:\Users\Latitude 7430\Desktop\dental-emr`; do not create a branch or worktree for this authorized local-completion window.
- Before each task, inspect `git status`, the task's target files, `docs/AI_HANDOFF.md`, and the relevant Next.js 16.3 guide under `node_modules/next/dist/docs/`. Do not rely on remembered Next.js APIs.
- Use only committed controlled-fork source from `Ditherys/React-Odontogram-Modul` commit `5e28d93`. The neighboring fork checkout is dirty and is not an approved copy source. Read reference files with `git -C "C:\Users\Latitude 7430\Desktop\React-Odontogram-Modul" show 5e28d93:<path>` and record every ported file/function in the source manifest.
- Preserve `vendor/react-advanced-odontogram/LICENSE` or move its MIT notice to a repository-owned third-party-notices location before deleting the runtime package.
- Never make fork payloads, browser state, SVG attributes, local storage, or demo data canonical. Every reload must rebuild the chart from authorized PostgreSQL projections.
- Classic view, reset actions, freehand drawing, drawing history, demo providers, demo records, demo treatment workflows, and fork local-storage persistence are excluded.
- No provider selector is allowed. Every clinical write derives the active provider from the signed-in user with `private.require_active_actor_provider`. An OWNER may treat only when that owner has an active provider link at the acting branch. Provider A remains a separate person.
- A receptionist may record/allocate a payment but may not create a clinical encounter, finding, plan, treatment, periodontal exam, or procedure charge.
- Procedure charges are confirmed once by the treating dentist, are immutable after confirmation, and may be paid immediately or through installments for any procedure. Later payments allocate to the intended procedure case and never mutate a single patient-balance field.
- Use guarded forward-only migrations. `npm run db:reset:local` is prohibited. Do not edit an applied migration. Check migration filenames before creating each listed migration.
- Every exposed tenant table gets RLS, tenant-safe foreign keys, important indexes, narrow grants, and negative authorization tests in the same checkpoint. Never trust client-supplied organization, branch, patient, encounter, or provider identifiers as authorization.
- Use deterministic synthetic data only. Do not put patient/clinical content, tokens, signed media URLs, or secrets in logs, test names, screenshots, fixtures, commits, or handoffs.
- Cloud TEST, hosted E2E, responsive/accessibility device verification, database advisors, and final security acceptance remain release gates. Local success may only be described as locally implemented/verified.
- Keep each task red-green-refactor: write the smallest failing test first, prove the expected failure, implement, run focused tests, then run the task gate. Do not weaken existing tests to make the implementation pass.
- At each checkpoint, review the diff for scope creep and sensitive data, update `docs/AI_HANDOFF.md` in its existing format, commit with the specified message, and stop for Codex review.

## Stable contracts used throughout the plan

Add these contracts early and evolve them only with a reviewed migration or domain-test change:

```ts
export type ClinicalChartMode =
  | "CURRENT_STATUS"
  | "TREATMENT_PLAN"
  | "PERIODONTAL";

export type ClinicalVisitState = {
  encounterId: string | null;
  status: "NOT_STARTED" | "OPEN" | "FINALIZED";
  clinicalDate: string;
  providerDisplay: string | null;
  version: number | null;
};

export type ClinicalChartViewport =
  | "FULL"
  | "UPPER"
  | "LOWER"
  | "QUADRANT_1"
  | "QUADRANT_2"
  | "QUADRANT_3"
  | "QUADRANT_4";

export type ClinicalRecordKind =
  | "FINDING"
  | "PLANNED_TREATMENT"
  | "TREATMENT_EVENT"
  | "BRIDGE"
  | "IMPLANT"
  | "NOTE"
  | "PHOTO";
```

The public action boundary must not accept `organizationId`, `treatingProviderId`, `createdBy`, or a provider display name. It may accept route-context `patientId` and `branchId`, but every service/RPC independently re-derives and validates their authorized organization and branch.

---

### Task 1: Freeze the canonical gap inventory and add a race-safe clinical visit lifecycle

**Files:**

- Create: `docs/ODONTOGRAM_CANONICAL_GAP_INVENTORY.md`
- Create: `supabase/migrations/20260901010100_unified_clinical_visit_lifecycle.sql`
- Create: `supabase/migrations/20260901010101_unified_clinical_visit_lifecycle_grants.sql`
- Create: `supabase/tests/unified_clinical_visit.test.sql`
- Create: `supabase/tests/clinical_visit_resume_concurrency.local.mjs`
- Modify: `supabase/tests/clinical_rpcs.test.sql`
- Modify: `supabase/tests/clinical_permission_contract.test.sql`
- Modify: `scripts/run-local-database-tests.mjs`
- Modify: `scripts/remote-database-test-guard.mjs`
- Modify: `scripts/approved-final-grants.mjs`
- Modify: `src/types/database.generated.ts`
- Modify: `src/lib/clinical/types.ts`
- Modify: `src/lib/clinical/schema.ts`
- Modify: `src/lib/clinical/service.ts`
- Modify: `src/lib/clinical/service.test.ts`

**Behavioral contract:**

```sql
start_or_resume_clinical_visit(
  p_branch_id uuid,
  p_patient_id uuid,
  p_appointment_id uuid default null,
  p_idempotency_key uuid default null
) returns table (
  encounter_id uuid,
  clinical_date date,
  status text,
  version integer,
  resumed boolean
)
```

The RPC derives the organization, actor, provider, and Philippine clinical date on the server. It creates at most one managed `OPEN` encounter for `(organization, branch, patient, provider, clinical_date)`, returns the same encounter for repeated/concurrent calls, audits only the create path, and never reopens a finalized record. Existing pre-workspace encounters remain readable and are not silently finalized, deleted, or rewritten.

- [ ] **Step 1: Record the verified schema and cutover inventory**

  Inspect current tables, constraints, indexes, RLS policies, function signatures/grants, services/actions, renderer imports, periodontal coverage, billing case/ledger boundaries, photo storage, treatment-plan drawing storage, and existing test registries. Record only verified gaps and map each gap to Tasks 1–17 and its planned forward migration. Explicitly record legacy compatibility data that must remain readable, old mutation boundaries that will be revoked, and the canonical source for every workspace projection. If the live local schema differs from Git migrations, stop rather than planning around local drift.

- [ ] **Step 2: Write failing pgTAP and concurrency tests**

  Cover dentist creation, owner-with-provider creation, owner-without-provider denial, receptionist denial, cross-tenant patient denial, inactive/wrong-branch provider denial, appointment mismatch, same-day resume, finalized-visit non-reopen, distinct patient/provider/day behavior, audit attribution, and two simultaneous calls returning one encounter ID. Prove separately that receptionist/dentist payment recording and allocation do not call this RPC or create an encounter. Add the new files to both local and remote test registries.

  Run: `npm run test:db:local`

  Expected: FAIL because the columns/RPC do not exist.

- [ ] **Step 3: Add forward-only lifecycle columns and uniqueness**

  Add nullable `clinical_date date` and `managed_visit boolean not null default false` to `clinical_encounters`. Preserve historical rows with `managed_visit = false` and `clinical_date = null`. Add a partial unique index scoped to managed open visits, plus the patient/branch/provider/date read index. Do not reconcile or mutate historical duplicate OPEN rows.

  Implement `private.require_active_actor_provider` reuse, `security definer set search_path = ''`, explicit schema qualification, a transaction-scoped advisory lock keyed by tenant/branch/patient/provider/date, and insert/select retry behavior. Validate patient organization and branch access independently of client input.

- [ ] **Step 4: Restrict the old manual-open boundary**

  Revoke `authenticated` execute on superseded provider/manual encounter creation paths that could bypass the managed lifecycle. Keep historical read/finalize/amend support. Update the approved grant registry so only the new narrow RPC is browser-callable.

- [ ] **Step 5: Add service and schema contracts**

  Add `startOrResumeClinicalVisit({ branchId, patientId, appointmentId?, idempotencyKey? })` and `ClinicalVisitState`. Do not accept a provider ID. Parse every RPC return with Zod and map PostgreSQL failures through the existing safe clinical error mapper.

- [ ] **Step 6: Verify migration and generated types**

  Run:

  ```powershell
  npm run db:start:local
  npm run db:migrate:local
  npm run db:types:local
  npm run security:migrations
  npm run test:unit -- src/lib/clinical/service.test.ts
  npm run test:db:local
  npm run typecheck
  ```

  Expected: all pass; local schema advances without reset.

- [ ] **Step 7: Checkpoint**

  Update `docs/AI_HANDOFF.md`, review `git diff --check`, and commit:

  `feat: add managed clinical visit lifecycle`

---

### Task 2: Build the unified full-width Clinical workspace shell

**Files:**

- Create: `src/components/clinical/clinical-chart-workspace.tsx`
- Create: `src/components/clinical/clinical-chart-workspace.test.tsx`
- Create: `src/components/clinical/clinical-visit-header.tsx`
- Create: `src/components/clinical/clinical-visit-header.test.tsx`
- Create: `src/components/clinical/medical-safety-summary.tsx`
- Create: `src/components/clinical/medical-safety-summary.test.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/patient-workspace.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/patient-workspace.test.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/clinical-section.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/clinical-section.test.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/page.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/clinical-actions.ts`
- Modify: `src/app/(emr)/patients/[patientId]/clinical-actions.test.ts`

**Layout contract:**

```text
Clinical heading + visit state/action
Medical-safety strip
Current status | Treatment plan | Periodontal
Full-width chart workspace
Chronological progress record
```

The outer patient profile retains its normal content limit; only the Clinical chart breakout spans the available viewport. There are no inner `Records`, `Odontogram`, or `Treatment plan` tabs and no standalone gallery section below Clinical.

- [ ] **Step 1: Write failing component tests for information architecture**

  Assert one `Clinical chart` landmark, the three mode buttons, a visible visit state, medical conditions/allergies/medications summary, and absence of the three legacy tab triggers. Assert that empty medical groups say `None recorded`, that long values wrap, that the chart breakout has no `max-w-7xl` constraint, and that chart/chronology/gallery load failures show bounded retry states without hiding the medical-safety strip or rendering stale data as current.

  Run: `npm run test:unit -- src/components/clinical/clinical-chart-workspace.test.tsx src/components/clinical/medical-safety-summary.test.tsx "src/app/(emr)/patients/[patientId]/clinical-section.test.tsx"`

  Expected: FAIL because the shell does not exist and tabs remain.

- [ ] **Step 2: Split clinical data from legacy presentation**

  Keep encounter/note/prescription and medical-history dialogs reachable from the new shell, but move the old encounter table out of the primary layout. Create a small `More clinical actions` menu for secondary operations. Do not delete historical capabilities in this checkpoint.

- [ ] **Step 3: Implement the native EMR shell**

  Use existing button/input/tab-segment tokens, Geist, restrained borders, 4–8px radii, and Lucide icons. Avoid a card grid, permanent columns, purple fork styling, decorative status pills, or marketing whitespace. Use `aria-pressed` mode buttons and keyboard-visible focus states.

- [ ] **Step 4: Wire visit state without eager creation**

  Load the current managed visit summary read-only on the server. `Start visit` calls the server action from Task 1; `Resume visit` uses the existing encounter; `Finalize visit` continues through the existing confirmation/amendment rule. Merely opening Clinical must not create an encounter.

- [ ] **Step 5: Verify focused UI and static gates**

  Run:

  ```powershell
  npm run test:unit -- src/components/clinical "src/app/(emr)/patients/[patientId]/clinical-section.test.tsx" "src/app/(emr)/patients/[patientId]/patient-workspace.test.tsx"
  npm run typecheck
  npm run lint
  ```

- [ ] **Step 6: Checkpoint**

  Update the handoff and commit:

  `feat: unify the patient clinical workspace shell`

---

### Task 3: Port the approved anatomical renderer behind an EMR-owned boundary

**Files:**

- Create: `docs/ODONTOGRAM_FORK_SOURCE_MANIFEST.md`
- Create: `src/components/odontogram/measured-assets.ts`
- Create: `src/components/odontogram/measured-assets.test.ts`
- Create: `src/components/odontogram/measured-fork-layers.ts`
- Create: `src/components/odontogram/measured-fork-layers.test.ts`
- Create: `scripts/generate-odontogram-svg-nodes.ps1`
- Create: `src/components/odontogram/generated/measured-svg-nodes.ts`
- Create: `src/components/odontogram/measured-svg-asset.tsx`
- Create: `src/components/odontogram/measured-svg-asset.test.tsx`
- Create: `src/components/odontogram/measured-tooth.tsx`
- Create: `src/components/odontogram/measured-tooth.test.tsx`
- Create: `src/components/odontogram/measured-chart.tsx`
- Create: `src/components/odontogram/measured-chart.test.tsx`
- Create: `src/components/odontogram/measured-feature-parity.test.tsx`
- Create: `src/lib/odontogram/renderer-projection.ts`
- Create: `src/lib/odontogram/renderer-projection.test.ts`
- Modify: `src/lib/odontogram/chart-projection.ts`
- Modify: `src/lib/odontogram/feature-contract.ts`
- Modify: `src/lib/odontogram/feature-contract.test.ts`
- Modify: `src/components/odontogram/fork-odontogram.tsx`
- Modify: `src/components/odontogram/fork-odontogram.test.tsx`
- Modify: `src/components/odontogram/fork-feature-parity.test.tsx`

**Renderer contract:**

```ts
type AnatomicalChartProps = {
  projection: CanonicalChartProjection;
  notation: "FDI" | "UNIVERSAL" | "PALMER";
  viewport: ClinicalChartViewport;
  selectedFdi: readonly number[];
  onSelectionChange(next: readonly number[]): void;
  readOnly?: boolean;
};
```

SVG anatomy is rendered from a reviewed, checked-in React node tree generated from the pinned repository assets. The generator uses a closed SVG tag/attribute allowlist, disables DTD/external entities, rejects scripts/events/external references, and records source hashes. Runtime code never fetches or parses SVG text and never uses `dangerouslySetInnerHTML`, `innerHTML`, `DOMParser`, plugin injection, arbitrary selectors, clinical SVG strings, or user-controlled asset URLs. State maps canonical codes to a closed registry of known fork layer IDs.

- [ ] **Step 1: Write parity tests before copying implementation**

  Add golden tests for permanent/primary anatomy and these canonical projections: healthy, missing, extracted, unerupted, impacted, retained root, implant fixture/abutment/crown, bridge abutment/pontic/connector, root-canal-treated roots, apical finding, caries by surface/root, restoration by material/surface, crown/veneer/inlay/onlay, sealant, orthodontic bracket/wire, rotation, mobility, and perio alert. Tests must inspect real `data-*` layer activation in the trusted SVG, not approximate rectangles.

  Run: `npm run test:unit -- src/components/odontogram/measured-fork-layers.test.ts src/components/odontogram/measured-tooth.test.tsx src/lib/odontogram/renderer-projection.test.ts`

  Expected: FAIL because the EMR-owned renderer modules do not exist.

- [ ] **Step 2: Recover only reviewed layer logic from committed history/source**

  Use repository commit `5616325` as evidence for the measured asset map and layer activation registry, then compare every activated layer with controlled-fork commit `5e28d93`. Do not restore its `measured-inline-asset` implementation because it fetches markup and uses `dangerouslySetInnerHTML`; do not restore the rejected workspace UI. Record source commit, original path, destination path, local adaptations, source SHA-256 values, and MIT attribution in the manifest.

- [ ] **Step 3: Generate safe React node trees from trusted assets**

  Implement the PowerShell generator with explicit input/output paths rooted in the repository, secure XML reader settings, closed SVG element/attribute maps, and deterministic formatting. Its output is a plain immutable node tree consumed through `React.createElement`; it contains no executable text. Tests fail if an asset hash changes without reviewed regeneration, if a disallowed node/attribute appears, or if runtime renderer files contain markup-parsing/injection APIs. Run the generator once and check in the output; never read the dirty fork checkout during generation.

- [ ] **Step 4: Make the renderer projection-only**

  Replace fork-context mutation with explicit props. `measured-fork-layers.ts` returns a closed immutable set/map of active layer IDs; the generated React node renderer applies `data-active` while rendering rather than mutating SVG DOM after mount. Remove renderer save callbacks, implicit treatment actions, provider/demo data, and local storage. Keep `fork-odontogram.tsx` temporarily as a compatibility wrapper around `MeasuredChart` so the workspace can cut over without an all-at-once deletion.

- [ ] **Step 5: Implement deterministic selection and notation**

  Click selects one tooth. Ctrl/Cmd-click toggles multi-selection. Shift-click selects the bounded visual range only when the range is supported. Touch exposes an explicit `Select multiple` mode and never depends on a desktop modifier. Keyboard activation uses Enter/Space, teeth are labelled in the active notation, and canonical identifiers remain FDI. A `Clear selection` action clears UI selection only; it never clears clinical data.

- [ ] **Step 6: Verify renderer isolation and parity**

  Run:

  ```powershell
  npm run test:unit -- src/components/odontogram/measured-assets.test.ts src/components/odontogram/measured-fork-layers.test.ts src/components/odontogram/measured-svg-asset.test.tsx src/components/odontogram/measured-tooth.test.tsx src/components/odontogram/measured-chart.test.tsx src/components/odontogram/measured-feature-parity.test.tsx src/components/odontogram/fork-feature-parity.test.tsx src/lib/odontogram/renderer-projection.test.ts src/lib/odontogram/feature-contract.test.ts
  npm run typecheck
  npm run lint
  ```

- [ ] **Step 7: Checkpoint**

  Update the handoff and commit:

  `refactor: own the approved anatomical renderer boundary`

---

### Task 4: Add the chart toolbar and intentional responsive compositions

**Files:**

- Create: `src/components/odontogram/clinical-chart-toolbar.tsx`
- Create: `src/components/odontogram/clinical-chart-toolbar.test.tsx`
- Create: `src/components/odontogram/chart-viewport-controls.tsx`
- Create: `src/components/odontogram/chart-viewport-controls.test.tsx`
- Modify: `src/components/clinical/clinical-chart-workspace.tsx`
- Modify: `src/components/clinical/clinical-chart-workspace.test.tsx`
- Modify: `src/components/odontogram/measured-chart.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/odontogram-section.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/odontogram-section.test.tsx`
- Modify: `e2e/odontogram-responsive-accessibility.spec.ts`

- [ ] **Step 1: Write failing viewport tests**

  Desktop tests assert all 32 permanent teeth fit without page-level horizontal overflow at 1440/1920 widths. Test permanent, primary, mixed, and edentulous compositions without inventing teeth or losing selectable edentulous sites. Tablet tests assert explicit upper/lower arch controls and touch targets at least 44px. Phone tests assert quadrant/tooth navigation, explicit touch multi-select, no squeezed 32-tooth desktop row, no page overflow, and no hover-only action.

- [ ] **Step 2: Implement one compact toolbar**

  Include mode, notation, dentition, viewport, selection summary, help, print/export, and gallery actions in one responsive toolbar. Use native EMR `Button`, `Select`, `DropdownMenu`, and `Sheet` components. Put infrequent actions in `More`; do not recreate the fork control wall.

- [ ] **Step 3: Implement responsive chart composition**

  Use CSS grid/flex and container-aware breakpoints. Desktop renders full permanent arches; tablet defaults to one arch with an explicit toggle; phone defaults to a quadrant then a focused tooth view. Preserve tooth order and clinically important overlay/label information at every size.

- [ ] **Step 4: Mount the chart in the full-width shell**

  Remove the permanent controls column and 340px inspector from `odontogram-section.tsx`. The chart owns the available row width until a temporary drawer overlays it. Confirm there is no nested `overflow-x-auto` masking a squeezed composition.

- [ ] **Step 5: Verify**

  Run:

  ```powershell
  npm run test:unit -- src/components/odontogram/clinical-chart-toolbar.test.tsx src/components/odontogram/chart-viewport-controls.test.tsx src/components/clinical/clinical-chart-workspace.test.tsx "src/app/(emr)/patients/[patientId]/odontogram-section.test.tsx"
  node --test scripts/remote-database-test-guard.test.mjs
  npm run typecheck
  npm run lint
  ```

  Cloud TEST Playwright discovery/execution remains pending. Do not load hosted credentials merely to make this local checkpoint green.

- [ ] **Step 6: Checkpoint**

  Update the handoff and commit:

  `feat: add responsive full-width dental chart controls`

---

### Task 5: Replace the permanent inspector with one tooth drawer and finding composer

**Files:**

- Create: `src/components/odontogram/tooth-record-drawer.tsx`
- Create: `src/components/odontogram/tooth-record-drawer.test.tsx`
- Create: `src/components/odontogram/clinical-record-composer.tsx`
- Create: `src/components/odontogram/clinical-record-composer.test.tsx`
- Create: `src/components/odontogram/finding-form.tsx`
- Create: `src/components/odontogram/finding-form.test.tsx`
- Create: `src/components/odontogram/clinical-note-form.tsx`
- Create: `src/components/odontogram/clinical-note-form.test.tsx`
- Create: `supabase/migrations/20260901010102_clinical_record_composer_rpcs.sql`
- Create: `supabase/migrations/20260901010103_clinical_record_composer_rpcs_grants.sql`
- Create: `supabase/tests/clinical_record_composer.test.sql`
- Modify: `scripts/remote-database-test-guard.mjs`
- Modify: `scripts/approved-final-grants.mjs`
- Modify: `src/types/database.generated.ts`
- Modify: `src/lib/odontogram/schema.ts`
- Create: `src/lib/odontogram/schema.test.ts`
- Modify: `src/lib/odontogram/service.ts`
- Modify: `src/lib/odontogram/service.test.ts`
- Modify: `src/app/(emr)/patients/[patientId]/odontogram-actions.ts`
- Modify: `src/app/(emr)/patients/[patientId]/odontogram-actions.test.ts`
- Modify: `src/components/odontogram/tooth-inspector.tsx`
- Modify: `src/components/odontogram/tooth-inspector.test.tsx`
- Modify: `src/components/clinical/clinical-chart-workspace.tsx`

**Finding input contract:**

```ts
const findingInputSchema = z.object({
  patientId: z.uuid(),
  branchId: z.uuid(),
  toothCodes: z.array(fdiToothCodeSchema).min(1).max(32),
  findingCode: clinicalFindingCodeSchema,
  surfaces: z.array(toothSurfaceSchema),
  status: z.literal("ACTIVE"),
  clinicalDate: isoDateSchema,
  note: boundedClinicalNoteSchema.optional(),
  idempotencyKey: z.uuid(),
});
```

The server action first starts/resumes the visit, then writes the finding under that encounter. It ignores any browser-supplied provider/organization values and revalidates patient, branch, teeth, surfaces, code compatibility, date bounds, and idempotency.

- [ ] **Step 1: Write failing interaction, action, and pgTAP tests**

  Cover opening/closing the temporary drawer, selected-tooth summary, current state, oldest-first tooth history, Add clinical record choices, explicit clinical date, multi-tooth finding, bounded clinical note creation, invalid surface/tooth combination, receptionist denial, owner-without-provider denial, cross-tenant denial, duplicate submission idempotency, encounter linkage, reload from canonical DTO, and complete selection/draft/error reset when `patientId` changes.

- [ ] **Step 2: Build the 400px temporary native drawer**

  Use the existing shadcn `Sheet`; desktop width is approximately 400px, tablet/phone uses the appropriate side/bottom composition. The drawer shows tooth identity, active findings/treatments, concise history, and one `Add clinical record` primary action. Remove the permanent `Details/History`, `Record finding or treatment`, `Done`, and relationship-card stack from the page.

- [ ] **Step 3: Implement the shared composer shell**

  Present record-kind choices: Finding, Planned treatment, Treatment performed/follow-up, Bridge, Implant, Note, and Photo. Only the selected form mounts. Preserve the selected teeth and explicit clinical date when switching form kind, but never preserve a submitted charge/payment value into a different kind.

- [ ] **Step 4: Add narrow finding and note RPCs**

  Add provider-free versioned RPCs that call `start_or_resume_clinical_visit`, bind the resulting encounter, validate patient/branch/tooth/domain relationships inside the transaction, and append the corresponding audit event. The note RPC records authored content under the managed visit and preserves existing finalized-note amendment rules. Grant only the new functions to `authenticated`; revoke superseded direct paths that can omit encounter/provider attribution.

- [ ] **Step 5: Wire canonical finding and note creation**

  Extend the existing entry service/action rather than adding a browser-only store. Use a generated UUID idempotency key, await the RPC, revalidate the patient route, refetch the odontogram DTO, and show a safe retry error without optimistic clinical state if persistence fails.

- [ ] **Step 6: Remove fork-originated clinical writes**

  Delete the save path from `fork-save-controller.tsx` after all finding writes use the composer. Retain a temporary compatibility file only if another accepted workflow still imports it; document the remaining import and remove it in Task 16.

- [ ] **Step 7: Apply and verify**

  Run:

  ```powershell
  npm run db:migrate:local
  npm run db:types:local
  npm run security:migrations
  npm run test:unit -- src/components/odontogram/tooth-record-drawer.test.tsx src/components/odontogram/clinical-record-composer.test.tsx src/components/odontogram/finding-form.test.tsx src/components/odontogram/clinical-note-form.test.tsx "src/app/(emr)/patients/[patientId]/odontogram-actions.test.ts" src/lib/odontogram/schema.test.ts src/lib/odontogram/service.test.ts
  npm run test:db:local
  npm run typecheck
  npm run lint
  ```

- [ ] **Step 8: Checkpoint**

  Update the handoff and commit:

  `feat: add canonical tooth finding composer`

---

### Task 6: Implement treatment events, exact finding resolution, and immutable charge confirmation

**Files:**

- Create: `supabase/migrations/20260901010104_clinical_treatment_events_v2.sql`
- Create: `supabase/migrations/20260901010105_clinical_treatment_events_v2_grants.sql`
- Create: `supabase/tests/clinical_treatment_events_v2.test.sql`
- Modify: `scripts/remote-database-test-guard.mjs`
- Modify: `scripts/approved-final-grants.mjs`
- Modify: `src/types/database.generated.ts`
- Create: `src/components/odontogram/treatment-event-form.tsx`
- Create: `src/components/odontogram/treatment-event-form.test.tsx`
- Create: `src/components/odontogram/procedure-charge-confirmation.tsx`
- Create: `src/components/odontogram/procedure-charge-confirmation.test.tsx`
- Modify: `src/lib/odontogram/schema.ts`
- Modify: `src/lib/odontogram/service.ts`
- Modify: `src/lib/odontogram/service.test.ts`
- Modify: `src/app/(emr)/patients/[patientId]/odontogram-actions.ts`
- Modify: `src/app/(emr)/patients/[patientId]/odontogram-actions.test.ts`
- Modify: `src/components/odontogram/procedure-followup-dialog.tsx`
- Modify: `src/components/odontogram/procedure-followup-dialog.test.tsx`
- Modify: `supabase/tests/odontogram_atomic_completion_revamp.test.sql`
- Modify: `supabase/tests/billing_charge_ledger.test.sql`
- Modify: `supabase/tests/billing_authorization.test.sql`

**Treatment-event contract:** one server-side transaction calls `start_or_resume_clinical_visit`, creates or locks the procedure case, creates the dated performed/follow-up/completion record, links the exact active finding(s) or plan item being resolved, confirms one immutable charge for a new case, optionally records/allocates an immediate payment and installment schedule, and appends audit events. A partial failure rolls back the complete transaction.

```sql
record_treatment_event_v2(
  p_branch_id uuid,
  p_patient_id uuid,
  p_procedure_id uuid,
  p_plan_item_id uuid,
  p_existing_case_id uuid,
  p_expected_case_version integer,
  p_event_kind text,
  p_service_date date,
  p_resolved_finding_ids uuid[],
  p_clinical_detail jsonb,
  p_charge_amount_centavos bigint,
  p_immediate_payment jsonb,
  p_installment_schedule jsonb,
  p_idempotency_key uuid
) returns jsonb
```

- [ ] **Step 1: Write failing domain, action, and pgTAP tests**

  Cover treatment date requirement, start/performed/follow-up/completion lifecycle, exact finding resolution, leaving unrelated caries active, root-canal anatomical state, missing-to-implant transition, material/surface validation, signed-in provider attribution, amount confirmation, zero/negative/overprecision denial, charge immutability, idempotent retry, immediate partial/full/no payment, installments on non-orthodontic procedures, an orthodontic adjustment allocating payment only to the orthodontic case without adding/editing its original charge, an unrelated filling leaving the orthodontic balance unchanged, receptionist charge denial, receptionist payment permission without encounter creation, and atomic rollback.

- [ ] **Step 2: Build the treatment-event form**

  Require performed date, procedure, treated teeth/surfaces, linked finding(s), result/current status, lifecycle intent (`Start/performed`, `Follow-up/adjustment`, or `Complete`), and optional clinical note. When a treatment is selected, show only compatible active findings and plan items; do not offer a broad `mark tooth healthy` shortcut. A follow-up selects an existing procedure case and does not reconfirm or mutate its original charge.

- [ ] **Step 3: Add explicit charge confirmation**

  The dentist enters actual cost and sees a final confirmation dialog containing patient identifier, procedure, teeth, service date, and formatted amount. The confirm button states that the charge cannot be edited after confirmation. Cancel returns to the form without writing. Corrections after confirmation use the existing adjustment/void ledger workflow, never an UPDATE of the confirmed amount.

- [ ] **Step 4: Add optional immediate payment/allocation**

  Offer `No payment now`, `Record payment`, and installment schedule configuration for any eligible procedure. Validate payment date/method/reference, allocate only to the selected procedure case, and expose the resulting charge/paid/balance values. A dentist or authorized receptionist may record payment; only the treating dentist flow can create the procedure charge. A receptionist payment remains a ledger event and never starts a clinical visit or records a treatment/follow-up.

- [ ] **Step 5: Implement the versioned atomic RPC**

  Reuse validated private helpers from `complete_treatment_case`, `record_procedure_followup`, `post_charge`, payment allocation, and installment scheduling, but expose the provider-free `record_treatment_event_v2` boundary above. A new case accepts `STARTED`, `PERFORMED`, or `COMPLETED` and requires charge confirmation; an existing case accepts `FOLLOW_UP` or `COMPLETED`, rejects a replacement charge, and preserves the original charge. Only `COMPLETED` closes the case. Validate treatment/service-date bounds, event kind, case/patient/plan relationships, finding eligibility, JSON size/shape, charge precision, payment permission, allocation, and expected versions inside the same transaction. The action remains a Zod/authorization/error-mapping adapter and never performs a check-then-write sequence across independent server-action calls.

- [ ] **Step 6: Verify**

  Run:

  ```powershell
  npm run db:migrate:local
  npm run db:types:local
  npm run security:migrations
  npm run test:unit -- src/components/odontogram/treatment-event-form.test.tsx src/components/odontogram/procedure-charge-confirmation.test.tsx src/components/odontogram/procedure-followup-dialog.test.tsx "src/app/(emr)/patients/[patientId]/odontogram-actions.test.ts" src/lib/odontogram/service.test.ts
  npm run test:db:local
  npm run typecheck
  npm run lint
  ```

- [ ] **Step 7: Checkpoint**

  Update the handoff and commit:

  `feat: record immutable charged dental treatments`

---

### Task 7: Integrate bridge and implant workflows into the shared composer

**Files:**

- Create: `supabase/migrations/20260901010106_relationship_workflows_v2.sql`
- Create: `supabase/migrations/20260901010107_relationship_workflows_v2_grants.sql`
- Create: `supabase/tests/odontogram_relationship_workflows_v2.test.sql`
- Modify: `scripts/remote-database-test-guard.mjs`
- Modify: `scripts/approved-final-grants.mjs`
- Modify: `src/types/database.generated.ts`
- Modify: `src/components/odontogram/bridge-workflow.tsx`
- Modify: `src/components/odontogram/bridge-workflow.test.tsx`
- Modify: `src/components/odontogram/implant-workflow.tsx`
- Create: `src/components/odontogram/implant-workflow.test.tsx`
- Modify: `src/components/odontogram/bridge-overlay.tsx`
- Modify: `src/components/odontogram/clinical-record-composer.tsx`
- Modify: `src/components/odontogram/tooth-record-drawer.tsx`
- Modify: `src/lib/odontogram/bridge.ts`
- Modify: `src/lib/odontogram/bridge.test.ts`
- Modify: `src/lib/odontogram/implant.ts`
- Modify: `src/lib/odontogram/implant.test.ts`
- Modify: `src/app/(emr)/patients/[patientId]/odontogram-actions.ts`
- Modify: `supabase/tests/odontogram_relationships.test.sql`
- Modify: `supabase/tests/odontogram_implant_idempotency_concurrency.local.mjs`

- [ ] **Step 1: Write failing contextual-workflow tests**

  Assert that Bridge/Implant are selected from Add clinical record, not shown as permanent cards. Test valid ordered bridge spans, abutment/pontic roles, connector provenance, implant fixture→abutment→crown dependencies, treatment dates, notes, provider attribution, current projection, idempotent retry, concurrent implant creation, and invalid/mismatched/cross-tenant relationships.

- [ ] **Step 2: Convert workflows to controlled forms**

  Remove `New bridge`/`New implant` cards from `tooth-inspector.tsx`. Reuse the existing domain validators and RPCs behind form props supplied by the shared composer. Do not allow the browser to submit provider or organization IDs.

  Add provider-free v2 relationship RPCs that accept an explicit service date, start/resume the managed visit, store encounter linkage/provenance, derive the signed-in provider, and preserve existing request-fingerprint idempotency. Forward-add nullable encounter/service-date columns where necessary; do not invent values for historical relationship rows.

- [ ] **Step 3: Add clinically meaningful drawer summaries**

  For a selected related tooth, show the current bridge span/role or implant stage and dated history in the drawer. Relationship provenance comes from canonical relationship DTOs; the visual connector is a projection only.

- [ ] **Step 4: Verify real overlay behavior**

  Add rendering tests proving missing tooth→fixture→abutment→crown changes anatomical layers and a bridge renders abutment/pontic/connector roles without using a crown-only approximation.

- [ ] **Step 5: Verify**

  Run:

  ```powershell
  npm run db:migrate:local
  npm run db:types:local
  npm run security:migrations
  npm run test:unit -- src/components/odontogram/bridge-workflow.test.tsx src/components/odontogram/implant-workflow.test.tsx src/lib/odontogram/bridge.test.ts src/lib/odontogram/implant.test.ts src/components/odontogram/measured-fork-layers.test.ts
  npm run test:db:local
  npm run typecheck
  npm run lint
  ```

- [ ] **Step 6: Checkpoint**

  Update the handoff and commit:

  `feat: integrate contextual bridge and implant records`

---

### Task 8: Fold treatment planning into the chart mode

**Files:**

- Create: `supabase/migrations/20260901010108_treatment_plan_actor_provider.sql`
- Create: `supabase/migrations/20260901010109_treatment_plan_actor_provider_grants.sql`
- Create: `supabase/tests/treatment_plan_actor_provider.test.sql`
- Modify: `scripts/remote-database-test-guard.mjs`
- Modify: `scripts/approved-final-grants.mjs`
- Modify: `src/types/database.generated.ts`
- Create: `src/components/odontogram/treatment-plan-mode.tsx`
- Create: `src/components/odontogram/treatment-plan-mode.test.tsx`
- Create: `src/components/odontogram/planned-treatment-form.tsx`
- Create: `src/components/odontogram/planned-treatment-form.test.tsx`
- Modify: `src/components/odontogram/plan-mode-panel.tsx`
- Modify: `src/components/odontogram/plan-mode-panel.test.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/treatment-plan-section.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/treatment-plan-section.test.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/treatment-plan-actions.ts`
- Modify: `src/app/(emr)/patients/[patientId]/treatment-plan-actions.test.ts`
- Modify: `src/lib/treatment-plan/schema.ts`
- Modify: `src/lib/treatment-plan/service.ts`
- Modify: `src/lib/treatment-plan/service.test.ts`
- Modify: `supabase/tests/treatment_plan_rpcs.test.sql`
- Modify: `supabase/tests/treatment_item_execution.test.sql`

- [ ] **Step 1: Write failing plan-mode tests**

  Cover multi-tooth plan authoring, tooth/surface/procedure/date/priority/sequence/notes/estimated fee, versioned amendment, patient acknowledgement, plan overlays distinct from current status, no canonical change before execution, execution linked back to a plan item, signed-in provider attribution, and receptionist denial.

- [ ] **Step 2: Move plan authoring into the shared composer**

  The `Treatment plan` mode changes chart overlays and defaults Add clinical record to Planned treatment. Reuse accepted plan RPCs and forms, but remove the separate page/table presentation and any drawing interaction.

  Add provider-free versions of plan discussion/presentation/execution boundaries that currently accept or preserve selectable provider input. Derive the active provider from the actor for clinical authorship, remove `treatingProviderId` from client schemas/actions, and test OWNER-with-provider versus Provider A as distinct identities.

- [ ] **Step 3: Preserve versioning and acknowledgement**

  Finalized/acknowledged plans remain immutable. Changes create a new version/amendment with reason. Execution creates a performed-treatment event and charge through Task 6; it does not silently mark a plan row complete in a separate browser write.

- [ ] **Step 4: Add concise plan context below/alongside the chart**

  Show ordered plan items, status, estimates, notes, and version in a dense native list that does not shrink the anatomical chart. On phone, use a sheet below the focused tooth.

- [ ] **Step 5: Verify**

  Run:

  ```powershell
  npm run db:migrate:local
  npm run db:types:local
  npm run security:migrations
  npm run test:unit -- src/components/odontogram/treatment-plan-mode.test.tsx src/components/odontogram/planned-treatment-form.test.tsx "src/app/(emr)/patients/[patientId]/treatment-plan-actions.test.ts" src/lib/treatment-plan/service.test.ts
  npm run test:db:local
  npm run typecheck
  npm run lint
  ```

- [ ] **Step 6: Checkpoint**

  Update the handoff and commit:

  `feat: integrate treatment planning into the dental chart`

---

### Task 9: Expand the canonical periodontal and peri-implant data model

**Files:**

- Create: `supabase/migrations/20260901010200_full_periodontal_model.sql`
- Create: `supabase/migrations/20260901010201_full_periodontal_model_grants.sql`
- Create: `supabase/tests/periodontal_full_chart.test.sql`
- Modify: `supabase/tests/periodontal_charting.test.sql`
- Modify: `supabase/tests/periodontal_current_state_guard.test.sql`
- Modify: `scripts/remote-database-test-guard.mjs`
- Modify: `src/types/database.generated.ts`
- Modify: `src/lib/odontogram/types.ts`
- Modify: `src/lib/odontogram/schema.ts`
- Modify: `src/lib/odontogram/perio.ts`
- Modify: `src/lib/odontogram/perio.test.ts`

**Canonical measurement scope:**

- Six sites per tooth/implant: MB, B, DB, ML, L, DL.
- Site measurements: PD, GM/recession, derived CAL, BOP, suppuration.
- Surface indices: plaque presence, PI, GI, mPI, mBI, with natural-tooth/peri-implant applicability.
- Tooth/implant properties: Miller mobility, furcation by site/class, keratinized gingiva, gingival thickness/phenotype, Miller recession class, CEJ visibility, root concavity, tooth presence, implant context.
- Exam risk inputs: age snapshot, smoking status and cigarettes/day, diabetes status and HbA1c, teeth lost to periodontitis, radiographic bone-loss percentage.
- Classification: derived and clinician-confirmed diagnosis, stage, grade, extent, override reason, confirmer/provider, confirmation timestamp, and measurement fingerprint.

- [ ] **Step 1: Write failing schema and authorization tests**

  Test every bound/applicability constraint, six-site uniqueness, implant-site acceptance, no furcation on implants, CAL derivation, FINAL immutability, amendment lineage, tenant-safe foreign keys, RLS, authenticated grants, cross-tenant denial, receptionist denial, owner-with/without-provider behavior, and indexes for patient timeline/current exam reads.

- [ ] **Step 2: Add forward-only columns and constraints**

  Extend existing periodontal tables rather than creating parallel canonical stores. Replace the current site constraint that rejects implant contexts. Add columns with nullable/backward-compatible defaults so historical exams remain readable. Do not backfill invented clinical measurements.

- [ ] **Step 3: Add classification support fields**

  Store canonical inputs and separately store derived versus clinician-confirmed classification. Require a non-empty bounded override reason whenever confirmed values differ from derived values. Add a digest/fingerprint over canonical exam measurements for confirmation provenance.

- [ ] **Step 4: Keep FINAL records append-only**

  Extend existing immutable triggers to every new column/table. Draft rows may be autosaved; FINAL rows can only be superseded through an amendment that points to the predecessor and records an amendment reason.

- [ ] **Step 5: Apply and regenerate**

  Run:

  ```powershell
  npm run db:migrate:local
  npm run db:types:local
  npm run security:migrations
  npm run test:unit -- src/lib/odontogram/perio.test.ts src/lib/odontogram/schema.test.ts
  npm run test:db:local
  npm run typecheck
  ```

- [ ] **Step 6: Checkpoint**

  Update the handoff and commit:

  `feat: expand canonical periodontal chart data`

---

### Task 10: Port and validate periodontal calculations, graphics, and classification

**Files:**

- Create: `src/lib/odontogram/perio-classification.ts`
- Create: `src/lib/odontogram/perio-classification.test.ts`
- Create: `src/lib/odontogram/perio-graphics.ts`
- Create: `src/lib/odontogram/perio-graphics.test.ts`
- Create: `src/lib/odontogram/perio-indices.ts`
- Create: `src/lib/odontogram/perio-indices.test.ts`
- Modify: `docs/ODONTOGRAM_FORK_SOURCE_MANIFEST.md`
- Modify: `src/lib/odontogram/perio.ts`
- Modify: `src/lib/odontogram/feature-contract.ts`

**Reference source:** review and minimally port pure behavior from controlled-fork `src/perioClassification.ts`, `src/perioGraphic.ts`, and `src/perioIndexNames.ts` at `5e28d93`. Do not copy the 2,000+ line `PerioChart.tsx` UI.

- [ ] **Step 1: Create golden clinical examples**

  Write table-driven tests for health/gingivitis/periodontitis, stages I–IV, grades A–C, localized/generalized/molar-incisor extent, smoking/diabetes modifiers, bone-loss/age ratio boundaries, tooth-loss inputs, incomplete data, and clinician override. Add graphics tests for six-site interpolation, PD/CAL/recession/KG paths, gap handling, arch orientation, and stable coordinates.

- [ ] **Step 2: Implement pure deterministic functions**

  Functions accept canonical typed measurements and return calculations; they do not read React state, DOM, browser storage, current user, or system time. Represent unknown/incomplete measurements explicitly rather than coercing them to zero.

- [ ] **Step 3: Add closed index/overlay definitions**

  Define `PD`, `CAL`, `RECESSION`, `CAIRO`, `KG`, `BOP`, `PLAQUE`, `PI`, `GI`, `MPI`, `MBI`, `PD_GTE_5`, and `PD_GTE_6` as a closed union with units, bounds, colors from EMR tokens, and natural/peri-implant applicability.

- [ ] **Step 4: Require clinical-owner validation**

  Record in `docs/AI_HANDOFF.md` that the algorithm was ported from the controlled fork and that dentist validation of the 2017 classification mapping remains an explicit acceptance gate. Do not label the classification clinically accepted merely because unit tests pass.

- [ ] **Step 5: Verify**

  Run:

  ```powershell
  npm run test:unit -- src/lib/odontogram/perio-classification.test.ts src/lib/odontogram/perio-graphics.test.ts src/lib/odontogram/perio-indices.test.ts src/lib/odontogram/perio.test.ts src/lib/odontogram/feature-contract.test.ts
  npm run typecheck
  npm run lint
  ```

- [ ] **Step 6: Checkpoint**

  Update the handoff and commit:

  `feat: port validated periodontal calculations`

---

### Task 11: Add race-safe periodontal draft, autosave, finalize, amend, and compare RPCs

**Files:**

- Create: `supabase/migrations/20260901010202_full_periodontal_rpcs.sql`
- Create: `supabase/migrations/20260901010203_full_periodontal_rpcs_grants.sql`
- Create: `supabase/migrations/20260901010204_full_periodontal_projection.sql`
- Create: `supabase/migrations/20260901010205_full_periodontal_projection_grants.sql`
- Create: `supabase/tests/periodontal_full_chart_rpcs.test.sql`
- Create: `supabase/tests/periodontal_autosave_concurrency.local.mjs`
- Modify: `scripts/run-local-database-tests.mjs`
- Modify: `scripts/remote-database-test-guard.mjs`
- Modify: `scripts/approved-final-grants.mjs`
- Modify: `src/types/database.generated.ts`
- Modify: `src/lib/odontogram/service.ts`
- Modify: `src/lib/odontogram/service.test.ts`
- Modify: `src/app/(emr)/patients/[patientId]/perio-actions.ts`
- Modify: `src/app/(emr)/patients/[patientId]/perio-actions.test.ts`
- Modify: `src/app/(emr)/patients/[patientId]/odontogram-actions.ts`

**RPC boundary:**

```sql
create_periodontal_draft_v2(branch_id, patient_id, kind, examined_at, idempotency_key)
save_periodontal_measurements_v2(exam_id, expected_version, measurement_batch, idempotency_key)
finalize_periodontal_examination_v2(exam_id, expected_version, confirmation, idempotency_key)
amend_periodontal_examination_v2(predecessor_id, reason, idempotency_key)
get_periodontal_workspace_v2(patient_id, branch_id, exam_id default null)
compare_periodontal_examinations_v2(patient_id, branch_id, left_exam_id, right_exam_id)
```

- [ ] **Step 1: Write failing RPC and concurrency tests**

  Test provider derivation, automatic visit start/resume, tenant/branch/patient validation, idempotent draft creation, batch-size and JSON-shape validation, expected-version conflict, two concurrent saves with one stale loser, draft-only mutation, completeness checks, classification/override rules, immutable finalization, amendment copying/lineage, comparison authorization, audit events, and narrow execute grants.

- [ ] **Step 2: Implement versioned batch autosave**

  Each successful batch updates the allowed measurement rows and increments the exam version exactly once. A stale `expected_version` returns a typed conflict without overwriting newer data. Limit batch size and JSON depth/bytes in both action schema and SQL. Use set-based validated inserts/upserts inside one transaction.

- [ ] **Step 3: Implement trusted finalization**

  Finalize only a complete DRAFT. Recompute summaries and derived classification from canonical rows in trusted SQL helpers, compare them with the provider-confirmed classification, require an override reason for differences, store the measurement fingerprint, and audit the final transition. Do not accept a client-calculated diagnosis as unverified truth.

- [ ] **Step 4: Consolidate the action surface**

  Make `perio-actions.ts` the only periodontal mutation boundary. Remove duplicate periodontal exports from `odontogram-actions.ts`. Actions validate Zod inputs, call service/RPC, revalidate patient Clinical, and return typed conflict/retry states without logging measurement content.

- [ ] **Step 5: Apply and verify**

  Run:

  ```powershell
  npm run db:migrate:local
  npm run db:types:local
  npm run security:migrations
  npm run test:unit -- src/lib/odontogram/service.test.ts "src/app/(emr)/patients/[patientId]/perio-actions.test.ts"
  npm run test:db:local
  npm run typecheck
  npm run lint
  ```

- [ ] **Step 6: Checkpoint**

  Update the handoff and commit:

  `feat: add versioned periodontal examination workflows`

---

### Task 12: Build the complete periodontal and peri-implant workspace

**Files:**

- Create: `src/components/odontogram/periodontal-exam-workspace.tsx`
- Create: `src/components/odontogram/periodontal-exam-workspace.test.tsx`
- Create: `src/components/odontogram/periodontal-measurement-grid.tsx`
- Create: `src/components/odontogram/periodontal-measurement-grid.test.tsx`
- Create: `src/components/odontogram/periodontal-arch-visualization.tsx`
- Create: `src/components/odontogram/periodontal-arch-visualization.test.tsx`
- Create: `src/components/odontogram/periodontal-risk-classification.tsx`
- Create: `src/components/odontogram/periodontal-risk-classification.test.tsx`
- Create: `src/components/odontogram/periodontal-summary.tsx`
- Create: `src/components/odontogram/periodontal-comparison.tsx`
- Create: `src/components/odontogram/periodontal-comparison.test.tsx`
- Modify: `src/components/odontogram/perio-workspace.tsx`
- Modify: `src/components/odontogram/perio-workspace.test.tsx`
- Modify: `src/components/odontogram/perio-chart.tsx`
- Modify: `src/components/clinical/clinical-chart-workspace.tsx`
- Modify: `e2e/odontogram-integration.spec.ts`
- Modify: `e2e/odontogram-responsive-accessibility.spec.ts`

- [ ] **Step 1: Write failing workflow tests**

  Cover Start new exam, Initial/Reevaluation/Maintenance examination types, examination date, six-site keyboard order, numeric bounds, natural versus implant indices, BOP/suppuration toggles, tooth presence, mobility/furcation/KG/GT/CEJ/root concavity/Miller class, autosave states, stale-version recovery, summary math, overlay switching, risk inputs, derived classification, provider confirmation/override, finalization, amendment, previous-exam comparison, and reload.

- [ ] **Step 2: Build a dense, keyboard-first measurement grid**

  Use a semantic table/grid with explicit row/column headers, stable tab order, arrow-key navigation where it does not override native input behavior, visible focus, and 44px touch controls for toggles. Do not hide measurement labels in placeholders. Keep units visible. Autosave after a bounded debounce and on explicit `Save draft`; display `Saving`, `Saved`, `Conflict`, and `Offline/Retry` states without claiming success early.

- [ ] **Step 3: Build anatomical visualization and overlay selector**

  Render gingival/measurement curves from Task 10 and overlay BOP/plaque/index states against the correct teeth/implants. Provide the closed overlay set, threshold filters, upper/lower arch focus, missing-tooth gaps, and no horizontal page overflow.

- [ ] **Step 4: Build summary, risk, classification, and comparison**

  Show examination completeness, average/maximum PD, average/maximum CAL, bleeding/plaque percentages, pocket-depth distribution, maximum furcation, risk inputs, derived 2017 diagnosis/stage/grade/extent, data limitations, confirmation checkbox, and reasoned override. Compare only two authorized FINAL exams and label dates/provider/branch clearly.

- [ ] **Step 5: Replace the partial periodontal dialog**

  Mount Periodontal as the third primary chart mode. Remove `Open periodontal entry` as a detached top-right action. Keep legacy finalized exams readable through the new projection and route amendments through the new flow.

- [ ] **Step 6: Verify**

  Run:

  ```powershell
  npm run test:unit -- src/components/odontogram/periodontal-exam-workspace.test.tsx src/components/odontogram/periodontal-measurement-grid.test.tsx src/components/odontogram/periodontal-arch-visualization.test.tsx src/components/odontogram/periodontal-risk-classification.test.tsx src/components/odontogram/periodontal-comparison.test.tsx src/components/odontogram/perio-workspace.test.tsx
  node --test scripts/remote-database-test-guard.test.mjs
  npm run test:db:local
  npm run typecheck
  npm run lint
  ```

- [ ] **Step 7: Checkpoint**

  Update the handoff and commit:

  `feat: integrate complete periodontal charting`

---

### Task 13: Add the canonical chronological progress-record projection

**Files:**

- Create: `supabase/migrations/20260901010300_clinical_progress_record_projection.sql`
- Create: `supabase/migrations/20260901010301_clinical_progress_record_projection_grants.sql`
- Create: `supabase/tests/clinical_progress_record.test.sql`
- Modify: `scripts/remote-database-test-guard.mjs`
- Modify: `scripts/approved-final-grants.mjs`
- Modify: `src/types/database.generated.ts`
- Modify: `src/lib/odontogram/progress-record.ts`
- Modify: `src/lib/odontogram/progress-record.test.ts`
- Modify: `src/components/odontogram/progress-record-table.tsx`
- Modify: `src/components/odontogram/progress-record-table.test.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/page.tsx`
- Modify: `src/components/clinical/clinical-chart-workspace.tsx`

**Projection row:**

```ts
type ClinicalProgressRow = {
  eventId: string;
  occurredAt: string;
  eventType: "ENCOUNTER" | "NOTE" | "PRESCRIPTION" | "FINDING" |
    "PLAN" | "TREATMENT" | "FOLLOW_UP" | "PERIODONTAL" |
    "PHOTO" | "PHOTO_RENAME" | "PHOTO_ARCHIVE" | "CHARGE" |
    "PAYMENT" | "ALLOCATION" | "REFUND" | "REVERSAL" |
    "ADJUSTMENT" | "VOID";
  procedureCaseId: string | null;
  procedureLabel: string | null;
  toothCodes: readonly number[];
  providerDisplay: string | null;
  description: string;
  chargeMinor: number | null;
  paidMinor: number | null;
  balanceMinor: number | null;
  currency: "PHP";
  sourceKind: string;
  sourceId: string;
};
```

- [ ] **Step 1: Write failing projection tests**

  Cover every event type, chronological ascending order with deterministic tie-breaker, explicit service/event dates, provider attribution, tooth/procedure labels, procedure-case balances, partial/installment payments, unrelated filling payment not reducing orthodontic/crown balances, corrections/voids, finalized/amended clinical events, organization isolation, branch access, receptionist read permissions, pagination/bounds, and no hidden clinical content in audit logs.

- [ ] **Step 2: Implement one authorized server projection**

  Build a bounded RPC/view that unions canonical append-only sources and computes money from ledger entries/allocations per procedure case. It must not calculate a mutable patient balance or accept organization ID. Add patient/date indexes if query analysis shows missing tenant-scoped paths.

- [ ] **Step 3: Replace the browser-only event merge**

  Change `progress-record.ts` from assembling disparate client DTOs to parsing/formatting the canonical projection. Keep labels/presentation in TypeScript; keep event existence, ordering fields, and financial values in PostgreSQL.

- [ ] **Step 4: Build desktop table and mobile progress-note list**

  Place the record directly below the chart, oldest first by default. Desktop columns: Date/time, Procedure/event, Tooth, Provider, Charge, Paid, Balance, Notes/action. Mobile uses a chronological list with the same information and explicit expand controls. Avoid grouping that breaks the paper progress-note sequence.

- [ ] **Step 5: Apply and verify**

  Run:

  ```powershell
  npm run db:migrate:local
  npm run db:types:local
  npm run security:migrations
  npm run test:unit -- src/lib/odontogram/progress-record.test.ts src/components/odontogram/progress-record-table.test.tsx
  npm run test:db:local
  npm run typecheck
  npm run lint
  ```

- [ ] **Step 6: Checkpoint**

  Update the handoff and commit:

  `feat: add canonical clinical progress chronology`

---

### Task 14: Integrate the private clinical gallery into the chart toolbar

**Files:**

- Create: `supabase/migrations/20260901010400_clinical_photo_radiograph_category.sql`
- Create: `supabase/tests/clinical_photo_radiograph.test.sql`
- Modify: `scripts/remote-database-test-guard.mjs`
- Modify: `src/types/database.generated.ts`
- Create: `src/components/clinical/clinical-gallery-sheet.tsx`
- Create: `src/components/clinical/clinical-gallery-sheet.test.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/photos/clinical-photo-gallery.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/photos/clinical-photo-gallery.test.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/photos/photo-upload-dialog.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/photos/photo-upload-dialog.test.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/photos/actions.ts`
- Modify: `src/app/(emr)/patients/[patientId]/photos/actions.test.ts`
- Modify: `src/lib/clinical-media/schema.ts`
- Modify: `src/lib/clinical-media/service.ts`
- Modify: `src/lib/clinical-media/service.test.ts`
- Modify: `src/app/(emr)/patients/[patientId]/patient-workspace.tsx`
- Modify: `src/components/odontogram/clinical-chart-toolbar.tsx`

- [ ] **Step 1: Write failing gallery/category tests**

  Cover toolbar opening, Before/Progress/After/Diagnostic/Radiograph/Intraoral/Extraoral/Other filtering, clinical date, procedure/tooth links, photographer as signed-in actor, safe display-name rename, before/after compare, private access, cross-tenant denial, receptionist permission contract, archive rather than delete, and progress-record event projection.

- [ ] **Step 2: Add RADIOGRAPH forward-compatibly**

  Extend the canonical category constraint/enum without deleting existing categories. Use a forward migration and update schema/types/tests. Do not alter stored object keys or original bytes when the display filename changes.

- [ ] **Step 3: Build the gallery sheet**

  Move the existing gallery into a toolbar-opened native sheet/dialog. Preserve source originals in MinIO/R2; thumbnails/previews/display files remain permission-checked derivatives through the existing provider-neutral adapter. Do not introduce Cloudinary or arbitrary client transformation parameters.

- [ ] **Step 4: Attach photos from the shared composer**

  `PHOTO` opens the same upload flow prefilled with selected teeth, procedure context, and clinical date. Recording photo metadata does not create a clinical encounter unless the dentist explicitly attaches it to an active clinical record; receptionist photo permissions remain whatever the accepted media policy permits and must not imply treatment authority.

- [ ] **Step 5: Verify**

  Run:

  ```powershell
  npm run db:migrate:local
  npm run db:types:local
  npm run test:unit -- src/components/clinical/clinical-gallery-sheet.test.tsx "src/app/(emr)/patients/[patientId]/photos/clinical-photo-gallery.test.tsx" "src/app/(emr)/patients/[patientId]/photos/photo-upload-dialog.test.tsx" "src/app/(emr)/patients/[patientId]/photos/actions.test.ts" src/lib/clinical-media/service.test.ts
  npm run test:db:local
  npm run storage:start:local
  npm run storage:smoke:local
  npm run typecheck
  npm run lint
  ```

- [ ] **Step 6: Checkpoint**

  Update the handoff and commit:

  `feat: integrate the private clinical photo gallery`

---

### Task 15: Implement staged FHIR/JSON import and permissioned canonical exports

**Files:**

- Create: `supabase/migrations/20260901010410_clinical_interchange_staging.sql`
- Create: `supabase/migrations/20260901010411_clinical_interchange_rpcs.sql`
- Create: `supabase/migrations/20260901010412_clinical_interchange_rpcs_grants.sql`
- Create: `supabase/tests/clinical_interchange.test.sql`
- Modify: `scripts/remote-database-test-guard.mjs`
- Modify: `scripts/approved-final-grants.mjs`
- Modify: `src/types/database.generated.ts`
- Create: `src/lib/odontogram/interchange/schema.ts`
- Create: `src/lib/odontogram/interchange/schema.test.ts`
- Create: `src/lib/odontogram/interchange/normalize.ts`
- Create: `src/lib/odontogram/interchange/normalize.test.ts`
- Create: `src/lib/odontogram/interchange/service.ts`
- Create: `src/lib/odontogram/interchange/service.test.ts`
- Modify: `src/lib/odontogram/fhir-candidates.ts`
- Create: `src/lib/odontogram/fhir-candidates.test.ts`
- Create: `src/lib/odontogram/clinical-export.ts`
- Create: `src/lib/odontogram/clinical-export.test.ts`
- Create: `src/components/odontogram/clinical-import-dialog.tsx`
- Create: `src/components/odontogram/clinical-import-dialog.test.tsx`
- Create: `src/components/odontogram/clinical-export-menu.tsx`
- Create: `src/components/odontogram/clinical-export-menu.test.tsx`
- Create: `src/app/(emr)/patients/[patientId]/odontogram-interchange-actions.ts`
- Create: `src/app/(emr)/patients/[patientId]/odontogram-interchange-actions.test.ts`
- Modify: `src/components/odontogram/clinical-chart-toolbar.tsx`
- Modify: `src/components/odontogram/clinical-chart-toolbar.test.tsx`

**Staging contract:** parsing is not a clinical write. A bounded upload creates a tenant/patient-scoped staging batch containing normalized candidates classified as `NEW`, `DUPLICATE`, `CONFLICT`, or `UNSUPPORTED`. Only a dentist with an active provider may select supported candidates and apply them. Apply uses one transaction, starts/resumes the managed visit, appends canonical records with import provenance, and never replaces the chart wholesale.

```sql
create_clinical_import_batch_v1(branch_id, patient_id, format, source_digest, candidates, idempotency_key)
get_clinical_import_batch_v1(branch_id, patient_id, batch_id)
apply_clinical_import_batch_v1(branch_id, patient_id, batch_id, candidate_ids, idempotency_key)
archive_clinical_import_batch_v1(branch_id, patient_id, batch_id, reason)
record_clinical_export_v1(branch_id, patient_id, format, scope, idempotency_key)
```

- [ ] **Step 1: Write failing parser/domain tests**

  Accept only versioned EMR JSON and the supported subset of FHIR R4 Bundles. Enforce a 1 MiB source limit, 500 normalized-candidate limit, bounded strings/arrays/depth, FDI/code/surface/relationship validation, and duplicate/conflict detection against a bounded canonical comparison DTO. Reject XML, executable content, external references, unknown versions, invalid encodings, prototype-polluting keys, and embedded organization/provider/branch authority. Unsupported resources remain visible as `UNSUPPORTED` and cannot be applied.

- [ ] **Step 2: Write failing pgTAP authorization/lifecycle tests**

  Test tenant-safe foreign keys and RLS on batches/candidates, dentist and owner-with-provider import, owner-without-provider/receptionist/cross-tenant denial, patient/branch mismatch, request-fingerprint idempotency, selected-candidate-only apply, conflict refusal until explicitly excluded, transactional rollback, managed encounter/provider attribution, import provenance, audit metadata without payload, archive behavior, and bounded pagination. Export tests cover clinical-read permission, cross-tenant denial, format/scope allowlists, and audit without exported clinical content.

- [ ] **Step 3: Add the staging schema and narrow RPCs**

  Store normalized candidate JSON only in protected tenant tables; never store the whole untrusted uploaded file or embedded tenant identifiers. Use explicit status/version columns, indexes for organization/patient/created time, RLS, applied-record immutability, and a guarded archive lifecycle. SQL revalidates candidate shape and canonical relationships even after server-side parsing. The apply RPC calls existing private clinical-write helpers rather than duplicating authorization.

- [ ] **Step 4: Implement pure normalization and server actions**

  Parse the bounded file in the server action, normalize to a strict internal union, hash the source, and call the staging RPC. Do not install `@types/fhir`, DOM parsers, or fork import code. Update `fhir-candidates.ts` from documentation-only status to the accepted, tested mapping subset under ADR-030. Return structured safe errors; never log file bytes or clinical candidates.

- [ ] **Step 5: Build the review/apply UI**

  Open Import from the toolbar's `More` menu. Show batch format/version, counts, and a review table with New/Duplicate/Conflict/Unsupported states. Default only supported NEW candidates to selected, require explicit dentist confirmation, show the signed-in provider/clinical date, and refetch the canonical chart/chronology after apply. Failed or abandoned batches never affect overlays.

- [ ] **Step 6: Implement canonical exports**

  Generate FHIR R4 and versioned EMR JSON from an authorized server projection; never serialize fork state. Register/audit PDF/print, trusted renderer SVG, and bounded PNG exports before creating the local download. Use the closed renderer SVG and a fixed maximum scale/dimension; strip interactive attributes and never include signed media URLs. Export actions enforce patient/branch/format/scope permission server-side and return `Content-Disposition` display filenames containing only a synthetic-safe patient code/date, not arbitrary clinical text.

- [ ] **Step 7: Apply and verify**

  Run:

  ```powershell
  npm run db:migrate:local
  npm run db:types:local
  npm run security:migrations
  npm run test:unit -- src/lib/odontogram/interchange/schema.test.ts src/lib/odontogram/interchange/normalize.test.ts src/lib/odontogram/interchange/service.test.ts src/lib/odontogram/fhir-candidates.test.ts src/lib/odontogram/clinical-export.test.ts src/components/odontogram/clinical-import-dialog.test.tsx src/components/odontogram/clinical-export-menu.test.tsx "src/app/(emr)/patients/[patientId]/odontogram-interchange-actions.test.ts"
  npm run test:db:local
  npm run typecheck
  npm run lint
  ```

- [ ] **Step 8: Checkpoint**

  Update the handoff and commit:

  `feat: add staged clinical interchange`

---

### Task 16: Rebuild print/help/export presentation and remove the runtime fork package

**Files:**

- Create: `supabase/migrations/20260901010500_retire_treatment_plan_drawings.sql`
- Create: `supabase/migrations/20260901010501_retire_treatment_plan_drawings_grants.sql`
- Create: `supabase/tests/treatment_plan_drawing_retirement.test.sql`
- Create: `scripts/treatment-plan-drawing-retirement-migration.test.mjs`
- Modify: `scripts/remote-database-test-guard.mjs`
- Modify: `scripts/approved-final-grants.mjs`
- Modify: `src/types/database.generated.ts`
- Create: `src/components/odontogram/clinical-chart-print.tsx`
- Create: `src/components/odontogram/clinical-chart-print.test.tsx`
- Modify: `src/lib/odontogram/clinical-export.ts`
- Modify: `src/lib/odontogram/clinical-export.test.ts`
- Modify: `src/components/odontogram/odontogram-help.tsx`
- Modify: `src/components/odontogram/odontogram-help.test.tsx`
- Modify: `src/components/odontogram/print-history.tsx`
- Modify: `src/components/odontogram/print-history.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `THIRD_PARTY_NOTICES.md`
- Delete: `src/components/odontogram/fork-save-controller.tsx`
- Delete: `src/components/odontogram/fork-save-controller.test.tsx`
- Delete: `src/components/odontogram/fork-print-chart.tsx`
- Delete: `src/components/odontogram/fork-print-chart.test.tsx`
- Delete: `src/components/odontogram/fork-feature-parity.test.tsx`
- Delete: `src/components/odontogram/fork-package.test.ts`
- Delete: `src/components/odontogram/fork-style-scope.test.ts`
- Delete: `src/components/odontogram/styles.css`
- Delete: `scripts/scope-odontogram-css.mjs`
- Delete: `vendor/react-advanced-odontogram/`

- [ ] **Step 1: Write failing canonical print/export tests**

  Assert that print output includes patient-safe header, chart date, current anatomical projection, plan distinction, periodontal summary/classification, chronological record, provider attribution, procedure-case financial columns, and amendment/void labels. Assert that excluded reset/drawing/demo content and private signed URLs never appear. Export presentation tests must consume Task 15's canonical export contract, not fork state.

- [ ] **Step 2: Rebuild browser print without jsPDF**

  Use a dedicated React print view and `@media print` styles so the browser generates the PDF. Do not add a PDF dependency. Use Task 15's audited export registration and canonical data contract; imports remain staged/validated and cannot directly mutate the chart.

- [ ] **Step 3: Replace help content**

  Explain current/plan/periodontal modes, notation, selection, clinical record types, immutable charges, autosave/finalize/amend, and visual legend using EMR components. Remove fork/demo instructions for reset, Classic, drawing, and local persistence.

- [ ] **Step 4: Retire drawing persistence with the accepted fail-closed migration**

  Revoke all browser execute on drawing mutation RPCs and remove drawing fields from treatment-plan projections. The data migration may delete only rows linked to the repository's positively identified deterministic synthetic fixtures. It must abort before deletion if any unrecognized row exists and report only the recognized row count without drawing content. Leave the emptied table as a revoked compatibility tombstone with a trigger that rejects new mutation; do not drop it in this window. pgTAP must prove it is empty/non-writable with no residual grants and that structured treatment-plan history remains intact; a migration-contract test must prove the fail-closed preflight precedes deletion. Never run this as ad hoc SQL.

- [ ] **Step 5: Prove no runtime package dependency remains**

  Replace old package tests with repository-boundary tests that fail on imports of `react-advanced-odontogram`, `jspdf`, fork global CSS, or `vendor/react-advanced-odontogram`. Move/preserve the MIT notice and source manifest first, then remove the file dependency with `npm uninstall react-advanced-odontogram` and verify `jspdf` leaves the lockfile if no other package requires it.

- [ ] **Step 6: Apply and verify**

  Run:

  ```powershell
  npm run db:migrate:local
  npm run db:types:local
  npm run security:migrations
  node --test scripts/treatment-plan-drawing-retirement-migration.test.mjs
  rg -n "react-advanced-odontogram|jspdf|localStorage|Reset|Classic|freehand|drawing history" src package.json package-lock.json
  npm run test:unit -- src/components/odontogram/clinical-chart-print.test.tsx src/lib/odontogram/clinical-export.test.ts src/components/odontogram/odontogram-help.test.tsx src/components/odontogram/print-history.test.tsx src/components/odontogram/measured-fork-layers.test.ts
  npm run test:db:local
  npm run security:audit
  npm run typecheck
  npm run lint
  npm run build
  ```

  The `rg` result may contain explicit negative tests/help statements but no runtime import, control, or persistence path.

- [ ] **Step 7: Checkpoint**

  Update the handoff and commit:

  `refactor: remove the odontogram runtime package boundary`

---

### Task 17: Remove superseded UI paths and complete local acceptance gates

**Files:**

- Modify: `e2e/support/odontogram.ts`
- Modify: `e2e/odontogram-integration.spec.ts`
- Modify: `e2e/odontogram-responsive-accessibility.spec.ts`
- Modify: `e2e/responsive-accessibility.spec.ts`
- Modify: `e2e/session-boundaries.spec.ts`
- Create: `e2e/clinical-chart-workspace.spec.ts`
- Create: `e2e/periodontal-workspace.spec.ts`
- Delete: `src/components/odontogram/current-status-panel.tsx`
- Delete: `src/components/odontogram/current-status-panel.test.tsx`
- Delete: `src/components/odontogram/tooth-inspector.tsx`
- Delete: `src/components/odontogram/tooth-inspector.test.tsx`
- Delete: `src/components/odontogram/plan-mode-panel.tsx`
- Delete: `src/components/odontogram/plan-mode-panel.test.tsx`
- Delete: `src/components/odontogram/fork-odontogram.tsx`
- Delete: `src/components/odontogram/fork-odontogram.test.tsx`
- Delete: `src/lib/odontogram/fork-adapter.ts`
- Delete: `src/lib/odontogram/fork-adapter.test.ts`
- Delete: `src/app/(emr)/patients/[patientId]/treatment-plan-section.tsx`
- Delete: `src/app/(emr)/patients/[patientId]/treatment-plan-section.test.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/odontogram-section.tsx`
- Modify: `src/app/(emr)/patients/[patientId]/clinical-section.tsx`
- Modify: `docs/AI_HANDOFF.md`

- [ ] **Step 1: Update E2E helpers and write end-to-end scenarios**

  Stop clicking a legacy `Odontogram` inner tab. Navigate to patient Clinical and wait for `data-testid="clinical-chart-workspace"`. Cover canonical reload, current finding→treatment resolution, immutable charge confirmation, partial payment and isolated procedure balance, plan creation/execution, bridge, implant, root canal overlay, photo upload/rename, staged JSON/FHIR import review/apply, canonical export registration/download, periodontal draft/autosave/finalize/amend/compare, chronological record, and provider attribution.

- [ ] **Step 2: Add authorization and failure-path scenarios**

  Cover receptionist payment-only behavior, dentist/owner provider requirements, cross-tenant route/RPC denial, patient A→patient B navigation with no stale chart/drawer/draft/gallery/perio state, stale periodontal save, failed clinical write with no false overlay, duplicate click/idempotent retry, and finalized-record amendment instead of mutation.

- [ ] **Step 3: Add responsive/accessibility assertions**

  At representative desktop/tablet/phone widths assert no page overflow, desktop 32-tooth visibility, tablet arch focus, phone quadrant/tooth flow, drawer/sheet accessibility, touch targets, keyboard reachability, visible focus, dialog labels, live autosave/error messages, color-independent clinical indicators, and no clipped primary action under virtual-keyboard/safe-area conditions.

- [ ] **Step 4: Delete only proven-dead compatibility UI**

  Run `rg` for every candidate before deletion. Keep action/service modules that the unified workspace still uses. Remove the old permanent inspector, duplicate mode panels, and separate Treatment plan presentation only after replacement tests pass. Do not delete historical data, RPCs needed for read compatibility, or accepted billing/media workflows.

- [ ] **Step 5: Run the complete local gate**

  Run in this order:

  ```powershell
  git status --short
  npm run security:migrations
  npm run lint
  npm run typecheck
  npm run test:unit
  npm run test:db:local
  npm run storage:start:local
  npm run storage:smoke:local
  node --test scripts/remote-database-test-guard.test.mjs
  npm run build
  npm run security:secrets
  npm run security:audit
  git diff --check
  ```

  Also run `node scripts/generate-database-types.mjs --local --check`. Do not run `db:reset:local`. `npm run test:e2e:list` and Playwright execution require the explicitly designated synthetic Cloud TEST metadata/credentials from `e2e/README.md`; do not fabricate or load hosted credentials for local completion. Run discovery and the focused E2E specs only at the authorized Cloud TEST gate, otherwise record them as pending.

- [ ] **Step 6: Perform the skeptical final diff review**

  Verify no client provider/organization authority, no cross-tenant FK, no broad grant/RLS regression, no unsafe `security definer` search path, no mutable confirmed charge, no FINAL clinical mutation, no clinical text/logging, no signed media URL leakage, no runtime fork package, no fake overlay shortcuts, no reset/drawing/demo persistence, no horizontal page overflow workaround, and no claim of production readiness.

- [ ] **Step 7: Record acceptance status and checkpoint**

  Update `docs/AI_HANDOFF.md` with exact commands/results, migration range, known residual risks, and these pending release gates: Cloud TEST database suite, hosted E2E, representative-device responsive/accessibility pass, Supabase advisors, security review, clinical-owner periodontal-classification validation, and final human acceptance.

  Commit:

  `feat: complete unified clinical chart workspace locally`

---

## Claude Opus handoff rules

Claude Opus should execute exactly one numbered task per checkpoint unless the human explicitly authorizes a larger batch. At the start of a task, Claude must confirm the previous checkpoint is reviewed/accepted, inspect the current Git state, and verify that the listed migration filenames are still free. If repository reality conflicts with this plan, Claude must stop, document the concrete conflict in the handoff, and request plan revision rather than silently changing architecture.

For every checkpoint, `docs/AI_HANDOFF.md` must identify:

- the task number and commit SHA;
- files/migrations added, changed, and deleted;
- security/tenancy decisions and negative cases covered;
- exact test commands and their observed result;
- any test not run and why;
- local-only versus Cloud TEST evidence;
- known residual risks and the next bounded task.

## Final acceptance definition

Local implementation is complete only when all 17 tasks are independently reviewed, all local gates in Task 17 pass, the chart reloads entirely from canonical data, and excluded fork/demo behavior is absent. Release acceptance is still blocked until Cloud TEST, hosted browser/E2E, responsive/accessibility, database-advisor, security, clinical-owner classification validation, and final human approval gates pass. No completion statement may imply authorization for production deployment or real patient/provider use.
