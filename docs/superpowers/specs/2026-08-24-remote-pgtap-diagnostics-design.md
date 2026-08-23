# Remote pgTAP Diagnostics Design

## Goal

Make a failed Cloud TEST pgTAP SQL suite identify its database error without
printing database credentials, access tokens, or unbounded command output.

## Design

The remote database test runner will use a small pure formatter for a failed
Supabase CLI query. The formatter receives the suite label and child-process
stdout/stderr, removes credential-bearing connection-string components and
token-like values, removes non-printing terminal-control characters, and caps
the retained diagnostic to 8 KiB. The runner will include only that formatted
diagnostic in its existing failure message when the CLI exits non-zero.

The formatter is intentionally diagnostic-only: it does not change test target
validation, Supabase CLI arguments, SQL execution, migration behavior, or the
pass path. A focused unit test will prove useful database errors remain visible
and common credential forms are redacted.

## Scope and Safety Constraints

- Applies only to `scripts/run-remote-database-tests.mjs` failure reporting.
- Never print `SUPABASE_ACCESS_TOKEN`, database passwords, full connection
  strings, or arbitrary unbounded CLI output.
- Keep the existing Cloud TEST target guard and transaction requirements
  unchanged.
- Do not change patient schema, RLS, authorization behavior, or workflow YAML.
- The follow-up Cloud TEST rerun uses the existing verification PR and a
  temporary exact PR-ref environment policy, then removes that policy.

## Verification

1. Unit tests show an SQL error remains identifiable after formatting.
2. Unit tests show password, token, and connection-string values are redacted.
3. Application verification and Cloud TEST run again on the P2-01 PR.
4. The temporary environment policy is removed after the run.
