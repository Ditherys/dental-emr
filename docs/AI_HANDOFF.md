# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-06 — Supabase Type Generation

**Implementing agent:** OpenAI Codex, explicitly assigned implementation for P1-06

**Status:** Implemented against the designated non-production development project; ready for independent review

## What Changed

- Added `npm run db:types` to generate the public-schema TypeScript surface from the repository-pinned Supabase CLI.
- Added `npm run db:types:check` to fail when the committed generated file differs from the designated database schema.
- Added a cross-platform Node generator so Windows development and Linux CI do not depend on shell-specific output redirection.
- Generated `src/types/database.generated.ts` for source control from the linked development project after the P1-05 migrations were applied.
- Added an explicit generated-file notice; database changes must be made through migrations and regenerated rather than hand-edited.
- Documented local linked-project generation and an explicit `SUPABASE_PROJECT_ID`/secret-store CI path.
- Kept P1-06 free of Auth SSR integration, application-specific database interfaces, RLS policies, seed fixtures, and later-domain work.

## Files Added or Updated

- `src/types/database.generated.ts`
- `scripts/generate-database-types.mjs`
- `package.json`
- `supabase/README.md`
- `docs/AI_HANDOFF.md`

The uncommitted P1-05 migration files in the same working tree are pre-existing inputs to this checkpoint and were not modified by P1-06.

## Generation and Drift-Check Design

- Local generation defaults to `supabase gen types typescript --linked --schema public` through the pinned CLI entry point.
- CI can set `SUPABASE_PROJECT_ID` to use `--project-id` instead of relying on ignored local link state. `SUPABASE_ACCESS_TOKEN` must come from the CI secret store.
- Only the exposed application `public` schema is generated; internal `private`, Auth-owned, and extension schemas are not added to the application type surface.
- The drift check normalizes CRLF/LF differences before comparing content, so it detects schema/type drift without failing solely on checkout line endings.
- No workflow file was added because CI scaffolding belongs to P1-16; the package script is ready to be wired into that checkpoint.

## Verification Performed

- `npx supabase projects list` — confirmed the linked project is the healthy `dental-emr-dev` project in Singapore; the separate `SmileLab` project remains unlinked.
- `npx supabase migration list --linked` — confirmed all six P1-05 migration versions align locally and remotely.
- `npm run db:types` — passed against the linked non-production development project.
- `npm run db:types:check` — passed; committed output matches a fresh remote generation.
- `npm run db:types:check` with an explicit `SUPABASE_PROJECT_ID` — passed, covering the CI targeting path.
- `npm run lint` — passed.
- `npx tsc --noEmit` — passed under strict TypeScript settings.
- `npm run build` — passed.
- `git diff --check` — passed; Git only emitted existing checkout line-ending notices.

## Reviewer Focus

- Confirm the generated file contains all and only the P1-05 `public` tables and their relationships.
- Confirm generation uses the repository-pinned CLI and cannot silently target a hard-coded project.
- Confirm `--check` compares fresh generated output without rewriting the committed file.
- Confirm CI credentials remain external and the documented project target is explicitly non-production.
- Confirm no hand-written duplicate database interfaces or post-P1-06 application work was introduced.

## Environment Note

- Next.js continues to warn that it ignores an unrelated `C:\Users\D_Reyes\package-lock.json` outside this Git repository. The repository lockfile is used; no machine-specific workaround was committed.

## Handoff Rules

- Do not include private chain-of-thought or conversation transcripts.
- Do not include real patient data, PHI, passwords, tokens, API keys, OAuth secrets, or production credentials.
- Do not claim tests were run if they were not.
- This summary does not replace reviewing the actual Git diff.
