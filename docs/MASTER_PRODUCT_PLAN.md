# Dental EMR & Practice Management Platform — Master Product Plan

**Version:** 1.9  
**Status:** Authoritative product-planning baseline  
**Prepared:** 2026-08-12 (Asia/Manila)  
**Primary market:** Philippine dental clinics  
**Primary implementation style:** AI-assisted engineering using Claude Code + OpenAI Codex, with human review and Git as the source of truth  

---

## 0. How to Use This Document

This file is intended to be the single master product plan for the project. Claude Code, Codex, and human collaborators should read this document before making architectural or scope-changing decisions.

This is a **product and architecture planning document**, not a substitute for legal, accounting, tax, medical, dental, security, or privacy advice. Before production use with real patient records, the clinic owner should validate Philippine legal/privacy requirements, record-retention requirements, professional-document templates, billing/invoicing obligations, consent forms, and any clinic-specific policies with the appropriate qualified professionals.

### 0.1 Source-of-truth hierarchy

When project documents later disagree, use this precedence unless an Architecture Decision Record (ADR) explicitly supersedes it:

1. Approved ADRs in `docs/decisions/`
2. Approved implementation plan for the current feature in `docs/plans/`
3. This master product plan
4. `TECHNICAL_ARCHITECTURE.md`
5. `FRONTEND_ARCHITECTURE.md` for frontend/UI implementation decisions
6. `SECURITY_ARCHITECTURE.md` / approved security specification
7. `DATABASE_DESIGN.md`
8. Agent-specific instructions such as `CLAUDE.md` or `AGENTS.md`
9. Conversation history

Conversation history should **never** be the only place where an important architectural decision lives.

### 0.2 Rules for Claude and Codex

Agents working on this project should:

- inspect the repository before proposing changes;
- read the relevant approved plan before implementing;
- avoid inventing requirements that contradict this document;
- surface ambiguity rather than silently changing product behavior;
- never use real patient data in development, tests, prompts, logs, fixtures, or screenshots;
- never place production credentials, OAuth tokens, service keys, or patient data in agent prompts;
- create migrations rather than modifying production database state manually;
- enforce permissions on the server/database layer, not only in UI components;
- preserve auditability for sensitive actions;
- treat the EMR database as the authoritative source for appointments and clinical information;
- write automated tests for authorization boundaries and high-risk workflows;
- use Git commits as checkpoints when switching between Claude and Codex.

---

# 1. Executive Summary

The product is a **dental-first, automation-first Electronic Medical Record (EMR) and Practice Management Platform** designed initially for small and medium dental clinics in the Philippines.

The target clinic may currently use a mixture of:

- paper patient charts;
- handwritten dental records;
- Facebook Pages;
- Facebook Messenger;
- phone calls and SMS;
- Google Calendar;
- appointment notebooks;
- spreadsheets;
- printed treatment plans;
- printed prescriptions and certificates;
- manually managed referrals;
- informal specialist/on-call dentist coordination;
- manual appointment reminders;
- scattered X-rays, photos, and documents.

The platform should replace or connect those fragmented workflows while allowing clinics to retain the parts of paper-based practice they still find useful, especially **printing and PDF generation**.

The product should not be positioned merely as “software that stores patient records.” The stronger vision is:

> **An automation-first operating system for a dental clinic.**

A clinic should enter information once, and the system should reuse it wherever appropriate.

Example:

```text
New patient books on clinic website
        ↓
Appointment created in EMR
        ↓
Acquisition source captured
        ↓
Dentist/provider matched
        ↓
Chair/resource reserved
        ↓
Google Calendar updated
        ↓
Patient confirmation sent
        ↓
Reminders scheduled
        ↓
Patient arrives and checks in
        ↓
Dentist records treatment
        ↓
Treatment discussion/drawing saved
        ↓
Treatment plan / PDF generated
        ↓
Follow-up or recall scheduled
        ↓
Analytics updated automatically
```

---

# 2. Product Vision

## 2.1 Core vision

Build a secure dental practice platform that helps clinics:

- digitize patient records without losing printable workflows;
- manage multiple dentists and specialties;
- manage regular, visiting, part-time, and on-call providers;
- manage appointments using a dental-aware scheduling engine;
- manage chairs, rooms, and other clinic resources;
- connect each dentist’s Google Calendar when desired;
- support public appointment booking from the clinic website;
- support Messenger/SMS/email communication and reminders;
- reduce missed appointments and no-shows;
- automate confirmations, recalls, follow-ups, and operational notifications;
- track how patients found the clinic and who referred them;
- support incoming and outgoing clinical referrals;
- create digital treatment plans and visual treatment discussions;
- allow dentists to draw or annotate diagrams, X-rays, or photos;
- generate printable/PDF patient records and clinic documents;
- preserve clinical history, audit trails, and document versions;
- produce operational and acquisition analytics;
- eventually support carefully permissioned AI/MCP workflows.

## 2.2 Product positioning ideas

Potential positioning statements:

- **“The dental EMR that follows up for you.”**
- **“Run your dental clinic, not your appointment book.”**
- **“One patient record. One schedule. One clinic workflow.”**

Final marketing positioning should be tested with actual dentists rather than selected purely from this planning document.

## 2.3 Product philosophy

### Enter once, reuse everywhere

Examples:

- A patient name entered during website booking should not need to be retyped in Google Calendar.
- A treatment recorded in the EMR should automatically appear in the patient history.
- A referral source captured at registration should automatically be available to analytics.
- A completed treatment that needs follow-up should create a recall automatically.
- A treatment discussion drawing should be reusable in the patient record and treatment-plan PDF.

### Automate the next logical step

Examples:

```text
Appointment Created → Confirmation → Reminder → Calendar Sync
Treatment Completed → Recall → Future Reminder
Specialist Needed → Specialist Request → Acceptance → Assignment
Patient Cancelled → Release Chair → Update Calendar → Reopen Slot
Document Requested → Generate Current PDF → Log Export
```

### Digital first, printable when needed

The goal is not to prohibit paper. The goal is to make the structured digital record authoritative while generating paper/PDF outputs from that structured record whenever necessary.

---

# 3. Philippine Market & Research Basis

The product direction is supported by current Philippine-facing practice-management systems and dental workflow evidence.

## 3.1 Current local software patterns

### SeriousMD

SeriousMD currently markets medical records, appointment scheduling, payments/billing, online/patient-facing appointment requests, automated dental reminders, customizable notes, diagrams/blank canvas, and printing/sharing of records. Its documented Google Calendar integration currently syncs SeriousMD appointments **to** Google Calendar but does not sync arbitrary Google events back into SeriousMD.

Product implication:

- appointment reminders are already an expected competitive feature;
- charting/diagram tools are legitimate EMR workflows;
- print/export is an expected bridge between digital and paper workflows;
- there is an opportunity for smarter privacy-preserving Google free/busy integration.

### MyMedsPH

MyMedsPH is Philippine dental-practice software focused on patient records, appointment management, online booking links/QR codes, charting, forms, reminders, billing, and digital workflow. Its public materials include dentist testimonials describing paper-record storage and retrieval as operational problems.

Product implication:

- replacing paper is a real problem, but dentists may still want printable records;
- online booking + reminders + patient forms are established workflow expectations;
- ease of use for dentists and staff must be a major product requirement.

### DenPro and similar dental systems

Philippine-facing dental systems advertise multi-provider scheduling, dental charting, reminders, online booking, waitlists, and reporting.

Product implication:

- merely adding a patient database is not enough;
- differentiation should come from automation, dental-first scheduling, interoperability, and usability.

## 3.2 Social media / Messenger as a front door

Philippine dental practices commonly maintain Facebook pages, and clinics may instruct patients to book or inquire through Messenger. The product should therefore **not assume the website will replace Messenger**.

Desired long-term ecosystem:

```text
Facebook / Messenger ─┐
Clinic Website ───────┤
Phone / Reception ────┤──→ EMR Appointment + Patient Workflow
Walk-in ──────────────┘
```

The EMR is the source of truth; channels are entry points.

## 3.3 Privacy context

Under the Philippine Data Privacy Act and its implementing rules, health-related data and health records are sensitive personal information. The product therefore requires strong purpose limitation, access control, data minimization, security safeguards, and retention governance.

Do not interpret this document as a complete compliance checklist. Before production launch, the clinic should validate requirements with an appropriate privacy professional / Data Protection Officer as applicable.

---

# 4. Target Users and Personas

## 4.1 Clinic Owner / Administrator

Needs:

- oversee clinic operations;
- manage staff and dentists;
- manage integrations;
- configure services, schedules, chairs, and clinic rules;
- view financial/operational analytics;
- control permissions;
- monitor reminders and integration failures;
- access audit information;
- configure website public content.

## 4.2 Dentist

Needs:

- see today’s patients quickly;
- access clinical history without searching through paper;
- record notes efficiently;
- use odontogram/charting;
- create treatment plans;
- draw/annotate while explaining treatment;
- print or send treatment information;
- prescribe and create relevant documents;
- review X-rays/photos;
- schedule or recommend follow-ups;
- connect personal/work Google Calendar if desired;
- protect personal-calendar details from reception staff.

## 4.3 Receptionist / Front Desk

Needs:

- create and update patients;
- schedule appointments;
- see provider availability;
- manage walk-ins and queues;
- confirm appointments;
- handle reschedule/cancellation requests;
- see whether reminders were sent;
- capture acquisition/referral information;
- print selected administrative documents;
- manage payment/billing information if permitted;
- avoid unrestricted access to sensitive clinical content that is unnecessary for front-desk work.

## 4.4 Dental Assistant

Needs:

- see upcoming patients and procedures;
- know required chair/room/equipment preparation;
- record limited workflow data;
- assist dentists without receiving unnecessary administrative privileges.

## 4.5 Regular Dentist / Associate Dentist

Needs provider-specific schedule and patient access based on clinic policy.

## 4.6 Visiting / On-call Specialist

Needs:

- receive specialist requests;
- accept/decline/request another time;
- receive only the patient information required for the assigned case;
- access assigned appointments without seeing the entire clinic unnecessarily;
- optionally connect Google Calendar but not be required to do so.

## 4.7 Patient

Initially no required app account.

Needs:

- find clinic information;
- request/book appointment;
- receive confirmation/reminders;
- confirm/cancel/request reschedule securely;
- complete intake forms through secure links;
- receive printable/PDF documents if appropriate;
- eventually use a patient portal.

---

# 5. Core Product Principles

## 5.1 EMR database is authoritative

The EMR/PostgreSQL database is the source of truth for:

- patient identity;
- clinical records;
- clinic appointments;
- provider assignments;
- treatment plans;
- communication status;
- referrals;
- document metadata;
- audit logs.

Google Calendar, Messenger, email, SMS, and the public website are integrations—not alternative primary databases.

## 5.2 Public surfaces must be isolated from clinical data

The public website should never have direct unrestricted access to clinical tables.

Public website requests should go through narrow, validated server APIs that expose only the required booking/public data.

## 5.3 Server-side authorization is mandatory

A hidden button is not a permission boundary.

Every protected read/write operation must be authorized server-side and, where applicable, at the database layer through PostgreSQL RLS or equivalent controls.

## 5.4 Least privilege

Receptionists should not automatically see everything a dentist can see.

Visiting specialists should not automatically get clinic-wide access.

System integrations should request only required OAuth/API scopes.

## 5.5 Audit high-impact actions

Examples:

- viewing sensitive clinical records (policy to be validated for volume/performance);
- editing clinical notes;
- signing/finalizing treatment documentation;
- exporting patient records;
- changing appointment assignments;
- changing permissions;
- accessing or changing integration settings;
- issuing sensitive documents.

## 5.6 Preserve history rather than silently overwrite

Particularly for:

- signed treatment plans;
- consent forms;
- finalized clinical notes;
- acknowledged treatment discussions;
- prescriptions;
- important generated documents;
- audit-relevant appointment status transitions.

---

# 6. High-Level Product Modules

The platform should be organized around the following domains:

1. Clinic & Organization Management
2. Identity, Authentication & Authorization
3. Patient Management
4. Patient Acquisition & Referral Attribution
5. Provider, Specialty & Procedure Management
6. Scheduling & Appointment Management
7. Chair / Room / Resource Management
8. Specialist / On-call Workflow
9. Automation & Notifications
10. Google Calendar Integration
11. Clinic Website & Online Booking
12. Walk-in, Check-in & Queue Management
13. Clinical Dental EMR
14. Treatment Plans
15. Treatment Discussion Canvas / Visual Education
16. Consent / Acknowledgment Documentation
17. Document, PDF & Print Management
18. Billing / Payments / Financial Records
19. File, Photo & X-ray Management
20. Follow-up & Recall Management
21. Communication Center
22. Analytics & Reporting
23. Audit & Security Operations
24. Future Patient Portal
25. Future AI / MCP Integration

---

# 7. Clinic & Organization Management

## 7.1 Clinic entity

A clinic should include:

- legal/business display name;
- public clinic name;
- address/location;
- timezone (default `Asia/Manila` for initial PH clinics);
- contact numbers;
- clinic email;
- Facebook/Messenger links;
- website configuration;
- operating hours;
- logo/branding;
- privacy/document settings;
- calendar privacy mode;
- reminder rules;
- booking policies;
- document templates;
- invoice/billing integration settings later;
- branch management, including dynamically adding future locations.

## 7.2 Multi-clinic / multi-branch architecture

The first deployment is already **one dental organization with two active physical branches under the same owner**, and the owner must be able to add additional branches from the software later.

Use the confirmed hierarchy:

```text
organization / dental business
  └── branches
      ├── Branch A
      ├── Branch B
      └── Branch C / future branches added dynamically
```

Patients are organization-level so the same patient can receive care at either branch without duplicate clinical records. Appointments, provider schedules, chairs/resources, inventory movements, charge/payment attribution, and branch reporting remain branch-aware.

Branch management is therefore an MVP architecture requirement, not a future-only possibility.

---

# 8. Authentication, Users, Roles & Permissions

## 8.1 Authentication

Recommended baseline:

- email/password or passwordless/invite-based account provisioning for clinic staff;
- MFA capability for owners/admins and ideally clinical users;
- secure session handling;
- password-reset workflow;
- account lock/revocation;
- audit login/security events;
- no shared “receptionist” account.

## 8.2 Initial roles

### Clinic Owner / Administrator

Broad administrative access, including staff, configuration, integrations, analytics, and permissions.

### Dentist

Clinical and assigned/authorized patient access; treatment and appointment capabilities.

### Receptionist

Scheduling, demographics, communication, acquisition/referral capture, and configured billing access. Clinical access should be minimal and policy-controlled.

### Dental Assistant

Limited appointment and clinical-workflow access.

### Visiting / On-call Dentist

Restricted access to assigned cases and defined clinic scope.

## 8.3 Permission model

Avoid hard-coding all authorization logic directly to role names. Use capabilities/permissions so clinics can evolve.

Potential permissions:

```text
patient.read_demographics
patient.read_clinical
patient.create
patient.update_demographics
clinical_note.create
clinical_note.finalize
clinical_note.amend
appointment.read
appointment.create
appointment.update
appointment.cancel
appointment.assign_provider
billing.read
billing.manage
referral.manage
provider.manage
resource.manage
communication.send
communication.view
calendar.connect_self
calendar.manage_all
integration.manage
analytics.view
user.manage
role.manage
document.generate
patient_record.export
consent.manage
website.manage
```

## 8.4 Tenant/clinic isolation

Every tenant-owned row must be scoped to the clinic/organization. Tests must prove that a user in Clinic A cannot query, infer, export, or mutate Clinic B data.


# 9. Patient Management

## 9.1 Patient profile

Each patient should have one canonical profile per clinic/organization unless a later cross-clinic identity strategy is approved.

Suggested data groups:

### Identity & demographics

- internal patient ID;
- first/middle/last/suffix;
- preferred name;
- date of birth;
- sex as required by clinic workflow;
- contact information;
- address;
- emergency contact;
- guardian/parent for minors where applicable;
- communication preferences;
- status: active/inactive/deceased/merged/archived as appropriate.

### Administrative information

- acquisition source;
- booking channel;
- referrer;
- registration date;
- preferred dentist/provider if any;
- tags/alerts that are appropriate for operational use.

### Clinical information

- chief complaint;
- medical history;
- allergies;
- medications;
- health conditions;
- dental history;
- clinical alerts;
- odontogram/chart;
- diagnoses/findings;
- treatment history;
- treatment plans;
- clinical notes;
- X-rays/images/files;
- prescriptions;
- referrals;
- consent/acknowledgment records.

### Financial information

Keep financial records in a logically separate module even if linked to the patient. Do not conflate clinical notes and financial ledgers.

## 9.2 Patient search

Search should support:

- name;
- patient ID;
- mobile number;
- email;
- date of birth with appropriate safeguards;
- dentist/provider filters;
- recent appointment;
- inactive/merged filters.

Search should be tolerant of common formatting differences in Philippine mobile numbers while not using unsafe fuzzy matches to expose patient identity to unauthorized users.

## 9.3 Duplicate patient prevention

At patient creation, warn on potential duplicates using combinations such as:

- normalized name + DOB;
- normalized phone number;
- email;
- known existing-patient identifier.

Do not silently merge. Provide a review/merge workflow with audit logs.

## 9.4 Patient timeline

A core patient UI should show a chronological timeline containing appropriate events such as:

- appointments;
- check-ins;
- treatment-plan creation/acceptance;
- completed procedures;
- clinical-note finalization;
- drawings/visual discussions;
- prescriptions;
- referrals;
- uploaded documents;
- recall/follow-up activity;
- selected communications;
- payment events if the user has permission.

Timeline entries should link to the underlying authoritative object rather than duplicating all data.

## 9.5 Patient alerts

Examples:

- allergy;
- anticoagulant medication;
- relevant medical risk;
- special communication requirement;
- guardian requirement.

Clinical-alert design must be validated with dentists. Avoid alert fatigue.

---

# 10. Patient Acquisition & Referral Attribution

This feature is a core business-intelligence capability and should be built early so historical data accumulates from the beginning.

## 10.1 Separate three questions

Do not use a single vague `referral_source` field to answer unrelated questions.

### Acquisition source

**How did the patient discover the clinic?**

Examples:

- Existing Patient Referral
- Family/Friend
- Dentist Referral
- Doctor/Healthcare Referral
- Google Search
- Google Maps
- Facebook
- Instagram
- TikTok
- Clinic Website / Direct
- Clinic Signage
- Flyer/Event
- HMO
- Employer/Company
- School/Partner
- Other
- Unknown

### Referrer

**Was a specific person/provider/organization responsible for the referral?**

Possible types:

- existing patient;
- internal provider;
- external dentist;
- doctor/healthcare professional;
- organization/company/school;
- other individual.

### Booking channel

**How was the appointment actually created?**

Examples:

- Walk-in
- Phone
- SMS
- Facebook Messenger
- Instagram Messaging
- Clinic Website
- Online Booking
- Receptionist-created
- Future Patient Portal
- Google/other integration

## 10.2 Walk-in is usually a booking channel, not discovery source

Example:

```text
Patient saw Facebook post → walked into clinic

Acquisition Source: Facebook
Booking Channel: Walk-in
```

This prevents misleading analytics.

## 10.3 Existing patient referrals

When the patient says another patient referred them:

- search and link the referring patient;
- do not expose the full patient directory publicly;
- show referral count/relationship in authorized internal views;
- do not create incentives/rewards without clinic policy and compliance review.

Future analytics:

- top referring patients;
- number of referred patients;
- completed appointments from those referrals;
- production/collections later if appropriate;
- retention of referred patients.

## 10.4 Professional referrals

For external dentist/provider referrals, capture:

- referrer name;
- clinic/organization;
- specialty;
- contact information;
- referral reason;
- related documents;
- referral date;
- referral status.

## 10.5 Incoming vs outgoing referral

These are distinct domains:

### Incoming acquisition/clinical referral

External person/provider sends patient to this clinic.

### Outgoing clinical referral

This clinic sends patient to another provider/specialist/facility.

Do not combine them into one generic table without clear direction/type fields and workflow semantics.

## 10.6 Attribution quality

Use standardized selectable sources. Support custom sources but map them to categories.

Avoid uncontrolled free-text values such as:

```text
FB
Facebook
fb ads
Meta
Facebook Ads
```

unless those are intentionally distinct campaign dimensions.

Always allow `Unknown` rather than forcing staff to guess.

## 10.7 Website marketing attribution

Website booking should preserve acquisition metadata when lawful and available, such as:

- source;
- medium;
- campaign;
- landing page;
- referral code;
- booking channel.

Example:

```text
Google organic search → website → appointment
Acquisition Source: Google Organic
Booking Channel: Clinic Website
```

Future funnel:

```text
Website Visit
  → Booking Started
  → Booking Submitted
  → Appointment Confirmed
  → Patient Arrived
  → Treatment Accepted
  → Treatment Completed
```

---

# 11. Provider, Specialty & Procedure Management

## 11.1 Provider model

A provider can be:

- regular dentist;
- associate dentist;
- part-time dentist;
- visiting dentist;
- on-call specialist;
- external referral provider (not necessarily system user).

Provider data may include:

- name;
- professional display credentials;
- specialties;
- clinic memberships;
- provider type;
- active status;
- contact info;
- schedule/availability;
- Google Calendar connection;
- website visibility;
- online-booking eligibility;
- appointment types/procedures they can perform;
- public bio/photo for website if approved.

## 11.2 Specialties

Configurable specialty catalog. Initial examples:

- General Dentistry
- Orthodontics
- Periodontics
- Prosthodontics
- Endodontics
- Oral Surgery
- Pediatric Dentistry

Avoid making the taxonomy impossible to extend.

## 11.3 Provider-specialty relationship

A provider may have multiple specialties/competencies. Do not store only one `specialty_id` on the provider.

## 11.4 Procedure/service catalog

A procedure/service definition may include:

- name;
- public website name;
- internal code;
- description;
- default duration;
- duration buffer before/after;
- required or preferred specialty;
- eligible providers;
- required resource type (chair/room/equipment) where relevant;
- online booking enabled/disabled;
- instant booking vs request-only;
- estimated price/range if clinic chooses to expose it;
- recall/follow-up template;
- preparation instructions;
- default consent/document templates later.

## 11.5 Procedure qualification

The scheduler should not assume every dentist can perform every procedure.

Provider matching may consider:

```text
Procedure
→ Required Specialty / Competency
→ Eligible Providers
→ Clinic Availability
→ External Calendar Busy Time
→ Resource Availability
→ Valid Slots
```

---

# 12. Appointment & Scheduling Domain

## 12.1 Appointment ownership

An appointment belongs primarily to a clinic/patient and may have zero, one, or multiple assigned providers depending on workflow.

Avoid a schema that assumes `appointment.dentist_id` is the only provider relationship.

Use an appointment-provider association supporting roles and assignment status.

## 12.2 Appointment fields

Conceptually:

- appointment ID;
- clinic/location;
- patient;
- procedure/service(s);
- requested specialty;
- start/end;
- duration;
- timezone;
- status;
- confirmation status;
- booking channel;
- acquisition snapshot/reference;
- assigned provider(s);
- resource(s);
- notes appropriate for scheduling;
- source (website/reception/Messenger import/etc.);
- Google Calendar mapping(s);
- reminder state;
- cancellation/reschedule metadata;
- created/updated/audit metadata.

## 12.3 Appointment status state machine

Initial statuses may include:

```text
REQUESTED
AWAITING_SPECIALIST
SCHEDULED
CONFIRMATION_PENDING
CONFIRMED
CHECKED_IN
IN_CHAIR
COMPLETED
CANCELLED
NO_SHOW
```

`RESCHEDULED` may be modeled as an event/history entry rather than a terminal status if the same appointment record continues.

State transitions should be explicit and validated server-side.

Example:

```text
REQUESTED → SCHEDULED → CONFIRMATION_PENDING → CONFIRMED
                                      ↓
                                  CANCELLED

CONFIRMED → CHECKED_IN → IN_CHAIR → COMPLETED
                ↓
              NO_SHOW (policy-specific timing)
```

## 12.4 Multiple providers per appointment

Use a relationship concept like:

```text
appointment_providers
- appointment_id
- provider_id
- role
- assignment_status
- confirmed_at
```

Roles might include:

- primary dentist;
- specialist;
- assisting dentist;
- supervising dentist.

## 12.5 Conflict prevention

The server must validate conflicts at commit time, not just visually disable slots in the browser.

Check:

- provider EMR appointments;
- provider working schedule;
- provider time off;
- Google free/busy where connected;
- required resource/chair conflict;
- clinic hours;
- procedure duration;
- buffers;
- multi-provider availability if required.

Use transactional/database-level strategies to prevent race-condition double booking.

## 12.6 Temporary slot holds for website booking

For instant booking, use short-lived holds so two website users cannot confirm the same slot simultaneously.

A hold should:

- expire automatically;
- not become a real clinical appointment until confirmed;
- be rate-limited;
- be idempotent;
- release resources on timeout/failure.

## 12.7 Rescheduling

Rescheduling should record:

- old time;
- new time;
- who requested it;
- who approved it;
- reason if required;
- patient notification status;
- provider/resource/calendar updates.

## 12.8 Cancellation

Cancellation should trigger appropriate automation:

```text
AppointmentCancelled
→ release provider slot
→ release chair/resource
→ update Google Calendar
→ cancel pending reminders
→ notify patient/provider as configured
→ optionally trigger waitlist opportunity
→ log event
```

## 12.9 No-shows

Track no-show explicitly for later analytics.

Do not automatically label a patient no-show too early; define clinic-configurable grace/policy.

---

# 13. Provider Availability, Chairs & Resources

## 13.1 Recurring availability

Provider schedules should support recurring rules:

```text
Mon 09:00–18:00
Tue 09:00–18:00
Wed OFF
Thu 09:00–18:00
Fri 09:00–18:00
Sat 09:00–15:00
```

## 13.2 Exceptions

Support:

- leave;
- conference;
- sick day;
- special clinic session;
- holiday;
- manually blocked time;
- one-off extended hours.

## 13.3 Clinic resources

Model resources separately from providers.

Examples:

- Chair 1
- Chair 2
- Surgery Room
- X-ray Room
- Consultation Room
- specialized equipment later.

Resource fields:

- resource type;
- clinic/location;
- name;
- active status;
- availability/maintenance block;
- supported procedures if necessary.

## 13.4 Resource allocation strategy

The system should eventually support both:

- assigning a chair at booking time;
- assigning a chair later/check-in time.

The first clinic’s actual workflow should determine MVP UI.

## 13.5 Scheduling-engine output

A valid slot may require all of these to be true:

```text
clinic is open
AND provider is qualified
AND provider is scheduled
AND provider has no EMR conflict
AND provider is not externally busy
AND required chair/room is free
AND procedure duration fits
AND booking rule permits that time
```

---

# 14. Visiting & On-Call Specialist Workflow

## 14.1 Why this must exist in the architecture

Small clinics may rely on specialists who are not permanently present. The scheduler should not show an on-call specialist as automatically available just because they are registered in the system.

## 14.2 Specialist request state machine

Example:

```text
DRAFT
→ SENT
→ VIEWED (if channel supports it)
→ ACCEPTED
→ ASSIGNED

or
→ DECLINED
→ ALTERNATE_TIME_REQUESTED
→ EXPIRED
→ CANCELLED
```

## 14.3 Specialist request fields

- clinic;
- patient;
- related appointment/request;
- required specialty;
- requested provider;
- requested date/time/window;
- minimal case description appropriate for the communication channel;
- request channel;
- status;
- response;
- expiration;
- audit metadata.

## 14.4 Privacy principle

Do not send full patient clinical history by unsecured notification just because a specialist is being asked about availability.

Availability request and clinical-case access are separate steps.

After assignment and authorization, the specialist can access only the information appropriate for the case and clinic policy.

## 14.5 No Google requirement

An on-call provider should work even without a Google Calendar connection.

Possible paths:

```text
Connected provider → check free/busy + request confirmation as needed
Unconnected provider → send request via configured channel
```

---

# 15. Google Calendar Integration

## 15.1 Architectural role

Google Calendar is a convenience/synchronization integration, **not** the appointment source of truth.

Authoritative appointment state lives in the EMR.

## 15.2 Per-provider connection

Each dentist/provider can optionally connect their own Google account/calendar.

Store:

- provider;
- Google account identifier as required;
- selected calendar ID;
- encrypted/protected OAuth credentials/tokens;
- token expiry/refresh metadata;
- integration status;
- last successful sync/check;
- error state.

Never expose refresh tokens to the browser or logs.

## 15.3 EMR → Google Calendar

When an eligible EMR appointment is created/updated/cancelled:

- create/update/delete or appropriately mark the matching Google event;
- preserve mapping between EMR appointment and Google event;
- use idempotency so retries do not create duplicate events;
- store sync failure and retry status.

Google Calendar supports user-created event IDs; this can help maintain stable mapping/idempotency when used according to Google’s requirements.

## 15.4 Google Calendar → EMR availability

Do **not** automatically convert arbitrary personal Google events into patient appointments.

Use Google free/busy to block availability without reading unnecessary event details where possible.

Reception view:

```text
13:00–14:00 UNAVAILABLE
```

not:

```text
13:00 Dentist meeting with lawyer
```

## 15.5 Calendar event privacy modes

Clinic/provider should be able to configure event-title detail.

### High Privacy

`Dental Appointment`

### Balanced / Procedure-only

`Cleaning`
`Root Canal`
`Ortho Adjustment`

### Detailed

`Maria S. — Root Canal`

Because procedure information can itself reveal health-related information, the application should default conservatively and require deliberate clinic selection for more detailed modes.

Never place:

- full medical history;
- diagnosis narrative;
- detailed clinical notes;
- sensitive images;
- unnecessary personal information

in Google Calendar event descriptions.

## 15.6 Sync failure behavior

A failed Google sync must **not** cause the EMR appointment to disappear or fail silently.

The appointment remains authoritative and the integration shows an actionable warning/retry state.

## 15.7 Webhooks/push notifications

Google Calendar supports push notifications. If implemented, use them only for the scoped integration behavior and validate incoming notifications/signals. Also maintain periodic reconciliation because webhooks should not be the sole correctness mechanism.

---

# 16. Automation & Notification Engine

Automation must be a first-class architecture component, not scattered `sendEmail()` calls embedded in UI routes.

## 16.1 Domain events

Potential events:

```text
PatientCreated
PatientUpdated
AppointmentRequested
AppointmentCreated
AppointmentScheduled
AppointmentConfirmed
AppointmentRescheduled
AppointmentCancelled
PatientCheckedIn
AppointmentCompleted
AppointmentNoShow
ProviderAssigned
SpecialistRequested
SpecialistAccepted
TreatmentPlanCreated
TreatmentPlanAcknowledged
TreatmentCompleted
RecallCreated
RecallDue
DocumentGenerated
PatientRecordExported
PaymentRecorded
```

## 16.2 Event consumers/actions

An event may trigger:

- queue a notification;
- create/update Google event;
- schedule future reminder;
- cancel obsolete reminder jobs;
- create recall;
- create audit event;
- update analytics projection;
- notify staff/provider;
- trigger document workflow.

## 16.3 Durable background jobs

Reminder and integration work should be durable, retryable, and observable.

If Supabase remains the selected platform, current Supabase Queues/PGMQ and Cron are possible building blocks. Final queue/worker design should be selected during technical architecture planning based on delivery guarantees, operational complexity, and workload.

## 16.4 Idempotency

Every external side-effect job must be safe to retry.

Examples:

- SMS reminder should not send twice because a worker crashed after provider response;
- Google Calendar event should not duplicate after network timeout;
- confirmation email should have an idempotency key tied to appointment + reminder type/version.

## 16.5 Retry policy

For external integrations:

- retry transient errors with backoff;
- do not retry permanent validation errors forever;
- dead-letter/failure state after threshold;
- surface failures in admin dashboard;
- retain provider response IDs where useful.

---

# 17. Patient Appointment Reminder Workflow

Default rules should be configurable per clinic.

## 17.1 Immediately after booking

Send confirmation via enabled channels.

Content may include:

- clinic name;
- date/time;
- assigned dentist if appropriate;
- clinic location;
- confirm/cancel/reschedule action link;
- minimal necessary procedure information based on privacy setting;
- instructions.

## 17.2 48 hours before

Optional default:

- reminder;
- confirmation request;
- actions: Confirm / Request Reschedule / Cancel.

## 17.3 24 hours before

If unconfirmed, send another reminder according to clinic policy.

Dashboard should visually distinguish unconfirmed appointments.

## 17.4 Same-day reminder

Optional configurable reminder, e.g. two hours before.

## 17.5 Dentist/staff schedule digests

Optional:

### Evening summary

- tomorrow’s patient count;
- confirmed/unconfirmed count;
- new patients;
- specialist cases;
- schedule gaps.

### Morning summary

- today’s appointments;
- relevant schedule changes;
- unconfirmed patients;
- waiting specialist requests.

## 17.6 Channel preference/fallback

Patient preferences might be:

- Messenger;
- SMS;
- email;
- future push notification.

Fallback rules should be clinic-configurable and consent/privacy-aware.

---

# 18. Communication Center: SMS, Email & Messenger

## 18.1 Unified communication history

Patient profile should show authorized communication events:

```text
Aug 19 — SMS reminder — Delivered
Aug 18 — Confirmation request — Confirmed
Aug 12 — Booking email — Delivered
```

Staff should be able to answer: **“Did we actually remind this patient?”**

## 18.2 Provider abstraction

Application code should not be tightly coupled to one vendor.

Conceptual interface:

```text
NotificationService
- sendSMS(...)
- sendEmail(...)
- sendMessenger(...)
```

Provider adapters handle vendor-specific APIs.

## 18.3 SMS

Requirements:

- Philippine-number normalization;
- sender-ID/compliance configuration;
- delivery status where supported;
- failed-message tracking;
- retry behavior;
- cost metrics later;
- templates;
- no sensitive clinical details in ordinary reminder text.

Evaluate Philippine SMS providers during implementation. Do not hard-code one vendor into the domain model.

## 18.4 Email

Transactional email types:

- appointment confirmation;
- reminder;
- cancellation;
- reschedule;
- intake link;
- treatment-plan/document delivery;
- recall reminder;
- specialist request;
- staff invitation;
- password reset;
- dentist daily digest.

## 18.5 Facebook Messenger

Messenger is strategically important for the first target clinic because patients may discover/book the clinic through Facebook.

Meta’s Messenger Platform supports automated/business messaging and utility messaging use cases such as appointment reminders, subject to Meta’s current policies, permissions, user-initiation rules, template requirements, review/access level, and messaging windows.

### MVP approach

Do **not** make Messenger integration a blocking dependency for the initial secure EMR core.

First build:

- website booking;
- SMS/email abstraction;
- communication logs;
- appointment automation.

Then integrate Messenger as another channel through the same notification/booking domain.

### Future Messenger booking assistant

Potential flow:

```text
Patient messages clinic Page
→ automated greeting
→ ask service / preferred date
→ fetch safe availability
→ offer slots
→ collect minimal details
→ create REQUESTED appointment
→ staff approves if needed
```

Do not expose patient records through Messenger chat without a specifically reviewed secure workflow.

## 18.6 Communication preferences

Keep operational and marketing communications conceptually separate.

Example:

```text
SMS appointment reminders: ON
Email appointment reminders: ON
Messenger reminders: ON
Recall reminders: ON
Marketing/promotions: OFF
```

---

# 19. Clinic Website

The clinic currently has no dedicated website; this project includes creation of the public website.

## 19.1 Website goals

### Discovery/marketing

- establish professional web presence;
- explain services;
- show dentists and specialties;
- show location/contact/hours;
- improve Google/search discoverability;
- provide trustworthy clinic information;
- direct users to booking or Messenger.

### Patient action

- request/book appointments;
- choose service/provider;
- choose “any available dentist”;
- request specialist consultation;
- manage appointment via secure links;
- eventually complete intake forms.

## 19.2 Suggested public information architecture

```text
Home
About the Clinic
Dentists / Specialists
Services
Book Appointment
Patient Information / FAQs
Contact
Location / Map
Privacy Notice
```

Future:

- dental educational content;
- post-op instruction pages;
- patient portal;
- secure document access.

## 19.3 Website and EMR relationship

Prefer one repository/monorepo initially if operationally convenient, but preserve architectural separation between:

- **public website surface**;
- **private EMR surface**;
- **shared domain/server packages**.

The public site should call controlled booking/public APIs rather than directly querying sensitive clinical tables.

## 19.4 Public data from EMR

Provider profiles and services may be managed once inside the EMR/admin configuration and published to the website.

Example provider fields:

- public display name;
- specialty;
- bio;
- photo;
- website visible?;
- online booking enabled?;
- public clinic schedule representation (not exposing private calendar details).

---

# 20. Website Appointment Integration

## 20.1 No separate website appointment database

Bad architecture:

```text
Website DB + EMR DB + Google Calendar
```

Preferred:

```text
Website UI
  → Public Booking API
    → Scheduling Domain
      → EMR/PostgreSQL
        → Automation / Google Calendar
```

## 20.2 Booking flow

### Step 1: New or existing patient

- New patient
- Existing patient

### Step 2: Service/procedure

Use public-enabled procedure catalog.

### Step 3: Provider preference

- any available dentist;
- specific eligible provider;
- specialist request if required.

### Step 4: Date/time

Offer only server-validated availability.

### Step 5: Minimal contact details

For new patient:

- name;
- mobile;
- email optional/required by clinic;
- service;
- preferred slot;
- acquisition/referral question.

Do not force full medical history before a patient can request an appointment.

### Step 6: Create appointment/request

Depending on service policy:

- instant booking;
- approval-required request;
- specialist request.

## 20.3 Existing-patient matching

Do not allow anonymous public search of the patient directory.

Potential controlled matching:

- secure magic link to known contact;
- authenticated portal later;
- minimal verification such as phone/DOB, implemented carefully to avoid patient enumeration.

## 20.4 Instant booking vs request mode

### Instant booking

Suitable for routine services with predictable duration/provider availability.

### Request booking

Suitable for:

- on-call specialists;
- procedures needing clinical review;
- uncertain duration;
- complex cases.

Clinic config determines mode by procedure/provider.

## 20.5 Website appointment management links

Confirmation may include a signed, expiring secure link for:

- confirm;
- cancel;
- request reschedule.

Tokens must be:

- unguessable;
- purpose-specific;
- expiration-aware;
- revocable/rotatable as appropriate;
- not reveal patient data in URL query text.

---

# 21. Walk-in, Check-in & Queue Management

## 21.1 Walk-in flow

Reception should have a dedicated `+ Walk-in` action.

```text
Walk-in arrives
→ identify existing/new patient
→ quick registration if needed
→ create visit/appointment entry
→ assign queue status
→ assign provider/chair as appropriate
```

Do not pretend a walk-in had a pre-existing scheduled appointment.

## 21.2 Queue statuses

Possible operational statuses:

- waiting;
- ready/triaged;
- called;
- in chair;
- completed;
- left/cancelled.

Keep appointment lifecycle and queue state separate enough to avoid confusing semantics.

## 21.3 Waitlist

Future feature:

When an appointment cancels, eligible patients on a waiting list may be offered the slot according to clinic policy.

Do not auto-reschedule without explicit patient confirmation.

---


# 22. Clinical Dental EMR

## 22.1 Clinical encounter

A clinical encounter should link:

- patient;
- appointment/visit when applicable;
- treating provider(s);
- date/time;
- chair/location;
- chief complaint;
- examination/findings;
- diagnosis/assessment;
- procedures performed;
- treatment recommendations;
- clinical notes;
- attachments/images;
- prescriptions;
- follow-up/recall;
- finalized/signed status.

## 22.2 Clinical notes

Support dentist-friendly note patterns without forcing one rigid format.

Potential note types:

- SOAP;
- progress note;
- procedure note;
- consultation note;
- free-form structured note;
- post-op note;
- referral note.

Templates can speed documentation but should never silently claim an action/discussion occurred when it did not.

## 22.3 Finalization and amendment

Clinical notes should support:

- draft;
- finalized/signed;
- amendment/addendum.

After finalization, avoid silent destructive edits. Use addendum/version history when appropriate.

## 22.4 Odontogram / dental chart

The odontogram is a **required part of the first clinically usable version**, not merely a distant enhancement.

The selected prototype direction is `react-advanced-odontogram`, using the project-controlled fork `Ditherys/React-Odontogram-Modul` (`https://github.com/Ditherys/React-Odontogram-Modul`). The original upstream remains `ZoliQua/React-Odontogram-Modul`; simpler `biomathcode/odontogram` and `biomathcode/react-odontogram` remain fallback/reference candidates. The fork must still pass the clinical/touch/security/data-mapping prototype gate. Our database/domain model remains independent of any specific third-party component so the renderer can be modified, fork-maintained, or replaced later without migrating canonical patient chart data.

Requirements to validate with dentists:

- FDI tooth numbering as a likely Philippine default;
- permanent/primary dentition;
- missing teeth;
- restorations;
- caries/findings;
- crowns/bridges;
- endodontic status;
- implants;
- planned vs completed treatments;
- referred procedures;
- historical state/timeline;
- color/visual conventions.

Do not invent clinical codes or color conventions without dentist validation.

## 22.5 Treatment status on chart

Visual distinction should exist between:

- existing condition;
- proposed/planned treatment;
- completed treatment;
- referred-out treatment;
- declined treatment where relevant.

## 22.6 Clinical timeline integrity

A later chart change must not erase what the dentist documented historically. Preserve effective date/event history.

---

# 23. Treatment Plans

## 23.1 Treatment plan entity

A treatment plan can contain:

- patient;
- authoring dentist;
- created date;
- problem/diagnosis summary;
- procedures/items;
- tooth/surface references;
- sequencing/phases;
- alternatives;
- estimated costs;
- notes;
- status;
- discussion records;
- acknowledgment/consent references;
- version.

## 23.2 Treatment plan statuses

Potential statuses:

```text
DRAFT
PRESENTED
PARTIALLY_ACCEPTED
ACCEPTED
DECLINED
SUPERSEDED
COMPLETED
```

Final statuses should be validated with actual dentist workflow.

## 23.3 Treatment alternatives

System should support more than one option.

Example:

```text
Option A — Save tooth via RCT + crown
Option B — Extraction + replacement option
Option C — No treatment / monitor (if clinically appropriate)
```

The software does not make clinical recommendations; the dentist records them.

## 23.4 Treatment-plan versioning

If a plan has been presented/acknowledged and later materially changes, preserve the previous version.

Example:

```text
TP-0028 v1 — Presented Aug 10
TP-0028 v2 — Revised Aug 15
```

---

# 24. Treatment Discussion Canvas & Visual Patient Education

This is a strategic dental-specific feature.

## 24.1 Purpose

Many dentists explain treatment visually. The product should allow the dentist to draw or annotate during consultation and preserve the result in the patient record.

Use cases:

- circle affected tooth;
- explain root canal;
- draw bridge/implant alternatives;
- explain orthodontic movement;
- annotate X-ray;
- show periodontal problem areas;
- compare treatment options;
- mark planned restoration/extraction areas.

## 24.2 Entry points

Launch from:

- treatment plan;
- clinical encounter;
- odontogram;
- image/X-ray viewer;
- patient record.

## 24.3 Canvas starting templates

- Blank canvas
- Tooth diagram
- Odontogram snapshot
- X-ray/image
- Patient photo
- Reusable education template later

## 24.4 Drawing tools

MVP:

- pen;
- eraser;
- undo/redo;
- text;
- arrow;
- circle/rectangle;
- highlighter;
- zoom/pan as necessary.

Later:

- layers;
- standardized dental symbols;
- reusable stamps;
- side-by-side option comparison;
- stylus pressure support where practical.

## 24.5 Save semantics

A saved drawing should become a clinical/document object, not transient canvas state.

Record:

- patient;
- dentist/provider;
- timestamp;
- linked encounter;
- linked treatment plan;
- base image/template;
- drawing data/vector representation if supported;
- rendered preview;
- discussion summary;
- version/finalization state.

## 24.6 Treatment discussion documentation

The drawing is **supporting documentation**, not automatically proof that legally valid informed consent occurred.

A stronger record includes:

- treatment plan;
- drawing/visual explanation;
- alternatives discussed;
- risks/benefits discussion note as appropriate;
- patient questions;
- dentist identity;
- timestamp;
- acknowledgment/signature where appropriate.

## 24.7 Patient acknowledgment

Optional workflow after discussion:

```text
I acknowledge that the treatment options were discussed with me and I had the opportunity to ask questions.

[Patient signature/initial]
[Dentist signature]
[Date/time]
```

Wording/templates must be validated for Philippine clinical/legal use before production.

## 24.8 Print/PDF integration

Allow:

- print drawing only;
- include drawing in treatment plan;
- include in a Treatment Discussion Sheet;
- export annotated X-ray/image;
- include in patient-record export when selected.

---

# 25. Consent, Acknowledgment & Informed Refusal Support

## 25.1 Product stance

Software should facilitate documentation; it should not reduce consent to “patient clicked a checkbox.”

Dental professional guidance internationally emphasizes that informed consent is a discussion/process. The system should therefore support recording that discussion and related documentation.

## 25.2 Consent components

Depending on clinic/procedure:

- procedure-specific form;
- explanation of treatment;
- risks/benefits;
- alternatives;
- opportunity for questions;
- patient/guardian identity;
- dentist identity;
- signature(s);
- witness if required by clinic policy;
- date/time;
- related treatment plan;
- version of the form/template used.

## 25.3 Informed refusal

Support documenting patient refusal/decline of recommended treatment:

- recommendation;
- relevant risk discussion;
- patient decision;
- dentist note;
- acknowledgment/signature as appropriate.

## 25.4 Digital and paper support

Workflow options:

- sign on tablet/device;
- send secure form link;
- print → physically sign → scan/upload;
- digitally generate PDF for printing.

Do not force clinics into one transition strategy.

---

# 26. Document, PDF & Print Management

This module is a major requirement because the target dentist wants digital records **and** the ability to print.

## 26.1 Architecture

Do not store the patient’s authoritative record only as a PDF.

Preferred flow:

```text
Structured Database Records
→ Document Renderer
→ Versioned PDF / Print Output
```

The database remains authoritative; PDFs are outputs/snapshots.

## 26.2 Document Center

Patient UI should have a Documents area where authorized users can generate standardized outputs.

### Clinical documents

- Patient Record Summary
- Medical History
- Dental History
- Treatment History
- Clinical/Progress Notes as permitted
- Odontogram/Dental Chart
- Treatment Plan
- Treatment Discussion Sheet
- Treatment Plan Packet with Drawing
- Prescription
- Post-operative Instructions
- Annotated Image/X-ray

### Administrative documents

- Consent Form
- Informed Refusal Form
- Dental/Medical Certificate as applicable
- Referral Letter
- X-ray/Radiograph Request
- Laboratory Request
- Appointment Slip
- Patient intake/history form

### Financial documents

- Treatment Estimate
- Statement of Account
- Account Ledger
- Payment acknowledgment/receipt depending on compliant process
- Tax Invoice only after BIR-compliant invoicing design is completed

## 26.3 Configurable patient-record export

Do not blindly export everything.

Example options:

```text
Include:
[x] Demographics
[x] Medical history
[x] Dental history
[x] Odontogram
[x] Treatment history
[x] Clinical notes
[x] Prescriptions
[x] Selected images
[ ] Billing
[ ] Internal operational notes
[ ] Communication history

Date range: All / Custom
```

Sensitive export should require permission and create audit events.

## 26.4 Document templates

Clinic template settings:

- logo;
- clinic name;
- address/contact;
- dentist information;
- professional details required by applicable rules;
- header/footer;
- paper size (A4, Letter, etc.);
- signature block;
- confidentiality footer;
- numbering rules;
- language/template variants later.

## 26.5 Output actions

- Preview
- Print
- Download PDF
- Send via secure email/link where appropriate
- Save snapshot/version to record

## 26.6 Versioning/finalization

A formally signed/issued document should not be silently regenerated to show later-edited data while pretending it is the original.

Store immutable snapshot metadata for issued/finalized documents.

## 26.7 Export/print audit

At minimum consider logging:

- user;
- patient;
- document type;
- generated/exported/printed action where feasible;
- time;
- purpose/reason for especially sensitive record export where clinic policy requires it.

---

# 27. Billing, Payments & BIR Boundary

## 27.1 Separate concepts

### Treatment estimate

Estimated future treatment cost. Not necessarily a tax invoice.

### Statement of Account

Charges, payments, and balance.

### Payment record

Internal record of payment transaction.

### Tax invoice

Regulated business document. Must follow current BIR requirements applicable to the clinic.

## 27.2 MVP safety boundary

Do not label an ordinary generated PDF as a BIR-compliant invoice unless the invoicing module has been specifically designed and validated against current BIR rules.

MVP can safely focus on:

- treatment estimates;
- statement of account;
- internal payment ledger;
- payment method/status;
- export to clinic’s existing compliant invoicing workflow if necessary.

## 27.3 Current BIR research note

As of the research date, BIR Revenue Regulations No. 26-2025 extended the electronic-invoicing compliance period for specified covered taxpayers to December 31, 2026. Applicability depends on taxpayer classification/system/use case. Re-check BIR rules immediately before implementing production invoicing.

## 27.4 Future billing features

- treatment-plan estimate to charge conversion;
- partial payments;
- deposits;
- discounts with permission;
- payment methods;
- receivables;
- aging;
- HMO workflows later;
- BIR-compliant invoice module after legal/accounting design.

---

# 28. File, X-ray, Photo & Attachment Management

## 28.1 Supported categories

- X-ray/radiograph;
- CBCT report/files where technically appropriate;
- intraoral photo;
- clinical photo;
- scanned paper record;
- signed consent;
- referral document;
- lab result;
- external PDF;
- other clinical attachment.

## 28.2 Metadata

- patient;
- uploader;
- capture/upload date;
- document/image type;
- related encounter/treatment;
- description;
- sensitivity/access classification;
- storage object path/key;
- checksum if useful;
- version/replacement semantics.

## 28.3 Storage security

Primary private clinical-object store: **Cloudflare R2**.

- private buckets by default;
- no guessable public URLs;
- short-lived signed/presigned URLs only after authorization;
- opaque object keys that do not contain patient names/diagnoses;
- encryption in transit/at rest through provider controls;
- originals treated as immutable by application convention;
- “replacement” creates a new file/version instead of silently overwriting the old clinical object;
- soft-delete/void before physical deletion;
- retention/bucket-lock rules for high-value clinical prefixes where appropriate;
- malware scanning strategy for general uploads where feasible;
- file-type and size validation;
- image processing must not expose source files publicly;
- Cloudflare R2 is the canonical object store for both private clinical files and project-controlled public marketing media;
- Cloudflare Workers + Cloudflare Images are the preferred image optimization/derivative pipeline rather than Cloudinary;
- clinical originals are preserved unchanged as the authoritative source object;
- lossy WebP/AVIF/JPEG derivatives are display artifacts only and must never become the sole clinical copy;
- use a bounded set of variants such as `thumbnail`, `preview`, and `display` rather than arbitrary transformation parameters;
- X-ray originals remain untouched; any browser-friendly preview is explicitly a derivative;
- private clinical transformations must operate through an authorized server/Worker path and must not make the source object public;
- transformed responses should be cached where appropriate so repeated views do not repeatedly decode/re-encode the same image;
- asynchronous derivative generation may use R2 object-create notifications + Cloudflare Queues + a consumer Worker when that becomes operationally useful.

Cloudinary is **not a default project dependency**. Reconsider it only through an ADR if a future requirement cannot be met reasonably by R2 + Cloudflare Workers/Images.

Full CBCT/DICOM studies are explicitly out of the initial storage scope; support reports, selected exported images, or external references first.

## 28.4 Annotation

MVP 2 may allow dentists to annotate X-rays/photos using the same treatment-discussion canvas architecture while preserving the original image separately.

---

# 29. Follow-up, Recall & Patient Retention

## 29.1 Recall entity

A recall/follow-up should be a structured future-care reminder, not just a text note.

Possible fields:

- patient;
- originating treatment/procedure;
- due date/window;
- recommended service;
- responsible provider/specialty;
- status;
- reminder sequence;
- booked appointment link;
- completion/cancellation reason.

## 29.2 Recall rules

Examples to validate clinically:

- routine cleaning follow-up;
- orthodontic adjustment;
- extraction post-op;
- implant follow-up;
- RCT follow-up;
- periodontal maintenance.

The dentist/clinic defines rules; the software does not independently prescribe care intervals.

## 29.3 Recall states

Potential:

```text
SCHEDULED
UPCOMING
CONTACTED
BOOKED
COMPLETED
DECLINED
UNREACHABLE
CANCELLED
```

## 29.4 Automation

```text
TreatmentCompleted
→ evaluate configured recall rule
→ create recall
→ schedule future contact
→ patient receives reminder near due date
→ patient books
→ recall linked to appointment
```

## 29.5 Retention analytics

Future:

- recall completion rate;
- overdue recall count;
- source/referral retention;
- reactivation campaigns;
- repeat-visit interval.

---

# 30. Referral Management Beyond Acquisition

## 30.1 Incoming professional referral

Record external provider who sent patient and reason/case.

## 30.2 Outgoing referral

Dentist can create referral from patient record:

- specialty;
- target provider/clinic;
- reason;
- urgency;
- included clinical summary;
- selected attachments;
- status;
- follow-up.

## 30.3 Referral letter generation

Generate print/PDF letter using selected patient information. Never attach more patient data than necessary.

## 30.4 Referral status

Potential:

```text
DRAFT
SENT
RECEIVED
APPOINTMENT_BOOKED
REPORT_RECEIVED
COMPLETED
CLOSED
```

## 30.5 Specialist integration

An on-call dentist working inside the clinic is not necessarily the same as an external referral destination. Keep those workflows distinct even if they share provider-directory components.

---

# 31. Analytics & Reporting

Analytics should start with operationally useful questions rather than vanity dashboards.

## 31.1 Daily operations dashboard

Questions:

- Who are today’s patients?
- Which provider sees each patient?
- Which appointments are confirmed?
- Which are unconfirmed?
- Which patients are checked in?
- Which chairs are occupied/free?
- Which specialist requests are pending?
- Which integration/reminder jobs failed?

## 31.2 Appointment analytics

Metrics:

- scheduled appointments;
- completed appointments;
- cancellation rate;
- no-show rate;
- confirmation rate;
- reschedule rate;
- average lead time;
- utilization by provider/chair/time slot;
- booking channel.

## 31.3 Acquisition analytics

- new patients by acquisition source;
- new patients by booking channel;
- website-origin appointments;
- patient referral counts;
- professional referral counts;
- acquisition-to-completed-appointment conversion.

## 31.4 Referral analytics

- top referring patients;
- top referring dentists/providers;
- referred-patient completion rate;
- referral case type;
- outgoing referral status.

## 31.5 Acquisition quality

Later, when financial/treatment data is reliable:

```text
Source
→ New Patients
→ Show Rate
→ Treatment Acceptance
→ Completed Treatment
→ Production
→ Collections
→ Repeat Visits
```

Example insight:

Facebook may create many inquiries while dentist referrals create fewer but higher-value specialty cases.

## 31.6 Marketing ROI

Future optional module:

- campaign spend;
- campaign attribution;
- cost per booked appointment;
- cost per acquired patient;
- production/collections attributable to campaign.

Do not overclaim attribution when patients have multiple touchpoints.

## 31.7 Provider analytics

Potential:

- appointment volume;
- completed procedures;
- schedule utilization;
- no-show/cancellation exposure;
- chair utilization;
- recall completion;
- patient volume.

Avoid using simplistic metrics as clinical-quality scores.

## 31.8 Reporting exports

Support CSV/PDF where appropriate, with permissions and audit for sensitive reports.

---

# 32. Security & Privacy Architecture

This is a high-risk healthcare-data system. Security cannot be deferred until “after MVP.”

## 32.1 Data classification

### Highly sensitive clinical data

- health/medical history;
- dental records;
- clinical notes;
- treatment;
- images/X-rays;
- prescriptions;
- consent documentation.

### Sensitive identity/contact data

- name;
- DOB;
- phone;
- address;
- guardian/contact info.

### Operational data

- appointment slots;
- provider schedules;
- chair schedules.

Even operational data can become sensitive when linked to identifiable patients.

## 32.2 Philippine Data Privacy Act principles to design around

Current NPC materials emphasize, among other things:

- health information as sensitive personal information;
- transparency;
- legitimate/specified purpose;
- proportionality/data minimization;
- accuracy/data quality;
- appropriate security safeguards;
- retention only as necessary.

The application should make these principles technically achievable but the clinic still needs organizational policies and lawful processing practices.

## 32.3 Row Level Security / database authorization

If using Supabase, enable RLS on every exposed tenant/patient table and write explicit policies. Supabase’s current documentation states that RLS should be enabled on tables in exposed schemas and service-role/bypass credentials must never be exposed to customers/browsers.

Use server authorization **in addition to** RLS for complex business operations.

## 32.4 Service-role keys

- server only;
- never in client bundle;
- never in Git;
- never in screenshots/prompts;
- rotate if exposure suspected.

## 32.5 Secret management

Use deployment secret stores/environment variables. Separate dev/staging/prod credentials.

## 32.6 Logging policy

Logs must avoid:

- full clinical note bodies;
- access tokens;
- passwords;
- refresh tokens;
- full patient exports;
- unnecessary PII.

Use IDs and redacted metadata.

## 32.7 Rate limiting

Especially protect:

- login;
- password reset;
- public booking;
- appointment-management links;
- patient matching;
- file links;
- messaging endpoints;
- webhook endpoints.

## 32.8 CSRF/XSS/SQL injection

Follow framework/platform secure defaults but test explicitly. Never trust rich-text/drawing metadata from browsers without validation/sanitization.

## 32.9 Public booking abuse

Mitigations:

- rate limiting;
- bot protection when needed;
- email/phone verification depending on abuse risk;
- temporary slot holds;
- duplicate booking detection;
- suspicious activity monitoring.

## 32.10 Session/device security

Consider:

- automatic session timeout suitable for clinic workflow;
- re-authentication for high-risk operations;
- session revocation;
- MFA;
- device/session list later.

## 32.11 Backup & recovery

Before production patient data:

- automated database backups;
- storage backup/retention strategy;
- restoration procedure;
- documented RPO/RTO target;
- periodic restore test;
- encrypted backup handling.

A backup that has never been restored is not a proven recovery plan.

## 32.12 Data retention/deletion

Do not invent a retention period in code. Create configurable/legal-policy hooks and validate Philippine dental/medical/professional retention obligations before production.

## 32.13 Patient record export/access

Provide controlled export functionality to support legitimate patient requests and clinic operations. Verify identity/authorization operationally before disclosure.

---

# 33. Audit Logging & History

## 33.1 Audit-event design

Audit entry should include:

- event ID;
- clinic;
- actor user/system/integration;
- actor role/context;
- action;
- target object type/ID;
- timestamp;
- success/failure;
- minimal metadata;
- request/session correlation ID when helpful.

## 33.2 Important audited events

- patient created/merged;
- clinical note finalized/amended;
- treatment plan finalized/acknowledged;
- consent signed;
- patient record exported;
- file downloaded where required;
- provider assignment changed;
- appointment cancelled/rescheduled;
- roles/permissions changed;
- integration connected/disconnected;
- Google token/integration state changes (not token values);
- document generated/issued;
- billing adjustments;
- audit-log access by administrators.

## 33.3 Append-only expectations

Audit logs should be append-oriented. Normal users should not edit/delete them.

## 33.4 Status history

Separate domain history tables may be better than trying to reconstruct all business history from generic audit events.

Examples:

- `appointment_status_history`
- `specialist_request_status_history`
- `treatment_plan_versions`

---

# 34. Approved Technical Direction

The detailed engineering architecture now lives in the companion file `TECHNICAL_ARCHITECTURE.md`. That document is authoritative for implementation structure unless superseded by an approved ADR.

## 34.1 Approved stack

- **Frontend / full-stack framework:** Next.js App Router + React + TypeScript
- **Frontend design/component system:** Tailwind CSS + shadcn/ui + Lucide React; full decisions in `FRONTEND_ARCHITECTURE.md`
- **Forms/validation:** React Hook Form + Zod
- **Interactive server state:** TanStack Query selectively; Server Components remain the default for initial/read-oriented data
- **Complex tables:** TanStack Table; TanStack Virtual only when profiling justifies it
- **Scheduling UI:** DayPilot Lite for the prototype behind an application adapter
- **Treatment drawing:** Konva + react-konva
- **Signature capture:** signature_pad
- **Analytics charts:** Apache ECharts
- **Generated PDF templates:** @react-pdf/renderer; pdf-lib only when PDF manipulation/merging is required
- **Database:** PostgreSQL
- **Backend platform:** Supabase Cloud (development/test/production projects separated by environment)
- **Authentication:** Supabase Auth
- **Authorization:** application-layer authorization + PostgreSQL/Supabase RLS defense in depth
- **Hosting:** Vercel
- **Private patient/clinical files:** Cloudflare R2
- **Image optimization/delivery:** Cloudflare Workers + Cloudflare Images over R2; Cloudinary is not a default dependency
- **Google scheduling integration:** Google Calendar API
- **Email:** provider adapter, vendor selected later
- **SMS:** Philippine-capable provider adapter, vendor selected later
- **Messenger:** manual in MVP; Meta Messenger Platform integration later
- **Background jobs:** durable PostgreSQL job/outbox model with Supabase Cron/pg_cron + worker/Edge Function execution as appropriate

Use current stable compatible versions at repository initialization after dependency/security review. Do not hard-code product requirements to a library version.

## 34.2 Confirmed two-branch architecture

The first customer is one organization with two branches under the same owner. The application is nevertheless designed as future multi-tenant SaaS.

```text
Platform
└── Organization / Dental Business
    ├── Branch A
    └── Branch B
```

- patients are organization-level and can receive care at either branch;
- appointments/encounters/charges/resources/inventory movements retain branch attribution;
- providers can work across branches;
- provider time conflicts are checked organization-wide;
- resources/equipment are branch-specific;
- organization analytics combine branches with filters;
- patient balance may be shared organization-wide while charges and payments preserve branch attribution.

## 34.3 Public website / private EMR boundary

The public website and private EMR may initially share one Next.js repository, but they are separate trust zones. Public booking uses purpose-built server endpoints and never receives broad patient-table access.

## 34.4 File storage decision

Use **Cloudflare R2** as the canonical object store for clinical files such as photos, ordinary X-ray exports, scans, signed PDFs, drawings, and attachments, and for project-controlled public marketing media when practical. Private files are accessed through permission-checked, short-lived delivery or a permission-checked server/Worker path. Object names must be opaque and must not expose patient names or treatment details.

For raster images, preserve the uploaded original unchanged. Generate bounded optimized derivatives (`thumbnail`, `preview`, `display`) through **Cloudflare Workers + Cloudflare Images**. Derivatives may use modern formats such as WebP/AVIF where clinically and visually appropriate, but they are never the sole clinical record copy. X-ray originals remain untouched; preview derivatives are for UI delivery only. Cache transformed outputs and/or persist reusable derivatives in R2 where that reduces repeated transformation work.

A later asynchronous pipeline may use **R2 event notifications → Cloudflare Queue → consumer Worker → Cloudflare Images → derivative objects in R2**, with idempotent processing and database status tracking.

Avoid full CBCT/DICOM storage in the first version. Store reports, selected images/screenshots, or external-study references initially. Full DICOM support requires a later dedicated imaging architecture.

Cloudinary is not a default dependency. Add it only through a future ADR if Cloudflare-native storage/processing cannot satisfy a validated requirement.

## 34.5 Backup direction

Backup is layered rather than a manual “download everything” feature:

1. Supabase managed database backups on an appropriate paid production plan;
2. evaluate Point-in-Time Recovery when the required recovery point/budget justifies it;
3. periodic independent logical PostgreSQL dumps stored privately/off-site;
4. clinical objects stored privately in R2 with immutable-by-convention object handling, soft-delete, and retention/bucket-lock controls where appropriate;
5. routine restore tests to an isolated environment.

Database backups do not automatically recreate deleted object-storage files, so database and object recovery must be designed separately. Routine backups should run server-to-server and should not depend on branch internet bandwidth.

## 34.6 Odontogram technical direction

Odontogram is required in the first clinically usable release.

Frontend research now uses this prototype order:

1. `react-advanced-odontogram` — selected first clinical spike using our controlled fork `Ditherys/React-Odontogram-Modul` (upstream: `ZoliQua/React-Odontogram-Modul`) because its current feature set is closest to the required multi-surface, endodontic/prosthetic, periodontal, and FDI/Universal/Palmer workflows;
2. `biomathcode/odontogram` — simpler surface-level fallback/reference;
3. `biomathcode/react-odontogram` — useful React visualization/tooth-selection reference, but not assumed sufficient for full clinical surface charting.

No candidate is allowed to become the database schema. The application owns a renderer-independent odontogram domain model. A third-party component is only the UI/interaction layer, so the project can fork or replace it later without migrating every patient chart.

The acceptance criteria and frontend spike are defined in `FRONTEND_ARCHITECTURE.md`.

## 34.7 Treatment drawing direction

Treatment discussions target both iPad/stylus and laptop/mouse. Save:

- editable/versioned canvas/vector source data;
- rendered preview image;
- immutable formal PDF/snapshot when acknowledged/signed.

## 34.8 Pricing direction

There is no fixed procedure price. Procedures describe clinical/scheduling characteristics, while treatment-plan estimates and actual charges store patient/case-specific amounts with history and branch/provider attribution.

## 34.9 Messenger direction

Desired long-term communication priority is Messenger → SMS fallback → Email additional. MVP uses website booking plus manual Messenger. Automated Messenger is added later through the shared notification abstraction.

## 34.10 Detailed architecture

Before coding, agents must read `TECHNICAL_ARCHITECTURE.md`, especially for tenancy, branch logic, booking holds, storage, backup, inventory, authorization, event/outbox automation, and clinical versioning.

---

# 35. Domain Boundaries / Suggested Code Organization

Avoid one giant `lib/utils.ts` containing all logic.

Potential domain packages/modules:

```text
domains/
  clinic/
  auth/
  patients/
  providers/
  scheduling/
  resources/
  referrals/
  acquisition/
  communications/
  automations/
  calendar/
  clinical/
  treatment-plans/
  treatment-discussions/
  documents/
  billing/
  recalls/
  analytics/
  audit/
```

Each domain should own its business rules and expose deliberate service functions.

---

# 36. Conceptual Database Model

This is **not final SQL**. It is the planning inventory for schema design.

## 36.1 Organization / users

```text
organizations
clinics
users/profile metadata
clinic_members
roles
permissions
role_permissions
member_role_assignments
```

## 36.2 Providers

```text
providers
provider_clinic_memberships
specialties
provider_specialties
provider_availability_rules
provider_availability_exceptions
provider_time_off
provider_public_profiles
```

## 36.3 Patients

```text
patients
patient_contacts
patient_addresses
patient_guardians
patient_medical_histories
patient_allergies
patient_medications
patient_alerts
communication_preferences
```

Avoid over-normalizing tiny fields before real workflow validation, but do not place all clinical history into one unstructured JSON blob.

## 36.4 Acquisition/referrals

```text
acquisition_sources
booking_channels
patient_acquisitions
referrers
patient_referrals
professional_referrals
outgoing_referrals
marketing_campaigns (later)
acquisition_touchpoints (later)
```

## 36.5 Scheduling

```text
procedures
procedure_specialties
procedure_provider_eligibility (if needed)
appointments
appointment_providers
appointment_procedures
appointment_status_history
appointment_holds
clinic_resources
resource_types
appointment_resources
resource_blocks
```

## 36.6 Specialist workflow

```text
specialist_requests
specialist_request_status_history
```

## 36.7 Clinical

```text
clinical_encounters
clinical_notes
clinical_note_versions / amendments
odontogram_states / tooth_findings / tooth_procedures (design carefully)
treatments
prescriptions
```

Odontogram schema requires a dedicated design phase with dentist validation.

## 36.8 Treatment plans/discussions

```text
treatment_plans
treatment_plan_versions
treatment_plan_items
treatment_discussions
treatment_discussion_assets
treatment_discussion_acknowledgments
```

## 36.9 Files/documents

```text
patient_files
document_templates
documents
document_versions
document_signatures
consents
consent_versions
```

## 36.10 Communication/automation

```text
communications
communication_attempts
notification_templates
reminder_rules
scheduled_reminders
automation_jobs / queue references
webhook_receipts
```

## 36.11 Google integrations

```text
google_calendar_connections
google_calendar_event_mappings
integration_sync_state
integration_errors
```

## 36.12 Recall

```text
recall_rules
recalls
recall_contacts
```

## 36.13 Billing

```text
accounts / patient_accounts
charges
payments
payment_allocations
statements
invoices (only when compliant design approved)
```

## 36.14 Inventory & branch stock

```text
inventory_items
inventory_item_categories
branch_inventory_settings
inventory_movements
inventory_receipts
inventory_transfers
inventory_transfer_items
suppliers (later/optional)
```

Inventory and schedulable equipment are separate domains. Stock is branch-specific; movements should be append-oriented and support branch transfers.

## 36.15 Audit

```text
audit_events
security_events
```

## 36.16 Website

```text
website_settings
public_service_overrides
online_booking_rules
booking_request_metadata
appointment_management_tokens
```

---

# 37. API & Server Boundary Design

## 37.1 Public APIs

Only expose what anonymous users need:

- public clinic profile;
- public services;
- public providers;
- safe availability query;
- booking request/create;
- secure appointment management action via scoped token.

Never expose:

- patient search;
- clinical notes;
- internal provider personal calendar details;
- full clinic schedule;
- internal patient IDs if avoidable;
- unrestricted file URLs.

## 37.2 Authenticated staff APIs/server actions

Authorize clinic membership and capability for every operation.

Examples:

- create patient;
- edit demographics;
- schedule appointment;
- assign provider;
- finalize note;
- generate patient record;
- export PDF;
- connect calendar;
- send manual communication.

## 37.3 Integration webhooks

Webhook endpoints require:

- provider signature/token verification when available;
- replay/idempotency protection;
- payload validation;
- safe logging;
- async processing after quick acknowledgment when appropriate.

---

# 38. Nonfunctional Requirements

## 38.1 Availability

Clinic must still be able to view core schedule/patient data even if an external messaging or Google integration is temporarily failing.

## 38.2 Performance targets (initial)

To refine during architecture:

- common patient search should feel near-instant;
- daily schedule load should be fast on ordinary clinic internet;
- saving clinical notes should not block on SMS/Google API calls;
- external tasks run asynchronously;
- image/PDF generation progress should be understandable.

## 38.3 Accessibility

- keyboard-accessible forms;
- readable contrast;
- clear validation;
- touch-friendly tablet controls for dental-chair use;
- large enough drawing controls for stylus/touch.

## 38.4 Responsive design

Supported device classes:

- clinic desktop;
- laptop;
- iPad/tablet in portrait and landscape;
- modern mobile phones.

The private EMR must be intentionally responsive across all of these device classes. Mobile is not limited to a read-only fallback: common workflows such as authentication, branch switching, schedule/appointment work, patient lookup/summary, tasks, notifications, and appropriate simple forms/actions must be usable on phones.

Complex clinical work surfaces such as the complete odontogram editor, multi-resource scheduler, and treatment-discussion canvas may remain optimized for iPad/tablet and laptop/desktop because of information density and precision requirements. They must still provide a deliberate phone experience—such as a focused/full-screen or simplified workflow, safe viewing/context, and a clear alternative for any action that cannot be made clinically safe on a small screen. Do not simply squeeze the desktop layout onto a phone.

Responsive behavior must preserve authorization, clinical meaning, unsaved state where practical, touch accessibility, and access to critical actions. No critical workflow may rely solely on hover.

## 38.5 Timezone/date handling

- store timestamps with timezone-aware semantics;
- default clinic timezone `Asia/Manila`;
- display local clinic time;
- Google Calendar conversion must preserve timezone correctly;
- avoid naive timestamps.

## 38.6 Localization

MVP UI can be English, but architecture should not prevent:

- Tagalog/Filipino patient messages;
- bilingual forms;
- clinic-configurable templates.

---

# 39. Observability & Operations

## 39.1 Application logs

Structured logs with correlation IDs, but redacted patient content.

## 39.2 Error monitoring

Monitor:

- failed API routes/actions;
- worker crashes;
- PDF errors;
- Google sync failures;
- webhook failures;
- SMS/email delivery failures;
- auth/security anomalies.

## 39.3 Integration dashboard

Admin view:

```text
Google Calendar: Connected / Error
SMS Provider: Healthy / Failed sends
Email Provider: Healthy
Messenger: Connected / Pending Review
Queue backlog: Normal / High
Last successful reminder run: ...
```

## 39.4 Job monitoring

Track:

- queued;
- running;
- succeeded;
- failed;
- retry count;
- next retry;
- dead-letter/needs attention.

---

# 40. Testing Strategy

## 40.1 Unit tests

For pure business rules:

- slot computation;
- role/capability decisions;
- status transitions;
- reminder scheduling;
- acquisition mapping;
- recall rule evaluation;
- document data transformation.

## 40.2 Database/RLS tests

Mandatory high-priority tests:

- Clinic A cannot read Clinic B patients;
- receptionist cannot access restricted clinical fields if policy says no;
- visiting dentist can access assigned cases but not unrelated patients;
- anonymous user cannot query patient tables;
- service-role keys never appear client-side.

## 40.3 Integration tests

- create appointment transaction;
- double-book race prevention;
- reschedule releases old slot and reserves new;
- cancellation cancels pending reminders;
- Google sync idempotency;
- notification retry;
- secure booking link actions.

## 40.4 End-to-end tests

Critical user journeys:

1. New website patient books routine appointment.
2. Reception books patient from Messenger inquiry.
3. Walk-in patient registered and queued.
4. Existing patient reschedules.
5. Patient cancels and slot reopens.
6. On-call specialist request is accepted.
7. Dentist creates treatment plan + drawing + PDF.
8. Patient record exported by authorized user.
9. Unauthorized role is blocked.
10. Google Calendar failure does not lose EMR appointment.

## 40.5 PDF visual regression

Documents are user-facing and sometimes clinical/legal artifacts. Test template rendering for:

- page overflow;
- long patient names;
- multiple treatment-plan items;
- drawing/image size;
- signature blocks;
- A4/Letter;
- multi-page records.

## 40.6 Security testing

Before production:

- dependency scan;
- secret scan;
- authorization review;
- RLS test suite;
- OWASP-oriented web testing;
- rate-limit tests;
- signed URL/token tests;
- IDOR/BOLA tests;
- upload security tests;
- webhook verification tests.

---

# 41. Environments, Deployment & Data Safety

## 41.1 Environments

Use separate cloud data environments:

- **developer workstation + Supabase Cloud DEV** — Next.js may run locally, but persistent application data remains cloud-hosted and synthetic only;
- **Supabase Cloud TEST / staging** — separate non-production environment for destructive database/security tests and pre-production validation when needed;
- **production** — separate Supabase Cloud project and separate Cloudflare R2 production boundary, created/hardened only before real-patient deployment.

The project intentionally does not use a local Supabase database. Do not develop directly against production patient data, and do not persist patient/application data on the developer workstation.

## 41.2 Synthetic data only for agents

Fixtures:

```text
Maria Sample
Juan Test
Patient 0001
```

with entirely fictional health data.

## 41.3 Database migrations

All schema changes:

- migration file;
- reviewed;
- reversible/forward-fix strategy;
- tested against staging;
- no untracked manual production edits.

## 41.4 Deployment checks

Before deploy:

- tests pass;
- lint/typecheck pass;
- migrations reviewed;
- RLS/security tests pass;
- secrets configured;
- backup status checked for risky migrations;
- rollout notes recorded.

---

# 42. Migration from Paper / Existing Records

The target clinic may want to digitize historical paper records.

## 42.1 Do not require full historical data entry on day one

Possible staged migration:

### Option A — New patients/visits digital going forward

Create structured record when patient next visits.

### Option B — Scan legacy chart

Attach scanned legacy record as `Legacy Record` while new data becomes structured.

### Option C — Selective structured migration

Enter critical data:

- demographics;
- allergies;
- medical alerts;
- active treatment plan;
- major treatment history;

and attach the old chart scan.

## 42.2 Migration metadata

Track:

- migrated by;
- source (paper/old system);
- date;
- whether information is structured or scanned;
- notes about completeness.

## 42.3 OCR/AI extraction

Do not make automated extraction from old medical records an MVP dependency. If introduced later, require human verification before structured clinical data becomes authoritative.

---


# 43. Phase 0 — Product Discovery & Workflow Observation

Do this before finalizing the entire schema.

The goal is not to ask dentists abstractly, “What features do you want?” The goal is to watch how work happens now.

## 43.1 Observe one appointment end-to-end

Ask the dentist/staff to demonstrate a real or simulated workflow:

```text
Patient discovers clinic
→ sends inquiry
→ staff replies
→ availability checked
→ appointment recorded
→ reminder sent
→ patient arrives
→ patient record retrieved
→ treatment performed
→ notes recorded
→ payment handled
→ follow-up arranged
```

## 43.2 Appointment discovery questions

- Where do most inquiries come from: Messenger, phone, SMS, walk-in, referral?
- Who answers Facebook Messenger?
- Are replies manual or automated?
- If a reminder arrives in Messenger, what system sends it?
- Does staff use Facebook/Meta’s appointment tools, a chatbot, a third-party system, or manual messages?
- Where is the official appointment written after a Messenger conversation?
- Do they ever forget to transfer Messenger bookings to the calendar?
- Do patients often ask the same questions before booking?

## 43.3 Patient record questions

- Paper, digital, or hybrid?
- What exact paper forms are currently used?
- How long does retrieval take?
- How are charts filed?
- What happens if a paper chart is missing?
- What information does the dentist want visible immediately?
- Which information must still be printed?
- Are old charts scanned or retained physically?
- How are X-rays/images associated with a patient?

## 43.4 Dental chart/treatment discussion questions

- Does the dentist draw on paper, forms, X-rays, or a tablet?
- What does the dentist usually draw?
- Does the patient receive a copy?
- Does the patient sign/initial the treatment plan?
- What evidence/documentation does the clinic currently keep that treatment options were explained?
- Which templates would make the canvas useful?

## 43.5 Provider questions

- How many regular dentists?
- What are their specialties?
- Are dentists present on fixed days?
- Which specialists are on-call/visiting?
- How are specialists contacted?
- Who decides whether a case requires a specialist?
- Do specialists need clinic system access?
- How far in advance are visiting specialists scheduled?

## 43.6 Chair/resource questions

- How many chairs?
- Is a chair assigned when booking or on arrival?
- Can multiple dentists work simultaneously?
- Are rooms/equipment shared?
- Do resource conflicts actually happen?

## 43.7 Google Calendar questions

- Does each dentist use Google Calendar?
- Personal or separate work calendar?
- Does reception see it?
- Should the EMR only block busy time or also display details?
- Should procedure name appear in Google Calendar?
- Which dentists do not use Google Calendar?

## 43.8 Reminder/no-show questions

- Who sends reminders today?
- What channel?
- How long before appointment?
- Does patient confirm?
- What happens if patient does not answer?
- How many no-shows occur per week/month?
- Is there a cancellation fee/policy?
- Is there a waitlist?

## 43.9 Follow-up/recall questions

- How does dentist tell staff when patient should return?
- Is next appointment scheduled immediately?
- How are six-month recalls remembered?
- Who contacts overdue patients?
- Which procedures require standard follow-up?

## 43.10 Acquisition/referral questions

- Does clinic ask “How did you hear about us?”
- Are Facebook/Google referrals important?
- Does clinic track referring patients?
- Does clinic receive referrals from other dentists?
- Does clinic send cases to external specialists?
- Would owner use source/referral analytics?

## 43.11 Billing/document questions

Collect samples (with all patient data removed) or blank templates of:

- patient form;
- treatment plan;
- estimate;
- statement of account;
- prescription;
- certificate;
- referral letter;
- consent form;
- post-op instruction;
- dental chart/odontogram;
- current invoice/receipt process.

## 43.12 Duplicate-entry question

Explicitly ask:

> “Where do you enter the same patient information more than once?”

This identifies the best automation opportunities.

## 43.13 Phase 0 deliverables

Create:

```text
docs/discovery/current-workflow.md
docs/discovery/pain-points.md
docs/discovery/forms-inventory.md
docs/discovery/integrations-inventory.md
docs/discovery/mvp-validation.md
```

---

# 44. Recommended Development Roadmap

The phases below are deliberately ordered to reduce architectural rework.

## Phase 1 — Repository & Engineering Foundation

### Scope

- initialize Git repository;
- project README;
- `CLAUDE.md`;
- `AGENTS.md`;
- docs structure;
- Next.js/TypeScript scaffold;
- environment strategy;
- CI checks;
- database migration tooling;
- test framework;
- lint/typecheck;
- secret handling;
- basic deployment/staging.

### Acceptance criteria

- clean clone can be set up from README;
- CI runs lint/typecheck/tests;
- no secrets in repository;
- cloud dev/test/staging environment boundaries documented;
- agent instructions point to master plan.

---

## Phase 2 — Authentication, Clinic & Authorization Foundation

### Scope

- auth;
- clinic entity;
- users/memberships;
- roles/capabilities;
- RLS/tenant isolation;
- audit framework;
- invitation flow;
- basic admin UI.

### Acceptance criteria

- users cannot access another clinic;
- role restrictions tested server-side;
- anonymous users cannot access protected tables;
- owner can invite/disable staff;
- audit events exist for key security changes.

---

## Phase 3 — Provider, Specialty & Procedure Foundation

### Scope

- provider directory;
- regular/visiting/on-call type;
- specialty catalog;
- provider-specialty assignment;
- procedure/service catalog;
- durations;
- online booking flags;
- public provider profile fields.

### Acceptance criteria

- one provider may have multiple specialties;
- procedure can require specialty/eligibility;
- on-call provider is not treated as automatically available;
- website visibility is separate from clinical provider existence.

---

## Phase 4 — Patient Management Core

### Scope

- patient CRUD;
- demographics;
- contacts;
- medical alerts/basic history;
- patient search;
- duplicate warnings;
- patient timeline skeleton;
- file attachment foundation;
- audit/access controls.

### Acceptance criteria

- fast patient search;
- duplicate warning works;
- receptionist/dentist permissions differ as designed;
- file access is private;
- no cross-clinic data exposure.

---

## Phase 5 — Acquisition & Referrals

### Scope

- acquisition sources;
- booking channels;
- existing-patient referrer;
- external professional referrer;
- incoming/outgoing referral foundation;
- capture during registration;
- basic source/referral reports.

### Acceptance criteria

- Facebook acquisition + Messenger booking can be represented separately;
- walk-in channel does not erase discovery source;
- referring patient can be linked;
- `Unknown` supported;
- source names standardized.

---

## Phase 6 — Scheduling Engine

### Scope

- provider recurring availability;
- exceptions/time off;
- appointment state machine;
- provider assignment;
- multiple providers;
- conflict detection;
- procedure duration;
- calendar day/week views;
- cancellation/rescheduling;
- basic resource/chair model.

### Acceptance criteria

- server rejects provider double booking;
- resource conflict prevented;
- appointment can exist without provider while awaiting specialist;
- reschedule history preserved;
- cancellation releases slot.

---

## Phase 7 — Walk-in & Queue

### Scope

- quick walk-in action;
- existing/new patient path;
- waiting queue;
- check-in;
- in-chair;
- completion;
- basic chair assignment if clinic uses it.

### Acceptance criteria

- walk-in can be created without fake pre-booking;
- receptionist can see current queue;
- queue status does not corrupt appointment status.

---

## Phase 8 — Automation & Communication Core

### Scope

- durable queue/job mechanism;
- event model;
- communication table;
- email adapter;
- SMS adapter;
- reminder rules;
- confirmation/cancellation/reschedule secure links;
- retries/error dashboard.

### Acceptance criteria

- external send does not block appointment save;
- jobs are retryable/idempotent;
- cancellation cancels obsolete reminders;
- staff can see whether reminder delivered/failed;
- duplicate send tests pass.

---

## Phase 9 — Google Calendar Integration

### Scope

- provider OAuth;
- selected calendar;
- EMR → Google event;
- update/cancel;
- free/busy conflict checks;
- privacy modes;
- sync status/errors;
- reconciliation.

### Acceptance criteria

- EMR remains correct if Google is down;
- personal event details are not shown to reception when using free/busy;
- retry does not duplicate events;
- provider reassignment updates mappings;
- tokens never reach browser logs.

---

## Phase 10 — Specialist / On-call Workflow

### Scope

- specialist requests;
- accept/decline/alternate time;
- notification;
- assignment;
- limited case access;
- status history.

### Acceptance criteria

- on-call provider does not appear automatically bookable unless policy allows;
- availability request does not expose unnecessary clinical data;
- acceptance assigns provider and triggers appointment/calendar automation.

---

## Phase 11 — Document & Print Engine

### Scope

Initial templates:

- patient record summary;
- treatment estimate;
- statement of account;
- prescription;
- referral letter;
- consent form;
- appointment slip;
- basic treatment plan.

### Acceptance criteria

- A4 output is usable;
- patient record export is configurable;
- documents have clinic branding;
- sensitive exports are authorized/audited;
- finalized document snapshot is reproducible.

---

## Phase 12 — Clinic Website

### Scope

- home/about;
- services;
- dentist profiles;
- location/contact;
- SEO foundation;
- privacy notice;
- Book Appointment CTA;
- Messenger CTA;
- admin-managed public content where practical.

### Acceptance criteria

- site performs well on mobile;
- public site exposes no clinical data;
- provider/service content comes from controlled public fields;
- clinic can change core public information without code where appropriate.

---

## Phase 13 — Website Booking Integration

### Scope

- public availability;
- new/existing patient flow;
- service selection;
- provider preference;
- instant vs request booking;
- temporary slot hold;
- acquisition/campaign capture;
- secure management links.

### Acceptance criteria

- website and reception cannot double book same slot;
- online appointment appears immediately in EMR;
- Google/calendar automation follows same domain events;
- only minimal patient information collected before booking;
- specialist procedure can create request instead of fake instant availability.

---

## Phase 14 — Clinical Notes & Dental EMR

### Scope

- encounter;
- clinical notes;
- note finalization/amendment;
- treatment history;
- prescription linkage;
- richer medical/dental history.

### Acceptance criteria

- finalized notes preserve history;
- clinical changes are audited;
- reception cannot edit clinical notes;
- clinical encounter links appointment/provider correctly.

---

## Phase 15 — Odontogram / Dental Chart

### Scope

- dentist-validated tooth numbering;
- graphical chart;
- existing/planned/completed/referral statuses;
- treatment history integration;
- print/export.

### Acceptance criteria

- dentists validate terminology/workflow;
- historical chart is not destroyed by new state;
- printable chart is legible.

---

## Phase 16 — Treatment Plans & Discussion Canvas

### Scope

- structured treatment plans;
- plan alternatives;
- versions;
- drawing canvas;
- tooth/odontogram base;
- X-ray/photo annotation later in phase;
- discussion note;
- acknowledgment;
- print/PDF packet.

### Acceptance criteria

- drawing persists to patient record;
- drawing can be added to treatment-plan PDF;
- original X-ray/image remains unchanged;
- acknowledged plan cannot be silently overwritten;
- patient discussion documentation includes dentist/time/context.

---

## Phase 17 — Digital Intake & Consent

### Scope

- secure intake link;
- medical/dental history forms;
- privacy notice;
- consent templates;
- digital signature if approved;
- paper-sign/upload alternative.

### Acceptance criteria

- form link cannot expose another patient;
- signed document captures template version/time/signers;
- clinic can print instead of digitally sign.

---

## Phase 18 — Recall & Follow-up Automation

### Scope

- recall rules;
- due dates;
- reminders;
- booking from recall;
- overdue list;
- retention analytics.

### Acceptance criteria

- recall rule is dentist/clinic configured;
- completed treatment can create recall;
- booked recall links correctly;
- opt-outs/preferences respected.

---

## Phase 19 — Inventory & Branch Operations

Inventory is promoted because the second branch is newly opened and may have different equipment/stock.

### Scope

- inventory item catalog;
- branch stock balances;
- stock receipts;
- manual adjustments with reason;
- consumption/issue;
- branch-to-branch transfers;
- reorder levels and low-stock alerts;
- movement audit trail;
- separate equipment/resource inventory from consumable stock;
- lot/expiry tracking discovery for materials where clinically/operationally necessary.

### Acceptance criteria

- stock is traceable by branch;
- adjustment requires user/reason and is audited;
- transfer does not appear as received until destination confirms receipt;
- negative stock is prevented or explicitly controlled by policy;
- low-stock logic is branch-specific;
- organization dashboard can aggregate inventory while preserving branch filters.

---

## Phase 20 — Analytics

### Scope

- operational dashboard;
- appointment analytics;
- no-show;
- acquisition/referral;
- website conversion;
- provider/resource utilization;
- communication delivery.

### Acceptance criteria

- analytics definitions documented;
- metrics trace to source data;
- source/booking channel not conflated;
- role-based analytics access.

---

## Phase 21 — Billing Enhancement / BIR-Compliant Invoicing Discovery

Do not build regulated invoice functionality from assumptions.

### Scope

- confirm clinic taxpayer/system status;
- consult accountant/BIR rules;
- document requirements;
- design invoice numbering/data/reporting;
- only then implement compliant invoicing if desired.

---

## Phase 22 — Messenger Integration

### Scope

After Meta app/business requirements are understood:

- connect clinic Page;
- webhook messages;
- automated appointment utility messages;
- reminder adapter;
- optional guided booking assistant;
- staff handoff.

### Acceptance criteria

- follows Meta policies/current messaging rules;
- patient-initiated conversation requirements handled;
- no clinical record disclosure through ordinary chat;
- messages logged through common communication system.

---

## Phase 23 — Advanced Operations

Potential:

- waitlist automation;
- HMO;
- advanced finance;
- patient portal;
- schedule optimization;
- no-show prediction.

---

## Phase 24 — AI / MCP

Only after the core authorization/audit architecture is mature.

See Section 48.

---

# 45. MVP Definition

Because the total vision is large, distinguish a sellable/useful MVP from the master roadmap.

## MVP 1 — Operational Dental Practice Platform

Must include:

### Foundation
- auth;
- clinic;
- users/roles;
- security/RLS;
- audit foundation.

### Patients
- patient profile;
- search;
- basic medical/dental history;
- files;
- timeline.

### Acquisition/referrals
- source;
- booking channel;
- patient referral;
- professional referrer;
- basic report.

### Providers/scheduling
- dentists;
- specialties;
- procedures;
- availability;
- appointments;
- multiple providers architecture;
- on-call provider type;
- basic chair/resource support;
- cancellation/rescheduling.

### Automation
- SMS/email abstraction;
- confirmation;
- reminders;
- communication log.

### Google Calendar
- provider connection;
- EMR → Google;
- free/busy blocking.

### Website
- public clinic website;
- provider/services pages;
- contact/Messenger;
- appointment request/booking connected to EMR.

### Documents
- patient record PDF;
- treatment plan/estimate;
- statement of account;
- prescription;
- referral;
- basic consent print/PDF.

### Treatment discussion
- basic drawing canvas;
- save editable source + rendered preview;
- attach to treatment plan;
- print/PDF.

### Clinical dental chart
- clinically validated odontogram;
- permanent/primary dentition support as required;
- tooth/surface findings and planned/completed status;
- renderer-independent domain model;
- usable on iPad/touch and laptop.

### Inventory / branch operations
- branch inventory catalog/balances;
- receipts and adjustments;
- branch transfers;
- reorder levels / low-stock visibility;
- equipment/resource availability remains integrated with scheduling.

The exact MVP cut should be validated after Phase 0. If schedule is constrained, advanced canvas and some documents may move to MVP 1.1, but the architecture should account for them.

## MVP 2 — Clinical Depth

- odontogram enhancements / expanded clinical conditions;
- clinical note templates;
- treatment-plan versioning;
- image/X-ray annotation;
- digital signatures;
- digital intake;
- online booking refinements;
- recall automation;
- waiting list;
- richer analytics;
- specialist workflow enhancement.

---

# 46. Explicit Non-Goals for Early MVP

Do not attempt all of these immediately:

- nationwide provider marketplace;
- insurance/HMO clearinghouse;
- full procurement/ERP and advanced inventory costing;
- AI diagnosis;
- autonomous clinical recommendations;
- direct CBCT interpretation;
- complex accounting suite;
- fully compliant BIR invoicing without dedicated analysis;
- native mobile apps before web workflow is validated;
- multi-country compliance;
- automatic treatment decisions;
- unrestricted AI access to patient records;
- sophisticated marketing automation before core appointments work.

---

# 47. Product Risks & Mitigations

## 47.1 Scope explosion

Risk: building website + EMR + billing + AI + Messenger + analytics simultaneously.

Mitigation: phase gates, approved plans, MVP boundaries.

## 47.2 Poor dentist adoption

Risk: system is technically powerful but slower than paper.

Mitigation: observe dentist workflow, keyboard/stylus-friendly design, templates, rapid patient search, gradual paper migration.

## 47.3 Receptionist work increases

Risk: digital system adds duplicate entry.

Mitigation: website/Messenger appointments feed same EMR; enter once/reuse.

## 47.4 Authorization bug

Risk: staff or another clinic sees patient data.

Mitigation: RLS + server authorization + automated isolation tests + independent security review.

## 47.5 Reminder failure

Risk: patient misses appointment because external provider failed.

Mitigation: durable jobs, delivery tracking, retry, failure dashboard; do not guarantee delivery without provider confirmation.

## 47.6 Calendar inconsistency

Risk: Google says one thing, EMR another.

Mitigation: EMR authoritative, reconciliation, visible sync status.

## 47.7 PDF/document error

Risk: wrong/outdated document presented as official.

Mitigation: template versioning, immutable issued snapshots, preview, tests.

## 47.8 Consent overclaim

Risk: team assumes a signature/drawing alone proves informed consent.

Mitigation: product language/documentation emphasizes discussion + documentation; validate legal templates.

## 47.9 Historical paper migration errors

Mitigation: label migrated data, keep source scan, human verification.

## 47.10 AI hallucination in future

Mitigation: MCP tools expose deterministic data/actions; AI does not become source of truth; confirmations for writes; audit all actions.

---

# 48. Future AI / MCP Architecture

AI/MCP is intentionally late-stage.

## 48.1 Potential read queries

- “Who are my patients today?”
- “Which appointments are unconfirmed tomorrow?”
- “Do we have an orthodontist available Friday?”
- “Which patients are due for cleaning recall?”
- “Which acquisition source produced the most new patients this month?”
- “Who referred the most periodontal cases?”

## 48.2 Potential write actions

- send reminders;
- request on-call specialist;
- reschedule appointment;
- cancel appointment;
- create follow-up task.

## 48.3 Safety model

MCP tool calls must use the same application authorization layer as the UI.

Never create a privileged MCP backdoor that bypasses clinic permissions.

For sensitive writes:

```text
AI proposes action
→ server resolves exact target
→ user sees confirmation
→ authorized tool executes
→ audit event recorded
```

## 48.4 AI clinical boundaries

Initial AI should focus on administrative/query assistance, not diagnosis or treatment decisions.

Clinical-note drafting later may be possible but must require dentist review and finalization.

---

# 49. Claude Code + Codex Development Workflow

The repository, plans, tests, and Git history—not chat memory—are the shared context.

## 49.1 Recommended roles

### Claude Code

Best default role:

- architecture discussion;
- plan mode;
- explaining design decisions;
- producing/revising implementation plans;
- implementation where desired.

### Codex

Best default role:

- independent plan critique;
- implementation of approved plan;
- independent code/security review;
- tests/refactors/migrations.

Roles can reverse. The important rule is independent review.

## 49.2 Feature workflow

```text
1. Claude Plan Mode
   ↓
2. Write docs/plans/NNN-feature.md
   ↓
3. Commit plan
   ↓
4. Codex reviews plan without implementing
   ↓
5. Claude revises plan / human decides
   ↓
6. Commit approved plan
   ↓
7. One agent implements
   ↓
8. Run tests
   ↓
9. Commit checkpoint
   ↓
10. Other agent reviews diff independently
   ↓
11. Implementing agent fixes valid findings
   ↓
12. Re-review + manual test
   ↓
13. Merge
```

## 49.3 Do not switch every few prompts

Switch at meaningful checkpoints:

- plan;
- critique;
- implementation;
- review;
- fix;
- verification.

## 49.4 Same working directory vs worktrees

When working sequentially, both agents may use the same repository after commits/checkpoints.

When working in parallel, use separate Git branches/worktrees to avoid file collisions.

## 49.5 Agent review prompt standard

When reviewing high-risk code, ask the reviewer to inspect specifically:

- authorization bypass;
- tenant isolation;
- RLS policy errors;
- patient-data leakage;
- validation;
- race conditions;
- idempotency;
- audit logging;
- secret exposure;
- missing tests;
- migration safety;
- external integration failure modes.

---

# 50. Recommended Repository Documentation Structure

```text
dental-emr/
├── README.md
├── CLAUDE.md
├── AGENTS.md
├── docs/
│   ├── MASTER_PRODUCT_PLAN.md
│   ├── PROJECT_STATUS.md
│   ├── TECHNICAL_ARCHITECTURE.md
│   ├── FRONTEND_ARCHITECTURE.md
│   ├── SECURITY_ARCHITECTURE.md
│   ├── DATABASE_DESIGN.md
│   ├── testing.md
│   ├── operations.md
│   ├── discovery/
│   │   ├── current-workflow.md
│   │   ├── pain-points.md
│   │   ├── forms-inventory.md
│   │   └── mvp-validation.md
│   ├── decisions/
│   │   ├── 001-*.md
│   │   └── ...
│   └── plans/
│       ├── 001-foundation.md
│       ├── 002-auth.md
│       └── ...
├── apps/ or src/
├── packages/ (if monorepo)
├── supabase/ or db/
├── tests/
└── ...
```

## 50.1 PROJECT_STATUS.md

Keep short and current:

```markdown
# Current Phase
Phase 4 — Patient Management

# Completed
- Auth foundation
- Clinic isolation
- Providers

# In Progress
- Patient search

# Next
- Acquisition/referrals

# Open Risks
- Need dentist decision on guardian workflow

# Latest Approved Plan
- docs/plans/004-patient-management.md
```

---

# 51. Definition of Done for Any Feature

A feature is not “done” because the page looks correct.

Minimum checklist:

- approved requirements implemented;
- server-side validation;
- authorization implemented;
- RLS/database policy updated/tested if applicable;
- audit requirements implemented;
- errors handled;
- loading/empty/error states;
- accessibility basics;
- tests added;
- typecheck/lint/tests pass;
- migrations reviewed;
- no secrets/PII in logs;
- docs updated;
- manual acceptance test performed;
- independent review for high-risk features.

For clinical/security-sensitive features, add:

- threat/abuse case reviewed;
- data-retention/versioning behavior reviewed;
- export/print implications reviewed;
- privacy minimization reviewed.

---

# 52. First Project Session — Recommended Claude Prompt

Use this after creating an empty project folder/repository.

```text
We are starting a dental EMR and practice-management platform for a Philippine dental clinic.

Read docs/MASTER_PRODUCT_PLAN.md completely before proposing architecture.

Do not write production application code yet.

Your job is to create the initial engineering documentation and identify decisions that must be validated with the dentist.

Create or propose:
1. docs/architecture.md
2. docs/security.md
3. docs/database-design.md
4. docs/testing.md
5. docs/PROJECT_STATUS.md
6. CLAUDE.md
7. AGENTS.md draft containing equivalent project rules for other coding agents
8. docs/plans/001-foundation.md

Important constraints:
- The system stores sensitive health information.
- PostgreSQL/managed Supabase is the current preferred database direction.
- Next.js + TypeScript is the preferred application direction.
- The EMR database is the source of truth.
- The clinic website is a public surface connected to the EMR through controlled server APIs.
- Google Calendar is an integration, not the appointment database.
- We require multi-provider, specialty, on-call specialist, and resource-aware scheduling.
- We require printable/PDF records and treatment discussion drawings.
- We require acquisition/referral tracking.
- Automation must be durable and event-driven.
- Do not design AI/MCP as part of the first implementation phase.

Before finalizing the architecture, list assumptions and unresolved questions. Do not invent answers that require dentist workflow validation.
```

---

# 53. First Codex Review Prompt

After Claude creates the architecture docs:

```text
Read:
- docs/MASTER_PRODUCT_PLAN.md
- docs/architecture.md
- docs/security.md
- docs/database-design.md
- docs/plans/001-foundation.md

Do not implement application code.

Act as an independent senior software architect, PostgreSQL/security engineer, and healthcare-application reviewer.

Critically review the proposal for:
- tenant/clinic isolation
- authorization and RLS problems
- sensitive patient-data exposure
- public website attack surface
- appointment race conditions/double booking
- automation reliability/idempotency
- Google Calendar privacy and sync correctness
- document/PDF versioning
- file-storage security
- audit gaps
- over-engineering
- missing migrations/testing/backup considerations
- features that should not be in MVP

Do not agree merely because a plan exists. Give concrete findings with severity and proposed changes. Do not modify files unless explicitly instructed.
```

---

# 54. Remaining Product Decisions to Validate with the Dentist

Most structural architecture questions have now been answered. The remaining questions should be gathered during real workflow observation and should not block creation of the technical/database architecture unless marked important.

## Workflow

- Who performs each task today: owner dentist, associate dentist, receptionist, dental assistant?
- Is the current Messenger reminder manual or automated, and what tool sends it?
- What is the clinic's current source of truth for schedules before this EMR?
- How are walk-ins prioritized relative to appointments?
- What is the exact check-in → chair → treatment → checkout workflow in each branch?

## Roles / Access

- Exact staff roles and headcount in each branch?
- Should dental assistants see full clinical notes or only selected clinical context?
- Are there any non-owner administrators/managers who need both-branch settings and analytics access?
- For visiting/on-call specialists, should assigned-case-only access be the default as recommended?

## Clinical / Odontogram

- Which odontogram notation does the dentist prefer by default (FDI, Universal, Palmer)?
- Which exact dental conditions/procedure states must be represented visually?
- Which tooth surfaces and symbols/colors do they currently use on paper?
- Primary/mixed dentition requirements?
- Does the clinic need periodontal charting as a separate module?
- What does the dentist normally draw when explaining treatments?
- Which clinical notes require dentist finalization/signature?

## Procedures / Scheduling / Equipment

- Exact recurring schedules for each regular dentist by branch?
- Exact on-call/visiting specialist workflow and lead time?
- Typical procedure durations?
- Exact chair count and resource/equipment list by branch?
- Which procedures require specific equipment that exists only at one branch?
- Lunch/buffer/cleanup rules between procedures?
- Emergency/urgent appointment rules?

## Inventory

- Initial stock list and quantities for both branches?
- Units of measure?
- Which materials require lot/batch and expiry tracking immediately?
- Who can receive, adjust, consume, or transfer stock?
- Is purchase-order/supplier management required now or can it come later?
- Current reorder process and thresholds?

## Printing / Documents

- Exact documents/forms currently printed?
- Existing clinic letterhead and signatures?
- Preferred paper size (A4/Letter/other)?
- Current treatment-plan format?
- Which consent forms are procedure-specific?
- Which printed documents need dentist PRC/professional details?

## Communications

- Desired reminder timing (48h/24h/same-day)?
- Is confirmation mandatory?
- What Messenger reminder wording is currently used?
- Should patient cancellation be self-service or request-only?
- Which SMS provider, if any, does the clinic already use?

## Website

- Final public clinic name/domain/branding?
- Which services appear publicly?
- Which services are request-only vs eligible for later auto-confirm?
- Provider photos/bios and branch-specific service differences?
- What information should be captured before booking vs after confirmation?

## Acquisition / Referrals

- Final default acquisition-source list for this clinic?
- Do they currently ask “How did you hear about us?”
- Which external referrers should be preloaded?
- Do they want formal referral thank-you/follow-up workflows later?

## Billing

- Current charge/payment workflow?
- Payment methods used?
- Refund/credit/deposit handling needed in MVP?
- Current BIR invoice/receipt process and accounting/POS tools?
- Does the EMR initially coexist with their BIR invoicing tool or eventually integrate/replace it?

## Files / Imaging

- What ordinary X-ray/photo formats are currently produced?
- Typical image/file sizes?
- Where are full CBCT studies kept today?
- Is storing CBCT report + selected screenshots sufficient for MVP as planned?

## Backup / Operations

- Acceptable downtime if restore is required?
- How many days of backup retention does the owner expect?
- Who receives backup/integration failure alerts?

These remaining questions should be documented in discovery files and converted into explicit product/architecture decisions only when their answers materially affect implementation.

---

# 55. Research References & Implementation Notes

These sources informed the product direction. Re-check them when implementing because APIs, policies, regulations, and competitor features change.

## Philippine privacy

- National Privacy Commission — Data Privacy Act of 2012  
  https://privacy.gov.ph/data-privacy-act/
- National Privacy Commission — Implementing Rules and Regulations  
  https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/

## Philippine / local dental practice software

- SeriousMD  
  https://seriousmd.com/
- SeriousMD Dentist Software  
  https://seriousmd.com/dentist-software/
- SeriousMD Google Calendar Integration  
  https://help.seriousmd.com/en/articles/6302012-google-calendar-integration
- MyMedsPH  
  https://mymedsph.com/
- MyMedsPH About / dentist workflow testimonials  
  https://mymedsph.com/about/
- DenPro Philippines-facing dental software  
  https://www.denpro.ph/

## Google Calendar

- Create Events  
  https://developers.google.com/workspace/calendar/api/guides/create-events
- FreeBusy  
  https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- Push Notifications  
  https://developers.google.com/workspace/calendar/api/guides/push
- OAuth Scopes  
  https://developers.google.com/workspace/calendar/api/auth

## Meta Messenger

- Messenger Platform Overview  
  https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview.md/
- Message Templates / Utility Messaging  
  https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/templates.md/

## Supabase (if selected)

- Row Level Security  
  https://supabase.com/docs/guides/database/postgres/row-level-security
- Queues  
  https://supabase.com/docs/guides/queues
- PGMQ  
  https://supabase.com/docs/guides/queues/pgmq
- Cron  
  https://supabase.com/docs/guides/cron

## Dental record / consent design references (not Philippine law)

These are useful professional-practice references for product design but should not be mistaken for Philippine legal requirements.

- American Dental Association — Documentation / Patient Records  
  https://www.ada.org/resources/practice/practice-management/documentation-patient-records
- American Dental Association — Types of Consent  
  https://www.ada.org/resources/practice/practice-management/types-of-consent
- General Dental Council — Dental record keeping discussion  
  https://www.gdc-uk.org/news-blogs/blog/detail/blogs/2024/06/19/dental-record-keeping-what-is-professional-reasonable-and-in-the-interest-of-patients
- Open Dental — Graphical Tooth Chart  
  https://opendental.com/manual/graphicaltoothchart.html
- Open Dental — Treatment Plan in Chart  
  https://opendental.com/manual/charttp.html

## BIR electronic invoicing research

- BIR Revenue Regulations No. 26-2025 / official PDF  
  https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2026-2025.pdf

Re-check the latest BIR issuances immediately before any production invoicing implementation.

---

# 56. Final Product North Star

When the platform is mature, a receptionist or dentist should be able to open it and immediately answer:

- Who are our patients today?
- Which dentist is assigned?
- Which appointments are confirmed?
- Who has not replied to reminders?
- Which specialist cases still need assignment?
- Which providers are externally busy?
- Which chairs are free?
- What treatment has this patient already received?
- What treatment options were discussed?
- Is there a saved drawing or treatment-plan acknowledgment?
- Which documents can I print for this patient?
- Did we send the reminder?
- How did this patient find the clinic?
- Who referred them?
- Which patients refer the most new patients?
- Which dentists send us cases?
- Which patients are due for follow-up?
- Which appointment slots are available online right now?

And the software should automatically handle as much repetitive coordination as is safe and appropriate:

```text
ENTER ONCE
   ↓
REUSE EVERYWHERE
   ↓
AUTOMATE THE NEXT LOGICAL STEP
   ↓
KEEP THE DENTIST IN CONTROL
```

---

# 57. Confirmed Architecture Decision Snapshot — 2026-08-11

The following product/architecture assumptions are now confirmed and should not be re-asked unless the clinic changes them:

- both branches belong to the same owner/business/organization;
- patients share one organization-level record across branches;
- dentists and staff can work across branches;
- organization-wide provider conflict detection prevents double-booking across branches;
- resources/equipment are branch-specific;
- reception can view both branch calendars subject to role access;
- duplicate-patient warning is primarily normalized name + birthday, with secondary signals allowed;
- family/guardian relationships are supported;
- prices are patient/case-specific rather than fixed procedure prices;
- one website represents both branches;
- online booking defaults to review-first but can be configured to auto-confirm;
- website slot hold is 5 minutes then expires;
- Google-created appointments go to each provider's selected Work Calendar;
- first clinic prefers detailed Google titles such as `Maria S. — Cleaning`, but privacy mode stays configurable;
- Messenger is desired as primary long-term patient channel, SMS fallback, email additional; MVP uses manual Messenger;
- dentist UI must support iPad/stylus and laptop/mouse;
- treatment drawings store editable source plus rendered snapshot;
- odontogram is required in first clinically usable release;
- digital and paper signatures are both supported;
- finalized/signed document snapshots are immutable/versioned;
- initial billing is treatment estimate, charges, payments, balance and statement of account;
- balance is organization-wide while branch/provider/payment-location attribution is preserved;
- inventory is important and is branch-aware;
- Cloudflare R2 is the canonical object store; Cloudflare Workers + Images provide image optimization/derivatives; Cloudinary is not a default dependency;
- avoid heavy CBCT/DICOM storage initially;
- audit sensitive record views/changes/exports and key operational actions;
- finalized clinical records use amendment/void/supersede rather than silent hard deletion;
- backups are automated/layered rather than manual full-clinic downloads;
- application is online-first with graceful connectivity-loss behavior, not full offline in MVP;
- analytics combine both branches with branch filters;
- architecture is multi-tenant-ready from day one even though only one organization uses the prototype initially.

See `TECHNICAL_ARCHITECTURE.md` for engineering detail.


# 58. Frontend Architecture Decision Snapshot — 2026-08-11

The detailed and authoritative frontend implementation plan is `FRONTEND_ARCHITECTURE.md`.

Confirmed direction:

- public website and private EMR share one restrained brand system but have different information density;
- visual inspiration comes from the current SmileLab poster: deep navy, warm white, soft blush, muted gold, neutral slate;
- private EMR remains neutral-first and must not become a colorful/rainbow dashboard;
- private EMR must also avoid generic AI/vibe-coded SaaS composition: no universal card grids, mandatory four-KPI rows, decorative charts, large greeting heroes, excessive pill badges, or oversized rounded/elevated surfaces;
- use familiar interaction patterns but domain-specific compositions: patient workspace, scheduler, ledger, timeline, table/list, form/settings, and analytics layouts should look appropriate to the task instead of sharing one dashboard template;
- cards are optional containers for genuinely bounded objects/groups, not the default wrapper for every section; routine work surfaces should prefer flat sections, separators, subtle borders, and compact toolbars;
- role home/dashboard screens prioritize actionable work/exception queues; KPIs are included only when they answer a real operational question;
- desktop UI may be compact for mouse/keyboard efficiency while iPad/mobile/coarse-pointer contexts expand hit targets and spacing; accessibility, visible focus, and non-drag alternatives remain required;
- Geist Sans is the primary UI/website font through `next/font`;
- Tailwind CSS + shadcn/ui + Lucide React form the UI foundation;
- React Hook Form + Zod handle forms/validation;
- TanStack Query is selective client server-state management, not a replacement for Server Components;
- TanStack Table handles complex tables;
- DayPilot Lite is the selected prototype scheduler/resource-calendar UI behind an application adapter;
- `react-advanced-odontogram` via the controlled `Ditherys/React-Odontogram-Modul` fork is the selected odontogram prototype direction, with renderer-independent canonical patient data and manual upstream-update review;
- React Konva/Konva is selected for treatment-discussion drawing;
- Signature Pad is selected for touch/mouse signature capture;
- Apache ECharts is selected for analytics;
- React-pdf is selected for generated document templates;
- light mode is the MVP target;
- laptop/desktop, iPad/tablet, and mobile phone are supported responsive device classes;
- complex clinical charting remains larger-screen optimized, but phone layouts require deliberate focused/simplified modes or a safe supported alternative rather than a squeezed desktop UI;
- heavy modules are route-level/client-island dependencies and must not inflate the public website bundle.

Mandatory frontend spikes before full build:

1. odontogram clinical/touch/data-model evaluation;
2. two-branch multi-provider scheduler;
3. iPad/laptop treatment canvas;
4. treatment-plan PDF packet.

---

# Appendix A — Example End-to-End Journey: Facebook Patient

```text
1. Patient sees clinic Facebook Page.
2. Patient sends Messenger message.
3. Staff or future automation answers inquiry.
4. Staff opens EMR and searches availability.
5. Acquisition Source = Facebook.
6. Booking Channel = Facebook Messenger.
7. Appointment is created in EMR.
8. Provider/chair are reserved.
9. Google Calendar is updated if provider connected.
10. Confirmation is sent.
11. Reminder jobs are scheduled.
12. Patient confirms.
13. Patient arrives and is checked in.
14. Dentist opens patient record.
15. Dentist documents findings and treatment plan.
16. Dentist draws on Treatment Discussion Canvas.
17. Drawing and discussion are saved.
18. Treatment Plan Packet is printed/PDF if needed.
19. Treatment is completed or scheduled.
20. Follow-up/recall is created.
21. Analytics update: Facebook → Messenger → Appointment → Completed.
```

# Appendix B — Example End-to-End Journey: Website Patient

```text
1. Patient searches Google.
2. Opens clinic website.
3. Selects service.
4. Chooses “Any available dentist.”
5. Public booking API asks scheduling engine for valid slots.
6. Patient selects slot.
7. Temporary hold prevents race.
8. Patient enters minimal contact details.
9. Acquisition Source = Google Organic.
10. Booking Channel = Clinic Website.
11. Appointment is committed to EMR.
12. Google Calendar sync runs asynchronously.
13. Confirmation and reminders are queued.
14. Secure intake link can be sent after confirmation.
```

# Appendix C — Example On-Call Orthodontist Journey

```text
1. Patient needs orthodontic consultation.
2. Clinic has no regular orthodontist on that day.
3. Appointment/request created with required specialty Orthodontics.
4. Status = AWAITING_SPECIALIST.
5. Specialist request sent to Dr. Lim.
6. Only minimal scheduling/case context is in notification.
7. Dr. Lim accepts or requests alternate time.
8. Provider assignment is recorded.
9. Appointment becomes scheduled/confirmation pending.
10. Google Calendar updated if connected.
11. Patient receives confirmation.
12. Dr. Lim receives only authorized patient data for assigned case.
```

# Appendix D — Example Treatment Discussion / Print Journey

```text
1. Dentist creates treatment plan.
2. Opens Treatment Discussion Canvas.
3. Starts from odontogram/X-ray.
4. Circles tooth and annotates options.
5. Records short discussion summary and alternatives.
6. Patient asks questions.
7. Dentist saves discussion to patient record.
8. Patient acknowledgment/signature captured if workflow requires it.
9. System creates immutable document snapshot when finalized.
10. Dentist prints Treatment Plan Packet or sends secure PDF.
11. Audit records document generation/export.
```

# Appendix E — Example Security Abuse Cases Agents Must Test

1. Receptionist changes URL from Patient A ID to Patient B ID.
   - Must still be authorized; no IDOR.
2. User from Clinic A guesses Clinic B appointment ID.
   - Must return no data/forbidden according to policy.
3. Public booking endpoint is called with internal provider IDs repeatedly.
   - Must expose only public-safe fields and rate-limit abuse.
4. Signed patient appointment-management link is reused after expiration.
   - Must fail safely.
5. Google webhook is forged.
   - Must not mutate appointment state without verification/reconciliation.
6. SMS worker retries after timeout.
   - Must not send duplicate reminder if provider already accepted first request.
7. PDF route is called by unauthorized user.
   - Must not generate or reveal file.
8. Private storage URL is copied.
   - Should expire / require signed authorized access.
9. Service-role key appears in frontend source.
   - CI/security review must catch it.
10. Visiting dentist attempts to list all clinic patients.
   - Must be blocked unless explicitly permitted.

# Appendix F — ADR Registry and Future Decision Backlog

ADR numbers are authoritative **only when reserved by the active implementation plan or represented by an accepted file in `docs/decisions/`**. Do not infer ADR numbers from a planning backlog.

Current registry:

```text
ADR-001: Next.js + Supabase core stack                         [reserved by Phase 1]
ADR-002: Organization/branch tenancy                           [reserved by Phase 1]
ADR-003: Authorization defense in depth                        [reserved by Phase 1]
ADR-004: Single Next.js repo for public website + private EMR [reserved by Phase 1]
ADR-005: Cloudflare R2 canonical storage + Workers/Images media pipeline [accepted]
ADR-016: Supabase Cloud-first development; no local Supabase runtime      [accepted]
```

Numbers `ADR-006` through `ADR-015` are intentionally unassigned in the current repository. Future ADRs should be assigned **when the ADR file is actually created**, not pre-numbered here. Because `ADR-016` already exists, prefer `ADR-017` and above for new decisions unless a deliberate reconciliation explicitly fills an earlier gap.

Future ADR topics, intentionally **unnumbered**:

- appointment state model;
- provider/resource scheduling conflict strategy;
- background queue/automation architecture;
- Google Calendar sync/free-busy strategy;
- document/PDF rendering architecture;
- clinical-note finalization/versioning;
- treatment discussion drawing storage format;
- public website security boundary;
- audit-event strategy;
- Messenger integration strategy when implemented;
- BIR invoicing strategy after dedicated compliance discovery;
- any other irreversible architecture decision identified by a later phase plan.

# Appendix G — Suggested Implementation Plan Template

```markdown
# Plan NNN — Feature Name

## Goal

## User Problem

## In Scope

## Out of Scope

## Existing Architecture / Files Inspected

## Data Model Changes

## Authorization / RLS

## API / Server Changes

## UI Changes

## Domain Events / Automations

## Audit Requirements

## Privacy / Security Risks

## Failure Modes

## Migration / Backfill

## Tests

## Manual Acceptance Scenarios

## Rollout

## Open Questions
```

# Appendix H — Change Management Rule

When a future conversation produces a new requirement:

1. Determine which master-plan section it changes.
2. Update the master plan or create an ADR if it is architectural.
3. Update the current phase plan.
4. Commit documentation before implementation when change is substantial.
5. Have the second agent review high-risk scope changes.

Do not create an endless chain of “v0.4 additions,” “v0.5 additions,” etc. The repository should maintain one current authoritative master plan plus Git history.
