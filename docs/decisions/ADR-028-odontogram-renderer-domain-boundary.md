# ADR-028 — Odontogram renderer and domain boundary

**Status:** Accepted — O0 evidence recorded 2026-08-28 and explicitly
re-accepted by the project owner 2026-08-29 under ADR-029.

**Date:** 2026-08-28

**Decision owner:** Project owner

**Amends:** None directly. Operates within
[ADR-027](ADR-027-billing-local-verification.md) (guarded forward-only local
verification window for B0–B11 and O0–O4) and supersedes the renderer posture
in [ADR-005](ADR-005-r2-media-pipeline.md) only for the odontogram component
(not for general media).

**Related:**
`docs/specs/odontogram-integration.md`,
`docs/plans/odontogram-integration-plan.md`,
`docs/plans/015-odontogram.md`, `docs/plans/016-treatment-plans.md`,
`docs/BILLING_ODONTOGRAM_ACCEPTANCE_REVIEW.md`, `DATABASE_DESIGN.md`,
`SECURITY_ARCHITECTURE.md`, `FRONTEND_ARCHITECTURE.md`, `THIRD_PARTY_NOTICES.md`.

## Context

The Phase 15 odontogram uses a schema-bound, renderer-specific status JSON on
each tooth row. It cannot represent multi-surface clinical states, measured
periodontal examinations, multi-unit bridge spans, implant component chains,
or append-only history without semantic loss. The platform needs an
EMR-native, database-authoritative clinical odontogram whose canonical data is
independent of any one renderer's view of the chart.

The audited Ditherys fork of `React-Odontogram-Modul` at commit `5e28d93`
contributes a measured tooth renderer, six-site periodontal measurement logic,
bridge overlay semantics, and an implant component model. The upstream MIT
package is a demo-grade library: it carries a demo application, a Classic
renderer, localStorage persistence, FHIR R4 export/import, and a PDF export
path, none of which the EMR should accept as canonical behavior.

The fork's `package.json` declares React 18, Tailwind 3, jQuery-era tooling,
and a small set of dependencies (`dompurify`, `jspdf`, `@types/fhir`) that
the EMR's own ADR-005 / Frontend Architecture do not permit as runtime
dependencies. React 19, Tailwind 4, and the Next.js App Router are the
audited EMR stack. Adding the fork as a runtime npm dependency would
unjustifiably widen the dependency surface and conflict with the audited
stack.

## Decision

1. The PostgreSQL/Supabase schema is the system of record for odontogram
   state. Every clinical condition, surface, history event, bridge span,
   implant component, and periodontal measurement lives in tenant-scoped
   relational tables with RLS, organization and branch attribution, and
   audit events. The renderer is a pure projection of the database plus the
   patient chart aggregation computed in the domain layer.

2. Canonical tooth identification uses the FDI two-digit scheme. Universal
   and Palmer notations are display conversions only, computed in the
   domain layer from the canonical FDI value.

3. The fork's measured engine, overlay registry, and six-site periodontal
   measurement semantics are reviewed source material. They are ported into
   the EMR as TypeScript modules under `src/lib/odontogram/` and as React
   components under `src/components/odontogram/`, not consumed as a
   published npm package. No new runtime dependency is added by this
   integration. The fork's MIT notice, controlled source URL, and pinned
   commit are recorded in `THIRD_PARTY_NOTICES.md`.

4. The fork is pinned at exactly `5e28d931feefe4c3382513dbb0f5a9db9cf9948c`.
   The EMR never consumes a moving branch. Any source change requires a
   committed, reviewed, newly pinned SHA and a plan revision before any
   further port. Uncommitted and untracked fork content is not a source
   input; tracked file modifications that resolve only to CRLF/LF
   line-ending differences under `git diff --ignore-space-at-eol
   --ignore-cr-at-eol` are excluded from the pin review.

5. The fork's demo application, Classic renderer, localStorage persistence,
   FHIR R4 export/import, PDF export, tour, theme/language controls, and
   demo build/deployment infrastructure are excluded. The fork's
   `dompurify`, `jspdf`, and `@types/fhir` runtime/dev dependencies are not
   installed; SVG is rendered as React nodes without plugin injection, and
   the existing EMR print pipeline is reused. The fork's own lockfile,
   `vite`/`tsc` library build, and `gh-pages` deployment are omitted; the
   Next.js App Router owns the target build.

6. The fork's existing test suite and `build:lib` are executed as part of
   the O0 evidence baseline to record the audited source's behavior. The
   EMR runs focused unit and pgTAP tests for the existing
   odontogram/treatment-plan suites as a baseline. New tests are written
   under the EMR's own Vitest + Testing Library + pgTAP toolchain; tests
   from the fork are not copied.

7. Bridge, implant, and periodontal data become first-class relational
   structures with their own append-only history (`dental_bridges`,
   `dental_bridge_units`, `dental_implant_components`,
   `periodontal_examinations`, `periodontal_sites`). FINAL parent/child
   rows are immutable; an amendment is a new DRAFT row that supersedes
   the prior row in a single transaction. Voids and resolutions are
   append-only events, never destructive updates.

8. High-impact clinical writes (condition creation, surface changes, bridge
   design, bridge completion, implant component creation, periodontal
   examination finalization, void/resolution) use narrow server-authorized
   RPCs that derive actor, organization, and permitted branch server-side,
   record an audit event atomically, and preserve clinical authority
   rules. Correction writes are OWNER/ADMIN-only by default; the precise
   permission contract is fixed at O5.

9. Renderer assets (measured tooth SVGs) are imported from the pinned fork
   snapshot at the time of O6 port and copied into
   `src/components/odontogram/assets/measured/`. Each asset is referenced
   by file path under the same Next.js bundler; no fork import path is
   exposed at runtime.

## Consequences

- The Phase 15 status JSON becomes a legacy shape. Rows are preserved
  through an explicit migration that maps each existing status to a
  normative finding, treatment, or legacy marker without invented
  semantics.
- The fork's Classic renderer, demo application, and persistence are
  unavailable inside the EMR. Existing tests/UI for those code paths
  are out of scope and remain in the fork repository only.
- A renderer change (e.g. measured -> alternate view, future fork bump)
  becomes a code change in the EMR's own component layer, not a
  version bump of a published npm package.
- The fork's MIT notice and pinned commit travel with the EMR via
  `THIRD_PARTY_NOTICES.md`; that file is the legal and source-of-truth
  reference for any reuse, redistribution, or downstream audit question.

## Revisit triggers

Revisit before: replacing the measured renderer, bumping the fork pin,
adding a second renderer in parallel, adding FHIR or other clinical
interchange as canonical (vs. as a one-shot export), or shipping a
patient-facing odontogram view. Revisit also if a future clinical
specialty (orthodontics, oral surgery planning) needs renderer features
that this fork does not provide.
