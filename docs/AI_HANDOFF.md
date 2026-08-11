# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-02 — Establish dependency policy and core packages

**Implementing agent:** OpenAI Codex, temporarily assigned as primary implementation agent

**Status:** Implemented; ready for independent review

## What Changed

- Added the approved foundation runtime packages: Supabase JS/SSR clients, Zod, React Hook Form and its resolver, TanStack Query, Lucide React, and Sonner.
- Added the approved foundation development packages: the project-local Supabase CLI, Vitest, jsdom, Testing Library packages, user-event, jest-dom, the React Vite plugin, vite-tsconfig-paths, and Playwright.
- Pinned the Supabase CLI exactly at `2.113.0` per its official project-local installation guidance; all other resolved versions are reproducible through `package-lock.json`.
- Declared supported Node versions as `^22.13.0 || >=24.0.0` and aligned `@types/node` to the Node 22 baseline required by the current dependency set.

## Scope / Architecture Notes

- Changes are limited to `package.json`, `package-lock.json`, and this handoff.
- No Supabase project initialization/linking, credentials, clients, migrations, or remote operations were performed; those begin in later checkpoints.
- No shadcn initialization or application-shell/design work was performed; that remains P1-03.
- No Vitest/Playwright configuration, scripts, test files, or browser downloads were added; the testing foundation remains P1-17.
- Explicitly deferred TanStack Table/Virtual, date libraries, Zustand, scheduler, odontogram, canvas, signature, chart, and PDF dependencies.
- Current `jsdom` 30 requires Node 24.15 or newer, while the implementation environment is Node 24.14.1. The lockfile therefore resolves compatible `jsdom` 29.0.1 rather than installing an engine-incompatible release.
- Direct package metadata was checked for maintenance recency, current React/Node peer compatibility, and licenses. Direct additions use MIT, ISC, or Apache-2.0 licenses.
- `vite-tsconfig-paths` 6.1.1 currently depends on deprecated `tsconfck` 3.1.6. It has no reported npm vulnerability and remains the package named by the bundled Next.js 16 Vitest guide; replacing it would diverge from current official setup guidance.

## Important Files

- `package.json`
- `package-lock.json`
- `docs/AI_HANDOFF.md`

## Verification Performed

- `npm ci` — passed from the committed lockfile shape; 487 packages audited with 0 vulnerabilities.
- `npm run lint` — passed with no findings.
- `npx tsc --noEmit` — passed under strict TypeScript settings.
- `npm run build` — passed; Next.js 16.3.0 compiled, type-checked, and statically generated `/` and `/_not-found`.
- `npm audit --audit-level=high` — found 0 vulnerabilities.
- `npx supabase --version` — passed and reported 2.113.0.
- `npx vitest --version` — passed and reported 4.1.10.
- `npx playwright --version` — passed and reported 1.62.1.
- Imported the runtime and testing package entry points in a Node ESM smoke check — passed.
- Scanned direct dependencies for every explicitly deferred P1-02 package — none found.
- Scanned the lockfile for Git, GitHub, or local-file dependency sources — none found.
- `git diff --check` — passed.

## Environment Note

- Next.js continues to warn that it ignores an unrelated `C:\Users\D_Reyes\package-lock.json` outside this Git repository. The repository lockfile is used; no machine-specific workaround was committed.

## Tests Not Applicable / Not Run

- No unit/component or E2E suites exist yet because P1-17 owns test configuration and initial tests.
- Playwright browser binaries were not installed because no P1-02 E2E suite or configuration exists.
- No database, pgTAP, RLS, Supabase Cloud, R2, Cloudflare, or deployment checks were run because those systems are outside P1-02.

## Reviewer Focus

- Confirm every direct addition belongs to the P1-02 approved baseline and no deferred feature dependency entered the lockfile as a direct package.
- Confirm current package versions and the Node engine floor are mutually compatible with Next.js 16.3.0 and React 19.2.8.
- Confirm deferring shadcn setup, test configuration, and Supabase initialization preserves the P1-03/P1-04/P1-17 checkpoint boundaries.
- Review the accepted residual `tsconfck` deprecation warning independently; npm currently reports no vulnerability.

## Handoff Rules

- Do not include private chain-of-thought or conversation transcripts.
- Do not include real patient data, PHI, passwords, tokens, API keys, OAuth secrets, or production credentials.
- Do not claim tests were run if they were not.
- This summary does not replace reviewing the actual Git diff.
