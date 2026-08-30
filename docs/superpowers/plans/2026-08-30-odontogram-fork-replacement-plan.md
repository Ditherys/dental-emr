# Controlled Odontogram Fork Replacement Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

Goal: Replace the patient-page custom odontogram renderer with the versioned controlled Ditherys/React-Odontogram-Modul fork, preserving the EMR's canonical patient data, chronological records, billing, treatment plans, photos, and authorization boundaries.

Architecture: Vendor the built controlled fork as a local package with its MIT notice and source revision. Mount the fork's provider/surfaces inside a patient-scoped adapter that hydrates validated canonical DTO data and translates fork state changes into existing server action requests. Remove the custom measured chart/toolbar/print projection from the patient render path while retaining EMR domain sections below the fork chart.

Tech Stack: Next.js 16 App Router, React 19, TypeScript strict, Tailwind/shadcn, Vitest/Testing Library, Playwright, local Supabase/MinIO only, vendored react-advanced-odontogram fork build.

## Global Constraints

- Canonical clinical data remains owned by the database schema; fork JSON is renderer state only.
- Use the controlled Ditherys/React-Odontogram-Modul fork; do not consume upstream or a moving branch.
- Preserve the upstream MIT copyright/license notice and commit a source revision record.
- Patient, organization, and branch scope comes from the server/action boundary; never trust fork payload identity fields.
- The signed-in dentist is the provider; no provider picker is added.
- Remove whole-mouth and tooth reset controls from the patient DOM and keyboard tree.
- Do not expose the classic anatomy view in the patient workflow.
- Use synthetic local data only; do not reset the local database.
- Keep Cloud TEST, hosted E2E/axe, advisor/security, and production release gates pending.

---

### Task 1: Vendor and pin the controlled fork package

Files:
- Create vendor/react-advanced-odontogram/package.json
- Create vendor/react-advanced-odontogram/LICENSE
- Create vendor/react-advanced-odontogram/SOURCE_REVISION.md
- Create vendor/react-advanced-odontogram/fork-patches/remove-reset-controls.patch
- Copy controlled-fork build artifacts to vendor/react-advanced-odontogram/dist
- Modify package.json, package-lock.json, and src/app/layout.tsx
- Create src/components/odontogram/fork-package.test.ts

Interfaces:
- Package import react-advanced-odontogram exposes OdontogramProvider, OdontogramChartSurface, ToothInfoSurface, ToothControlsSurface, importStatus, setPlanChart, getStatusChart, getPlanChart, and onStateChange.
- Stylesheet import react-advanced-odontogram/style.css.

- [ ] Step 1: Write a failing package-resolution test asserting that the package exposes the provider, chart surface, importStatus, and setPlanChart functions.
- [ ] Step 2: Run npm run test:unit -- src/components/odontogram/fork-package.test.ts and verify failure because the dependency is absent.
- [ ] Step 3: Apply the controlled fork source patch that removes the whole-mouth reset and tooth-reset buttons from the patient composition, run the fork library build, and copy its dist JavaScript/CSS/declaration artifacts and required relative loader chunks. Store the exact patch in vendor/react-advanced-odontogram/fork-patches/remove-reset-controls.patch, copy LICENSE unchanged, and record the fork source commit, patch commit, and artifact list in SOURCE_REVISION.md.
- [ ] Step 4: Add file:vendor/react-advanced-odontogram to package.json, update package-lock.json with npm install --package-lock-only, and import react-advanced-odontogram/style.css once from src/app/layout.tsx.
- [ ] Step 5: Run npm run test:unit -- src/components/odontogram/fork-package.test.ts and verify it passes.
- [ ] Step 6: Commit with message build: vendor controlled odontogram fork.

### Task 2: Build a renderer-independent canonical-to-fork adapter

Files:
- Create src/lib/odontogram/fork-adapter.ts
- Create src/lib/odontogram/fork-adapter.test.ts
- Modify src/lib/odontogram/types.ts only if an adapter input type must be exported

Interfaces:
- buildForkPayload(dto: PatientOdontogramDTO): { status: Record<string, unknown>; plan: Record<string, unknown> | null }
- forkPayloadToClinicalDraft(payload: unknown): readonly ForkClinicalDraft[]
- ForkClinicalDraft contains toothCode, surfaces, kind, status, detail, and bounded note fields.

- [ ] Step 1: Write failing adapter tests for current caries, completed root-canal variants, missing tooth, implant fixture/abutment/crown chains, restoration materials, orthodontic bracket/movement, and planned state with note. Assert identity fields are never copied and unsupported surfaces are dropped.
- [ ] Step 2: Run npm run test:unit -- src/lib/odontogram/fork-adapter.test.ts and verify failures are due to missing adapter exports.
- [ ] Step 3: Implement payload hydration with version 2.20 and fixed FDI teeth. Map toothSelection, endo, caries, cariesSeverity, fillingSurfaceMaterials, restorationType, restorationMaterial, rootCaries, orthodontic axes, and notes through explicit allowlists. Map bridge/implant state only from dedicated DTO collections.
- [ ] Step 4: Implement fork-draft extraction. Validate fixed FDI keys and every fork axis, collapse fork-specific presentation fields to supported canonical details, emit bounded OTHER controlled codes where necessary, and ignore version/globals/identity-like fields.
- [ ] Step 5: Run the adapter test file and verify all mapping/allowlist cases pass.
- [ ] Step 6: Commit with message feat: map canonical odontogram state to fork payload.

### Task 3: Mount the fork as the patient chart and remove old renderer markup

Files:
- Create src/components/odontogram/fork-odontogram.tsx
- Create src/components/odontogram/fork-odontogram.test.tsx
- Modify src/app/(emr)/patients/[patientId]/odontogram-section.tsx
- Modify src/components/odontogram/styles.css
- Remove patient-path imports/usages of MeasuredChart, OdontogramToolbar, and BridgeOverlay

Interfaces:
- ForkOdontogramProps contains dto, canWriteClinical, onSelect, onDraftChange, and onError.
- The component renders OdontogramProvider with FDI, readOnly derived from permission, notes enabled, plan mode enabled, and measured anatomy, plus the fork chart/info/control surfaces.

- [ ] Step 1: Write failing component tests asserting fork selectors (#toothGrid, #statusCard, #cariesSection, #rootPeriodontiumSection), inline anatomical SVG layers, current/plan hydration, absence of #btnResetAll/#btnResetTooth/classic controls, and canonical draft callback emission.
- [ ] Step 2: Run npm run test:unit -- src/components/odontogram/fork-odontogram.test.tsx and verify failure because the wrapper does not exist and the patient page still mounts MeasuredChart.
- [ ] Step 3: Implement a patient-keyed provider wrapper. After mount, hydrate status with importStatus(buildForkPayload(dto).status) and plan with setPlanChart. Suppress the hydration echo from onStateChange, then call forkPayloadToClinicalDraft for user edits. Do not use the fork default App; compose only the surfaces needed by the patient workflow. The vendored fork patch already removes reset buttons, so the wrapper must assert they are absent rather than hiding them with CSS.
- [ ] Step 4: Replace the patient chart imports/rendering in odontogram-section.tsx with ForkOdontogram. Keep safe DTO loading, selected FDI state, inspector sheet, periodontal dialog, chronological ProgressRecordTable, billing/treatment/photo sections, and patient-keyed cleanup.
- [ ] Step 5: Add scoped dental-emr-fork styles mapping fork variables/controls to EMR tokens, preserving anatomical SVG sizing, iPad chart scrolling, Geist typography, and reset/classic omission.
- [ ] Step 6: Run the wrapper and patient-section tests and verify fork DOM is present while old measured-chart DOM is absent.
- [ ] Step 7: Commit with message feat: replace patient chart with controlled fork surfaces.

### Task 4: Persist fork edits through the existing audited action boundary

Files:
- Create src/components/odontogram/fork-save-controller.tsx
- Create src/components/odontogram/fork-save-controller.test.tsx
- Modify src/app/(emr)/patients/[patientId]/odontogram-actions.ts
- Modify src/lib/odontogram/schema.ts or service.ts only for a narrowly validated batch wrapper if required

Interfaces:
- ForkSaveControllerProps contains patientId, actingBranchId, canWriteClinical, drafts, onSaved, and onError.

- [ ] Step 1: Write failing tests for route-scoped patient/branch, signed-in provider derivation, occurrence timestamp, idempotency keys, serialized rapid edits, unauthorized/stale preservation, duplicate suppression, and read-only no-op behavior.
- [ ] Step 2: Run npm run test:unit -- src/components/odontogram/fork-save-controller.test.tsx and verify failure because the controller is absent.
- [ ] Step 3: Implement one confirmation dialog per new canonical draft containing date, tooth/surfaces, finding/procedure, note, and charge fields where required. Call the existing validated tooth, bridge, implant, treatment-plan, and periodontal actions; retain the draft on failure and refetch after success.
- [ ] Step 4: If a batch wrapper is necessary, accept only route patient/branch, entries, and idempotency key; validate each entry with existing schemas, resolve the authoritative patient server-side, and execute transactionally. Never accept opaque fork JSON.
- [ ] Step 5: Run save-controller, action, and service tests and verify negative authorization/identity-forgery cases pass.
- [ ] Step 6: Commit with message feat: persist fork chart edits through audited actions.

### Task 5: Replace odontogram print output with the fork-derived read-only chart

Files:
- Create src/components/odontogram/fork-print-chart.tsx
- Create src/components/odontogram/fork-print-chart.test.tsx
- Modify or replace patient usage of src/components/odontogram/print-history.tsx
- Modify src/components/odontogram/styles.css only for fork print rules

Interfaces:
- ForkPrintChartProps contains dto, patientName, branchName, providerName, and printedAt.

- [ ] Step 1: Write failing print tests for anatomical fork SVG current/planned state, patient/branch/provider/date metadata, legend, chronological rows, absence of reset/classic/import controls, safe notes, and no raw fork JSON.
- [ ] Step 2: Run npm run test:unit -- src/components/odontogram/fork-print-chart.test.tsx and verify failure because the new projection is absent.
- [ ] Step 3: Mount the fork provider read-only, hydrate it from the same adapter payload, render measured chart surfaces, and place chronological records/billing summary below it. Keep existing document permission/audit boundaries and safe text/SVG handling.
- [ ] Step 4: Replace patient print usage so the old Measured chart print placeholder is not rendered. Keep date/provider metadata and chronological order; hide screen-only controls under print media rules.
- [ ] Step 5: Run fork-print-chart and print-history tests and verify the fork SVG and chronological output assertions pass.
- [ ] Step 6: Commit with message feat: print anatomical fork odontogram.

### Task 6: Remove obsolete patient renderer code and add parity coverage

Files:
- Remove or unreference obsolete patient renderer files: measured-chart.tsx, measured-tooth.tsx, measured-inline-asset.tsx, measured-fork-layers.ts, measured-assets.ts, overlay-registry.ts, and bridge-overlay.tsx.
- Create src/components/odontogram/fork-feature-parity.test.tsx and responsive coverage where needed.
- Modify docs/AI_HANDOFF.md.

- [ ] Step 1: Write failing parity tests for root-canal variants, missing-to-implant chain, caries/filling materials, crowns/bridges, periodontal indicators, orthodontic movement, planned notes, FDI/Universal/Palmer, current/planned toggles, and absence of classic/reset/old chart DOM.
- [ ] Step 2: Run the parity test file and verify each failure identifies a missing replacement behavior rather than setup noise.
- [ ] Step 3: After Tasks 1–5 pass, remove only obsolete renderer files with no remaining domain/test consumers and delete old overlay CSS/toolbar controls that no longer render.
- [ ] Step 4: Run targeted tests, npm run lint, npm run typecheck, npm run build, npm run security:migrations, npm run security:secrets, and git diff --check. Record any unrelated flaky test separately.
- [ ] Step 5: Update docs/AI_HANDOFF.md with the pinned fork revision, package boundary, adapter mapping, reset/classic removal, print replacement, test evidence, and remaining Cloud TEST/hosted/release gates. Commit with message feat: complete controlled odontogram fork replacement.

## Plan self-review

- Covers package pinning, adapter mapping, screen replacement, persistence, print, reset/classic removal, typography, and verification.
- Persists no opaque fork JSON and trusts no fork identity fields.
- Every implementation slice has a failing test before production code and an explicit verification command.
- Keeps canonical chronological records, billing, and photo workflows below the chart.
- Does not claim Cloud TEST or production completion from local verification.
