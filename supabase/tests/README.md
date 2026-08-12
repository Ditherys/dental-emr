# Database tests

Version-controlled pgTAP and authorization tests live here beside the migrations
they verify. All fixtures are synthetic and each suite runs inside a transaction
that rolls back.

Remote tests must target a verified non-production Supabase Cloud development or
test project. Confirm the linked project before running them:

```powershell
npx supabase projects list
npx supabase migration list --linked
```

The approved cloud-only workflow does not start a local Supabase/Docker stack.
Run each suite directly through the linked project's Management API:

```powershell
npx supabase db query --linked --file supabase/tests/foundation_rls.test.sql
npx supabase db query --linked --file supabase/tests/workforce_invitations.test.sql
```

For a planned pgTAP suite, success ends with its plan (for example `1..60`) and
no `Looks like you failed` diagnostic. The CLI's `test db --linked` command may
still require a local Docker-based test runner in some environments; do not use
that path to bypass ADR-016.
