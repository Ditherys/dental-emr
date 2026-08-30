# Controlled Odontogram Fork Replacement Design

**Date:** 2026-08-30  
**Status:** Approved for implementation by the project owner in the current request  
**Scope:** Replace the patient odontogram renderer and its chart controls with the controlled `Ditherys/React-Odontogram-Modul` fork while retaining the EMR's canonical patient workflows.

## Goal

The patient clinical page will use the controlled fork's anatomical SVG renderer, clinical controls, plan mode, notes, periodontal surface, and export/print capabilities. The EMR will provide a patient/branch-safe adapter around that renderer so the fork UI never becomes the canonical clinical data model.

Classic anatomy is excluded from the patient workflow. The whole-mouth reset action and tooth-reset action are removed from the visible EMR composition so a dentist cannot accidentally erase the chart. The signed-in dentist remains the provider for clinical actions; no provider picker is added.

## Architecture

The integration has four boundaries:

```text
PatientOdontogramDTO + chronological records
            ↓ validated adapter
Fork status/plan payload and fork event callbacks
            ↓ controlled local fork package
Ditherys React-Odontogram-Modul surfaces and anatomical SVG engine
            ↓ EMR composition
Patient shell: records, billing, treatment plans, photos, permissions, print metadata
```

The fork is vendored as a versioned local package built from the checked-out controlled fork. The package includes the fork's compiled runtime, stylesheet, declaration file, source license notice, and an explicit source revision record. No moving Git branch or upstream package is consumed.

The adapter owns:

- FDI/Universal/Palmer display conversion;
- current versus planned payload hydration;
- conversion of fork state changes into validated canonical clinical-entry, bridge, implant, and periodontal action requests;
- rehydration after a successful server mutation;
- read-only historical rendering;
- removal of destructive reset controls.

Canonical database records remain the source of truth. Fork JSON is an in-memory renderer payload only and is never persisted as the sole patient record.

## Patient-page composition

The patient page keeps the existing EMR clinical navigation and the chronological progress record below the odontogram. The chart area is replaced with a fork-powered composition:

- our page heading and patient context;
- fork topbar controls restyled with EMR tokens, with import/export actions restricted to the patient workflow;
- fork anatomical chart surface using `measured` anatomy only;
- fork tooth information and control cards for statuses, tooth details, caries, fillings, roots/periodontium, and orthodontics;
- fork plan/status mode with per-tooth notes enabled;
- our separate six-site periodontal workflow remains available where its canonical examination model is required;
- chronological records, billing ledger, treatment plans, and clinical photo gallery remain below the chart.

The old `MeasuredChart`, semantic CSS overlay registry, bridge overlay, and custom odontogram toolbar are removed from the patient path after the replacement is wired and tested. Their domain-only helpers may remain temporarily when used by the adapter tests, but no old chart markup may render in the patient page.

## Persistence and interaction model

The fork's engine changes local state immediately for responsive charting. A debounced, serialized change observer captures the fork status/plan payload and computes a bounded diff against the last server snapshot. The UI shows an explicit unsaved state while a mutation is pending and blocks navigation away from a failed mutation until the dentist retries or discards the local draft.

Each diff is translated into existing validated server actions:

- tooth/surface findings and treatments → append-only clinical entries;
- bridge units → bridge design/current bridge actions;
- implant components → implant design/current component actions;
- periodontal chart values → the existing periodontal examination actions;
- plan changes → treatment-plan item/plan actions with notes and planned status.

The adapter never accepts a patient, organization, branch, provider, or actor identity from fork JSON. The server action receives the route patient and acting branch, derives the signed-in provider, validates all codes and surfaces with Zod, checks permission, and resolves the authoritative patient before revalidation. Existing append-only/amend/void semantics remain in force.

Because a fork action can represent a state that needs clinical context not present in its payload, the EMR exposes a confirmation sheet before committing a new canonical record. The sheet contains the selected tooth/surface, fork-derived procedure/finding, occurrence date, optional note, and charge entry when the workflow requires a charge. It does not offer a provider selector. Once confirmed, the charge is immutable and payments remain separate ledger entries.

## Reset and classic-view policy

The patient composition does not render `resetMouth`, `resetTooth`, or the classic anatomy selector. The fork's engine APIs remain available only to the vendored package's internal tests and non-patient demo; no patient-page control can invoke them. Any future chart-wide correction must use audited append-only clinical actions.

## Print and export

The odontogram print output is replaced with a fork-derived read-only render using the same adapter payload as the screen. It includes patient/branch/provider/date metadata, current and planned distinction, anatomical SVG layers, legend, fork state summary, and the chronological EMR progress/billing record as separate sections. Print/export is permission-checked and audited through the existing document workflow; the fork's JSON/FHIR exports are not canonical and are not exposed as patient-record imports.

## Typography and visual treatment

Geist Sans remains the approved EMR font and is applied to the fork surfaces through a scoped theme layer. The fork's system-font defaults are not loaded as a second brand font. Fork colors, borders, spacing, cards, controls, and responsive breakpoints are mapped to the existing EMR tokens while preserving the fork's anatomical SVG and control semantics. No decorative or marketing typography is introduced.

## Error handling

- If the initial DTO cannot be loaded, the page shows the existing safe clinical-load error and does not mount a stale fork chart.
- If a mutation is unauthorized, stale, invalid, or conflicting, the local fork draft is retained, the error is shown without leaking patient data, and the user can retry after a fresh DTO reload.
- If the fork package fails to initialize, the page shows a bounded renderer error and keeps the chronological records and read-only print path available.
- Patient and branch changes synchronously clear the fork instance, local draft, selection, and pending mutation state before a new DTO is mounted.

## Verification and acceptance

The replacement is accepted only when all of the following are true:

- the patient page imports the controlled local fork package and no longer renders `MeasuredChart`;
- the classic view and reset controls are absent from the patient DOM and keyboard tree;
- root-canal variants, missing-to-implant transitions, caries surfaces, fillings/materials, crowns/bridges, periodontal indicators, orthodontic markers, and plan notes render from canonical DTO fixtures;
- fork interactions produce validated canonical action payloads with the signed-in provider and route-scoped patient/branch;
- failed/stale/unauthorized saves preserve local draft state and do not cross tenant, branch, or patient boundaries;
- the print route renders the anatomical fork chart plus chronological records with date/provider metadata;
- unit, accessibility, responsive, build, lint, migration/security, and targeted browser tests pass locally using synthetic data;
- the fork's MIT notice and pinned source revision are committed;
- Cloud TEST, hosted E2E/axe, advisor/security, and final release acceptance remain pending until their separately authorized gates pass.
