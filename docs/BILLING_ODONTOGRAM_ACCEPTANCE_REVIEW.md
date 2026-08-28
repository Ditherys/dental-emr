# Billing and odontogram implementation acceptance record

**Acceptance authority:** Project owner

**Date:** 2026-08-28

**Decision:** Accepted for bounded implementation on `main`.

## Reviewed inputs

- `docs/specs/billing-ledger-provider-compensation.md`
- `docs/plans/billing-ledger-provider-compensation-plan.md`
- `docs/specs/odontogram-integration.md`
- `docs/plans/odontogram-integration-plan.md`
- Independent plan review: PASS FOR OWNER ACCEPTANCE, with findings resolved
  before owner acceptance.

### Accepted content revisions

The owner accepted the exact SHA-256 content revisions below. Any later change
to one of these documents requires a new independent review and acceptance.

| Document | SHA-256 |
| --- | --- |
| Billing specification | `76B446413ACA7F77AF4BFAEDDE0C1A6B75DEB3EFCCE205BBB2064B9C279946C4` |
| Billing plan | `ABBC9342784C3240126A58F0670288A57DC2FDEE2DBA89370D2F88590C35745C` |
| Odontogram specification | `FA02B768C760652A6D04066EDCEEC3956B928AC62BAEB321E8F325450C5C0DAE` |
| Odontogram plan | `C706E813860133B8240F3868E4277BFBC6C9961D5C77C3E7A0F014439C7D2F0A` |

## Authorized scope and sequence

1. Implement billing tasks B0 through B11 in their accepted order.
2. Then implement odontogram tasks O0 through O4 only, in their accepted order.
3. Work in the existing `main` checkout only; do not create a branch or
   worktree.
4. Use forward-only migrations and do not run `db:reset:local` for this scope.

## Deferred gates and exclusions

- Do not perform Cloud TEST activity before the O4 boundary.
- O5 and later odontogram tasks require separate owner authorization.
- No production deployment or production patient use is authorized.
- Guarded Cloud TEST remains mandatory before production; deferral is timing,
  not a waiver.

## B0 completion condition

B0 may proceed once ADR-026 and ADR-027 are recorded and the guarded
`db:migrate:local` command has passing focused tests. B1 may begin only after
the B0 implementation checkpoint receives independent review.
