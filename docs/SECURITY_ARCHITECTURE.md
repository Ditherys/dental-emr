# Dental EMR & Practice Management Platform — Security Architecture

**Version:** 1.3  
**Status:** Security baseline for prototype, pilot, and future SaaS production  
**Prepared:** 2026-08-12 (Asia/Manila)  
**Primary market:** Philippine dental clinics  
**Companion documents:** `MASTER_PRODUCT_PLAN.md`, `TECHNICAL_ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `FRONTEND_ARCHITECTURE.md`  
**Implementation style:** Claude Code + OpenAI Codex with human review, Git checkpoints, and no production patient data in AI-agent prompts

---

# 0. Purpose and Scope

This document defines the security and privacy architecture for the dental EMR and practice-management platform.

It is intentionally separate from the product, database, frontend, and general technical architecture documents.

- `MASTER_PRODUCT_PLAN.md` defines **what the product should do**.
- `TECHNICAL_ARCHITECTURE.md` defines **how the major technical components fit together**.
- `DATABASE_DESIGN.md` defines **how persistent data is modeled, related, constrained, and tenant-scoped**.
- `FRONTEND_ARCHITECTURE.md` defines **how the website and private EMR are rendered and operated by users**.
- `SECURITY_ARCHITECTURE.md` defines **who and what may be trusted, how access is controlled, how sensitive records are protected, what must be logged, how incidents are handled, and what security gates must be passed before real patient data is used**.

This file is an engineering security specification. It is **not a substitute for legal advice, professional privacy advice, dental professional obligations, tax/accounting advice, or a formal Privacy Impact Assessment (PIA)**.

Before production use with real patient records, the clinic and future SaaS operator must validate the legal/privacy implementation with the clinic's Data Protection Officer (DPO) or other qualified Philippine privacy professional as applicable.

---

# 1. Security Position

## 1.1 Security is a product requirement, not a final deployment task

This system will process patient identity data, health information, dental records, clinical notes, dental charts, treatment plans, prescriptions, X-rays/photos, consent/acknowledgment records, appointment history, communications, referral information, and billing information.

A security failure can therefore affect more than login credentials. It can expose or corrupt longitudinal healthcare information, cause clinicians to act on incorrect data, expose private treatment information, disrupt clinic operations, or compromise future SaaS tenants.

Security controls must be designed into:

- database tables;
- authorization helpers;
- API boundaries;
- public booking;
- file access;
- authentication;
- background jobs;
- Google Calendar integration;
- SMS/email/Messenger integrations;
- document/PDF generation;
- treatment drawings;
- odontogram editing;
- inventory;
- backups;
- audit logging;
- deployment environments;
- developer/AI-agent workflows.

## 1.2 Primary security objectives

The platform must protect:

### Confidentiality

Only authorized people and systems may see patient or clinic information.

Examples:

- Clinic A must never see Clinic B's patients when the product becomes SaaS.
- A receptionist should not automatically see clinical details unnecessary for front-desk work.
- An on-call specialist should not automatically gain access to all patients in the organization.
- A public website visitor must never enumerate patient records.
- A copied R2 object URL must not become permanent access to a patient file.

### Integrity

Records must not be changed without authority or without preserving clinically important history.

Examples:

- a finalized clinical note cannot be silently rewritten;
- a signed treatment-plan version cannot mutate when current pricing changes;
- an appointment cannot be double-booked because of two concurrent browser requests;
- a patient's odontogram data cannot be modified merely by manipulating a React request;
- a client cannot nominate an arbitrary `organization_id` and write into another tenant.

### Availability

The clinic must be able to continue or recover after failures.

Examples:

- Google Calendar downtime must not erase an EMR appointment;
- failed SMS delivery must not lose the appointment;
- a deleted deployment must not be the only copy of the database;
- a file-storage incident must have a recovery path;
- restore procedures must be tested, not assumed.

### Accountability

Sensitive actions must be attributable.

Examples:

- who opened a patient's clinical record;
- who exported a patient PDF;
- who changed permissions;
- who voided a charge;
- who amended a clinical note;
- who accepted a specialist case;
- which system job sent a reminder;
- which user connected or disconnected Google Calendar.

### Privacy and proportionality

The system should collect and expose only what is needed for a defined purpose.

Examples:

- website booking should not ask for a full medical history before an appointment is even accepted;
- Google free/busy should use availability rather than exposing personal event details;
- reminder messages should contain minimal clinical information;
- analytics should use aggregate/de-identified data where detailed patient identity is unnecessary.

---

# 2. Philippine Privacy and Security Baseline

## 2.1 Health information is high-risk data

The Philippine Data Privacy Act of 2012 (Republic Act No. 10173) establishes transparency, legitimate purpose, and proportionality as general privacy principles and places additional restrictions on sensitive personal information. National Privacy Commission (NPC) health-sector guidance notes that healthcare providers process substantial sensitive personal information.

The engineering consequence is simple:

> Treat patient clinical data as sensitive by default, even when a particular screen looks operational rather than clinical.

## 2.2 NPC Circular 2023-06 is a key security baseline

NPC Circular No. 2023-06, Security of Personal Data in the Government and Private Sector, is a central security reference for this project.

The architecture must support the organization in implementing requirements such as:

- DPO designation/registration where applicable;
- data-processing-system registration where applicable;
- inventory of personal-data processing systems and activities;
- Privacy Impact Assessments;
- a Privacy Management Program;
- privacy/data-protection training;
- privacy-by-design and privacy-by-default;
- a documented password policy;
- need-to-know access controls;
- controls over service providers / personal information processors;
- acceptable-use policies;
- business continuity and backup/restoration planning;
- appropriate controls for email and portable media;
- retention policies;
- log retention and archival;
- secure disposal/destruction;
- threat monitoring and vulnerability management;
- personal-data-breach management.

This document therefore intentionally includes technical controls **and** operational controls. A secure database alone is not a complete privacy program.

## 2.3 Privacy Impact Assessment is a production gate

NPC Circular 2023-06 states that a PIA should be undertaken for every processing system involving personal data and updated when necessary, including for major changes, new features, new rules, contracts, or processor changes.

Accordingly:

**No real patient-data pilot should be treated as production-ready until a PIA has been completed and its required controls have been incorporated into the product/operations.**

At minimum, the PIA for this EMR should inventory:

- patient demographic data;
- health/dental information;
- appointment data;
- X-rays/photos/files;
- billing information;
- referral/acquisition data;
- Google Calendar processing;
- SMS/email/Messenger processing;
- Cloudflare R2 object storage;
- Supabase/PostgreSQL;
- Vercel hosting;
- analytics/error monitoring;
- backups;
- support access;
- printing/export workflows;
- any future AI/MCP processing.

## 2.4 DPO and data-processing-system registration

NPC Circular 2022-04 contains registration criteria for PICs/PIPs, including thresholds involving employee count, processing of sensitive personal information of at least 1,000 individuals, processing likely to pose a risk to rights and freedoms, and automated decision-making/profiling circumstances.

The software must therefore make it possible for the clinic/SaaS operator to maintain the information needed for a processing-system inventory.

**Do not hard-code an assumption that registration is unnecessary simply because the first clinic is small.** The DPO/privacy professional must determine applicable registration obligations based on the actual processing.

## 2.5 Likely PIC/PIP relationship

For the initial commercial model, the likely relationship is:

- the **dental clinic** decides why patient data is collected and how it is used for dental care, and therefore is likely the Personal Information Controller (PIC) for that patient-care processing;
- the **SaaS operator** processes clinic patient data on the clinic's instructions and is likely a Personal Information Processor (PIP) for those activities;
- if the SaaS operator independently decides to use identifiable patient data for a separate purpose, that separate processing may create additional controller obligations.

This is an architectural assumption for contract/data-flow design, **not a final legal determination**.

The production SaaS contract should include an appropriate data-processing agreement covering at least:

- processing instructions;
- confidentiality;
- security measures;
- subprocessors;
- incident notification;
- data return/export;
- deletion/retention at contract termination;
- audit/compliance support;
- international/cloud processing locations as applicable;
- assistance with data-subject requests.

## 2.6 Consent is not the only possible lawful basis

Do not implement a simplistic rule that every processing activity becomes legal merely because there is one generic checkbox saying “I consent.”

NPC consent guidance emphasizes specific, informed, actively managed consent when consent is the relied-upon basis. Healthcare and operational processing may have other lawful bases depending on the activity.

Architecture implication:

- privacy notices and consent artifacts must be versioned;
- optional marketing consent must be separable from clinic-care communications;
- withdrawal/preferences should be recorded where consent is the basis;
- legal basis should be documented per processing purpose during the PIA, rather than inferred by frontend code.

## 2.7 Retention is a policy, not “keep everything forever”

The DPA and NPC security guidance require deliberate retention/disposal governance.

The software should support retention policies, but **this architecture does not invent a universal dental-record retention period**.

Before launch, the clinic must determine applicable retention requirements for:

- clinical records;
- prescriptions;
- consent/refusal documentation;
- X-rays/images;
- billing/accounting records;
- audit/security logs;
- communications;
- backups;
- inactive user accounts;
- website booking leads that never become patients.

Clinical-history immutability and legal retention are related but not identical. “Do not silently delete a signed treatment plan” does not automatically mean “retain every copy forever.”

## 2.8 Personal-data-breach procedures

NPC breach guidance includes a 72-hour notification timeline in applicable personal-data-breach circumstances. The clinic remains responsible for its controller obligations even when processing is outsourced.

Therefore the platform/SaaS operator needs an incident workflow capable of rapidly answering:

- what happened;
- when it began;
- when it was discovered;
- which organizations/branches were affected;
- which patient records were affected;
- what categories of personal data were involved;
- whether data was actually accessed/exfiltrated or merely exposed;
- which user/service/account performed activity;
- what remediation was taken;
- what evidence/logs exist;
- which clinic DPO/contact must be notified.

Do not design logging in a way that makes this investigation impossible.

---

# 3. Privacy-by-Design and Privacy-by-Default Rules

The following are product defaults, not optional stylistic preferences.

## 3.1 Default deny

When a permission is not explicitly granted, deny it.

Do not create a role model where every new module is automatically visible to existing users.

## 3.2 Minimum necessary display

A screen should not expose a complete patient record merely because it needs a patient's name for an appointment.

Examples:

- appointment calendar card: patient display name, service/procedure privacy setting, status, provider, time;
- receptionist patient search: demographic/contact data needed for identity and scheduling;
- specialist case: only assigned patient's relevant case/clinical context;
- analytics: aggregate data by default.

## 3.3 No sensitive data in URLs

Never place in URL paths/query parameters:

- medical conditions;
- treatment notes;
- diagnosis text;
- prescription data;
- patient phone/email;
- Google refresh tokens;
- password reset secrets;
- raw secure-link secrets.

Opaque record UUIDs may appear in authenticated application routes but must not be treated as authorization.

## 3.4 No patient data in client analytics

Public website analytics may collect ordinary marketing events subject to privacy policy.

Private EMR telemetry must not send patient names, clinical text, odontogram contents, prescription details, or treatment-plan notes into ordinary analytics platforms.

If error monitoring is added, implement scrubbing/redaction before production.

## 3.5 No real patient data in development

Development, tests, screenshots, demo videos, prompts, and agent sessions use synthetic data only.

Staging should use synthetic or properly de-identified data unless a formally approved exception exists.

---

# 4. Data Classification

Every important data domain should be classified so agents and developers know the expected control strength.

## 4.1 Class P0 — Public

Examples:

- clinic name;
- public branch address;
- published operating hours;
- public dentist biography/photo;
- public service descriptions;
- public website content.

Controls:

- integrity protection still matters;
- only authorized website/admin users may edit;
- no confidentiality requirement after intentional publication.

## 4.2 Class P1 — Internal operational

Examples:

- internal chair identifiers;
- staff schedules that contain no patient data;
- internal service configuration;
- inventory SKU definitions;
- internal non-sensitive workflow settings.

Controls:

- authenticated access;
- tenant/branch scope;
- audit high-impact configuration changes.

## 4.3 Class P2 — Confidential business/personal

Examples:

- staff personal contact information;
- private provider schedules;
- branch financial analytics;
- internal pricing/discount configuration;
- inventory costs;
- operational communications.

Controls:

- role-based access;
- tenant isolation;
- encryption in transit/at rest;
- restricted exports.

## 4.4 Class P3 — Sensitive patient/clinical

Examples:

- patient demographics linked to clinical care;
- medical history;
- dental history;
- odontogram;
- treatment plans;
- clinical notes;
- prescriptions;
- X-rays/photos;
- consent/refusal;
- treatment drawings;
- referral case information;
- appointment data that reveals treatment;
- patient billing linked to treatment.

Controls:

- strict need-to-know access;
- RLS + application authorization;
- audit access and export;
- private object storage;
- no public caching;
- minimal notification content;
- formal retention/disposal;
- incident-response coverage.

## 4.5 Class P4 — Secrets/security material

Examples:

- Supabase service-role/secret keys;
- database credentials;
- R2 credentials;
- Google OAuth refresh tokens;
- SMS provider secrets;
- email provider secrets;
- webhook signing secrets;
- encryption/backup keys;
- recovery codes;
- signing keys.

Controls:

- never sent to browser unless explicitly designed as a publishable key;
- never logged;
- never committed to Git;
- never placed in AI prompts;
- least-privilege access;
- environment-specific secrets;
- rotation capability;
- encrypted storage where persistent per-user tokens are required.

---

# 5. Trust Boundaries

The architecture has several distinct trust zones.

```text
UNTRUSTED INTERNET
      │
      ├── Public website visitor
      ├── Booking client
      ├── Reminder-link recipient
      └── Attackers/bots
      │
      ▼
PUBLIC NEXT.JS ROUTES / PURPOSE-BUILT ENDPOINTS
      │
      │ validated + rate-limited
      ▼
APPLICATION / DOMAIN SERVICES
      │
      ├─────────────── Authenticated EMR users
      │
      ▼
POSTGRESQL / SUPABASE
      │
      ├── RLS / constraints
      ├── audit/outbox
      └── tenant-scoped records
      │
      ├────────→ Cloudflare R2 private objects
      ├────────→ Google Calendar
      ├────────→ SMS provider
      ├────────→ Email provider
      └────────→ Messenger later
```

Rules:

1. Crossing a trust boundary requires authentication/authorization/validation appropriate to the boundary.
2. A user-controlled ID is never proof of ownership or permission.
3. External-service callbacks/webhooks are untrusted until verified.
4. Service-to-service credentials receive only the permissions they require.
5. Public routes are written as if attackers will automate them.

---

# 6. Threat Model

## 6.1 Primary assets

High-value assets include:

- patient identity and contact data;
- medical/dental history;
- odontograms;
- clinical notes;
- treatment plans and drawings;
- signed consent/refusal;
- X-rays/photos/files;
- prescriptions;
- appointment history;
- provider calendars/tokens;
- account credentials;
- billing and payment records;
- organization configuration;
- tenant isolation logic;
- audit logs;
- backups;
- service credentials.

## 6.2 Relevant threat actors/scenarios

The system must account for:

- unauthenticated internet attackers;
- credential-stuffing attackers;
- a stolen staff password;
- lost/stolen clinic laptop or iPad;
- a staff member intentionally looking at records they do not need;
- a receptionist accidentally exporting the wrong patient's record;
- a malicious user from another SaaS tenant;
- an on-call specialist attempting to access unassigned patients;
- compromised third-party integration credentials;
- malicious file uploads;
- dependency/supply-chain compromise;
- accidental administrator deletion;
- coding-agent mistakes;
- database migration errors;
- broken RLS policy after a schema change;
- public booking abuse/noise;
- forged reminder-management links;
- exposed presigned object URLs;
- backup theft;
- ransomware or destructive actions;
- server-side request forgery from file/integration features;
- XSS/CSRF/clickjacking;
- webhook spoofing/replay;
- misconfigured staging/preview deployments.

## 6.3 High-priority abuse cases

Security tests must explicitly cover at least:

1. Tenant A changes a URL/UUID to Tenant B's patient ID.
2. Receptionist calls a clinical endpoint manually despite the UI hiding it.
3. Visiting specialist guesses another patient's ID.
4. Authenticated user changes request `organization_id` to another tenant.
5. Public booking API is used to enumerate whether a named person is a patient.
6. Two online users attempt to hold/book the same slot concurrently.
7. Expired appointment-management token is replayed.
8. A stolen R2 presigned URL is used after its intended period.
9. A `.html`, executable, polyglot, malicious PDF, or fake MIME file is uploaded as a clinical attachment.
10. A service-role key accidentally appears in frontend code.
11. An old employee continues using an active session after offboarding.
12. A user edits a finalized note using direct API calls.
13. A signed document's underlying blob is overwritten.
14. Google OAuth token from Provider A is used to access Provider B's calendar mapping.
15. Preview deployment accidentally points to production database.
16. Error logs contain treatment details or access tokens.
17. Backup file is stored unencrypted in a developer laptop/download folder.

---

# 7. Identity and Authentication

## 7.1 Supabase Auth is the identity provider

Approved baseline:

- Supabase Auth handles credentials, login, password reset, session issuance, session refresh, and MFA factors.
- Application roles/organization/branch/provider memberships remain in application tables.
- `auth.users` is not the staff/clinical authorization model.

## 7.2 No shared accounts

Each person receives their own account.

Forbidden production patterns:

- `reception@gmail.com` shared by all receptionists;
- one dentist login shared with assistants;
- one “admin” password for both branches;
- on-call dentists using another dentist's account.

Why:

- destroys audit attribution;
- prevents proper offboarding;
- increases password sharing;
- makes least privilege impossible.

## 7.3 MFA policy

**Production target: MFA required for every workforce account that can access patient data.**

Preferred second factor:

- authenticator-app TOTP through Supabase MFA.

Do not use SMS as the preferred workforce MFA factor merely because SMS is already used for patient reminders.

Use the Supabase JWT Authenticator Assurance Level (`aal`) to enforce sensitive workflows at `aal2` where appropriate.

At minimum require a recent/valid AAL2 session for:

- owner/admin permission changes;
- adding/removing high-privilege users;
- changing organization security settings;
- connecting/disconnecting high-impact integrations;
- viewing recovery codes;
- exporting a complete patient record;
- patient merge;
- mass export/report export containing patient identity;
- destructive/irreversible operations;
- support impersonation/elevated access if ever implemented.

## 7.4 Password policy

Production password settings should include:

- minimum length at least 12 characters as an application policy target;
- password-manager-friendly rules;
- leaked-password protection when supported by the selected Supabase plan;
- prevent reuse of known compromised passwords where supported;
- no staff sharing;
- secure reset flow;
- reauthentication for password/security changes.

Do **not** force arbitrary frequent password changes solely on a calendar if there is no compromise or policy requirement; focus on strong unique passwords + MFA + compromised-password protection + incident-triggered reset.

## 7.5 Invitation-only staff creation

Public users must not self-register as clinic staff.

Staff onboarding:

```text
Owner/Admin invites email
      ↓
Invite record created with intended organization/role/branch
      ↓
Recipient verifies invitation
      ↓
Account established
      ↓
MFA enrollment required before patient access
      ↓
Membership activated
```

The invitation token must be:

- high entropy;
- purpose-bound;
- expiry-bound;
- single-use;
- stored hashed if application-managed;
- invalidated after acceptance/revocation.

## 7.6 Offboarding and suspension

When a user leaves the clinic or access must be removed:

1. suspend organization membership immediately;
2. terminate/revoke relevant sessions where supported;
3. remove/disable provider calendar access if tied to the clinic relationship;
4. preserve authored clinical records and audit events;
5. do not delete the historical user identity from signed clinical records;
6. rotate shared external secrets if the user knew them;
7. audit the action.

A suspended user should fail authorization even if a still-valid JWT exists; sensitive server actions should verify current membership state, not only JWT existence.

---

# 8. Session Security

## 8.1 Server verification

For Next.js SSR with Supabase:

- use the current supported `@supabase/ssr` pattern;
- refresh sessions through the supported cookie workflow;
- on the server, protect patient data using verified claims/user state rather than blindly trusting raw cookie/session content;
- follow Supabase guidance to use cryptographically verified claims (`getClaims()` in the current SSR guidance) rather than treating `getSession()` as sufficient server-side verification.

## 8.2 Proposed production session policy

Initial recommendation for clinic workforce accounts:

- inactivity timeout: **30 minutes**;
- absolute/time-boxed session: **12 hours**;
- reauthentication/AAL2 for high-risk actions;
- “lock screen” UX before destructive clinical loss where appropriate.

These are architecture defaults, not statutory values. Validate with clinic workflow and available Supabase plan features.

If strict inactivity/time-box controls require a paid Supabase feature, treat that as a production-cost requirement rather than silently dropping the control.

## 8.3 Shared clinic devices

Because clinic desktops/iPads may be shared physically:

- users still sign in individually;
- provide fast sign-out/lock workflow;
- do not offer “remember me forever” on shared clinical devices;
- avoid browser password sharing;
- configure OS device lock;
- clinic-managed devices should use full-disk encryption and current OS/security updates;
- lost organization-owned mobile devices should have remote lock/wipe capability where feasible, consistent with NPC security guidance.

## 8.4 Sensitive reauthentication

For especially dangerous operations, validate that the session is still active and require recent MFA/reauthentication rather than relying only on a long-lived client state.

Examples:

- change MFA factors;
- change password/email;
- patient merge;
- export entire patient record;
- create platform-level admin;
- rotate integration credentials;
- mass delete/archive action.

---

# 9. Authorization Model

## 9.1 RBAC + contextual rules

Use role-based permissions plus contextual checks.

Role answers:

> “What kind of work may this person generally perform?”

Context answers:

> “May this person perform that work on this organization/branch/patient/case right now?”

Example:

```text
Role: VISITING_SPECIALIST
Permission: patient.clinical.read
Context: appointment assignment exists for this provider + patient
Result: ALLOW only for assigned case
```

## 9.2 Do not equate owner with clinician

Future SaaS customers may have non-dentist owners/managers.

Therefore:

- `OWNER` grants organization administration;
- `DENTIST` / provider linkage grants clinical permissions;
- a dentist-owner can possess both roles;
- a non-clinical business owner should not automatically gain clinical edit authority merely because they own the subscription.

This is an important future-SaaS safety rule.

## 9.3 Baseline permission domains

Use granular permissions such as:

```text
organization.read
organization.manage
branch.read
branch.manage
user.invite
user.manage
role.manage
provider.read
provider.manage
patient.demographics.read
patient.demographics.write
patient.clinical.read
patient.clinical.write
patient.clinical.finalize
appointment.read
appointment.write
appointment.override_conflict
billing.read
billing.write
payment.record
inventory.read
inventory.write
inventory.adjust
inventory.transfer
file.read
file.upload
file.export
document.generate
document.sign
patient.export_full
patient.merge
integration.google.manage
integration.messaging.manage
audit.read
security.manage
analytics.read
```

## 9.4 Baseline role matrix

### Owner / Organization Administrator

Allowed by default:

- organization/branch configuration;
- memberships/roles;
- provider administration;
- integrations;
- billing/analytics configuration;
- audit/security administration.

Clinical access:

- **not automatically granted merely by owner status**;
- owner who is also a dentist receives clinical permissions via dentist/provider role.

### Clinic Manager / Administrator

Allowed:

- staff management as delegated;
- branch operations;
- schedules;
- providers/resources;
- operational analytics;
- configuration permitted by owner.

Clinical access:

- minimum necessary; no automatic clinical write.

### Regular Dentist

Allowed:

- organization-wide clinical read under current clinic requirement for continuity of care;
- clinical write for care workflows;
- odontogram/treatment plan/notes/prescriptions as permitted;
- relevant files;
- own/provider schedule.

Important:

- authorship/finalization rules still apply;
- “can read” does not mean “can silently rewrite another provider's finalized note.”

### Receptionist

Allowed:

- patient demographics/contact;
- duplicate check;
- appointment scheduling;
- public booking review;
- reminder/communication status;
- acquisition/referral intake;
- limited billing/payment depending clinic policy;
- administrative document generation where appropriate.

Denied by default:

- unrestricted clinical notes;
- detailed medical history editing;
- odontogram clinical editing;
- prescriptions;
- changing clinical finalization;
- mass clinical export.

### Dental Assistant

Allowed:

- schedule and chair context;
- patient identity needed for care;
- limited clinical workflow information;
- assigned preparation/workflow tasks.

Clinical editing is explicitly defined by clinic policy rather than assumed.

### Visiting / On-call Specialist

Default:

- assigned appointments/cases only;
- relevant patient clinical data for assigned case;
- own notes/treatment contribution;
- no organization-wide patient browse;
- no unrelated billing/security/administration.

### Billing role

Allowed:

- charges;
- payments;
- statements;
- financial reports needed for work.

Not automatically allowed:

- unrelated medical/dental history.

## 9.5 Break-glass access

A future “emergency access” feature should not simply bypass authorization invisibly.

If implemented:

- require explicit “Emergency access” action;
- require reason;
- require MFA/re-authentication;
- time-limit elevated access;
- log prominently;
- notify/security-review later;
- never permit cross-tenant access.

Do not implement break-glass in MVP unless a real clinical requirement exists.

---

# 10. Tenant and Branch Isolation

## 10.1 Organization is the tenant boundary

Current clinic:

```text
Organization SmileLab
├── Branch A
└── Branch B
```

Future SaaS:

```text
Platform
├── Organization A
├── Organization B
└── Organization C
```

**Organization boundaries are security boundaries. Branch boundaries are operational/access boundaries within the same tenant.**

## 10.2 Tenant isolation must exist below the UI

Do not rely on:

```ts
where: { organizationId: currentOrg }
```

sprinkled manually throughout application code as the only protection.

Use multiple layers:

1. server-derived organization context;
2. application authorization;
3. tenant-aware foreign keys/relationships;
4. PostgreSQL RLS for exposed tables;
5. tenant-scoped indexes/queries;
6. tests that attempt cross-tenant access.

## 10.3 Never trust tenant IDs supplied by clients

If a request contains:

```json
{ "organization_id": "..." }
```

the server must not conclude that the caller belongs to that tenant.

Derive current organization membership from authenticated user state and validated membership.

## 10.4 Branch rules

Patients are organization-level and shared across the two branches.

Operational records remain branch-attributed:

- appointment;
- encounter;
- resource reservation;
- inventory movement;
- charge origin;
- payment receipt location;
- issued document branch where relevant.

Branch access policies should determine which staff can perform branch operations, while regular dentists can retain organization-wide clinical continuity according to approved policy.

## 10.5 New branch creation

Adding Branch 3 must not weaken security.

New branch workflow:

1. owner/admin with `branch.manage` + MFA creates branch;
2. branch begins with no staff access except authorized organization admins;
3. resources/inventory/schedules are explicitly configured;
4. branch memberships are assigned;
5. online booking remains disabled until public settings are reviewed;
6. security-relevant action is audited.

Do not automatically copy every user's branch access to a new branch.

---

# 11. PostgreSQL Row Level Security

## 11.1 RLS is defense in depth and mandatory for exposed schemas

Supabase requires RLS on tables in exposed schemas to securely use its Data API.

Project rule:

> Every tenant-owned table exposed through Supabase Data API must have RLS enabled before production data exists.

A migration that creates an exposed tenant table without RLS should fail CI/security review.

## 11.2 Service-role keys

Supabase service-role/secret credentials can bypass RLS and must **never** be exposed to browsers, customers, public code, screenshots, or AI prompts.

Use service-role access only for narrowly defined server/background administrative operations.

Normal authenticated user requests should prefer user-context/RLS-scoped database access when practical.

## 11.3 RLS helper functions

Centralize membership checks in controlled database functions where useful.

Examples conceptually:

```text
is_active_org_member(user_id, organization_id)
has_permission(user_id, organization_id, permission)
has_branch_access(user_id, branch_id)
is_assigned_provider(user_id, patient_id / appointment_id)
has_aal2()
```

Security requirements for helper functions:

- place sensitive helpers in non-exposed schema;
- use `SECURITY DEFINER` only when necessary;
- set a fixed safe `search_path`;
- grant execute only to intended roles;
- test every helper against privilege escalation;
- do not accept arbitrary organization IDs as authority without checking membership.

## 11.4 `WITH CHECK` matters

RLS must protect **new values**, not only visibility of existing rows.

Example:

A user who can update an appointment cannot change its `organization_id` or `branch_id` to an unauthorized one.

Update policies require appropriate `USING` and `WITH CHECK` semantics.

## 11.5 High-risk RLS tests

Automated pgTAP/integration tests should include:

- Tenant A cannot SELECT Tenant B patient.
- Tenant A cannot INSERT row with Tenant B `organization_id`.
- Tenant A cannot UPDATE row into Tenant B.
- Tenant A cannot DELETE Tenant B.

- branch-limited receptionist cannot mutate another branch where not allowed.
- regular dentist has intended organization-wide clinical read.
- visiting specialist sees assigned patient but not unassigned patient.
- suspended membership sees no protected data.
- user without clinical role cannot query clinical table directly.
- `anon` sees no patient table.
- publishable Supabase key alone returns no clinical data.

## 11.6 Foundation administrative mutation boundary

**Phase 2 approval note (2026-08-19):** ADR-019 and the complete Phase 2 plan are
independently reviewed and explicitly approved. The bounded exception below is
authorized for P2-01 implementation but does not become active database behavior
until its reviewed additive migration is applied. Until then, the accepted Phase
1 full permission-superset rule continues unchanged.

High-impact foundation administration must not be exposed as ordinary
authenticated table writes. Direct authenticated writes are revoked for
`organizations`, `branches`, `organization_members`, `roles`,
`role_permissions`, `branch_memberships`, and `member_roles`. Supported
foundation operations use narrowly scoped user-context PostgreSQL functions
that:

- derive the actor only from `auth.uid()`;
- require an `aal2` JWT;
- validate active tenant membership and the operation-specific permission;
- serialize authorization mutations per organization where concurrent changes
  could invalidate a delegation decision;
- reject self-role mutation/assignment and cross-tenant targets;
- prevent a role manager from granting a permission the actor does not already
  hold organization-wide, except for ADR-019's AAL2-gated exact allowlist for
  delegating the fixed global `DENTIST`/`RECEPTIONIST` system roles when the only
  permissions missing from an organization-wide `security.manage` actor are
  `patient.demographics.read/write`;
- require `security.manage` in addition to `role.manage` when delegating
  `role.manage` or `security.manage`, or when changing a member who already has
  either sensitive permission through an organization-wide role assignment;
- treat both grants and revocations against such a sensitive member as
  security administration, even when the individual role being added or
  removed is otherwise ordinary;
- write exactly one sanitized success audit event in the same transaction as
  the mutation.

Authenticated direct writes to these administrative tables remain revoked even
when the caller otherwise has the related RBAC permission. RLS remains enabled
for reads and as defense in depth; it is not used as a substitute for the
transactional audit boundary. Service-role access is not granted to the
user-context functions. Existing narrowly scoped service-only workforce
invitation provisioning remains a separate trusted workflow. Its untrusted
Server Action entry point must verify a current AAL2 session before any
service-role invitation operation begins. Service-role execution does not
bypass delegation authorization: the workflow uses the recorded original
inviter, validates tenant and role scope, and normally requires the inviter to
hold every permission in the invited role. ADR-019 permits only a
`security.manage` inviter to delegate the fixed global `DENTIST` or
`RECEPTIONIST` role when every missing permission is exactly one of the two
patient-demographics permissions; custom roles and any additional missing
permission remain denied. Delegating a role containing `role.manage` or
`security.manage` still additionally requires `security.manage`. Before final
provisioning creates membership, branch-membership, or role-assignment rows,
the function acquires the organization authorization lock and rechecks the
inviter's current authority and the role's live permission set in the same
transaction.

The ADR-019 exception never grants patient access to the inviter. It retains
AAL2 at the invitation Server Action and user-context assignment RPC,
anti-self-assignment (including no invitation to the actor's verified email),
tenant/branch validation, narrow fixed-role and missing-permission allowlists,
and the existing atomic sanitized audit event. Invitation option listing,
invitation validation, preparation/finalization, and direct role assignment use
one shared database predicate so their authorization decisions cannot drift.

Administrative operations without an operation-specific transactional function
remain fail-closed until that boundary and its audit tests are implemented.

Custom-role permission delegation remains a subset operation, and every role
outside ADR-019's exact fixed-role exception remains under the same rule. A
caller cannot change any role currently assigned to themselves or combine roles
by assigning a new role to themselves. Except for that exact exception, the
caller cannot grant a role or permission containing authority they do not
already possess. These invariants must be checked again inside the database
transaction, not inferred from UI state. Workforce invitations normally follow
the same permission-subset rule for built-in and custom roles, including
`OWNER`; ADR-019 changes only the two fixed roles and two missing permissions
listed above. Sensitive permissions are derived from the role's permission
definitions rather than trusted role-name metadata.

---

# 12. Clinical Record Integrity

## 12.1 Clinical records are not ordinary CRUD

Important clinical records need state transitions and versioning.

Examples:

- draft note → finalized note;
- treatment plan draft → presented → accepted/declined → superseded;
- treatment discussion → acknowledged;
- consent → signed;
- prescription → issued;
- odontogram state/history → recorded treatment changes.

## 12.2 Finalized notes

After finalization:

- original content is immutable;
- corrections create an amendment;
- amendment references original;
- author/reviewer/time/reason are recorded;
- UI shows the current effective record without hiding historical content.

## 12.3 Treatment plans and drawings

A treatment drawing linked to a formally acknowledged treatment plan should have:

- editable working source while draft;
- immutable rendered snapshot at acknowledgment/signature;
- document hash;
- signed/acknowledged timestamp;
- actor/provider;
- patient/guardian acknowledgment metadata.

Do not claim that a drawing by itself proves informed consent. It is supporting documentation of a treatment discussion.

## 12.4 Odontogram

`react-advanced-odontogram` is the selected prototype renderer, but it must not own clinical truth.

Security/data-integrity rules:

- canonical tooth/surface/periodontal data is stored in our schema;
- browser output is validated server-side;
- client cannot send arbitrary unsupported status values;
- changes are attributed to provider/user;
- clinically significant history is retained;
- library-specific JSON is not the sole record.

Production dependency strategy:

- controlled fork: `https://github.com/Ditherys/React-Odontogram-Modul`;
- upstream source: `https://github.com/ZoliQua/React-Odontogram-Modul`;
- validate the forked renderer with the dentist;
- do not treat the existence of a fork as production approval; the prototype/security/clinical gate still applies;
- pin an approved fork tag/commit or controlled versioned package plus lockfile; never follow a moving branch in production;
- merge upstream changes only after manual review and regression testing;
- preserve the upstream MIT notice;
- application adapter separates package data from canonical clinical model.

---

# 13. Public Website and Booking Security

## 13.1 Public website is untrusted input

Public booking is deliberately exposed to the internet and should be designed for abuse resistance.

Public APIs may expose only:

- published branches;
- published providers;
- published services;
- safe appointment availability;
- booking-request submission;
- secure appointment-management actions.

They must not expose:

- patient search;
- internal patient IDs;
- clinical data;
- raw provider personal calendar details;
- staff-only resource notes;
- private treatment prices not intended for public display.

## 13.2 Existing-patient matching must not become enumeration

The booking website may use name + birthday and/or contact data to help match an existing patient, but responses should not reveal to arbitrary visitors:

> “Yes, Maria Santos born March 3 is already a patient here.”

Safer behavior:

- collect provided identity;
- server attempts match;
- continue with neutral messaging;
- staff resolves ambiguous duplicates during review;
- do not return patient record details.

## 13.3 Rate limiting and bot controls

Public endpoints need layered anti-abuse controls:

- per-IP and per-route rate limits;
- organization/branch-level thresholds;
- stricter limits for booking submission and token verification;
- request-body size limits;
- bot challenge (e.g., Turnstile or equivalent) when abuse risk justifies it;
- monitoring for booking spam;
- safe generic errors.

Do not block legitimate patients solely because multiple family members share one household IP; limits must be practical.

## 13.4 Five-minute holds

Appointment holds:

- generated server-side;
- expire after approximately 5 minutes;
- tied to branch/provider/resource/time;
- protected from concurrent conflicting reservations at database level;
- not renewed indefinitely by client polling;
- cleared by expiration/background cleanup.

## 13.5 Appointment-management links

Links sent to patients for Confirm / Cancel / Request Reschedule should use an opaque high-entropy token.

Requirements:

- do not put patient ID + predictable secret in URL;
- store only token hash when application-managed;
- scope token to one appointment and allowed action set;
- expiry;
- revoke/rotate when appointment materially changes;
- prevent replay after destructive use where appropriate;
- rate-limit attempts;
- audit successful actions;
- show only minimal patient/appointment details.

A token is a bearer credential. Anyone who receives the link can use it until invalidated, so keep scope narrow.

---

# 14. Frontend and Browser Security

## 14.1 UI authorization is not security

Role-aware navigation improves UX but is never a permission boundary.

Every protected action is rechecked server-side/database-side.

## 14.2 XSS protection

Rules:

- rely on React's escaping rather than rendering raw HTML;
- prohibit `dangerouslySetInnerHTML` for patient-controlled clinical content unless a reviewed sanitizer is used;
- sanitize any future rich-text editor output;
- never render uploaded SVG/HTML as trusted inline clinical content without sanitization;
- prevent untrusted URLs from being executed as scripts.

## 14.3 Content Security Policy

Deploy a Content Security Policy as defense in depth, ideally nonce/hash based where compatible with Next.js and required libraries.

Policy should intentionally enumerate:

- self scripts/styles;
- Supabase endpoints;
- R2 endpoints used for signed object transfer;
- Google integrations where browser interaction requires them;
- approved analytics/monitoring only if used.

Avoid permissive `*` sources and unnecessary `unsafe-eval` in production.

## 14.4 Browser security headers

Production should configure/verify:

- `Content-Security-Policy`;
- HSTS after HTTPS-only configuration is validated;
- `X-Content-Type-Options: nosniff`;
- clickjacking protection via CSP `frame-ancestors` (and legacy header if desired);
- `Referrer-Policy`;
- suitable `Permissions-Policy`;
- controlled CORS.

## 14.5 CSRF

For cookie-authenticated state-changing operations:

- use SameSite cookie protection appropriate to the auth flow;
- validate Origin/Host for sensitive mutating endpoints where appropriate;
- use framework/route patterns that do not accept arbitrary cross-site mutations;
- add explicit anti-CSRF tokens for flows where cookie semantics alone are insufficient.

## 14.6 Caching

Never allow shared/public caching of authenticated patient pages or protected API responses.

Set appropriate cache-control/no-store behavior for:

- patient record pages;
- PDFs with patient data;
- presigned URL responses;
- clinical APIs;
- appointment-management pages.

Public website content can be cached separately.

---

# 15. File, Photo, X-ray, and Document Security

## 15.1 Storage and transformation selection

Private patient files use **Cloudflare R2 private buckets**. Project-controlled public website media may also use R2.

Image optimization/derivative generation uses **Cloudflare Workers + Cloudflare Images**. Cloudinary is not a default project dependency.

For clinical images, the uploaded original is preserved unchanged. Optimized derivatives are secondary representations and cannot replace the sole clinical source copy.

## 15.2 R2 is private by default in our architecture

Clinical buckets must not be exposed through public custom domains.

Access flow:

```text
Authenticated user requests file
      ↓
Server verifies organization + role + patient/file permission
      ↓
Audit access if required
      ↓
Generate short-lived presigned GET
      ↓
Browser downloads/views object
```

Uploads:

```text
Authorized user requests upload
      ↓
Server validates patient/context + intended content class
      ↓
Generate random object key + short-lived presigned PUT
      ↓
Client uploads
      ↓
Server confirms metadata/hash/scan status
      ↓
File becomes available after validation
```

## 15.3 Private image transformation authorization

The image-processing layer does not create a new authorization boundary or bypass existing access rules.

```text
Authenticated user requests image variant
      ↓
Server/Worker verifies organization + role + patient/file permission
      ↓
Resolve approved semantic variant
      ↓
Read private original/derivative from R2
      ↓
If transformation is required, use Cloudflare Images binding
      ↓
Return/cache only the authorized result
```

Rules:

- never expose a clinical R2 bucket through a public custom domain merely to make transformations easier;
- never accept an arbitrary client-supplied R2 object key as authorization proof;
- a transformation URL/token must not grant broader or longer access than the source authorization permits;
- source object keys, signed URLs, and internal transformation credentials are sensitive;
- derivative objects inherit the sensitivity/tenant boundary of the source unless deliberately classified as public media;
- cache keys for private output must not cause cross-user/cross-tenant data mixing;
- public marketing assets and private clinical assets must use clearly separate routes/bucket or prefix/trust-zone policy;
- derivative generation is idempotent and should not permit resource-exhaustion through arbitrary widths/formats;
- permit only predefined variants for private clinical media;
- preserve source hashes/metadata so clinical originals remain independently verifiable.

For asynchronous generation, R2 object-create notifications may enqueue work. Queue consumers must validate event/source context, avoid recursive derivative-trigger loops, and write only to approved derivative prefixes.

## 15.4 Presigned URL policy

Cloudflare describes presigned URLs as bearer tokens. Anyone holding the URL can perform the signed operation until expiry.

Initial policy:

- clinical GET URLs: target ~5-minute expiry;
- upload URLs: target 5–10 minutes depending file size/workflow;
- one object + one operation;
- never send a long-lived presigned URL by email/SMS;
- do not store it in logs/analytics;
- generate after every authorization check.

## 15.5 Object keys

Never use predictable paths such as:

```text
/patients/Maria-Santos/root-canal.jpg
```

Use opaque IDs:

```text
org/<uuid>/clinical/<uuid>/<uuid>
```

Original human filename may be stored as protected metadata for display, but not used as an authorization mechanism.

## 15.6 Upload validation

Follow an allowlist.

MVP clinical upload candidates:

- JPEG;
- PNG;
- WebP if needed;
- PDF;
- other specific formats only after explicit use case.

Heavy CBCT/DICOM storage is intentionally excluded from MVP until a dedicated imaging strategy exists.

For each upload:

- enforce maximum size by type/use case;
- verify extension and magic bytes/file signature;
- never trust browser `Content-Type` alone;
- randomize object key;
- reject executable/HTML/script formats by default;
- run malware scanning/sandboxing before broad download where practical;
- quarantine unverified uploads;
- protect upload endpoints from CSRF/abuse;
- do not execute uploaded content server-side.

## 15.7 Image metadata

Clinical originals may contain metadata that could be useful or sensitive.

Recommended approach:

- preserve original in private storage when clinically required;
- generate safe preview/thumbnail separately;
- strip unnecessary geolocation/device metadata from derived previews;
- never expose EXIF metadata through public URLs by accident.

## 15.8 Signed/issued document immutability

Use a separate immutable logical path/prefix or bucket policy for:

- signed consents;
- acknowledged treatment-plan packet snapshots;
- issued prescription PDF snapshots where retention is required;
- complete patient-record exports retained by policy;
- audit archives;
- backup snapshots.

Store SHA-256 (or current approved cryptographic hash) of finalized object in PostgreSQL.

Cloudflare R2 Bucket Locks may be used to prevent deletion/overwrite for defined retention periods. Do not turn on indefinite lock blindly; configure retention based on approved policy because a lock can prevent legitimate lifecycle deletion.

## 15.9 Printing and PDF export are data disclosures

Every “Print” / “Download PDF” action involving patient records should be treated as export.

Controls:

- role/permission check;
- explicit selected sections for patient-record export;
- avoid defaulting to “everything”;
- audit who generated it and for which patient;
- include generated timestamp/document ID;
- optional confidential footer/watermark;
- do not leave server-generated PDFs at a permanent public URL;
- warn staff that downloaded local copies leave the controlled application environment.

---

# 16. Google Calendar Security

## 16.1 Calendar is an integration, not the EMR

PostgreSQL remains authoritative for appointments.

Calendar outage or revoked access must not delete/invalidly alter the EMR appointment.

## 16.2 Separate provider connections

Each dentist/provider connects their own selected Google Work Calendar.

Connection belongs to:

- organization;
- provider;
- Google identity/account reference;
- selected work calendar ID;
- granted scopes;
- token metadata.

Do not use one clinic-wide Google credential to impersonate every dentist unless a future Google Workspace/domain model deliberately supports it.

## 16.3 Least-privilege OAuth scopes

Google recommends the narrowest scopes required.

Candidate scope set should be evaluated during implementation, likely combining narrowly scoped capabilities for:

- reading calendar list so provider can choose Work Calendar;
- free/busy availability;
- creating/updating/deleting EMR-managed events on the provider's owned calendar.

Avoid requesting the broad full-calendar scope if narrower scopes satisfy the product.

Public OAuth verification requirements must be planned before SaaS launch if selected scopes require Google verification.

## 16.4 Refresh-token security

Google refresh tokens are P4 secrets.

Requirements:

- never browser-readable;
- never logged;
- stored encrypted (e.g., Supabase Vault or an application encryption strategy with keys outside ordinary application tables);
- provider/organization binding validated on every use;
- revoke/delete on disconnect where feasible;
- access restricted to calendar integration worker/service;
- rotation/reconnect workflow supported.

## 16.5 Free/busy privacy

When the dentist authorizes personal/work calendars for conflict checking, the scheduling engine should consume **busy time ranges**, not event descriptions.

Receptionist view:

```text
1:00–2:00 PM — Unavailable
```

Not:

```text
1:00–2:00 PM — Personal lawyer appointment
```

## 16.6 Calendar event detail policy

Current tenant preference is:

```text
Maria S. — Cleaning
```

This is a clinic configuration, not an immutable platform default.

Because procedure names and patient initials may still reveal health-related context, production launch must confirm this setting during the PIA/privacy review.

The platform must preserve privacy modes:

- High Privacy: `Dental Appointment`
- Balanced: `Cleaning`
- Detailed: `Maria S. — Cleaning`

The clinic can choose Detailed, but switching to a less revealing mode must remain possible without code changes.

---

# 17. SMS, Email, Messenger, and Patient Communications

## 17.1 Minimum necessary message content

Do not send detailed diagnoses, medical histories, X-ray findings, prescriptions, or extensive treatment notes through ordinary reminder messages.

Safer reminder example:

```text
SmileLab Dental Center: You have an appointment on Aug 20 at 2:00 PM. Use this secure link to confirm, cancel, or request a new time.
```

Procedure detail can be configurable when clinically/operationally justified, but minimal messaging is preferred.

## 17.2 Channel preference

Current product direction:

1. Messenger primary (later integration; manual in MVP)
2. SMS fallback
3. Email additional

MVP website booking should not be blocked while Messenger API automation is postponed.

## 17.3 Provider adapters

Notification providers sit behind an interface:

```text
NotificationService
├── sendMessenger()
├── sendSMS()
└── sendEmail()
```

Business logic does not contain vendor API secrets.

## 17.4 Communication logs

Log:

- intended recipient patient ID;
- channel;
- template/type;
- appointment/reference;
- sent time;
- provider message ID;
- delivery status;
- failure/retry status.

Avoid storing complete message bodies when unnecessary, especially if templates plus structured parameters can reconstruct what was sent.

Never log access tokens/provider secrets.

## 17.5 Marketing versus care communications

Maintain separate preferences/consent where applicable:

- appointment/care reminders;
- recalls/follow-ups;
- service announcements;
- promotional marketing.

A patient opting out of marketing should not automatically suppress a clinically necessary operational message without policy review.

---

# 18. Secrets and Key Management

## 18.1 Never place secrets in code

Forbidden:

- committed `.env` files;
- secrets in GitHub issues;
- keys in screenshots;
- keys in `CLAUDE.md` / `AGENTS.md`;
- tokens pasted into Claude/Codex prompts;
- service-role keys in `NEXT_PUBLIC_*` variables.

## 18.2 Environment separation

Production, preview/staging, and development use separate credentials.

Strong recommendation:

- separate Supabase Cloud projects for development/test/staging and production;
- an optional disposable local Supabase stack may contain deterministic synthetic fixtures only; it is never a backup, staging, or production-data environment;
- guarded Supabase Cloud TEST verification remains mandatory before database-bearing work is accepted;
- cloud development/test projects use synthetic or formally de-identified data only;
- separate R2 buckets/credentials;
- separate OAuth callback/environment registrations where practical;
- test SMS/email provider keys in non-prod;
- production secrets not injected into generic Vercel preview deployments.

Vercel sensitive variables should be used for production secrets where appropriate, and production-only resource connections should be enabled when available.

## 18.3 Supabase publishable vs service credentials

The browser may receive only credentials explicitly documented as publishable/public.

Service-role/secret keys remain server-side and bypass RLS capability makes them high-risk.

## 18.4 Per-user OAuth secrets

Per-provider Google refresh tokens cannot live in Vercel environment variables because they are dynamic per user.

Use encrypted database-backed secret storage, such as Supabase Vault or equivalent controlled encryption architecture.

Access to decrypted secret views/functions must be tightly restricted.

## 18.5 Rotation

Maintain procedures to rotate:

- Supabase database/service credentials;
- R2 API tokens;
- SMS provider keys;
- email provider keys;
- webhook secrets;
- backup encryption keys;
- Google client secret if compromised.

Every integration record should support a disconnected/reconnect state without damaging historical appointment mappings.

---

# 19. Encryption

## 19.1 In transit

All production browser/API traffic must use HTTPS/TLS.

R2 transfers use TLS. Google/Supabase/provider API calls use HTTPS.

Do not support plaintext HTTP for authenticated/private surfaces.

## 19.2 At rest

Cloudflare R2 currently encrypts objects at rest with AES-256 and in transit with TLS.

Supabase's managed infrastructure provides underlying database encryption controls; nonetheless, **provider-managed encryption at rest does not replace application authorization**.

A stolen valid account may still read encrypted-at-rest data through the application if permissions are wrong.

## 19.3 Application-level encryption

Use additional encrypted secret storage for:

- OAuth refresh tokens;
- API credentials persisted in database;
- other P4 values.

Do not blindly encrypt every patient column independently in MVP because that can break search/reporting and create unmanaged key complexity. Base the need for field-level encryption on the PIA/threat model.

## 19.4 Backup encryption

Off-site logical database dumps contain sensitive patient information and must be encrypted before/while stored outside the database provider.

Backup encryption key must be stored separately from the backup object and available to at least two authorized recovery custodians/processes so loss of one person does not destroy recoverability.

---

# 20. Audit Logging

## 20.1 Audit log is security infrastructure

The audit log must not be an ordinary user-editable notes table.

Normal application users cannot:

- edit past audit events;
- delete audit events;
- fabricate another actor's identity.

## 20.2 Required event categories

### Authentication/security

- login success/failure where available;
- MFA enrollment/removal;
- password/security change;
- session revocation;
- account suspension/reactivation;
- suspicious rate-limit/security event.

### Authorization/admin

- user invitation;
- role assignment/removal;
- branch membership change;
- permission change;
- new branch creation;
- integration configuration change.

### Patient/clinical

- patient record opened (subject to volume/performance policy);
- demographics changed;
- medical history changed;
- clinical note draft/finalize/amend;
- odontogram modification;
- treatment plan presentation/acceptance/refusal;
- treatment drawing acknowledgment;
- prescription/document issue;
- consent/refusal signature;
- patient merge.

### Files/documents

- upload;
- download/view of sensitive object;
- full-record export;
- PDF generation;
- print/export action where capture is feasible;
- signed document creation/void/supersession.

### Scheduling

- appointment create/reschedule/cancel/no-show;
- provider reassignment;
- manual conflict override;
- specialist acceptance;
- online booking conversion.

### Billing/inventory

- charge create/void;
- payment record/refund/adjustment;
- inventory adjustment;
- branch transfer;
- stock write-off.

### Integrations

- Google connect/disconnect;
- calendar sync failure/recovery;
- bulk communication send;
- provider credential rotation.

## 20.3 Audit event shape

Suggested fields:

```text
id
occurred_at
organization_id
branch_id nullable
actor_user_id nullable
actor_provider_id nullable
actor_type USER | SYSTEM | PUBLIC_TOKEN | SERVICE
session_id nullable
action_code
target_type
target_id
patient_id nullable
result SUCCESS | DENIED | FAILED
reason_code nullable
source_ip / security network metadata as approved
user_agent/device metadata as approved
request_id / trace_id
metadata_json (carefully redacted)
```

Do not put full clinical note text or secrets into audit metadata.

## 20.4 Denied actions matter

Log meaningful authorization failures that may indicate abuse, while avoiding log flooding from harmless public bots.

Examples:

- repeated cross-tenant access attempts;
- repeated patient-ID enumeration;
- invalid/expired appointment token attempts;
- unauthorized full-record export;
- permission-change attempt by non-admin.

## 20.5 Retention and archive

NPC Circular 2023-06 requires deliberate log retention, longer retention for security/incident logs where appropriate, and backup/archive mechanisms.

Set explicit retention categories before production.

Consider periodically archiving security/audit logs into an R2 prefix with Bucket Lock or other tamper-resistant control, based on approved retention policy.

---

# 21. Application Logging and Error Handling

Audit logs and application logs are different.

## 21.1 Application logs must not become a shadow patient database

Do not log:

- full request bodies for clinical APIs;
- treatment notes;
- passwords;
- access/refresh tokens;
- Google OAuth tokens;
- signed URLs;
- full SMS/email bodies when sensitive;
- full patient export payloads.

Prefer:

```text
request_id
route
action
organization_id
user_id
patient_id (opaque UUID if needed)
status_code
error_code
duration
```

## 21.2 Error messages

Public errors:

- generic;
- do not reveal database details;
- do not confirm existence of patients/accounts unnecessarily.

Internal logs:

- enough diagnostic context;
- no secrets or unnecessarily sensitive payloads.

---

# 22. Backups, Disaster Recovery, and Business Continuity

## 22.1 Backup architecture is layered

Do not implement a button that simply downloads the entire clinic database and patient file archive to a receptionist laptop every day.

Recommended layers:

### Layer 1 — Supabase managed database backup

Use a paid production plan with managed daily backups at minimum.

For tighter recovery requirements, evaluate Supabase Point-in-Time Recovery (PITR). Current Supabase documentation describes PITR with WAL backups and a worst-case RPO around two minutes when enabled.

### Layer 2 — Independent encrypted logical database backup

Periodically create a logical dump using supported Supabase/Postgres tooling.

Then:

- encrypt it;
- upload to a dedicated off-site backup bucket/account/prefix;
- use credentials separate from ordinary application runtime credentials;
- retain according to approved policy;
- do not routinely download to staff machines.

### Layer 3 — R2 clinical objects

Database backup does **not** protect the actual R2 clinical objects.

Protect objects using:

- private bucket;
- object/version retention strategy;
- separate backup/replication process if required by PIA;
- Bucket Lock for immutable classes/backups where appropriate;
- inventory/hash records to detect missing objects.

### Layer 4 — Configuration recovery

Document/recover non-database configuration:

- Vercel project settings/environment variable names;
- Supabase Auth settings;
- API keys/rotation procedures;
- Google OAuth configuration;
- R2 bucket configuration;
- DNS/domain;
- cron/automation configuration;
- third-party sender identities.

## 22.2 Suggested recovery targets

Prototype/pilot targets should be documented and tightened before commercial SaaS.

Initial production objective:

- critical structured-data RPO: as low as commercially practical; use PITR if the clinic risk assessment requires it;
- restore operations documented;
- RTO target explicitly agreed with clinic rather than assumed.

Do not promise an SLA before measuring restore time.

## 22.3 Restore testing

A backup that has never been restored is not proven.

At least quarterly in production, test a restoration into an isolated environment using synthetic/test verification procedures.

Validate:

- schema;
- patients/counts;
- auth records as intended;
- RLS/policies;
- object metadata;
- file-object availability;
- integrations remain disabled in restored test environment so reminders are not accidentally sent;
- Vault/encrypted secrets recovery behavior;
- audit history.

## 22.4 Backup access

Backup access is limited to designated technical/security administrators.

Clinic receptionist/dentist accounts do not receive raw database backup credentials simply because they can use the EMR.

## 22.5 Business continuity

Document clinic behavior during outage:

- how new appointments are temporarily recorded;
- how urgent clinical data is accessed if the service is unavailable;
- how temporary paper notes are reconciled later;
- who declares outage/recovery;
- how communication failures are handled;
- how data entered during degraded mode is reconciled.

MVP does not require a fully offline EMR, but graceful failure must prevent silent data loss.

---

# 23. Device, Printing, and Local-Data Security

## 23.1 Clinic endpoint baseline

Production clinic-owned devices should have:

- supported OS/browser;
- automatic security updates;
- disk encryption;
- screen lock;
- malware/endpoint protection appropriate to clinic policy;
- non-admin everyday user accounts where practical;
- remote wipe/management for organization-owned mobile devices where feasible.

## 23.2 Printing

Printed patient data becomes physical sensitive information.

Software can help by:

- printing only selected sections;
- adding confidential footer;
- showing patient/document identity clearly to reduce mix-ups;
- logging generation;
- avoiding browser auto-download when direct print is enough.

Clinic operational policy must cover:

- printer location;
- immediate collection of printouts;
- secure storage;
- shredding/disposal;
- accidental printouts.

## 23.3 Downloads

Where practical, provide view/print without encouraging permanent local downloads.

When a download is needed:

- permission check;
- audit;
- secure short-lived delivery;
- staff awareness that local file is outside central access control.

## 23.4 USB/removable media

NPC Circular 2023-06 specifically calls for regulated use of removable media and encryption when such transfer is unavoidable/necessary.

Product policy recommendation:

- do not make “export to USB” a primary workflow;
- if clinic exports to removable media, use encrypted storage and clinic policy.

---

# 24. Background Jobs and Automation Security

## 24.1 Jobs are privileged actors

Reminder workers, calendar sync, backup jobs, and document-generation jobs may perform actions without an interactive user.

Represent them explicitly as system actors.

## 24.2 Least privilege for workers

A reminder worker should not need permission to modify clinical notes.

A backup job should not need to send SMS.

Where possible:

- separate service credentials/roles;
- scope database functions;
- restrict network/provider permissions;
- no universal service-role key copied into every worker.

## 24.3 Durable jobs

Jobs are persisted in Postgres/queue, not in-memory timers.

Each job should support:

- idempotency key;
- retry count;
- next attempt;
- failure reason;
- dead-letter/manual review state;
- organization scope;
- related appointment/patient IDs;
- audit/communication record.

## 24.4 Idempotency

External actions can be retried safely.

Examples:

- do not create two Google events because worker retried;
- do not charge twice;
- do not send five identical reminders because function timed out after provider accepted request;
- use provider message/event IDs + idempotency records.

---

# 25. Webhooks and External Callbacks

Any webhook is untrusted until verified.

Requirements:

- verify provider signature/token/channel secret according to official provider protocol;
- HTTPS only;
- replay protection/idempotency;
- timestamp checks where supported;
- request-size limits;
- do not trust webhook-provided organization mapping without server lookup;
- store minimal raw payload needed for debugging, redacted/retained by policy;
- respond quickly then process asynchronously when appropriate.

This applies to future:

- SMS delivery receipts;
- email delivery webhooks;
- Messenger callbacks;
- Google Calendar push notifications;
- payment processor webhooks if added.

---

# 26. Billing and Financial Security

MVP supports:

- treatment estimate;
- charges;
- payments;
- balance;
- statement of account.

Security rules:

- money stored as integer centavos/fixed precision, not browser floats;
- charges/payments created by authorized roles only;
- no silent historical amount changes after finalized/posted state;
- adjustments/voids record reason and actor;
- cross-branch payment retains receiving branch and charge-origin branch;
- patient balance is derived from ledger, not editable total field;
- financial exports permissioned/audited.

BIR-compliant invoicing remains a separate researched module; do not label an ordinary PDF as a compliant tax invoice without validation.

---

# 27. Inventory Security

Inventory is important early because the second branch is newly opened.

Security/integrity rules:

- stock changes occur through ledger movements;
- users cannot directly type a new “current quantity” without an adjustment event;
- adjustment requires reason;
- branch transfer creates paired/linked movement records;
- high-value or controlled items can require elevated approval later;
- negative stock rules configurable but not accidentally permitted;
- audit adjustments/transfers;
- branch access applies.

Equipment/resource scheduling and consumable inventory are separate domains even if the same physical device appears in operations.

---

# 28. Analytics and Reporting Security

## 28.1 Aggregate by default

Owner dashboards may show:

- new patients by source;
- no-show rate;
- branch utilization;
- referral performance;
- provider utilization;
- revenue/collections.

The dashboard should not display patient names when an aggregate answers the business question.

## 28.2 Drill-down is separately authorized

A user who can view aggregated marketing acquisition metrics should not automatically get access to every underlying clinical record.

## 28.3 Export control

CSV/XLS/PDF exports containing patient-level rows require explicit permissions and audit logging.

Avoid unbounded “Export all patient data” buttons for ordinary staff.

---

# 29. Data Subject Rights and Privacy Operations

The architecture should support clinic workflows for data-subject requests without giving a public user direct database access.

Potential request types include:

- access/copy;
- correction;
- objection/withdrawal where applicable;
- deletion/erasure where legally applicable and not overridden by retention/legal obligations;
- inquiry regarding processing.

Implementation model:

```text
Request received
      ↓
Clinic verifies identity
      ↓
DPO/authorized staff reviews scope/legal basis
      ↓
System generates appropriate record/export or correction workflow
      ↓
Action audited
```

Do not automate irreversible deletion simply because a patient clicked “delete my account.” Clinical retention obligations may apply.

---

# 30. Secure Software Development Lifecycle

## 30.1 Security standard

Use **OWASP ASVS 5.0** as the primary application-security verification checklist, supplemented by OWASP cheat sheets for file upload, access control, authentication, logging, CSP, and other relevant areas.

This does not mean “certified compliant.” It provides a structured engineering baseline.

## 30.2 Pull-request gates

High-risk changes require second review:

- RLS policies;
- auth/session code;
- role/permission helpers;
- service-role use;
- file access;
- patient export;
- Google OAuth token storage;
- public booking endpoints;
- webhook verification;
- audit logic;
- clinical finalization/versioning;
- migrations touching tenant IDs;
- backup/restore code.

Recommended two-agent workflow:

```text
Claude plans/implements
      ↓
Codex reviews security + tests
      ↓
Human resolves findings
```

or reverse roles.

The second agent should be explicitly asked to **challenge** the implementation, not summarize it.

## 30.3 Static/dependency security

Before production:

- lock dependency versions;
- run dependency vulnerability checks;
- enable GitHub Dependabot/Renovate or equivalent;
- enable secret scanning;
- use CodeQL/SAST where available;
- maintain `THIRD_PARTY_NOTICES.md` and license review;
- remove unused dependencies;
- do not auto-merge security updates without tests for critical UI/clinical libraries.

## 30.4 Odontogram dependency

For `react-advanced-odontogram`:

- prototype and clinician-test;
- verify MIT license notice;
- pin known version;
- use the controlled `Ditherys/React-Odontogram-Modul` fork before commercial dependence and pin an approved revision;
- run upstream tests plus our own adapter/clinical tests;
- do not expose upstream internal format as canonical database contract.

## 30.5 Migrations

Production schema changes:

- migration files only;
- reviewed in Git;
- tested against staging/synthetic data;
- RLS effects tested;
- rollback/recovery plan for destructive changes;
- no casual SQL edits in production dashboard.

---

# 31. AI-Assisted Development Security

Claude Code and Codex are development tools, not production EMR operators.

Rules:

1. Never provide real patient data in prompts.
2. Never provide production Supabase keys/passwords.
3. Never provide Google refresh tokens.
4. Never provide R2 secrets.
5. Never paste production logs containing patient data without approved redaction.
6. Use synthetic fixtures.
7. Agents work in development/staging environments.
8. Production deployment remains human-reviewed.
9. Agents do not receive unrestricted production database shell access by default.
10. Agent-generated migrations/RLS policies require independent review and automated tests.
11. Security findings are committed/documented; do not depend on chat history.

Future MCP/AI access inside the EMR is a **separate product security project** and must not inherit coding-agent permissions.

---

# 32. Deployment and Environment Security

## 32.1 Environments

Minimum:

```text
Development
Staging / Preview
Production
```

Each environment has separate:

- database/project;
- auth users;
- storage/buckets;
- secrets;
- callback URLs;
- cron behavior;
- messaging destinations.

## 32.2 Production data never in generic previews

Vercel preview branches must not point to production Supabase/R2 by default.

Prevent accidental reminders from staging:

- staging messaging provider disabled/sandboxed;
- recipient allowlist;
- calendar sync disabled or uses test calendar;
- backup/restore tests isolated.

## 32.3 Preview access

Private staging/preview EMR should not be indexed or freely accessible to the public.

Require authentication/access protection where appropriate.

## 32.4 Environment variables

Use Vercel environment scoping and sensitive-variable controls.

Production-only credentials should not be available to preview/development environments.

---

# 33. Monitoring and Vulnerability Management

NPC Circular 2023-06 requires organizations to adapt security measures to evolving threats.

The product/operations should include:

- authentication-failure monitoring;
- RLS/authorization-denial monitoring;
- elevated admin action alerts;
- job failure monitoring;
- backup failure monitoring;
- storage/integration error monitoring;
- dependency vulnerability monitoring;
- production error-rate monitoring;
- suspicious public-booking abuse detection;
- security bulletin review for major dependencies/providers.

Do not send sensitive patient payloads to monitoring vendors by default.

---

# 34. Incident Response

## 34.1 Incident categories

Examples:

- leaked credentials;
- unauthorized patient access;
- cross-tenant exposure;
- malicious insider;
- lost clinic device;
- ransomware;
- compromised third-party integration;
- accidental public file exposure;
- corrupted clinical record;
- backup failure;
- service outage;
- supply-chain compromise.

## 34.2 Initial response process

```text
Detect / report
      ↓
Preserve evidence
      ↓
Contain access/source
      ↓
Identify affected tenant/data/classes
      ↓
Rotate/revoke credentials as needed
      ↓
Restore integrity/availability
      ↓
Assess notification obligations with PIC/DPO
      ↓
Notify as required
      ↓
Root-cause analysis
      ↓
Corrective controls + postmortem
```

## 34.3 Evidence preservation

Do not “clean up” so aggressively that logs/evidence are destroyed.

Preserve:

- relevant application/audit logs;
- auth/session events;
- access logs;
- deployment version/commit;
- database change history;
- affected object keys/hashes;
- integration events;
- timeline of response actions.

## 34.4 72-hour readiness

Because applicable Philippine breach-notification rules can have a 72-hour window, incident contacts and procedures must be established **before** a breach.

Maintain:

- clinic DPO/contact;
- SaaS incident contact;
- hosting/provider escalation contacts;
- breach report template/checklist;
- decision authority;
- secure communications channel.

---

# 35. Security Testing Strategy

Security tests are part of feature acceptance, not a once-a-year activity.

## 35.1 Unit tests

Test:

- permission helpers;
- token hashing/expiry;
- file allowlist validation;
- message privacy templates;
- status transition authorization;
- audit event generation;
- redaction functions.

## 35.2 PostgreSQL / pgTAP tests

Test:

- RLS per role;
- cross-tenant denial;
- branch access;
- specialist assigned-case access;
- immutable finalized records;
- tenant-consistent foreign keys;
- service functions;
- appointment exclusion/double-book protection;
- unauthorized inventory/billing writes.

## 35.3 Integration tests

Use multiple synthetic users:

```text
Org A Owner
Org A Dentist
Org A Receptionist
Org A Visiting Specialist
Org B Owner
Org B Dentist
Anonymous/Public
Suspended user
```

Attempt both allowed and forbidden operations.

## 35.4 End-to-end tests

Playwright scenarios:

- login + MFA;
- cross-role navigation and direct URL attempts;
- booking token expiry;
- patient export permission;
- file upload/download;
- specialist assigned-case boundary;
- add Branch 3 permissions;
- lost/suspended staff access;
- signed document immutability;
- Google disconnect failure-safe behavior.

## 35.5 Negative/abuse tests

Explicitly test:

- IDOR/BOLA attempts;
- request body tampering;
- tenant-ID tampering;
- mass assignment;
- XSS payloads in names/notes;
- SQL injection inputs;
- malicious file types;
- very large file upload;
- CSRF attempt;
- webhook replay;
- public booking spam;
- expired/replayed secure link;
- duplicate concurrent booking;
- service-role key absent from client bundle.

## 35.6 Pre-production security review

Before real patient data:

- threat model reviewed;
- PIA completed;
- RLS test suite passes;
- dependency audit passes/no unresolved critical known vulnerabilities;
- secrets scan passes;
- backup restore tested;
- incident-response runbook exists;
- DPO/privacy approval obtained as applicable;
- authorization matrix validated by clinic;
- production MFA enabled;
- public booking abuse protections active;
- file upload security validated.

Before commercial SaaS launch:

- independent penetration test/security review strongly recommended;
- contractual/subprocessor review;
- tenant-isolation penetration tests;
- disaster recovery exercise;
- privacy notice/DPA/DPO/registration requirements validated.

---

# 36. Security Acceptance Criteria by Major Module

## 36.1 Patient management

Must pass:

- no anonymous patient list/read;
- organization isolation;
- receptionist clinical restrictions;
- duplicate detection does not reveal cross-tenant patients;
- full export requires permission and audit;
- merge requires elevated authorization, preview, MFA, and audit.

## 36.2 Scheduling

Must pass:

- provider cannot double-book across branches;
- chair/resource cannot double-book;
- held slots expire;
- public availability does not leak private Google event detail;
- only authorized staff can override conflicts;
- appointment change audited.

## 36.3 Website booking

Must pass:

- rate limited;
- bot/spam controls available;
- no patient enumeration;
- secure token management;
- no raw patient-table access;
- transaction-level conflict protection;
- minimal data collection.

## 36.4 Odontogram

Must pass:

- canonical DB mapping;
- server validation;
- provider authorization;
- history/versioning as required;
- library removed/replaced without losing canonical records;
- iPad/laptop client does not become trusted authority.

## 36.5 Treatment canvas

Must pass:

- patient/provider association validated;
- working vectors protected;
- acknowledged snapshot immutable;
- signature not silently moved to a changed plan;
- export audited.

## 36.6 Files

Must pass:

- R2 bucket private;
- object keys opaque;
- short-lived signed access;
- type/size/signature checks;
- malicious format tests;
- no signed URL in logs;
- finalized documents protected from overwrite.

## 36.7 Billing

Must pass:

- no direct balance editing;
- ledger authorization;
- branch attribution;
- adjustment/void audit;
- no clinical visibility granted solely because billing access exists.

## 36.8 Inventory

Must pass:

- branch scope;
- ledger movements;
- adjustment reason;
- transfer consistency;
- audit.

## 36.9 Google Calendar

Must pass:

- provider-specific connection;
- narrow scopes;
- encrypted refresh token;
- free/busy hides private descriptions;
- retries idempotent;
- revoked access does not delete EMR appointment;
- disconnect auditable.

## 36.10 Communications

Must pass:

- minimal message content;
- provider secrets protected;
- delivery logs without secret leakage;
- retries idempotent;
- communication preferences respected;
- marketing consent separated where applicable.

---

# 37. Recommended Security Implementation Order

Do not implement all controls at the end.

## Phase S0 — Documentation / governance

Before repository production use:

- approve security architecture;
- define data classification;
- create threat model;
- create initial PIA worksheet;
- identify DPO/privacy owner;
- define initial retention questions;
- define incident contacts.

## Phase S1 — Foundation

With app scaffold:

- separate environments;
- secrets controls;
- Supabase Auth SSR pattern;
- staff invitation only;
- MFA enrollment design;
- membership/roles;
- RLS test harness;
- audit framework;
- security headers baseline;
- dependency/secret scanning.

## Phase S2 — Patient domain

Before patient data:

- patient RLS;
- receptionist vs dentist permissions;
- audit record read/edit/export;
- duplicate/merge controls;
- synthetic security fixtures.

## Phase S3 — Scheduling/public website

- public endpoint validation;
- anti-enumeration;
- rate limits/bot protection;
- secure management tokens;
- concurrency tests;
- Google privacy boundary.

## Phase S4 — Clinical records

- clinical note lifecycle;
- odontogram validation;
- treatment-plan versioning;
- treatment canvas snapshot/signature integrity;
- consent document integrity.

## Phase S5 — Files

- private R2;
- short-lived signed URLs;
- file allowlist/magic-byte validation;
- malware/quarantine pipeline;
- immutable issued document storage;
- audit download/export.

## Phase S6 — Automation/integrations

- encrypted tokens;
- provider adapters;
- idempotency;
- webhook verification;
- safe communication templates;
- monitoring/retry alerts.

## Phase S7 — Production gate

- PIA complete;
- security tests;
- MFA mandatory;
- backup restore test;
- incident runbook;
- privacy notice / contracts / DPO review;
- external security review appropriate to risk.

---

# 38. Decisions Locked by Security Architecture v1.0

The following are now architecture decisions unless superseded by an approved ADR:

1. Patient/clinical data is sensitive and protected by privacy-by-default controls.
2. Organization is the SaaS tenant boundary; branch is an internal operational boundary.
3. All production workforce accounts accessing patient data use individual identities and MFA.
4. Supabase Auth is identity infrastructure; application tables own organization/branch/provider permissions.
5. Server/application authorization plus PostgreSQL RLS is mandatory defense in depth.
6. RLS is enabled for every tenant table exposed through Supabase Data API.
7. Service-role/secret keys never reach the browser.
8. Regular dentists can have organization-wide clinical continuity; visiting/on-call specialists default to assigned-case access.
9. Owner/admin status does not automatically imply clinical edit permission in future SaaS.
10. Public booking endpoints never expose patient search/clinical tables.
11. Public appointment-management links use high-entropy, purpose-bound, expiring credentials.
12. Clinical files use private Cloudflare R2 storage with short-lived authorized delivery.
13. `react-advanced-odontogram` is a replaceable renderer, not the canonical clinical data format.
14. Signed/finalized clinical records/documents preserve immutable versions and amendments rather than silent overwrite.
15. Google Calendar remains an integration; free/busy does not expose personal event details to clinic staff.
16. Google refresh tokens and other persistent integration secrets are encrypted and server-only.
17. Audit logging covers high-impact clinical, administrative, security, export, integration, billing, and inventory actions.
18. Application logs must be redacted and must not become a secondary clinical-record store.
19. Backups are layered; ordinary clinic staff do not manually download raw production backups as the primary strategy.
20. Restore tests are required.
21. Development/staging use synthetic/de-identified data and separate credentials from production.
22. AI coding agents receive no real patient data or production secrets.
23. OWASP ASVS 5.0 is the secure-development verification baseline.
24. A formal PIA/security/privacy review is required before real-patient production deployment.
25. Incident response must be prepared for applicable NPC breach-notification timelines.

---

# 39. Open Items Requiring Clinic/DPO/Implementation Validation

These are not blockers for repository scaffolding but must be resolved before production or the relevant feature.

## Legal/privacy operations

- Who will serve as clinic DPO / privacy contact?
- Does the clinic's current processing meet mandatory NPC registration criteria, and what must be registered?
- What retention periods apply to each dental/financial/document class?
- What exact privacy notice and lawful basis applies to each processing purpose?
- What subprocessor/cloud-region disclosures are required?
- What data-sharing agreements are needed for referrals/other providers?

## Security policy

- Confirm 30-minute idle / 12-hour absolute workforce session targets.
- Confirm whether all workforce users must use MFA from day one or whether a short enrollment grace period is required.
- Decide which clinical read events are individually audited to balance visibility and log volume.
- Decide which staff can print/download complete patient records.
- Decide break-glass requirement, if any.

## Files

- Final per-file size limits.
- Approved clinical image types.
- Malware scanning provider/architecture.
- Whether original image metadata must be preserved for clinical reasons.
- CBCT/DICOM strategy in a later phase.

## Backups

- Supabase plan/PITR budget.
- Formal RPO/RTO agreed with clinic.
- Off-site backup retention schedule.
- Backup encryption-key custody.

## SaaS launch

- Support-access model.
- Subprocessor list and DPA template.
- External penetration-test scope.
- Customer offboarding/export/deletion procedure.
- Platform admin access model.

---

# 40. Required Security Documents / Runbooks to Create Later

This architecture should eventually be supported by shorter operational documents:

```text
docs/security/
├── SECURITY_ARCHITECTURE.md
├── THREAT_MODEL.md
├── ACCESS_CONTROL_MATRIX.md
├── DATA_CLASSIFICATION.md
├── PIA_WORKSHEET.md
├── RETENTION_POLICY_MATRIX.md
├── INCIDENT_RESPONSE_RUNBOOK.md
├── BACKUP_RESTORE_RUNBOOK.md
├── PRODUCTION_ACCESS_POLICY.md
├── VENDOR_SUBPROCESSOR_REGISTER.md
└── SECURITY_TEST_PLAN.md
```

Do not create all of these before coding if they are empty boilerplate. Create them when the relevant implementation/pilot phase needs them.

---

# 41. Security Definition of Done Before Real Patient Data

The project is **not ready for real patient records** unless all of the following are true:

- [ ] production Supabase Cloud project separated from cloud dev/test/staging;
- [ ] production R2 clinical bucket private;
- [ ] RLS enabled and tested on every exposed tenant table;
- [ ] cross-tenant automated tests pass;
- [ ] role/branch/specialist access matrix approved;
- [ ] individual staff accounts only;
- [ ] MFA required/enforced for patient-data users;
- [ ] staff invitation/offboarding works;
- [ ] service-role secrets absent from client bundle;
- [ ] secrets scan passes;
- [ ] security headers/CSP reviewed;
- [ ] public booking rate limiting and anti-enumeration tested;
- [ ] secure appointment-management tokens implemented;
- [ ] file upload allowlist/validation/scanning path implemented;
- [ ] clinical file download requires server authorization;
- [ ] signed/finalized document immutability tested;
- [ ] audit logs implemented for high-impact actions;
- [ ] logs contain no obvious patient text/tokens/secrets;
- [ ] Google OAuth tokens encrypted and narrow scopes used;
- [ ] Google free/busy privacy tested;
- [ ] production communications use minimal templates;
- [ ] backup strategy active;
- [ ] restore test completed;
- [ ] incident-response contact/runbook exists;
- [ ] PIA completed and findings resolved/accepted;
- [ ] clinic DPO/privacy requirements reviewed;
- [ ] NPC registration obligations checked;
- [ ] retention/disposal policy defined sufficiently for launch;
- [ ] dependencies/license/security audit completed;
- [ ] no real patient data appears in dev fixtures, Git history, AI prompts, screenshots, or tickets.

---

# 42. Reference Sources Used for Security Architecture v1.0

The following primary/authoritative sources were reviewed when preparing this architecture. Requirements may change, so implementation teams must re-check current versions before production launch.

## Philippine privacy/security

- National Privacy Commission — Republic Act No. 10173, Data Privacy Act of 2012  
  https://privacy.gov.ph/data-privacy-act/

- National Privacy Commission — NPC Circular No. 2023-06, Security of Personal Data in the Government and the Private Sector  
  https://privacy.gov.ph/wp-content/uploads/2024/03/NPC-Circular-Repeal-16-01-Signed.pdf

- National Privacy Commission — FAQ on NPC Circular No. 2023-06  
  https://privacy.gov.ph/wp-content/uploads/2024/12/v12-19-2024_FAQ-NPC-Circular-2023-06_NNJ_JDN.pdf

- National Privacy Commission — NPC Circular No. 2022-04, Registration of Data Processing System / DPO / Automated Decision-Making  
  https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04.pdf

- National Privacy Commission — Guidelines on Privacy Impact Assessments  
  https://privacy.gov.ph/wp-content/uploads/2022/01/NPC_AdvisoryNo.2017-03.pdf

- National Privacy Commission — NPC Circular No. 2023-04, Guidelines on Consent  
  https://privacy.gov.ph/wp-content/uploads/2023/11/NPC-Circular-No.-2023-04_Guidelines-on-Consent_07Nov2023.pdf

- National Privacy Commission — Breach Reporting / Personal Data Breach Management  
  https://privacy.gov.ph/pips-and-pics/breach-reporting/

- National Privacy Commission — Health Sector Data Privacy FAQ  
  https://privacy.gov.ph/wp-content/uploads/2023/05/Brochure_Health-Sector.pdf

## Supabase

- Supabase — Securing your data  
  https://supabase.com/docs/guides/database/secure-data

- Supabase — Row Level Security  
  https://supabase.com/docs/guides/database/postgres/row-level-security

- Supabase — Multi-Factor Authentication  
  https://supabase.com/docs/guides/auth/auth-mfa

- Supabase — Password security  
  https://supabase.com/docs/guides/auth/password-security

- Supabase — User sessions  
  https://supabase.com/docs/guides/auth/sessions

- Supabase — Server-side auth / SSR client guidance  
  https://supabase.com/docs/guides/auth/server-side/creating-a-client

- Supabase — Vault  
  https://supabase.com/docs/guides/database/vault

- Supabase — Database backups / PITR  
  https://supabase.com/docs/guides/platform/backups

## Cloudflare R2

- Cloudflare R2 — Data security  
  https://developers.cloudflare.com/r2/reference/data-security/

- Cloudflare R2 — Presigned URLs  
  https://developers.cloudflare.com/r2/api/s3/presigned-urls/

- Cloudflare R2 — Bucket Locks  
  https://developers.cloudflare.com/r2/buckets/bucket-locks/

## Google Calendar

- Google Calendar API — Choose OAuth scopes  
  https://developers.google.com/workspace/calendar/api/auth

- Google Calendar API — FreeBusy query  
  https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query

## Application security

- OWASP — Application Security Verification Standard (ASVS) 5.0  
  https://owasp.org/www-project-application-security-verification-standard/

- OWASP Cheat Sheet Series — File Upload  
  https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

- OWASP Cheat Sheet Series — Content Security Policy  
  https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html

## Vercel

- Vercel — Managing environment variables across environments  
  https://vercel.com/docs/environment-variables/manage-across-environments

- Vercel — Secure native integration resources / production-only access  
  https://vercel.com/docs/integrations/install-an-integration/secure-your-resource

---

# 43. Final Architecture Principle

The system should assume that mistakes, compromised credentials, failed integrations, malicious inputs, and future tenants will exist.

Therefore:

> **Security must not depend on staff remembering to “be careful,” on React hiding buttons, or on one perfect layer never failing.**

Use layered controls:

```text
Privacy-by-default
      ↓
Individual identity + MFA
      ↓
Role/context authorization
      ↓
Server validation
      ↓
PostgreSQL RLS + constraints
      ↓
Private storage + narrow integrations
      ↓
Versioned clinical records
      ↓
Audit + monitoring
      ↓
Backups + tested recovery
      ↓
Incident response
```

That layered model is the security foundation for the prototype and the future commercial dental SaaS.
