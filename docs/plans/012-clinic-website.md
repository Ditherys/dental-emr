# Phase 12 — Clinic Website

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §Phase 12 plus accepted architecture. No new
product requirements are invented.

**Goal:** A public-facing clinic website (home/about, services, dentist
profiles, location/contact, privacy notice, Book Appointment + Messenger CTAs)
that exposes **no clinical data**. All provider/service content comes from
controlled public fields; core public information is admin-editable without
code. Strong mobile performance and an SEO foundation.

## Global Constraints

- All Phase 1–11 doctrine applies unchanged.
- The public site is a separate application boundary from the authenticated
  EMR (`(public)` route group). It is the ONLY unauthenticated surface and must
  never expose clinical data, patient data, or internal content.
- Provider profiles render only `website_visible` providers with their
  `bio`/public profile fields (already controlled public fields from P3-02).
  Services render only `website_visible` procedures (name/description only).
- Public reads go through a bounded SECURITY DEFINER `get_public_site(org_slug)`
  RPC returning only website-safe fields; it requires NO auth and returns ZERO
  clinical/patient/internal data.
- Admin-managed content: `public_site_settings` (org-scoped: hero, about,
  contact, operating hours, privacy notice, social links) editable by
  OWNER/ADMIN via a settings page and `site.manage` permission.
- No booking on the website in this phase (Phase 13). Book Appointment /
  Messenger CTAs are links (Messenger CTA is a configured public field).
- Mobile-first responsive Tailwind; SEO via per-route metadata + semantic HTML.

## Role matrix

- `site.manage`: OWNER, ADMIN only.

## Tasks

- [x] **P12-01: Site permission + settings schema**
  - `site.manage` permission row + matrix; `PermissionCode` + policy test;
    pgTAP proving matrix.
  - `public_site_settings`: org PK (FK org), hero_heading, hero_subtext,
    about_text, contact_phone, contact_email, address_override, operating_hours
    jsonb (object, bounded), privacy_notice, messenger_link, booking_link,
    social_links jsonb, version, timestamps. RLS + zero base grants. pgTAP.

- [x] **P12-02: Public read RPC + settings RPC**
  - `get_public_site(p_org_slug text)` — SECURITY DEFINER, empty search_path,
    NO auth required, returns bounded website-safe JSON: org business_name +
    address, settings fields, website_visible providers (display name, bio,
    primary specialty label, website_visible only) and website_visible
    procedures (name, description, website_visible only). Zero clinical data.
    This is the ONLY unauthenticated RPC; rate-safe by being bounded.
  - `get_public_site_settings` (site.manage gated read) +
    `update_public_site_settings` (site.manage gated, versioned, bounded
    allowlisted JSON, audit 'site.settings_updated' {}).
  - Terminal grants (get_public_site → PUBLIC/anon? Doctrine says no browser
    role grants to sensitive functions. But a public site MUST be readable
    unauthenticated. Decision: grant execute on get_public_site to `anon` ONLY
    (it returns only website-safe data by construction and is the deliberate
    public surface); all other functions authenticated-only. Document this as
    the single deliberate public grant.)
  - pgTAP: public RPC returns only website-safe fields (no patient/clinical/
    internal columns; assert the JSON keyset), anon can execute it, website-
    hidden providers/procedures excluded, settings update + audit + versioning +
    permission denials.

- [x] **P12-03: Server services + admin settings UI**
  - `src/lib/site/` service layer (schemas/types/errors/service) for the RPCs
    + offline tests.
  - `/settings/site` admin page (OWNER/ADMIN): edit hero/about/contact/hours/
    privacy/links; server actions recheck site.manage + branch; tests.

- [x] **P12-04: Public website UI**
  - Rebuild the `(public)` home page into the clinic website: home/about
    (hero from settings), services section (website_visible procedures),
    dentist profiles section (website_visible providers), location/contact,
    privacy notice, Book Appointment CTA (booking_link) + Messenger CTA
    (messenger_link). All content server-rendered from `get_public_site` for
    the org slug (single-tenant: the first/only active org; multi-tenant slug
    routing deferred — the home page resolves the current public org via a
    configured env/slug or the sole active org).
  - Mobile-first responsive, SEO metadata, semantic HTML, no clinical data.
  - Footer with privacy notice + Messenger CTA. Tests (renders settings +
    provider/procedure public fields; asserts NO patient/clinical strings;
    mobile composition).

- [x] **P12-05: Integration verification + phase review**

## Explicitly deferred

- Website booking flow, availability, slot holds (Phase 13).
- Multi-tenant public slug routing (single-tenant resolution for now).
- Campaign landing pages (Phase 13 web attribution).

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 12)

- site performs well on mobile (responsive Tailwind, tested);
- public site exposes no clinical data (public RPC keyset + tests);
- provider/service content comes from controlled public fields
  (website_visible only);
- clinic can change core public information without code
  (admin settings page + site.manage).

## Verification

- Full local db reset/provision/test; security migrations/secrets/audit;
  unit/lint/typecheck/build. Cloud TEST remains the deployment gate.