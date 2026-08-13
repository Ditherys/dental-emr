-- Phase 1 secure baseline — file 5 of 8: invitation-only workforce onboarding.
--
-- Supabase Auth owns the high-entropy, expiry-bound email invitation token. This
-- private record owns the tenant, role, branch, and lifecycle binding. Only the
-- server-only service client may call the public RPC boundary, and that EXECUTE
-- grant is issued in file 8.
--
-- BASELINE INVARIANT: this file grants nothing. Every SECURITY DEFINER function
-- revokes PUBLIC/anon/authenticated EXECUTE immediately after it is created, so
-- no boundary inside this file exposes a definer-rights function to a
-- browser-reachable role. service_role privileges are intentionally left exactly
-- as the accepted Phase 1 schema leaves them; see ADR-017.

create table private.workforce_invitations (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email text not null check (
    email = lower(btrim(email))
    and length(email) between 3 and 320
  ),
  role_id uuid not null references public.roles(id) on delete restrict,
  branch_id uuid,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  auth_user_id uuid unique references auth.users(id) on delete restrict,
  status text not null default 'provisioning' check (
    status in ('provisioning', 'pending', 'accepted', 'revoked', 'expired', 'failed')
  ),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint workforce_invitations_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches (organization_id, id) on delete restrict,
  constraint workforce_invitations_expiry_check check (
    expires_at > created_at
  ),
  constraint workforce_invitations_accepted_state_check check (
    (status = 'accepted') = (accepted_at is not null)
  ),
  constraint workforce_invitations_revoked_state_check check (
    (status = 'revoked') = (revoked_at is not null)
  ),
  constraint workforce_invitations_auth_user_state_check check (
    status not in ('pending', 'accepted', 'revoked', 'expired')
    or auth_user_id is not null
  )
);

revoke all on table private.workforce_invitations from public;
revoke all on table private.workforce_invitations from anon;
revoke all on table private.workforce_invitations from authenticated;

comment on table private.workforce_invitations is
  'Server-only lifecycle and tenant binding for Supabase Auth workforce invites.';

comment on column private.workforce_invitations.email is
  'Normalized recipient email. Never place the Supabase invitation token in this table.';

create unique index workforce_invitations_active_email_key
  on private.workforce_invitations (organization_id, email)
  where status in ('provisioning', 'pending');

create index workforce_invitations_auth_user_status_idx
  on private.workforce_invitations (auth_user_id, status)
  where auth_user_id is not null;

create index workforce_invitations_organization_status_idx
  on private.workforce_invitations (organization_id, status, created_at desc);

create trigger workforce_invitations_set_updated_at
before update on private.workforce_invitations
for each row execute function private.set_updated_at();

create or replace function private.user_has_permission(
  target_user_id uuid,
  target_organization_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as organization_member
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
    join public.role_permissions as role_permission
      on role_permission.role_id = member_role.role_id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where organization_member.organization_id = target_organization_id
      and organization_member.user_id = target_user_id
      and organization_member.membership_status = 'active'
      and member_role.branch_id is null
      and permission.code = target_permission_code
  );
$$;

revoke all on function private.user_has_permission(uuid, uuid, text) from public;
revoke all on function private.user_has_permission(uuid, uuid, text) from anon;
revoke all on function private.user_has_permission(uuid, uuid, text) from authenticated;

comment on function private.user_has_permission(uuid, uuid, text) is
  'Current organization-wide membership permission check used only by server-controlled foundation RPCs.';

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

revoke all on function private.validate_workforce_invitation_scope(uuid, uuid, uuid, uuid) from public;
revoke all on function private.validate_workforce_invitation_scope(uuid, uuid, uuid, uuid) from anon;
revoke all on function private.validate_workforce_invitation_scope(uuid, uuid, uuid, uuid) from authenticated;

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

revoke all on function public.list_workforce_invitation_options(uuid) from public;
revoke all on function public.list_workforce_invitation_options(uuid) from anon;
revoke all on function public.list_workforce_invitation_options(uuid) from authenticated;

comment on function public.list_workforce_invitation_options(uuid) is
  'Service-only invitation choices filtered to roles whose live permission set the actor may delegate.';

create or replace function public.prepare_workforce_invitation(
  p_invitation_id uuid,
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_email text,
  p_role_id uuid,
  p_branch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(p_email));
begin
  if not private.user_has_permission(
    p_actor_user_id,
    p_organization_id,
    'user.invite'
  ) then
    raise exception 'actor is not authorized to invite workforce users';
  end if;

  perform private.validate_workforce_invitation_scope(
    p_organization_id,
    p_role_id,
    p_branch_id,
    p_actor_user_id
  );

  insert into private.workforce_invitations (
    id,
    organization_id,
    email,
    role_id,
    branch_id,
    invited_by_user_id,
    expires_at
  ) values (
    p_invitation_id,
    p_organization_id,
    normalized_email,
    p_role_id,
    p_branch_id,
    p_actor_user_id,
    statement_timestamp() + interval '48 hours'
  );

  return p_invitation_id;
end;
$$;

revoke all on function public.prepare_workforce_invitation(uuid, uuid, uuid, text, uuid, uuid) from public;
revoke all on function public.prepare_workforce_invitation(uuid, uuid, uuid, text, uuid, uuid) from anon;
revoke all on function public.prepare_workforce_invitation(uuid, uuid, uuid, text, uuid, uuid) from authenticated;

comment on function public.prepare_workforce_invitation(uuid, uuid, uuid, text, uuid, uuid) is
  'Reserves a tenant-bound invitation after current actor authorization.';

create or replace function public.prepare_first_owner_invitation(
  p_invitation_id uuid,
  p_organization_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_role_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text, 0)
  );

  if not exists (
    select 1
    from public.organizations
    where id = p_organization_id
      and status = 'active'
  ) then
    raise exception 'organization is not available';
  end if;

  if exists (
    select 1
    from public.organization_members
    where organization_id = p_organization_id
  ) then
    raise exception 'organization already has a workforce member';
  end if;

  if exists (
    select 1
    from private.workforce_invitations
    where organization_id = p_organization_id
      and status in ('provisioning', 'pending')
  ) then
    raise exception 'organization already has an active bootstrap invitation';
  end if;

  select id
  into owner_role_id
  from public.roles
  where organization_id is null
    and code = 'OWNER';

  if owner_role_id is null then
    raise exception 'owner role is not configured';
  end if;

  insert into private.workforce_invitations (
    id,
    organization_id,
    email,
    role_id,
    expires_at
  ) values (
    p_invitation_id,
    p_organization_id,
    lower(btrim(p_email)),
    owner_role_id,
    statement_timestamp() + interval '48 hours'
  );

  return p_invitation_id;
end;
$$;

revoke all on function public.prepare_first_owner_invitation(uuid, uuid, text) from public;
revoke all on function public.prepare_first_owner_invitation(uuid, uuid, text) from anon;
revoke all on function public.prepare_first_owner_invitation(uuid, uuid, text) from authenticated;

comment on function public.prepare_first_owner_invitation(uuid, uuid, text) is
  'Service-only, one-time first-owner reservation for controlled environment bootstrap.';

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

revoke all on function public.finalize_workforce_invitation(uuid, uuid, uuid) from public;
revoke all on function public.finalize_workforce_invitation(uuid, uuid, uuid) from anon;
revoke all on function public.finalize_workforce_invitation(uuid, uuid, uuid) from authenticated;

comment on function public.finalize_workforce_invitation(uuid, uuid, uuid) is
  'Under the tenant authorization lock, revalidates the recorded inviter and live role permissions before atomically creating inactive authorization rows.';

create or replace function public.fail_workforce_invitation(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation private.workforce_invitations%rowtype;
begin
  update private.workforce_invitations
  set status = 'failed'
  where id = p_invitation_id
    and status = 'provisioning'
  returning * into invitation;

  if not found then
    return;
  end if;

  insert into public.audit_events (
    organization_id,
    branch_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    result,
    metadata
  ) values (
    invitation.organization_id,
    invitation.branch_id,
    invitation.invited_by_user_id,
    case when invitation.invited_by_user_id is null then 'SERVICE' else 'USER' end,
    'MEMBERSHIP',
    'membership.invited',
    'workforce_invitation',
    'FAILED',
    jsonb_build_object('invitation_id', invitation.id)
  );
end;
$$;

revoke all on function public.fail_workforce_invitation(uuid) from public;
revoke all on function public.fail_workforce_invitation(uuid) from anon;
revoke all on function public.fail_workforce_invitation(uuid) from authenticated;

create or replace function public.get_workforce_invitation_summary(
  p_auth_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', case
      when invitation.expires_at <= statement_timestamp() then 'expired'
      else invitation.status
    end,
    'organizationName', organization.business_name,
    'roleName', role.name,
    'branchName', branch.name,
    'expiresAt', invitation.expires_at
  )
  from private.workforce_invitations as invitation
  join public.organizations as organization
    on organization.id = invitation.organization_id
  join public.roles as role
    on role.id = invitation.role_id
  left join public.branches as branch
    on branch.organization_id = invitation.organization_id
   and branch.id = invitation.branch_id
  where invitation.auth_user_id = p_auth_user_id
    and invitation.status in ('pending', 'accepted', 'revoked', 'expired');
$$;

revoke all on function public.get_workforce_invitation_summary(uuid) from public;
revoke all on function public.get_workforce_invitation_summary(uuid) from anon;
revoke all on function public.get_workforce_invitation_summary(uuid) from authenticated;

create or replace function public.accept_workforce_invitation(
  p_auth_user_id uuid,
  p_first_name text,
  p_last_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation private.workforce_invitations%rowtype;
  member_id uuid;
begin
  select *
  into invitation
  from private.workforce_invitations
  where auth_user_id = p_auth_user_id
  for update;

  if not found or invitation.status <> 'pending' then
    return 'NOT_AVAILABLE';
  end if;

  select id
  into member_id
  from public.organization_members
  where organization_id = invitation.organization_id
    and user_id = p_auth_user_id
  for update;

  if invitation.expires_at <= statement_timestamp() then
    update private.workforce_invitations
    set status = 'expired'
    where id = invitation.id;

    update public.organization_members
    set membership_status = 'removed'
    where id = member_id
      and membership_status = 'invited';

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
      p_auth_user_id,
      'USER',
      'MEMBERSHIP',
      'membership.invitation_expired',
      'organization_member',
      member_id,
      'DENIED',
      jsonb_build_object('invitation_id', invitation.id)
    );

    return 'EXPIRED';
  end if;

  if btrim(p_first_name) = '' or btrim(p_last_name) = '' then
    raise exception 'profile names are required';
  end if;

  insert into public.profiles (
    user_id,
    display_name,
    first_name,
    last_name
  ) values (
    p_auth_user_id,
    btrim(p_first_name) || ' ' || btrim(p_last_name),
    btrim(p_first_name),
    btrim(p_last_name)
  ) on conflict (user_id) do nothing;

  update public.organization_members
  set membership_status = 'active',
      joined_at = statement_timestamp()
  where id = member_id
    and membership_status = 'invited';

  if not found then
    raise exception 'invited membership is not available for activation';
  end if;

  update private.workforce_invitations
  set status = 'accepted',
      accepted_at = statement_timestamp()
  where id = invitation.id;

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
    p_auth_user_id,
    'USER',
    'MEMBERSHIP',
    'membership.activated',
    'organization_member',
    member_id,
    'SUCCESS',
    jsonb_build_object('invitation_id', invitation.id)
  );

  return 'ACCEPTED';
end;
$$;

revoke all on function public.accept_workforce_invitation(uuid, text, text) from public;
revoke all on function public.accept_workforce_invitation(uuid, text, text) from anon;
revoke all on function public.accept_workforce_invitation(uuid, text, text) from authenticated;

comment on function public.accept_workforce_invitation(uuid, text, text) is
  'Single-use activation using the verified Auth user binding, never client-supplied tenant or role IDs.';

create or replace function public.revoke_workforce_invitation(
  p_actor_user_id uuid,
  p_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation private.workforce_invitations%rowtype;
  member_id uuid;
begin
  select *
  into invitation
  from private.workforce_invitations
  where id = p_invitation_id
  for update;

  if not found or invitation.status <> 'pending' then
    return false;
  end if;

  if not private.user_has_permission(
    p_actor_user_id,
    invitation.organization_id,
    'user.invite'
  ) then
    raise exception 'actor is not authorized to revoke this invitation';
  end if;

  update private.workforce_invitations
  set status = 'revoked',
      revoked_at = statement_timestamp()
  where id = invitation.id;

  update public.organization_members
  set membership_status = 'removed'
  where organization_id = invitation.organization_id
    and user_id = invitation.auth_user_id
    and membership_status = 'invited'
  returning id into member_id;

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
    p_actor_user_id,
    'USER',
    'MEMBERSHIP',
    'membership.invitation_revoked',
    'organization_member',
    member_id,
    'SUCCESS',
    jsonb_build_object('invitation_id', invitation.id)
  );

  return true;
end;
$$;

revoke all on function public.revoke_workforce_invitation(uuid, uuid) from public;
revoke all on function public.revoke_workforce_invitation(uuid, uuid) from anon;
revoke all on function public.revoke_workforce_invitation(uuid, uuid) from authenticated;
