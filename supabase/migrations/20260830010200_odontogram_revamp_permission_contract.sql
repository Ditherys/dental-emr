-- O5 revamp: clinical mutations identify the treating provider from auth.uid().
-- This deliberately adds no browser table privilege and does not widen the
-- clinical role matrix; a linked active provider at the active branch is an
-- additional requirement for treatment-recording RPCs.

create or replace function private.require_active_actor_provider(
  p_organization_id uuid,
  p_branch_id uuid,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_id uuid;
begin
  select provider.id into v_provider_id
  from public.providers as provider
  join public.provider_branches as provider_branch
    on provider_branch.organization_id = provider.organization_id
   and provider_branch.provider_id = provider.id
  where provider.organization_id = p_organization_id
    and provider.linked_user_id = p_actor_user_id
    and provider.status = 'active'
    and provider_branch.branch_id = p_branch_id
    and provider_branch.is_active
  for key share of provider, provider_branch;

  if v_provider_id is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  return v_provider_id;
end;
$$;

revoke all on function private.require_active_actor_provider(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

comment on function private.require_active_actor_provider(uuid, uuid, uuid) is
  'Resolves only the signed-in user''s active same-tenant provider assigned to the active acting branch. Clinical writers must never accept a provider ID from the browser.';
