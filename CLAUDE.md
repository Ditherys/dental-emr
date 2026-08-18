# CLAUDE.md

## Project

Dental EMR & Practice Management Platform for Philippine dental clinics.

The first deployment is one dental organization with two branches. The architecture must remain ready for future multi-tenant SaaS use and dynamically addable branches.

Claude Code is the primary planning/implementation agent unless the user assigns another role for a specific task. Git and the repository documents are the source of truth.

## Read Before Working

Do not rely on conversation history as the project specification.

Read the smallest set of authoritative documents needed for the task:

1. `docs/MASTER_PRODUCT_PLAN.md` — product requirements and scope
2. `docs/TECHNICAL_ARCHITECTURE.md` — system architecture and technology boundaries
3. `docs/SECURITY_ARCHITECTURE.md` — security/privacy requirements and production gates
4. `docs/DATABASE_DESIGN.md` — schema, tenancy, RLS, constraints, migration strategy
5. `docs/FRONTEND_ARCHITECTURE.md` — frontend/UI/library decisions
6. `docs/plans/002-patient-foundation.md` — accepted Phase 2 implementation plan
7. Relevant ADRs in `docs/decisions/`

`docs/plans/001-foundation.md` remains the accepted Phase 1 record. The complete
Phase 2 plan and ADR-019 were independently reviewed and explicitly approved on
2026-08-19. Execute only its ordered task/checkpoint currently authorized. Do not
implement later product domains merely because they appear in architecture docs.

## Current Phase: Phase 2 Patient Foundation — P2-01

Phase 1 is formally accepted. Phase 2 planning approval is complete. Current
implementation authority is limited to `P2-01 — Patient permission contract`.
The accepted Phase 2 scope is limited to:

- organization-level patient identity and demographics;
- patient contacts and guardian/family relationships;
- patient list/search and bounded patient workspace;
- duplicate warning using normalized name + birthday without a hard uniqueness
  constraint;
- patient permissions, RLS, audit events, synthetic fixtures, and concurrency
  controls.

Do NOT advance to `P2-02` until P2-01 is independently reviewed and accepted.
Providers, scheduling, clinical history, Google Calendar, odontogram, treatment
plans, files, billing, inventory, communications, analytics, and AI/MCP remain
outside this phase.

## Approved Core Stack

Use current stable compatible versions at repository initialization and pin resolved versions in the lockfile.

- Next.js App Router
- React
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui
- Lucide React
- Geist via `next/font`
- React Hook Form + Zod
- TanStack Query selectively
- TanStack Table where needed
- Supabase PostgreSQL + Supabase Auth
- PostgreSQL RLS
- Cloudflare R2 as canonical object storage; Cloudflare Workers + Images for future image derivatives/optimization
- Vercel for deployment
- Vitest + React Testing Library
- Playwright
- pgTAP for database/RLS tests

Feature-specific libraries already approved in the frontend architecture must not be casually replaced. In particular, `react-advanced-odontogram` is the preferred odontogram prototype renderer, but canonical dental data must remain renderer-independent.

### Approved odontogram fork

The project-controlled odontogram source is:

- GitHub: `https://github.com/Ditherys/React-Odontogram-Modul`
- Upstream source: `https://github.com/ZoliQua/React-Odontogram-Modul`
- Package name at the current fork baseline: `react-advanced-odontogram`

When the odontogram phase begins, treat the `Ditherys/React-Odontogram-Modul` fork as the approved project-controlled source. Do not silently switch back to the upstream repository or another odontogram package. The upstream repository is an update source only; upstream changes must be reviewed and regression-tested before being merged into our fork. The fork currently inherits upstream repository/issue metadata in its `package.json`; do not interpret that inherited metadata as permission to install from or modify upstream directly. Before publishing a project-controlled package, update that package metadata to the controlled fork.

Do not make the EMR track the fork's moving `main` branch in production. After the odontogram spike passes, consume an explicitly approved tag/commit or an organization-controlled versioned package from the fork. Keep the adapter boundary and canonical database model independent of library-specific IDs/JSON. Preserve the upstream MIT copyright and permission notice in the fork/distribution.

If a bug, UI issue, accessibility problem, touch/iPad issue, or missing clinical behavior is inside the odontogram library, Claude may modify the controlled fork when explicitly working on that dependency. Add or update tests in the fork, then update the EMR to an explicitly approved fork revision and run EMR-level odontogram regression tests before acceptance.

## Working Method

Primary developer environment is Windows + PowerShell. Do not assume WSL/Linux-only paths or shell commands.

For non-trivial changes:

1. Inspect the repository and `git status` first.
2. Read the current phase plan and relevant architecture sections.
3. State the bounded implementation slice you are about to perform.
4. Identify security, tenancy, migration, and test implications before editing.
5. Implement the smallest coherent change.
6. Run relevant lint, typecheck, unit, database, and/or E2E tests available in the repository.
7. Review the diff for scope creep and sensitive-data exposure.
8. Summarize what changed, what was tested, and what remains.

Do not create a giant migration or implement an entire product domain in one pass.

## Database Rules

- PostgreSQL/Supabase is the structured system of record.
- Use committed migration files for schema changes.
- Do not make undocumented production dashboard edits.
- Implement one database domain/slice at a time.
- Enable RLS on every exposed tenant-owned table as it is introduced.
- Add RLS/constraint tests with the same phase as the table/policy.
- Never disable RLS merely to make a feature work.
- Never use Auth metadata as the sole authorization model.
- Never trust a client-provided `organization_id`, `branch_id`, role, or patient ID as authorization proof.
- Enforce cross-tenant referential safety for sensitive relationships.
- Prefer database constraints/transactions for important invariants.
- Preserve signed/finalized clinical history through versioning/amendment rather than silent overwrite.
- Never use a mutable patient balance field as the accounting source of truth.

## Authentication and Authorization Rules

- Supabase Auth manages identity/session concerns; application tables manage organization, branch, role, and provider authorization.
- Application/server authorization and PostgreSQL RLS are both required.
- Service-role/secret keys are server-only and must never reach browser code.
- Production workforce accounts accessing patient data require individual identities and MFA per the security architecture.
- Visiting/on-call specialists default to assigned-case access, not organization-wide patient browsing.
- Owner/admin status must not automatically imply clinical edit permission.

## Security and Privacy Hard Rules

This project handles health information and other sensitive personal information.

- Never use real patient data in development, fixtures, tests, screenshots, demos, logs, tickets, or AI-agent prompts.
- Never place production credentials, OAuth refresh tokens, database passwords, service keys, recovery codes, or patient records in prompts or Git.
- Development/staging use synthetic or formally de-identified data.
- Do not connect AI/MCP tooling with unrestricted write access to a production database containing real patient data.
- Public routes must never expose broad patient or clinical tables.
- Do not log clinical text, tokens, presigned URLs, passwords, or secrets.
- Treat file URLs/tokens as credentials; future clinical objects remain private.
- High-impact actions require auditable server-side authorization.
- Follow `docs/SECURITY_ARCHITECTURE.md` before any real-patient pilot.

## Frontend Rules

- Server Components by default; use Client Components only where interaction/browser APIs require them.
- The browser is an interaction layer, not the authority for permissions or business invariants.
- Use the approved neutral-first SmileLab-inspired design system from `docs/FRONTEND_ARCHITECTURE.md`.
- Do not make the EMR highly colorful.
- Do **not** default to a generic AI/vibe-coded SaaS dashboard composition. Familiar controls are good; generic template composition is not.
- Do not automatically wrap every section in shadcn `Card`. Prefer sections, borders, separators, tables, summary lists, timelines, split panes, or the domain-specific structure when those communicate the workflow better.
- Do not add a four-KPI-card row, decorative chart, “Welcome back” hero, gradient/glow, oversized rounded surfaces, or pill badges unless the actual task/data justifies them.
- Keep routine EMR screens compact and information-forward. Marketing-page spacing and typography do not belong in clinical/operational screens.
- Use cards only when they represent a genuinely bounded object/group; avoid nested cards. Keep EMR radii restrained and reserve obvious elevation primarily for overlays.
- Match the screen to the domain: scheduler → calendar work surface; inventory/operational lists → tables; billing → ledger/statement; clinical history → chronology/timeline; patient record → persistent patient context + meaningful clinical sections.
- Home/dashboard content should prioritize role-relevant work and exceptions over vanity metrics. KPIs are optional and must answer a real operational question.
- Preserve desktop density without making touch unsafe. Increase hit areas/spacing for coarse-pointer/iPad/mobile contexts and provide non-drag alternatives where required.
- Treat desktop/laptop, iPad/tablet, and mobile phone as supported responsive targets. Do not implement desktop-only layouts and defer phone behavior as an afterthought.
- For major private-EMR screens, design the mobile composition explicitly: stack multi-column layouts, collapse navigation/toolbars safely, preserve clinically important data, avoid page-level horizontal overflow, and keep virtual-keyboard/safe-area behavior usable.
- Complex work surfaces (odontogram, resource scheduler, treatment canvas) may be larger-screen optimized, but must have a deliberate phone mode or safe supported alternative rather than a squeezed/broken desktop UI.
- Do not use hover-only or drag-only critical interactions. Preserve state across responsive resize/orientation changes where practical.
- Keep third-party UI libraries behind adapters where they represent domain data.
- Do not couple canonical scheduling, odontogram, drawing, document, or analytics data to a renderer's private format.
- Do not introduce global state libraries unless local/server/query state is insufficient.
- Maintain desktop/laptop, iPad/tablet, and mobile-phone usability.

Before implementing a major new screen, briefly identify its **screen archetype** (for example table/list, scheduler, patient workspace, ledger, timeline, form/settings, analytics) and its primary user task. Do not begin from a generic dashboard template.

## File / Media Architecture Rules

- Cloudflare R2 is the canonical object store for private clinical files and project-controlled media.
- Cloudinary is not a default dependency. Do not add it without an approved ADR.
- For clinical images, preserve the uploaded original unchanged.
- Use Cloudflare Workers + Cloudflare Images for bounded semantic derivatives such as `thumbnail`, `preview`, and `display`.
- Never make a lossy derivative the sole clinical/X-ray copy.
- Private transformations must remain permission-checked; never make private R2 objects public to enable optimization.
- Application/domain code requests semantic variants and remains independent of Cloudflare-specific transformation parameter formats.
- Asynchronous processing may later use R2 event notifications + Queues + a consumer Worker, with idempotency and loop prevention.

## Dependency Rules

Before adding or replacing a production dependency:

- confirm it is actually needed;
- check current maintenance/security status;
- check license/commercial-use compatibility;
- check Next.js/React compatibility;
- prefer existing approved dependencies when they satisfy the need;
- document material architecture changes in an ADR.

Do not replace scheduler, odontogram, canvas, PDF, authentication, database, or state-management choices merely because another library is personally preferred.

## Supabase / MCP Rule

Supabase MCP may be used only against explicitly designated hosted development/test projects to inspect, test, and assist with implementation.

This project intentionally does not use a local Supabase Docker stack. Migration files in Git remain authoritative. Prefer project-scoped, read-only MCP access for inspection; any remote write must target a verified non-production project and be represented by reviewed repository changes. Never use unrestricted AI write access against production patient data or run destructive remote reset operations against an ambiguous target.


## Shared AI Handoff Context

Claude and Codex do not share conversation history. Use `docs/AI_HANDOFF.md` as the short, repository-visible handoff between agents.

For every Git commit Claude creates during implementation, prepare the handoff for that commit:

1. Update `docs/AI_HANDOFF.md` **immediately before the checkpoint commit** so the code and its handoff context are committed together.
2. Keep the handoff concise and factual. Record:
   - task / bounded slice implemented;
   - why the change was made;
   - architecture/plan sections relied on;
   - important files and migrations changed;
   - database/RLS/security decisions made;
   - commands/tests run and their results;
   - known limitations, TODOs, assumptions, and unresolved questions;
   - areas Codex should scrutinize during review.
3. Do not paste private chain-of-thought, long conversation transcripts, secrets, credentials, or patient data into the handoff.
4. Do not claim a test passed unless it was actually run.
5. Do not use the handoff as a substitute for code, migrations, tests, ADRs, or architecture documents.
6. After the commit, obtain the exact short commit SHA with `git rev-parse --short HEAD`. Do **not** create a second commit merely to insert the commit SHA into `AI_HANDOFF.md`; Codex can inspect the reviewed commit from Git history.
7. Keep `docs/AI_HANDOFF.md` as a rolling summary of the commit being created. Git history preserves the older handoff versions automatically, so do not append an ever-growing transcript.

The handoff is a convenience summary, not an authority. Codex is expected to verify it against the actual diff and tests.

## Automatic Codex Review Prompt After Checkpoint Commits

After every **meaningful implementation checkpoint commit**, automatically print a ready-to-copy section titled exactly:

`CODEX REVIEW PROMPT`

Do this without waiting for the user to ask. Do **not** generate a Codex review prompt for trivial commits such as typo-only changes, formatting-only changes, or insignificant visual tweaks unless the user requests one.

The generated prompt must:

1. Identify the exact commit SHA to review.
2. Tell Codex to inspect the actual commit using `git show <commit-sha>` (and related Git commands when useful).
3. Point to `docs/AI_HANDOFF.md` as explanatory context only, not proof of correctness.
4. Identify only the project documents and **specific sections/domains relevant to this checkpoint**. Do not tell Codex to reread every architecture document.
5. State the implementation goal in one or two concise sentences.
6. List the highest-risk areas Codex should scrutinize based on the actual change, such as tenant isolation, RLS, authorization, migrations, constraints, race conditions, clinical integrity, security, or tests.
7. Tell Codex to verify Claude's claims independently against code, migrations, configuration, Git history, and tests.
8. Tell Codex to rerun relevant tests when practical.
9. Tell Codex **not to modify files during the initial review** unless the user explicitly asks it to implement fixes.
10. Ask Codex to report findings by severity: Critical, High, Medium, Low.
11. For every material finding, ask for the affected file/path, the concrete problem, why it matters, the recommended fix, and the test that should prove the fix.
12. Keep the prompt concise enough that the user can copy and paste it into Codex without editing.

Use this general shape, adapting the specifications and reviewer focus to the actual checkpoint:

```text
CODEX REVIEW PROMPT

Review commit <commit-sha>.

Implementation goal:
<brief description of what this checkpoint implemented>

Context:
- docs/AI_HANDOFF.md

Relevant specifications:
- <only relevant document + section/domain>
- <only relevant document + section/domain>

Inspect the actual commit with:
git show <commit-sha>

Treat AI_HANDOFF.md as explanatory context only. Verify the implementation independently from the actual Git diff, code, migrations, configuration, and tests.

Focus especially on:
- <risk specific to this change>
- <risk specific to this change>
- <risk specific to this change>

Run the relevant tests when practical.
Do not modify files during this initial review.
Do not reread unrelated architecture sections.

Report findings as Critical / High / Medium / Low. For each material finding include the affected file/path, problem, why it matters, recommended fix, and the test that should prove the fix. If no material issue is found, say so and identify residual risks or untested areas.
```

### Progressive context rule

Be deliberate about context usage:

- At the beginning of a new phase, major architectural change, or unfamiliar domain, read the relevant authoritative documents thoroughly.
- For subsequent bounded tasks in the same phase, prefer the active phase plan, `docs/AI_HANDOFF.md`, current code/diff, and only the architecture sections relevant to the task.
- Re-read a full architecture document only when necessary to resolve ambiguity, conflict, or a cross-cutting design issue.
- Never sacrifice correctness or security merely to save tokens; expand context when the change genuinely crosses multiple domains.

## Claude ↔ Codex Review Workflow

Default high-risk workflow:

```text
Claude plans / implements a bounded slice
        ↓
Tests + migration/RLS checks
        ↓
Update docs/AI_HANDOFF.md + Git checkpoint
        ↓
Codex reads handoff + independently reviews the Git diff
        ↓
Claude addresses valid findings
        ↓
Tests rerun
        ↓
Human approval / Git commit
```

For database, RLS, scheduling, security, financial, or migration-sensitive work, do not rely on the implementing agent as the only reviewer.

## Stop and Escalate Instead of Guessing

Stop and ask the user or propose an ADR when:

- architecture documents conflict;
- a requirement would weaken tenant isolation or RLS;
- a destructive migration is required;
- a production dependency must be replaced;
- legal/privacy/clinical requirements are ambiguous and affect implementation;
- a change expands the current phase materially;
- a secret or real patient data is encountered;
- production access would be required to proceed.

Do not silently resolve these by changing architecture.

## Definition of Done for a Change

A change is not complete merely because the UI renders.

Where applicable, completion requires:

- correct server/database authorization;
- tenant/branch-safe behavior;
- migration committed to source control;
- RLS and constraints implemented;
- negative authorization tests;
- lint/typecheck/tests passing;
- no secrets or sensitive data introduced;
- documentation/ADR updated when architecture changed;
- concise summary of verification performed.
