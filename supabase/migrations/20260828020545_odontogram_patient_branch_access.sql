-- O5 hardening: clinical DTO reads require explicit patient branch access.
-- Organization-wide role scope does not silently grant clinical access to an
-- operational branch where the actor has no active branch membership.
do $do$
declare
  v_definition text;
  v_old text := $q$if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.read') then raise insufficient_privilege using message='not authorized';end if;$q$;
  v_new text := $q$if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.read') or not exists (
   select 1 from public.organization_members om
   join public.branch_memberships bm on bm.organization_id=om.organization_id and bm.organization_member_id=om.id and bm.branch_id=p_acting_branch_id and bm.access_status='active'
   where om.organization_id=v_org and om.user_id=v_actor and om.membership_status='active'
  ) then raise insufficient_privilege using message='not authorized';end if;$q$;
begin
  select pg_catalog.pg_get_functiondef('public.get_patient_odontogram(uuid,uuid)'::regprocedure)
    into v_definition;
  if pg_catalog.strpos(v_definition,v_old)=0 then
    raise exception using errcode='55000', message='expected DTO authorization guard was not found';
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end;
$do$;

