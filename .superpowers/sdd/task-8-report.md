# Task 8 / O6 — Measured renderer adapter report

Date: 2026-08-30
Status: locally implemented and verified; release acceptance remains pending.

## Scope delivered

- `MeasuredChart` now consumes a renderer-independent `ToothRenderState`
  projection with `mode`, `selectedFdi`, and `onSelect`. The existing DTO prop
  remains a compatibility boundary for the O7 patient workspace and is
  converted to a display-only projection.
- `MeasuredTooth` renders static measured assets and fixed React overlay nodes
  for missing/extraction, implant fixture/abutment/crown, root filling states,
  caries, restorations/materials, crowns, planned findings, and bridge roles.
- The DTO compatibility boundary now accepts the persisted O2 `detail` object
  (plus bounded legacy root/restoration fields), keeps ROOT_CANAL and
  restoration material/type semantics, and skips voided/superseded history.
  Migration `20260830010416` adds that existing constrained detail to
  `get_patient_odontogram`; `20260830010417` restores only its reviewed
  authenticated EXECUTE grant.
- Surface entries use a static O/B/L/M/D/I/F registry with fixed front and
  occlusal geometry. Unknown surface tokens cannot select a descriptor.
- The chart uses one valid ARIA grid with two rows and direct gridcells; arch
  labels are presentational and tooth buttons remain the interactive cells.
- Current and planned details remain distinct. FDI is canonical; Universal and
  Palmer are display conversions. Permanent, primary, and mixed dentition are
  supported.
- `OVERLAY_REGISTRY` is a closed allowlist. No runtime SVG/HTML injection,
  dynamic import, Classic path, reset callback, localStorage, or fork-global
  state is present in the adapter.
- Display-only settings cover notation, dentition, layer visibility, label
  density, language, and print/screen preference. Contextual help includes
  keyboard/touch guidance and the pinned fork/MIT attribution.

## Verification evidence

Commands run from `C:\Users\Latitude 7430\Desktop\dental-emr`:

| Command | Result |
| --- | --- |
| `npm run test:unit -- src/components/odontogram` | PASS — 8 files, 23 tests |
| `npm run test:unit -- src/lib/odontogram/schema.test.ts src/lib/odontogram/service.test.ts` | PASS — 2 files, 26 tests |
| `npm run lint` | PASS — no errors or warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — Next.js 16.3.0 production build |
| `npm run security:migrations` | PASS — 255 migration files; 74 grant-terminal files; exact approved privileges |
| `npm run db:migrate:local` | PASS — applied `20260830010416` and `20260830010417` forward-only on local Supabase; no reset |
| `git diff --check` | PASS — no whitespace errors (Git reports expected LF/CRLF normalization warnings on touched text files) |

The focused suite covers measured anatomy, current/planned overlays, persisted
DTO root filling and restoration material, allowlisted permanent/primary
surface overlays in front/occlusal views, superseded-history suppression,
bridge abutment/pontic roles, primary/mixed dentition, FDI/Universal/Palmer
labels, selection/roving focus, valid ARIA grid hierarchy, settings,
contextual help, and the no-injection/no-persistence boundary.

## Residual release gates

- Cloud TEST database and hosted authorization/RLS verification remain pending.
- O7 patient-workspace integration, responsive/accessibility Playwright gates,
  independent security/advisor review, and final owner acceptance remain
  pending. This local O6 evidence does not authorize production deployment or
  real provider/patient use.
