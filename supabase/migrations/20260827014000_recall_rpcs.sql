-- P18-02: recall RPC boundaries and the recall automation trigger. All
-- functions are SECURITY DEFINER with an empty search_path, derive the tenant
-- from an active acting branch, gate mutations on recall.manage and reads on
-- recall.read via the private helper, and carry one atomic audit event per
-- mutation. Enqueued reminders reuse the P8-03 internal communication enqueue
-- inside the same transaction so delivery stays observable in the Phase 8
-- worker dashboard. The automation trigger turns a FINALIZED clinical encounter
-- into SCHEDULED recall rows for each active matching recall rule. This object
-- migration grants nothing; the 20260827014001 terminal owns the only
-- browser-reachable grants.

create or replace function private.has_recall_permission_at_branch(
  p_acting_branch_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission_code in ('recall.read', 'recall.manage') and exists (
    select 1
    from public.branches as branch
    join public.organizations as organization
      on organization.id = branch.organization_id
     and organization.status = 'active'
    join public.organization_members as organization_member
      on organization_member.organization_id = organization.id
     and organization_member.user_id = (select auth.uid())
     and organization_member.membership_status = 'active'
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
    join public.roles as role
      on role.id = member_role.role_id
     and (role.organization_id is null or role.organization_id = organization.id)
    join public.role_permissions as role_permission
      on role_permission.role_id = role.id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
     and permission.code = p_permission_code
    where branch.id = p_acting_branch_id
      and branch.status = 'active'
      and (
        member_role.branch_id is null
        or (
          member_role.branch_id = branch.id
          and exists (
            select 1
            from public.branch_memberships as branch_membership
            where branch_membership.organization_id = organization.id
              and branch_membership.organization_member_id = organization_member.id
              and branch_membership.branch_id = branch.id
              and branch_membership.access_status = 'active'
          )
        )
      )
  );
$$;

revoke all on function private.has_recall_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

comment on function private.has_recall_permission_at_branch(uuid, text) is
  'Current-user recall permission check scoped to an active acting branch with org-wide or exact-branch role coverage.';

create function public.create_recall_rule(
  p_acting_branch_id uuid,
  p_name text,
  p_interval_months integer,
  p_channel text,
  p_branch_id uuid default null
)
returns table(rule_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_recall_permission_at_branch(
       p_acting_branch_id, 'recall.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_name is null or pg_catalog.btrim(p_name) = ''
     or pg_catalog.length(p_name) > 160
     or p_interval_months is null or p_interval_months not between 1 and 120
     or p_channel is null or p_channel not in ('EMAIL', 'SMS', 'NONE') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branches as branch
    where branch.id = p_branch_id and branch.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  insert into public.recall_rules (
    organization_id, branch_id, name, interval_months, channel, created_by
  ) values (
    v_organization_id, p_branch_id, pg_catalog.btrim(p_name),
    p_interval_months, p_channel, v_actor_user_id
  ) returning id, public.recall_rules.version into rule_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'RECALL',
    'recall.rule.created', 'recall_rule', rule_id, null, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.create_recall_rule(uuid, text, integer, text, uuid)
from public, anon, authenticated, service_role;

comment on function public.create_recall_rule(uuid, text, integer, text, uuid) is
  'Creates a same-tenant recall rule (clinic-wide when branch is null) under recall.manage and audits it atomically.';

create function public.update_recall_rule(
  p_acting_branch_id uuid,
  p_rule_id uuid,
  p_expected_version integer,
  p_name text,
  p_interval_months integer,
  p_channel text,
  p_is_active boolean
)
returns table(rule_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_rule public.recall_rules%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_recall_permission_at_branch(
       p_acting_branch_id, 'recall.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_rule_id is null or p_expected_version is null or p_expected_version < 1
     or p_name is null or pg_catalog.btrim(p_name) = ''
     or pg_catalog.length(p_name) > 160
     or p_interval_months is null or p_interval_months not between 1 and 120
     or p_channel is null or p_channel not in ('EMAIL', 'SMS', 'NONE')
     or p_is_active is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select rule.* into v_rule
  from public.recall_rules as rule
  where rule.id = p_rule_id and rule.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_rule.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.recall_rules
  set name = pg_catalog.btrim(p_name),
      interval_months = p_interval_months,
      channel = p_channel,
      is_active = p_is_active,
      version = v_rule.version + 1
  where id = p_rule_id and organization_id = v_organization_id
  returning id, public.recall_rules.version into rule_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'RECALL',
    'recall.rule.updated', 'recall_rule', p_rule_id, null, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.update_recall_rule(uuid, uuid, integer, text, integer, text, boolean)
from public, anon, authenticated, service_role;

comment on function public.update_recall_rule(uuid, uuid, integer, text, integer, text, boolean) is
  'Edits a same-tenant recall rule under recall.manage with an optimistic version and audits it atomically.';

create function public.list_recall_rules(
  p_acting_branch_id uuid,
  p_include_inactive boolean default false
)
returns table(
  rule_id uuid,
  name text,
  interval_months integer,
  channel text,
  is_active boolean,
  branch_id uuid,
  version integer
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
     or not private.has_recall_permission_at_branch(
       p_acting_branch_id, 'recall.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select
    rule.id,
    rule.name,
    rule.interval_months,
    rule.channel,
    rule.is_active,
    rule.branch_id,
    rule.version
  from public.recall_rules as rule
  where rule.organization_id = v_organization_id
    and (rule.branch_id is null or rule.branch_id = p_acting_branch_id)
    and (p_include_inactive or rule.is_active)
  order by rule.name, rule.id
  limit 100;
end;
$$;

revoke all on function public.list_recall_rules(uuid, boolean)
from public, anon, authenticated, service_role;

comment on function public.list_recall_rules(uuid, boolean) is
  'Bounded recall-rule projection under recall.manage: clinic-wide rules plus rules scoped to the acting branch; no audit event.';

create function public.create_recall(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_rule_id uuid,
  p_due_date timestamptz default null
)
returns table(recall_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_interval_months integer;
  v_resolved_due_date timestamptz;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_recall_permission_at_branch(
       p_acting_branch_id, 'recall.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or p_rule_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select rule.interval_months into v_interval_months
  from public.recall_rules as rule
  where rule.id = p_rule_id and rule.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_resolved_due_date := coalesce(
    p_due_date,
    pg_catalog.statement_timestamp() + (v_interval_months * interval '1 month')
  );

  insert into public.recalls (
    organization_id, branch_id, patient_id, recall_rule_id, due_date, status, created_by
  ) values (
    v_organization_id, p_acting_branch_id, p_patient_id, p_rule_id,
    v_resolved_due_date, 'SCHEDULED', v_actor_user_id
  ) returning id, public.recalls.version into recall_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'RECALL',
    'recall.created', 'recall', recall_id, p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.create_recall(uuid, uuid, uuid, timestamptz)
from public, anon, authenticated, service_role;

comment on function public.create_recall(uuid, uuid, uuid, timestamptz) is
  'Schedules a SCHEDULED recall for a same-tenant patient under recall.manage, computing due_date from the rule interval when omitted, and audits it atomically.';

create function public.set_recall_opt_out(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_opt_out boolean
)
returns table(patient_id uuid, recall_opt_out boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_recall_permission_at_branch(
       p_acting_branch_id, 'recall.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or p_opt_out is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  insert into public.patient_recall_preferences (organization_id, patient_id, recall_opt_out)
  values (v_organization_id, p_patient_id, p_opt_out)
  on conflict on constraint patient_recall_preferences_pkey
  do update set recall_opt_out = excluded.recall_opt_out
  returning public.patient_recall_preferences.patient_id, public.patient_recall_preferences.recall_opt_out
    into patient_id, recall_opt_out;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'RECALL',
    'recall.preferences.updated', 'patient_recall_preference', p_patient_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.set_recall_opt_out(uuid, uuid, boolean)
from public, anon, authenticated, service_role;

comment on function public.set_recall_opt_out(uuid, uuid, boolean) is
  'Upserts the same-tenant patient recall opt-out preference under recall.manage and audits it atomically; the patient-facing self-service path is deferred.';

create function public.complete_recall(
  p_acting_branch_id uuid,
  p_recall_id uuid,
  p_expected_version integer
)
returns table(recall_id uuid, status text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_recall public.recalls%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_recall_permission_at_branch(
       p_acting_branch_id, 'recall.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_recall_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select recall.* into v_recall
  from public.recalls as recall
  where recall.id = p_recall_id
    and recall.organization_id = v_organization_id
    and recall.branch_id = p_acting_branch_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_recall.status not in ('SCHEDULED', 'OVERDUE') then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_recall.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.recalls
  set status = 'COMPLETED', version = v_recall.version + 1
  where id = p_recall_id and organization_id = v_organization_id
  returning id, public.recalls.status, public.recalls.version into recall_id, status, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'RECALL',
    'recall.completed', 'recall', p_recall_id, v_recall.patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.complete_recall(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.complete_recall(uuid, uuid, integer) is
  'Moves a SCHEDULED or OVERDUE same-branch recall to COMPLETED under recall.manage with an optimistic version and audits it atomically.';

create function public.cancel_recall(
  p_acting_branch_id uuid,
  p_recall_id uuid,
  p_expected_version integer
)
returns table(recall_id uuid, status text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_recall public.recalls%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_recall_permission_at_branch(
       p_acting_branch_id, 'recall.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_recall_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select recall.* into v_recall
  from public.recalls as recall
  where recall.id = p_recall_id
    and recall.organization_id = v_organization_id
    and recall.branch_id = p_acting_branch_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_recall.status not in ('SCHEDULED', 'OVERDUE') then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_recall.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.recalls
  set status = 'CANCELLED', version = v_recall.version + 1
  where id = p_recall_id and organization_id = v_organization_id
  returning id, public.recalls.status, public.recalls.version into recall_id, status, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'RECALL',
    'recall.cancelled', 'recall', p_recall_id, v_recall.patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.cancel_recall(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.cancel_recall(uuid, uuid, integer) is
  'Moves a SCHEDULED or OVERDUE same-branch recall to CANCELLED under recall.manage with an optimistic version and audits it atomically.';

create function public.link_recall_appointment(
  p_acting_branch_id uuid,
  p_recall_id uuid,
  p_expected_version integer,
  p_appointment_id uuid
)
returns table(recall_id uuid, appointment_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_recall public.recalls%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_recall_permission_at_branch(
       p_acting_branch_id, 'recall.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_recall_id is null or p_expected_version is null or p_expected_version < 1
     or p_appointment_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select recall.* into v_recall
  from public.recalls as recall
  where recall.id = p_recall_id
    and recall.organization_id = v_organization_id
    and recall.branch_id = p_acting_branch_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_recall.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if not exists (
    select 1
    from public.appointments as appointment
    where appointment.id = p_appointment_id
      and appointment.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  update public.recalls
  set appointment_id = p_appointment_id, version = v_recall.version + 1
  where id = p_recall_id and organization_id = v_organization_id
  returning id, public.recalls.appointment_id, public.recalls.version
    into recall_id, appointment_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'RECALL',
    'recall.appointment_linked', 'recall', p_recall_id, v_recall.patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.link_recall_appointment(uuid, uuid, integer, uuid)
from public, anon, authenticated, service_role;

comment on function public.link_recall_appointment(uuid, uuid, integer, uuid) is
  'Links a same-branch recall to a same-tenant appointment under recall.manage with an optimistic version while leaving the status unchanged, and audits it atomically.';

create function public.enqueue_recall_reminder(
  p_acting_branch_id uuid,
  p_recall_id uuid,
  p_expected_version integer
)
returns table(recall_id uuid, status text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_recall public.recalls%rowtype;
  v_rule_channel text;
  v_opted_out boolean;
  v_mobile text;
  v_email text;
  v_channel text;
  v_recipient text;
  v_due_label text;
  v_body text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_recall_permission_at_branch(
       p_acting_branch_id, 'recall.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_recall_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select recall.* into v_recall
  from public.recalls as recall
  where recall.id = p_recall_id
    and recall.organization_id = v_organization_id
    and recall.branch_id = p_acting_branch_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_recall.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  -- An individually OPTED_OUT recall skips without enqueuing and without
  -- raising, so the skip is observable and the state stays unchanged.
  if v_recall.status = 'OPTED_OUT' then
    recall_id := v_recall.id;
    status := v_recall.status;
    version := v_recall.version;
    return next;
    return;
  end if;

  if v_recall.status not in ('SCHEDULED', 'OVERDUE') then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  select rule.channel into v_rule_channel
  from public.recall_rules as rule
  where rule.id = v_recall.recall_rule_id and rule.organization_id = v_organization_id;

  select preference.recall_opt_out into v_opted_out
  from public.patient_recall_preferences as preference
  where preference.organization_id = v_organization_id
    and preference.patient_id = v_recall.patient_id;

  -- Skip without enqueuing: the patient preference or a NONE-channel rule
  -- leaves the recall untouched (no increment).
  if coalesce(v_opted_out, false)
     or coalesce(v_rule_channel, 'NONE') = 'NONE' then
    recall_id := v_recall.id;
    status := v_recall.status;
    version := v_recall.version;
    return next;
    return;
  end if;

  select contact.normalized_value into v_mobile
  from public.patient_contacts as contact
  where contact.organization_id = v_organization_id
    and contact.patient_id = v_recall.patient_id
    and contact.contact_type = 'MOBILE'
    and contact.status = 'active'
  order by contact.is_primary desc, contact.created_at, contact.id
  limit 1;

  if v_mobile is null then
    select contact.normalized_value into v_email
    from public.patient_contacts as contact
    where contact.organization_id = v_organization_id
      and contact.patient_id = v_recall.patient_id
      and contact.contact_type = 'EMAIL'
      and contact.status = 'active'
    order by contact.is_primary desc, contact.created_at, contact.id
    limit 1;
  end if;

  if v_mobile is null and v_email is null then
    recall_id := v_recall.id;
    status := v_recall.status;
    version := v_recall.version;
    return next;
    return;
  end if;

  v_channel := case when v_mobile is not null then 'SMS' else 'EMAIL' end;
  v_recipient := coalesce(v_mobile, v_email);
  v_due_label := pg_catalog.to_char(v_recall.due_date, 'YYYY-MM-DD');
  v_body := case v_channel
    when 'SMS' then 'Your dental recall visit is due around ' || v_due_label || '. Please contact the clinic to schedule your appointment.'
    else 'Your dental recall visit is due around ' || v_due_label || '. Please contact the clinic to schedule your appointment.'
  end;

  perform private.enqueue_communication_internal(
    v_organization_id, p_acting_branch_id, v_recall.patient_id, null,
    v_channel, 'REMINDER', v_recipient, v_body,
    'recall-reminder-' || v_recall.id || '-' || v_recall.version,
    pg_catalog.statement_timestamp()
  );

  update public.recalls
  set reminder_sent_at = pg_catalog.statement_timestamp(),
      reminders_sent = v_recall.reminders_sent + 1,
      version = v_recall.version + 1
  where id = p_recall_id and organization_id = v_organization_id
  returning id, public.recalls.status, public.recalls.version into recall_id, status, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'RECALL',
    'recall.reminder_enqueued', 'recall', p_recall_id, v_recall.patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.enqueue_recall_reminder(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.enqueue_recall_reminder(uuid, uuid, integer) is
  'Enqueues a non-clinical REMINDER to the patient primary contact under recall.manage via the Phase 8 internal queue, stamping reminder_sent_at and bumping reminders_sent and version only when actually enqueued; opt-outs and NONE-channel rules skip without change, and the atomic audit event records the enqueue.';

create function public.list_recalls(
  p_acting_branch_id uuid,
  p_patient_id uuid default null,
  p_status text default null
)
returns table(
  recall_id uuid,
  patient_id uuid,
  patient_display_name text,
  recall_rule_id uuid,
  recall_rule_name text,
  due_date timestamptz,
  status text,
  reminders_sent integer,
  reminder_sent_at timestamptz,
  appointment_id uuid,
  version integer
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
     or not private.has_recall_permission_at_branch(
       p_acting_branch_id, 'recall.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_status is not null and p_status not in ('SCHEDULED', 'OVERDUE', 'COMPLETED', 'CANCELLED', 'OPTED_OUT') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_patient_id is not null and not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select
    recall.id,
    recall.patient_id,
    coalesce(
      nullif(pg_catalog.btrim(patient.preferred_name), ''),
      patient.first_name || ' ' || patient.last_name
    ),
    recall.recall_rule_id,
    rule.name,
    recall.due_date,
    case
      when recall.status = 'SCHEDULED' and recall.due_date < pg_catalog.statement_timestamp() then 'OVERDUE'
      else recall.status
    end,
    recall.reminders_sent,
    recall.reminder_sent_at,
    recall.appointment_id,
    recall.version
  from public.recalls as recall
  join public.patients as patient
    on patient.organization_id = recall.organization_id
   and patient.id = recall.patient_id
  join public.recall_rules as rule
    on rule.organization_id = recall.organization_id
   and rule.id = recall.recall_rule_id
  where recall.organization_id = v_organization_id
    and recall.branch_id = p_acting_branch_id
    and (p_patient_id is null or recall.patient_id = p_patient_id)
    and (
      p_status is null
      or (
        p_status = 'OVERDUE'
        and recall.status = 'SCHEDULED'
        and recall.due_date < pg_catalog.statement_timestamp()
      )
      or (
        p_status = 'SCHEDULED'
        and recall.status = 'SCHEDULED'
        and recall.due_date >= pg_catalog.statement_timestamp()
      )
      or (
        p_status in ('COMPLETED', 'CANCELLED', 'OPTED_OUT')
        and recall.status = p_status
      )
    )
  order by recall.due_date, recall.id
  limit 200;
end;
$$;

revoke all on function public.list_recalls(uuid, uuid, text)
from public, anon, authenticated, service_role;

comment on function public.list_recalls(uuid, uuid, text) is
  'Bounded same-branch recall projection under recall.read with optional patient and status filters; overdue is derived (SCHEDULED past due_date) and no audit event is written.';

create function public.get_recall_retention_summary(
  p_acting_branch_id uuid
)
returns table(recall_rule_name text, status text, recall_count bigint)
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
     or not private.has_recall_permission_at_branch(
       p_acting_branch_id, 'recall.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select
    rule.name,
    recall.status,
    pg_catalog.count(*)::bigint
  from public.recalls as recall
  join public.recall_rules as rule
    on rule.organization_id = recall.organization_id
   and rule.id = recall.recall_rule_id
  where recall.organization_id = v_organization_id
    and recall.branch_id = p_acting_branch_id
  group by rule.name, recall.status
  order by rule.name, recall.status
  limit 100;
end;
$$;

revoke all on function public.get_recall_retention_summary(uuid)
from public, anon, authenticated, service_role;

comment on function public.get_recall_retention_summary(uuid) is
  'Bounded aggregate recall counts grouped by rule name and stored status for the acting branch under recall.read; returns no patient rows and writes no audit event.';

create function public.mark_recall_opted_out(
  p_acting_branch_id uuid,
  p_recall_id uuid,
  p_expected_version integer
)
returns table(recall_id uuid, status text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_recall public.recalls%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_recall_permission_at_branch(
       p_acting_branch_id, 'recall.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_recall_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select recall.* into v_recall
  from public.recalls as recall
  where recall.id = p_recall_id
    and recall.organization_id = v_organization_id
    and recall.branch_id = p_acting_branch_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_recall.status not in ('SCHEDULED', 'OVERDUE') then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_recall.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.recalls
  set status = 'OPTED_OUT', version = v_recall.version + 1
  where id = p_recall_id and organization_id = v_organization_id
  returning id, public.recalls.status, public.recalls.version into recall_id, status, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'RECALL',
    'recall.opted_out', 'recall', p_recall_id, v_recall.patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.mark_recall_opted_out(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.mark_recall_opted_out(uuid, uuid, integer) is
  'Moves a SCHEDULED or OVERDUE same-branch recall to OPTED_OUT under recall.manage with an optimistic version and audits it atomically.';

-- Completed treatment creates recall: firing on the P14 clinical encounter
-- finalize transition, this inserts a SCHEDULED recall for every active recall
-- rule that is clinic-wide or scoped to the encounter's branch. The trigger is
-- the automation path only; manual scheduling flows through create_recall.
create or replace function private.recall_after_encounter_finalize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.recall_rules%rowtype;
begin
  for v_rule in
    select rule.*
    from public.recall_rules as rule
    where rule.organization_id = new.organization_id
      and rule.is_active
      and (rule.branch_id is null or rule.branch_id = new.branch_id)
  loop
    insert into public.recalls (
      organization_id, branch_id, patient_id, recall_rule_id, due_date, status
    ) values (
      new.organization_id, new.branch_id, new.patient_id, v_rule.id,
      pg_catalog.statement_timestamp() + (v_rule.interval_months * interval '1 month'),
      'SCHEDULED'
    );
  end loop;

  return new;
end;
$$;

revoke all on function private.recall_after_encounter_finalize()
from public, anon, authenticated, service_role;

comment on function private.recall_after_encounter_finalize() is
  'Creates a SCHEDULED recall for each active matching recall rule when a clinical encounter transitions to FINALIZED; automation writes no audit event.';

create trigger clinical_encounters_recall_after_finalize
after update of status on public.clinical_encounters
for each row
when (new.status = 'FINALIZED' and old.status <> 'FINALIZED')
execute function private.recall_after_encounter_finalize();