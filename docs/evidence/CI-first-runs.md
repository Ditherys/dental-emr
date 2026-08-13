# Evidence — first real CI runs

**Date:** 2026-08-14
**Repository:** private, GitHub Actions, `main`
**Workflows:** `ci.yml` (application + cloud-test), `codeql.yml`, `dependency-review.yml`, `dependabot.yml`

`docs/PHASE1_ACCEPTANCE_REVIEW.md` H-4 said a workflow file is not CI evidence.
The first run proved the point within ninety seconds.

## What the first run found that local verification could not

**`CI / Application verification` failed:** `Cannot find name 'LayoutProps'` —
`src/app/layout.tsx:18`.

`LayoutProps<"/">` is a type Next.js *generates* into `.next/types` during
`next typegen` / `next build`. `tsconfig.json` includes that directory, so on a
developer workstation with a populated `.next/` the symbol resolves and
`tsc --noEmit` passes. CI checks out clean and runs typecheck **before** the
build, deliberately, so the symbol does not exist.

Every other route in the application already declares its own props explicitly;
the root layout was the single file depending on a generated global. It now types
`{ children: ReactNode }` directly, which removes the build-order coupling
entirely and keeps typecheck hermetic.

**This means every local `npm run verify` before this point was slightly
optimistic** — it was typechecking against build output from an earlier run. The
failure mode is now reproducible locally without pushing:

```powershell
Move-Item .next .next.bak; Move-Item tsconfig.tsbuildinfo tsconfig.tsbuildinfo.bak
npm run typecheck
Move-Item .next.bak .next; Move-Item tsconfig.tsbuildinfo.bak tsconfig.tsbuildinfo
```

Verified passing under those conditions before pushing the fix.

## Job outcomes

| Job | Result | Cause |
|---|---|---|
| `CI / Application verification` | fixed → passing | the `LayoutProps` defect above |
| `CI / Cloud TEST database and E2E` | fails at "Verify required Cloud TEST metadata" | the `cloud-test` environment has no variables configured. **The guard fired before any credential was used and before any database was contacted** — the intended fail-closed order. It also cannot pass while the R6 freeze is active, by design. |
| `CodeQL / Analyze JavaScript and TypeScript` | fails | *"Code scanning is not enabled for this repository."* Code scanning on a private repository requires GitHub Advanced Security. |
| `Dependency review / Review dependency changes` | fails | *"Dependency review is not supported on this repository."* Requires Dependency graph + GHAS. |

Dependabot had already opened npm update PRs, whose CI failed for the same
`LayoutProps` reason. They will need a rebase onto the fix.

## Decisions recorded

**No `continue-on-error`.** A job that reports success while doing nothing is
worse than one that is honestly red: it produces a green branch-protection badge
that means nothing. CodeQL and Dependency review stay red and stay unrequired
until GitHub Advanced Security is available.

**Narrower substitutes, named as such.** `npm run security:audit` and
`npm run security:secrets` run in the application job and pass. They do not
replace static taint analysis or a PR-diff dependency gate. Recorded as an
accepted gap (M-6), not as equivalent coverage.

**Required checks today:** `CI / Application verification` only. The others are
added to branch protection as each becomes able to pass — after R6-F for Cloud
TEST, after GHAS for the other two.

## Not yet evidenced

The Cloud TEST job has never executed a database step in CI. Everything proven in
`docs/evidence/R6C-R6E-test01.md` was run from a workstation against TEST-01. CI
execution of that same set remains open until the freeze lifts and the
`cloud-test` environment is configured.
