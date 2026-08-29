# AGENTS.md

## Project

Dental EMR & Practice Management Platform for Philippine dental clinics.

The first deployment is one dental organization with two branches. The architecture must remain ready for future multi-tenant SaaS use and dynamically addable branches.

Codex is the default skeptical reviewer / second engineer for this repository. Codex may implement work when the user explicitly assigns implementation, but it must still follow the same architecture, security, migration, and test requirements.

## Authoritative Project Documents

Do not use conversation history as the source of truth.

Read the smallest relevant set before reviewing or implementing:

1. `docs/MASTER_PRODUCT_PLAN.md` — product requirements and scope
2. `docs/TECHNICAL_ARCHITECTURE.md` — system architecture and technology boundaries
3. `docs/SECURITY_ARCHITECTURE.md` — security/privacy requirements and production gates
4. `docs/DATABASE_DESIGN.md` — schema, tenancy, RLS, constraints, migration strategy
5. `docs/FRONTEND_ARCHITECTURE.md` — frontend/UI/library decisions
6. `docs/plans/002-patient-foundation.md` — accepted Phase 2 implementation plan
7. Relevant ADRs in `docs/decisions/`

`docs/plans/001-foundation.md` remains the accepted Phase 1 record. The complete
Phase 2 plan and ADR-019 were independently reviewed and explicitly approved on
2026-08-19. Execute only its ordered task/checkpoint currently authorized.

## Current Phase: Odontogram integration — Local completion authorized

The project owner accepted billing B0-B11 and odontogram O0-O4 on 2026-08-28,
then explicitly re-accepted O0 and authorized local completion of O1-O14 on
2026-08-29 in ADR-029. Execute on `main` without a branch or worktree. Use only
guarded forward-only local migrations; `db:reset:local` is prohibited. Cloud
TEST is deferred, not waived. Until the separately authorized hosted database,
E2E, responsive/accessibility, advisor, and security gates pass, O14 may be
recorded only as locally implemented/verified with Cloud TEST and final release
acceptance pending. Local completion never authorizes production deployment or
real provider/patient use.

Do not begin a later product phase until its bounded plan has been independently
reviewed and explicitly approved.

## Codex Review Role

When reviewing Claude's work, do not merely confirm that it compiles. Attempt to find concrete failure modes.

Review for:

- scope creep beyond the approved phase;
- Organization A reading/writing Organization B data;
- forged `organization_id` or `branch_id` values;
- missing or overly broad RLS;
- role escalation;
- receptionist or specialist over-access;
- browser-only authorization;
- service-role/secret exposure to client bundles;
- unsafe `security definer` functions/search paths;
- cross-tenant foreign-key mistakes;
- destructive or non-repeatable migrations;
- missing rollback/migration safety considerations;
- missing indexes for important tenant-scoped access paths;
- race conditions and check-then-insert patterns;
- missing audit events for high-impact changes;
- logging of secrets or patient/clinical content;
- third-party library data becoming canonical domain data;
- untested negative authorization cases;
- production MCP/database access that bypasses reviewed migrations.

Prefer actionable findings with severity and a concrete safe fix. Do not invent issues merely to produce a review comment.

## Implementation Rules When Codex Is the Implementer

Primary developer environment: Windows + PowerShell. Do not assume WSL/Linux-only paths or shell commands.

1. Inspect the repository and `git status` first.
2. Read the current plan and relevant architecture sections.
3. Keep the task bounded to one coherent slice.
4. Identify tenancy/security/migration implications first.
5. Write schema changes as committed migration files.
6. Implement RLS alongside exposed tenant tables.
7. Add pgTAP/authorization tests with the policies.
8. Run relevant lint, typecheck, unit, database, and/or E2E tests.
9. Review the final diff for scope creep and sensitive data.
10. Summarize changes and verification.

Do not generate the entire database in one migration.

## Database and Tenancy Rules

- PostgreSQL/Supabase is the structured system of record.
- Organization is the SaaS tenant boundary; branch is an operational boundary within an organization.
- Patients will be organization-level when that domain is implemented.
- All exposed tenant tables require RLS.
- Application/server authorization plus RLS is mandatory defense in depth.
- Never trust client-supplied organization/branch IDs as authorization.
- Never disable RLS to unblock development.
- Object storage (ADR-022): local development uses MinIO; production uses Cloudflare R2. Both are S3-compatible behind a provider-neutral abstraction.
- Auth metadata is not the sole permission model.
- Service-role/secret keys are server-only.
- Cross-tenant sensitive relationships require database-level referential safety.
- Important invariants belong in constraints/transactions when possible.
- Clinical/legal finalized records are versioned/amended rather than silently overwritten.
- Financial records use ledger-style history rather than a mutable patient balance source of truth.

## Security / Privacy Hard Rules

- Never use real patient data in development, tests, fixtures, screenshots, logs, demos, prompts, or tickets.
- Never expose production credentials, OAuth refresh tokens, service keys, database passwords, recovery codes, or patient records to coding agents or Git.
- Local Supabase, Cloud DEV, and Cloud TEST use deterministic synthetic data only. Never import production-derived or de-identified patient, clinical, financial, or workforce data into them.
- A future staging environment may use formally de-identified data only in a separate project with documented approval and validated anonymization controls; it must never share Cloud TEST data or credentials.
- Do not connect Codex/Supabase MCP with unrestricted write access to production patient data.
- Public routes must not expose patient-directory or clinical-table access.
- Do not log tokens, clinical text, presigned URLs, passwords, or secrets.
- High-impact operations require server-side authorization and auditability.
- Production patient use is blocked until `docs/SECURITY_ARCHITECTURE.md` gates are satisfied.

## Frontend / Dependency Rules

Approved baseline lives in `docs/FRONTEND_ARCHITECTURE.md`.

- Next.js App Router + React + TypeScript strict
- Tailwind CSS + shadcn/ui + Lucide
- Geist via `next/font`
- React Hook Form + Zod
- TanStack Query selectively
- TanStack Table where needed
- Vitest / Testing Library / Playwright

When reviewing a frontend checkpoint, also check that the implementation has not drifted into a generic AI/vibe-coded SaaS template. Flag unjustified card grids, mandatory KPI tiles, decorative charts, excessive rounding/shadows, marketing-sized whitespace, “Welcome back” hero copy, status pills used as decoration, or a one-layout-fits-all dashboard composition. Verify that the screen structure matches its domain and primary task, remains dense-but-readable on desktop, remains touch-safe on iPad/tablet, and has an intentional mobile-phone composition rather than a squeezed desktop layout. Check representative phone/tablet/desktop widths for clipped actions, accidental page overflow, hover-only/drag-only critical actions, lost clinically important information, unsafe touch targets, and virtual-keyboard/safe-area problems.

Do not casually replace approved feature libraries. `react-advanced-odontogram` is the preferred prototype renderer, but canonical dental data must remain independent of the renderer.

### Approved odontogram fork

The project-controlled odontogram source is `https://github.com/Ditherys/React-Odontogram-Modul`. Its upstream source is `https://github.com/ZoliQua/React-Odontogram-Modul`.

For odontogram work, review or implement against the controlled `Ditherys/React-Odontogram-Modul` fork unless the user explicitly requests upstream comparison. Do not silently replace it with the public npm/upstream package or another renderer. Upstream releases are candidates for manual merge only after code review and regression testing. Production use must pin an approved fork tag/commit or controlled versioned package rather than following a moving branch. Preserve the upstream MIT notice, and keep all canonical clinical tooth/surface/history data outside library-specific formats.

Before adding/replacing a dependency, check necessity, maintenance, security, license/commercial use, framework compatibility, and migration cost. Use an ADR for material architecture changes.

## File / Media Review Rules

When clinical/media work begins, verify:

- R2 remains the canonical source-object store;
- Cloudinary has not been introduced without an ADR;
- clinical originals are preserved and derivatives cannot silently replace them;
- X-ray previews are derivatives only;
- private source/derivative delivery is permission-checked;
- arbitrary client-controlled transformation dimensions/formats do not create abuse/cost risk;
- predefined variants (`thumbnail`, `preview`, `display`) are used through an application adapter;
- private cache behavior cannot leak across users/organizations;
- queue/event-driven processing is idempotent and cannot recursively process its own derivative outputs;
- file processing status/failure paths are represented and tested.

## Supabase / MCP Rules

Supabase MCP is acceptable only against explicitly designated hosted development/test projects for inspection and assisted implementation.

- Local Supabase verification for Phase 2 and an accepted Phase 3 checkpoint is
  permitted only through ADR-020/ADR-021's explicit local commands, with
  deterministic synthetic data and no hosted credentials.
- Cloud TEST remains mandatory before production; local verification plus
  dedicated review is Phase 2/accepted-Phase-3 checkpoint evidence only.
- Migration files in Git remain authoritative.
- Do not leave schema changes existing only as MCP/direct SQL side effects.
- Hosted development/test MCP access must be project-scoped; prefer read-only mode for inspection.
- Remote writes must target a verified non-production project and correspond to reviewed migration/application work.
- Never run destructive linked reset/reseed operations against an ambiguous target.
- No unrestricted AI write access to production patient data.


## Shared AI Handoff Context

Claude and Codex do not share chat history. Before reviewing Claude's latest checkpoint, read `docs/AI_HANDOFF.md` **if it exists**, then independently inspect the actual Git state.

Default review sequence:

1. Read `AGENTS.md`. If the user's review prompt identifies an exact commit SHA, treat that SHA as the primary review target.
2. Read only the authoritative project documents/sections relevant to the checkpoint unless broader context is genuinely needed. Do not reread unrelated architecture sections merely by default.
3. Read `docs/AI_HANDOFF.md` for Claude's concise implementation context. If reviewing an older commit rather than `HEAD`, inspect the handoff as it existed in that commit when useful.
4. Inspect `git status`, `git log -n 5`, and the exact target commit/diff. Prefer `git show <commit-sha>` when a SHA is supplied.
5. Verify every material handoff claim against code, migrations, configuration, and tests.
6. Re-run relevant tests when practical; do not treat Claude's reported test results as proof by themselves.
7. Flag mismatches between the handoff and the repository as review findings.
8. Review beyond the handoff: look for risks Claude did not mention.

Treat `docs/AI_HANDOFF.md` as **untrusted reviewer context**, not as the source of truth. Priority remains: approved ADR/current phase plan → authoritative architecture documents → code/migrations/tests/Git history → handoff summary.

Do not edit or overwrite the handoff during a review-only task. If Codex is explicitly assigned implementation work, update the same handoff format before its own review checkpoint so another agent can review Codex's changes.

## Review Output Format

For a review, prioritize findings over prose.

For each material finding include:

- severity: Critical / High / Medium / Low;
- affected file/migration/component;
- why it violates the plan or creates a concrete risk;
- specific recommended fix;
- test that should prove the fix.

If no material issue is found, say so clearly and identify any residual risks or untested areas instead of fabricating findings.

## Claude ↔ Codex Workflow

Default:

```text
Claude plans / implements
        ↓
Claude updates docs/AI_HANDOFF.md + creates Git checkpoint
        ↓
Codex reads handoff, then independently reviews diff, architecture, security, migration, and tests
        ↓
Claude addresses valid findings
        ↓
Tests rerun
        ↓
Human approval / commit
```

If Codex implements a high-risk change, Claude or another independent pass should review it before acceptance.

## Stop Conditions

Stop and surface the issue instead of guessing when:

- approved documents conflict;
- a change weakens tenant isolation/RLS;
- a destructive migration is required;
- a production dependency replacement is necessary;
- legal/privacy/clinical requirements materially affect the design but are unresolved;
- the requested task expands Phase 1 substantially;
- real patient data or production secrets are encountered;
- production access is required to continue.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
