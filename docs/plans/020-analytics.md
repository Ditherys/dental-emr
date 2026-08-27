# Phase 20 — Analytics

**Status:** Accepted 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §Phase 20 and TECHNICAL_ARCHITECTURE §24. No new
product requirements are invented.

**Goal:** An aggregate-only operational analytics dashboard for organization
owners/administrators, with documented metric definitions, 30/90/365-day
windows, an All Branches or validated single-branch filter, and direct source
traceability across appointments, patient acquisition/referrals, website
booking, provider/resource load, communications, and current low stock.

## Global Constraints

- All Phase 1–19 doctrine applies unchanged.
- Reuse the existing organization-wide `analytics.view` permission and
  `private.can_view_acquisition_report` authorization contract. Its baseline
  matrix remains OWNER/ADMIN only; no clinical or patient-row access is implied.
- Analytics are aggregates by default. No patient names, contact data, clinical
  text, drill-down rows, exports, browser base-table grants, or read audit events.
- The acting branch establishes the tenant. `branch_id = null` means All
  Branches; a non-null filter must be an active branch in that same organization.
- Windows are exactly 30, 90, or 365 days and use `[now() - window, now())`.
- Acquisition source and initial booking channel remain separate dimensions.
- PostgreSQL query RPCs are sufficient. No warehouse, materialized view, cache,
  charting dependency, or canonical analytics table is introduced.
- Provider/resource utilization is reported as booked appointment count and
  booked minutes. A percentage is deliberately not invented because canonical
  resource capacity hours are not modeled and provider exceptions make a naive
  denominator misleading.

## Metric Definitions And Sources

| Metric | Definition | Canonical source |
| --- | --- | --- |
| New patients | Patients created in-window; branch filter uses `preferred_branch_id` | `patients` |
| Appointment volume | Non-cancelled appointments starting in-window | `appointments` |
| Completion | `encounter_status = COMPLETED` among in-window appointments | `appointments` |
| No-show rate | NO_SHOW / (NO_SHOW + COMPLETED); pending and cancelled excluded | `appointments` |
| Confirmation rate | CONFIRMED / non-cancelled in-window appointments | `appointments` |
| Acquisition source | In-window new patients grouped by discovery source | `patients`, `acquisition_sources` |
| Initial booking channel | Same patient cohort grouped independently by initial channel | `patients`, `booking_channels` |
| Referral activity | In-window referral count grouped by direction and status | `patient_referrals` |
| Website conversion | Requests with `appointment_id` / non-SPAM, non-CANCELLED website requests created in-window | `booking_requests` |
| Provider load | Active APPOINTMENT reservations starting in-window: distinct appointments and booked minutes | `provider_reservations`, `providers` |
| Resource load | Active APPOINTMENT reservations starting in-window: distinct appointments and booked minutes | `resource_reservations`, `branch_resources` |
| Communication delivery | DELIVERED / (DELIVERED + FAILED), plus channel/status breakdown | `communications` |
| Current low stock | Active consumables below effective reorder level per selected active branch; missing balances count as zero | `inventory_items`, `inventory_stock`, `branches` |

## Tasks

- [x] **P20-01: Analytics contract + query indexes**
  - Update the `analytics.view` description from the Phase 5 acquisition-only
    wording to the accepted operational aggregate scope without changing its
    OWNER/ADMIN role matrix.
  - Add only the tenant/time access-path indexes needed for referral,
    communication, provider-reservation, and resource-reservation aggregation.
  - pgTAP keeps the role matrix exact and proves no new base-table grants.

- [x] **P20-02: Aggregate analytics RPCs**
  - `private.has_analytics_permission_at_branch(acting_branch_id)` derives the
    organization from an active branch and requires the existing organization-
    wide analytics permission.
  - `get_operational_analytics_summary(acting_branch_id, branch_id null,
    window_days)` returns only bounded `{metric_code,numerator,denominator}`
    rows for the summary definitions above.
  - `list_operational_analytics_breakdown(acting_branch_id, branch_id null,
    window_days)` returns at most 300 bounded rows shaped as
    `{group_type,dimension_id,code,name,item_count,booked_minutes}` for branch
    appointment volume, encounter state, acquisition source, booking channel,
    referral state, website request state, provider load, resource load, and
    communication delivery.
  - Both functions are SECURITY DEFINER with empty search paths, exact terminal
    grants to authenticated only, no service-role/anon grant, and no audit event.
  - pgTAP covers formulas, branch/all-branch filters, source/channel separation,
    tenant isolation, forged/foreign branch filters, invalid windows,
    permission denial, bounded rows, and zero patient-level fields.

- [x] **P20-03: Server service + role-aware operational dashboard**
  - `src/lib/analytics/` strict schemas, safe errors, exact RPC bindings, types,
    and offline tests. Inputs accept no organization identifier.
  - Replace the dashboard placeholder. OWNER/ADMIN users with `analytics.view`
    receive the aggregate dashboard, branch/window filters, concise rate/count
    summaries, metric definitions, and dense desktop/intentional phone
    breakdowns. No decorative four-card/KPI grid and no unjustified chart.
  - Users without `analytics.view` receive a permission-derived operational
    workspace linking only to already-authorized domain screens; they receive no
    analytics RPC data. Server actions recheck permission and acting branch.
  - 44px controls, loading/error/empty states, and tests for role gating,
    branch/window submission, source/channel distinction, and responsive views.

- [x] **P20-04: Integration verification + phase review**

## Explicitly Deferred

- Patient-level drill-down and exports (separate authorization + audit required).
- Financial, charges, payments, treatment acceptance, retention/LTV, and billing
  analytics until their canonical phases exist.
- Resource utilization percentage until resource capacity hours are canonical.
- Data warehouse/materialized views/caching until measured scale requires them.
- Third-party product analytics receiving private EMR content.

## Acceptance Criteria (from MASTER_PRODUCT_PLAN §Phase 20)

- analytics definitions are documented and implemented consistently;
- every metric traces to canonical source data;
- acquisition source and booking channel are not conflated;
- analytics access is role-based and enforced in server code and PostgreSQL.

## Verification

- Full local database reset/provision/test; security migrations/secrets/audit;
  unit/lint/typecheck/build; final tenant/privacy/diff review. Cloud TEST remains
  the deployment gate.

Local acceptance evidence: clean database replay and all 69 pgTAP suites plus
five concurrency probes passed; migration privilege lint passed for 123
migrations and 196 exact approved privileges with zero analytics base-table
grants; 279 script tests and 1,225 unit tests passed; lint, typecheck,
production build, and `git diff --check` passed. Cloud TEST remains mandatory
before production deployment or patient use.
