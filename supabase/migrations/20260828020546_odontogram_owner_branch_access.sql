-- Preserve the documented organization-wide OWNER exception while requiring
-- ADMIN/DENTIST/etc. to hold active access to the acting branch.
do $do$
declare
  v_definition text;
  v_old text := $q$not exists (
   select 1 from public.organization_members om
   join public.branch_memberships bm on bm.organization_id=om.organization_id and bm.organization_member_id=om.id and bm.branch_id=p_acting_branch_id and bm.access_status='active'
   where om.organization_id=v_org and om.user_id=v_actor and om.membership_status='active'
  )$q$;
  v_new text := $q$not (
   exists (
    select 1 from public.organization_members om
    join public.branch_memberships bm on bm.organization_id=om.organization_id and bm.organization_member_id=om.id and bm.branch_id=p_acting_branch_id and bm.access_status='active'
    where om.organization_id=v_org and om.user_id=v_actor and om.membership_status='active'
   )
   or exists (
    select 1 from public.organization_members om
    join public.member_roles mr on mr.organization_member_id=om.id and mr.organization_id=om.organization_id and mr.branch_id is null
    join public.roles r on r.id=mr.role_id and r.code='OWNER'
    where om.organization_id=v_org and om.user_id=v_actor and om.membership_status='active'
   )
  )$q$;
begin
  select pg_catalog.pg_get_functiondef('public.get_patient_odontogram(uuid,uuid)'::regprocedure) into v_definition;
  if pg_catalog.strpos(v_definition,v_old)=0 then
    raise exception using errcode='55000', message='expected DTO branch access guard was not found';
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end;
$do$;

