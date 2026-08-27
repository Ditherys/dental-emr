-- OWNER is the highest-authority principal within an organization. Grant the
-- system OWNER role every permission in the catalog so that OWNER resolves to
-- the complete organization-level permission set: patient demographics and
-- clinical records, odontogram, treatment plans, files/attachments, scheduling,
-- queues, billing, inventory, providers, workforce, branches, settings,
-- analytics, security, audit, roles, and invitations. This supersedes the
-- earlier "owner is not a clinician" assumption (ADR-025). The grant is
-- additive and idempotent; tenant isolation, authentication assurance (AAL2),
-- auditability, optimistic versions, immutable/finalized record protections,
-- destructive-action safeguards, and database constraints remain enforced by
-- the surrounding checks, so OWNER gains no bypass and no cross-tenant access.

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code = 'OWNER'
on conflict (role_id, permission_id) do nothing;