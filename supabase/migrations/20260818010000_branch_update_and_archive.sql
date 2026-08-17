-- Phase 1 secure baseline addendum — branch update/archive (H-5).
--
-- Same invariant as the baseline: every privilege-bearing object revokes
-- EXECUTE from PUBLIC, anon, authenticated, and service_role in the
-- statement immediately following its creation. This file is its own
-- registered grant-terminal migration (see scripts/approved-final-grants.mjs)
-- and grants nothing else.
--
-- Design rationale recorded in docs/plans/pending-h5-branch-update-archive.md
-- (superseded by this file now that it is live): no client-supplied
-- organization_id (derived from the target branch row, matching create_branch
-- and update_organization_member_status); not-found and not-authorized share
-- one message so a branch in another organization is never disclosed by its
-- existence; the row is re-selected `for update` after the advisory lock,
-- matching update_organization_member_status's race-safety pattern.

create or replace function public.update_branch(
  target_branch_id uuid,
  branch_name text,
  branch_address_line1 text,
  branch_city text,
  branch_province text,
  branch_phone text default null,
  branch_email text default null,
  branch_address_line2 text default null,
  branch_postal_code text default null,
  branch_timezone text default 'Asia/Manila',
  branch_website_visible boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_organization_id uuid;
  current_status text;
begin
  perform private.require_aal2();

  select branch.organization_id
  into target_organization_id
  from public.branches as branch
  where branch.id = target_branch_id;

  if not found then
    raise insufficient_privilege using message = 'not authorized to update branch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text, 0)
  );

  select branch.status
  into current_status
  from public.branches as branch
  where branch.id = target_branch_id
    and branch.organization_id = target_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized to update branch';
  end if;

  if actor_user_id is null
     or not (select private.has_org_permission(
       target_organization_id,
       'branch.manage'
     )) then
    raise insufficient_privilege using message = 'not authorized to update branch';
  end if;

  if current_status = 'archived' then
    raise invalid_parameter_value using message = 'cannot update an archived branch';
  end if;

  update public.branches
  set name = branch_name,
      phone = branch_phone,
      email = branch_email,
      address_line1 = branch_address_line1,
      address_line2 = branch_address_line2,
      city = branch_city,
      province = branch_province,
      postal_code = branch_postal_code,
      timezone = branch_timezone,
      website_visible = branch_website_visible
  where id = target_branch_id;

  insert into public.audit_events (
    organization_id,
    branch_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    entity_id,
    result
  ) values (
    target_organization_id,
    target_branch_id,
    actor_user_id,
    'USER',
    'ADMINISTRATION',
    'branch.updated',
    'branch',
    target_branch_id,
    'SUCCESS'
  );

  return target_branch_id;
end;
$$;

revoke all on function public.update_branch(uuid, text, text, text, text, text, text, text, text, text, boolean)
from public, anon, authenticated, service_role;

comment on function public.update_branch(uuid, text, text, text, text, text, text, text, text, text, boolean) is
  'Updates one branch''s business/contact/address fields under current-user branch.manage + AAL2 and audits atomically. Cannot edit an archived branch.';

create or replace function public.archive_branch(
  target_branch_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_organization_id uuid;
  current_status text;
  remaining_non_archived_branches integer;
begin
  perform private.require_aal2();

  select branch.organization_id
  into target_organization_id
  from public.branches as branch
  where branch.id = target_branch_id;

  if not found then
    raise insufficient_privilege using message = 'not authorized to archive branch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text, 0)
  );

  select branch.status
  into current_status
  from public.branches as branch
  where branch.id = target_branch_id
    and branch.organization_id = target_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized to archive branch';
  end if;

  if actor_user_id is null
     or not (select private.has_org_permission(
       target_organization_id,
       'branch.manage'
     )) then
    raise insufficient_privilege using message = 'not authorized to archive branch';
  end if;

  if current_status = 'archived' then
    raise invalid_parameter_value using message = 'branch is already archived';
  end if;

  select count(*)
  into remaining_non_archived_branches
  from public.branches as branch
  where branch.organization_id = target_organization_id
    and branch.status <> 'archived'
    and branch.id <> target_branch_id;

  if remaining_non_archived_branches = 0 then
    raise invalid_parameter_value using message = 'cannot archive the organization''s only remaining branch';
  end if;

  update public.branches
  set status = 'archived',
      archived_at = pg_catalog.statement_timestamp()
  where id = target_branch_id;

  insert into public.audit_events (
    organization_id,
    branch_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    entity_id,
    result
  ) values (
    target_organization_id,
    target_branch_id,
    actor_user_id,
    'USER',
    'ADMINISTRATION',
    'branch.archived',
    'branch',
    target_branch_id,
    'SUCCESS'
  );

  return target_branch_id;
end;
$$;

revoke all on function public.archive_branch(uuid)
from public, anon, authenticated, service_role;

comment on function public.archive_branch(uuid) is
  'Archives one branch under current-user branch.manage + AAL2, refusing to leave the organization with zero non-archived branches, and audits atomically.';

grant execute on function public.update_branch(uuid, text, text, text, text, text, text, text, text, text, boolean)
  to authenticated;
grant execute on function public.archive_branch(uuid)
  to authenticated;
