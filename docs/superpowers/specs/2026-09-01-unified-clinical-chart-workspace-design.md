# Unified Clinical Chart Workspace Design

**Status:** Approved design content; written-spec review, implementation plan, and implementation pending

**Date:** 2026-09-01

**Decision owner:** Project owner

**Related:**

- [`2026-08-30-odontogram-clinical-record-revamp-design.md`](2026-08-30-odontogram-clinical-record-revamp-design.md)
- [`ADR-028-odontogram-renderer-domain-boundary.md`](../../decisions/ADR-028-odontogram-renderer-domain-boundary.md)
- [`ADR-029-odontogram-local-completion-window.md`](../../decisions/ADR-029-odontogram-local-completion-window.md)
- [`FRONTEND_ARCHITECTURE.md`](../../FRONTEND_ARCHITECTURE.md)
- [`SECURITY_ARCHITECTURE.md`](../../SECURITY_ARCHITECTURE.md)
- [`DATABASE_DESIGN.md`](../../DATABASE_DESIGN.md)

## 1. Purpose and precedence

The patient Clinical section will become one continuous, full-width dental
chart workspace. It will replace the fragmented `Records`, `Odontogram`, and
`Treatment plan` inner tabs with one workflow that joins the anatomical chart,
current status, treatment planning, periodontal examination, progress notes,
procedure charges and payments, and clinical photographs.

This document refines and supersedes the **workspace layout, navigation, and
interaction details** in the 2026-08-30 odontogram revamp design. The earlier
design remains authoritative for canonical clinical models, ledger billing,
private media, import/export safety, tenancy, authorization, auditing,
migration safety, and release gates unless this document explicitly provides a
more specific approved interaction rule. The controlled
`Ditherys/React-Odontogram-Modul` fork remains the approved renderer source.

This is a design checkpoint, not implementation authorization or a claim of
completion. A reviewed implementation plan is required before code or schema
work begins.

## 2. Decision summary

The accepted approach is **Approach 1: a unified Clinical Chart workspace**.

- Remove the redundant `Records`, `Odontogram`, and `Treatment plan` inner
  tabs.
- Use three modes within one chart: `Current status`, `Treatment plan`, and
  `Periodontal`.
- Let the clinical chart use the available application width while the rest of
  the patient profile retains its normal content limit.
- Keep the chart central and open tooth-specific work in a temporary native EMR
  drawer instead of permanent side columns.
- Put one chronological progress-record table directly below the chart.
- Treat PostgreSQL/Supabase clinical records as the source of truth. The fork
  renders canonical projections and never becomes the clinical database.
- Fully integrate the fork's anatomical, periodontal, implant, bridge,
  endodontic, notation, help, and export capabilities that are approved below.
- Exclude Classic view, reset controls, freehand drawing, drawing history,
  local/demo persistence, and unsafe extension or SVG injection mechanisms.

## 3. Evidence from the current integration

Read-only browser inspection of the local EMR and controlled fork identified
the following concrete problems:

- On a 1920-pixel desktop, the patient content is constrained to about 1280
  pixels. Inside it, the chart, fork controls, and tooth inspector compete for
  width, leaving the anatomical chart at roughly 560 pixels.
- The current integration adds a fork controls column and a separate EMR tooth
  inspector, so relationship actions and clinical-entry actions appear twice.
- At a 390-pixel viewport, the odontogram remains about 928 pixels wide inside
  a 343-pixel container, producing a squeezed desktop chart with horizontal
  scrolling rather than a phone workflow.
- Treatment history, chart records, treatment plan, print chronology, and
  clinical photos are presented in separate or duplicated sections.
- The current periodontal entry exposes only part of the controlled fork's
  periodontal capability and does not provide a complete start, finalize,
  amend, compare, and classification workflow.
- Fork demo styling and control shapes do not match the EMR's typography,
  colors, spacing, button hierarchy, or responsive behavior.

These observations justify rebuilding the workspace shell and workflows. They
do not justify replacing the approved renderer or bypassing the canonical
domain boundary.

## 4. Goals

The workspace must:

1. make the odontogram the main visual entry point to the patient's complete
   dental record without making renderer state canonical;
2. show a stable current clinical state after every reload and patient change;
3. let a treating dentist record findings, plans, performed treatment,
   periodontal measurements, charges, payments, notes, and photographs without
   choosing a different provider;
4. preserve a dated, attributed, append-only clinical and financial history;
5. support structured bridge, implant, restoration, endodontic, orthodontic,
   and periodontal behavior with anatomically meaningful overlays;
6. present a dense, readable clinical workbench that matches the existing EMR;
7. work intentionally on desktop, tablet, and phone without horizontal page
   overflow or hover-only critical actions; and
8. retain organization isolation, branch rules, role authorization, RLS,
   auditability, and guarded forward-only migration practices.

## 5. Non-goals and exclusions

- Classic view is excluded because its tooth representation is not accepted as
  anatomically correct.
- There is no patient, mouth, or tooth reset action.
- Freehand drawing and drawing-history authoring are removed.
- The fork's local storage, demo records, seeded providers, and demo treatment
  workflow are not integrated.
- The renderer does not own patient state, clinical codes, treatment plans,
  periodontal exams, encounters, charges, payments, or media metadata.
- The redesign does not add decorative dashboards, KPI cards, marketing hero
  copy, or unrelated patient-page restructuring.
- This design does not authorize production deployment, real patient/provider
  use, or skipping Cloud TEST and release gates.

## 6. Unified information architecture

### 6.1 Clinical section structure

The patient-level `Clinical` navigation item remains. Its content is one
continuous workspace in this order:

1. compact Clinical header and visit state;
2. always-visible medical-safety summary;
3. clinical-chart mode toolbar;
4. full-width anatomical or periodontal chart;
5. contextual tooth or examination drawer when opened;
6. chronological progress record; and
7. contextual dialogs/sheets for gallery, export, and confirmed actions.

The old inner tabs are removed. Current status, planning, and periodontal
charting are modes of the same clinical chart and do not navigate to separate
patient subpages.

### 6.2 Clinical header and visit state

The header retains the existing Clinical title and short description. Its
primary action reflects the signed-in user's current patient visit:

- `Start visit` when no active eligible visit exists;
- `Resume visit` when today's eligible visit is already active; or
- `Finalize visit` while an active visit is open and finalization requirements
  are satisfied.

The header also exposes compact secondary actions for `Gallery`,
`Print/export`, and an overflow menu. These actions use the existing EMR button
variants and must not compete visually with the next clinical action.

### 6.3 Medical-safety summary

Conditions, allergies, and medications remain visible near the top of the
workspace as a compact safety strip. Clinically important positive entries
must be readable without opening another tab. Empty categories use concise
`None recorded` text. The strip may expand for details, but must not consume the
chart's primary desktop area or be hidden solely behind hover.

## 7. Visit lifecycle and provider attribution

### 7.1 Automatic start or resume

A dentist does not need to open an encounter before using the chart. The first
clinical write for the patient automatically starts or resumes today's active
visit in one server-side transaction.

The transaction must:

1. authenticate the user;
2. authorize the organization, patient, branch, role, and clinical action;
3. derive the user's active treating-provider identity;
4. lock or otherwise serialize the applicable active-visit key;
5. reuse the valid open visit for that patient, branch, treating provider, and
   clinical day, or create exactly one; and
6. write the clinical event with the authoritative visit and provider IDs.

A unique invariant and concurrency tests must prevent double-clicks or
concurrent browser requests from creating duplicate active visits.

### 7.2 Treating dentist

There is no provider picker for clinical treatment. The signed-in dentist is
the treating dentist and cannot attribute the record to another provider.

An owner account may treat patients when it is also assigned an active dentist
provider identity with the required organization and branch permissions. The
owner role alone must not fabricate a provider identity or bypass clinical
authorization. A different provider such as `Provider A` is not substituted
for the signed-in dentist.

### 7.3 Non-clinical payments

A receptionist recording a payment does not start a clinical visit. A dentist
may record a permitted payment while treating the patient, but charge creation,
payment collection, and encounter creation remain separate domain events even
when one person performs them.

### 7.4 Finalization and correction

A visit can remain open across its clinical work. Finalization freezes its
notes and other legally significant authored content. Finalized entries are
corrected through attributed amendment or void workflows with a required
reason; they are never silently overwritten.

## 8. Clinical-chart modes

The chart toolbar presents three mutually exclusive modes while retaining the
same patient context and current visit:

### 8.1 Current status

`Current status` is the default mode. It renders the latest canonical tooth,
surface, root, prosthetic, implant, orthodontic, and periodontal projection.
Clicking or keyboard-selecting a tooth opens its current record. Multi-select
is available for genuinely shared actions and must remain visibly indicated.

### 8.2 Treatment plan

`Treatment plan` uses the same anatomy and selection model. Planned findings,
procedures, surfaces, bridges, implants, and other relationships use a distinct
dashed/non-solid treatment-plan presentation with a text or icon cue so color
is not the only distinction.

The plan mode replaces the separate treatment-plan tab. It does not permit
freehand drawing. Planning is structured and records teeth, surfaces,
relationships, procedure, estimate, priority, sequence, alternatives, and
notes.

### 8.3 Periodontal

`Periodontal` replaces the tooth-restoration canvas with the complete
periodontal/peri-implant examination workspace described in section 12. It
remains part of the same Clinical workspace and patient chronology.

## 9. Chart toolbar and anatomy

### 9.1 Toolbar

The compact chart toolbar contains:

- mode switcher: `Current status`, `Treatment plan`, `Periodontal`;
- notation selector: FDI, Universal, or Palmer;
- relevant dentition/layer controls;
- a concise legend/help action;
- gallery and permissioned print/export access; and
- responsive arch or quadrant controls when needed.

Less frequent settings belong in a popover, sheet, or overflow menu. There is
no permanent controls column and no reset action.

### 9.2 Renderer responsibilities

The controlled fork supplies repository-reviewed tooth anatomy, surfaces,
roots, pulp, bone/gingiva, implants, prosthetic components, restorations,
endodontic overlays, bridge connectors, periodontal visualizations, and
selection geometry. EMR components own all workflow buttons, dialogs, forms,
authorization feedback, record lists, typography, spacing, and layout.

Only trusted, pinned repository assets may be rendered inline. Arbitrary
clinical or user-provided SVG/HTML is not executed. The fork's raw state is
converted through a bounded adapter from canonical DTOs and is never saved as
the source of truth.

### 9.3 Selection behavior

- A single click/tap selects a tooth and opens the tooth drawer.
- Keyboard selection and visible focus are supported.
- Multi-select uses an explicit modifier on desktop and an explicit control on
  touch devices; it cannot depend on a desktop-only gesture.
- `Clear selection` clears only transient UI selection. It does not alter any
  clinical record.
- Missing natural teeth remain selectable for edentulous-site planning and
  implant workflows.

## 10. Tooth drawer and clinical record composer

### 10.1 Drawer structure

Selecting a tooth opens a temporary drawer of approximately 400 pixels on a
wide desktop. The drawer overlays or temporarily shares the chart area and can
close completely so the chart regains the width. It is not a permanent third
column.

The drawer shows:

- tooth identifier in the selected notation and canonical FDI identifier;
- current findings and treatments;
- active and historical plan items;
- relevant bridge, implant, crown, orthodontic, and other relationships;
- dated tooth history; and
- one primary action: `Add clinical record`.

Existing relationship workflows appear only when they are relevant to the
selected tooth or site. They are not duplicated in separate always-visible
cards.

### 10.2 Add clinical record

The primary action opens a native EMR form with one of these record types:

1. Finding
2. Treatment performed
3. Treatment-plan item
4. Bridge or prosthesis
5. Implant
6. Clinical note or photograph

Forms reveal only fields relevant to the chosen record type. Patient,
organization, branch, signed-in provider, active visit, audit actor, and
recorded timestamp are derived or validated server-side. Treatment/service
date is a required clinical field and remains distinct from the system's
recorded timestamp.

### 10.3 Findings and treatment completion

Findings are active until explicitly resolved, amended, or voided. Completing
a treatment requires the dentist to select the exact findings it resolves.
Unselected findings remain active.

Canonical treatment execution updates the derived chart only after the server
transaction succeeds. Examples include:

- root-canal treatment activating the appropriate root/pulp overlay;
- a missing-tooth implant progressing through fixture, abutment, and crown
  components while replacing natural-tooth anatomy appropriately;
- a bridge rendering its structured span and
  abutment/pontic/connector relationships; and
- completed restoration state appearing on the recorded surfaces.

### 10.4 Charges and immediate payment

For a chargeable performed procedure, the treating dentist enters the actual
procedure charge. The form must show an explicit confirmation with the amount,
procedure, patient, and linked procedure case before submission. Once
confirmed, the original charge amount cannot be edited.

The confirmation flow offers an optional immediate payment when the user has
`payment.record`. The payment is a separate ledger event and is allocated only
to the selected procedure case. Installments are supported for any eligible
procedure, not only orthodontics or crowns.

Corrections use `Amend`, `Void`, refund, reversal, or other approved ledger
actions with reasons and audit history. They never rewrite the confirmed
charge or historical payment.

## 11. Treatment-plan workflow

### 11.1 Plan authoring

The dentist selects one or more teeth or sites in `Treatment plan` mode and
adds structured plan items. Each item supports:

- procedure and clinical rationale;
- tooth, surfaces, span, or component relationship;
- estimated amount;
- priority and intended sequence;
- alternatives discussed;
- notes; and
- status and version provenance.

Notes support clinical context but do not replace structured tooth, surface,
relationship, or procedure fields.

### 11.2 Versioning and acknowledgement

Draft plan items can be revised while clearly marked draft. Presenting a plan
freezes an attributed version. Patient acknowledgement or later amendment
creates lifecycle events and preserves earlier versions. A presented or
acknowledged version is not silently edited.

### 11.3 Executing a plan item

The dentist can start `Treatment performed` from an eligible plan item. The
execution references the exact plan version and selected findings, captures
the actual procedure details and service date, and creates the confirmed
charge when required. The plan item then derives its completed or partially
completed status from canonical executions; it does not become the execution
record itself.

## 12. Full periodontal and peri-implant integration

### 12.1 Examination lifecycle

If no periodontal examination exists, the mode presents `Start periodontal
examination`, not a dead-end message. The dentist chooses Initial,
Reevaluation, or Maintenance and provides the examination date. Patient,
branch, visit, and signed-in dentist are assigned server-side.

An examination supports:

- draft save and bounded autosave;
- explicit completeness review;
- finalization;
- attributed amendment with reason; and
- side-by-side or overlay comparison with a prior finalized examination.

Finalized measurements are immutable except through versioned amendment.

### 12.2 Anatomical charting

The workspace provides full buccal and lingual/palatal charting with six sites
per tooth for applicable measurements. It supports natural teeth and implants,
skips clinically missing teeth, and disables natural-tooth-only fields for
implant sites.

Canonical periodontal/peri-implant coverage includes:

- probing depth (PD);
- gingival margin/recession (GM);
- clinical attachment level (CAL), derived consistently from accepted inputs;
- bleeding on probing (BOP);
- suppuration;
- plaque;
- plaque index (PI);
- gingival index (GI);
- mobility;
- furcation;
- Miller class;
- keratinized gingiva (KG);
- gingival thickness/phenotype (GT);
- CEJ visibility;
- root concavity;
- implant modified plaque index (mPI); and
- implant modified bleeding index (mBI).

The canonical schema uses normalized measurement rows and typed
examination/tooth/site records rather than copying the fork's internal
structure. Every required clinical value must survive reload, export,
comparison, and amendment outside the renderer.

### 12.3 Visualization and navigation

The mode offers the reviewed visualization layers:

- None
- PD
- CAL
- recession
- Cairo
- KG
- BOP
- plaque
- PI
- GI
- mPI
- mBI
- PD at least 5 mm
- PD at least 6 mm

The chart shows buccal and lingual/palatal anatomy, measurement grids, and
patient-position-aware tooth navigation. Entry can proceed predictably by
site, tooth, quadrant, or arch. Critical values have non-color indicators and
are usable from keyboard and touch.

### 12.4 Summary and classification

The examination summary includes:

- average and maximum PD;
- average and maximum CAL;
- BOP percentage;
- plaque percentage;
- examination completeness; and
- maximum furcation involvement.

Risk/context inputs include smoking, diabetes and HbA1c where clinically
available, radiographic bone loss, and teeth lost due to periodontitis.

The system derives the accepted 2017 periodontal diagnosis, stage, grade, and
extent from canonical measurements and risk inputs. The UI distinguishes the
derived classification from clinician confirmation. An override requires a
reason and captures the signed-in dentist, source version, and timestamp. The
clinical algorithm and terminology require dedicated tests and clinical review
before release.

### 12.5 Timeline and output

Finalization and amendment create dated chronology events. Print/PDF and
authorized structured export can include the selected examination, summary,
classification, risk context, provider, and comparison. Draft measurements are
not represented as finalized results.

## 13. Chronological progress record

### 13.1 One continuous table

The workspace has one progress-note-style table below the chart. It is ordered
by service/event date from oldest to newest by default, matching a paper dental
progress record. Users may apply temporary sorting and filters without changing
the canonical chronology.

The table replaces separate simple encounter history, duplicate chart history,
and separate treatment-plan history displays.

### 13.2 Event coverage

Rows include:

- visit opened, resumed, finalized, or amended;
- encounter note and prescription events;
- finding recorded, amended, resolved, or voided;
- treatment performed and follow-up;
- treatment-plan draft, presentation, acknowledgement, amendment,
  cancellation, and completion;
- periodontal examination finalization and amendment;
- clinical photograph upload, link, pairing, rename, archive, and note link;
- confirmed charge;
- payment and allocation;
- refund, reversal, and correction; and
- other clinically relevant audited events approved by the domain contract.

### 13.3 Columns and expansion

The compact desktop columns are:

1. service/event date;
2. event or procedure;
3. tooth/surface/site;
4. actor or treating dentist;
5. notes/attachments;
6. charge;
7. payment; and
8. linked procedure balance.

Rows can expand for version history, resolved findings, plan provenance,
ledger allocation, attachments, and amendment/void reasons. Mobile renders the
same information as stacked chronological entries, not a clipped table.

### 13.4 Procedure-specific balances

A displayed balance is derived from one procedure case's confirmed charges,
allocations, refunds, and reversals. Payments for an orthodontic case cannot
reduce a filling, crown, implant, or other procedure balance. A patient may
have multiple independent installment-supported procedure balances at once.

## 14. Clinical photograph gallery

The workspace toolbar opens a patient clinical gallery without duplicating the
entire gallery below every chart mode. Photo lifecycle events remain in the
chronological table.

Each photo records a required capture date and category:

- Before
- Progress
- After
- Diagnostic
- Radiograph
- Other

It may link to a tooth, surface, visit, procedure case, treatment-plan item, or
clinical note. The gallery supports filters, permission-checked preview,
before/after pairing, and safe display-filename rename.

Renaming changes only the human-readable display filename. It never changes
the opaque storage key, original source bytes, or retained original metadata.
Canonical originals remain private in the approved provider-neutral object
store, and only permission-checked predefined derivatives are delivered.

## 15. EMR-consistent visual design

### 15.1 Visual language

All surrounding UI uses the current EMR design system:

- Geist typography;
- existing navy, neutral, success, warning, and destructive tokens;
- shadcn/ui `Button`, `Input`, `Select`, `Tabs` or segmented controls,
  `Sheet`, `Dialog`, and `Table` primitives where appropriate;
- existing border radii, border colors, focus rings, density, and icon style;
  and
- Lucide icons when an icon clarifies an action.

Fork purple fills, gradients, demo button styles, oversized rounded cards,
decorative shadows, and generic dashboard presentation are excluded.

### 15.2 Action hierarchy

- A solid primary button is reserved for the immediate next clinical action.
- Outline buttons are secondary actions.
- Ghost buttons and overflow menus contain tertiary actions.
- Destructive styling is reserved for void, cancel, archive, or comparably
  destructive operations and always requires explicit confirmation where the
  domain requires it.
- Status badges are used only when status materially helps clinical or workflow
  comprehension.

Controls target approximately 44-by-44 pixels for touch safety. Focus is
visible, labels are programmatic, and no critical meaning relies only on color,
hover, or drag.

## 16. Responsive behavior

### 16.1 Desktop

The Clinical chart alone may break out of the patient page's ordinary
1280-pixel content cap. On a normal wide desktop, all 32 permanent teeth fit
without horizontal page scrolling. The chart is the primary region; no
permanent controls or inspector columns shrink it.

The tooth drawer opens on the right at roughly 400 pixels and closes fully.
The chronology uses a dense table below the chart. The medical-safety strip and
toolbar remain compact.

### 16.2 Tablet

Tablet uses arch-focused navigation rather than shrinking a full desktop chart
until teeth become unusable. The current arch is clearly identified and can be
switched with touch-safe controls. The tooth editor appears as a right sheet in
landscape or bottom sheet in portrait. Critical chart actions remain visible
without a permanent controls column.

### 16.3 Phone

Phone uses a deliberate quadrant/tooth workflow:

1. select chart mode;
2. choose arch or quadrant;
3. select a tooth/site;
4. review or record details in a full-height sheet; and
5. advance to the next relevant tooth/site when requested.

The periodontal exam supports tooth-by-tooth and site-by-site entry with a
sticky, safe-area-aware action footer. The phone never embeds the 928-pixel
desktop chart as a horizontally scrolling clinical form. Chronology rows become
stacked entries while preserving dates, actor, clinical details, and financial
amounts.

## 17. Component and domain boundaries

The implementation plan should preserve these focused responsibilities:

| Unit | Responsibility |
| --- | --- |
| Clinical workspace shell | Patient context, visit state, section layout, mode routing |
| Medical-safety summary | Readable conditions, allergies, and medications context |
| Chart toolbar | Mode, notation, layers, responsive navigation, help/output entry points |
| Anatomical chart adapter | Canonical DTO-to-fork rendering projection and selection events |
| Tooth drawer | Current tooth record, history, relationships, and composer entry |
| Clinical record composer | Validated finding, treatment, plan, relationship, note, charge, and payment forms |
| Treatment-plan workspace | Draft/version lifecycle, structured items, overlays, execution handoff |
| Periodontal workspace | Examination lifecycle, measurements, summaries, comparison, classification |
| Chronology table | Unified dated clinical/financial event projection and expansion |
| Clinical gallery | Private photo lifecycle, filtering, preview, pairing, and safe rename |

These units communicate through typed application DTOs and server commands.
UI components do not call fork persistence or infer authorization from hidden
buttons.

## 18. Data flow and reliability

### 18.1 Write flow

Every clinical write follows this sequence:

```text
Dentist action
  -> client form validation
  -> authenticated server command
  -> organization/patient/branch/role/provider authorization
  -> transactional canonical write and audit event
  -> current-state and chronology projection
  -> focused refetch
  -> anatomical/timeline rerender
```

The browser may optimistically preserve selection or form input, but it must
not present a clinical overlay as persisted before the server confirms the
write.

### 18.2 Reload and patient navigation

On initial load, refresh, or patient navigation, canonical DTOs rebuild all
current, planned, relationship, periodontal, billing, chronology, and photo
projections. No patient clinical state is restored from fork local storage or
another patient's stale React state.

### 18.3 Concurrency and idempotency

- Commands that may be double-submitted require scoped idempotency keys.
- Versioned resources reject stale edits and return a refresh/review message.
- Auto-start/resume of visits is transactional and race-safe.
- Confirmed charge plus treatment completion is atomic where the approved
  domain requires both.
- Payment allocation enforces procedure-case and tenant invariants in the
  database transaction.
- Periodontal autosave uses explicit draft versions and cannot overwrite a
  finalized or newer examination.

### 18.4 Failure behavior

- A rejected write keeps entered form data and shows an actionable inline
  error without changing the chart projection.
- Authorization failures disclose no foreign patient, tenant, provider, or
  object existence.
- A stale-version response requires a canonical refresh and intentional retry.
- Closing a drawer or changing patient with unsaved clinical input requires a
  warning.
- Photo processing failures preserve confirmed source metadata, show bounded
  retry state, and never present an invalid derivative as complete.
- Logs contain no clinical free text, tokens, credentials, presigned URLs,
  image bytes, or unnecessary patient identifiers.

## 19. Authorization, tenancy, and audit

- Organization is the tenant boundary. Patient access remains organization
  scoped, with branch restrictions enforced for the action being performed.
- The client cannot authorize itself by sending `organization_id`,
  `branch_id`, `provider_id`, `collector_id`, `patient_id`, prices, or roles.
  The server derives or verifies every identifier against authenticated
  membership and the loaded record.
- Every exposed tenant table has RLS and no unsafe base-table grants.
- Browser-reachable writes use narrow audited RPCs or equivalent reviewed
  server transactions with defense-in-depth application authorization.
- Owner-as-dentist access is tested as a bounded provider assignment, not a
  role-escalation shortcut.
- High-impact events include creation, completion, finalization, plan
  presentation, charge confirmation, payment, refund/reversal, amendment,
  void, import acceptance, export, and clinical-photo lifecycle actions.
- Audit records retain actor, authoritative provider/collector where relevant,
  time, target/version, action, and bounded reason without duplicating clinical
  text or sensitive object URLs unnecessarily.
- Negative authorization tests must cover receptionist clinical-write denial,
  unauthorized dentist/owner behavior, forged tenant/branch/provider/collector
  IDs, cross-tenant relationships, and foreign media access.

## 20. Migration and cutover rules

Schema gaps discovered for this design, especially full periodontal fields,
visit uniqueness, canonical relationship state, or chronology projections,
must use reviewed forward-only migration files. Existing applied migrations are
not rewritten. `db:reset:local` remains prohibited.

Each exposed table or callable function is implemented with its constraints,
indexes, RLS, grants, audited write path, generated types, and pgTAP negative
tests in the same coherent task. Cross-tenant foreign keys and procedure-case
allocations require database-level referential safety.

Cutover removes obsolete UI and write paths only after canonical migration and
reload tests prove one active source of truth. Any legacy drawing cleanup is a
separately guarded, fail-closed migration that must not delete unrelated
clinical history.

## 21. Retained and excluded fork capabilities

### 21.1 Retained and adapted

- anatomical measured tooth rendering and clinically meaningful overlays;
- permanent/primary/mixed/edentulous dentition where supported by the approved
  product model;
- FDI, Universal, and Palmer notation;
- surface, crown, root/pulp, gingiva/bone, implant, bridge, restoration,
  endodontic, and orthodontic states supported by canonical data;
- current versus planned visual distinction;
- multi-select and keyboard/touch navigation;
- full periodontal and peri-implant entry, visualization, summary, comparison,
  and classification described in section 12;
- EMR-styled help and legends; and
- permissioned PDF/print, SVG/PNG, JSON, and FHIR output, plus staged validated
  JSON/FHIR import where accepted by the earlier design.

### 21.2 Excluded

- Classic view;
- reset patient, mouth, arch, quadrant, tooth, or demo data;
- freehand drawing and drawing history;
- fork demo/provider/patient/billing workflows;
- localStorage or renderer-specific persistence;
- following an unpinned upstream branch/package;
- arbitrary executable extensions; and
- unsafe SVG or HTML injection.

## 22. Verification and acceptance

### 22.1 Domain and unit tests

- canonical-to-renderer projection for every retained overlay;
- missing-tooth, root-canal, implant component, bridge, restoration, and
  planned/current transitions;
- exact finding resolution and plan execution provenance;
- provider derivation including a correctly assigned owner-dentist;
- charge immutability, installment support, allocation isolation, refunds, and
  reversals;
- visit auto-start/resume idempotency and concurrency;
- periodontal calculations, completeness, comparison, risk inputs,
  classification, clinician confirmation, and override provenance; and
- photo filename, pairing, link, derivative, and archive invariants.

### 22.2 Database and authorization tests

- organization and branch RLS isolation for every added/exposed table;
- forged patient, organization, branch, provider, collector, charge, plan,
  examination, procedure-case, and photo identifiers;
- receptionist and unauthorized owner clinical-write denial;
- dentist and receptionist payment permissions within their exact scope;
- cross-tenant relationship and allocation rejection;
- finalization/amendment immutability;
- concurrent active-visit, charge, payment, autosave, and completion behavior;
  and
- bounded audited RPC grants with no unsafe base-table access.

### 22.3 Component and browser tests

- no redundant inner Clinical tabs;
- all 32 teeth visible on representative desktop widths without horizontal
  page scrolling;
- drawer open/close restores usable chart width;
- arch-focused tablet and quadrant/tooth phone workflows;
- no squeezed desktop chart on phone;
- keyboard, screen reader, touch, visible focus, 200-percent zoom, and non-color
  state coverage;
- chart reload and patient-navigation source-of-truth behavior;
- finding, treatment, plan, bridge, implant, charge, payment, periodontal,
  chronology, and gallery happy and failure paths;
- print/export authorization and layout; and
- absence checks for Classic, reset, drawing, demo state, unscoped fork styles,
  and localStorage clinical persistence.

### 22.4 Required quality gates

Relevant lint, strict typecheck, unit/component tests, migration security lint,
local pgTAP, generated-type check, production build, dependency audit, secret
scan, diff hygiene, and guarded authenticated E2E specifications are required.

Under ADR-029, local completion can be recorded only as locally implemented
and verified. Cloud TEST database application, hosted authenticated E2E,
responsive/accessibility execution, advisor/security checks, independent
release review, and final owner acceptance remain mandatory before deployment
or any real patient/provider use.

## 23. Implementation decomposition

The implementation plan should deliver independently reviewable, testable
slices in this order:

1. canonical contract and schema-gap inventory, especially full periodontal
   coverage and active-visit uniqueness;
2. native full-width Clinical shell, safety strip, mode toolbar, and responsive
   layout without changing clinical semantics;
3. canonical anatomical adapter and source-of-truth reload behavior;
4. unified tooth drawer and record composer with server-derived provider and
   transactional visit start/resume;
5. structured treatment-plan mode and execution handoff;
6. full periodontal/peri-implant persistence, examination lifecycle, entry,
   visualization, summary, comparison, and classification;
7. unified chronological projection/table and procedure-specific financial
   presentation;
8. gallery entry point and chronology integration;
9. controlled import/export/print and help/legend parity;
10. removal of obsolete duplicated UI/write paths; and
11. responsive, accessibility, security, migration, and release-gate
    verification.

Schema and authorization work must accompany the first slice that needs it,
not be deferred to a final hardening task. Each slice must preserve a usable,
canonical patient chart and pass its focused review before the next begins.

## 24. Approval consequences

Approval of this written design permits creation of a detailed implementation
plan. It does not by itself permit production deployment, destructive database
operations, dependency replacement, hosted writes, or real patient/provider
use. Material changes to canonical clinical meaning, tenancy, billing ledger
semantics, media storage, renderer choice, or the deferred release gates
require a separately reviewed decision.
