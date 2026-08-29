# Odontogram and Longitudinal Dental Record Revamp

**Status:** Approved by the project owner on 2026-08-30

**Date:** 2026-08-30

**Scope:** Revised local O1-O14 odontogram completion boundary

**Source renderer:** Project-controlled `Ditherys/React-Odontogram-Modul` fork,
pinned to reviewed commit `5e28d931feefe4c3382513dbb0f5a9db9cf9948c`

## 1. Decision summary

Rebuild the patient odontogram workspace and fork adapter from zero while
preserving and extending the EMR's existing canonical PostgreSQL clinical,
financial, audit, tenancy, and file-storage foundations.

The controlled fork supplies measured anatomical rendering and behavior, not
the canonical record. The EMR owns all findings, treatment plans, executions,
relationships, periodontal measurements, charges, payments, progress events,
and clinical-photo metadata in renderer-independent domain models.

The new workspace includes every reviewed useful feature of the controlled
fork, adapted to EMR security and persistence conventions. The Classic view,
destructive reset controls, drawing authoring, demo persistence, and arbitrary
runtime code injection are excluded.

This design also expands the accepted O12 boundary. The current O12 text says
not to add fork JSON import/export, FHIR controls, or image export. Once this
design and its implementation plan are accepted, the authoritative odontogram
specification, plan, and decision record must be amended before implementation
of that expanded scope. No implementation may silently contradict the current
accepted documents.

It also deliberately amends the accepted billing permission contract. That
contract currently permits dentists to post charges only through their own
clinical completion but does not grant `payment.record`. The approved workflow
adds a bounded dentist payment-recording path for already-authorized patients
and valid active branch context. The billing specification, plan, permission
contract, and associated ADR must be updated and tested before that path is
implemented.

## 2. Goals

- Make the odontogram the complete, longitudinal dental chart for one patient.
- Reproduce the controlled fork's clinically useful anatomical transitions,
  including missing teeth, implants, root-canal treatment, prostheses,
  restorations, orthodontics, and periodontal state.
- Separate current clinical status from proposed treatment while allowing
  urgent or simple treatment to be recorded without a prior formal plan.
- Preserve immutable, attributable clinical and financial history.
- Show one continuous, paper-progress-note-style chronological record below
  the chart, with dates treated as first-class clinical data.
- Tie each treatment execution to its signed-in treating dentist, resolved
  findings, confirmed charge, payments, and resulting procedure balance.
- Support partial payment and optional installment schedules for any procedure,
  rather than special-casing orthodontics or crowns.
- Add a private patient clinical-photo gallery with before/progress/after
  workflows and chronological record integration.
- Support safe staged FHIR/JSON import and permissioned PDF, print, JSON, FHIR,
  SVG, and PNG export.
- Remain organization-tenant-safe, dynamically branch-ready, auditable,
  accessible, responsive, and independent of fork-specific persisted formats.

## 3. Non-goals and exclusions

- The Classic renderer is not included because it is not anatomically correct.
- There is no Reset Mouth, Reset Tooth, replace-current-chart, or similar
  destructive shortcut. Clear Selection remains because it changes only
  transient UI focus.
- Freehand drawing and drawing-history authoring are removed from the product.
- Fork demo screens, localStorage clinical persistence, synthetic demo patients,
  and a second fork-shaped system of record are not retained.
- Users cannot upload executable plugins, JavaScript, or arbitrary unsanitized
  SVG content.
- The work does not authorize production deployment, real provider/patient use,
  or bypass of hosted Cloud TEST and final release gates.
- This design does not replace the accepted ledger with a mutable patient
  balance field.

## 4. Chosen implementation approach

### 4.1 Foundation-preserving rebuild

Three approaches were considered:

1. Patch the current integration in place.
2. Replace both UI and canonical backend with the fork's state model.
3. Rebuild the workspace, interaction model, and adapter while preserving the
   reviewed EMR database, RLS, audit, ledger, file, and history foundations.

Approach 3 is selected. It removes the buggy presentation and interaction
implementation without discarding the project's strongest security and data
integrity work. It also prevents third-party renderer state from becoming
clinical truth.

### 4.2 Boundary model

```text
Patient workspace
  -> EMR forms and workflow commands
  -> renderer-independent odontogram domain model
  -> authorized server actions and narrow RPCs
  -> PostgreSQL canonical clinical/financial metadata

Canonical chart projection
  -> controlled fork adapter
  -> measured anatomical renderer

Clinical photo metadata
  -> PostgreSQL + RLS
Original and derivative bytes
  -> provider-neutral S3 adapter
  -> MinIO locally / Cloudflare R2 in production
```

The renderer receives a bounded, read-only projection and emits typed user
intent. It cannot write directly to the database, object storage, localStorage,
or arbitrary network endpoints.

## 5. Workspace and interaction design

### 5.1 Patient-scoped layout

The chart remains inside the existing patient dental-record workspace. Its
primary desktop composition is:

1. compact chart toolbar;
2. measured anatomical chart;
3. contextual tooth, relationship, plan, or periodontal inspector;
4. one chronological dental-record table below the chart;
5. adjacent or tabbed treatment-plan, financial, periodontal, and gallery
   detail where the task requires it.

Tablet layouts retain touch-safe charting and a sheet/drawer inspector. Phone
layouts use an intentional stepwise viewing/editing flow rather than shrinking
the desktop arrangement. Clinically important content cannot depend on hover,
drag, color, or mouse-only controls.

### 5.2 Current Status and Plan modes

Current Status records findings, completed/unplanned treatment, and the
patient's present clinical state. A dentist may record direct treatment here;
urgent and simple procedures do not require a pre-existing plan.

Plan mode uses the fork's proposed-state overlays but persists structured EMR
treatment-plan items. Each item can include:

- procedure;
- tooth, surfaces, and relevant relationship units;
- estimated cost;
- priority and sequence;
- alternatives;
- clinical notes;
- presentation and patient-acknowledgement state.

Presented or acknowledged proposal content is frozen. Later changes produce a
new version/amendment rather than editing accepted history. Completing a plan
item creates linked execution/current-state records and, when chargeable, a
confirmed ledger charge. It does not rewrite the proposal.

### 5.3 Finding resolution

Completing treatment requires the dentist to select the exact findings the
treatment resolves. The system does not blanket-clear caries, symptoms, or
other findings merely because a procedure was completed. Unresolved findings
remain active and visible.

### 5.4 Signed-in treating dentist

For a new clinical treatment, the signed-in dentist is the treating provider.
There is no provider picker. The authoritative provider is derived and checked
server-side from the authenticated actor and active clinical assignment; the
browser cannot forge it.

## 6. Fork feature-parity contract

The implementation must maintain an explicit acceptance matrix that maps each
reviewed fork capability to canonical EMR data, a renderer behavior, and tests.

### 6.1 Dentition, notation, and interaction

- permanent, primary, and mixed dentition;
- FDI, Universal, and Palmer display notation;
- single-tooth, multi-tooth, and applicable surface selection;
- occlusal, wisdom-tooth, root/bone/pulp, gingival, periodontal, and row/layer
  visibility controls where clinically applicable;
- read-only historical snapshots and print views;
- touch, keyboard, focus, and non-color interaction semantics.

### 6.2 Tooth status and findings

- present, missing, extraction wound, implant, subgingival, radix, broken, and
  crown-preparation states;
- contact loss, fractures, crown-needed/replacement, fissure sealant, calculus,
  wear, discoloration, and periapical lesions;
- pulp/apical diagnoses, resorption, apicoectomy/root resection, and
  parapulpal-pin semantics;
- orthodontic bracket/band, drift, intrusion/extrusion, and rotation.

### 6.3 Caries and restorations

- applicable crown and root surfaces, including subcrown/root caries;
- depth, ICDAS, CARS/secondary caries, and radiographic depth;
- amalgam, composite, glass-ionomer, and temporary restoration;
- crown, bridge unit, inlay, onlay, overlay, veneer, supported materials, and
  marginal leakage/replacement planning.

### 6.4 Endodontics, implants, and prosthetics

- medicinal, complete, and incomplete root filling;
- glass-fiber and metal posts;
- implant fixture, abutment, implant crown, healing abutment, locator, and bar
  attachment;
- removable partial/full prostheses and locator/bar overdenture behavior;
- natural, implant-supported, and mixed bridges with explicit abutment and
  pontic roles.

A natural tooth becoming missing does not erase its history. Rendering an
implant derives from the current relationship/component chain and replaces the
natural-tooth anatomy visually with the appropriate fixture/abutment/crown
state. Root-canal treatment similarly layers validated root-filling state on
the measured root anatomy rather than changing an unrelated crown status.

### 6.5 Periodontal and peri-implant scope

- six-site probing depth and gingival margin;
- derived clinical attachment level;
- bleeding on probing, suppuration, plaque, mobility, and furcation;
- graphical gingival/bone rows and keyboard-efficient entry;
- missing-tooth and implant-aware behavior;
- CEJ visibility, root concavity, gingival thickness, and Miller recession
  class where inputs are persisted;
- summary indices and diagnosis/stage/grade/extent only when the underlying
  validated inputs are stored, with controlled attributed override;
- peri-implant mucositis and supported bone-loss classifications.

### 6.6 Settings, help, persistence, and extension parity

- language/localization, notation, labels, density, visible layers, and export
  preferences;
- global EMR theme integration;
- contextual help instead of the fork's demo-tour shell;
- About/credits retaining the upstream MIT notice, controlled fork and upstream
  attribution, and pinned revision;
- database persistence for clinical state, with only harmless user display
  preferences eligible for client-side preference storage;
- an internal, reviewed renderer-extension registry with no user-supplied
  executable code or unsanitized SVG.

## 7. Canonical longitudinal record

### 7.1 Append-only source records and current projection

The canonical model consists of append-only attributable source records plus a
validated current projection. Final clinical/legal records are amended, voided,
or superseded with links and reasons; they are never silently edited.

Important timestamps are separate:

- clinical occurrence/service/capture time;
- database recorded time;
- amendment/reversal time when applicable.

All are stored consistently and displayed in the clinic's configured timezone.
The UI must not substitute `created_at` for the actual treatment or photograph
date.

### 7.2 Chronological progress record

Below the odontogram, the patient sees one continuous progress-note-style
record in chronological append order, oldest to newest by default. It is not
grouped into separate procedure sections. Filters may narrow the view without
changing the underlying chronological model.

Rows can represent:

- finding recorded, amended, or resolved;
- treatment plan presented, acknowledged, amended, cancelled, or completed;
- treatment performed, including follow-up/adjustment;
- confirmed charge, payment, allocation, refund, reversal, or correction;
- periodontal examination finalization/amendment;
- clinical photograph upload, pairing, rename, archive, or note link;
- authorized import acceptance or clinically relevant document event.

The table displays the fields appropriate to the event, including date/time,
event/procedure, tooth/surface, treating or recording actor, charge, payment,
procedure-case balance, notes, and attachment indicators. Empty financial cells
remain empty rather than implying zero treatment.

Each row may link to its procedure/treatment case. That linkage drives its
financial balance and prevents a payment for one procedure from reducing an
unrelated procedure balance.

## 8. Treatment charges, payments, and installments

### 8.1 One confirmed charge per procedure case

The dentist who records/performs the treatment sets the actual charge because
clinic prices vary. Every charge requires an explicit confirmation showing the
patient, procedure, service date, amount, and currency before it is posted.

After confirmation, the charge cannot be edited in place. An authorized
correction produces an append-only reversal/replacement with a reason and audit
trail. This uses the accepted billing ledger rather than a mutable balance
column.

### 8.2 Payment roles

Receptionists normally collect and record payments. Dentists may also record
payments when there is no receptionist or dental assistant. Setting a charge
and recording a payment remain separate permissions/actions even when the same
dentist performs both.

The software cannot reliably infer whether reception staff are physically
available, so the dentist permission is continuously available within its
bounded patient and branch scope. The authenticated dentist is always recorded
as the collector/recorder; the client cannot attribute the payment to another
staff member. This permission does not grant billing adjustments, refunds,
voids, attribution overrides, cross-branch mutation, or financial analytics.

### 8.3 Allocation and balances

Partial payments are available for every procedure. A payment allocation
references the intended charge; only that allocation reduces the procedure
case's derived balance. A filling payment cannot reduce an orthodontic balance,
and an orthodontic adjustment payment cannot reduce a crown balance.

The chronology can show charge, amount paid in that event, and the resulting
procedure-case balance. Any overall patient-account projection remains derived
from ledger entries and allocations, never stored as an authoritative mutable
patient balance.

### 8.4 Optional installment schedule

Any procedure may optionally have a formal schedule of due dates and expected
amounts. Schedules support reminders and expected cash flow but do not replace
ledger truth. Actual payments and allocations determine the real balance.

Routine follow-ups, including braces adjustments, link to the existing
treatment case and do not create another charge unless the dentist deliberately
confirms a distinct additional procedure.

### 8.5 Atomic completion

When treatment completion requires a charge, clinical completion, resolved
finding links, treating-provider attribution, and charge creation occur in one
idempotent database transaction. If any required part fails, the entire
operation rolls back; the patient cannot be left with a completed treatment but
no required charge or with a charge for a failed completion.

## 9. Clinical photograph gallery

### 9.1 Clinical workflow

Dentists can upload patient photographs from the dental record. Each confirmed
photo records:

- capture/upload date and time;
- signed-in dentist;
- category: before, progress, after, diagnostic, intraoral, extraoral, or other;
- optional encounter, procedure case, tooth, surface, and clinical note links;
- optional before/after pairing;
- processing state and approved derivative availability.

The gallery supports date, category, procedure, tooth, and photographer
filters; private thumbnails/previews; focused inspection; and before/after
comparison. Confirmed uploads create dated entries in the same chronological
progress record.

### 9.2 Safe filename behavior

The application proposes a readable display filename such as:

```text
2026-08-30_after_tooth-11_01.jpg
```

The dentist may edit this display filename before confirmation. The application
sanitizes it, preserves the real media extension, prevents traversal/control
characters, and discourages patient-identifying text. The visible display name
is metadata only.

The object key remains an opaque identifier and is never renamed when the
display filename changes. The original client filename is retained as
restricted provenance because it may itself contain sensitive data; it is not
placed in storage paths, generic logs, or unauthorized responses. A later
display-name change is audited and does not modify the original bytes.

### 9.3 Storage and derivative rules

- PostgreSQL is canonical for metadata and relationships.
- MinIO is the local source-object store and Cloudflare R2 is the production
  source-object store behind the existing provider-neutral S3 adapter.
- Cloudinary is not introduced.
- Original bytes, checksum, and provenance are preserved and cannot be silently
  replaced by a derivative.
- Private delivery is permission-checked and uses bounded short-lived access.
- Only predefined `thumbnail`, `preview`, and `display` variants are allowed;
  the client cannot request arbitrary transformation dimensions or formats.
- Display derivatives strip unnecessary EXIF/location metadata and normalize
  orientation without rewriting the source object.
- Processing is idempotent, records pending/ready/failed states, and cannot
  recursively process its own output.
- Unsupported, oversized, malformed, or unsafe content remains quarantined or
  failed and never appears as a valid clinical photograph.

Archival is attributed and reasoned. Clinical originals are not hard-deleted
through an ordinary gallery control.

## 10. Import, export, and print

### 10.1 Staged FHIR R4 and JSON import

Import follows this mandatory sequence:

1. authorize the actor and selected patient context;
2. accept a bounded file and parse it safely;
3. validate schema/version, codes, teeth, surfaces, relationships, sizes, and
   supported content;
4. verify patient and organization association without trusting embedded tenant
   identifiers;
5. create a temporary, tenant-scoped staging batch;
6. show a diff of new, duplicate, conflicting, and unsupported items;
7. require a dentist to select and confirm accepted records;
8. append accepted canonical records transactionally with import provenance.

An import never replaces the current chart wholesale and never becomes
clinical truth merely because parsing succeeded. Failed or abandoned staging
content is not visible as current patient state.

### 10.2 Exports

Authorized output includes:

- FHIR R4 from supported canonical mappings;
- versioned EMR JSON, never raw fork state;
- PDF/print with measured chart, legend, dates, provider attribution,
  current/planned distinction, chronology, and selected periodontal sections;
- bounded SVG/PNG render derivatives.

Export permissions are checked server-side and relevant export events are
audited. Generic logs contain result metadata, not clinical narrative,
presigned URLs, or exported payloads. Export generation must not send protected
data to unreviewed third parties.

## 11. Authorization, tenancy, and audit

### 11.1 Tenant and branch boundaries

- Organization is the SaaS tenant boundary.
- Patients and their clinical/financial/file relationships are organization
  scoped.
- Branch is validated as an operational context inside the same organization.
- Cross-tenant sensitive relationships use database-level referential safety.
- The server derives or validates organization, patient, branch, actor, role,
  and provider values; client-supplied identifiers are never authority.

### 11.2 Defense in depth

Every exposed tenant table has RLS and zero unsafe browser base-table grants.
Browser-reachable writes pass application authorization and narrow audited
RPCs. `SECURITY DEFINER` functions use fixed safe search paths, default revoke,
exact grants, bounded DTOs, and no caller-forged audit/provider fields.

Representative permissions are:

| Operation | Dentist | Receptionist | Owner/Admin correction |
| --- | --- | --- | --- |
| Record findings, plans, treatment | Allowed | Denied | Policy-controlled |
| Set and confirm procedure charge | Allowed | Denied | Policy-controlled |
| Record and allocate payment | Allowed | Allowed | Allowed |
| Upload/link/rename clinical photo | Allowed | Denied by default | Policy-controlled |
| Replace confirmed clinical/charge record in place | Denied | Denied | Denied |
| Append authorized correction/reversal | Permission-controlled | Denied | Allowed by default |

Clinical-photo reading uses an appropriate clinical-record permission, not the
broad generic attachment permission merely because it is a file.

For `payment.record`, the dentist's default is narrower than a general billing
role: the patient must already be clinically authorized to that dentist, the
receiving branch must be an active permitted branch, and any allocation must
also satisfy the accepted charge-origin/receiving-branch rules. Receptionist,
BILLING, OWNER, and ADMIN behavior otherwise continues to follow the accepted
ledger contract.

### 11.3 Audit behavior

Audit events cover high-impact views and mutations, including finalization,
completion, correction, reversal, payment, import acceptance, export,
photograph access/upload/pair/rename/archive, and permission denial where the
existing audit policy requires it. Audit and application logs do not copy
clinical notes, image content, original filenames, credentials, or presigned
URLs.

## 12. Error handling and concurrency

- Commands use idempotency keys so retries and double-clicks cannot duplicate
  clinical completions, charges, payments, imports, or file confirmations.
- Version/concurrency checks reject stale edits and return enough safe context
  to reload the current record.
- Multi-row clinical, relationship, completion, and ledger changes are
  transactional.
- Invalid/conflicting imports remain staged; canonical chart state is untouched.
- Interrupted uploads do not create usable clinical-photo records. Confirmed
  orphan reconciliation is bounded and idempotent.
- Derivative failure preserves the original and exposes a safe authorized retry
  with processing status.
- Denied/failed exports expose no artifact or usable URL.
- UI errors identify the failed action without echoing protected clinical data
  or secrets into logs/toasts.

## 13. Migration and cutover strategy

The revamp uses expand, compatibility, cutover, and contract steps. Only
guarded forward migrations are allowed; `db:reset:local` is prohibited.
Already-applied migrations are not rewritten.

1. Add canonical capabilities, constraints, RLS, RPCs, staging/media metadata,
   and compatibility reads.
2. Keep old canonical rows readable while the new projection and adapter are
   verified.
3. Move application reads and writes to the new bounded services/RPCs.
4. Prove compatibility with existing synthetic Phase 15/O1-O13 data.
5. Revoke obsolete mutation entry points before removing unused application
   paths.
6. Remove the old schematic UI only after the measured renderer and regression
   tests pass.

Drawing UI and write paths are removed from the application. At O13, a guarded
forward cleanup may remove only positively identified synthetic development
drawing data. It must fail closed if unexpected rows exist, must not broadly
delete clinical history, and must never reset the database. Any need to destroy
non-synthetic or ambiguous records is a stop condition requiring a separate
review.

## 14. Revised O1-O14 delivery mapping

| Checkpoint | Revised responsibility |
| --- | --- |
| O1 | Extract renderer-independent fork domain behavior and compatibility fixtures. |
| O2 | Expand relational clinical schema and canonical mappings. |
| O3 | Persist bridge, implant, and prosthetic relationships atomically. |
| O4 | Persist and derive periodontal/peri-implant examinations. |
| O5 | Implement permission contracts, RLS, grants, audited RPCs, services, and concurrency/idempotency. |
| O6 | Transplant the measured renderer/assets with Classic, demo, reset, drawing, and injection code absent. |
| O7 | Build the native patient-scoped Current Status workspace and chronological base record. |
| O8 | Implement treatment-plan versioning, execution, exact finding resolution, treating-provider derivation, and atomic charge completion. |
| O9 | Complete bridge, implant, and prosthetic workflows and anatomical transitions. |
| O10 | Complete periodontal workspace and finalized/amended history. |
| O11 | Complete keyboard, touch, responsive, and non-color accessibility hardening. |
| O12 | **Amended:** complete chronology/print, staged FHIR/JSON import, authorized FHIR/JSON/PDF/SVG/PNG output, and private clinical-photo gallery/derivative integration. |
| O13 | Cut over canonical reads/writes, retire obsolete UI/RPCs, perform guarded synthetic drawing cleanup, and prove one write model. |
| O14 | Run and record the full local regression/security/compatibility gate; preserve all deferred hosted release gates. |

The ordered implementation plan may split an O checkpoint into reviewable
subtasks, but it may not reorder schema/security prerequisites behind browser
features or mark a checkpoint accepted before its tests and review evidence
exist.

## 15. Verification and acceptance

### 15.1 Domain and unit tests

- every feature-parity mapping and invalid combination;
- current/planned/completed/cancelled transitions;
- missing-tooth, implant, root-canal, bridge, prosthetic, restoration, caries,
  orthodontic, and periodontal rendering projections;
- explicit finding resolution;
- procedure-case payment allocation and installment projections;
- file naming/sanitization, category/pairing, derivative state, and import diff;
- localization, numbering, and export mapping.

### 15.2 Database and authorization tests

- positive and negative role cases;
- Organization A cannot read/write Organization B data;
- forged organization, branch, patient, provider, uploader, or collector values
  are rejected;
- cross-tenant foreign keys and RLS;
- immutable finalized records and append-only correction/reversal;
- atomic treatment completion and charge creation;
- payment allocation isolation and concurrent/double-submit behavior;
- periodontal finalization/amendment;
- import staging isolation and acceptance;
- media metadata/access/rename/archive/processing state and object-key rules;
- audit events and exact RPC grants.

### 15.3 Component, action, and E2E tests

- correct patient load/reload and state reset on patient navigation;
- Current Status and Plan workflows;
- charge confirmation and permitted dentist/receptionist payment paths;
- chronological record contents and procedure-specific balances;
- gallery upload, rename, pairing, preview, failure, retry, and timeline event;
- import stage/diff/confirm and all output controls;
- print semantics;
- keyboard, focus, dialogs/sheets, touch targets, phone/tablet/desktop layouts,
  virtual keyboard, safe areas, and no accidental page overflow;
- non-color clinical-state differentiation and axe checks.

### 15.4 Static, build, and security gates

- strict typecheck, lint, unit suite, production build, generated database types;
- forward migration and pgTAP suites;
- migration security, exact grants, secret scanning, dependency/security audit;
- controlled fork license/notice/source pin and regression fixtures;
- absence checks for Classic, reset, drawing authoring, demo/localStorage
  clinical persistence, jsPDF/fork-global leakage, and unsafe runtime injection;
- final diff hygiene and independent clinical/security/schema/code review.

### 15.5 Deferred release gate

O14 may be recorded only as locally implemented and verified. Hosted Cloud TEST
database, authenticated E2E, responsive/accessibility, advisor, and security
checks; independent release review; and final project-owner acceptance remain
mandatory before deployment or any real patient/provider use.

## 16. Approval consequences

Approval of this design authorizes writing the detailed ordered implementation
plan. It does not by itself authorize implementation, destructive migration,
hosted writes, production deployment, or real clinical use.

Before implementation begins, the accepted implementation plan must explicitly
update the conflicting O12/spec/ADR language and the bounded dentist
`payment.record` billing contract, identify every forward migration, map every
permission/RLS/audit test, preserve the controlled fork pin and MIT notice, and
record Cloud TEST as deferred rather than waived.
