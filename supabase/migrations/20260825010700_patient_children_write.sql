-- P2-07: patient contact and relationship mutations. This object migration grants nothing.

create or replace function public.create_patient_contact(
  p_acting_branch_id uuid, p_patient_id uuid, p_contact_type text, p_label text,
  p_value text, p_is_primary boolean, p_duplicate_confirmed boolean
) returns table(contact_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_patient public.patients%rowtype; v_normalized text; v_duplicate boolean := false;
begin
  select organization_id into v_organization_id from public.branches where id = p_acting_branch_id and status = 'active';
  if v_organization_id is null or (select auth.uid()) is null or not private.has_patient_permission_at_branch(p_acting_branch_id, 'patient.demographics.write') then raise insufficient_privilege using message = 'not authorized'; end if;
  if p_contact_type not in ('MOBILE','EMAIL','LANDLINE','OTHER') or p_value is null or btrim(p_value) = '' or length(p_value) > 320 or coalesce(length(p_label),0) > 80 or p_is_primary is null or p_duplicate_confirmed is null then raise invalid_parameter_value using message = 'invalid input'; end if;
  if p_contact_type = 'MOBILE' then v_normalized := private.normalize_patient_mobile(p_value); elsif p_contact_type = 'EMAIL' then v_normalized := private.normalize_patient_email(p_value); end if;
  if p_contact_type in ('MOBILE','EMAIL') and v_normalized is null then raise invalid_parameter_value using message = 'invalid input'; end if;
  if p_contact_type in ('MOBILE','EMAIL') then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_organization_id::text, 1)); end if;
  select * into v_patient from public.patients where id = p_patient_id and organization_id = v_organization_id for update;
  if not found or v_patient.status = 'archived' then raise insufficient_privilege using message = 'not authorized'; end if;
  perform 1 from public.patient_contacts where organization_id = v_organization_id and patient_id = v_patient.id and contact_type = p_contact_type order by id for update;
  if p_contact_type in ('MOBILE','EMAIL') then
    select exists (select 1 from public.patient_contacts c where c.organization_id = v_organization_id and c.patient_id <> v_patient.id and c.status = 'active' and c.contact_type = p_contact_type and c.normalized_value = v_normalized) into v_duplicate;
    if v_duplicate and not p_duplicate_confirmed then raise exception using errcode = 'P0001', message = 'duplicate review required'; end if;
  end if;
  if p_is_primary then update public.patient_contacts set is_primary = false, version = public.patient_contacts.version + 1 where organization_id = v_organization_id and patient_id = v_patient.id and contact_type = p_contact_type and status = 'active' and is_primary; end if;
  insert into public.patient_contacts (organization_id, patient_id, contact_type, label, value, is_primary) values (v_organization_id, v_patient.id, p_contact_type, nullif(btrim(p_label), ''), btrim(p_value), p_is_primary) returning id, public.patient_contacts.version into contact_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, patient_id, result) values (v_organization_id, p_acting_branch_id, (select auth.uid()), 'USER', 'PATIENT', case when v_duplicate then 'patient.contact.created_duplicate_override' else 'patient.contact.created' end, 'patient_contact', contact_id, v_patient.id, 'SUCCESS');
  return next;
end $$;

revoke all on function public.create_patient_contact(uuid,uuid,text,text,text,boolean,boolean) from public, anon, authenticated, service_role;

create or replace function public.update_patient_contact(
  p_acting_branch_id uuid, p_contact_id uuid, p_patient_id uuid, p_expected_version integer,
  p_contact_type text, p_label text, p_value text, p_is_primary boolean, p_duplicate_confirmed boolean
) returns table(contact_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_patient public.patients%rowtype; v_contact public.patient_contacts%rowtype; v_normalized text; v_duplicate boolean := false; v_needs_lock boolean;
begin
  select organization_id into v_organization_id from public.branches where id = p_acting_branch_id and status = 'active';
  if v_organization_id is null or (select auth.uid()) is null or not private.has_patient_permission_at_branch(p_acting_branch_id, 'patient.demographics.write') then raise insufficient_privilege using message = 'not authorized'; end if;
  if p_expected_version is null or p_expected_version < 1 or p_contact_type not in ('MOBILE','EMAIL','LANDLINE','OTHER') or p_value is null or btrim(p_value) = '' or length(p_value) > 320 or coalesce(length(p_label),0) > 80 or p_is_primary is null or p_duplicate_confirmed is null then raise invalid_parameter_value using message = 'invalid input'; end if;
  select * into v_contact from public.patient_contacts where id = p_contact_id and patient_id = p_patient_id and organization_id = v_organization_id;
  if not found then raise insufficient_privilege using message = 'not authorized'; end if;
  v_needs_lock := v_contact.contact_type in ('MOBILE','EMAIL') or p_contact_type in ('MOBILE','EMAIL');
  if p_contact_type = 'MOBILE' then v_normalized := private.normalize_patient_mobile(p_value); elsif p_contact_type = 'EMAIL' then v_normalized := private.normalize_patient_email(p_value); end if;
  if p_contact_type in ('MOBILE','EMAIL') and v_normalized is null then raise invalid_parameter_value using message = 'invalid input'; end if;
  if v_needs_lock then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_organization_id::text, 1)); end if;
  select * into v_patient from public.patients where id = p_patient_id and organization_id = v_organization_id for update;
  if not found or v_patient.status = 'archived' then raise insufficient_privilege using message = 'not authorized'; end if;
  select * into v_contact from public.patient_contacts where id = p_contact_id and patient_id = v_patient.id and organization_id = v_organization_id for update;
  if not found then raise insufficient_privilege using message = 'not authorized'; end if;
  if v_contact.status <> 'active' then raise exception using errcode = 'P0001', message = 'invalid state'; end if;
  if v_contact.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'stale version'; end if;
  perform 1 from public.patient_contacts where organization_id = v_organization_id and patient_id = v_patient.id and contact_type in (v_contact.contact_type, p_contact_type) order by id for update;
  if p_contact_type in ('MOBILE','EMAIL') then
    select exists (select 1 from public.patient_contacts c where c.organization_id = v_organization_id and c.patient_id <> v_patient.id and c.status = 'active' and c.contact_type = p_contact_type and c.normalized_value = v_normalized) into v_duplicate;
    if v_duplicate and not p_duplicate_confirmed then raise exception using errcode = 'P0001', message = 'duplicate review required'; end if;
  end if;
  if p_is_primary then update public.patient_contacts set is_primary = false, version = public.patient_contacts.version + 1 where organization_id = v_organization_id and patient_id = v_patient.id and contact_type = p_contact_type and status = 'active' and is_primary and id <> v_contact.id; end if;
  update public.patient_contacts set contact_type = p_contact_type, label = nullif(btrim(p_label), ''), value = btrim(p_value), is_primary = p_is_primary, version = v_contact.version + 1 where id = v_contact.id returning id, public.patient_contacts.version into contact_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, patient_id, result) values (v_organization_id, p_acting_branch_id, (select auth.uid()), 'USER', 'PATIENT', case when v_duplicate then 'patient.contact.updated_duplicate_override' else 'patient.contact.updated' end, 'patient_contact', contact_id, v_patient.id, 'SUCCESS');
  return next;
end $$;

revoke all on function public.update_patient_contact(uuid,uuid,uuid,integer,text,text,text,boolean,boolean) from public, anon, authenticated, service_role;

create or replace function public.archive_patient_contact(p_acting_branch_id uuid, p_contact_id uuid, p_patient_id uuid, p_expected_version integer)
returns table(contact_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_patient public.patients%rowtype; v_contact public.patient_contacts%rowtype;
begin
  select organization_id into v_organization_id from public.branches where id = p_acting_branch_id and status = 'active';
  if v_organization_id is null or (select auth.uid()) is null or not private.has_patient_permission_at_branch(p_acting_branch_id, 'patient.demographics.write') then raise insufficient_privilege using message = 'not authorized'; end if;
  if p_expected_version is null or p_expected_version < 1 then raise invalid_parameter_value using message = 'invalid input'; end if;
  select * into v_contact from public.patient_contacts where id = p_contact_id and patient_id = p_patient_id and organization_id = v_organization_id;
  if not found then raise insufficient_privilege using message = 'not authorized'; end if;
  if v_contact.contact_type in ('MOBILE','EMAIL') then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_organization_id::text, 1)); end if;
  select * into v_patient from public.patients where id = p_patient_id and organization_id = v_organization_id for update;
  if not found or v_patient.status = 'archived' then raise insufficient_privilege using message = 'not authorized'; end if;
  select * into v_contact from public.patient_contacts where id = p_contact_id and patient_id = v_patient.id and organization_id = v_organization_id for update;
  if v_contact.status <> 'active' then raise exception using errcode = 'P0001', message = 'invalid state'; end if;
  if v_contact.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'stale version'; end if;
  update public.patient_contacts set status = 'archived', archived_at = statement_timestamp(), is_primary = false, version = v_contact.version + 1 where id = v_contact.id returning id, public.patient_contacts.version into contact_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, patient_id, result) values (v_organization_id, p_acting_branch_id, (select auth.uid()), 'USER', 'PATIENT', 'patient.contact.archived', 'patient_contact', contact_id, v_patient.id, 'SUCCESS');
  return next;
end $$;

revoke all on function public.archive_patient_contact(uuid,uuid,uuid,integer) from public, anon, authenticated, service_role;

create or replace function public.create_patient_relationship(p_acting_branch_id uuid, p_patient_id uuid, p_related_patient_id uuid, p_external_contact_name text, p_external_mobile text, p_external_email text, p_relationship_type text, p_is_legal_guardian boolean, p_can_receive_communications boolean, p_can_consent boolean)
returns table(relationship_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_patient public.patients%rowtype;
begin
  select organization_id into v_organization_id from public.branches where id = p_acting_branch_id and status = 'active';
  if v_organization_id is null or (select auth.uid()) is null or not private.has_patient_permission_at_branch(p_acting_branch_id, 'patient.demographics.write') then raise insufficient_privilege using message = 'not authorized'; end if;
  if (p_related_patient_id is null) = (nullif(btrim(p_external_contact_name), '') is null) or (p_related_patient_id is not null and (p_external_mobile is not null or p_external_email is not null)) or p_relationship_type not in ('PARENT','GUARDIAN','CHILD','SPOUSE','DEPENDENT','EMERGENCY_CONTACT','HOUSEHOLD_CONTACT','OTHER') or coalesce(length(p_external_contact_name),0) > 160 or coalesce(length(p_external_mobile),0) > 50 or coalesce(length(p_external_email),0) > 320 or p_is_legal_guardian is null or p_can_receive_communications is null or p_can_consent is null or (p_external_mobile is not null and private.normalize_patient_mobile(p_external_mobile) is null) or (p_external_email is not null and private.normalize_patient_email(p_external_email) is null) then raise invalid_parameter_value using message = 'invalid input'; end if;
  select * into v_patient from public.patients where id = p_patient_id and organization_id = v_organization_id for update;
  if not found or v_patient.status = 'archived' then raise insufficient_privilege using message = 'not authorized'; end if;
  if p_related_patient_id is not null and (p_related_patient_id = v_patient.id or not exists (select 1 from public.patients where id = p_related_patient_id and organization_id = v_organization_id)) then raise invalid_parameter_value using message = 'invalid input'; end if;
  insert into public.patient_relationships (organization_id, patient_id, related_patient_id, external_contact_name, external_mobile, external_email, relationship_type, is_legal_guardian, can_receive_communications, can_consent) values (v_organization_id, v_patient.id, p_related_patient_id, nullif(btrim(p_external_contact_name), ''), case when p_related_patient_id is null then nullif(btrim(p_external_mobile), '') else null end, case when p_related_patient_id is null then nullif(btrim(p_external_email), '') else null end, p_relationship_type, p_is_legal_guardian, p_can_receive_communications, p_can_consent) returning id, public.patient_relationships.version into relationship_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, patient_id, result) values (v_organization_id, p_acting_branch_id, (select auth.uid()), 'USER', 'PATIENT', 'patient.relationship.created', 'patient_relationship', relationship_id, v_patient.id, 'SUCCESS');
  return next;
end $$;

revoke all on function public.create_patient_relationship(uuid,uuid,uuid,text,text,text,text,boolean,boolean,boolean) from public, anon, authenticated, service_role;

create or replace function public.update_patient_relationship(p_acting_branch_id uuid, p_relationship_id uuid, p_patient_id uuid, p_expected_version integer, p_related_patient_id uuid, p_external_contact_name text, p_external_mobile text, p_external_email text, p_relationship_type text, p_is_legal_guardian boolean, p_can_receive_communications boolean, p_can_consent boolean)
returns table(relationship_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_patient public.patients%rowtype; v_relationship public.patient_relationships%rowtype;
begin
  select organization_id into v_organization_id from public.branches where id = p_acting_branch_id and status = 'active';
  if v_organization_id is null or (select auth.uid()) is null or not private.has_patient_permission_at_branch(p_acting_branch_id, 'patient.demographics.write') then raise insufficient_privilege using message = 'not authorized'; end if;
  if p_expected_version is null or p_expected_version < 1 or (p_related_patient_id is null) = (nullif(btrim(p_external_contact_name), '') is null) or (p_related_patient_id is not null and (p_external_mobile is not null or p_external_email is not null)) or p_relationship_type not in ('PARENT','GUARDIAN','CHILD','SPOUSE','DEPENDENT','EMERGENCY_CONTACT','HOUSEHOLD_CONTACT','OTHER') or coalesce(length(p_external_contact_name),0) > 160 or coalesce(length(p_external_mobile),0) > 50 or coalesce(length(p_external_email),0) > 320 or p_is_legal_guardian is null or p_can_receive_communications is null or p_can_consent is null or (p_external_mobile is not null and private.normalize_patient_mobile(p_external_mobile) is null) or (p_external_email is not null and private.normalize_patient_email(p_external_email) is null) then raise invalid_parameter_value using message = 'invalid input'; end if;
  select * into v_patient from public.patients where id = p_patient_id and organization_id = v_organization_id for update;
  if not found or v_patient.status = 'archived' then raise insufficient_privilege using message = 'not authorized'; end if;
  select * into v_relationship from public.patient_relationships where id = p_relationship_id and patient_id = v_patient.id and organization_id = v_organization_id for update;
  if not found then raise insufficient_privilege using message = 'not authorized'; end if;
  if v_relationship.status <> 'active' then raise exception using errcode = 'P0001', message = 'invalid state'; end if;
  if v_relationship.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'stale version'; end if;
  if p_related_patient_id is not null and (p_related_patient_id = v_patient.id or not exists (select 1 from public.patients where id = p_related_patient_id and organization_id = v_organization_id)) then raise invalid_parameter_value using message = 'invalid input'; end if;
  update public.patient_relationships set related_patient_id = p_related_patient_id, external_contact_name = nullif(btrim(p_external_contact_name), ''), external_mobile = case when p_related_patient_id is null then nullif(btrim(p_external_mobile), '') else null end, external_email = case when p_related_patient_id is null then nullif(btrim(p_external_email), '') else null end, relationship_type = p_relationship_type, is_legal_guardian = p_is_legal_guardian, can_receive_communications = p_can_receive_communications, can_consent = p_can_consent, version = v_relationship.version + 1 where id = v_relationship.id returning id, public.patient_relationships.version into relationship_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, patient_id, result) values (v_organization_id, p_acting_branch_id, (select auth.uid()), 'USER', 'PATIENT', 'patient.relationship.updated', 'patient_relationship', relationship_id, v_patient.id, 'SUCCESS');
  return next;
end $$;

revoke all on function public.update_patient_relationship(uuid,uuid,uuid,integer,uuid,text,text,text,text,boolean,boolean,boolean) from public, anon, authenticated, service_role;

create or replace function public.archive_patient_relationship(p_acting_branch_id uuid, p_relationship_id uuid, p_patient_id uuid, p_expected_version integer)
returns table(relationship_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_patient public.patients%rowtype; v_relationship public.patient_relationships%rowtype;
begin
  select organization_id into v_organization_id from public.branches where id = p_acting_branch_id and status = 'active';
  if v_organization_id is null or (select auth.uid()) is null or not private.has_patient_permission_at_branch(p_acting_branch_id, 'patient.demographics.write') then raise insufficient_privilege using message = 'not authorized'; end if;
  if p_expected_version is null or p_expected_version < 1 then raise invalid_parameter_value using message = 'invalid input'; end if;
  select * into v_patient from public.patients where id = p_patient_id and organization_id = v_organization_id for update;
  if not found or v_patient.status = 'archived' then raise insufficient_privilege using message = 'not authorized'; end if;
  select * into v_relationship from public.patient_relationships where id = p_relationship_id and patient_id = v_patient.id and organization_id = v_organization_id for update;
  if not found then raise insufficient_privilege using message = 'not authorized'; end if;
  if v_relationship.status <> 'active' then raise exception using errcode = 'P0001', message = 'invalid state'; end if;
  if v_relationship.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'stale version'; end if;
  update public.patient_relationships set status = 'archived', archived_at = statement_timestamp(), version = v_relationship.version + 1 where id = v_relationship.id returning id, public.patient_relationships.version into relationship_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, patient_id, result) values (v_organization_id, p_acting_branch_id, (select auth.uid()), 'USER', 'PATIENT', 'patient.relationship.archived', 'patient_relationship', relationship_id, v_patient.id, 'SUCCESS');
  return next;
end $$;

revoke all on function public.create_patient_contact(uuid,uuid,text,text,text,boolean,boolean) from public, anon, authenticated, service_role;
revoke all on function public.update_patient_contact(uuid,uuid,uuid,integer,text,text,text,boolean,boolean) from public, anon, authenticated, service_role;
revoke all on function public.archive_patient_contact(uuid,uuid,uuid,integer) from public, anon, authenticated, service_role;
revoke all on function public.create_patient_relationship(uuid,uuid,uuid,text,text,text,text,boolean,boolean,boolean) from public, anon, authenticated, service_role;
revoke all on function public.update_patient_relationship(uuid,uuid,uuid,integer,uuid,text,text,text,text,boolean,boolean,boolean) from public, anon, authenticated, service_role;
revoke all on function public.archive_patient_relationship(uuid,uuid,uuid,integer) from public, anon, authenticated, service_role;
