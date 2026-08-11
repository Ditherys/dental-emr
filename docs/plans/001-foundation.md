# Dental EMR & Practice Management Platform
## PHASE_1_FOUNDATION_PLAN.md — Version 1.5

**Status:** Implementation-ready plan for repository/bootstrap and security/tenancy foundation  
**Prepared:** 2026-08-12 (Asia/Manila)  
**Primary implementation agents:** Claude Code + OpenAI Codex, with human approval and Git checkpoints  
**Primary application:** Next.js App Router + React + TypeScript  
**Backend/database:** Supabase Auth + PostgreSQL + Row Level Security  
**Initial real customer model:** One dental organization with two branches, with dynamically addable future branches  
**Future direction:** Multi-tenant SaaS for Philippine dental clinics

---

# 0. Purpose of This Plan

This document is the first bounded implementation plan for the Dental EMR / Practice Management Platform.

The large architecture documents already answer the broad questions. This file answers the narrower engineering question:

> **What exactly should Claude Code and Codex build first, in what order, with what tests, and what must be true before Phase 1 Foundation is considered complete?**

This is intentionally **not** a plan for the whole EMR.

Phase 1 Foundation creates the safe skeleton that later modules will depend on:

- repository and project structure;
- current Next.js + TypeScript application scaffold;
- design-system foundation;
- Supabase Cloud development workflow with a dedicated non-production project;
- database migrations;
- organization and branch tenancy;
- user profiles and organization memberships;
- branch memberships;
- roles and permissions;
- authorization helpers;
- baseline Row Level Security;
- Supabase Auth SSR integration;
- invitation-only workforce access pattern;
- MFA enrollment/challenge foundation;
- audit-event foundation;
- application shell and branch selector;
- basic owner/admin branch management;
- synthetic fixtures;
- unit/component/database/E2E testing;
- CI checks;
- environment and secret separation;
- security headers baseline;
- AI-agent workflow and review checkpoints.

It does **not** yet implement the actual clinical product domains.

No patient records, medical histories, appointments, treatment plans, odontograms, X-rays, billing ledgers, inventory ledgers, reminders, Google Calendar integration, or production R2 clinical-file flows should be built in this phase unless a tiny placeholder is necessary to prove a foundation boundary.

---

# 1. Source-of-Truth Documents

Before working on this phase, an implementation agent must read the relevant approved documents in this order:

```text
1. docs/plans/001-foundation.md                ← this plan once placed in repo
2. docs/MASTER_PRODUCT_PLAN.md
3. docs/TECHNICAL_ARCHITECTURE.md
4. docs/FRONTEND_ARCHITECTURE.md
5. docs/SECURITY_ARCHITECTURE.md
6. docs/DATABASE_DESIGN.md
7. approved ADRs in docs/decisions/
8. AGENTS.md / CLAUDE.md
```

If this bounded implementation plan conflicts with an older architecture note, the agent must not silently choose a side. It must identify the conflict and either:

1. resolve it against a newer approved source-of-truth document; or
2. propose an ADR/change for human approval.

Conversation history is not an architectural source of truth.

---

# 2. Phase Goal

At the end of Phase 1, a developer should be able to clone the repository, start the local Next.js application, connect it to the designated Supabase Cloud development project, sign in using synthetic workforce users, and verify that:

```text
Organization A
├── Branch A1
├── Branch A2
└── authorized members

Organization B
├── Branch B1
└── authorized members
```

are isolated correctly.

An owner/admin should be able to:

- authenticate;
- complete the MFA flow in the supported environment;
- see the organization they belong to;
- see branches they are authorized to access;
- add another branch when authorized;
- manage basic branch configuration;
- see the application shell;
- switch branch context without the branch selector becoming an authorization bypass.

A normal user must not be able to turn a URL parameter, request body, hidden field, browser devtools edit, or arbitrary UUID into access to another tenant or unauthorized branch.

The system should already establish the engineering pattern that all later modules follow:

```text
Browser request
      ↓
verified Supabase identity
      ↓
current active membership
      ↓
application permission/context check
      ↓
server/domain operation
      ↓
PostgreSQL RLS + constraints backstop
      ↓
audit when action is sensitive
```

---

# 3. Explicit Non-Goals

Do not expand Phase 1 merely because a library or code generator makes it easy.

The following are **out of scope**:

- patient tables and patient UI;
- duplicate-patient detection;
- family/guardian relationships;
- providers and specialties except a minimal placeholder only if needed for account linkage testing;
- appointment scheduling;
- booking holds;
- DayPilot scheduler implementation;
- Google Calendar;
- online booking;
- SMS/email/Messenger automation;
- clinical encounters;
- medical/dental history;
- clinical notes;
- odontogram implementation;
- `react-advanced-odontogram` integration;
- treatment drawing/Konva;
- signature workflows;
- PDF engine;
- R2 clinical-file access or Cloudflare Images/Workers media processing;
- billing;
- inventory;
- analytics;
- reminders/background jobs beyond a tiny infrastructure placeholder if required;
- SaaS subscriptions/billing;
- platform-admin/customer-support impersonation;
- production patient-data import.

The approved future media direction is R2 canonical storage + Cloudflare Workers/Images for bounded image derivatives. **Do not implement or provision that pipeline in Phase 1** beyond generic security/environment boundaries needed by later phases, and do not add Cloudinary as a shortcut.

Do not install heavy feature libraries simply because they are already approved for later use.

Approved future libraries such as DayPilot Lite, `react-advanced-odontogram`, Konva, Signature Pad, ECharts, and React-pdf should be installed only when their feature spike/implementation phase begins.

This reduces:

- supply-chain surface;
- bundle complexity;
- version drift before use;
- unnecessary agent context;
- upgrade noise.

---

# 4. Phase 1 Definition of Done

Phase 1 Foundation is complete only when all of these are true.

## 4.1 Repository

- [ ] Git repository initialized.
- [ ] Main application runs locally.
- [ ] Exact dependency tree is committed through the package lockfile.
- [ ] `.gitignore` protects local environment/secrets.
- [ ] `.env.example` contains names only, never real credentials.
- [ ] architecture documents live under `docs/`.
- [ ] bounded plans live under `docs/plans/`.
- [ ] ADRs live under `docs/decisions/`.
- [ ] `AGENTS.md` is short and repository-specific.
- [ ] `CLAUDE.md` is short and points Claude to the real source-of-truth documents rather than duplicating them.

## 4.2 Frontend foundation

- [ ] Next.js App Router + TypeScript strict mode works.
- [ ] Tailwind is configured.
- [ ] shadcn/ui is initialized.
- [ ] core design tokens match the approved neutral/navy/blush/gold direction.
- [ ] Geist Sans is configured with `next/font`.
- [ ] public/auth/EMR route groups exist.
- [ ] responsive EMR shell exists and is intentionally usable on desktop/laptop, iPad/tablet, and mobile phone widths.
- [ ] branch selector exists.
- [ ] basic loading/error/empty-state primitives exist.
- [ ] form pattern using React Hook Form + Zod is demonstrated.
- [ ] TanStack Query provider exists only where needed and does not turn the entire App Router tree into a Client Component.
- [ ] Sonner is configured for non-sensitive UI notifications.

## 4.3 Backend/database foundation

- [ ] the repository is linked to the designated Supabase Cloud development project without storing credentials in Git.
- [ ] database migrations can be previewed and applied reproducibly to the linked development project.
- [ ] a disposable cloud development/test database can be rebuilt from committed migrations + synthetic seed data when explicitly authorized.
- [ ] `organizations` implemented.
- [ ] `branches` implemented.
- [ ] `profiles` implemented.
- [ ] `organization_members` implemented.
- [ ] `branch_memberships` implemented.
- [ ] `roles` implemented.
- [ ] `permissions` implemented.
- [ ] `role_permissions` implemented.
- [ ] `member_roles` implemented.
- [ ] minimal `audit_events` foundation implemented.
- [ ] RLS enabled for every exposed tenant table.
- [ ] private/internal helpers are not accidentally exposed as public Data API tables.
- [ ] database TypeScript types can be generated from the schema.

## 4.4 Authentication/security

- [ ] Supabase Auth server-side pattern implemented using current supported SSR guidance.
- [ ] server verifies identity using verified claims/current user state rather than trusting raw browser state.
- [ ] no public workforce signup route.
- [ ] invitation-only workforce onboarding flow is represented.
- [ ] suspended/inactive membership blocks access.
- [ ] MFA enrollment/challenge flow exists or is feature-gated in local dev with production enforcement clearly defined.
- [ ] privileged actions can require AAL2/recent MFA.
- [ ] authorization is checked server-side.
- [ ] RLS is a backstop, not a substitute for application authorization.
- [ ] no Supabase secret/service-role key is used in client code.
- [ ] security headers baseline exists.
- [ ] secret/dependency scanning exists in CI.

## 4.5 Tenancy

- [ ] Organization A cannot read Organization B.
- [ ] Organization A cannot update Organization B.
- [ ] branch access cannot be forged by changing `branch_id`.
- [ ] add-branch workflow automatically sets the authenticated organization on the server/database side.
- [ ] adding Branch 3 requires no schema change.
- [ ] user branch choices are navigation context, not authority.

## 4.6 Tests

- [ ] type check passes.
- [ ] lint passes.
- [ ] unit/component tests pass.
- [ ] pgTAP database tests pass.
- [ ] RLS negative tests pass.
- [ ] Playwright login/authorization/branch tests pass.
- [ ] app production build succeeds.
- [ ] reconstruction from committed migrations + synthetic seed succeeds against an explicitly disposable Supabase Cloud test project.

## 4.7 Data policy

- [ ] all fixture data is synthetic.
- [ ] no real patient name/contact/record exists anywhere in repo/test data/screenshots.
- [ ] no production secret exists in Git history.

---

# 5. Implementation Decisions Locked for Phase 1

## 5.1 One application repository

Use **one Next.js application repository** initially.

Do not introduce Turborepo/multiple deployable apps yet.

Reason:

- the public website and private EMR are intentionally allowed to share one Next.js codebase at the initial stage;
- route groups can preserve trust/UI boundaries;
- a monorepo adds workspace/build/deployment decisions that do not improve the Phase 1 foundation;
- later separation remains possible because domain logic will not be embedded into page components.

Conceptual shape:

```text
dental-emr/
├── src/
├── supabase/
├── tests/
├── docs/
├── scripts/
├── public/
├── AGENTS.md
├── CLAUDE.md
├── package.json
└── package-lock.json
```

## 5.2 Package manager

Use **npm** for the initial repository.

Rationale:

- ships with Node.js tooling and requires one less bootstrap dependency for a beginner-maintained project;
- fully supported by Next.js, Supabase CLI, shadcn, Vitest, and Playwright;
- produces a lockfile that must be committed;
- the architecture does not depend on package-manager-specific behavior.

Do not mix npm/pnpm/yarn lockfiles.

If the project later becomes a true multi-package monorepo and a switch is justified, make that a deliberate migration/ADR rather than allowing an agent to switch package managers casually.

## 5.3 Versions

Do **not** hard-code an old framework version from these planning documents.

At repository initialization:

1. use current stable compatible releases;
2. inspect official framework documentation;
3. install;
4. commit the resolved `package-lock.json`;
5. record installed versions in the Phase 1 completion report.

The implementation should be reproducible from the lockfile.

## 5.4 React Compiler

React Compiler is not required for Phase 1 success.

Do not block scaffolding on it.

If the current `create-next-app` recommended setup enables it cleanly, the implementation agent may retain it after confirming compatibility with our selected libraries. Otherwise defer it until a measurable need appears.

Do not manually optimize every component with `useMemo`/`useCallback` in anticipation of performance problems.

## 5.5 No ORM in Phase 1

Do **not** add Prisma, Drizzle, TypeORM, Sequelize, or another ORM just because an agent prefers one.

The approved architecture uses:

- PostgreSQL migrations;
- Supabase generated TypeScript database types;
- Supabase client / controlled server functions/RPCs where appropriate.

An ORM can be proposed later only through an ADR that demonstrates a real problem it solves.

---

# 6. Required Development Environment

Before creating the repository, verify:

```text
Git
Node.js supported by current Next.js
npm
VS Code or preferred editor
PowerShell
Claude Code CLI
Codex CLI
browser access to Supabase Cloud
```

For the current Next.js documentation reviewed when this plan was written, Node.js 20.9 or newer is required. Re-check the current requirement at execution time.

This project intentionally uses **Supabase Cloud for development**. A local Supabase Docker stack is not part of the approved workflow, so Docker Desktop is not a Phase 1 prerequisite merely for Supabase.

The primary developer environment is Windows + PowerShell. Keep the repository in one normal local filesystem path, for example:

```text
~\Desktop\dental-emr
```

Do not assume WSL/Linux-only paths or commands. Avoid storing the active repository under OneDrive or another cloud-sync folder when possible because sync tooling can interfere with Node/Git working files.

Persistent application data must not live on the developer workstation. The local machine contains source code, dependencies, build artifacts, and temporary tooling only; structured application data lives in Supabase Cloud, and future file/object data lives in Cloudflare R2.

---

# 7. Target Repository Structure

The initial structure should converge toward:

```text
dental-emr/
│
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   └── page.tsx
│   │   │
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   ├── accept-invite/
│   │   │   ├── mfa/
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (emr)/
│   │   │   ├── dashboard/
│   │   │   ├── settings/
│   │   │   │   └── branches/
│   │   │   └── layout.tsx
│   │   │
│   │   ├── auth/
│   │   │   └── confirm/
│   │   │       └── route.ts
│   │   │
│   │   ├── api/
│   │   │   └── health/
│   │   │       └── route.ts
│   │   │
│   │   ├── globals.css
│   │   └── layout.tsx
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── auth/
│   │   ├── branch/
│   │   └── feedback/
│   │
│   ├── features/
│   │   ├── auth/
│   │   ├── organizations/
│   │   └── branches/
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   ├── proxy.ts
│   │   │   └── admin.ts        # server-only; only if actually required
│   │   ├── auth/
│   │   │   ├── require-user.ts
│   │   │   ├── require-membership.ts
│   │   │   └── require-permission.ts
│   │   ├── authorization/
│   │   ├── env/
│   │   ├── validation/
│   │   └── utils/
│   │
│   ├── server/
│   │   ├── actions/
│   │   ├── queries/
│   │   └── services/
│   │
│   └── types/
│       └── database.generated.ts
│
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── tests/
│   └── seed.sql
│
├── tests/
│   ├── e2e/
│   └── helpers/
│
├── scripts/
│   ├── generate-db-types.sh
│   ├── verify-no-secret-client-imports.*
│   └── seed-local-auth.*
│
├── docs/
│   ├── MASTER_PRODUCT_PLAN.md
│   ├── TECHNICAL_ARCHITECTURE.md
│   ├── DATABASE_DESIGN.md
│   ├── FRONTEND_ARCHITECTURE.md
│   ├── SECURITY_ARCHITECTURE.md
│   ├── decisions/
│   └── plans/
│       └── 001-foundation.md
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── public/
├── .env.example
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── components.json
├── eslint.config.*
├── next.config.*
├── playwright.config.ts
├── tsconfig.json
├── vitest.config.*
├── package.json
└── package-lock.json
```

This is a target, not permission to create empty folders solely to match a diagram. Create a folder when code or documentation genuinely belongs there.

---

# 8. Checkpoint P1-00 — Create the Repository and Import the Plans

## Objective

Create the source-of-truth engineering workspace before feature code begins.

## Steps

1. Create a new local repository folder.
2. Initialize Git.
3. Create `docs/`, `docs/plans/`, and `docs/decisions/`.
4. Copy the approved architecture documents into `docs/` with stable names rather than version-suffixed working names.
5. Save this file as:

```text
docs/plans/001-foundation.md
```

6. Create short agent instruction files.

### `AGENTS.md`

It should contain only high-value repository rules. Prefer concision, but line count is **not** a hard acceptance gate; do not delete security, tenancy, responsive, dependency, or handoff rules merely to hit an arbitrary size target. Typical contents include:

- read the current phase plan before changing code;
- use synthetic data only;
- no production secrets;
- server owns authorization;
- never disable RLS to fix a test;
- migrations are committed;
- no new framework/library without plan/ADR approval;
- run tests before completion;
- do not modify unrelated domains;
- include security impact in reviews.

### `CLAUDE.md`

Keep it shorter than `AGENTS.md` where practical, without removing high-value project safeguards merely to satisfy a line-count target.

Example intent:

```text
Read AGENTS.md first.
For architecture/scope changes, read docs/MASTER_PRODUCT_PLAN.md and relevant docs.
For current work, follow docs/plans/001-foundation.md.
Do not use real patient data or production secrets.
Do not silently alter approved architecture decisions.
```

Do not paste the 10,000-word architecture into `CLAUDE.md`.

## Deliverable

A commit containing documentation and agent rules only.

Suggested commit:

```text
chore: initialize architecture documentation
```

## Codex review

Codex reviews whether:

- hierarchy is understandable;
- agent files are concise;
- source-of-truth precedence is clear;
- no stale duplicate plan has higher apparent authority.

---

# 9. Checkpoint P1-01 — Scaffold the Next.js Application

## Objective

Create the smallest current stable Next.js foundation that matches the approved architecture.

## Recommended scaffold

Use standard `create-next-app`, not a feature-rich third-party starter template.

At implementation time, the command should follow the current official CLI syntax, conceptually:

```bash
npx create-next-app@latest dental-emr
```

Choose/configure:

```text
TypeScript          Yes
Linter              ESLint
Tailwind CSS        Yes
src/ directory      Yes
App Router          Yes
Import alias        @/*
Agent instructions  Yes, then replace/refine with our project-specific files
```

Do not use a generic admin-dashboard template.

Do not scaffold authentication from a random tutorial repo.

## Immediate verification

Run:

```bash
npm run dev
npm run lint
npm run build
```

Verify:

- application renders;
- TypeScript is enabled;
- App Router is active;
- no generated sample page remains as permanent product architecture;
- package lockfile exists.

## TypeScript

Keep strict mode enabled.

Avoid `any` as a default workaround.

Do not add `// @ts-ignore` to bypass foundational type errors unless a documented third-party issue genuinely requires it.

## Deliverable

Commit a clean buildable application scaffold.

Suggested commit:

```text
chore: scaffold Next.js application
```

## Codex review focus

- current supported Next.js conventions;
- no obsolete Pages Router structure;
- no unnecessary global Client Component;
- no feature libraries installed early;
- strict TypeScript retained.

---

# 10. Checkpoint P1-02 — Establish Dependency Policy and Core Packages

## Objective

Install only dependencies required by the foundation.

## Foundation runtime dependencies

Expected categories:

```text
Supabase browser/server client
Supabase SSR helpers
Zod
React Hook Form
React Hook Form resolver for Zod
TanStack Query
Lucide React
Sonner
shadcn-owned component dependencies added by the CLI
```

Do not install the entire future frontend list.

Explicitly defer:

```text
DayPilot Lite
react-advanced-odontogram
Konva / react-konva
signature_pad
ECharts
@react-pdf/renderer
pdf-lib
TanStack Table unless a Phase 1 screen truly needs it
TanStack Virtual
Zustand
```

## Foundation development dependencies

Expected:

```text
Supabase CLI
Vitest
jsdom
Testing Library
Testing Library user-event
vite-tsconfig-paths
Playwright
```

The final exact packages should follow current official framework guidance at execution time.

## Dependency rules

1. Commit `package-lock.json`.
2. Do not use broad floating GitHub dependencies in production code.
3. Avoid installing packages solely to save 10 lines of simple code.
4. Before adding a package, check:
   - maintenance;
   - license;
   - current compatibility;
   - whether we already have equivalent functionality;
   - whether it runs client-side and increases attack/bundle surface.
5. No package replacement of approved scheduler/odontogram/canvas/PDF choices without ADR/human approval.

## Deliverable

Core dependency baseline and working build.

---

# 11. Checkpoint P1-03 — Design System and Application Shell

## Objective

Establish the approved clinical visual language before individual modules invent their own styles.

## shadcn/ui

Initialize shadcn using the current official Next.js setup.

Add only components needed for the foundation, likely:

```text
Button
Input
Label
Card
Separator
Badge
Dropdown Menu
Sheet
Dialog / Alert Dialog
Tooltip
Breadcrumb
Sidebar primitives if selected after testing
Skeleton
Form-related primitives
Select or Combobox
```

Do not run a command that installs every shadcn component.

## Design tokens

Define CSS variables/tokens corresponding to the approved palette.

Core brand:

```text
Navy 950        #082F52
Navy 900        #0B3A63
Navy 800        #12476F
Navy 700        #245B80
Navy 100        #E8F0F6
Navy 50         #F3F7FA
```

Neutral foundation:

```text
Ink             #17212B
Slate text      #5D6B78
Muted text      #77828C
Border          #E2E6EA
Surface         #FFFFFF
Warm surface    #F8F6F5
Subtle surface  #F4F5F6
```

Sparse accents:

```text
Blush           #D7A4AF
Blush soft      #FAF2F4
Gold            #C5A064
Gold soft       #F7F1E7
```

The private EMR remains neutral-first.

Do not use blush/gold as normal body-text colors.

## Font

Use Geist Sans through `next/font`.

## Route groups

Create the minimum route boundaries:

```text
(public)
(auth)
(emr)
```

They are organizational/trust/UI boundaries, not independent databases.

## EMR shell

Build a shell with:

- app logo/name;
- primary sidebar/navigation placeholder;
- current organization display;
- branch selector placeholder wired later to authorization data;
- authenticated user menu;
- content area;
- responsive desktop/tablet/mobile behavior;
- visible focus states;
- no dark mode requirement.

The shell is the first enforcement point for the project’s **anti-template clinical UI rule**. It must look like a restrained professional work application, not a generic generated SaaS dashboard.

For Phase 1 specifically:

- do not add a “Welcome back” hero/greeting block;
- do not add a default four-KPI-card row;
- do not add decorative charts or fake analytics;
- do not put every placeholder/section inside a rounded `Card`;
- prefer flat page sections, separators, subtle borders, and compact spacing;
- use restrained 6–8 px radii for ordinary EMR controls/containers and reserve obvious elevation for overlays;
- do not use blush/gold as functional status colors or as large application surfaces;
- branch/account/security screens should use forms, summary lists, and tables where appropriate rather than tile galleries;
- desktop/fine-pointer presentation may be compact, but iPad/mobile/coarse-pointer controls must expand hit targets/spacing appropriately;
- no hover-only action may be required to complete a Phase 1 task.

Do not fill the sidebar with every future module.

During Phase 1, keep visible modules limited to things that exist, e.g.:

```text
Dashboard
Branches
Account/Security
```

## Feedback primitives

Create reusable:

- `PageLoading`;
- `PageError`;
- `EmptyState`;
- `PermissionDenied`;
- `InlineFieldError`.

Never toast sensitive patient details later; Sonner is for concise UI feedback.

## Deliverable

Responsive branded shell with no fake clinical feature screens and no generic card-grid/KPI-dashboard composition. The shell should establish the compact, flat, neutral-first clinical visual language that later modules inherit.

---

# 12. Checkpoint P1-04 — Initialize Supabase Cloud Development

## Objective

Establish a reproducible **cloud-first** database workflow in which the application connects to a dedicated Supabase Cloud development project while schema history remains in Git.

The hosted development database is disposable and must contain synthetic data only. It is not production.

## Cloud project requirement

Create or designate a Supabase Cloud project such as:

```text
dental-emr-dev
```

Use the closest approved region for the initial Philippine deployment (currently Southeast Asia / Singapore is the intended default, re-checking available regions when the project is created).

Do not create application tables manually before migration history is established.

## CLI installation and linking

Install the Supabase CLI as a project development dependency according to current official instructions.

Conceptually in PowerShell:

```powershell
npm install supabase --save-dev
npx supabase init
npx supabase login
npx supabase link --project-ref <DEV_PROJECT_REF>
```

Do **not** run `npx supabase start`; a local Supabase stack is intentionally out of scope.

Authentication tokens/database passwords belong in native credential storage, environment variables, or an approved secret manager. Never place them in Git, documentation, agent prompts, or committed `.env` files.

## Commit

Commit the project-owned database artifacts:

```text
supabase/config.toml
supabase/migrations/
supabase/seed.sql
supabase/tests/
```

Do not commit CLI internal state, credentials, or secrets.

## Critical cloud workflow

Before applying a migration to the linked development project:

```powershell
npx supabase db push --dry-run
npx supabase migration list --linked
```

After review/approval:

```powershell
npx supabase db push
```

The Git migration files remain authoritative even though the database runtime is hosted.

A destructive rebuild may be used **only** against an explicitly disposable cloud development/test project:

```powershell
npx supabase db reset --linked
```

`db reset --linked` destroys data. An AI agent must not run it automatically merely to fix drift. It must first verify the linked project, confirm that it is disposable non-production, and obtain explicit human approval when there is any ambiguity.

At database checkpoints, the intended proof is:

```text
committed migrations
      ↓
dry-run against designated cloud environment
      ↓
apply to disposable dev/test cloud project
      ↓
seed synthetic data where needed
      ↓
RLS/database + application tests
```

## No Dashboard-first schema

Once migration history is established, do not create or alter application schema directly in the hosted Table Editor/SQL Editor and leave the change untracked.

All intentional schema changes become migration files first. If a remote development change is ever made manually for diagnosis, reconcile it into migration history before continuing.

## MCP safety

If Supabase MCP is enabled, scope it to the specific development/test project. Prefer read-only access for inspection. Schema changes must still be represented by reviewed migration files in Git.

No MCP client receives unrestricted production patient-data access.

## Deliverable

A Git-initialized Supabase directory linked safely to a dedicated Supabase Cloud development project, with no local Supabase/Docker dependency and no manually created application schema.

Suggested commit:

```text
chore: initialize Supabase Cloud development
```

---

# 13. Checkpoint P1-05 — Foundation Database Migrations

## Objective

Implement only the tenant/identity/authorization data required for the foundation.

Do not create one giant migration for the entire EMR.

## Migration group A — Extensions and internal schemas

Only enable extensions actually needed now.

Foundation likely needs:

```text
pgtap
```

Potentially defer `btree_gist` and `pg_trgm` until scheduling/patient-search phases unless including them now creates no meaningful maintenance issue.

Create a non-exposed helper schema such as:

```text
private
```

for security helper functions/internal structures when appropriate.

Do not expose internal helper tables through the public Data API.

## Migration group B — Organizations

Implement `organizations` based on DATABASE_DESIGN.

Minimum concepts:

```text
id uuid PK
legal_name
business_name
slug
status
country_code default PH
default_timezone default Asia/Manila
default_currency default PHP
created_at
updated_at
archived_at
```

Rules:

- no hard-coded single-organization ID;
- slug is not authorization;
- deactivating an organization does not delete records.

## Migration group C — Branches

Implement `branches`.

Minimum concepts:

```text
id uuid PK
organization_id FK
name
slug
code
status
phone/email optional
address fields
timezone
website_visible
created_at
updated_at
archived_at
```

Constraints:

```text
unique (organization_id, slug)
unique (organization_id, code)
```

Do not cap the number of branches.

The data model must support:

```text
Branch 1 today
Branch 2 today
Branch 3 next year
Branch 12 later
```

without schema redesign.

`branch_business_hours` can be deferred to the provider/scheduling setup unless needed immediately for the Branch Settings screen.

## Migration group D — Profiles

Implement `profiles` linked to `auth.users.id`.

Do not store passwords.

Do not treat a profile as organization membership.

## Migration group E — Organization memberships

Implement `organization_members`.

Minimum:

```text
id
organization_id
user_id
membership_status
joined_at
suspended_at
created_at
```

Constraint:

```text
unique (organization_id, user_id)
```

Authorization must consider current membership status.

## Migration group F — Roles and permissions

Implement:

```text
roles
permissions
role_permissions
member_roles
```

Seed baseline roles:

```text
OWNER
ADMIN
DENTIST
RECEPTIONIST
DENTAL_ASSISTANT
VISITING_SPECIALIST
BILLING
```

Not every role needs a complete real-world permission matrix in Phase 1; however the permission engine must support it.

Seed a foundation permission catalog containing at least:

```text
organization.read
organization.manage
branch.read
branch.manage
user.invite
user.manage
role.manage
security.manage
audit.read
```

You may seed future permission codes from the approved security architecture to avoid repeated catalog migrations, but do not grant them carelessly just because they exist.

## Migration group G — Branch memberships

Implement `branch_memberships`.

Support one person belonging to multiple branches.

Constraint:

```text
unique (branch_id, organization_member_id)
```

Enforce tenant consistency: the branch and organization member must belong to the same organization.

Do not rely only on application code for this consistency.

## Migration group H — Minimal audit foundation

Pull forward a minimal `audit_events` table now because foundation actions already include high-impact security/administrative changes.

Minimum concepts:

```text
id
organization_id
branch_id nullable
actor_user_id nullable
actor_type
category
action
entity_type
entity_id nullable
result
request/correlation id nullable
metadata jsonb sanitized
occurred_at
```

Do not put raw passwords, tokens, full request bodies, or arbitrary clinical text into audit metadata.

Audit events are append-oriented.

The Phase 1 audit framework should record at least:

- branch created;
- branch updated/archived;
- membership invited/activated/suspended;
- role assignment changed;
- security settings changed where implemented.

## Deliverable

A sequence of small reviewable migrations.

Do not merge them until the linked non-production workflow has been verified with migration-history checks and a dry-run, and the migrations have been successfully applied to the designated disposable cloud development/test project. At an appropriate checkpoint, prove reconstruction by rebuilding a throwaway cloud test project from committed migrations + synthetic seed data.

---

# 14. Checkpoint P1-06 — Supabase Type Generation

## Objective

Keep TypeScript aligned with the actual database schema.

Use current Supabase CLI type-generation guidance to generate database types after migrations.

Output example:

```text
src/types/database.generated.ts
```

Add a script such as:

```text
npm run db:types
```

The generated file should not be manually edited.

Application-specific domain types may wrap generated types, but agents must not create duplicate hand-written database interfaces that drift silently from schema.

CI should be able to detect if generated types are stale where practical.

---

# 15. Checkpoint P1-07 — Implement Supabase Auth for Next.js SSR

## Objective

Establish the supported cookie/session pattern before protected application screens are built.

## Environment variables

Current Supabase guidance uses public project URL + publishable key for ordinary browser/server user clients.

The public variables should follow the current convention, conceptually:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Do not place a Supabase secret key in any `NEXT_PUBLIC_*` variable.

If a server-only elevated Supabase key becomes necessary for an invitation/admin bootstrap operation, use a server-only variable such as:

```text
SUPABASE_SECRET_KEY=
```

and isolate the client in a module that imports `server-only`/is otherwise impossible to include in browser code.

Most authenticated application requests should use the user's session and RLS, **not** an elevated secret client.

## Client split

Create current supported equivalents of:

```text
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/proxy.ts
src/proxy.ts
```

Use the current official Supabase SSR pattern.

The proxy's job is mainly session token refresh/cookie propagation.

Do not make `proxy.ts` the only authorization boundary.

## Identity verification

On server-protected pages/actions:

- verify claims using current supported Supabase method;
- do not trust the user object from an unverified raw session merely because a cookie exists;
- where authorization depends on up-to-date suspension/membership, query current application membership state as well.

## Auth routes

Foundation routes:

```text
/login
/auth/confirm
/accept-invite
/mfa/enroll
/mfa/challenge
```

Exact route naming can differ, but responsibilities must remain clear.

## No workforce public signup

Do not expose:

```text
Create staff account
```

to anonymous visitors.

The future public website booking system is unrelated to workforce account creation.

---

# 16. Checkpoint P1-08 — Invitation-Only Workforce Onboarding

## Objective

Create the security pattern for adding clinic staff without exposing public staff registration.

Conceptual flow:

```text
Authorized owner/admin
       ↓
creates invitation
       ↓
invitation bound to organization + intended role/branch
       ↓
recipient verifies invitation
       ↓
Supabase identity exists
       ↓
organization membership activated
       ↓
MFA enrollment/challenge
       ↓
patient-access-capable role can be used
```

## Foundation implementation choices

Use one of these patterns only after inspecting current Supabase Auth capabilities:

1. Supabase admin invitation API from a server-only privileged function; or
2. application-managed high-entropy invitation record + normal Auth confirmation flow.

If application-managed invite tokens are used, they must be:

- high entropy;
- single use;
- expiry-bound;
- purpose-bound;
- stored hashed at rest where the application owns the token;
- auditable;
- invalid after acceptance/revocation.

Do not put a service/secret key in the browser to send invites.

## Bootstrap first owner

A new tenant has a chicken-and-egg problem: no owner exists yet to invite the owner.

For the first prototype, use a controlled bootstrap procedure:

- cloud dev/test: synthetic seed/bootstrap script;
- staging: controlled admin bootstrap;
- production later: explicit SaaS tenant-provisioning workflow.

Do not hard-code an owner's email into application authorization logic.

---

# 17. Checkpoint P1-09 — MFA Foundation

## Objective

Make MFA a first-class workforce security feature rather than a launch-week patch.

Approved production direction:

- individual accounts;
- TOTP authenticator-app MFA preferred;
- patient-data-capable workforce accounts use MFA;
- high-risk actions can explicitly require AAL2/recent reauthentication.

## Foundation UI

Create:

```text
MFA setup page
QR/enrollment flow
verification challenge
factor status
basic recovery guidance
```

Do not invent a custom cryptographic MFA system.

Use Supabase MFA APIs.

## Authorization helper

Create a reusable server-side check conceptually like:

```text
requireAal2()
```

for future dangerous operations.

Phase 1 should prove it on an administrative security action or test route, not wait until patient export exists.

## Local/test environment

Automation tests may need a documented testing strategy for MFA.

Do not disable production MFA simply because E2E automation is inconvenient.

Use test-specific synthetic factors/session fixtures where supported.

---

# 18. Checkpoint P1-10 — Application Authorization Layer

## Objective

Create a reusable permission/context system so every later feature does not reinvent authorization.

## Core server helpers

Implement equivalents of:

```text
requireUser()
requireActiveOrganizationMembership()
requireOrganizationAccess()
requireBranchAccess()
requirePermission()
requireAal2()
```

Exact signatures are implementation details.

## Required behavior

A request should never be authorized merely because it contains:

```text
organization_id
branch_id
role
user_id
```

from the browser.

Instead:

1. get verified authenticated user;
2. load active membership;
3. derive/validate organization;
4. validate branch access if relevant;
5. validate permission;
6. perform operation.

## Current organization context

Do not allow a client to nominate any arbitrary tenant.

For future users who belong to multiple organizations, an organization selector can exist, but server authorization must still validate membership.

## Branch context

The branch selector is a **workflow context selector**, not a permission grant.

Example:

```text
User has Branch A + B
select Branch B
→ valid context

User has Branch A only
manually changes localStorage/URL to Branch B
→ server denies
```

Do not store authorization only in localStorage.

---

# 19. Checkpoint P1-11 — RLS Helper Functions and Policies

## Objective

Make tenant isolation a database property as well as an application property.

## RLS rule

Enable Row Level Security on every tenant/application table exposed through the Supabase Data API.

A table should not be considered complete until its RLS policy and negative tests exist.

## Helper functions

Create a minimal reviewed set of helper functions in a non-exposed/internal schema where appropriate.

Possible concepts:

```text
is_active_org_member(org_id)
has_org_permission(org_id, permission_code)
has_branch_access(branch_id)
has_branch_permission(branch_id, permission_code)
```

Do not proliferate dozens of nearly identical functions.

## SECURITY DEFINER caution

If a helper uses `SECURITY DEFINER`:

- explain why it is necessary;
- set a safe/explicit `search_path`;
- schema-qualify sensitive references;
- expose only required execute privileges;
- ensure it returns/decides only what is needed;
- write tests for privilege escalation.

An AI agent must not create a security-definer function merely because it makes RLS easier to bypass.

## Foundation policy intent

### `organizations`

- authenticated active member may read their organization;
- only authorized manager/owner role can update allowed organization settings;
- no anonymous internal organization row access.

### `branches`

- authorized member can read branches they are allowed to see according to role/branch rules;
- org-wide admins can see/manage all branches in their organization;
- branch-scoped users cannot manage an unrelated branch;
- Organization A cannot read Organization B.

### `organization_members`

- user may read enough of their own current membership to determine access;
- managers with user-management permission can manage members in their organization;
- Organization A admin cannot manage Organization B.

### roles/permissions

- catalog reads limited to appropriate authenticated contexts;
- grants/assignments require `role.manage`/equivalent;
- user cannot assign themselves elevated privileges.

### `branch_memberships`

- user can read own branch access;
- authorized admins can manage within same organization;
- tenant consistency enforced.

### `audit_events`

- normal users cannot mutate historical audit events;
- only privileged users can read the appropriate audit subset;
- application/system insertion path is controlled.

## No RLS bypass as normal architecture

Do not fix application authorization problems by routing ordinary user operations through a secret/service-role client.

That defeats defense in depth.

---

# 20. Checkpoint P1-12 — Synthetic Seed and Security Fixtures

## Objective

Create realistic test data that proves isolation before patient modules exist.

## Minimum synthetic organizations

```text
ORG A — SmileLab Demo Dental
├── Branch A1 — Demo Main
└── Branch A2 — Demo Second

ORG B — Other Dental Demo
└── Branch B1 — Demo Branch
```

These are synthetic development entities even if names resemble product concepts.

Do not enter real clinic addresses, employee details, or patient information unless explicitly approved as public marketing data and genuinely needed—which it is not in Phase 1.

## Synthetic users

Create test personas:

```text
Org A Owner
Org A Admin
Org A Dentist
Org A Receptionist
Org A Assistant
Org A Visiting Specialist
Org B Owner
Org B Dentist
Suspended Org A User
```

For database-level RLS tests, JWT claims can be simulated in controlled test transactions using the supported Supabase testing pattern.

For E2E login tests, create synthetic Auth users only in the designated cloud development/test project through a controlled script/test setup.

Never use real staff email accounts in CI.

## Why two tenants now

Even though the first real deployment is one organization, Organization B exists in fixtures to prove:

> SaaS isolation works because of architecture, not because only one customer currently exists.

---

# 21. Checkpoint P1-13 — Basic Owner/Admin Branch Management

## Objective

Prove the multi-branch architecture with a real end-to-end administrative workflow.

## Screen

```text
Settings
→ Branches
```

Owner/admin can see:

```text
Branch name
code
status
city/province or abbreviated address
contact
active/archived state
```

## Add Branch

Form uses React Hook Form + Zod.

Fields should be limited to foundation data:

```text
name
code
slug (auto-generated/editable if desired)
phone optional
email optional
address fields
timezone default Asia/Manila
website visibility
```

Do not add scheduling/resources/inventory setup here yet.

After creation, future phases can add a guided branch setup checklist.

## Critical server rule

The create-branch action must **derive organization ownership from the authorized server context**.

Do not trust:

```json
{"organization_id":"whatever-browser-sends"}
```

as authority.

The server/domain action receives the desired branch fields and determines the organization from the authenticated active membership/permission context.

## Test

Org A owner creates Branch A3.

Expected:

- row belongs to Org A;
- Org A owner can see it;
- Org B cannot see it;
- Org A branch-scoped user does not automatically gain access unless policy says their role is organization-wide or a branch membership is added;
- audit event records creation.

This is the first proof that a dentist opening another branch requires configuration, **not a database redesign**.

---

# 22. Checkpoint P1-14 — Branch Selector

## Objective

Create a branch-aware workflow shell without confusing UI state with authorization.

## Behavior

For an organization-wide user:

```text
[ All Branches ▼ ]
- All Branches
- Demo Main
- Demo Second
- Demo New Branch
```

For a branch-scoped user:

```text
[ Demo Main ▼ ]
```

or only branches they are authorized to use.

## Storage

A selected branch preference may be persisted in:

- URL route/query if safe and opaque;
- user preference record later;
- non-sensitive client storage for UX.

But every server query/action still validates access.

## `All Branches`

`All Branches` is a reporting/workflow scope, not a fake branch row in the database.

Do not insert a branch named `ALL`.

## Responsive behavior

- desktop: branch context is visible in header/sidebar without crowding the work surface;
- iPad/tablet: branch controls are touch-friendly in portrait and landscape;
- mobile: branch switching remains a first-class action in a compact menu/drawer and does not require hover;
- resizing/orientation changes must not silently change the selected branch or lose unsaved shell state.

---

# 23. Checkpoint P1-15 — Security Headers and Browser Baseline

## Objective

Create safe browser defaults early enough that later features adapt to them.

## Headers baseline

Evaluate/configure current Next.js-compatible equivalents of:

```text
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
frame-ancestors via CSP or X-Frame-Options policy
Permissions-Policy with unused capabilities disabled
HSTS in real HTTPS production environments
Content-Security-Policy
```

## CSP strategy

Do not paste an extremely strict CSP that immediately breaks Next.js and then delete CSP entirely.

Recommended process:

1. establish a documented baseline;
2. use report-only during integration if necessary;
3. understand required origins;
4. tighten before production patient use.

Later integrations (R2 signed downloads, Google, analytics, etc.) must explicitly fit the policy rather than causing a permanent `*` allowlist.

## Clickjacking

Private EMR should not be arbitrarily frameable by unrelated sites.

## Browser cache

Sensitive clinical responses will later require deliberate no-store/private behavior. Phase 1 should create utilities/patterns without pretending public pages need the same policy.

---

# 24. Checkpoint P1-16 — Environment Separation

## Objective

Ensure a preview deployment cannot casually connect to production data.

## Environment matrix

### Developer workstation + Cloud DEV

```text
Next.js runs locally on Windows/PowerShell
Supabase Cloud DEV project
synthetic fixtures only
separate development credentials
no persistent application database on the workstation
future file/media development uses a separate non-production Cloudflare R2 bucket/prefix
```

### Cloud TEST / Staging

```text
dedicated Supabase Cloud test/staging project when automated destructive DB tests or pre-production validation require it
Vercel staging/preview strategy
synthetic/de-identified data only
separate credentials
separate non-production R2 boundary when file workflows begin
```

### Production

```text
Vercel production
separate Supabase Cloud production project
separate production Cloudflare R2 bucket/boundary
production secrets
real patient data only after security/privacy gate
```

## Hard rule

Preview deployments must not automatically receive production database credentials.

Use environment-scoped Vercel variables.

## `.env.example`

May contain:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

only if the variable is actually used.

Add comments clarifying:

- publishable key is not a user permission system;
- secret key bypasses RLS and must remain server-only.

Do not add real values.

## Production creation timing

The project does not need to onboard real patient data in Phase 1.

A production Supabase project may be created later when deployment hardening begins. Phase 1 uses cloud development/test infrastructure only and must prevent the codebase, CI, previews, MCP, or local application from assuming development/test and production are the same environment.

---

# 25. Checkpoint P1-17 — Testing Foundation

## Objective

Make tests part of the architecture, not a cleanup task.

## 25.1 Unit/component testing

Use current supported Vitest + React Testing Library setup.

Test examples:

- branch selector renders only authorized branch options from supplied data;
- permission-denied state;
- branch form Zod validation;
- organization/branch display components;
- authorization pure helper logic;
- environment validation;
- audit metadata redaction function if present.

Do not unit-test shadcn internals.

Test our behavior.

## 25.2 pgTAP database tests

Store in:

```text
supabase/tests/
```

Required suites:

### Schema

- expected tables exist;
- key FKs exist;
- uniqueness constraints exist;
- RLS enabled.

### Tenant isolation

As Org A user:

- select Org A → allowed;
- select Org B → zero rows/denied;
- update Org B → denied;
- create branch into Org B → denied.

### Branch access

- org-wide owner reads both Org A branches;
- branch-scoped user reads only authorized branch if policy is branch-scoped;
- arbitrary Branch B UUID does not grant access.

### Role escalation

- receptionist cannot make themselves owner;
- branch admin cannot assign role in another tenant;
- suspended user fails membership helper.

### Audit

- normal user cannot alter/delete audit history.

Use negative tests deliberately.

A test suite containing only successful owner operations is not a security test suite.

Keep the pgTAP SQL tests version-controlled, but do not assume `supabase test db` is usable for this architecture: the current Supabase CLI describes that command as testing the local database. Because this project is cloud-only, P1-17 must implement a **remote-safe test runner** against a dedicated Supabase Cloud TEST project (for example a reviewed Postgres/SQL execution path in CI), with transaction rollback where practical and strict environment guards. Do not reintroduce a local Supabase stack merely to run pgTAP.

## 25.3 Playwright E2E

Minimum foundation E2E flows:

```text
1. login
2. rejected unauthenticated EMR route
3. MFA foundation/challenge path
4. Org A owner sees Org A shell
5. Org A owner sees authorized branches
6. Org A owner creates Branch A3
7. branch selector can switch to Branch A3
8. direct attempt to access Org B administrative resource is rejected
9. branch-scoped user cannot forge another branch
10. suspended user is blocked
11. sign out
```

Run at least:

- desktop viewport;
- iPad-like viewport for shell/branch controls.

## 25.4 Production build

CI should run a production build because type/lint/unit success does not prove Next.js production compilation works.

---

# 26. Checkpoint P1-18 — CI Pipeline

## Objective

Every pull request should prove that the foundation remains reproducible.

## GitHub Actions CI

A pull request workflow should approximately:

```text
checkout
setup Node
npm ci
load protected credentials for a dedicated Supabase Cloud TEST project
verify the target project is non-production
preview/apply pending migrations to the test project
load synthetic test fixtures when required
run database/RLS tests against the dedicated cloud test project
generate/check database types from the cloud test schema
run linked database lint/advisors where appropriate
run lint
run typecheck
run Vitest
run Next.js build
run selected Playwright E2E
run dependency/security checks
run secret scan
```

Exact parallelization can be optimized later.

## Required scripts

Provide consistent `package.json` commands, e.g. conceptually:

```text
npm run dev
npm run lint
npm run typecheck
npm run test
npm run test:unit
npm run test:e2e
npm run test:db
npm run db:push:dry
npm run db:push:dev
npm run db:types
npm run build
npm run verify
```

`npm run verify` should eventually run the sensible pre-PR subset. Database operations that mutate a shared cloud environment must remain explicit and target-verified rather than being hidden inside every local verification command.

## Dependency scanning

At minimum use current supported package audit/advisory tooling plus a dependency review mechanism in GitHub where available.

Do not automatically upgrade major framework versions in the same PR as a clinical/security feature.

## Secret scanning

Use GitHub secret scanning if available for the repo plus a local/CI scanning mechanism appropriate to the project.

A failed secret scan must be treated seriously even if the detected secret was “only staging.”

If a real secret is committed, deleting the line is not sufficient; rotate/revoke the secret and address Git history/exposure as appropriate.

---

# 27. Checkpoint P1-19 — Audit Foundation

## Objective

Prove accountability for administrative/security changes without turning application logs into a second database.

## Event categories

Foundation examples:

```text
AUTH
MEMBERSHIP
ROLE
BRANCH
SECURITY
SYSTEM
```

Actions:

```text
membership.invited
membership.activated
membership.suspended
role.assigned
role.removed
branch.created
branch.updated
branch.archived
mfa.enrolled
mfa.removed (later/privileged)
```

## Audit payload

Store enough to answer:

```text
who
what
which organization
which branch if applicable
which entity
when
result
correlation/request context
```

Avoid:

- password;
- refresh token;
- access token;
- Supabase secret key;
- complete arbitrary request body;
- future medical note text.

## Application log vs audit log

Application log:

```text
service troubleshooting
```

Audit event:

```text
accountability for protected business/security action
```

Do not conflate them.

---

# 28. Checkpoint P1-20 — Authorization UX

## Objective

Ensure the UI communicates permissions correctly without pretending UI is security.

## Navigation

If a user lacks `branch.manage`, do not show an enabled Add Branch action.

But the underlying route/action must still deny a manually crafted request.

## Permission denied

Use a professional denied state:

```text
You don't have access to this area.
```

Do not reveal:

```text
You attempted to access Organization B patient/resource <UUID> ...
```

unnecessarily.

## Suspended/offboarded users

If a user's Auth session remains valid but their organization membership is suspended:

- protected server access fails;
- UI redirects/signs out or shows access revoked;
- membership status takes precedence over old UI state.

This is a critical foundation test.

---

# 29. Database Transaction and Consistency Rules

Even though Phase 1 has no scheduling/billing, establish these habits now.

## Multi-row authorization changes

Operations such as:

```text
create member + assign role + assign branches
```

should use a controlled transactional function/service so partial failure does not leave an unintended privilege state.

## Tenant consistency

Do not allow:

```text
Org A member
→ branch_membership referencing Org B branch
```

through missing composite constraints/validation.

Use database constraints/functions as appropriate.

## Updated timestamps

Use one consistent mechanism for `updated_at` where needed.

Do not create five slightly different timestamp triggers.

---

# 30. Database/RLS Review Checklist for Codex

For every Phase 1 migration, Codex must specifically inspect:

1. Can another organization infer or read this row?
2. Is `organization_id` trustworthy/consistent?
3. Can a client nominate a different organization?
4. Can a branch/member FK cross organizations?
5. Is RLS enabled?
6. Do policies cover SELECT/INSERT/UPDATE/DELETE deliberately?
7. Is `WITH CHECK` present where required, not only `USING`?
8. Can a user assign their own elevated role?
9. Does a helper function use `SECURITY DEFINER` unnecessarily?
10. Is `search_path` safe?
11. Is a secret/service-role client being used to avoid designing RLS?
12. Are indexes needed for the policy join path?
13. Do pgTAP negative tests exist?
14. Can a fresh disposable cloud test project be reconstructed from committed migrations + synthetic seed data?
15. Is migration rollback/recovery risk understood?

A migration should not be approved merely because SQL parses.

---

# 31. Frontend Review Checklist for Codex

For every Phase 1 UI change:

1. Is it Server Component by default where possible?
2. Is `use client` scoped narrowly?
3. Does the UI import a server-only secret module?
4. Is permission checking duplicated only in UI?
5. Is branch context treated as authority?
6. Is sensitive state placed in localStorage unnecessarily?
7. Are design tokens used rather than random colors?
8. Does it work at desktop, iPad/tablet, and mobile-phone widths?
9. Does keyboard focus work?
10. Is color the sole status signal?
11. Are error/loading/empty states present?
12. Are user-visible authorization errors safe and not over-disclosing?
13. Are forms validated both client-side for UX and server-side for trust?
14. Is a new dependency justified?

---

# 32. Server Action / Route Handler Rules

Whichever Next.js mutation mechanism is used for a Phase 1 operation, follow the same trust rules.

For a protected mutation:

```text
parse input
   ↓
verify user identity
   ↓
verify active membership
   ↓
verify permission/context
   ↓
perform transactional DB operation
   ↓
write audit event
   ↓
return minimal result
```

Client-side Zod validation is UX only.

Server parses again.

Do not send database errors containing internal table/policy details directly to the browser.

Map them to safe application errors while retaining useful server troubleshooting context without secrets.

---

# 33. Environment Validation

Create a typed environment-validation module using Zod or equivalent approved validation.

Validate at startup/build boundary where appropriate.

Separate:

```text
public env
server-only env
```

A public env module may export only values intentionally safe for browser bundles.

A server-only module must never be imported by Client Components.

CI should fail if required environment names for the target test environment are absent.

Do not log secret values when validation fails.

Bad:

```text
Missing SUPABASE_SECRET_KEY; current value is sb_secret_123...
```

Good:

```text
Missing required server environment variable: SUPABASE_SECRET_KEY
```

---

# 34. Health/Readiness Endpoint

Create a narrow health endpoint for deployment verification.

Example:

```text
GET /api/health
```

It may report:

```json
{
  "status": "ok"
}
```

or minimal build/environment metadata that is safe to expose.

It must not reveal:

- DB connection strings;
- Supabase project secrets;
- branch counts/customer names;
- environment variable contents;
- detailed dependency versions useful only internally unless deliberately public.

A later authenticated/internal readiness check can test deeper dependencies.

---

# 35. ADRs Required During Phase 1

Create concise ADRs before/while implementing foundational irreversible decisions.

ADR numbering rule:

- `ADR-001` through `ADR-004` below are reserved by this Phase 1 plan.
- `ADR-005` is already accepted as the Cloudflare R2 media-pipeline decision.
- `ADR-016` is already accepted as the Supabase Cloud-first development decision.
- `ADR-006` through `ADR-015` are currently unassigned; do not infer their meaning from older architecture backlogs.
- New future ADRs should normally start at `ADR-017` unless a deliberate reconciliation explicitly assigns an earlier gap.
- ADR numbers are assigned when the ADR is actually reserved/created, not when a backlog topic is brainstormed.

At minimum for Phase 1:

## ADR-001 — Next.js + Supabase core stack

Records why we use:

```text
Next.js App Router
TypeScript
Supabase Auth
PostgreSQL
RLS
```

## ADR-002 — Organization/branch tenancy

Records:

```text
Organization = SaaS tenant
Branch = organization-owned operating location
new branches are rows, not new deployments/databases
```

## ADR-003 — Authorization defense in depth

Records:

```text
application authorization + RLS
no UI-only permissions
```

## ADR-004 — Single Next.js repo for public website + private EMR initially

Records why one repo/codebase is used now and what boundaries allow later separation.

Do not create 15 empty ADRs just because the technical architecture listed future decisions.

Create the later ADRs with the corresponding implementation phase.

---

# 36. Agent Handoff Workflow

The project intentionally uses Claude Code and Codex as complementary engineers.

Do not copy entire chats between them.

Use Git + plan documents + diffs.

## Standard checkpoint workflow

```text
Human selects checkpoint
        ↓
Claude Code reads relevant docs
        ↓
Claude Plan Mode proposes bounded implementation
        ↓
Human approves or adjusts
        ↓
Claude implements
        ↓
runs required tests
        ↓
commit checkpoint
        ↓
Codex reviews repository diff + plan
        ↓
Codex reports concrete issues
        ↓
Claude fixes valid issues
        ↓
tests rerun
        ↓
final checkpoint commit
```

Codex must review **code**, not just Claude's explanation of the code.

## High-risk database/RLS work

For RLS/security migrations:

```text
Claude proposes migration
        ↓
Codex reviews SQL before merge
        ↓
negative tests run
        ↓
Claude revises
        ↓
second review if materially changed
```

Do not let one agent be the only designer, implementer, and reviewer of tenant isolation.

---

# 37. Recommended Git Checkpoints

Suggested commits are intentionally small enough to review.

```text
01 chore: initialize architecture documentation
02 chore: scaffold Next.js application
03 feat: establish design system and app shell
04 chore: initialize Supabase Cloud development
05 feat(db): add organization and branch foundation
06 feat(db): add membership and permission model
07 feat(db): add RLS helpers and policies
08 test(db): add tenant isolation pgTAP suite
09 feat(auth): add Supabase SSR authentication
10 feat(auth): add invitation and MFA foundation
11 feat: add authorized branch management
12 feat: add branch context selector
13 feat(security): add audit and browser security baseline
14 test: add foundation E2E security flows
15 ci: add foundation verification pipeline
```

Actual commit boundaries may combine very small changes, but do not produce one giant “implement foundation” commit.

---

# 38. Suggested Branching Strategy

For a solo developer assisted by agents, keep Git simple.

Recommended:

```text
main
  ↓
feature/phase-1-foundation
```

Within the phase, commit frequently.

Do not create dozens of long-lived branches simply because two agents exist.

Use worktrees/parallel agents only when tasks truly do not overlap.

For example:

Safe potential parallel work later:

```text
Agent A: design tokens/UI primitives
Agent B: review database migration
```

Unsafe parallel work:

```text
Agent A edits roles/RLS
Agent B independently edits same roles/RLS
```

Sequential review is preferred for security-sensitive foundation code.

---

# 39. Developer Commands — Target Experience

By the end of Phase 1, a new contributor should have a PowerShell-friendly README section approximating:

```powershell
# install dependencies
npm ci

# authenticate/link once to the designated Supabase Cloud DEV project
npx supabase login
npx supabase link --project-ref <DEV_PROJECT_REF>

# preview database migrations before any remote write
npm run db:push:dry

# apply reviewed migrations to the designated cloud DEV project
npm run db:push:dev

# generate DB types from the hosted development schema
npm run db:types

# start app locally (backend remains cloud-hosted)
npm run dev

# run checks
npm run lint
npm run typecheck
npm run test:unit
npm run test:db
npm run test:e2e
npm run build

# non-destructive full verification
npm run verify
```

Destructive remote reset/reseed commands must be separate, loudly named, environment-guarded, and limited to disposable cloud dev/test projects. They must never be an implicit prerequisite for starting the app.

Exact command composition may change based on the current Supabase CLI and test configuration.

The important property is:

> a fresh clone can be made operational from documented commands without manually reconstructing hidden Dashboard state.

---

# 40. What Not to Let Claude/Codex Do

The agents must not:

- create all planned database tables in Phase 1;
- build patients “while we're here”;
- install every future React library;
- switch to Firebase/Neon/another backend because of familiarity;
- introduce Prisma/Drizzle without approval;
- disable RLS merely to make development easier;
- make the Supabase secret key available to the browser;
- treat an Auth JWT role string as the complete clinic role model;
- hard-code one organization ID;
- hard-code two maximum branches;
- create a branch as a separate Supabase project;
- trust `organization_id` from form data;
- trust branch selection from localStorage;
- expose a public staff sign-up page;
- use real dentist/patient data in seed files;
- put credentials in `CLAUDE.md`/`AGENTS.md`;
- paste production error logs containing patient/security data into AI prompts;
- generate giant unreadable migrations;
- write `SECURITY DEFINER` helpers without explanation/tests;
- add a wildcard CSP forever simply because a package failed;
- skip negative authorization tests;
- claim completion because the happy-path owner UI works.

---

# 41. Phase 1 Manual QA Script

After automated tests pass, perform this manual walkthrough using synthetic accounts.

## Owner flow

1. Open `/login`.
2. Sign in as Org A Owner.
3. Complete MFA/challenge as required by the test environment.
4. Enter the EMR shell.
5. Confirm organization shown is Org A.
6. Confirm branch selector shows Branch A1 and A2.
7. Open Settings → Branches.
8. Add Branch A3.
9. Confirm it appears without deployment/restart/schema change.
10. Select Branch A3.
11. Refresh page; context remains usable according to chosen persistence strategy.
12. Review audit page/log using privileged test view if implemented.
13. Sign out.

## Branch-scoped staff flow

1. Sign in as Org A branch-scoped user.
2. Confirm only authorized branch is shown.
3. Attempt direct URL/request to Org A unauthorized branch.
4. Confirm denial.
5. Attempt request with Org B branch UUID.
6. Confirm denial.

## Cross-tenant flow

1. Sign in as Org A Owner.
2. Attempt to query/update Org B entity through direct request tooling/browser manipulation.
3. Confirm server authorization rejects.
4. Confirm RLS would also reject if application-layer branch is bypassed.

## Suspended user flow

1. Sign in or establish session for synthetic user.
2. Suspend organization membership using admin.
3. Attempt protected action with still-existing session.
4. Confirm current membership check denies.

## Responsive

1. Test desktop/laptop at a representative wide viewport.
2. Test iPad/tablet portrait and landscape-like viewports.
3. Test phone portrait at approximately 360–390 px and a large-phone width around 430 px.
4. Confirm branch selector, navigation, and user menu work without hover.
5. Confirm no page-level accidental horizontal overflow or clipped primary actions.
6. Confirm touch targets and visible keyboard-focus states.
7. Confirm virtual-keyboard interaction does not cover the active field/action on relevant forms.
8. Confirm resize/orientation changes do not lose selected branch/auth shell state.

---

# 42. Phase 1 Security Acceptance Tests

These scenarios are mandatory.

## SEC-FND-001 — tenant ID tampering

**Given:** Org A user  
**When:** request body contains Org B `organization_id`  
**Then:** operation denied or server ignores the untrusted field and derives Org A correctly.

## SEC-FND-002 — branch ID tampering

**Given:** user authorized for Branch A1 only  
**When:** request uses Branch A2/Org B branch ID  
**Then:** denied.

## SEC-FND-003 — self role escalation

**Given:** ordinary Org A member  
**When:** directly writes `member_roles` to assign OWNER  
**Then:** denied by application and RLS/policy.

## SEC-FND-004 — cross-tenant admin

**Given:** Org A Owner  
**When:** tries to manage Org B member/branch  
**Then:** denied.

## SEC-FND-005 — suspended session

**Given:** previously authenticated user  
**When:** membership becomes suspended  
**Then:** protected action fails even if browser still has session token.

## SEC-FND-006 — anonymous Data API

**Given:** anonymous public request  
**When:** requests organizations/branches/members  
**Then:** no internal tenant data returned.

## SEC-FND-007 — secret in client

**Given:** production build  
**When:** bundle/static output inspected/scanned  
**Then:** no `sb_secret_...`/legacy service-role credential present.

## SEC-FND-008 — audit tampering

**Given:** ordinary authenticated user  
**When:** tries to edit/delete historical audit event  
**Then:** denied.

## SEC-FND-009 — MFA privilege gate

**Given:** privileged user at insufficient assurance level  
**When:** attempts selected high-risk security/admin action  
**Then:** redirected/challenged for MFA rather than silently allowed.

## SEC-FND-010 — stale branch UI

**Given:** branch access revoked while session/UI remains open  
**When:** stale UI submits a mutation to revoked branch  
**Then:** server/database deny.

---

# 43. Performance Requirements for Foundation

Do not optimize prematurely, but avoid obviously expensive authorization patterns.

RLS/helper queries will become hot paths later.

Ensure appropriate indexes exist for:

```text
organization_members (organization_id, user_id)
organization_members (user_id, membership_status)
branches (organization_id, status)
branch_memberships (organization_member_id, branch_id)
member_roles (organization_member_id)
role_permissions (role_id, permission_id)
permissions (code)
audit_events (organization_id, occurred_at)
```

Exact indexes should be confirmed against actual query/RLS plans.

Do not create an index on every column automatically.

---

# 44. Accessibility Requirements for Foundation

Minimum:

- keyboard-accessible login;
- keyboard-accessible branch selector;
- visible focus;
- properly associated labels;
- no color-only states;
- desktop, iPad/tablet, and mobile touch-target/responsive usability;
- semantic headings;
- dialogs focus correctly;
- validation errors are associated with fields;
- permission denied is understandable;
- contrast meets approved WCAG 2.2 AA target for normal text.

The app does not need full formal accessibility certification in Phase 1, but the component system must not build inaccessible patterns that later screens copy.

---

# 45. Logging and Error Handling Baseline

## Error categories

Use application error concepts such as:

```text
UNAUTHENTICATED
ACCESS_DENIED
MEMBERSHIP_INACTIVE
VALIDATION_FAILED
NOT_FOUND
CONFLICT
INTERNAL_ERROR
```

Do not expose raw PostgreSQL policy errors to users.

## Logs

Allowed examples:

```text
request id
action name
organization id when operationally necessary
user id
error code
latency
```

Do not log:

- passwords;
- access/refresh tokens;
- Supabase secrets;
- invitation token plaintext;
- MFA secrets;
- future clinical text.

## Correlation IDs

Introduce request/action correlation IDs where practical so audit/security debugging later can link:

```text
application log
↔ audit event
↔ DB error
```

without placing sensitive payloads in logs.

---

# 46. Production Security Items Deliberately Not Completed in Phase 1

Phase 1 creates the pattern but is **not a real-patient production approval**.

Still required before real patient use include, among other items:

- completed PIA;
- actual clinic/DPO privacy review;
- production MFA enforcement;
- finalized session policy;
- patient-domain RLS;
- public booking security;
- R2 secure file pipeline, including original preservation and Cloudflare Workers/Images derivative processing;
- malware/file validation;
- signed-document immutability;
- clinical correction/versioning;
- backup/restore drill;
- incident-response runbook;
- retention policy;
- Google OAuth security;
- communications privacy;
- dependency/security review;
- production environment hardening.

Completion of Phase 1 must never be described as “the EMR is secure enough for real patients.”

It means:

> **the engineering foundation has the right security/tenancy patterns for subsequent phases.**

---

# 47. Exit Review — Questions the Human Owner Should Ask

Before approving Phase 1 and moving to patient development, ask:

1. Can I add a third branch from the software?
2. Does adding a branch avoid schema/code changes?
3. Can a staff user be limited to selected branches?
4. Can a dentist/admin be organization-wide when authorized?
5. If I change a branch ID in the browser, does the server reject unauthorized access?
6. Does Organization B exist in test fixtures specifically to prove isolation?
7. Does RLS independently backstop application checks?
8. Can a user promote themselves by calling the API directly?
9. Does a suspended user lose effective access immediately enough for the architecture?
10. Are there any secret/service keys in frontend code?
11. Are all database changes represented as migrations?
12. Can a fresh disposable cloud test project be reconstructed from committed migrations + synthetic seed data?
13. Are tests run automatically on pull requests?
14. Can another engineer understand where permissions are checked?
15. Is the application shell usable on laptop, iPad/tablet, and mobile phone?
16. Are colors consistent with the restrained SmileLab-inspired design?
17. Did we avoid building clinical modules prematurely?
18. Did Claude implement and Codex independently review security-sensitive changes?

If the answer to a security/tenancy question is unclear, Phase 1 is not finished.

---

# 48. Next Phase After Foundation

Once Phase 1 passes review, do **not** jump directly into every module.

Recommended next bounded implementation plan:

```text
docs/plans/002-patient-foundation.md
```

Expected scope:

- organization-level patient record;
- patient list/search;
- demographics;
- branch context;
- duplicate warning using normalized name + birthday;
- contacts/guardians;
- receptionist vs dentist access distinction;
- patient read/edit audit events;
- patient RLS;
- synthetic patient fixtures;
- no odontogram yet unless needed only as a placeholder tab.

Then subsequent bounded plans can address providers/resources, scheduling, website booking, clinical core/odontogram, treatment plans, files, billing, inventory, integrations, and analytics.

---

# 49. First Claude Code Prompt After the Repository Exists

Once this plan has been copied into the repo, the recommended first instruction to Claude Code is approximately:

```text
Read AGENTS.md and docs/plans/001-foundation.md first.
Then read the source-of-truth documents referenced by that plan.

We are starting Phase 1 Foundation from a new repository. Do not write code yet.
Inspect the repository and official documentation bundled/current for the versions we will use, then produce a checkpoint-by-checkpoint implementation proposal for P1-00 through P1-04 only.

Call out any conflict with the approved architecture. Do not add patient, scheduling, odontogram, billing, inventory, Google Calendar, or messaging functionality.
```

After Claude proposes the plan, review it before giving implementation permission.

Do not tell Claude:

```text
Build the whole dental EMR.
```

That destroys the value of all the planning work.

---

# 50. First Codex Review Prompt

After the first meaningful checkpoint commit:

```text
Review the current Git diff against docs/plans/001-foundation.md plus the relevant architecture documents.

Do not redesign the product. Focus on correctness, current Next.js/Supabase patterns, security, tenant isolation, maintainability, and whether the implementation exceeded the approved phase scope.

Report concrete findings ordered by severity. Pay special attention to:
- browser/server trust boundaries
- secret exposure
- organization/branch authorization
- RLS
- migration reproducibility
- dependency choices
- Client Component boundaries
- missing negative tests

Do not modify code unless I explicitly ask you to implement the fixes.
```

This keeps Codex in reviewer mode before it becomes another uncontrolled implementer.

---

# 51. Research/Implementation Notes Current as of August 2026

These details were checked against current official documentation while preparing this plan and should be re-checked at execution time because framework tooling changes.

## Next.js

Current official Next.js installation documentation:

- uses `create-next-app` as the standard scaffold;
- supports TypeScript, Tailwind, App Router, `src/`, ESLint/Biome, and agent instruction generation;
- currently lists Node.js 20.9 as the minimum;
- current App Router guidance should be preferred over old Next.js 14/15 tutorials.

Primary reference:

```text
https://nextjs.org/docs/app/getting-started/installation
https://nextjs.org/docs/app/api-reference/cli/create-next-app
```

## Supabase Cloud development with Git-managed migrations

This project intentionally does not run the local Supabase stack. Current Supabase CLI capabilities used by this architecture include:

```text
Supabase CLI as a project dependency
supabase init
supabase login
supabase link --project-ref <DEV_PROJECT_REF>
supabase db push --dry-run
supabase db push
supabase migration list --linked
supabase gen types ... --project-id / linked remote schema
supabase db lint --linked
supabase db reset --linked only for explicitly disposable non-production projects
version-controlled migrations
synthetic seed data
```

Supabase's general documentation often recommends local development, but the CLI also supports linked hosted-project operations. The user-approved architecture for this repository is cloud-first; do not reintroduce `supabase start`/Docker unless this decision is explicitly revisited.

Primary references:

```text
https://supabase.com/docs/reference/cli/getting-started
https://supabase.com/docs/guides/deployment/database-migrations
https://supabase.com/docs/guides/local-development/cli-workflows
https://supabase.com/docs/guides/ai-tools/mcp
```

## Supabase API keys

Current Supabase guidance uses a publishable key for public/browser-capable clients and secret keys for trusted backend components. Secret keys bypass RLS and must never be shipped to a browser.

Primary references:

```text
https://supabase.com/docs/guides/getting-started/api-keys
https://supabase.com/docs/guides/getting-started/quickstarts/nextjs
```

## Supabase SSR Auth

Current Next.js/Supabase SSR guidance uses browser/server clients plus a proxy/cookie refresh workflow and recommends verifying identity using the current supported claims/user verification methods instead of treating an unverified session object as authorization.

Primary reference:

```text
https://supabase.com/docs/guides/auth/server-side/creating-a-client
```

## Supabase testing

Supabase documents pgTAP for database structure, functions, and RLS testing. Its current CLI `test db` workflow is local-database oriented, so this cloud-only project must run the version-controlled pgTAP/RLS tests through a reviewed remote-safe runner against the dedicated Cloud TEST project instead of starting a local Supabase stack.

Primary references:

```text
https://supabase.com/docs/guides/local-development/testing/overview
https://supabase.com/docs/guides/database/extensions/pgtap
```

## Next.js testing

Current Next.js guides support:

- Vitest + Testing Library for unit/component testing;
- Playwright for E2E testing;
- E2E testing for async Server Component workflows where unit tooling is not the right fit.

Primary references:

```text
https://nextjs.org/docs/app/guides/testing/vitest
https://nextjs.org/docs/app/guides/testing/playwright
```

## Environments

Supabase currently documents separate local/staging/production workflows using migrations and CI/CD, and recommends CI-driven migration deployment for production rather than ad hoc local pushes.

Primary reference:

```text
https://supabase.com/docs/guides/deployment/managing-environments
```

---

# 52. Final Phase Principle

Phase 1 should not look impressive because it contains many screens.

It should be impressive because it makes the dangerous mistakes hard.

The foundation should make these statements true:

```text
New branch?
→ add a branch row through authorized workflow.

Different branch access?
→ membership/permission controls it.

Future second SaaS customer?
→ organization boundary already exists.

Browser changes an organization UUID?
→ application authorization rejects it.

Application authorization has a bug?
→ RLS provides another boundary.

Staff leaves clinic?
→ suspend membership; old session is not enough.

Agent adds a migration?
→ it is reviewable, testable, reproducible from Git.

Agent makes a mistake?
→ tests + second-agent review should catch high-risk classes before merge.

Real patient data?
→ still prohibited until later production/privacy/security gates are completed.
```

The objective is not to build quickly at the cost of rewriting the security/tenancy model later.

The objective is to build the **smallest foundation that is structurally correct enough to support the real dental product.**
