-- B6 forward correction for appointment/provider authority and PDC principal.
-- The original B6 migrations were already applied locally; this recreates the
-- affected functions without rewriting ledger history.

create or replace function public.post_charge(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_procedure_id uuid,
  p_treatment_plan_item_id uuid,
  p_amount_centavos bigint,
  p_appointment_id uuid,
  p_non_clinical boolean,
  p_zero_amount_reason text,
  p_idempotency_key text
)
returns table(charge_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_actor_provider uuid;
  v_provider_id uuid;
  v_service_date date;
  v_appointment_patient uuid;
  v_appointment_branch uuid;
  v_appointment_starts timestamptz;
  v_assigned_provider uuid;
  v_new_charge_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.charge') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (select 1 from public.patients as patient
                 where patient.id = p_patient_id and patient.organization_id = v_organization_id) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_amount_centavos < 0 or p_amount_centavos > 99999999999
     or (p_amount_centavos = 0 and not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.adjust'))
     or (p_amount_centavos = 0 and (p_zero_amount_reason is null or btrim(p_zero_amount_reason) = '' or length(p_zero_amount_reason) > 500))
     or (p_non_clinical and p_procedure_id is not null)
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_procedure_id is not null and not exists (
    select 1 from public.procedures as procedure
    where procedure.id = p_procedure_id and procedure.organization_id = v_organization_id
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_treatment_plan_item_id is not null and not exists (
    select 1 from public.treatment_plan_items as item
    join public.treatment_plans as plan on plan.id = item.plan_id and plan.organization_id = item.organization_id
    where item.id = p_treatment_plan_item_id and item.organization_id = v_organization_id
      and plan.patient_id = p_patient_id
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_appointment_id is not null then
    select appointment.patient_id, appointment.branch_id, appointment.starts_at
      into v_appointment_patient, v_appointment_branch, v_appointment_starts
    from public.appointments as appointment
    where appointment.id = p_appointment_id and appointment.organization_id = v_organization_id
      and appointment.encounter_status = 'COMPLETED';
    if v_appointment_patient is null or v_appointment_patient <> p_patient_id or v_appointment_branch <> p_acting_branch_id then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_service_date := v_appointment_starts::date;
  else
    v_service_date := statement_timestamp()::date;
  end if;

  if p_non_clinical then
    v_provider_id := null;
  else
    v_actor_provider := private.resolve_actor_provider(v_organization_id);
    if v_actor_provider is not null and p_appointment_id is not null then
      if not exists (
        select 1 from public.appointment_providers as assignment
        where assignment.organization_id = v_organization_id
          and assignment.appointment_id = p_appointment_id
          and assignment.provider_id = v_actor_provider
          and assignment.assignment_status = 'ASSIGNED'
      ) then
        raise insufficient_privilege using message = 'not authorized';
      end if;
      v_provider_id := v_actor_provider;
    elsif v_actor_provider is not null and exists (
      select 1 from public.provider_branches as provider_branch
      where provider_branch.organization_id = v_organization_id
        and provider_branch.provider_id = v_actor_provider
        and provider_branch.branch_id = p_acting_branch_id
        and provider_branch.is_active
    ) then
      v_provider_id := v_actor_provider;
    else
      if p_appointment_id is null then
        raise insufficient_privilege using message = 'not authorized';
      end if;
      select assignment.provider_id into v_assigned_provider
      from public.appointment_providers as assignment
      where assignment.organization_id = v_organization_id
        and assignment.appointment_id = p_appointment_id
        and assignment.assignment_status = 'ASSIGNED'
      order by assignment.id
      limit 2;
      if v_assigned_provider is null or exists (
        select 1 from public.appointment_providers as assignment
        where assignment.organization_id = v_organization_id
          and assignment.appointment_id = p_appointment_id
          and assignment.assignment_status = 'ASSIGNED'
          and assignment.provider_id <> v_assigned_provider
      ) then
        raise insufficient_privilege using message = 'not authorized';
      end if;
      v_provider_id := v_assigned_provider;
    end if;
  end if;

  insert into public.charges (
    organization_id, patient_id, branch_id, provider_id, procedure_id,
    treatment_plan_item_id, amount_centavos, service_date, zero_amount_reason,
    non_clinical, idempotency_key, created_by
  ) values (
    v_organization_id, p_patient_id, p_acting_branch_id, v_provider_id, p_procedure_id,
    p_treatment_plan_item_id, p_amount_centavos, v_service_date,
    case when p_amount_centavos = 0 then btrim(p_zero_amount_reason) else null end,
    p_non_clinical, p_idempotency_key, v_actor
  ) returning id into v_new_charge_id;

  perform private.record_billing_audit(
    v_organization_id, p_acting_branch_id, 'billing.charge.posted', 'charge',
    v_new_charge_id, p_patient_id,
    jsonb_build_object('charge_id', v_new_charge_id::text, 'procedure_id', p_procedure_id,
      'treatment_plan_item_id', p_treatment_plan_item_id, 'provider_id', v_provider_id,
      'service_date', v_service_date::text, 'idempotency_key', p_idempotency_key)
  );

  return query select v_new_charge_id;
end;
$$;

revoke all on function public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)
from public, anon, authenticated, service_role;

create or replace function public.clear_postdated_cheque(
  p_acting_branch_id uuid,
  p_cheque_id uuid,
  p_idempotency_key text
)
returns table(payment_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_cheque public.postdated_cheques%rowtype;
  v_method_id uuid;
  v_new_payment_id uuid;
  r_proposed record;
  v_proposed_sum bigint := 0;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';
  if v_organization_id is null or v_actor is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  select cheque.* into v_cheque from public.postdated_cheques as cheque
  where cheque.id = p_cheque_id and cheque.organization_id = v_organization_id for update;
  if not found then raise insufficient_privilege using message = 'not authorized'; end if;
  if not private.has_billing_permission_at_branch(v_cheque.branch_id, 'payment.record') then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if v_cheque.status <> 'DEPOSITED' then raise exception using errcode = 'P0001', message = 'invalid state'; end if;

  for r_proposed in
    select proposed.charge_id, proposed.amount_centavos,
           private.charge_due(proposed.charge_id, v_organization_id) as due
    from public.postdated_cheque_allocations as proposed
    where proposed.cheque_id = p_cheque_id and proposed.organization_id = v_organization_id
    order by proposed.id for update of proposed
  loop
    if r_proposed.amount_centavos > r_proposed.due
       or not private.has_billing_permission_at_branch((select branch_id from public.charges where id = r_proposed.charge_id), 'payment.record') then
      raise exception using errcode = 'P0001', message = 'stale proposed coverage';
    end if;
    v_proposed_sum := v_proposed_sum + r_proposed.amount_centavos;
  end loop;
  if v_proposed_sum > v_cheque.amount_centavos then raise exception using errcode = 'P0001', message = 'stale proposed coverage'; end if;
  select id into v_method_id from public.payment_methods
  where organization_id = v_organization_id and code = 'CHEQUE' and active;
  if v_method_id is null then raise exception using errcode = 'P0001', message = 'invalid state'; end if;

  insert into public.payments (
    organization_id, patient_id, branch_id, payment_method_id, amount_centavos,
    reference, received_by, postdated_cheque_id, idempotency_key
  ) values (
    v_organization_id, v_cheque.patient_id, v_cheque.branch_id, v_method_id,
    v_cheque.amount_centavos, null, v_actor, p_cheque_id, p_idempotency_key
  ) returning id into v_new_payment_id;
  for r_proposed in
    select proposed.charge_id, proposed.amount_centavos
    from public.postdated_cheque_allocations as proposed
    where proposed.cheque_id = p_cheque_id and proposed.organization_id = v_organization_id
    order by proposed.id
  loop
    insert into public.payment_allocations (
      organization_id, payment_id, charge_id, patient_id, amount_centavos, allocated_by, idempotency_key
    ) values (
      v_organization_id, v_new_payment_id, r_proposed.charge_id, v_cheque.patient_id,
      r_proposed.amount_centavos, v_actor, 'clear-alloc-' || v_new_payment_id::text || '-' || r_proposed.charge_id::text
    );
    perform private.sync_charge_earnings(v_organization_id, r_proposed.charge_id, 'REALLOCATION');
  end loop;
  insert into public.postdated_cheque_status_events (
    organization_id, cheque_id, from_status, to_status, actor, reason, idempotency_key
  ) values (
    v_organization_id, p_cheque_id, v_cheque.status, 'CLEARED', v_actor, 'cleared', 'clear-event-' || p_idempotency_key
  );
  perform private.record_billing_audit(
    v_organization_id, v_cheque.branch_id, 'billing.pdc.cleared', 'postdated_cheque',
    p_cheque_id, v_cheque.patient_id,
    jsonb_build_object('cheque_id', p_cheque_id::text, 'payment_id', v_new_payment_id::text, 'idempotency_key', p_idempotency_key)
  );
  return query select v_new_payment_id;
end;
$$;

revoke all on function public.clear_postdated_cheque(uuid,uuid,text)
from public, anon, authenticated, service_role;
