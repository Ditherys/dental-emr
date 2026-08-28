# Dental EMR — UI/UX Audit & Revamp Record

**Date:** 2026-08-28
**Scope:** Cross-application UI/UX audit + implementation pass on the current
`main` checkout (no new branch or worktree).
**Outcome:** The patient record was rebuilt as a section-based application page,
the application shell and navigation were densified, shared UI primitives were
introduced, and all modules were migrated toward one dense, clinical visual
language.

This document records the audit (sections 1–10) and the concrete changes that
were actually implemented in this pass (section 10). It is a work record, not a
stopping point; any remaining item is listed as a residual risk or deferred
decision.

---

## 1. Major consistency issues found

- Form-control styling was decentralized: some forms used `h-11` (44px) controls,
  others `h-10` (40px), with `border` vs `border-input`, ring `/30` vs `/25`,
  with and without invalid states. The same input `inputClass` string was
  duplicated in 13+ files.
- The patient workspace was a single long page: hash-anchor tabs (`#overview`,
  `#demographics`, …) that merely scrolled between sections while **every**
  section (files, referrals, intake, all four clinical datasets, providers) was
  eagerly loaded and mounted into the DOM.
- `PageHeader` had no `actions` slot, so primary actions lived in inconsistent
  places (list section headers, filter bars, inline buttons).
- Status values were rendered as raw text in some modules and as hand-rolled
  pills in others; there was no shared status primitive.
- Some collection lists used dense semantic tables, others used large cards;
  admin tables were consistent but row heights and header padding varied.
- The patient header duplicated information (name, status, DOB, preferred
  branch) that also appeared in the Overview and Demographics sections.

## 2. Density problems

- Page containers used `max-w-6xl` for the patient record and `max-w-7xl`
  elsewhere, shrinking a clinical workspace that should be wide.
- `PageHeader` + `<Separator className="my-6">` consumed ~40px of vertical space
  before any content on nearly every module page.
- Demographics always rendered a 12-field editable form (even for viewers),
  pushing clinical content far below the fold.
- Patient list and admin tables used `py-3`/`py-4` rows and oversized top
  padding.
- The empty state used `py-10`; several boards used `px-4 py-6` placeholder
  blocks.

## 3. Navigation problems

- 18 flat, ungrouped sidebar destinations made scanning hard; the sidebar had no
  internal scroll and could overflow short viewports.
- The mobile navigation sheet had a fixed-height body with no scrolling, so
  bottom destinations could be unreachable on short phones.
- The patient section tabs had **no active state** (Overview was permanently
  styled active), were not URL-aware, and did not survive refresh or direct
  linking.
- `/settings/users/invite` (Staff) existed but was absent from navigation.

## 4. Hierarchy problems

- The patient header was a large block with a `text-2xl` name and a long
  meta line, while section headings were `text-base`; information hierarchy was
  flat and repetitive.
- Overview duplicated the Demographics form instead of summarizing the record.
- Section headings and their actions were implemented inline in each section
  with different margins and button sizes.

## 5. Form problems

- Demographics had no view mode; "Edit" merely scrolled to an already-visible
  form.
- Long forms (registration, intake) used single-column spacing on wide screens
  and inconsistent control heights.
- The patient-search pickers used a `<span>` label with a placeholder-only input
  (no programmatic association).
- Website key/value editors used placeholder-only inputs.

## 6. Table/list problems

- Patient list and admin tables were mostly good; primary inconsistencies were
  header padding, row height, and raw status text.
- The recall "Link appointment" flow instructed users to copy an appointment
  UUID that the schedule never displays (productivity blocker, see §10 deferred).
- Row-level actions varied (labeled sm buttons vs immediate one-click archives).

## 7. Responsive issues

- Sidebar overflow on short/landscape viewports (desktop and mobile sheet).
- The patient tab bar scrolled horizontally without an overflow cue (acceptable)
  but tab hit areas were `py-3` (below the 44px coarse baseline until the global
  coarse-pointer stylesheet was applied).
- Most boards already split into desktop tables + phone lists, which is correct.

## 8. Accessibility issues

- Patient section tabs and Clinical sub-tabs lacked `aria-current`/tab semantics.
- Patient search inputs across 5 boards were unlabeled.
- The shell had no skip-to-content link and `<main>` had no target id.
- The account menu nested a `<form>` inside a `DropdownMenuItem`.
- Raw `v{n}`/AAL2/“not wired in this release” jargon appeared in user-facing
  copy.

## 9. Components standardized in this pass

New shared primitives (all in `src/components`, owned source):

- `ui/input.tsx`, `ui/textarea.tsx`, `ui/select.tsx` — one control class set
  (40px fine-pointer, 44px coarse via the global coarse-pointer stylesheet,
  `border-input`, ring `/25`, `aria-invalid` state).
- `ui/form-field.tsx` — label + control + hint/error wrapper with implicit
  control association.
- `ui/status-badge.tsx` — restrained status treatment (dot + label + tone),
  replacing raw text and hand-rolled pills.
- `ui/description-list.tsx` — `DescriptionList`/`DescriptionItem` for record
  view modes.
- `layout/section-header.tsx` — section heading + description + action.
- `layout/page-header.tsx` — now supports `actions`; tightened spacing.
- `patients/patient-picker.tsx` — one labeled, accessible patient search reused
  by Schedule, Queue, Recalls, Specialists, and Documents.

Existing shared feedback components (`EmptyState`, `PageError`, `PageLoading`,
`PermissionDenied`) were retained; `EmptyState` was tightened.

## 10. Changes actually implemented in this pass

**Patient record architecture**
- `patients/[patientId]/page.tsx` now validates `?section=` (`overview`,
  `demographics`, `contacts`, `relationships`, `referrals`, `clinical`,
  `intake`, `files`) and `?branch=` search params server-side, gates Clinical /
  Intake sections by live permission, and **loads only the active section's
  data** (referrals, files, clinical, intake). Back/forward, refresh, and direct
  linking work; only the selected section is mounted.
- `patient-workspace.tsx` is now a compact persistent record header (number,
  name, status badge, DOB/age/sex/contact/preferred branch) + section tab nav
  with `aria-current`, + a More menu holding Archive/Reactivate (no giant
  archive panel on Overview). It no longer overrides the server-resolved branch
  with client storage, so server-loaded data and mutations agree.
- `patient-demographics.tsx` — dense **view mode** (description lists) by
  default with an explicit Edit action; Edit swaps to the form with Save/Cancel,
  duplicate-review preservation, stale-version messaging, and dirty-state
  guards (beforeunload + in-app navigation confirm).
- `patient-contacts-relationships.tsx` — Contacts and Relationships sections
  with compact rows and shared dialogs.
- `patient-overview.tsx` — real summary (identity, contact, relationships,
  record/attribution) instead of duplicating the Demographics form.
- Added `patient-sections.ts` (section catalog, href builder, age/date helpers,
  duplicate-request type).

**Shell & navigation**
- `navigation-items.ts` — grouped catalog (Dashboard / CLINICAL / ENGAGEMENT /
  OPERATIONS / CONFIGURATION / REPORTING / ADMINISTRATION) + `Staff`
  (`/settings/users/invite`, gated by `user.invite`).
- `desktop-navigation.tsx` / `mobile-navigation.tsx` — grouped rendering,
  `aria-current` preserved, mobile sheet body now scrollable.
- `shell-layout.tsx` — viewport-bounded sticky sidebar with `overflow-y-auto`
  navigation, skip-to-content link, `main#main-content`, org context preserved
  when collapsed, footer copy de-jargonized.

**Module migration**
- Providers / Specialties / Procedures pages compute `canManage`
  (`provider.manage`) server-side and hide Add/Edit/Archive affordances for
  read-only users (server checks unchanged).
- All `my-6` page separators standardized to `my-4`; patient list and admin
  tables tightened; statuses use `StatusBadge`.
- The repeated patient-search pickers replaced with the shared `PatientPicker`
  (real labels + ids + announced result list) in Schedule, Queue, Recalls,
  Specialists, and Documents.
- Website key/value editors gained accessible names.
- Public-facing jargon removed from the MFA-verified page, calendar-sync
  description, and confirm dialogs (AAL2 → "fresh security verification").
- `EmptyState` tightened.

**Verification**
- `npm run typecheck` clean; `npm run lint` clean; `npm run build` passes with
  all routes emitted (incl. `/patients/[patientId]`).
- `npm run test:unit` — **120 files / 1227 tests pass.**
- Dev-server smoke: `/login` serves 200, renders the heading, zero horizontal
  overflow, zero console errors.

### Deferred / residual (documented, not changed)

- **Automated E2E / visual review of authenticated screens** requires the
  designated hosted test environment (`APP_ENVIRONMENT`); it is not configured
  in this session, so the Playwright responsive/axe suite could not be run.
  Login-page rendering/overflow/console was verified with a standalone browser
  script instead.
- **Global branch selector vs route data** (Schedule/Queue/Inventory/Documents
  load `activeBranches[0]` regardless of the selector). The patient module now
  uses a URL-validated branch, but the other operational modules still need a
  route/server-backed branch selection change; this is a UI-only pass, so it is
  recorded rather than forced here.
- **Recall "Link appointment"** asks for an appointment UUID that Schedule never
  displays — needs a patient/branch-scoped appointment selector (bounded UI +
  read-RPC work).
- **Calendar sync first integration** cannot be created from an empty state
  (candidates come only from existing integrations) — needs an authorized
  provider-candidate projection.
- **Schedule** cannot assign a provider at creation and has no date navigation —
  needs the scheduling contract + a date-navigation slice.