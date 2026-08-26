# Phase 5 — Acquisition & Referrals Foundation

**Status:** Authored 2026-08-26 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). No prior spec/plan existed;
this plan is derived strictly from `docs/MASTER_PRODUCT_PLAN.md` §10 and the
accepted architecture documents. No new product requirements are invented.

**Goal:** Capture how patients discovered the clinic (acquisition source),
who referred them (patient or external professional), and how their first
booking was made (channel) — as separate, standardized dimensions — plus a
minimal incoming/outgoing clinical referral foundation, and basic source
reports. Historical accumulation starts now so later analytics have data.

## Global Constraints

- All Phase 1–4 doctrine applies unchanged: org tenant boundary, RLS on every
  exposed table, no browser-role base-table DML, SECURITY DEFINER RPCs with
  empty search paths and terminal grants registered exactly, optimistic
  versions, one atomic audit event per mutation with `{}` metadata, AAL2 where
  lifecycle-critical, synthetic fixtures only.
- The three questions stay separate: acquisition source ≠ referrer ≠ booking
  channel. Walk-in is a booking channel, never a discovery source.
- Standardized source catalog: global seeded rows (Existing Patient Referral,
  Family/Friend, Dentist Referral, Doctor/Healthcare Referral, Google Search,
  Google Maps, Facebook, Instagram, TikTok, Clinic Website/Direct, Clinic
  Signage, Flyer/Event, HMO, Employer/Company, School/Partner, Other,
  Unknown) + org custom rows mapped to a category. Free-text sources are not
  invented by staff; `Unknown` always allowed.
- Booking channel: stored per patient as `initial_booking_channel` for now;
  when appointments exist (Phase 6+), appointments carry their own channel.
  Channels: Walk-in, Phone, SMS, Facebook Messenger, Instagram Messaging,
  Clinic Website, Online Booking, Receptionist-created. Unknown supported.
- Referring patient links are tenant-safe composite FKs; selecting a referrer
  uses the already-authorized internal directory (no new public surface).
- External referrer snapshot: free-text name/org/contact fields, clearly
  administrative data; never clinical content.

## Tasks

- [ ] **P5-01: Catalog schema**
  - Migrations: global `acquisition_sources` + `booking_channels` catalogs
    (seeded via migration INSERTs with stable codes, `is_active`, category),
    org-custom acquisition sources referencing a category; RLS deny-by-default
    following file_objects precedent; pgTAP suite.
- [ ] **P5-02: Patient attribution columns**
  - Migration: add to `patients` — `acquisition_source_id` (tenant-safe:
    global OR same-org custom, enforced like specialties), `referrer_patient_id`
    (composite FK same-org), external referrer snapshot columns
    (`external_referrer_name`, `external_referrer_organization`,
    `external_referrer_contact`), `initial_booking_channel_code`.
    Nullable; no backfill. CHECK: at most one of (referrer_patient_id,
    external_referrer_name) set. pgTAP suite.
- [ ] **P5-03: Attribution write/read RPCs**
  - Recreate `create_patient` (hardening precedent) accepting optional
    attribution block validated against active catalogs; new
    `update_patient_attribution(acting_branch_id, patient_id, expected_version, ...)`
    demographics-write gated; extend bounded detail read to include
    attribution projection. Terminal grants + pgTAP (positive/negative/
    cross-tenant/inactive-source rejection).
- [ ] **P5-04: Referral foundation schema**
  - Migration: `patient_referrals` (org FK, patient FK composite, direction
    IN/OUT, status RECEIVED/ACTIVE/COMPLETED/CANCELLED, required specialty
    nullable link to specialties, external party snapshot, notes ≤2000,
    version, timestamps); RLS + zero grants; access-path indexes; pgTAP.
- [ ] **P5-05: Referral RPCs**
  - create/update-status/list referrals (demographics-write for mutations,
    read permission for lists; optimistic versions; audit events; AAL2 NOT
    required this phase); safe errors; pgTAP suite incl. state-machine checks
    and cross-tenant denials.
- [ ] **P5-06: Server services**
  - `src/lib/acquisition/` Zod schemas/services/error mapping for catalogs,
    attribution update, referrals CRUD; unit tests offline.
- [ ] **P5-07: Registration & workspace UI**
  - `/patients/new` gains an optional Acquisition section (source select from
    catalog, conditional referrer picker over authorized directory or external
    fields, channel select); workspace Demographics section shows read-only
    attribution; new workspace Referrals section (list + create/status actions)
    using established dialog/table patterns; server actions recheck live
    permissions; tests.
- [ ] **P5-08: Basic source report**
  - New permission `analytics.view` granted ONLY to OWNER/ADMIN (P3-01
    contract pattern, pgTAP-proven); aggregate RPC returning counts grouped by
    source/category/channel for the actor's org (bounded window param);
    private `/reports/acquisition` page (dense table, phone composition);
    navigation entry gated on the new permission; tests.
- [ ] **P5-09: Integration verification + phase review**

## Explicitly deferred

- Appointment booking-channel linkage (Phase 6 schema owns it).
- Campaign/landing-page web attribution (Phase 12/13).
- Referral rewards/incentives (compliance review first).
- Merge/dedup interactions with attribution history.

## Acceptance Criteria

- Facebook discovery + Messenger booking representable simultaneously.
- Walk-in channel never erases a recorded discovery source.
- Referring patient selectable and tenant-safe; external professionals captured.
- `Unknown` available everywhere; source names standardized (catalog-driven).
- Reports show counts by source/category/channel, OWNER/ADMIN only, org-scoped.
- Full local verification green; Cloud TEST remains pre-production gate.
