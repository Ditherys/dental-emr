-- Unified Clinical Chart workspace, task 13 review round 2. Forward-only.
-- 20260901010300, 20260901010301 and 20260901010310 are applied and are NOT
-- edited. Same guarded DO-block replacement as 20260901010310, with the anchors
-- counted against the APPLIED body so the guards pass on a fresh chain and
-- refuse any other body. This migration grants and revokes nothing.
--
-- TWO DEFECTS, both in what a ledger row SAYS about itself. The per-case money
-- arithmetic in private.clinical_progress_case_money is untouched again.
--
-- 1. A CORRECTED CHARGE STILL NAMED THE SUPERSEDED CLINICIAN.
--
--    The CHARGE branch read public.charges.provider_id directly. That column is
--    immutable and records the clinician the charge was POSTED under; charge
--    attribution is corrected through the append-only
--    public.charge_attribution_corrections ledger, and
--    private.charge_current_attribution (20260828010500) is the canonical
--    resolver for the attribution that currently stands. A charge whose
--    attribution had been corrected therefore displayed the wrong clinician,
--    permanently, in the patient's own record. This is the same family as the
--    procedure_case_events misattribution 20260901010310 repaired, and it is
--    fixed the same way: read the canonical resolver, never the raw column.
--
-- 2. A VOID OVERSTATED WHAT IT WITHDREW.
--
--    The charge_void branch reported -charge.amount_centavos: the RAW billed
--    amount. A charge carrying a prior credit adjustment stood at less than
--    that when it was voided, so the line overstated the movement by the whole
--    adjustment. It now reports -private.charge_adjusted_amount, which is
--    exactly the position private.clinical_progress_case_money zeroes on a
--    void, so the line amount and the case position agree by construction.

do $migration$
declare
  v_definition text;
  v_replacement text := $definition$
create or replace function public.get_clinical_progress_record_v1(
  p_patient_id uuid,
  p_branch_id uuid,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (payload jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $body$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_financial boolean;
  v_limit integer := coalesce(p_limit, 100);
  v_offset integer := coalesce(p_offset, 0);
  v_rows jsonb;
  v_beyond integer;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_branch_id, 'patient.clinical.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- A patient who is not this tenant's is not a "not found"; it is a request
  -- the caller was never entitled to make.
  if p_patient_id is null or not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- The bounds are enforced here, not in the browser. The action schema mirrors
  -- them so a bad page is refused early, but this is where the rule lives.
  if v_limit < 1 or v_limit > 200 or v_offset < 0 or v_offset > 10000 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_financial := private.has_billing_permission_at_branch(p_branch_id, 'billing.read');

  with source as (
    select
      'clinical_encounter'::text as source_kind,
      encounter.id as source_id,
      'ENCOUNTER'::text as event_type,
      encounter.created_at as occurred_at,
      null::uuid as procedure_case_id,
      null::uuid as charge_id,
      null::text as procedure_label,
      null::integer[] as tooth_codes,
      encounter.treating_provider_id as provider_id,
      ''::text as description,
      (encounter.status = 'FINALIZED') as finalized,
      null::bigint as line_amount_minor
    from public.clinical_encounters as encounter
    where encounter.organization_id = v_organization_id
      and encounter.patient_id = p_patient_id

    union all
    select
      'clinical_note', note.id,
      'NOTE', coalesce(note.finalized_at, note.created_at),
      null, null, null, null,
      encounter.treating_provider_id,
      note.content,
      (note.status = 'FINALIZED'),
      null
    from public.clinical_notes as note
    join public.clinical_encounters as encounter
      on encounter.organization_id = note.organization_id
     and encounter.id = note.encounter_id
    where note.organization_id = v_organization_id
      and encounter.patient_id = p_patient_id

    union all
    select
      'prescription', script.id,
      'PRESCRIPTION', coalesce(script.finalized_at, script.created_at),
      null, null, null, null,
      script.provider_id,
      '',
      (script.status = 'FINALIZED'),
      null
    from public.prescriptions as script
    where script.organization_id = v_organization_id
      and script.patient_id = p_patient_id

    union all
    select
      'tooth_clinical_entry', entry.id,
      case when entry.kind = 'TREATMENT' then 'TREATMENT' else 'FINDING' end,
      coalesce(entry.completed_at, entry.effective_at, entry.recorded_at),
      kase.id, entry.charge_id, entry.clinical_code,
      array[entry.tooth_code::integer],
      entry.treating_provider_id,
      coalesce(entry.notes, ''),
      null,
      null
    from public.tooth_clinical_entries as entry
    left join public.procedure_cases as kase
      on kase.organization_id = entry.organization_id
     and kase.charge_id = entry.charge_id
    where entry.organization_id = v_organization_id
      and entry.patient_id = p_patient_id

    -- A voided clinical entry keeps its original row AND gains a void row. The
    -- liveness signal here is lifecycle, not a bare voided_at predicate.
    union all
    select
      'tooth_clinical_entry_void', entry.id,
      'VOID', entry.voided_at,
      kase.id, entry.charge_id, entry.clinical_code,
      array[entry.tooth_code::integer],
      entry.treating_provider_id,
      coalesce(entry.void_reason, ''),
      null,
      null
    from public.tooth_clinical_entries as entry
    left join public.procedure_cases as kase
      on kase.organization_id = entry.organization_id
     and kase.charge_id = entry.charge_id
    where entry.organization_id = v_organization_id
      and entry.patient_id = p_patient_id
      and entry.lifecycle = 'VOIDED'
      and entry.voided_at is not null

    union all
    select
      'treatment_plan', plan.id,
      'PLAN', plan.created_at,
      null, null, null, null, null,
      plan.title,
      (plan.status <> 'DRAFT'),
      null
    from public.treatment_plans as plan
    where plan.organization_id = v_organization_id
      and plan.patient_id = p_patient_id

    -- procedure_case_events is a closed five-value vocabulary and the row
    -- contract is a closed eighteen. COMPLETION and CANCELLATION are follow-up
    -- shaped; CORRECTION is the withdrawal of an earlier recorded fact, which
    -- is what VOID means throughout this projection.
    --
    -- The provider is the actor who RECORDED the event, resolved through
    -- providers.linked_user_id. It is deliberately NOT the case charge's
    -- treating provider: a follow-up performed by a second clinician must not
    -- be attributed to the first, and an actor with no provider link here is
    -- reported as unknown rather than given somebody else's name.
    union all
    select
      'procedure_case_event', event.id,
      case event.event_type
        when 'TREATMENT' then 'TREATMENT'
        when 'CORRECTION' then 'VOID'
        else 'FOLLOW_UP'
      end,
      event.occurred_at,
      kase.id, kase.charge_id, service.name, null,
      private.clinical_progress_actor_provider(v_organization_id, event.recorded_by),
      coalesce(event.notes, event.reason, ''),
      null,
      null
    from public.procedure_case_events as event
    join public.procedure_cases as kase
      on kase.organization_id = event.organization_id
     and kase.id = event.procedure_case_id
    join public.procedures as service
      on service.organization_id = kase.organization_id
     and service.id = kase.procedure_id
    where event.organization_id = v_organization_id
      and kase.patient_id = p_patient_id

    union all
    select
      'periodontal_examination', exam.id,
      'PERIODONTAL', coalesce(exam.examined_at, exam.finalized_at, exam.recorded_at),
      null, null, null, null,
      coalesce(exam.examined_provider_id, exam.finalized_provider_id),
      coalesce(exam.amendment_reason, exam.notes, ''),
      (exam.status = 'FINAL'),
      null
    from public.periodontal_examinations as exam
    where exam.organization_id = v_organization_id
      and exam.patient_id = p_patient_id

    union all
    select
      'clinical_photograph', photo.id,
      'PHOTO', photo.capture_at,
      photo.procedure_case_id, kase.charge_id, service.name,
      (
        select coalesce(pg_catalog.array_agg(distinct code::integer order by code::integer), array[]::integer[])
        from pg_catalog.unnest(photo.tooth_codes) as code
        where code ~ '^[1-8][1-5]$|^[1-4][1-8]$'
      ),
      private.clinical_progress_actor_provider(v_organization_id, photo.created_by),
      coalesce(photo.note, ''),
      null,
      null
    from public.clinical_photographs as photo
    left join public.procedure_cases as kase
      on kase.organization_id = photo.organization_id
     and kase.id = photo.procedure_case_id
    left join public.procedures as service
      on service.organization_id = kase.organization_id
     and service.id = kase.procedure_id
    where photo.organization_id = v_organization_id
      and photo.patient_id = p_patient_id

    -- Archiving a photograph is terminal and immutable on the row itself; there
    -- is no separate clinical_photo_voids table to consult.
    union all
    select
      'clinical_photograph_archive', photo.id,
      'PHOTO_ARCHIVE', photo.archived_at,
      photo.procedure_case_id, kase.charge_id, service.name,
      (
        select coalesce(pg_catalog.array_agg(distinct code::integer order by code::integer), array[]::integer[])
        from pg_catalog.unnest(photo.tooth_codes) as code
        where code ~ '^[1-8][1-5]$|^[1-4][1-8]$'
      ),
      private.clinical_progress_actor_provider(v_organization_id, photo.archived_by),
      coalesce(photo.archive_reason, ''),
      null,
      null
    from public.clinical_photographs as photo
    left join public.procedure_cases as kase
      on kase.organization_id = photo.organization_id
     and kase.id = photo.procedure_case_id
    left join public.procedures as service
      on service.organization_id = kase.organization_id
     and service.id = kase.procedure_id
    where photo.organization_id = v_organization_id
      and photo.patient_id = p_patient_id
      and photo.archived_at is not null

    -- ------------------------------------------------------------------
    -- The ledger. Every branch below is gated on billing.read at the acting
    -- branch, so a caller without it never sees a financial event exists.
    --
    -- line_amount_minor is the signed amount THIS ONE event moved, taken from
    -- that event's own amount column: positive where the event adds to what it
    -- is about, negative where it withdraws. It is never derived from another
    -- row and it is never a total. The three case columns remain the procedure
    -- case's position as of the read; the two are different facts and the UI
    -- labels them differently.
    -- ------------------------------------------------------------------

    union all
    select
      'charge', charge.id,
      'CHARGE', charge.posted_at,
      kase.id, charge.id, service.name, null,
      -- public.charges is immutable, so charge.provider_id is the clinician the
      -- charge was POSTED under. Attribution is corrected through the
      -- append-only public.charge_attribution_corrections ledger, and
      -- private.charge_current_attribution is the canonical resolver for the
      -- attribution that currently stands.
      (select attribution.provider_id
       from private.charge_current_attribution(charge.id, v_organization_id) as attribution),
      coalesce(charge.zero_amount_reason, ''),
      null,
      charge.amount_centavos
    from public.charges as charge
    left join public.procedure_cases as kase
      on kase.organization_id = charge.organization_id
     and kase.charge_id = charge.id
    left join public.procedures as service
      on service.organization_id = charge.organization_id
     and service.id = charge.procedure_id
    where v_financial
      and charge.organization_id = v_organization_id
      and charge.patient_id = p_patient_id

    union all
    select
      'payment', payment.id,
      'PAYMENT', payment.received_at,
      null, null, null, null, null,
      coalesce(payment.reference, ''),
      null,
      payment.amount_centavos
    from public.payments as payment
    where v_financial
      and payment.organization_id = v_organization_id
      and payment.patient_id = p_patient_id

    union all
    select
      'payment_allocation', allocation.id,
      'ALLOCATION', allocation.allocated_at,
      kase.id, allocation.charge_id, service.name, null, null, '',
      null,
      allocation.amount_centavos
    from public.payment_allocations as allocation
    join public.charges as charge
      on charge.organization_id = allocation.organization_id
     and charge.id = allocation.charge_id
    left join public.procedure_cases as kase
      on kase.organization_id = charge.organization_id
     and kase.charge_id = charge.id
    left join public.procedures as service
      on service.organization_id = charge.organization_id
     and service.id = charge.procedure_id
    where v_financial
      and allocation.organization_id = v_organization_id
      and allocation.patient_id = p_patient_id

    union all
    select
      'payment_refund', refund.id,
      'REFUND', refund.refunded_at,
      null, null, null, null, null,
      refund.reason,
      null,
      -refund.amount_centavos
    from public.payment_refunds as refund
    where v_financial
      and refund.organization_id = v_organization_id
      and refund.patient_id = p_patient_id

    union all
    select
      'payment_allocation_reversal', reversal.id,
      'REVERSAL', reversal.reversed_at,
      kase.id, allocation.charge_id, service.name, null, null,
      reversal.reason,
      null,
      -reversal.amount_centavos
    from public.payment_allocation_reversals as reversal
    join public.payment_allocations as allocation
      on allocation.organization_id = reversal.organization_id
     and allocation.id = reversal.allocation_id
    join public.charges as charge
      on charge.organization_id = allocation.organization_id
     and charge.id = allocation.charge_id
    left join public.procedure_cases as kase
      on kase.organization_id = charge.organization_id
     and kase.charge_id = charge.id
    left join public.procedures as service
      on service.organization_id = charge.organization_id
     and service.id = charge.procedure_id
    where v_financial
      and reversal.organization_id = v_organization_id
      and allocation.patient_id = p_patient_id

    union all
    select
      'charge_adjustment', adjustment.id,
      'ADJUSTMENT', adjustment.occurred_at,
      kase.id, adjustment.charge_id, service.name, null, null,
      adjustment.reason,
      null,
      case when adjustment.direction = 'CREDIT'
        then -adjustment.amount_centavos else adjustment.amount_centavos end
    from public.charge_adjustments as adjustment
    join public.charges as charge
      on charge.organization_id = adjustment.organization_id
     and charge.id = adjustment.charge_id
    left join public.procedure_cases as kase
      on kase.organization_id = charge.organization_id
     and kase.charge_id = charge.id
    left join public.procedures as service
      on service.organization_id = charge.organization_id
     and service.id = charge.procedure_id
    where v_financial
      and adjustment.organization_id = v_organization_id
      and charge.patient_id = p_patient_id

    -- A reversal has no amount of its own; it withdraws exactly the adjustment
    -- it names, so it carries that adjustment's amount with the opposite sign.
    union all
    select
      'charge_adjustment_reversal', reversal.id,
      'REVERSAL', reversal.occurred_at,
      kase.id, adjustment.charge_id, service.name, null, null,
      reversal.reason,
      null,
      case when adjustment.direction = 'CREDIT'
        then adjustment.amount_centavos else -adjustment.amount_centavos end
    from public.charge_adjustment_reversals as reversal
    join public.charge_adjustments as adjustment
      on adjustment.organization_id = reversal.organization_id
     and adjustment.id = reversal.adjustment_id
    join public.charges as charge
      on charge.organization_id = adjustment.organization_id
     and charge.id = adjustment.charge_id
    left join public.procedure_cases as kase
      on kase.organization_id = charge.organization_id
     and kase.charge_id = charge.id
    left join public.procedures as service
      on service.organization_id = charge.organization_id
     and service.id = charge.procedure_id
    where v_financial
      and reversal.organization_id = v_organization_id
      and charge.patient_id = p_patient_id

    union all
    select
      'charge_void', void.id,
      'VOID', void.voided_at,
      kase.id, void.charge_id, service.name, null, null,
      void.reason,
      null,
      -- The void withdrew what the charge actually stood at, which is the
      -- adjusted amount. The raw amount would overstate the movement whenever
      -- an adjustment preceded the void.
      -private.charge_adjusted_amount(charge.id, v_organization_id)
    from public.charge_voids as void
    join public.charges as charge
      on charge.organization_id = void.organization_id
     and charge.id = void.charge_id
    left join public.procedure_cases as kase
      on kase.organization_id = charge.organization_id
     and kase.charge_id = charge.id
    left join public.procedures as service
      on service.organization_id = charge.organization_id
     and service.id = charge.procedure_id
    where v_financial
      and void.organization_id = v_organization_id
      and charge.patient_id = p_patient_id

    union all
    select
      'payment_void', void.id,
      'VOID', void.voided_at,
      null, null, null, null, null,
      void.reason,
      null,
      -payment.amount_centavos
    from public.payment_voids as void
    join public.payments as payment
      on payment.organization_id = void.organization_id
     and payment.id = void.payment_id
    where v_financial
      and void.organization_id = v_organization_id
      and payment.patient_id = p_patient_id
  ),
  ordered as (
    select
      source.*,
      pg_catalog.row_number() over (
        order by source.occurred_at, source.source_kind, source.source_id
      ) as sequence_no
    from source
  ),
  page as (
    select ordered.*
    from ordered
    where ordered.sequence_no > v_offset
      and ordered.sequence_no <= v_offset + v_limit + 1
  )
  select
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'eventId', page.source_kind || ':' || page.source_id::text,
          'occurredAt', page.occurred_at,
          'eventType', page.event_type,
          'procedureCaseId', page.procedure_case_id,
          'procedureLabel', page.procedure_label,
          'toothCodes', pg_catalog.to_jsonb(coalesce(
            page.tooth_codes,
            private.clinical_progress_case_teeth(v_organization_id, page.procedure_case_id)
          )),
          'providerDisplay', (
            select pg_catalog.concat_ws(' ', provider.first_name, provider.middle_name, provider.last_name, provider.suffix)
            from public.providers as provider
            where provider.organization_id = v_organization_id
              and provider.id = page.provider_id
          ),
          'description', page.description,
          'finalized', page.finalized,
          'lineAmountMinor', case when v_financial then page.line_amount_minor else null end,
          'chargeMinor', money.charge_minor,
          'paidMinor', money.paid_minor,
          'balanceMinor', money.balance_minor,
          'currency', 'PHP',
          'sourceKind', page.source_kind,
          'sourceId', page.source_id
        )
        order by page.sequence_no
      ) filter (where page.sequence_no <= v_offset + v_limit),
      '[]'::jsonb
    ),
    pg_catalog.count(*) filter (where page.sequence_no > v_offset + v_limit)::integer
  into v_rows, v_beyond
  from page
  left join lateral private.clinical_progress_case_money(
    case when v_financial then page.charge_id else null end,
    v_organization_id
  ) as money on true;

  payload := pg_catalog.jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'limit', v_limit,
    'offset', v_offset,
    'hasMore', coalesce(v_beyond, 0) > 0,
    'financialVisible', v_financial
  );

  return next;
end
$body$;
$definition$;
begin
  if to_regprocedure('public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)') is null then
    raise exception using errcode = '55000',
      message = 'expected clinical progress projection is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as p
    where p.oid = 'public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)'::regprocedure
      and p.prosecdef
      and p.provolatile = 's'
      and p.proconfig = array['search_path=""']::text[]
      and pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
  ) then
    raise exception using errcode = '55000',
      message = 'the clinical progress projection is not in the reviewed posture; refusing to replace it';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)'::regprocedure
  );

  -- Already repaired, or not the body this migration was written against.
  if pg_catalog.strpos(v_definition, 'charge_current_attribution') <> 0 then
    raise exception using errcode = '55000',
      message = 'the clinical progress projection already resolves charge attribution; refusing to replace it';
  end if;

  -- The round-1 repair is the body this migration edits: it must already be
  -- applied, or the replacement would silently revert it.
  if pg_catalog.strpos(v_definition, 'lineAmountMinor') = 0 then
    raise exception using errcode = '55000',
      message = 'the clinical progress projection predates the line-amount repair; refusing to replace it';
  end if;

  if (pg_catalog.length(v_definition) - pg_catalog.length(
        pg_catalog.replace(v_definition, 'charge.provider_id,', '')))
     / pg_catalog.length('charge.provider_id,') <> 1 then
    raise exception using errcode = '55000',
      message = 'the raw charge attribution target is not unique in the applied projection';
  end if;

  if (pg_catalog.length(v_definition) - pg_catalog.length(
        pg_catalog.replace(v_definition, '-charge.amount_centavos', '')))
     / pg_catalog.length('-charge.amount_centavos') <> 1 then
    raise exception using errcode = '55000',
      message = 'the charge void amount target is not unique in the applied projection';
  end if;

  -- CREATE OR REPLACE through EXECUTE: the ACL, and therefore the reviewed
  -- browser boundary, is carried over untouched. A top-level CREATE OR REPLACE
  -- would require an adjacent REVOKE under ADR-017, and that revoke would
  -- destroy the grant 20260901010301 owns.
  execute v_replacement;
end
$migration$;

do $verify$
begin
  if not exists (
    select 1
    from pg_catalog.pg_proc as p
    where p.oid = 'public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)'::regprocedure
      and p.prosecdef
      and p.provolatile = 's'
      and p.proconfig = array['search_path=""']::text[]
      and pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
      and not pg_catalog.has_function_privilege('public', p.oid, 'execute')
      and not pg_catalog.has_function_privilege('anon', p.oid, 'execute')
      and not pg_catalog.has_function_privilege('service_role', p.oid, 'execute')
  ) then
    raise exception using errcode = '55000',
      message = 'the replaced clinical progress projection lost its reviewed posture or its browser boundary';
  end if;

  if pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(
         'public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)'::regprocedure),
       'charge_current_attribution') = 0
     or pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(
         'public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)'::regprocedure),
       'lineAmountMinor') = 0 then
    raise exception using errcode = '55000',
      message = 'the replacement did not take, or it reverted the line-amount repair';
  end if;
end
$verify$;
