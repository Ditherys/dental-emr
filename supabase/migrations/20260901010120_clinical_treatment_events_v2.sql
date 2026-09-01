-- Unified Clinical Chart workspace, task 6: the treatment-event boundary.
--
-- One server-side transaction obtains its encounter from
-- public.start_or_resume_clinical_visit, creates or locks the procedure case,
-- creates the dated performed / follow-up / completion record, links the exact
-- active findings being resolved, confirms one immutable charge for a new case,
-- optionally records and allocates an immediate payment and an installment
-- schedule, and appends an audit event. Any failure rolls the whole transaction
-- back, so a rejected payload can never leave a charge, a case, a clinical
-- entry, or a payment behind.
--
-- Charge immutability. A confirmed charge is never rewritten here: the function
-- contains no UPDATE of public.charges, and public.charges itself carries the
-- charges_append_only trigger. A case receives at most one charge — the
-- procedure_cases_organization_charge_key unique constraint is the backstop and
-- an explicit in-transaction check is the first line of defence. Corrections
-- after confirmation use the existing adjustment / void ledger workflow.
--
-- Reuse, not duplication. post_charge, record_payment, allocate_payment,
-- create_procedure_installment_schedule and complete_treatment_case remain the
-- only writers of their own domains, so their reviewed authorization rules are
-- inherited rather than restated.
--
-- Forward-only and non-destructive: no existing row, function body, policy or
-- historical clinical or financial record is rewritten.

create table private.clinical_treatment_event_idempotency (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  request_fingerprint text not null,
  procedure_case_id uuid,
  result jsonb,
  created_at timestamptz not null default statement_timestamp(),
  primary key (organization_id, actor_user_id, idempotency_key),
  constraint clinical_treatment_event_idempotency_case_fk
    foreign key (organization_id, procedure_case_id)
    references public.procedure_cases (organization_id, id) on delete restrict
);

revoke all on table private.clinical_treatment_event_idempotency
from public, anon, authenticated, service_role;

comment on table private.clinical_treatment_event_idempotency is
  'Actor-scoped request keys for the treatment-event boundary. A replayed key returns the stored result instead of confirming a second charge; the same key with a different payload is refused outright. Never readable by a browser role.';

create function public.record_treatment_event_v2(
  p_branch_id uuid,
  p_patient_id uuid,
  p_procedure_id uuid,
  p_plan_item_id uuid,
  p_existing_case_id uuid,
  p_expected_case_version integer,
  p_event_kind text,
  p_service_date date,
  p_resolved_finding_ids uuid[],
  p_clinical_detail jsonb,
  p_charge_amount_centavos bigint,
  p_immediate_payment jsonb,
  p_installment_schedule jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_provider_id uuid;
  v_clinical_date date;
  v_encounter_id uuid;
  v_case public.procedure_cases%rowtype;
  v_item public.treatment_plan_items%rowtype;
  v_plan_patient uuid;
  v_case_status text;
  v_case_version integer;
  v_charge_id uuid;
  v_charge_amount bigint;
  v_charge_confirmed boolean := false;
  v_delegated boolean := false;
  v_event_id uuid;
  v_event_type text;
  v_entry_status text;
  v_findings uuid[];
  v_finding_count integer;
  v_detail jsonb;
  v_detail_code text;
  v_clinical_code text;
  v_writes_detail boolean := false;
  v_tooth_codes text[] := '{}';
  v_surfaces text[] := '{}';
  v_seen_teeth text[] := '{}';
  v_seen_surfaces text[] := '{}';
  v_surface_count integer;
  v_note text;
  v_occurred_at timestamptz;
  v_entry_ids uuid[] := '{}';
  v_entry_id uuid;
  v_tooth text;
  v_surface text;
  v_payment_amount bigint;
  v_payment_method uuid;
  v_payment_reference text;
  v_payment_date date;
  v_payment_id uuid;
  v_allocation_id uuid;
  v_schedule jsonb;
  v_schedule_id uuid;
  v_paid bigint;
  v_due bigint;
  v_completion_charge uuid;
  v_completion_entry uuid;
  v_fingerprint text;
  v_stored private.clinical_treatment_event_idempotency%rowtype;
  v_result jsonb;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- `coalesce`, `nullif`, `any`, `array[]` and `array()` are SQL constructs
  -- resolved by the parser, not schema-resolved function names, so an empty
  -- search_path cannot capture them. Every genuine function reference below is
  -- schema-qualified.
  if p_patient_id is null or p_procedure_id is null or p_idempotency_key is null
     or p_service_date is null
     or p_event_kind is null
     or p_event_kind not in ('STARTED', 'PERFORMED', 'FOLLOW_UP', 'COMPLETED')
     or p_clinical_detail is null
     or pg_catalog.jsonb_typeof(p_clinical_detail) <> 'object'
     or pg_catalog.pg_column_size(p_clinical_detail) > 8192
     or coalesce(pg_catalog.cardinality(p_resolved_finding_ids), 0) > 32 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- Lifecycle contract. A new case is opened by a STARTED / PERFORMED /
  -- COMPLETED event and always requires an explicitly confirmed charge; it may
  -- not claim an expected version, and it may not claim a plan item, because a
  -- plan item's case is opened by the plan workflow and completed through the
  -- immutable-design boundary below. An existing case accepts FOLLOW_UP or
  -- COMPLETED only.
  if p_existing_case_id is null then
    if p_event_kind = 'FOLLOW_UP'
       or p_expected_case_version is not null
       or p_plan_item_id is not null
       or p_charge_amount_centavos is null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  elsif p_event_kind in ('STARTED', 'PERFORMED')
        or p_expected_case_version is null
        or p_expected_case_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_charge_amount_centavos is not null
     and (p_charge_amount_centavos < 1 or p_charge_amount_centavos > 99999999999) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- The Philippine clinical date is re-derived here. A browser value is only
  -- ever a service date at or before today; it can never move the visit, which
  -- derives its own date.
  v_clinical_date :=
    (pg_catalog.timezone('Asia/Manila', pg_catalog.statement_timestamp()))::date;
  if p_service_date > v_clinical_date or p_service_date < v_clinical_date - 36525 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if (p_clinical_detail - 'toothCodes' - 'surfaces' - 'detail' - 'note') <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(p_clinical_detail->'toothCodes') <> 'array'
     or pg_catalog.jsonb_typeof(p_clinical_detail->'detail') <> 'object'
     or (p_clinical_detail ? 'surfaces'
         and pg_catalog.jsonb_typeof(p_clinical_detail->'surfaces') <> 'array')
     or (p_clinical_detail ? 'note'
         and pg_catalog.jsonb_typeof(p_clinical_detail->'note') <> 'string') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_tooth_codes := array(select pg_catalog.jsonb_array_elements_text(p_clinical_detail->'toothCodes'));
  if p_clinical_detail ? 'surfaces' then
    v_surfaces := array(select pg_catalog.jsonb_array_elements_text(p_clinical_detail->'surfaces'));
  end if;
  v_detail := p_clinical_detail->'detail';
  v_detail_code := v_detail->>'code';
  v_note := nullif(pg_catalog.btrim(coalesce(p_clinical_detail->>'note', '')), '');
  v_surface_count := coalesce(pg_catalog.array_length(v_surfaces, 1), 0);

  if coalesce(pg_catalog.array_length(v_tooth_codes, 1), 0) not between 1 and 32
     or v_surface_count > 7
     or coalesce(pg_catalog.length(v_note), 0) > 2000 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- The treatment vocabulary is bounded by the live tooth_clinical_entry_details
  -- CHECK constraints and by the (organization_id, entry_id, feature_code) ->
  -- (organization_id, id, clinical_code) foreign key, which forces a detail
  -- row's feature code to equal its entry's clinical code. A treatment whose
  -- canonical code has no matching feature code carries no detail row at all,
  -- exactly as public.complete_treatment_case models a planned extraction.
  if v_detail_code = 'RESTORATION' then
    v_clinical_code := 'RESTORATION';
    v_writes_detail := true;
    if v_surface_count < 1 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  elsif v_detail_code = 'ROOT_CANAL' then
    v_clinical_code := 'ROOT_CANAL';
    v_writes_detail := true;
    if v_surface_count <> 0 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  elsif v_detail_code = 'ORTHODONTIC' then
    v_clinical_code := 'ORTHODONTIC';
    v_writes_detail := true;
    if v_surface_count <> 0 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  elsif v_detail_code = 'OTHER' then
    v_clinical_code := 'OTHER';
    v_writes_detail := true;
  elsif v_detail_code = 'SEALANT' then
    v_clinical_code := 'SEALANT';
    if v_detail <> '{"code": "SEALANT"}'::jsonb or v_surface_count < 1 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  elsif v_detail_code = 'IMPLANT' then
    v_clinical_code := 'IMPLANT';
    if v_detail <> '{"code": "IMPLANT"}'::jsonb or v_surface_count <> 0 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  elsif v_detail_code = 'TOOTH_STATE' and v_detail->>'state' = 'EXTRACTION_WOUND' then
    v_clinical_code := 'EXTRACTION';
    if v_surface_count <> 0 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  else
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- Detail contents are validated here, before any financial or clinical write,
  -- so an unusable material, root-canal state or appliance is refused rather
  -- than reaching a CHECK constraint after post_charge has already run.
  if v_writes_detail then
    if v_detail_code = 'RESTORATION' then
      if (v_detail - 'code' - 'restorationType' - 'material' - 'marginalLeakage') <> '{}'::jsonb
         or not (v_detail ?& array['code', 'restorationType', 'material', 'marginalLeakage'])
         or v_detail->>'restorationType' not in ('none', 'crown', 'inlay', 'onlay', 'veneer', 'bridge')
         or v_detail->>'material' not in (
           'none', 'emax', 'gold', 'gradia', 'zircon', 'metal', 'metal-ceramic',
           'telescope', 'temporary', 'amalgam', 'composite', 'gic'
         )
         or pg_catalog.jsonb_typeof(v_detail->'marginalLeakage') <> 'boolean' then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
    elsif v_detail_code = 'ROOT_CANAL' then
      if (v_detail - 'code' - 'state') <> '{}'::jsonb
         or v_detail->>'state' not in (
           'endo-medical-filling', 'endo-filling', 'endo-filling-incomplete',
           'endo-glass-pin', 'endo-metal-pin'
         ) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
    elsif v_detail_code = 'ORTHODONTIC' then
      if (v_detail - 'code' - 'appliance' - 'movement') <> '{}'::jsonb
         or not (v_detail ?& array['code', 'appliance', 'movement'])
         or v_detail->>'appliance' not in ('BRACKET', 'BAND')
         or (pg_catalog.jsonb_typeof(v_detail->'movement') <> 'null'
             and v_detail->>'movement' not in ('DRIFT', 'INTRUSION', 'EXTRUSION', 'ROTATION')) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
    else
      if (v_detail - 'code' - 'controlledCode') <> '{}'::jsonb
         or pg_catalog.jsonb_typeof(v_detail->'controlledCode') <> 'string'
         or pg_catalog.length(v_detail->>'controlledCode') not between 1 and 100
         or v_detail->>'controlledCode' <> pg_catalog.btrim(v_detail->>'controlledCode') then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
    end if;
  end if;

  foreach v_surface in array v_surfaces loop
    if v_surface is null
       or v_surface not in ('O', 'B', 'L', 'M', 'D', 'I', 'F')
       or v_surface = any(v_seen_surfaces) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_seen_surfaces := pg_catalog.array_append(v_seen_surfaces, v_surface);
  end loop;

  foreach v_tooth in array v_tooth_codes loop
    if v_tooth is null
       or v_tooth !~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
       or v_tooth = any(v_seen_teeth) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    -- The second FDI digit is the position in the arch: 1-3 anterior, 4-8
    -- posterior. An occlusal table exists only on a posterior tooth and an
    -- incisal edge only on an anterior one.
    if pg_catalog.substr(v_tooth, 2, 1) in ('1', '2', '3') then
      if 'O' = any(v_seen_surfaces) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
    elsif 'I' = any(v_seen_surfaces) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_seen_teeth := pg_catalog.array_append(v_seen_teeth, v_tooth);
  end loop;

  v_findings := coalesce(p_resolved_finding_ids, '{}'::uuid[]);
  if coalesce(pg_catalog.cardinality(v_findings), 0)
     <> coalesce(pg_catalog.cardinality(
          array(select distinct finding from pg_catalog.unnest(v_findings) as finding)
        ), 0) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- An immediate payment is recorded and allocated by the reviewed billing
  -- boundary, which stamps its own receipt time. The submitted payment date is
  -- therefore required to be today's clinical date rather than stored, so the
  -- ledger never carries a date the payment does not actually have.
  if p_immediate_payment is not null then
    if pg_catalog.jsonb_typeof(p_immediate_payment) <> 'object'
       or (p_immediate_payment - 'paymentMethodId' - 'amountCentavos' - 'paymentDate' - 'reference') <> '{}'::jsonb
       or not (p_immediate_payment ?& array['paymentMethodId', 'amountCentavos', 'paymentDate'])
       or pg_catalog.jsonb_typeof(p_immediate_payment->'paymentMethodId') <> 'string'
       or (p_immediate_payment->>'paymentMethodId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (p_immediate_payment->>'amountCentavos') !~ '^[1-9][0-9]{0,10}$'
       or (p_immediate_payment->>'paymentDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or (p_immediate_payment ? 'reference'
           and (pg_catalog.jsonb_typeof(p_immediate_payment->'reference') <> 'string'
                or pg_catalog.length(pg_catalog.btrim(p_immediate_payment->>'reference')) not between 1 and 80)) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_payment_method := (p_immediate_payment->>'paymentMethodId')::uuid;
    v_payment_amount := (p_immediate_payment->>'amountCentavos')::bigint;
    v_payment_date := (p_immediate_payment->>'paymentDate')::date;
    v_payment_reference := nullif(pg_catalog.btrim(coalesce(p_immediate_payment->>'reference', '')), '');
    if v_payment_date <> v_clinical_date then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if not private.has_billing_permission_at_branch(p_branch_id, 'payment.record') then
      raise insufficient_privilege using message = 'not authorized';
    end if;
  end if;

  -- An installment schedule is an expectation set for a charged case. The
  -- allocation ledger remains the balance authority, and the item shapes are
  -- validated by public.create_procedure_installment_schedule itself.
  if p_installment_schedule is not null then
    if p_charge_amount_centavos is null
       or pg_catalog.jsonb_typeof(p_installment_schedule) <> 'array'
       or pg_catalog.jsonb_array_length(p_installment_schedule) not between 1 and 120 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if not private.has_billing_permission_at_branch(p_branch_id, 'payment.record') then
      raise insufficient_privilege using message = 'not authorized';
    end if;
  end if;

  if p_charge_amount_centavos is not null
     and not private.has_billing_permission_at_branch(p_branch_id, 'billing.charge') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1
    from public.procedures as procedure
    where procedure.id = p_procedure_id
      and procedure.organization_id = v_organization_id
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- Request lock in its own key space (seed 3), always taken before the managed
  -- visit's request-key lock (seed 1), its identity lock (seed 0), and the
  -- billing helpers' own request locks. Lock ordering is therefore structural
  -- for every caller, so a duplicated in-flight submission serializes without
  -- any possibility of a cycle.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_actor_user_id::text || ':'
        || p_idempotency_key::text,
      3
    )
  );

  v_fingerprint := pg_catalog.md5(
    p_branch_id::text || '|' || p_patient_id::text || '|' || p_procedure_id::text || '|'
      || coalesce(p_plan_item_id::text, '') || '|' || coalesce(p_existing_case_id::text, '') || '|'
      || coalesce(p_expected_case_version::text, '') || '|' || p_event_kind || '|'
      || p_service_date::text || '|'
      || coalesce(pg_catalog.array_to_string(v_findings, ','), '') || '|'
      || p_clinical_detail::text || '|' || coalesce(p_charge_amount_centavos::text, '') || '|'
      || coalesce(p_immediate_payment::text, '') || '|'
      || coalesce(p_installment_schedule::text, '')
  );

  insert into private.clinical_treatment_event_idempotency (
    organization_id, actor_user_id, idempotency_key, request_fingerprint
  ) values (
    v_organization_id, v_actor_user_id, p_idempotency_key, v_fingerprint
  ) on conflict do nothing;

  select * into v_stored
  from private.clinical_treatment_event_idempotency as request
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.idempotency_key = p_idempotency_key
  for update;

  -- One request key belongs to exactly one submitted treatment. The browser
  -- derives its key from a hash of the submitted facts, so an edited retry
  -- arrives under a different key; a same-key different-payload request is a
  -- programming error or an attack and is refused rather than replayed.
  if v_stored.request_fingerprint is distinct from v_fingerprint then
    raise exception using errcode = 'P0001', message = 'idempotency conflict';
  end if;

  if v_stored.result is not null then
    return pg_catalog.jsonb_set(v_stored.result, '{replayed}', 'true'::jsonb);
  end if;

  select visit.encounter_id into v_encounter_id
  from public.start_or_resume_clinical_visit(
    p_branch_id, p_patient_id, null, p_idempotency_key
  ) as visit;

  if v_encounter_id is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_provider_id := private.require_active_actor_provider(
    v_organization_id, p_branch_id, v_actor_user_id
  );

  if p_existing_case_id is not null then
    select * into v_case
    from public.procedure_cases as procedure_case
    where procedure_case.organization_id = v_organization_id
      and procedure_case.id = p_existing_case_id
    for update;

    if not found or v_case.patient_id <> p_patient_id then
      raise insufficient_privilege using message = 'not authorized';
    end if;
    if v_case.version <> p_expected_case_version then
      raise exception using errcode = 'P0001', message = 'stale version';
    end if;
    if v_case.status <> 'OPEN' then
      raise exception using errcode = 'P0001', message = 'invalid state';
    end if;
    if v_case.procedure_id <> p_procedure_id
       or p_plan_item_id is distinct from v_case.treatment_plan_item_id then
      raise invalid_parameter_value using message = 'invalid input';
    end if;

    if p_plan_item_id is not null then
      select item.* into v_item
      from public.treatment_plan_items as item
      where item.organization_id = v_organization_id and item.id = p_plan_item_id
      for key share;
      if not found then
        raise insufficient_privilege using message = 'not authorized';
      end if;
      select plan.patient_id into v_plan_patient
      from public.treatment_plans as plan
      where plan.organization_id = v_organization_id and plan.id = v_item.plan_id
      for key share;
      if v_plan_patient is distinct from p_patient_id
         or v_item.procedure_id is distinct from p_procedure_id then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
    end if;

    -- A confirmed charge is never replaced. The only charge an existing case may
    -- receive is its first one, and only through the plan workflow's own
    -- immutable-design completion boundary.
    if p_charge_amount_centavos is not null then
      if v_case.charge_id is not null then
        raise invalid_parameter_value using message = 'charge already confirmed';
      end if;
      if p_plan_item_id is null
         or p_event_kind <> 'COMPLETED'
         or v_item.tooth_code is null
         or v_tooth_codes <> array[v_item.tooth_code]
         -- public.complete_treatment_case stamps its own occurrence time, so a
         -- backdated plan completion is refused rather than recorded under a
         -- service date the row does not carry.
         or p_service_date <> v_clinical_date then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
      v_delegated := true;
    end if;
  end if;

  if v_delegated then
    -- Reuse, do not re-implement. public.complete_treatment_case owns the
    -- immutable materialization-contract validation added by 20260830010427 and
    -- 20260830010428, posts the one charge through public.post_charge,
    -- materializes the clinical entry, resolves the named findings, advances the
    -- plan execution and closes the case. Restating any of that here would
    -- create a second, contract-bypassable plan completion path.
    select completion.charge_id, completion.clinical_entry_id
      into v_completion_charge, v_completion_entry
    from public.complete_treatment_case(
      p_branch_id, p_existing_case_id, p_plan_item_id, p_expected_case_version,
      v_findings, p_charge_amount_centavos, v_detail,
      'treatment-event-' || p_idempotency_key::text
    ) as completion;

    v_charge_id := v_completion_charge;
    v_charge_confirmed := true;
    if v_completion_entry is not null then
      v_entry_ids := pg_catalog.array_append(v_entry_ids, v_completion_entry);
    end if;

    select procedure_case.status, procedure_case.version
      into v_case_status, v_case_version
    from public.procedure_cases as procedure_case
    where procedure_case.organization_id = v_organization_id
      and procedure_case.id = v_case.id;

    select event.id into v_event_id
    from public.procedure_case_events as event
    where event.organization_id = v_organization_id
      and event.procedure_case_id = v_case.id
      and event.event_type = 'COMPLETION'
    order by event.recorded_at desc, event.id desc
    limit 1;
  else
    if p_existing_case_id is null then
      select posted.charge_id into v_charge_id
      from public.post_charge(
        p_branch_id, p_patient_id, p_procedure_id, null, p_charge_amount_centavos,
        null, false, null, 'treatment-event-' || p_idempotency_key::text
      ) as posted;
      v_charge_confirmed := true;

      insert into public.procedure_cases (
        organization_id, patient_id, origin_branch_id, procedure_id, charge_id, opened_by
      ) values (
        v_organization_id, p_patient_id, p_branch_id, p_procedure_id, v_charge_id,
        v_actor_user_id
      ) returning * into v_case;
    end if;

    v_entry_status := case
      when p_event_kind in ('PERFORMED', 'COMPLETED') then 'COMPLETED'
      else 'ACTIVE'
    end;
    v_occurred_at :=
      pg_catalog.timezone('Asia/Manila', (p_service_date + time '12:00'));

    foreach v_tooth in array v_seen_teeth loop
      insert into public.tooth_clinical_entries (
        organization_id, patient_id, tooth_code, kind, clinical_code, status,
        lifecycle, provenance, notes, recorded_by, recorded_at, effective_at,
        completed_at, treating_provider_id, encounter_id, charge_id,
        treatment_plan_item_id, version
      ) values (
        v_organization_id, p_patient_id, v_tooth, 'TREATMENT', v_clinical_code,
        v_entry_status, 'OPEN', 'INTERNAL', v_note, v_actor_user_id, v_occurred_at,
        v_occurred_at,
        case when v_entry_status = 'COMPLETED' then v_occurred_at end,
        v_provider_id, v_encounter_id,
        -- Only the event that confirms the charge links its entries to it. A
        -- later follow-up on the same case adds no second financial link.
        case when v_charge_confirmed then v_charge_id end,
        v_case.treatment_plan_item_id, 1
      ) returning id into v_entry_id;

      foreach v_surface in array v_seen_surfaces loop
        insert into public.tooth_clinical_entry_surfaces (
          organization_id, entry_id, surface, ordinal
        ) values (v_organization_id, v_entry_id, v_surface, 1);
      end loop;

      if v_writes_detail then
        insert into public.tooth_clinical_entry_details (
          organization_id, entry_id, feature_code, detail
        ) values (v_organization_id, v_entry_id, v_clinical_code, v_detail);
      end if;

      v_entry_ids := pg_catalog.array_append(v_entry_ids, v_entry_id);
    end loop;

    -- Exact resolution. A named finding must be an open, active finding for this
    -- patient on a tooth this event actually treats, and it is linked to the
    -- treatment entry created for that same tooth. Another caries on another
    -- tooth, and an unnamed finding on the same tooth, both stay active.
    if pg_catalog.cardinality(v_findings) > 0 then
      select pg_catalog.count(*)::integer into v_finding_count
      from public.tooth_clinical_entries as finding
      where finding.organization_id = v_organization_id
        and finding.patient_id = p_patient_id
        and finding.id = any(v_findings)
        and finding.kind = 'FINDING'
        and finding.lifecycle = 'OPEN'
        and finding.status = 'ACTIVE'
        and finding.tooth_code = any(v_seen_teeth)
        and not exists (
          select 1
          from public.procedure_case_finding_resolutions as resolution
          where resolution.organization_id = v_organization_id
            and resolution.finding_entry_id = finding.id
        );
      if v_finding_count <> pg_catalog.cardinality(v_findings) then
        raise invalid_parameter_value using message = 'invalid finding resolution';
      end if;

      insert into public.procedure_case_finding_resolutions (
        organization_id, procedure_case_id, finding_entry_id, clinical_entry_id,
        resolved_by
      )
      select v_organization_id, v_case.id, finding.id, entry.id, v_actor_user_id
      from public.tooth_clinical_entries as finding
      join public.tooth_clinical_entries as entry
        on entry.organization_id = v_organization_id
       and entry.id = any(v_entry_ids)
       and entry.tooth_code = finding.tooth_code
      where finding.organization_id = v_organization_id
        and finding.id = any(v_findings);
    end if;

    v_event_type := case p_event_kind
      when 'FOLLOW_UP' then 'FOLLOW_UP'
      when 'COMPLETED' then 'COMPLETION'
      else 'TREATMENT'
    end;

    insert into public.procedure_case_events (
      organization_id, procedure_case_id, event_type, occurred_at, recorded_by, notes
    ) values (
      v_organization_id, v_case.id, v_event_type, v_occurred_at, v_actor_user_id,
      v_note
    ) returning id into v_event_id;

    -- Only COMPLETED closes the case. Every recorded event advances the case
    -- version, which is the optimistic-concurrency token the next event carries.
    update public.procedure_cases as procedure_case
    set status = case when p_event_kind = 'COMPLETED' then 'COMPLETED' else procedure_case.status end,
        version = procedure_case.version + 1
    where procedure_case.organization_id = v_organization_id
      and procedure_case.id = v_case.id
    returning procedure_case.status, procedure_case.version, procedure_case.charge_id
    into v_case_status, v_case_version, v_charge_id;
  end if;

  if p_immediate_payment is not null then
    if v_charge_id is null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    select recorded.payment_id into v_payment_id
    from public.record_payment(
      p_branch_id, p_patient_id, v_payment_method, v_payment_amount,
      v_payment_reference, 'treatment-event-pay-' || p_idempotency_key::text
    ) as recorded;

    -- The allocation names this case's own charge and nothing else, so paying
    -- one procedure can never move another procedure's balance.
    select allocated.allocation_id into v_allocation_id
    from public.allocate_payment(
      p_branch_id, v_payment_id, v_charge_id, p_patient_id, v_payment_amount,
      'treatment-event-alloc-' || p_idempotency_key::text
    ) as allocated;
  end if;

  if p_installment_schedule is not null then
    v_schedule := public.create_procedure_installment_schedule(
      p_branch_id, v_case.id, p_installment_schedule,
      'treatment-event-sched-' || p_idempotency_key::text
    );
    v_schedule_id := (v_schedule->>'schedule_id')::uuid;
  end if;

  if v_charge_id is not null then
    select charge.amount_centavos into v_charge_amount
    from public.charges as charge
    where charge.organization_id = v_organization_id and charge.id = v_charge_id;
    v_paid := private.charge_net_allocated(v_charge_id, v_organization_id);
    v_due := private.charge_due(v_charge_id, v_organization_id);
  end if;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'procedure.case.treatment_event.recorded', 'procedure_case', v_case.id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  v_result := pg_catalog.jsonb_build_object(
    'procedure_case_id', v_case.id,
    'case_status', v_case_status,
    'case_version', v_case_version,
    'encounter_id', v_encounter_id,
    'clinical_date', v_clinical_date,
    'service_date', p_service_date,
    'event_id', v_event_id,
    'event_kind', p_event_kind,
    'charge_id', v_charge_id,
    'charge_confirmed', v_charge_confirmed,
    'charge_amount_centavos', v_charge_amount::text,
    'paid_centavos', v_paid::text,
    'balance_centavos', v_due::text,
    'clinical_entry_ids', pg_catalog.to_jsonb(v_entry_ids),
    'resolved_finding_ids', pg_catalog.to_jsonb(v_findings),
    'payment_id', v_payment_id,
    'payment_allocation_id', v_allocation_id,
    'installment_schedule_id', v_schedule_id,
    'replayed', false
  );

  update private.clinical_treatment_event_idempotency as request
  set procedure_case_id = v_case.id, result = v_result
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

revoke all on function public.record_treatment_event_v2(
  uuid, uuid, uuid, uuid, uuid, integer, text, date, uuid[], jsonb, bigint, jsonb, jsonb, uuid
) from public, anon, authenticated, service_role;

comment on function public.record_treatment_event_v2(
  uuid, uuid, uuid, uuid, uuid, integer, text, date, uuid[], jsonb, bigint, jsonb, jsonb, uuid
) is
  'The only browser-callable treatment-event write. One transaction obtains its encounter from public.start_or_resume_clinical_visit, derives organization, actor and treating provider on the server, creates or locks the procedure case, records the dated performed/follow-up/completion entry per treated tooth, links the exact active findings on those teeth, and confirms at most one immutable charge. A new case requires a confirmed charge; an existing case that already carries one refuses a replacement, and a plan-linked first charge is delegated to public.complete_treatment_case so the immutable materialization contract is inherited rather than restated. Only COMPLETED closes a case. Optional payment is recorded and allocated to this case charge alone through the reviewed billing boundary, and any installment schedule remains an expectation set while the allocation ledger stays the balance authority. A replayed request key returns the stored result; the same key with a different payload is refused. No organization, provider, actor, encounter or visit date may be supplied by a client, and no confirmed charge is ever updated.';
