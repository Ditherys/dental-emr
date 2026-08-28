# Customized Odontogram Integration Specification

**Status:** Accepted by the project owner on 2026-08-28. Implementation is
authorized only through O4 after billing B0-B11 completes; see
`docs/BILLING_ODONTOGRAM_ACCEPTANCE_REVIEW.md`.

**Authoritative source fork:**
`C:\Users\Latitude 7430\Desktop\React-Odontogram-Modul` at audited commit
`5e28d93` exactly. Uncommitted and untracked fork content is excluded. Any later
intentional fork change must first be committed in that repository, independently
reviewed, and recorded here and in the implementation ADR as a new pinned SHA.

**Target:** `C:\Users\Latitude 7430\Desktop\dental-emr`

## Purpose

Upgrade the Dental EMR's existing Phase 15 schematic tooth chart into a native,
clinically structured odontogram by selectively integrating the useful engine,
validation, measured SVG renderer, interaction, bridge, implant, current/planned,
and periodontal functionality from the project-controlled fork.

The fork is a source of proven clinical and rendering behavior, not the
production data owner and not the target UI shell.

## Scope

The first integrated release covers database-backed permanent/primary charting,
structured tooth/surface findings and treatments, measured rendering,
current-versus-planned execution, bridges, implants, core periodontal charting,
patient history, authorization/audit, and native responsive interaction inside
the existing patient record. Completed in-clinic procedures consume the
separately specified billing/provider-attribution prerequisite; regulated billing
documents and unrelated practice-management modules remain outside this scope.

## Goals

- Preserve structured tooth, surface, finding, treatment, provider, and history
  data in the EMR database.
- Preserve the customized fork's intentional engine, anatomy, overlay, bridge,
  implant, current/planned, selection, and periodontal fixes.
- Use the improved measured renderer and exclude Classic completely.
- Rebuild the workspace with existing EMR components and responsive patterns.
- Integrate planned work with the existing treatment-plan model.
- Link completed in-clinic treatment to provider attribution and the accepted
  billing ledger.
- Keep SVG geometry replaceable without database migration.
- Prevent patient, branch, and tenant state leakage.

## Non-goals

- Classic view or Classic-only compatibility code.
- The fork's demo header, footer, navigation, settings shell, tour, theme picker,
  language picker, persistence toggle, or giant control layout.
- Canonical clinical state in module globals, React context, localStorage, or a
  fork status JSON blob.
- Perfecting every tooth SVG during integration.
- Database fields based on SVG path identifiers or coordinates.
- Automatic FHIR import/export or clinical interchange in the first release.
- Porting PDF/image export when EMR print conventions meet the initial need.

## Existing EMR Baseline

Phase 15 already provides:

- `public.tooth_conditions` with FDI tooth, one surface, coarse status/finding,
  attribution, versions, void history, RLS, RPCs, and audit.
- A schematic grid in the patient clinical workspace.
- Renderer-independent service types in `src/lib/odontogram/`.
- Existing treatment plans with immutable plan headers and plan items.

This integration evolves those records forward. It must not discard or bypass
existing condition history.

## Phase 15 Legacy Mapping

Every `tooth_conditions` row is migrated exactly once through a unique
`legacy_tooth_condition_id` and retains its source status, finding, surface,
notes, recorder, recorded/voided timestamps, and version as provenance. A voided
source row remains historical and is excluded from current-state projections.
The migration must not invent a treating provider, bridge span, pontic role,
implant relationship, treatment-plan item, or completion event.

Surface mapping is exact: O/B/L/M/D/I/F creates the corresponding clinical
surface association; FULL marks the entry as whole-tooth and creates no surface
association. The status/finding cross-product maps as follows:

| Phase 15 row | Canonical legacy classification | Current-state effect |
| --- | --- | --- |
| ACTIVE + CARIES/FRACTURE/MISSING/OTHER | FINDING / EXISTING | Present finding, subject to void state |
| ACTIVE + RESTORATION/CROWN/SEALANT | TREATMENT / PREEXISTING | Present external/pre-existing treatment; provider unknown |
| ACTIVE + BRIDGE | LEGACY_BRIDGE_MARKER | Preserve tooth marker only; do not infer a bridge group/span |
| PLANNED + any finding type | LEGACY_UNLINKED_PLANNED | Planned-only marker; do not create or link a treatment-plan item |
| COMPLETED + RESTORATION/CROWN/SEALANT | TREATMENT / COMPLETED_LEGACY | Historical completed treatment; provider unknown |
| COMPLETED + CARIES/FRACTURE/MISSING/OTHER | LEGACY_TERMINAL_UNCLASSIFIED | Historical only; excluded from inferred current state pending manual review |
| COMPLETED + BRIDGE | LEGACY_BRIDGE_MARKER | Historical marker only; do not infer span or support |
| REFERRED + any finding type | LEGACY_REFERRED | Referral history only; no current-state mutation |

The original finding code remains queryable on every legacy classification.
Unknown surface/status/finding values or an incomplete mapping abort the
migration; they are never coerced to OTHER. Cross-product fixtures, source/target
row-count assertions, uniqueness checks, and rerun/idempotency checks prove the
mapping before obsolete Phase 15 writes are removed.

LEGACY_BRIDGE_MARKER, LEGACY_UNLINKED_PLANNED, and
LEGACY_TERMINAL_UNCLASSIFIED rows are visibly flagged for reconciliation rather
than becoming a hidden backlog. A user with `patient.clinical.write` and
`patient.clinical.correct` for the patient/acting branch can resolve one by an
append-only `odontogram_legacy_resolution` that either links a newly and
deliberately recorded canonical clinical/bridge/plan relationship or records
that no current-state entry should be created. The resolution captures actor,
time, bounded reason, and source/new identifiers and never mutates the source
legacy row or invents historical provider/span data.

## Responsibility Boundaries

### Domain and clinical engine

Owns tooth identifiers, dentition, notation conversion, surfaces, findings,
treatments, materials, lifecycle, bridge membership, implant components,
periodontal measurements, validation, and renderer transformations.

### Renderer

Owns measured SVG anatomy, surfaces and hit areas, overlays, implant artwork,
bridge connectors, selected/hover/focus states, periodontal graphic layers, and
render-only coordinate mapping.

### Workspace

Owns toolbar, selection inspector, contextual treatment/finding controls,
current/planned mode, bridge workflow, implant workflow, periodontal workflow,
dialogs, keyboard behavior, responsive layout, and feedback states.

### EMR integration

Owns patient-scoped loads, mutations, authorization, RLS, audit, treatment-plan
links, provider attribution, billing links, transactions, revalidation, and
history.

## Data Ownership and State

The database is authoritative. The renderer receives a patient-specific DTO and
emits domain intents. Server actions validate and authorize each intent before a
granular database mutation.

Persisted clinical state includes tooth/surface facts, bridge and implant
relationships, periodontal readings, treatment lifecycle, treating provider,
recording actor, timestamps, and clinical history.

Transient UI state includes selected/hovered teeth, focused surface, open
popover/dialog, toolbar mode, unsubmitted form values, and local zoom/pan. It is
keyed by patient ID and reset when the patient changes. No global store may carry
canonical clinical state between patients.

Reload and navigation reconstruct the chart solely from server-authorized data.

## Clinical Entry Semantics

A clinical entry records:

- Patient and organization
- Tooth code and one or more applicable surfaces
- Entry kind: finding or treatment
- Clinical code and optional material/subtype
- Lifecycle and provenance
- Treating provider when applicable
- Recording actor and encounter
- Treatment-plan item and charge links where applicable
- Effective, recorded, completed, voided, and amended timestamps

Example: an amalgam filling on the buccal surface is a RESTORATION treatment for
surface `B` with material `AMALGAM`. The overlay is derived from that record.

Pre-existing/external treatment can have no internal treating provider. A
completed in-clinic procedure requires a provider and the atomic completion/
charge operation from the billing prerequisite.

## Current and Planned Treatment

The plan header keeps the existing DRAFT, PRESENTED, and ACKNOWLEDGED lifecycle.
`treatment_plan_items` remain immutable proposal content once their parent plan
is PRESENTED or ACKNOWLEDGED; treatment execution must never mutate that frozen
proposal or its acknowledged snapshot.

Each item has a separate current `treatment_plan_item_executions` row/projection and
append-only execution events for PROPOSED, ACCEPTED, IN_PROGRESS, COMPLETED, and
CANCELLED. Valid transitions are PROPOSED -> ACCEPTED/CANCELLED; ACCEPTED ->
IN_PROGRESS/CANCELLED; IN_PROGRESS -> COMPLETED/CANCELLED. A bounded correction
may supersede only the latest nonterminal ACCEPTED event back to PROPOSED or
IN_PROGRESS event back to ACCEPTED, under `patient.clinical.correct`, with reason
and audit. COMPLETED and CANCELLED are terminal and cannot be superseded in the
first release; a direct attempt fails without any clinical or financial mutation.
Later amendment/void of a linked completed clinical record or charge preserves
the historical COMPLETED execution and renders its downstream void/amendment
status rather than pretending completion never occurred. Execution rows are
clinical workflow history, not new plan content.

An execution remains PROPOSED while the plan is DRAFT or merely PRESENTED.
ACCEPTED requires an ACKNOWLEDGED parent plan; IN_PROGRESS and COMPLETED require
that accepted chain. Cancellation is permitted from any nonterminal execution
state without altering the acknowledged proposal.

- Existing/pre-existing findings describe what is clinically present.
- PROPOSED/ACCEPTED/IN_PROGRESS execution states render as planned overlays and do not
  mutate current clinical state.
- COMPLETED atomically appends its execution event, updates the execution
  projection, creates completed clinical state, and creates charge/provider
  attribution without changing acknowledged proposal content.
- CANCELLED remains execution history and creates no existing clinical state.
- A planned extraction does not mark the tooth missing.
- A planned implant does not replace the current tooth/space state.
- A planned crown does not become an existing crown until completion.

## Bridge Semantics

A bridge is a first-class relationship, not independent crown icons.

Each bridge record has an identifier, patient, record kind PLAN_DESIGN or
CURRENT, provenance, prosthesis/support type, and ordered units. Each unit
identifies a tooth position and role:

- ABUTMENT
- PONTIC

An ABUTMENT unit has support kind NATURAL_TOOTH or IMPLANT_COMPONENT; implant
support references a fixture/abutment chain at the same patient and tooth
position. A PONTIC unit has support kind NONE. Bridge support mode
(natural/implant/mixed) is derived from its units. Connectors are derived between
adjacent supported units; they are not clinical rows of their own unless a later
clinical requirement needs connector-specific state.

The model supports arbitrary validated spans. A 24-abutment / 25-pontic /
26-abutment bridge is one bridge with three ordered units. A PLAN_DESIGN is
editable only while its parent treatment plan is DRAFT; it and its units become
immutable when the plan is PRESENTED/ACKNOWLEDGED and cancellation is recorded
only in execution history. Completion does not mutate that proposal: it
atomically creates a separate CURRENT bridge linked to the design/execution.
A CURRENT bridge and its units/support cannot be edited in place. Correction
uses an append-only amendment that creates a successor relationship or a void
event and preserves predecessor units. A new CURRENT bridge/successor is built
with all units inside one transaction and receives `sealed_at` only after full
validation; only then can it become visible. Once sealed, unit INSERT, UPDATE,
and DELETE and structural parent edits are rejected. Creation, amendment, completion,
cancellation, and void are atomic. Validation rejects duplicate
positions, invalid order, unsupported gaps, pontics with incompatible current
tooth state, and cross-patient/tenant members.

Voiding a bridge relationship does not delete it or unrelated tooth history.
Existing and planned bridge designs remain distinct.

## Implant Semantics

Implant state is decomposed clinically into fixture, abutment, restoration, and
bridge support. The renderer combines those components visually.

The model distinguishes:

- Implant fixture
- Implant abutment
- Implant crown
- Implant-supported bridge abutment
- Pontic within an implant-supported bridge

An implant icon alone is never the clinical source of truth. Implant records use
PLAN_DESIGN or CURRENT kind. PLAN_DESIGN components are editable only while the
parent plan is DRAFT and freeze with PRESENTED/ACKNOWLEDGED proposal content.
Completion creates separate CURRENT components rather than mutating designs.
CURRENT component identities, dependencies, and position cannot be edited in
place; correction creates an append-only successor/amendment or void event with
predecessor linkage. Planned components do not replace current anatomy until
completion.

Component dependencies are explicit. An internally placed abutment requires a
same-tenant, same-patient, same-position fixture; an implant crown requires an
abutment; an implant bridge abutment references the compatible implant component
chain. A CURRENT component requires CURRENT predecessors. A PLAN_DESIGN component
may depend on compatible design or CURRENT predecessors, but completion validates
the chain again atomically. Component and bridge record kinds/execution state
must be compatible, and no operation may leave a partial chain or bridge.

When a patient presents with a pre-existing external implant and the detailed
fixture history is unknown, create an explicit PREEXISTING_EXTERNAL fixture
component with UNKNOWN provenance/details. Do not bypass the dependency or invent
an internal provider/date.

## Periodontal Scope

Reuse the fork's useful site model, validation, CAL derivation, graphical rows,
keyboard movement, missing-tooth behavior, implant-aware behavior, and export-
independent engine logic. Rebuild the UI with EMR components.

Persist timestamped periodontal examinations and site measurements for:

- Probing depth
- Gingival recession
- Derived CAL
- Bleeding
- Suppuration
- Plaque
- Mobility
- Furcation
- Tooth/implant presence context

Measurements use the fork's canonical site order MB/B/DB/ML/L/DL for each
present tooth. A charted probing depth is an integer from 1 through 15 mm;
absence means uncharted and is never stored as zero. Gingival margin is a signed
integer from -10 through 20 mm, with positive meaning recession, zero at the
reference margin, and negative meaning coronal enlargement/pseudopocket. CAL is
always derived as `probing_depth_mm + gingival_margin_mm` (gingival margin
defaults to zero for a charted site), never manually entered; its representable
range is -9 through 35 mm. Bleeding and suppuration are site booleans meaningful
only for a charted site. O'Leary plaque uses the distinct mesial/distal/buccal/
lingual four-surface model, not the six probing sites. Mobility is per tooth and
furcation is per anatomically valid entrance with source grades I-IV.

A FINAL examination cannot be reopened or have predecessor, version, provider,
or finalization identity changed. Database guards reject INSERT, UPDATE, and
DELETE for every site, plaque, mobility, and furcation child whose parent is
FINAL. Amendment creates a new
examination version linked to its predecessor, copies the prior measurements,
and records only the authorized changes in the new version. Trend/history reads
are patient-scoped and retain both versions.

Advanced fork classifications and indices can be added only where their inputs
are completely persisted and clinically validated. The first integrated release
must not display a derived grade/index from incomplete data.

## Feature Disposition

| Capability | Disposition | Requirement |
| --- | --- | --- |
| Permanent dentition | PORT WITH ADAPTATION | Measured assets and EMR domain DTO |
| Primary dentition | PORT WITH ADAPTATION | Preserve measured primary assets and FDI validation |
| FDI numbering | PORT AS-IS | Canonical database notation |
| Universal notation | PORT WITH ADAPTATION | Display conversion only; FDI remains canonical |
| Palmer notation | PORT WITH ADAPTATION | Display conversion only; FDI remains canonical |
| Tooth selection | PORT WITH ADAPTATION | Controlled transient patient-keyed UI state |
| Multi-tooth selection | PORT WITH ADAPTATION | Preserve validated interaction; never persist selection |
| Tooth surfaces | REIMPLEMENT AGAINST EMR ARCHITECTURE | Relational multi-surface entries; reuse measured hit areas |
| Caries | PORT WITH ADAPTATION | Structured finding/surfaces/severity |
| ICDAS | PORT WITH ADAPTATION | Preserve fork scoring validation; persist explicit score |
| Restorations | PORT WITH ADAPTATION | Structured treatment/material/surfaces |
| Fillings | PORT WITH ADAPTATION | Restoration subtype; preserve surface/material overlays |
| Crowns | PORT WITH ADAPTATION | Renderer overlay driven by clinical treatment |
| Veneers | PORT WITH ADAPTATION | Structured subtype and applicable-surface validation |
| Inlays | PORT WITH ADAPTATION | Structured subtype/material and overlay |
| Onlays | PORT WITH ADAPTATION | Preserve corrected material-inlay overlay layer |
| Overlays | PORT WITH ADAPTATION | Structured subtype/material and renderer projection |
| Missing teeth | REIMPLEMENT AGAINST EMR ARCHITECTURE | Current finding distinct from planned extraction |
| Extraction | REIMPLEMENT AGAINST EMR ARCHITECTURE | Completed treatment plus resulting current missing state |
| Planned extraction | REIMPLEMENT AGAINST EMR ARCHITECTURE | Execution history; never implies missing until completion |
| Root canal/endodontic treatment | PORT WITH ADAPTATION | Structured treatment/components and root overlays |
| Post/core | PORT WITH ADAPTATION | Structured component dependencies and overlays |
| Implant fixture | REIMPLEMENT AGAINST EMR ARCHITECTURE | Clinical component model; reuse rendering |
| Implant abutment | REIMPLEMENT AGAINST EMR ARCHITECTURE | Explicit fixture dependency |
| Implant crown | REIMPLEMENT AGAINST EMR ARCHITECTURE | Explicit abutment dependency |
| Implant-supported bridge | REIMPLEMENT AGAINST EMR ARCHITECTURE | Bridge unit references implant component chain |
| Implant-supported pontic relationship | REIMPLEMENT AGAINST EMR ARCHITECTURE | Pontic has no support; adjacent bridge abutments carry natural/implant support |
| Bridges | REIMPLEMENT AGAINST EMR ARCHITECTURE | First-class arbitrary-span atomic groups |
| Pontics | REIMPLEMENT AGAINST EMR ARCHITECTURE | Ordered bridge-unit role, not a crown icon |
| Bridge connectors | PORT WITH ADAPTATION | Derived renderer geometry; no canonical connector row initially |
| Prosthetics | PORT WITH ADAPTATION | Include clinically supported fixed prosthetics; omit uncertain demo presets |
| Diagnoses/findings | PORT WITH ADAPTATION | Controlled codes; no renderer-only values |
| Tooth wear | PORT WITH ADAPTATION | Structured subtype/severity and accepted overlays |
| Discoloration | PORT WITH ADAPTATION | Structured subtype/severity and accepted overlays |
| Orthodontic features | PORT WITH ADAPTATION | Existing bounded findings only; no new orthodontic treatment system |
| Periodontal charting | PORT WITH ADAPTATION | Reuse engine; relational versioned examinations |
| Probing depths | PORT WITH ADAPTATION | Six sites, exact 1..15 mm validation |
| Gingival recession/margin | PORT WITH ADAPTATION | Signed margin -10..20 mm; positive is recession |
| CAL | PORT AS-IS | Derived PD + signed gingival margin; never manually entered |
| Bleeding | PORT WITH ADAPTATION | Per charted probing site |
| Suppuration | PORT WITH ADAPTATION | Per charted probing site |
| Mobility | PORT WITH ADAPTATION | Per-tooth validated grade |
| Furcation | PORT WITH ADAPTATION | Per anatomically valid entrance, grade I-IV |
| Plaque | PORT WITH ADAPTATION | Separate four-surface O'Leary model |
| FHIR utilities | OMIT | Isolated future interoperability candidate; not runtime/UI in first release |
| Fork JSON import/export | OMIT | Conflicts with EMR canonical persistence |
| Print | REIMPLEMENT AGAINST EMR ARCHITECTURE | Use EMR clinical print/history conventions |
| SVG/PDF/image export | OMIT | No fork export channel in first release |
| Validation utilities | PORT WITH ADAPTATION | Port pure clinically relevant validators into EMR types |
| Accessibility behavior | PORT WITH ADAPTATION | Preserve and improve semantic SVG controls/focus |
| Keyboard behavior | PORT WITH ADAPTATION | Preserve navigation/entry patterns in EMR controls |
| Localization logic | PORT WITH ADAPTATION | Reuse useful labels/notation mappings; omit demo language selector |
| Classic renderer | OMIT | No source-compatibility obligation |
| Demo shell/settings/tour/localStorage | OMIT | EMR owns UI and persistence |

## Renderer Decision and Classic Exclusion

The retained renderer is the fork's measured anatomy profile, including measured
front/occlusal SVGs, measured layout, hit areas, shared clinical overlay
registration, periodontal tooth rendering, and bridge overlay behavior.

Classic is explicitly excluded because measured is the customized current path
and the EMR has no compatibility requirement with the fork demo. Shared pure
engine logic that happens to live in `src/odontogram.ts` is extracted behind an
EMR adapter. Classic-only asset selection, layout, settings, tests, and CSS are
left in the fork and not copied.

## Customized Fork Fixes That Must Be Preserved

Concrete audited behavior at `5e28d93`:

- `src/assets/teeth-svgs/measured/*`: generated permanent and primary measured
  anatomy, including distinct premolar/molar occlusal assets and primary teeth.
- `tools/toothgen/*`: canonical anatomy generator, occlusal generation, overlay
  geometry, round-trip and anatomy verification; retain as provenance/tooling,
  not runtime clinical schema.
- `src/odontogram.ts` and `src/perioGraphic.ts`: measured anatomy registered in
  odontogram and periodontal renderers, including dentition-variant SVG swaps.
- `src/registry/svgLayers.ts`, `src/registry/restorations.ts`, measured SVGs, and
  `src/PerioChart.tsx`: clinical overlay registration across measured anatomy.
- `src/bridgeOverlay.ts`: revised bridge connector positioning/geometry aligned
  with registered measured anatomy.
- `src/index.css`: unified measured arch layout and preserved occlusal hit height
  from commits `231edc9` and `5e28d93`.
- `src/registry/restorations.ts`: fixed onlay appears in the lateral material-
  inlay layer (`8e9ac23`).
- `src/odontogram.ts`: composable control surfaces follow selected tooth and
  correct row visibility (`e160401`).
- `src/odontogram.ts`: idempotent setters and state-change notification for
  filling session flags (`808505f`, `1f111bb`).
- `src/fhir/iso3950.ts` and registry mappings: lossless primary ISO 3950 mapping.
- `src/fhir/codesystems.ts` and registry FHIR mapping: ICDAS/CARS coding behavior,
  retained as reference even while FHIR UI/import/export is omitted.
- `src/pluginSanitize.ts`: DOMPurify sanitization of plugin SVG; no plugin system
  is needed initially, but any reused dynamic SVG boundary must preserve the
  equivalent sanitization invariant.
- Regression tests in `src/__tests__/measured-anatomy.test.tsx`,
  `measured-chart-layout.test.ts`, `clinical-overlay-registration.test.ts`,
  `bridgeOverlay.test.ts`, restoration/parity/perio suites: use as transplant
  acceptance evidence, not merely visual reference.

The fork working tree currently has only line-ending differences in tracked
files plus unrelated untracked workflow/output directories. Implementation must
not copy those artifacts or rewrite the fork.

## SVG Refinement Strategy

The measured SVG set is the best current baseline, but anatomical perfection is
deferred. Runtime code maps stable tooth/surface/overlay semantics to renderer
asset identifiers through one adapter. Database rows never store path IDs,
coordinates, transforms, or asset filenames.

Future tooth-by-tooth SVG replacement must require renderer tests and asset
changes only. It must not require clinical migrations.

## Authorization and Audit

Reads, including periodontal reads, require existing `patient.clinical.read`.
Clinical and periodontal mutations require `patient.clinical.write`. Treatment
planning uses the accepted treatment-plan authorization. The append-only
execution-correction path requires `patient.clinical.correct`, defaulted only to
OWNER/ADMIN and enforced at server/RPC layers. Treatment completion additionally
requires `billing.charge` through the billing prerequisite.

Server actions and database RPCs both enforce permission. Every exposed tenant
table has RLS and zero base grants. Cross-tenant and forged patient/branch/
provider identifiers fail safely.

Audit meaningful changes: finding/treatment create, amend, void, lifecycle
transition, bridge mutation, implant component mutation, periodontal examination
create/finalize/amend, and treatment completion/charge. Audit metadata is bounded
and excludes narrative clinical content.

## UI/UX Expectations

The odontogram is the visual center of the existing patient clinical workspace,
not a standalone demo page. A compact toolbar holds dentition/notation/view and
perio entry. Tooth/surface selection opens contextual findings, treatments,
bridge/implant controls, plan execution, payment summary, and attributable
history in a dense side inspector on desktop/tablet and a focused sheet/step flow
on phone. Rare settings remain secondary.

All controls use the EMR's existing typography, spacing, color tokens, shadcn UI
primitives, feedback patterns, and responsive breakpoints. Do not copy demo
cards/control walls, theme/language selectors, decorative gradients, oversized
whitespace, or duplicate headings. Financial detail is permission-gated and
clinical state remains legible without relying on color alone.

## Accessibility and Responsive Requirements

- Every tooth and selectable surface has an accessible name including notation.
- Keyboard users can move between teeth, select surfaces, open actions, and exit
  dialogs without a pointer.
- Focus is visible and returns to the invoking tooth/control.
- Current/planned, finding/treatment, and bridge roles are not communicated by
  color alone.
- The measured chart remains visually central and larger-screen optimized.
- Tablet remains touch-safe. Phone provides full viewing and a focused stepwise
  editor rather than a squeezed desktop control wall.
- No clinically important action is hover-only or drag-only.

## Acceptance Criteria

- The correct patient and tenant chart loads from the database after reload.
- A buccal amalgam restoration persists with structured surface, material,
  provider/provenance, and history.
- Planned and current/completed states cannot overwrite one another implicitly.
- COMPLETED/CANCELLED execution correction is rejected without downstream
  mutation; linked clinical/financial amendment/void history remains explicit.
- Completed in-clinic treatment links atomically to treating provider and charge.
- Arbitrary validated bridges persist and render as one relationship with
  abutment/pontic/support roles.
- Presented bridge/implant designs and CURRENT relationships cannot be edited in
  place; completion/amendment/void preserves predecessors.
- Fixture, abutment, implant crown, and implant bridge support remain distinct.
- Periodontal readings validate, persist, calculate CAL, and retain history.
- FINAL periodontal parents reject child INSERT/UPDATE/DELETE and reopening.
- Measured anatomy and local overlay/layout fixes pass regression tests.
- Classic, demo shell, localStorage persistence, demo settings, and demo build
  infrastructure are absent from the EMR integration.
- Renderer replacement cannot require a clinical/database migration.
- Authorization, RLS, audit, keyboard, responsive, and patient-isolation tests
  pass at the prescribed layers.
