# Dental EMR & Practice Management Platform — Frontend Architecture

**Status:** Approved frontend direction for prototype / SaaS foundation  
**Version:** 1.5  
**Date:** 2026-08-12  
**Companion documents:** `MASTER_PRODUCT_PLAN.md`, `TECHNICAL_ARCHITECTURE.md`, `DATABASE_DESIGN.md`

**Development environment note:** the frontend may run locally and may connect to ADR-020's disposable synthetic-only local Supabase endpoint for P2-01 through P2-11 verification or to designated hosted Supabase non-production services. Guarded hosted Cloud TEST is mandatory at P2-12 closeout and before production. Persistent file/media storage remains cloud-hosted in Cloudflare R2 when those features are implemented.

---

# 0. Purpose

This document is the authoritative frontend/UI engineering plan for the dental EMR and public clinic website.

It answers:

- what frontend technologies and libraries are approved;
- what the public website and private EMR should look and feel like;
- how the uploaded SmileLab Dental Center poster should influence the visual system without making the application too colorful;
- how the application behaves on laptop, desktop, iPad, touch, mouse, and stylus;
- how interactive screens such as scheduling, odontogram charting, treatment drawing, patient tables, forms, documents, and analytics should be implemented;
- how Server Components and Client Components should be divided;
- how server state, local UI state, forms, errors, loading, accessibility, and responsive behavior should work;
- which third-party libraries are selected, which are conditional, and which require a prototype gate before production adoption;
- how to keep the UI maintainable when the product becomes multi-tenant SaaS.

This is not permission to place clinical/business rules in the browser. The frontend is an interaction layer. Scheduling, authorization, billing integrity, clinical history, tenant isolation, and other protected rules remain enforced by the application/server/database architecture.

---

# 1. Confirmed Product Context Relevant to Frontend

The first real customer is one dental organization with:

- two current branches;
- the ability to add more branches later;
- shared patients across branches;
- dentists who may work at more than one branch;
- regular, visiting, and on-call dentists;
- branch-specific chairs, rooms, equipment, and inventory;
- variable treatment pricing rather than a fixed universal fee;
- a public website that will be created together with the EMR;
- website appointment requests that enter the same EMR scheduling system;
- Google Calendar integration;
- Messenger as the preferred patient communication channel, with SMS fallback and email as an additional channel;
- a required odontogram in the first clinically useful release;
- treatment-discussion drawing on iPad/stylus and laptop/mouse;
- digital and printable records;
- digital or physical signatures;
- a future plan to commercialize the platform as SaaS.

The frontend must therefore feel like a professional clinic application, not a consumer social app and not a generic admin dashboard template.

---

# 2. Frontend Principles

## 2.1 Calm, clinical, modern

The interface should communicate:

- trust;
- clarity;
- cleanliness;
- professional healthcare;
- modern dentistry;
- operational efficiency.

Avoid:

- excessive gradients;
- rainbow dashboards;
- glassmorphism;
- neon colors;
- overly rounded “toy” UI;
- large decorative illustrations inside the EMR;
- unnecessary animation;
- decorative script fonts in clinical screens.

## 2.2 Brand-aware, not brand-saturated

The uploaded clinic poster contains a strong combination of:

- deep navy;
- warm white/off-white;
- blush pink;
- muted gold;
- neutral grays/slates.

Use the poster as inspiration, but do not make every surface pink, blue, and gold.

The private EMR should be approximately:

- **80–85% neutral surfaces**
- **10–15% navy / brand blue**
- **<5% blush/gold decorative accents**

The public website can use somewhat more brand expression, but should still remain restrained.

## 2.3 Information density matters

Receptionists and dentists work quickly. The EMR should use:

- compact but readable tables;
- clear hierarchy;
- predictable placement of actions;
- persistent filters where useful;
- keyboard support on desktop;
- touch-friendly controls on iPad;
- drawers/sheets for quick context instead of excessive page navigation.

Do not copy a marketing-site spacing scale into operational screens.

## 2.4 Color never carries meaning alone

Status must use:

- text labels;
- icons or dots;
- borders/backgrounds;
- color as secondary reinforcement.

Example:

`Confirmed` should not be represented only by green.

## 2.5 Server owns truth

The UI may:

- predict availability;
- optimistically show movement;
- disable controls;
- show role-aware navigation.

But the server/database must re-check:

- permissions;
- booking conflicts;
- provider conflicts;
- resource conflicts;
- branch membership;
- pricing authority;
- appointment status transitions;
- clinical record rules.

## 2.6 Build reusable domain components, not one giant dashboard

Examples:

- `PatientSummaryCard`
- `AppointmentStatusBadge`
- `ProviderChip`
- `BranchSelector`
- `ClinicalAlert`
- `TreatmentPlanSummary`
- `OdontogramPanel`
- `TreatmentDiscussionCanvas`
- `DocumentPreview`
- `InventoryLevelIndicator`

Do not create a 2,000-line patient page containing every domain concern.

## 2.7 Anti-template rule: familiar interactions, clinical composition

The private EMR must **not** default to the recognizable generic AI/vibe-coded SaaS composition. The target is a modern clinical workstation: familiar controls, restrained styling, domain-specific screen structure, and high information clarity.

This does **not** mean inventing unusual navigation or rejecting common UX patterns. Keep proven interactions such as side navigation, tabs, tables, dialogs, forms, command/search, drawers, and breadcrumbs when they fit the task. What must be avoided is using the same decorative dashboard composition for every domain.

Do not default to:

- a large greeting such as “Welcome back” plus decorative subtitle;
- four generic KPI cards at the top of every page;
- a chart simply because the page is called a dashboard;
- every section wrapped in a rounded `Card`;
- cards nested inside cards;
- large `rounded-xl` / `rounded-2xl` surfaces throughout operational screens;
- gradients, glow effects, glassmorphism, oversized shadows, or decorative blobs;
- pill badges for ordinary metadata that can be plain text;
- giant empty states or decorative illustrations that displace useful work;
- generic icon + title + description tile grids for transactional workflows;
- excessive whitespace copied from marketing pages;
- hover-only actions;
- charts or metric tiles that do not answer a real operational question.

Prefer:

- flat sections separated by whitespace, 1 px borders, headings, and dividers;
- wide main work areas for tables, schedules, charting, and clinical records;
- compact toolbars that place search/filter/actions near the data they affect;
- split panes when users must compare or act on two related contexts;
- persistent patient/appointment/branch context on screens where wrong-context actions would matter;
- tables for truly tabular/comparable data;
- summary lists for compact key/value facts;
- timelines for chronological clinical history;
- tabs only for meaningful peer sections, not as decoration;
- drawers/sheets for bounded secondary tasks rather than turning every action into a new page;
- cards only when a bounded object or group genuinely benefits from a visible container.

**Card decision test:** if removing the card background/radius/shadow would not reduce comprehension, use a simpler section/container instead.

**Dashboard decision test:** if a metric does not change what the current user should do next, it does not deserve prime dashboard space.

This direction is consistent with current shadcn guidance that components are intended to be customized rather than used as a fixed visual identity, and with mature design systems that reserve cards/tables for specific content structures rather than using them as universal layout primitives.

## 2.8 Domain-specific screen archetypes

Do not force unrelated modules into one dashboard template. Use the domain’s natural information shape.

### Patient workspace

Prefer:

```text
Patient context header
Name · patient number · age/DOB · critical alerts · branch/current encounter

Overview | History | Odontogram | Treatment | Files | Billing
────────────────────────────────────────────────────────────
Main clinical/work area                              Actions
```

The patient identity/context region should remain clearly visible while working inside patient-specific views. Critical medical alerts must not be visually buried among decorative tiles.

### Scheduling

The calendar/scheduler is the primary work surface. Give it width. Place branch/provider/resource/date controls in a compact toolbar or filter rail. Do not reduce the scheduler to a small card below unrelated KPI tiles.

### Inventory and operational lists

Use searchable/filterable tables where users compare repeated structured records. Keep rows scannable, columns predictable, and numeric data aligned. Do not convert every inventory item into a card on desktop.

### Billing

Use ledger/statement conventions for charges, payments, balances, adjustments, attribution, and dates. Financial history should look like financial history, not a generic analytics dashboard.

### Clinical timeline/history

Use chronology, sectioning, and progressive disclosure. Avoid a masonry grid of visit cards when a timeline/list communicates sequence better.

### Settings/admin

Use forms, summary lists, tables, and clearly bounded destructive actions. Do not turn settings into a marketing-style card gallery.

#### Admin page UI consistency rules

All admin/settings list pages (providers, branches, specialties, procedures, etc.) must follow the same layout and component patterns:

- **Add action**: upper-right labeled button (`size="lg"`, `h-11`) that opens a modal Dialog. Do not render an inline form below the list.
- **Row actions**: labeled buttons with icon + text (e.g. `Pencil` + "Edit"), `size="sm"`, `variant="outline"`. Do not use icon-only buttons for critical row actions.
- **Archive/deactivate**: `size="sm"`, `variant="outline"` button consistent with Edit. Use AlertDialog (branches, specialties) or native `<dialog>` with confirmation (procedures) — but the trigger button must be the same size across all pages.
- **Mobile mirror**: replicate desktop row actions in the mobile list view at the same sizes.
- **Dialog sizing**: `max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl` for add/edit dialogs.
- **Do not** create a new component pattern per page. Reuse shared components or follow the established pattern exactly.

### Home / operational dashboard

Home should prioritize role-relevant work: today’s appointments, pending booking requests, items needing attention, unsent/failed communications, low-stock warnings, or other actionable queues. KPI summaries are allowed when they are useful to the role, but they are secondary to actual work and must not become a mandatory four-card template.

## 2.9 Density must adapt to input modality

The EMR serves both mouse/keyboard users and iPad/touch users. “Dense” must not mean “tiny.”

Project targets:

- desktop/fine-pointer controls may use compact visual heights around 32–36 px when labels, spacing, and focus treatment remain clear;
- common desktop table rows should generally sit around 36–44 px depending on content;
- coarse-pointer/touch contexts should generally provide about 44 px or larger primary hit targets;
- never go below WCAG 2.2 target-size requirements without one of the standard exceptions;
- maintain clearly visible keyboard focus;
- drag/drop interactions (scheduler, canvas, reorder interactions) need a non-drag alternative when dragging is not essential.

Use responsive density rather than one global spacing scale. A compact desktop table and a touch-friendly iPad control can belong to the same design system.

---

# 3. Approved Core Frontend Stack

Use current stable compatible versions at repository initialization and pin the resolved versions in the lockfile.

## 3.1 Framework

Approved:

- **Next.js App Router**
- **React**
- **TypeScript in strict mode**

Rules:

- Server Components by default.
- Client Components only where browser interaction/state is actually required.
- Do not place `"use client"` at large route/layout boundaries just for convenience.
- Keep heavy interactive libraries isolated behind client-component and route-level boundaries.

Primary Client Component areas will include:

- scheduler/calendar;
- odontogram;
- treatment discussion canvas;
- signature pad;
- rich interactive tables;
- chart visualizations;
- highly interactive form steps.

## 3.2 Styling

Approved:

- **Tailwind CSS**
- CSS variables/design tokens for brand and semantic colors
- limited component-level CSS where third-party libraries require it

Do not hard-code raw brand hex values throughout JSX.

Example:

```css
--brand-primary
--brand-primary-hover
--brand-soft
--surface
--surface-muted
--text
--text-muted
--border
--accent-blush
--accent-gold
--success
--warning
--danger
```

## 3.3 Component system

Approved:

- **shadcn/ui** as the application component starting point
- Radix-style accessible primitives used through shadcn components where appropriate
- **Lucide React** for general UI icons

Important:

shadcn components become project source code. Treat them as owned components:

- theme them;
- simplify them;
- add domain variants;
- test them;
- do not blindly regenerate over local modifications.

Use shadcn for:

- Button
- Input
- Textarea
- Select
- Combobox
- Command
- Dialog
- Alert Dialog
- Sheet
- Drawer where appropriate
- Popover
- Tooltip
- Dropdown Menu
- Tabs
- Accordion
- Checkbox
- Radio Group
- Switch
- Badge
- Card
- Table primitives
- Skeleton
- Breadcrumb
- Sidebar primitives if suitable

Avoid installing components the project does not use.

## 3.4 Icons

Approved:

- **lucide-react**

Rules:

- use one icon family;
- avoid emoji as primary application icons;
- icon-only buttons require accessible labels/tooltips;
- use filled/colored icons sparingly;
- normal icon size in dense UI: approximately 16–20 px;
- touch-first primary actions may use 20–24 px icons.

---

# 4. Brand and Visual Design System

## 4.1 Source inspiration

The clinic poster visually suggests:

- navy logo and footer;
- warm white main field;
- soft pink accent;
- thin gold lines/borders;
- calm neutral treatment-room photography.

The UI should inherit this identity without reproducing the poster literally.

## 4.2 Recommended application palette

The following palette is a refined digital interpretation of the poster, not an attempt to extract exact brand-production values.

### Core brand

```text
Navy 950        #082F52
Navy 900        #0B3A63
Navy 800        #12476F
Navy 700        #245B80
Navy 100        #E8F0F6
Navy 50         #F3F7FA
```

Primary application actions:

- default button/background: Navy 900
- hover: Navy 950
- subtle selected background: Navy 50/100

### Neutral foundation

```text
Ink             #17212B
Slate text      #5D6B78
Muted text      #77828C
Border          #E2E6EA
Surface         #FFFFFF
Warm surface    #F8F6F5
Subtle surface  #F4F5F6
```

### Brand accents

Inspired by the poster:

```text
Blush           #D7A4AF
Blush soft      #FAF2F4
Gold            #C5A064
Gold soft       #F7F1E7
```

Use blush and gold for:

- decorative website lines;
- subtle premium/brand details;
- selected marketing highlights;
- small avatar accents;
- hero/background flourishes.

Do **not** use blush or gold for normal paragraph text on white because contrast is insufficient.

### Semantic colors

Semantic colors are functional, not brand colors.

Use restrained versions for:

- success / completed / paid;
- warning / unconfirmed / low stock;
- danger / no-show / destructive actions;
- info / external sync / informational state.

Use a soft background + dark text + icon/dot rather than full-saturation blocks.

## 4.3 Accessibility contrast

Normal text must target WCAG 2.2 AA contrast.

Practical rules:

- navy/ink on white/off-white is safe for primary text;
- slate is acceptable for normal secondary text only when contrast remains sufficient;
- blush and gold are decorative accents, borders, or large non-text visual details;
- do not use pale gray for important clinical values;
- placeholder text must remain readable;
- status text must be readable independently of its colored badge background.

## 4.4 Dark mode

**Do not make dark mode an MVP requirement.**

Reasons:

- clinical print workflows are light-oriented;
- reduces initial theme complexity;
- third-party scheduler/odontogram/canvas components need careful theming;
- the clinic brand is strongly light/white-based.

Architecture should avoid making dark mode impossible later, but do not spend Phase 1 time on it.

---

# 5. Typography

## 5.1 Approved font direction

Use **Geist Sans** as the primary UI and website font through `next/font`.

Reasons:

- clean modern UI appearance;
- strong readability;
- variable-font support;
- keeps public website and EMR visually related;
- avoids loading several brand fonts.

Do not reproduce the decorative script typography from the poster inside the EMR.

If the public website later needs a distinctive campaign/tagline typeface, evaluate it separately. It must not become a required application font.

## 5.2 Type scale

Suggested private-app scale:

```text
Page title              20–24 / semibold
Section title           16–18 / semibold
Object/card title       14–16 / semibold
Body                    14–16 / regular
Dense table             13–14 / regular
Caption/metadata        12–13 / regular
Numeric KPI             24–32 / semibold, analytics only
```

Avoid tiny 10–11 px metadata as a default.

## 5.3 Numbers

For:

- amounts;
- time;
- counts;
- inventory;
- treatment estimates;

use tabular numeric styling where it improves alignment.

---

# 6. Spacing, Radius, and Elevation

## 6.1 Spacing

Use a 4 px base rhythm.

Common values:

- 4
- 8
- 12
- 16
- 20
- 24
- 32

Clinical screens should be moderately dense.

## 6.2 Radius

Private EMR recommendation:

- input/button: 6–8 px
- ordinary panel/object container: 6–8 px when a container is needed
- dialog/sheet/popover: 8–12 px
- public website/marketing card: up to 12–16 px when appropriate
- pills/badges: full radius only for true statuses/tags/chips

Do not use large radii as the default personality of the EMR. A rectangle does not need to become a pill or floating card simply because a component library supports it.

## 6.3 Shadows

Operational screens should be mostly flat.

Prefer:

- 1 px borders;
- subtle surface contrast;
- spacing;
- separators;

over floating-card shadows.

Reserve clear elevation primarily for overlays such as dialogs, popovers, menus, and sheets. Avoid stacked shadow levels on ordinary page sections.

---

# 7. Responsive and Multi-Device Strategy

The private EMR is a **responsive multi-device web application**. Desktop/laptop, iPad/tablet, and modern mobile phones are all supported product targets. Desktop and iPad remain the preferred work surfaces for high-density clinical work, but phone layouts must be intentionally designed and tested rather than treated as a fallback.

Do not build a desktop interface and merely shrink it. Preserve the same information architecture and authorization model while changing composition, density, navigation, and interaction patterns for the available space and input method.

Use responsive CSS/layout primitives and capability queries (`pointer`, `hover`, orientation where useful) rather than user-agent sniffing. Breakpoints are implementation guidance, not device identity.

## 7.1 Desktop / wide laptop

At approximately 1280 px and above:

- expanded sidebar;
- full scheduler/resource views;
- multi-column patient layouts;
- split-pane workflows allowed;
- detail drawers may coexist with main content;
- compact mouse/keyboard density is acceptable when readability and accessibility are preserved.

## 7.2 Compact laptop / large tablet landscape

Approximately 1024–1279 px:

- collapsible sidebar;
- fewer simultaneous columns;
- use sheets/drawers for secondary details;
- tables may prioritize columns and provide scoped horizontal scrolling when genuinely necessary;
- high-density work surfaces remain usable without requiring browser zoom.

## 7.3 iPad / tablet

Approximately 768–1023 px, portrait and landscape:

- navigation becomes compact/collapsible;
- appointment scheduling remains a first-class workflow;
- odontogram must be touch-friendly;
- treatment drawing must be stylus/finger friendly;
- no hover-only actions;
- primary touch targets should generally be about 44 px or larger even when visual controls look compact;
- form controls need enough separation to prevent accidental taps;
- Apple Pencil/stylus use must not be required for actions that should also work by finger;
- portrait and landscape orientation changes must not lose unsaved state.

## 7.4 Mobile phone

Mobile is a supported interface, not a read-only afterthought. Common workflows should be fully usable on current phone widths, including:

- sign-in/MFA and account/session flows;
- branch switching;
- today's schedule and appointment details;
- patient search, patient summary, contact details, alerts, and timeline reading;
- common appointment/status actions permitted by role;
- tasks/notifications;
- simple forms, notes, approvals, and operational lookups where clinically appropriate.

Mobile composition rules:

- sidebar navigation becomes a drawer or another compact navigation pattern;
- multi-column layouts stack into task-priority order;
- dialogs that would be cramped should become sheets or focused/full-screen flows;
- toolbars collapse to primary actions plus an overflow menu without hiding critical actions;
- tables prioritize essential columns and may use contained horizontal scrolling or purpose-built compact row layouts; never silently drop clinically important information;
- fixed controls must respect safe-area insets and the on-screen keyboard;
- no critical action may depend on hover, tiny targets, or drag-only interaction.

High-complexity work surfaces such as the full odontogram editor, multi-resource scheduler, and treatment canvas remain **larger-screen optimized**, but they still require a deliberate phone experience. Use focused/full-screen modes, simplified views, zoom/pan or stepwise workflows where clinically safe and validated. If a specific editing action cannot be made safe on a small phone in a release, provide a clear supported alternative and preserve full viewing/context rather than rendering a broken desktop surface.

## 7.5 Responsive acceptance matrix

Every major private-EMR screen must be checked at representative widths and input modes, including at minimum:

- ~360–390 px phone portrait;
- ~430 px large phone;
- phone landscape where relevant;
- ~768 px tablet portrait;
- ~1024 px tablet landscape / compact laptop;
- ~1280–1440 px laptop/desktop.

Acceptance requires:

- no page-level accidental horizontal overflow;
- no clipped primary actions or unreadable text;
- no hover-only functionality;
- keyboard focus remains visible;
- touch targets remain usable;
- virtual-keyboard opening does not hide the active field/action;
- orientation/resize does not discard state;
- data-density reductions do not remove security, clinical, or billing meaning.

---

# 8. Public Website Visual Direction

The website shares the clinic identity but can be more expressive than the EMR.

## 8.1 Website style

Use:

- large clinic photography;
- warm white background;
- navy typography/buttons;
- blush as soft accent;
- thin gold rules/details;
- generous whitespace;
- simple clean cards;
- minimal motion.

Avoid:

- large pink gradients;
- multiple bright service colors;
- spinning/floating dental icons;
- excessive gold;
- autoplay carousels.

## 8.2 Website routes

Recommended:

```text
/
 /about
 /services
 /services/[slug]
 /dentists
 /dentists/[slug]
 /branches
 /branches/[slug]
 /book
 /contact
 /privacy
```

Optional later:

```text
/patient-info
/aftercare
/faqs
```

## 8.3 Hero

Suggested structure:

- clinic photo or clean branch image;
- short trust-oriented headline;
- one primary CTA: **Book an Appointment**
- one secondary CTA: **Message us on Messenger**
- branch/location context;
- compact trust/service indicators.

## 8.4 Service presentation

Do not give every dental service a different bright color.

Use:

- consistent navy line icons;
- white cards;
- subtle navy/blush hover state;
- short summaries;
- clear CTA.

## 8.5 Website booking

The booking experience is an application flow embedded in the website, but uses the same restrained brand system.

The booking flow should be:

1. branch or preferred location;
2. new/existing patient;
3. service/procedure category;
4. preferred dentist or any available;
5. date/time/request;
6. minimal contact information;
7. acquisition/referral question where appropriate;
8. confirmation/request submitted.

Do not require full medical history before a person can submit an appointment request.

---

# 9. Private EMR Shell

## 9.1 Desktop shell

Recommended layout:

```text
┌─────────────────────────────────────────────────────────────┐
│ Sidebar │ Top bar: branch / search / quick add / user      │
│         ├───────────────────────────────────────────────────┤
│         │                                                   │
│         │                  Main Content                     │
│         │                                                   │
└─────────────────────────────────────────────────────────────┘
```

### Sidebar

Suggested primary navigation:

- Dashboard
- Calendar
- Patients
- Clinical
- Treatment Plans
- Billing
- Inventory
- Referrals
- Documents
- Analytics
- Staff
- Settings

Visibility is permission-aware.

Do not rely on hidden navigation as authorization.

## 9.2 Global top bar

Recommended:

- organization/branch selector;
- global patient search;
- quick-add button;
- alerts/tasks indicator;
- current user/provider;
- connectivity/sync warning only when relevant.

## 9.3 Branch selector

Owners/managers:

```text
All Branches
Branch A
Branch B
...
```

Reception staff with one branch may have that branch fixed or preselected.

Changing branch should update:

- calendar;
- inventory;
- resource views;
- analytics filter;
- branch context for new appointments.

It must not change the patient identity domain: patient records remain organization-level.

---

# 10. Dashboard

The dashboard is operational, not decorative.

## 10.1 Owner/manager dashboard

Prioritize:

- today's appointments;
- confirmed/unconfirmed counts;
- no-shows;
- branch load;
- provider load;
- low-stock alerts;
- specialist requests;
- outstanding balances summary where permitted;
- acquisition/referral trends;
- website booking requests.

## 10.2 Reception dashboard

Prioritize:

- current queue;
- today's appointments;
- unconfirmed appointments;
- pending website requests;
- cancellations/reschedule requests;
- specialist responses;
- patients needing immediate contact.

## 10.3 Dentist dashboard

Prioritize:

- today's patients;
- upcoming patient;
- clinical alerts;
- treatment plans needing review;
- follow-up/recall;
- assigned specialist cases.

Do not show the same dashboard to every role.

---

# 11. Patient Search and Patient List

## 11.1 Search

Global patient search should support:

- name;
- birthday;
- mobile;
- patient number.

Because duplicate detection uses name + birthday as a signal, search results should show enough context to distinguish similar patients without exposing unnecessary data.

## 11.2 Patient table

Approved:

- **TanStack Table**
- server-side pagination/filtering/sorting for large data
- **TanStack Virtual only when profiling shows it is needed**

Do not load the entire patient population into the browser just to virtualize it.

Suggested columns:

- patient name;
- patient ID;
- age or birthday as policy permits;
- mobile;
- last visit;
- next appointment;
- home/last branch;
- outstanding clinical alert indicator;
- acquisition source only in optional analytics/reception view.

## 11.3 Row interaction

Desktop:

- click row opens patient;
- optional preview drawer for quick contact/next appointment.

iPad:

- use a clear tap target;
- avoid tiny inline actions.

---

# 12. Patient Workspace

Recommended patient header:

- patient name;
- patient ID;
- age/birthday;
- contact;
- key clinical alerts;
- next appointment;
- branch context;
- quick actions.

Suggested tabs:

```text
Overview
Timeline
Clinical
Odontogram
Treatment Plans
Appointments
Files
Billing
Communications
Documents
```

Tabs shown according to role.

## 12.1 Overview

Include:

- summary demographics;
- allergies/medical alerts;
- active treatment;
- next appointment;
- recent visits;
- balance summary if permitted;
- acquisition/referral summary for authorized staff.

## 12.2 Timeline

Chronological timeline with filters:

- clinical;
- appointment;
- treatment;
- document;
- communication;
- payment;
- referral.

Use a neutral vertical timeline; do not create a different color for every event category.

---

# 13. Forms Architecture

Approved:

- **React Hook Form**
- **Zod**
- **@hookform/resolvers**

## 13.1 Schema rule

Validation schema should be shared/reused where appropriate between:

- client form validation;
- server action / route validation;
- API contract validation.

Client validation improves UX. It is not security.

## 13.2 Form patterns

Use:

- inline labels, not placeholder-only fields;
- visible required/optional states;
- inline errors under fields;
- top-level error summary for long clinical forms;
- clear unsaved-change indication;
- Save / Cancel placement consistently.

## 13.3 Long forms

For patient intake:

- sectioned form;
- save draft when appropriate;
- progress indicator for patient-facing flows;
- do not present 40 inputs on one unstructured page.

## 13.4 Clinical notes

For clinical notes:

- explicit draft/final states;
- unsaved warning;
- version/history awareness;
- no silent overwrite of finalized notes;
- keyboard shortcuts may be added later.

---

# 14. Data Fetching and State Management

## 14.1 Default: server rendering

Use Next.js Server Components/server data loading for:

- initial page shells;
- patient overview;
- mostly read-oriented pages;
- public website content;
- static/reference data where appropriate.

## 14.2 Client server-state

Approved:

- **TanStack Query**

Use it selectively for screens where data changes while the user stays on the page:

- calendar;
- queue;
- pending booking requests;
- communications;
- inventory operations;
- interactive analytics filters;
- mutations needing explicit cache invalidation.

Do not wrap every server fetch in TanStack Query.

## 14.3 Local client state

Default priority:

1. component state;
2. URL search params for shareable filters;
3. form state in React Hook Form;
4. TanStack Query for server state;
5. **Zustand** only for complex cross-component ephemeral workspace state.

Approved conditional use of Zustand:

- treatment canvas tool state;
- scheduler view/filter state when URL state is insufficient;
- multi-panel workspace state.

Do not put patient/server records into a global Zustand store as a substitute for proper server state.

## 14.4 Realtime

Supabase Realtime may later be used for:

- reception queue;
- appointment updates;
- task/booking-request notifications.

Do not subscribe every screen to every table.

---

# 15. Scheduling and Calendar UI

## 15.1 Selected baseline library

**Approved baseline for the prototype: `@daypilot/daypilot-lite-react` (DayPilot Lite).**

Reasons:

- open-source Apache 2.0 edition;
- React/Next.js support;
- resource calendar;
- horizontal scheduler;
- day/week/month calendar patterns;
- drag-and-drop;
- resizing;
- touch support;
- customizable CSS;
- resources can represent providers, chairs, rooms, or equipment;
- strong fit for a clinic that needs more than a generic personal calendar.

Retain required DayPilot attribution/license notices.

## 15.2 Why not FullCalendar Scheduler as default

FullCalendar's resource timeline and vertical resource views are Premium/Scheduler plugins. They are technically strong but introduce commercial licensing into the core scheduler.

We may evaluate them later if the open-source scheduler proves insufficient.

## 15.3 Why not Schedule-X resource scheduler as default

Schedule-X has a modern resource scheduler, but the resource scheduler and drag-and-drop plugin are premium features. It is not the default for the prototype.

## 15.4 React Big Calendar

React Big Calendar remains a fallback candidate because it supports resources and drag/drop, but DayPilot is the preferred prototype because its scheduling/resource model is closer to the clinic requirement.

## 15.5 Adapter boundary

Never let appointment domain code depend directly on DayPilot object shapes.

Create an application adapter:

```text
Domain Appointment
      ↓
Scheduler View Model
      ↓
DayPilot Adapter
      ↓
DayPilot UI
```

Example internal interface:

```ts
type SchedulerEvent = {
  id: string
  start: string
  end: string
  resourceId: string
  title: string
  status: AppointmentStatus
  providerIds: string[]
  branchId: string
}
```

If the calendar library is replaced, the domain API remains stable.

## 15.6 Views

Required:

- Day
- Week
- Month
- Provider/resource view
- branch filter
- provider filter
- chair/resource filter

Useful later:

- multi-branch operations view;
- specialist-request layer;
- unscheduled/waitlist queue.

## 15.7 Event appearance

Avoid rainbow event blocks.

Recommended:

- mostly light neutral event background;
- small left border/status strip;
- patient name + procedure;
- compact status icon/dot;
- muted branch/provider metadata.

For internal authorized users:

```text
Maria Santos
Cleaning
10:00–11:00 · Dr. Reyes
```

For Google Calendar the chosen external event title may remain:

```text
Maria S. — Cleaning
```

according to clinic configuration.

## 15.8 Drag-and-drop safety

Dragging is a convenience.

Flow:

1. user drags appointment;
2. UI shows target;
3. submit mutation to server;
4. server checks provider/resource/branch/time constraints;
5. database constraint is final guard;
6. success → commit new UI state;
7. conflict → revert and show clear reason.

Never assume a green target in the browser makes the move valid.

## 15.9 Touch

On iPad:

- support tap-and-hold drag where library behavior allows;
- provide an Edit/Reschedule action as an alternative;
- do not require precise drag to perform critical scheduling.

---

# 16. Appointment Forms and Drawers

Use a side sheet or dialog depending on screen width.

Create/edit appointment should include:

- patient;
- branch;
- procedure/service;
- provider;
- additional provider if needed;
- chair/resource;
- date;
- start/end or duration;
- status;
- notes;
- booking channel;
- reminder/confirmation state.

As fields change, availability can be recalculated.

Do not show all specialist/internal fields for a simple routine appointment unless needed.

---

# 17. Odontogram Frontend

## 17.1 Requirement

Odontogram is required in the first clinically useful release.

It must support at minimum:

- adult teeth;
- pediatric/primary teeth when clinic needs them;
- FDI numbering;
- tooth-level state;
- surface-level state;
- existing vs proposed treatment distinction;
- condition/treatment history;
- touch interaction;
- print/export rendering;
- read-only historical views.

## 17.2 Candidate evaluation result

### `react-odontogram`

Strengths:

- React-native component;
- TypeScript;
- FDI/Universal/Palmer;
- tooth condition coloring;
- accessible interactions;
- active recent releases.

Limitation for our core use:

- primarily tooth-selection/condition visualization;
- its public model is not as rich as the full surface/treatment charting requirement.

Use as reference or tooth-selector candidate, not automatically as the final clinical chart.

### `biomathcode/odontogram`

Strengths:

- five interactive tooth surfaces;
- adult/pediatric modes;
- FDI/Universal/Palmer;
- JSON export/rehydration;
- framework-independent Web Component;
- keyboard accessibility;
- PNG export.

This is a useful simpler candidate.

### `react-advanced-odontogram`

**Selected odontogram implementation for the prototype and current production direction.**

Its current published repository advertises:

- React + TypeScript;
- multi-surface caries/restorations;
- endodontic/prosthetic states;
- periodontal charting;
- FDI/Universal/Palmer;
- read-only mode;
- touch/accessibility testing;
- export capabilities;
- MIT license.

This feature set is closer to our actual clinical needs.

## 17.3 Adoption and ownership strategy

We will use `react-advanced-odontogram`, but we will treat it as code we may need to maintain rather than as an irreplaceable external dependency.

A controlled fork now exists at `https://github.com/Ditherys/React-Odontogram-Modul` (upstream: `https://github.com/ZoliQua/React-Odontogram-Modul`). Use the controlled fork as the project source during the odontogram spike and for any project-specific bug fixes/UI changes. The fork is still subject to the same clinical and technical evaluation gate; forking it does not constitute production approval.

Preserve the upstream MIT copyright and license notice and include it in a repository/product `THIRD_PARTY_NOTICES` or equivalent notices file in the fork/distribution. Do not consume a moving `main` branch for production. After the spike passes, pin an explicitly approved fork tag/commit or publish/use an organization-controlled versioned package from the fork, with the application lockfile committed. Do not accept unattended dependency upgrades. Upstream releases must be manually reviewed, merged into the fork only when desired, and regression-tested before adoption. The current fork still inherits upstream `repository`/`bugs` metadata in `package.json`; this is expected from the fork baseline and must be changed to the controlled fork before publishing any project-owned package.

Create **Frontend Spike F-01 — Odontogram Evaluation**.

Acceptance criteria:

- works in current Next.js/React client component;
- FDI mode;
- adult and pediatric chart;
- per-surface entry;
- existing condition vs proposed treatment;
- common dental states requested by target dentist;
- bridge/crown/missing/extraction/endodontic representation;
- good iPad interaction;
- keyboard usability;
- no unexpected external network traffic;
- data can be mapped to our canonical domain schema;
- printable/renderable;
- performance acceptable with patient history;
- license/security review passes.

If the selected implementation fails the prototype gate:

1. determine whether a controlled fork can correct the deficiencies;
2. if not, evaluate `biomathcode/odontogram` as the framework-independent fallback;
3. build a controlled internal SVG odontogram only if neither approach satisfies the clinical workflow.

Production dependency policy:

- canonical clinical data remains owned by our database schema;
- the odontogram is accessed through an application adapter;
- use the existing controlled fork `Ditherys/React-Odontogram-Modul` as the project source;
- keep the MIT license/copyright notice with the copied or distributed source;
- maintain application-level regression tests around the clinical behaviors we rely on;
- review upstream changes manually before merging them into our fork.

## 17.4 Domain independence

The database/application owns the odontogram state.

Never store only opaque third-party component JSON.

Use:

```text
Canonical Odontogram Model
          ↓
Odontogram Adapter
          ↓
Chosen Renderer
```

Historical snapshots are read-only.

---

# 18. Treatment Discussion Canvas

## 18.1 Selected library

Approved:

- **Konva**
- **react-konva**

Reasons:

- React integration;
- vector scene model;
- mouse/touch drawing;
- shapes/text/images;
- easy undo/redo when application state is modeled correctly;
- suitable for whiteboard-style treatment explanation.

## 18.2 Use cases

Canvas can start from:

- blank canvas;
- tooth illustration;
- odontogram snapshot;
- patient photo;
- normal X-ray image;
- uploaded reference image.

Tools:

- pen;
- eraser;
- arrow;
- line;
- rectangle;
- circle;
- text;
- highlighter;
- select/move;
- undo/redo;
- zoom;
- reset/clear with confirmation.

## 18.3 iPad/stylus requirements

- pointer/touch support;
- prevent page scroll while actively drawing inside canvas;
- avoid tiny toolbar controls;
- toolbar can move/collapse;
- accidental finger/palm behavior should be tested;
- use device-pixel-ratio aware rendering;
- preserve logical canvas coordinates independent of CSS size.

Pressure sensitivity can be explored, but it is not required for MVP clinical explanation.

## 18.4 Saved data

Save both:

1. **editable versioned source**
2. **rendered snapshot**

Editable source should be an application-level schema, for example:

```text
canvas_version
background_attachment_id
viewport
objects[]
```

Do not depend on undocumented internal serialization as the sole record format.

Formal acknowledged/signed treatment packets become immutable document versions.

---

# 19. Signature Capture

Approved:

- **signature_pad** for touch/mouse signature capture

Use for:

- patient acknowledgment;
- consent signatures where clinic policy permits;
- dentist signature capture if needed.

Store:

- signature vector/point data if appropriate;
- rendered signature image;
- signer identity;
- timestamp;
- document version/hash relationship;
- capture context.

A signature image alone is not the consent record. It belongs to the broader document/consent workflow.

Support physical-signature workflow as well:

- print;
- sign;
- scan/photo;
- upload;
- attach to immutable document version.

---

# 20. Document and PDF Frontend

## 20.1 Primary generation library

Approved:

- **@react-pdf/renderer**

Use for standardized generated documents such as:

- patient summary;
- treatment plan;
- treatment-plan packet;
- statement of account;
- treatment estimate;
- referral;
- prescription template subject to applicable requirements;
- consent/document packet;
- treatment discussion sheet.

Generate sensitive documents server-side whenever practical.

## 20.2 PDF utility library

Approved conditional:

- **pdf-lib**

Use when we need to:

- merge PDFs;
- stamp metadata;
- fill/modify existing forms;
- combine existing pages;
- post-process a generated document.

Do not install/use it merely because PDF exists.

## 20.3 Print behavior

The browser UI should have:

```text
Preview
Print
Download PDF
Send/Share (permission-controlled)
```

Generated clinical PDFs use stable document templates rather than screenshotting random application DOM.

---

# 21. Analytics UI

## 21.1 Selected chart library

Approved:

- **Apache ECharts**

Use direct `echarts` integration inside a small internal React wrapper.

Prefer tree-shakable imports from `echarts/core` for production screens.

Why:

- flexible charts;
- strong interaction;
- good fit for future practice analytics;
- supports richer dashboards than basic chart primitives.

## 21.2 Chart style

Analytics should match the restrained palette.

Default series palette should use:

- navy;
- slate blue;
- muted teal;
- muted amber;
- blush only as a limited secondary accent.

Do not assign a different saturated color to every metric.

## 21.3 Required analytics screens eventually

- appointments/no-shows;
- acquisition sources;
- referrals;
- provider utilization;
- branch comparison;
- revenue/collections where implemented;
- inventory;
- website conversion.

All charts should have:

- visible data labels/table alternative where useful;
- tooltips;
- clear axes;
- accessible text summaries for important conclusions.

---

# 22. Notifications and Feedback

Approved:

- **Sonner** for transient toast notifications.

Use toast for:

- save succeeded;
- appointment updated;
- background action queued;
- non-blocking error with retry.

Do not use toast as the only place for:

- validation errors;
- critical authorization failure;
- destructive confirmation;
- major clinical warnings.

Critical issues belong inline/dialog/banner.

---

# 23. Loading, Empty, Error, and Connectivity States

Every data screen must define:

- loading;
- empty;
- permission denied;
- recoverable error;
- stale/offline/degraded;
- success.

## 23.1 Skeletons

Use skeletons when layout is known.

Avoid full-page spinner for routine navigation.

## 23.2 Empty state

Examples:

- No appointments today
- No treatment plans yet
- No files uploaded
- No inventory movements

Include a relevant action if user has permission.

## 23.3 Graceful network behavior

Because full offline EMR is not required:

- show clear connectivity state when network operations fail;
- preserve unsaved form/drawing state locally while possible;
- never show “saved” until server confirms;
- retry idempotent operations safely;
- allow user to copy/recover unsaved clinical text if a save fails.

---

# 24. Accessibility

Target **WCAG 2.2 AA** for the application wherever practical.

Requirements:

- semantic labels;
- keyboard access for normal desktop workflows;
- visible focus indicators;
- no color-only state;
- sufficient text contrast;
- accessible dialogs;
- error messages associated with fields;
- touch-friendly controls;
- reduced-motion respect;
- screen-reader labels for icons/actions;
- scheduler has non-drag alternative;
- odontogram has keyboard/read-only alternatives as supported;
- canvas has textual treatment-discussion summary in addition to drawing.

Clinical meaning must never exist only in a visual drawing.

---

# 25. Frontend Security Boundaries

Frontend must never contain trusted authorization logic.

## 25.1 Public website

May receive only:

- public branch data;
- public provider profiles;
- public service data;
- constrained availability responses;
- booking-token flows.

It does not receive broad patient tables.

## 25.2 Private EMR

UI receives only data authorized for the signed-in role/context.

Do not fetch all clinical data and hide it with CSS.

## 25.3 Sensitive URL/content rules

Avoid putting in browser URLs:

- diagnosis;
- procedure details;
- patient names where not required;
- raw file object keys;
- access tokens.

Use opaque IDs.

## 25.4 File preview and image variants

Private R2 files:

- authorize before obtaining/streaming any source or derivative;
- use a short-lived signed URL or permission-checked server/Worker delivery path;
- do not store permanent public URLs;
- no patient name/diagnosis in object keys;
- routine image grids should request `thumbnail` rather than the original;
- normal clinical viewing should prefer `preview`/`display` derivatives when sufficient;
- provide an explicit authorized “View original” path when the source is needed;
- never present a lossy derivative as though it were the only/original clinical file;
- X-ray preview images must be labeled/treated as previews when clinically relevant;
- gracefully show `processing`, `failed`, or fallback-to-original states when a derivative is not ready;
- responsive image components should choose an appropriate predefined variant rather than inventing arbitrary transformation dimensions;
- public website media should also use the R2 + Cloudflare Workers/Images pipeline and normal CDN/cache behavior.

---

# 26. Heavy Client Library Isolation

The following should be dynamically loaded only where used:

- DayPilot scheduler;
- odontogram;
- Konva/react-konva;
- ECharts;
- PDF viewer if client preview requires it.

Public home page must not ship odontogram/scheduler code.

Patient list must not ship ECharts if analytics are not visible.

Use route/code splitting and Client Component boundaries aggressively.

---

# 27. Recommended Folder Structure

```text
src/
├── app/
│   ├── (public)/
│   │   ├── page.tsx
│   │   ├── about/
│   │   ├── services/
│   │   ├── dentists/
│   │   ├── branches/
│   │   ├── book/
│   │   └── contact/
│   │
│   ├── (auth)/
│   │   ├── login/
│   │   └── reset-password/
│   │
│   └── (app)/
│       ├── dashboard/
│       ├── calendar/
│       ├── patients/
│       ├── billing/
│       ├── inventory/
│       ├── referrals/
│       ├── documents/
│       ├── analytics/
│       └── settings/
│
├── components/
│   ├── ui/
│   ├── shell/
│   └── shared/
│
├── features/
│   ├── appointments/
│   ├── patients/
│   ├── providers/
│   ├── scheduling/
│   ├── odontogram/
│   ├── treatment-plans/
│   ├── treatment-canvas/
│   ├── documents/
│   ├── billing/
│   ├── inventory/
│   ├── referrals/
│   └── analytics/
│
├── lib/
│   ├── auth/
│   ├── permissions/
│   ├── supabase/
│   ├── r2/
│   ├── validation/
│   ├── dates/
│   ├── formatting/
│   └── adapters/
│
├── hooks/
├── styles/
├── types/
└── test/
```

Feature folders may contain:

```text
components/
queries/
mutations/
schemas/
view-models/
adapters/
tests/
```

Do not create abstract layers that have no real use.

---

# 28. Approved Library List

## 28.1 Install in initial frontend foundation

Core:

```text
next
react
react-dom
typescript
tailwindcss
@tailwindcss/postcss
lucide-react
```

UI components are added through shadcn as needed.

Forms/validation:

```text
react-hook-form
@hookform/resolvers
zod
```

Server-state/data:

```text
@tanstack/react-query
@tanstack/react-table
date-fns
date-fns-tz
```

Feedback:

```text
sonner
```

Testing foundation:

```text
vitest
jsdom
@testing-library/react
@testing-library/dom
@testing-library/user-event
@testing-library/jest-dom
@playwright/test
```

## 28.2 Install when corresponding feature starts

Scheduling:

```text
@daypilot/daypilot-lite-react
```

Canvas:

```text
konva
react-konva
```

Signature:

```text
signature_pad
```

Analytics:

```text
echarts
```

PDF:

```text
@react-pdf/renderer
```

Conditional PDF manipulation:

```text
pdf-lib
```

Large table virtualization only if needed:

```text
@tanstack/react-virtual
```

Complex cross-component local state only when justified:

```text
zustand
```

## 28.3 Odontogram dependency

Selected implementation:

```text
react-advanced-odontogram   # selected; project-controlled fork: Ditherys/React-Odontogram-Modul
```

Fallback/reference options should not be installed in the production bundle unless needed:

```text
odontogram                  # framework-independent fallback
react-odontogram            # reference/tooth-selector fallback
```

The renderer remains behind our own adapter and must never define the canonical clinical database format.

## 28.4 Optional later

Only add with a real requirement:

```text
@dnd-kit/react
```

Possible uses:

- sortable admin lists;
- custom inventory arrangements;
- custom unscheduled task queue.

Do not use it to replace DayPilot appointment scheduling without reason.

---

# 29. Libraries Explicitly Not Chosen as Default

## 29.1 FullCalendar Premium/Scheduler

Not default because resource views are premium/commercial.

May be reconsidered if:

- advanced resource timeline becomes critical;
- SaaS budget/license supports it;
- DayPilot Lite limitations become expensive to work around.

## 29.2 Schedule-X Premium Resource Scheduler

Not default because resource scheduler and drag/drop capabilities needed for this product are premium.

## 29.3 Cloudinary/media widgets

Cloudinary widgets are not part of the default frontend stack.

Use controlled R2 upload/download flows plus the project media adapter for Cloudflare Workers/Images derivatives. UI components must not depend directly on Cloudflare transformation parameter syntax; they should ask the application layer for semantic variants such as `thumbnail`, `preview`, `display`, or `original`.

## 29.4 Generic dashboard template kits

Do not buy/adopt a large dashboard template as the design system.

They frequently create:

- inconsistent components;
- unused dependencies;
- design lock-in;
- generic visual identity.

---

# 30. Testing Strategy

## 30.1 Unit/component

Use:

- Vitest
- React Testing Library
- user-event

Test user behavior rather than component internals.

Critical component examples:

- appointment form;
- branch selector;
- patient duplicate warning;
- permission-aware action state;
- inventory transfer form;
- treatment plan calculations;
- document options.

## 30.2 End-to-end

Use Playwright.

Required E2E paths:

- login;
- branch selection;
- create/find patient;
- duplicate-patient warning;
- create appointment;
- appointment conflict rejection;
- website booking request;
- reception approval;
- cross-branch provider conflict;
- odontogram save/reopen;
- treatment drawing save/reopen;
- PDF generation;
- inventory transfer;
- role access denial.

Run at desktop and iPad-like viewport sizes.

## 30.3 Accessibility

Use automated checks where useful, but also manually verify:

- keyboard;
- focus;
- screen-reader names;
- contrast;
- touch targets;
- drag alternatives.

---

# 31. Frontend Prototype Spikes Before Full Feature Build

## Spike F-01 — Odontogram

Goal:

choose/validate odontogram renderer.

Output:

- decision ADR;
- mapping to canonical schema;
- clinician screenshots/demo;
- performance/touch findings.

## Spike F-02 — Scheduler

Build a realistic sample with:

- two branches;
- 3–5 dentists;
- on-call dentist;
- chair resources;
- overlapping appointments;
- drag/reschedule;
- iPad test.

Use DayPilot Lite.

Success means:

- UI is clear;
- custom branding is achievable;
- touch is acceptable;
- event/view model adapter is clean;
- server rejection can revert movement.

## Spike F-03 — Treatment Canvas

Use React Konva to test:

- iPad stylus/finger;
- laptop mouse;
- undo/redo;
- text/arrow;
- image background;
- save/reload vector state;
- render preview.

## Spike F-04 — PDF Packet

Generate:

- treatment plan;
- drawing image;
- cost estimate;
- signature area;
- clinic branding;

as one A4 PDF using React-pdf.

---

# 32. Design QA Checklist

Before accepting a screen:

## Visual / anti-template

- uses neutral-first palette;
- no unnecessary pink/gold;
- no random component colors;
- consistent spacing and restrained radius;
- ordinary sections are not wrapped in cards without a reason;
- no nested-card composition unless independently justified;
- no mandatory four-KPI-card dashboard pattern;
- no decorative chart without an operational question;
- no large greeting/marketing copy inside routine EMR work screens;
- status pills are used for actual statuses/categories, not ordinary metadata;
- shadows/elevation are mostly reserved for overlays;
- hierarchy is obvious even with decoration removed;
- the layout matches the domain (table, ledger, timeline, scheduler, patient workspace, form) rather than a generic dashboard template;
- works without hover.

## Workflow

- primary action is clear;
- destructive action separated;
- common task takes minimal clicks;
- user can recover from error;
- loading/empty/error states exist.

## Security

- data shown is role-appropriate;
- hidden action is also server-protected;
- sensitive file uses temporary access;
- patient data is not in client logs.

## Accessibility

- keyboard works;
- focus visible;
- labels present;
- contrast passes;
- touch controls usable;
- color not sole meaning.

## Technical

- heavy library isolated;
- no unnecessary global state;
- no duplicated server truth;
- domain data not coupled to third-party UI shape;
- tests exist.

---

# 33. Suggested First Screens to Design

Do not design every screen at once.

Recommended sequence:

1. App shell + branch selector
2. Login
3. Dashboard
4. Patient list/search
5. Patient overview
6. Appointment calendar
7. Appointment create/edit sheet
8. Odontogram prototype
9. Treatment plan
10. Treatment discussion canvas
11. Documents/PDF
12. Inventory
13. Website home
14. Website booking
15. Analytics

This sequence exercises the design system against real complexity early.

---

# 34. Public Website and EMR Relationship

Use one visual language, but different density.

## Website

- more photography;
- larger headings;
- more whitespace;
- stronger brand accent;
- marketing CTA.

## EMR

- more data;
- compact controls;
- more neutral;
- minimal decorative artwork;
- predictable toolbars;
- task speed over marketing expression.

A visitor should recognize the same clinic brand, while a dentist should feel they are inside a serious clinical tool.

---

# 35. Frontend Decision Summary

Approved decisions:

```text
Framework               Next.js App Router + React + TypeScript
Styling                 Tailwind CSS
UI foundation           shadcn/ui
Icons                   Lucide React
Font                    Geist Sans via next/font
Forms                   React Hook Form
Validation              Zod
Server state            TanStack Query (selective)
Tables                   TanStack Table
Virtualization          TanStack Virtual only when needed
Local complex state     Zustand only when justified
Scheduling              DayPilot Lite for React
Odontogram              prototype gate; react-advanced-odontogram first
Treatment drawing       Konva + react-konva
Signature               signature_pad
Analytics               Apache ECharts
PDF generation          @react-pdf/renderer
PDF manipulation        pdf-lib only when needed
Toasts                   Sonner
Unit/component tests    Vitest + Testing Library
E2E                     Playwright
Primary UI mode         Light
Supported devices       Laptop/desktop + iPad/tablet + mobile phone
Complex work surfaces   Larger-screen optimized, with deliberate mobile adaptations
```

Brand direction:

```text
Neutral-first clinical UI
Deep navy = primary
Warm white = base
Blush = sparse accent
Muted gold = sparse decorative accent
No rainbow dashboard
No highly colorful EMR
```

---

# 36. Research / Decision Basis

The decisions above were reviewed against current documentation available in August 2026.

Key implementation facts used in decisions:

- Current Next.js App Router supports Server Components by default and Client Components for interactive/browser-dependent areas. Keep client boundaries narrow.
- Tailwind has a current Next.js installation path and works well with tokenized application styling.
- shadcn supports current Next.js setup and provides source-owned UI components.
- TanStack Query is designed for asynchronous/server state; TanStack Table can be combined with TanStack Virtual when truly large client-side rendering requires it.
- DayPilot Lite is currently available under Apache 2.0 for React, includes resource scheduling/calendar capabilities, drag/drop, and touch-oriented scheduler behavior. Some advanced tree/hierarchy features are Pro-only, so our UI must not depend on resource trees in MVP.
- FullCalendar resource timeline/vertical resource views are Premium features.
- Schedule-X resource scheduler and its drag/drop functionality are Premium features.
- React Konva documents a React-style vector free-drawing pattern and mouse/touch interaction suitable for whiteboard-style tools.
- `react-advanced-odontogram` currently advertises a richer clinical feature set than the simpler odontogram candidates, but it remains third-party code and must pass the prototype/security/clinical gate.
- React-pdf currently supports PDF rendering on browser and server and has a Node API suitable for generated documents.
- pdf-lib supports programmatic creation/modification/merging of PDFs when needed.
- ECharts supports modular/tree-shakable imports.
- Signature Pad supports desktop/mobile canvas signatures and serializable point data.
- WCAG 2.2 AA requires sufficient contrast; pale blush/gold therefore remain decorative rather than normal text colors.
- `next/font` can self-host/optimize font assets, which supports using Geist without browser requests to Google.

---

# 37. Change-Control Rule

This file is authoritative for frontend implementation.

When Claude or Codex wants to replace a selected frontend dependency, it must:

1. identify the current dependency/decision;
2. explain the real limitation;
3. propose the alternative;
4. compare accessibility, license, bundle size, maintenance, React/Next.js compatibility, and migration cost;
5. confirm domain data remains independent from the library;
6. create/update an ADR;
7. receive approval before a broad replacement.

Do not change scheduler, odontogram, canvas, PDF, or state-management libraries simply because an agent prefers another package.

---

# 37A. External Design Research Basis — 2026-08-11

These are design references, not libraries to copy wholesale. They support the project decisions above:

- **shadcn/ui — “npx shadcn create” (Dec 2025):** shadcn explicitly emphasizes customization and introduced compact styles such as Nova and Mira after acknowledging that default-driven apps had begun to look alike. Project implication: own and customize the source components; do not ship default shadcn as the product identity.
  - https://ui.shadcn.com/docs/changelog/2025-12-shadcn-create
- **Microsoft WinUI compact sizing:** Microsoft documents compact density for mouse/keyboard desktop workflows so more content can remain visible, while default sizing is touch-oriented. Project implication: support responsive density rather than one universal control height.
  - https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/compact-sizing
- **Carbon Design System — Data table:** Carbon treats data tables as primary data work surfaces, supports multiple row densities, and recommends giving dense tables sufficient width instead of cramming them into small containers. Project implication: list-heavy EMR screens should use wide, task-oriented tables rather than card grids.
  - https://carbondesignsystem.com/components/data-table/usage/
- **U.S. Web Design System — Table:** USWDS recommends minimal visual styling for structured/comparable data and notes scrollable tables for dense data. Project implication: tables should maximize scanning/comparison, not decorative chrome.
  - https://designsystem.digital.gov/components/table/
- **NHS Digital Service Manual — Card:** cards are for grouping related content/actions, not a universal wrapper. Project implication: use cards when the boundary carries meaning, otherwise prefer sections, lists, tables, and workflow-specific patterns.
  - https://service-manual.nhs.uk/design-system/components/card/
- **NHS Digital Service Manual — Hub page:** cards should not substitute for information architecture or transactional navigation. Project implication: do not use tile/card galleries as the default way to move through EMR tasks.
  - https://service-manual.nhs.uk/design-system/patterns/hub-page
- **WCAG 2.2:** maintain visible keyboard focus, minimum pointer-target sizing, and alternatives for non-essential dragging interactions. Project implication: compactness must preserve accessibility and touch safety.
  - https://www.w3.org/TR/WCAG22/

The project is not adopting these external design systems wholesale. They are evidence for the internal rules: customize owned components, use the right information structure for each task, keep professional software dense-but-readable, and preserve accessibility across mouse, keyboard, touch, and stylus.

---

# 38. Definition of Frontend Foundation Complete

The frontend foundation phase is complete when:

- Next.js + TypeScript strict project runs;
- Tailwind design tokens are defined;
- shadcn base components are themed;
- Geist font is configured through `next/font`;
- public and private route groups exist;
- EMR shell is responsive across desktop/laptop, iPad/tablet, and mobile phone widths;
- branch selector shell exists;
- authentication shell exists;
- React Hook Form + Zod pattern is established;
- TanStack Query provider is scoped to private interactive surfaces;
- error/loading/empty primitives exist;
- Sonner is configured;
- Playwright and component tests run;
- color contrast checks pass for core tokens;
- no clinical feature has yet coupled its persistence model to a UI library;
- scheduler/odontogram/canvas spikes are scheduled before their full modules are built.

At that point, feature implementation can proceed without allowing every feature agent to invent a new frontend stack.
