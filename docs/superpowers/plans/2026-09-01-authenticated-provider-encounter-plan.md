# Authenticated provider encounter attribution

## Goal

Opening a clinical encounter must attribute treatment to the signed-in dentist's
active linked provider profile at the acting branch. The browser must not select
or submit a provider identifier.

## Bounded implementation

1. Add a forward-only `create_clinical_encounter_v2` RPC with no provider
   argument. It resolves the actor's provider through
   `private.require_active_actor_provider`, preserves tenant/branch,
   appointment, permission, audit, and clinical invariants, and grants execute
   only to `authenticated`.
2. Revoke browser execute on the legacy provider-selectable RPC and update the
   approved grant registry and pgTAP coverage.
3. Remove `treatingProviderId` from encounter input validation, service RPC
   arguments, server action payloads, and the open-encounter dialog. Historical
   encounter output continues to show the attributed provider.
4. Verify with focused unit tests, local forward migration, migration-grant
   lint, typecheck, lint, and relevant database tests without resetting local
   data.

## Safety boundary

OWNER clinical access still requires an explicit active provider profile linked
to that authenticated user. Provider A remains a separate clinician and is not
reassigned as part of this change.
