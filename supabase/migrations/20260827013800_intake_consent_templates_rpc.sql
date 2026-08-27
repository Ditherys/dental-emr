-- P17-04: the staff consent-template catalog read for the create-link dialog.
--
-- list_consent_templates is the intake.manage-gated bounded projection that
-- mirrors list_specialties (P3-04): it derives the organization from an active
-- authenticated acting branch, requires live intake.manage, and returns only
-- active global (org null) or same-organization consent templates, bounded to
-- 100 rows ordered by name. It writes no audit event and never exposes the
-- template body. This object migration grants nothing; the 20260827013801
-- terminal owns the only authenticated grant.

create function public.list_consent_templates(p_acting_branch_id uuid)
returns table(
  template_id uuid,
  code text,
  name text,
  version integer,
  is_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_intake_permission_at_branch(
       p_acting_branch_id, 'intake.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select
    template.id,
    template.code,
    template.name,
    template.version,
    template.is_active
  from public.consent_templates as template
  where template.is_active
    and (template.organization_id is null or template.organization_id = v_organization_id)
  order by template.name, template.id
  limit 100;
end;
$$;

revoke all on function public.list_consent_templates(uuid)
from public, anon, authenticated, service_role;

comment on function public.list_consent_templates(uuid) is
  'intake.manage-gated bounded 100-row read of the active global (org null) and same-organization consent templates for the create-link dialog. Returns only template id, code, name, version, and the active flag; never the body, and writes no audit event.';