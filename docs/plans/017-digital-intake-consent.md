# Phase 17 — Digital Intake & Consent

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §Phase 17 plus accepted architecture. No new
product requirements are invented.

**Goal:** Secure digital intake and consent: a per-patient, per-form secure link
(token-hashed, cannot enumerate/expose another patient), medical/dental history
and consent forms with versioned templates, a privacy notice acknowledgement,
signed consent capturing template version/time/signers, and a print/paper
alternative.

## Global Constraints

- All Phase 1–16 doctrine applies unchanged.
- **Form link cannot expose another patient**: intake access is bound to a
  token whose SHA-256 hash is stored (mirroring booking management tokens); the
  token resolves exactly one patient+form; no patient enumeration is possible.
- Tokens expire via state transition (ACTIVE → EXPIRED) with a bounded lifetime
  (default 7 days); never a bare `expires_at < now()` predicate for correctness.
- Consent templates are versioned; a signed/printed form records
  template_version + signed_by/signed_at + submitted_via (LINK/PAPER).
- Anon intake surface is minimal and deliberate: exactly
  `public_get_intake_form` + `public_submit_intake_form` receive anon grants
  (extending the documented public-exception list); nothing else.
- Submitted intake answers are bounded JSON; medical/dental history answers feed
  the Phase 14 clinical history (a follow-up clinical review step — the intake
  answers themselves are the authoritative submitted questionnaire, preserved
  verbatim per DATABASE_DESIGN §10.4).
- Staff can create an intake link, re-print a paper form, or mark a form as
  paper-signed (upload alternative is deferred to Phase 24/media rules).

## Role matrix

- `intake.manage` (create links, mark paper/print, review status): OWNER, ADMIN,
  RECEPTIONIST.

## Tasks

- [ ] **P17-01: Intake permission + schema**
  - `intake.manage` permission + matrix; `PermissionCode` + policy test; pgTAP.
  - `consent_templates`: org (nullable global + org custom), code, name, body
    bounded, version, is_active, timestamps; global-immutable scope trigger.
  - `intake_forms`: org, branch, patient composite FK, form_type
    (MEDICAL_HISTORY/DENTAL_HISTORY/CONSENT), consent_template_id (FK nullable),
    template_version bounded, answers jsonb (bounded object), privacy_
    acknowledged boolean default false, status (PENDING/SUBMITTED/SIGNED/
    PRINTED), submitted_via (LINK/PAPER), submitted_at, signed_by (auth.users
    nullable for paper; patient token for digital), signed_at, created_by,
    version, timestamps. RLS + zero base grants.
  - `intake_links`: org, patient composite FK, intake_form (org FK), token_hash
    (sha256, unique), status (ACTIVE/EXPIRED/REVOKED), expires_at, created_at.
    RLS + zero grants.
  - pgTAP.

- [ ] **P17-02: Intake RPCs**
  - `private.has_intake_permission_at_branch(acting_branch_id, code)` helper.
  - `create_intake_form(acting_branch_id, patient_id, form_type, consent_template_id null)` —
    intake.manage gated; creates PENDING form + an ACTIVE intake_link (7-day
    expiry) + returns the link token plaintext once (hash stored); audit
    'intake.form.created' {}.
  - `public_get_intake_form(p_org_slug text, p_token text) returns jsonb` — anon;
    resolves org by slug; computes token hash; returns the bounded form
    (form_type, template body for CONSENT, questions, privacy_notice,
    expires_at) for the token's patient+form ONLY; no other patient data; wrong/
    expired/revoked token → NULL (indistinguishable).
  - `public_submit_intake_form(p_org_slug text, p_token text, p_answers jsonb, p_privacy_acknowledged boolean)` —
    anon; token hash; validate answers bounded object + privacy acknowledged for
    CONSENT; PENDING → SUBMITTED (submitted_at, submitted_via LINK, answers
    preserved verbatim); idempotent (already submitted → return existing);
    audit N/A (anonymous) — the form row is the record. For CONSENT, a second
    explicit `public_sign_intake_form` may be deferred — SUBMITTED records the
    digital consent; the acceptance "signed document captures template version/
    time/signers" is satisfied by SUBMITTED forms (answers + template_version +
    submitted_at + submitted_via LINK + the token binding). Staff:
  - `mark_intake_form_paper(acting_branch_id, form_id, expected_version, reason)` —
    intake.manage gated; PENDING/SUBMITTED → PRINTED (paper-sign alternative,
    signed_by = actor, submitted_via PAPER); audit 'intake.form.printed' {}.
  - `list_intake_forms(acting_branch_id, patient_id)` — intake.manage gated;
    bounded projection (no answers); no audit.
  - Terminal grants (public 2 → anon + authenticated; staff 3 → authenticated
    only) + pgTAP (token cannot expose another patient — cross-patient token
    fails; expired/revoked token denied; template version/time/signers captured;
    paper alternative; privacy acknowledgement required for consent; tenant
    isolation; permission denials).

- [ ] **P17-03: Server services + staff UI + public intake UI**
  - `src/lib/intake/` service layer + offline tests.
  - Staff `/settings/intake` (or patient-scoped intake section in the patient
    workspace): create form link (shows token once), list forms + status,
    mark paper-signed/printed. Gated on intake.manage. Tests.
  - Public intake pages `(public)/intake/[token]`: renders the bounded form from
    public_get_intake_form (medical/dental history fields or consent body +
    privacy notice), submit via public_submit_intake_form route handler. NO
    patient enumeration; wrong token → "link not found". Mobile-first, minimal.
    Tests (no cross-patient data, consent privacy checkbox, submit flow).

- [ ] **P17-04: Integration verification + phase review**

## Explicitly deferred

- Upload of paper-signed documents (Phase 24 / media rules).
- eSignature capture beyond the privacy-acknowledged submit (digital signature
  UI if later approved).
- Clinic-configurable intake question library (form fields are a fixed bounded
  set for this phase; answers are JSON).

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 17)

- form link cannot expose another patient (token-hash binding + pgTAP
  cross-patient denial);
- signed document captures template version/time/signers (template_version +
  submitted_at + submitted_via + token binding);
- clinic can print instead of digitally sign (mark_intake_form_paper + print
  seam).

## Verification

- Full local db reset/provision/test; security migrations/secrets/audit;
  unit/lint/typecheck/build. Cloud TEST remains the deployment gate.