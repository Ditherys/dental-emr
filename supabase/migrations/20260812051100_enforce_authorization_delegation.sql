-- P1-11 follow-up hardening: invitation delegation and sensitive-principal
-- role changes are revalidated under the organization authorization lock.

create or replace function private.validate_workforce_invitation_scope(
  target_organization_id uuid,
  target_role_id uuid,
  target_branch_id uuid,
  actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_role_code text;
  selected_role_organization_id uuid;
begin
  if not exists (
    select 1
    from public.organizations
    where id = target_organization_id
      and status = 'active'
  ) then
    raise exception 'organization is not available';
  end if;

  select code, organization_id
  into selected_role_code, selected_role_organization_id
  from public.roles
  where id = target_role_id;

  if not found
     or (selected_role_organization_id is not null
         and selected_role_organization_id <> target_organization_id) then
    raise exception 'role is not available for this organization';
  end if;

  if target_branch_id is not null and not exists (
    select 1
    from public.branches
    where organization_id = target_organization_id
      and id = target_branch_id
      and status = 'active'
  ) then
    raise exception 'branch is not available for this organization';
  end if;

  if target_branch_id is not null and selected_role_code in ('OWNER', 'ADMIN') then
    raise exception 'administrative roles must be organization-wide';
  end if;

  if actor_user_id is not null then
    if not private.user_has_permission(
      actor_user_id,
      target_organization_id,
      'user.invite'
    ) then
      raise exception 'actor is not authorized to invite workforce users';
    end if;

    if (selected_role_code in ('OWNER', 'ADMIN')
        or selected_role_organization_id is not null)
       and not private.user_has_permission(
         actor_user_id,
         target_organization_id,
         'role.manage'
       ) then
      raise exception 'actor may not assign this role';
    end if;

    if exists (
      select 1
      from public.role_permissions as role_permission
      join public.permissions as permission
        on permission.id = role_permission.permission_id
      where role_permission.role_id = target_role_id
        and permission.code in ('role.manage', 'security.manage')
    ) and not private.user_has_permission(
      actor_user_id,
      target_organization_id,
      'security.manage'
    ) then
      raise exception 'sensitive role delegation requires security.manage';
    end if;

    if exists (
      select 1
      from public.role_permissions as role_permission
      join public.permissions as permission
        on permission.id = role_permission.permission_id
      where role_permission.role_id = target_role_id
        and not private.user_has_permission(
          actor_user_id,
          target_organization_id,
          permission.code
        )
    ) then
      raise exception 'role contains permissions the actor may not delegate';
    end if;
  end if;
end;
$$;

comment on function private.validate_workforce_invitation_scope(uuid, uuid, uuid, uuid) is
  'Validates tenant/scope and requires the recorded inviter to hold user.invite, applicable role-management authority, every delegated permission, and security.manage for sensitive roles.';

create or replace function public.list_workforce_invitation_options(
  p_actor_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'organizationId', organization_member.organization_id,
        'organizationName', organization.business_name,
        'roles', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', role.id,
                'code', role.code,
                'name', role.name
              ) order by role.name
            ),
            '[]'::jsonb
          )
          from public.roles as role
          where (role.organization_id is null
                 or role.organization_id = organization_member.organization_id)
            and (
              (role.organization_id is null
               and role.code not in ('OWNER', 'ADMIN'))
              or private.user_has_permission(
                p_actor_user_id,
                organization_member.organization_id,
                'role.manage'
              )
            )
            and not exists (
              select 1
              from public.role_permissions as sensitive_role_permission
              join public.permissions as sensitive_permission
                on sensitive_permission.id = sensitive_role_permission.permission_id
              where sensitive_role_permission.role_id = role.id
                and sensitive_permission.code in ('role.manage', 'security.manage')
                and not private.user_has_permission(
                  p_actor_user_id,
                  organization_member.organization_id,
                  'security.manage'
                )
            )
            and not exists (
              select 1
              from public.role_permissions as delegated_role_permission
              join public.permissions as delegated_permission
                on delegated_permission.id = delegated_role_permission.permission_id
              where delegated_role_permission.role_id = role.id
                and not private.user_has_permission(
                  p_actor_user_id,
                  organization_member.organization_id,
                  delegated_permission.code
                )
            )
        ),
        'branches', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', branch.id,
                'name', branch.name
              ) order by branch.name
            ),
            '[]'::jsonb
          )
          from public.branches as branch
          where branch.organization_id = organization_member.organization_id
            and branch.status = 'active'
        )
      ) order by organization.business_name
    ),
    '[]'::jsonb
  )
  from public.organization_members as organization_member
  join public.organizations as organization
    on organization.id = organization_member.organization_id
   and organization.status = 'active'
  where organization_member.user_id = p_actor_user_id
    and organization_member.membership_status = 'active'
    and private.user_has_permission(
      p_actor_user_id,
      organization_member.organization_id,
      'user.invite'
    );
$$;

comment on function public.list_workforce_invitation_options(uuid) is
  'Service-only invitation choices filtered to roles whose live permission set the actor may delegate.';

create or replace function public.finalize_workforce_invitation(
  p_invitation_id uuid,
  p_actor_user_id uuid,
  p_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation private.workforce_invitations%rowtype;
  auth_email text;
  member_id uuid;
  selected_role_code text;
begin
  select *
  into invitation
  from private.workforce_invitations
  where id = p_invitation_id
  for update;

  if not found or invitation.status <> 'provisioning' then
    raise exception 'invitation is not awaiting provisioning';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(invitation.organization_id::text, 0)
  );

  if invitation.invited_by_user_id is null then
    if p_actor_user_id is not null or exists (
      select 1
      from public.organization_members
      where organization_id = invitation.organization_id
    ) then
      raise exception 'first-owner bootstrap is no longer available';
    end if;

    perform private.validate_workforce_invitation_scope(
      invitation.organization_id,
      invitation.role_id,
      invitation.branch_id,
      null
    );
  else
    if p_actor_user_id is distinct from invitation.invited_by_user_id then
      raise exception 'actor is not authorized to finalize this invitation';
    end if;

    perform private.validate_workforce_invitation_scope(
      invitation.organization_id,
      invitation.role_id,
      invitation.branch_id,
      invitation.invited_by_user_id
    );
  end if;

  select lower(email)
  into auth_email
  from auth.users
  where id = p_auth_user_id;

  if auth_email is null or auth_email <> invitation.email then
    raise exception 'invited Auth identity does not match the intended recipient';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    membership_status
  ) values (
    invitation.organization_id,
    p_auth_user_id,
    'invited'
  )
  returning id into member_id;

  if invitation.branch_id is not null then
    insert into public.branch_memberships (
      organization_id,
      branch_id,
      organization_member_id
    ) values (
      invitation.organization_id,
      invitation.branch_id,
      member_id
    );
  end if;

  insert into public.member_roles (
    organization_id,
    organization_member_id,
    role_id,
    branch_id,
    assigned_by
  ) values (
    invitation.organization_id,
    member_id,
    invitation.role_id,
    invitation.branch_id,
    invitation.invited_by_user_id
  );

  update private.workforce_invitations
  set auth_user_id = p_auth_user_id,
      status = 'pending'
  where id = invitation.id;

  select code
  into selected_role_code
  from public.roles
  where id = invitation.role_id;

  insert into public.audit_events (
    organization_id,
    branch_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    entity_id,
    result,
    metadata
  ) values (
    invitation.organization_id,
    invitation.branch_id,
    invitation.invited_by_user_id,
    case when invitation.invited_by_user_id is null then 'SERVICE' else 'USER' end,
    'MEMBERSHIP',
    'membership.invited',
    'organization_member',
    member_id,
    'SUCCESS',
    jsonb_build_object(
      'invitation_id', invitation.id,
      'role_code', selected_role_code,
      'scope', case when invitation.branch_id is null then 'ORGANIZATION' else 'BRANCH' end
    )
  );

  return member_id;
end;
$$;

comment on function public.finalize_workforce_invitation(uuid, uuid, uuid) is
  'Under the tenant authorization lock, revalidates the recorded inviter and live role permissions before atomically creating inactive authorization rows.';

create or replace function public.set_member_role(
  target_organization_member_id uuid,
  target_role_id uuid,
  target_branch_id uuid,
  grant_role boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_user_id uuid;
  target_membership_status text;
  target_organization_id uuid;
  role_organization_id uuid;
  assignment_id uuid;
begin
  perform private.require_aal2();

  select organization_member.organization_id
  into target_organization_id
  from public.organization_members as organization_member
  where organization_member.id = target_organization_member_id;

  if not found then
    raise insufficient_privilege using message = 'role assignment is not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text, 0)
  );

  select
    organization_member.user_id,
    organization_member.membership_status
  into
    target_user_id,
    target_membership_status
  from public.organization_members as organization_member
  where organization_member.id = target_organization_member_id
    and organization_member.organization_id = target_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'role assignment is not authorized';
  end if;

  if actor_user_id is null
     or actor_user_id = target_user_id
     or not (select private.has_org_permission(
       target_organization_id,
       'role.manage'
     )) then
    raise insufficient_privilege using message = 'role assignment is not authorized';
  end if;

  select role.organization_id
  into role_organization_id
  from public.roles as role
  where role.id = target_role_id;

  if not found
     or (role_organization_id is not null
         and role_organization_id <> target_organization_id) then
    raise insufficient_privilege using message = 'role assignment is not authorized';
  end if;

  if exists (
    select 1
    from public.member_roles as current_member_role
    join public.role_permissions as current_role_permission
      on current_role_permission.role_id = current_member_role.role_id
    join public.permissions as current_permission
      on current_permission.id = current_role_permission.permission_id
    where current_member_role.organization_id = target_organization_id
      and current_member_role.organization_member_id = target_organization_member_id
      and current_member_role.branch_id is null
      and current_permission.code in ('role.manage', 'security.manage')
  ) and not (select private.has_org_permission(
    target_organization_id,
    'security.manage'
  )) then
    raise insufficient_privilege using message = 'sensitive member role changes require security.manage';
  end if;

  if target_branch_id is not null and not exists (
    select 1
    from public.branches as branch
    join public.branch_memberships as branch_membership
      on branch_membership.organization_id = branch.organization_id
     and branch_membership.branch_id = branch.id
     and branch_membership.organization_member_id = target_organization_member_id
     and branch_membership.access_status = 'active'
    where branch.organization_id = target_organization_id
      and branch.id = target_branch_id
      and branch.status = 'active'
  ) then
    raise insufficient_privilege using message = 'branch-scoped role requires active branch access';
  end if;

  if exists (
    select 1
    from public.role_permissions as role_permission
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where role_permission.role_id = target_role_id
      and permission.code in ('role.manage', 'security.manage')
  ) and not (select private.has_org_permission(
    target_organization_id,
    'security.manage'
  )) then
    raise insufficient_privilege using message = 'sensitive role assignment requires security.manage';
  end if;

  if grant_role and exists (
    select 1
    from public.role_permissions as role_permission
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where role_permission.role_id = target_role_id
      and not (select private.has_org_permission(
        target_organization_id,
        permission.code
      ))
  ) then
    raise insufficient_privilege using message = 'role contains permissions the actor may not delegate';
  end if;

  if grant_role then
    if target_membership_status not in ('invited', 'active') then
      raise insufficient_privilege using message = 'target membership cannot receive roles';
    end if;

    insert into public.member_roles (
      organization_id,
      organization_member_id,
      role_id,
      branch_id,
      assigned_by
    ) values (
      target_organization_id,
      target_organization_member_id,
      target_role_id,
      target_branch_id,
      actor_user_id
    )
    returning id into assignment_id;
  else
    delete from public.member_roles
    where organization_id = target_organization_id
      and organization_member_id = target_organization_member_id
      and role_id = target_role_id
      and branch_id is not distinct from target_branch_id
    returning id into assignment_id;

    if assignment_id is null then
      raise invalid_parameter_value using message = 'role assignment already matches requested state';
    end if;
  end if;

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
    'AUTHORIZATION',
    case when grant_role
      then 'member_role.assigned'
      else 'member_role.revoked'
    end,
    'member_role',
    assignment_id,
    'SUCCESS'
  );

  return assignment_id;
end;
$$;

comment on function public.set_member_role(uuid, uuid, uuid, boolean) is
  'Assigns or revokes one role under AAL2, anti-self-escalation, permission-superset, sensitive-role, and sensitive-target checks.';
