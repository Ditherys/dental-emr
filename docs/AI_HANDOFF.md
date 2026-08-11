# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-00 — Create the repository and import the approved documentation  
**Implementing agent:** OpenAI Codex, temporarily assigned as primary implementation agent  
**Status:** Implemented; ready for independent review

## What Changed

- Initialized the repository on the `main` branch for the first documentation checkpoint.
- Established the root agent instructions and stable authoritative-document paths required by P1-00.
- Preserved the corrected authoritative package supplied by the project owner, including the Phase 1 plan and accepted ADRs.
- Removed one redundant blank line at the end of the master plan; no architecture content was changed.
- Confirmed the ADR registry: Phase 1 reserves ADR-001–004; ADR-005 and ADR-016 are accepted; ADR-006–015 are intentionally unassigned; new ADRs normally begin at ADR-017.
- Added no application scaffold, dependencies, Supabase configuration, migrations, database objects, UI, or infrastructure configuration.

## Why

P1-00 creates a reproducible, Git-backed source-of-truth workspace before application or database implementation begins.

## Important Files in This Checkpoint

- `AGENTS.md`
- `CLAUDE.md`
- `docs/MASTER_PRODUCT_PLAN.md`
- `docs/TECHNICAL_ARCHITECTURE.md`
- `docs/DATABASE_DESIGN.md`
- `docs/FRONTEND_ARCHITECTURE.md`
- `docs/SECURITY_ARCHITECTURE.md`
- `docs/plans/001-foundation.md`
- `docs/decisions/ADR-005-r2-media-pipeline.md`
- `docs/decisions/ADR-016-supabase-cloud-first-development.md`
- `docs/AI_HANDOFF.md`

## Architecture / Security Notes

- Supabase development is cloud-first and uses separate non-production projects; no local Supabase/Docker runtime is approved.
- Git-managed migrations remain authoritative when database work begins in later checkpoints.
- Cloudflare R2 remains canonical object storage; Workers/Images may create bounded derivatives, while clinical originals remain unchanged.
- No real patient data, credentials, secrets, remote database access, or production access was used.

## Verification Performed

- Re-read `AGENTS.md` and the P1-00/source-of-truth sections of `docs/plans/001-foundation.md` from disk.
- Verified every required P1-00 source-of-truth path exists.
- Enumerated every `ADR-NNN` reference across the Markdown workspace and confirmed the corrected numbering policy is consistent.
- Verified there are no exact duplicate Markdown documents or stale/backup/version-suffixed authority filenames.
- Searched authoritative Markdown for stale local-Supabase/Docker assumptions, conflicting storage-provider guidance, and credential-like assignments.
- Confirmed all local-Supabase references are prohibitions or explanatory context, and R2/Workers/Images/Cloudinary guidance is consistent.
- Reviewed the repository tree and Git status before the checkpoint commit.

## Tests Not Applicable / Not Run

- No lint, typecheck, unit, database, pgTAP, or E2E tests were run because P1-00 contains documentation and repository metadata only.
- No Supabase, R2, Cloudflare, Vercel, or other remote service command was run.

## Known Limitations / Next Boundary

- ADR-001 through ADR-004 are reserved but are intentionally not created by P1-00; the phase plan requires them before or while their corresponding foundational decisions are implemented.
- P1-01 application scaffolding has not started and requires explicit human approval.
- The checkpoint commit SHA is intentionally obtained after commit and is not inserted through a second handoff-only commit.

## Reviewer Focus

- Confirm the initial commit contains documentation and agent rules only.
- Verify source-of-truth precedence and ADR numbering remain unambiguous.
- Verify there are no duplicate authoritative plans or hidden application/infrastructure artifacts.
- Confirm Supabase Cloud and R2 architecture statements remain internally consistent.

## Handoff Rules

- Do not include private chain-of-thought or conversation transcripts.
- Do not include real patient data, PHI, passwords, tokens, API keys, OAuth secrets, or production credentials.
- Do not claim tests were run if they were not.
- This summary does not replace reviewing the actual Git diff.
- The reviewing agent should inspect the relevant commit and authoritative project documents independently.
