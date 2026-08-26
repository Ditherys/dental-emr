# Phase 13 — Website Booking Integration

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §Phase 13, `docs/DATABASE_DESIGN.md` §12.6/§14.6/
§15, and accepted architecture. This is the highest-risk public surface; every
decision is conservative and defensive.

**Goal:** A public booking flow that collects only minimal patient information,
never exposes patient search, uses short-lived slot holds backed by the existing
reservation-ledger exclusion constraints (so website and reception cannot double
book), converts to a real EMR appointment immediately so calendar/communication
automation follows the same domain events, and turns specialist procedures into
a review request instead of fake instant availability.

## Global Constraints

- All Phase 1–12 doctrine applies unchanged, PLUS:
- **Public surface is anon-granted and minimal**: exactly these public RPCs
  receive an anon grant (documented deliberate exceptions): `get_public_site`
  (P12), `public_get_available_slots`, `public_submit_booking_request`,
  `public_get_booking_status`, `public_cancel_booking_request`. Nothing else.
- **No public patient search/directory.** The public flow collects first/last
  name, birth date, mobile, email (minimal). Existing-patient matching is a
  server-side candidate match only; ambiguous matches require staff review.
- **No fake instant availability for specialist procedures**: if the procedure
  is REQUEST_ONLY or `online_booking_enabled=false`, submission creates a
  SUBMITTED request with NO hold (no fake slot); the clinic reviews and may
  convert or issue a specialist request.
- **Double-booking prevention**: a hold creates an ACTIVE `provider_reservation`
  (kind HOLD) under the existing partial GiST exclusion constraint. Stale ACTIVE
  holds are expired by state transition (never `expires_at < now()` predicate)
  inside the booking transaction before a new hold is acquired. The exclusion
  constraint is the final race backstop.
- **Holds expire via state transition** (ACTIVE → EXPIRED) with a bounded
  lifetime (5 minutes). A scheduled/worker or on-read transition marks stale
  holds EXPIRED/RELEASED.
- **Idempotency**: each submission carries a client-generated `idempotency_key`;
  duplicate keys are no-ops (return the existing request). Active-hold abuse is
  bounded (max N active holds per key/window).
- **Management links/tokens**: a management token is returned once; only its
  SHA-256 hash is stored in `booking_requests`. Status/cancel require the
  hash. No token in logs.
- **Booking request ≠ clinical patient record**: `booking_requests` rows are
  lightweight; conversion to an appointment creates/attaches the real patient
  record through the existing appointment flow. Do not create a full clinical
  record from spam/abandoned forms.
- **Google/calendar/communication automation follows the same domain events**:
  conversion calls the existing internal enqueue helpers; the P9/P10 triggers
  fire unchanged.
- Rate/abuse bounds: bounded hold lifetime, idempotency, per-key active-hold
  cap, bounded window (max 30 days ahead), bounded slot result set.

## Role matrix (staff-side)

- `booking.review` (list + review/converse booking requests): OWNER, ADMIN,
  RECEPTIONIST. No other role.

## Tasks

- [ ] **P13-01: Booking permission + schema**
  - `booking.review` permission + matrix; `PermissionCode` + policy test;
    pgTAP.
  - `booking_requests`: org, branch, requested_procedure (org FK), requested_
    provider (org FK, nullable), requested_starts_at/ends_at (nullable; for
    instant booking required, for request-only nullable window), first_name,
    last_name, birth_date (nullable), mobile, email (nullable), acquisition_
    source_code (nullable, must be an active global source code or the org
    custom — reuse the attribution source rule), booking_channel_code default
    'WEBSITE', referral_payload jsonb (bounded, null), request_status
    (SUBMITTED/UNDER_REVIEW/APPROVED/DECLINED/CONVERTED/SPAM), management_
    token_hash (nullable, <=64 hex), idempotency_key (unique per org), reviewed_
    by/reviewed_at, appointment_id (org FK nullable), created_at, version.
    RLS + zero base grants + indexes. pgTAP.

- [ ] **P13-02: Public booking RPCs (anon, defensive)**
  - `public_get_available_slots(p_org_slug text, p_procedure_code text default null, p_days_ahead integer default 7)` — anon; resolves org by slug; returns bounded slot starts for website-visible procedures (honoring provider availability rules, exceptions, ACTIVE reservations INCLUDING HOLD kind, minus a configurable lead buffer); never returns patient/internal data; limit 50; window <= 30 days. Zero clinical data.
  - `public_submit_booking_request(p_org_slug text, p_payload jsonb)` — anon; minimal allowlist (firstName, lastName, birthDate, mobile, email nullable, requestedProcedureCode, requestedProviderId nullable, requestedStartsAt, idempotencyKey, acquisitionSourceCode nullable); validates fields/bounds; resolves org by slug + active branch (first active branch); expires stale ACTIVE holds for the requested provider/slot; for instant-bookable procedures acquires a 5-minute ACTIVE HOLD reservation (exclusion backstop) and creates SUBMITTED; for request-only/specialist procedures creates SUBMITTED with NO hold; returns {requestId, managementToken (plaintext once), status}; idempotent by key; per-key active-hold cap; audit NOT applicable (anonymous) — instead the request row itself is the record; no patient search.
  - `public_get_booking_status(p_request_id uuid, p_management_token_hash text)` — anon; matches stored hash; returns bounded status + appointment state if CONVERTED; no PII beyond first/last name initial? Keep it minimal: status + created_at + appointment status if converted. No full PII.
  - `public_cancel_booking_request(p_request_id uuid, p_management_token_hash text)` — anon; SUBMITTED → CANCELLED-equivalent (add CANCELLED to the status domain) and releases any ACTIVE hold.
  - Terminal grants: these 4 → anon + authenticated; nothing else anon. pgTAP (no-leakage, idempotency, double-book rejection via exclusion, stale-hold expiry, request-only no-hold, token hash only, minimal fields).

- [ ] **P13-03: Staff review RPCs**
  - `private.has_booking_review_permission_at_branch(acting_branch_id, code)`
    helper.
  - `list_booking_requests(acting_branch_id, status)` — booking.review gated;
    bounded projection (no token hash); no audit.
  - `review_booking_request(acting_branch_id, request_id, expected_version, action, reason)` — booking.review gated; actions APPROVE/DECLINE/SPAM.
    APPROVE for an instant request: converts the request to a real appointment
    (create appointment via the internal pattern for the requested window +
    provider + procedure + patient candidate; patient resolved server-side:
    match by mobile/email/name+birth; create a minimal patient if none with
    demographics-write at branch; attach appointment_id; CONVERTED; converts the
    HOLD reservation to an APPOINTMENT reservation) — calendar/communication
    triggers fire. APPROVE for request-only: marks APPROVED (no fake slot).
    DECLINE/SPAM: release hold, mark status, audit each action. Audit
    'booking.request.reviewed' metadata {action, old_value, new_value}.
  - pgTAP: staff-only; conversion creates an appointment + fires automation
    (assert calendar_sync_jobs/communications rows); patient match/create;
    hold→appointment reservation conversion; decline releases hold; spam;
    audit; tenant isolation.

- [ ] **P13-04: Server services + staff UI + website booking UI**
  - `src/lib/booking/` service layer (schemas/types/errors/service for public +
    staff RPCs) + offline tests.
  - Staff `/booking-requests` page (booking.review gated): review queue
    (dense table/phone), approve/decline/spam actions + review dialog, shows
    minimal submitted info (never clinical). Tests.
  - Website `/book` page (public, anon): minimal form (name, birth date,
    mobile, email, service select from get_public_site procedures, optional
    provider, date/time from public_get_available_slots), submit →
    public_submit_booking_request, shows management token + status; request-only
    procedures show "we'll review" instead of slots; no patient search; mobile-
    first. Tests assert NO clinical data and minimal-fields-only.

- [ ] **P13-05: Integration verification + phase review**

## Explicitly deferred

- Public patient portal / account.
- Waitlist for cancelled slots.
- Real payment/captcha (rate limiting is bounded-hold based; captcha deferred).
- Campaign/landing attribution beyond acquisition_source_code capture.
- Messenger booking assistant (Phase 22).

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 13)

- website and reception cannot double book same slot (HOLD reservations under
  the exclusion constraint + stale-hold expiry; concurrency-tested);
- online appointment appears immediately in EMR (conversion creates the real
  appointment in the same transaction);
- Google/calendar automation follows same domain events (existing triggers
  fire on conversion);
- only minimal patient information collected before booking (allowlist);
- specialist procedure can create request instead of fake instant availability
  (request-only → SUBMITTED, no hold).

## Verification

- Full local db reset/provision/test incl. a **concurrency probe** proving two
  simultaneous public bookings for the same provider+slot cannot both succeed
  (one wins, one fails/expires); security migrations/secrets/audit;
  unit/lint/typecheck/build. Cloud TEST remains the deployment gate.