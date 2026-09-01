-- Unified Clinical Chart workspace, task 13 review round 1. Forward-only.
-- 20260901010300 and 20260901010301 are applied and are NOT edited.
--
-- THREE DEFECTS, all in what the record SAYS rather than in what it computes.
-- The per-case money arithmetic is unchanged and remains strictly single-charge.
--
-- 1. EVERY MONEY MOVEMENT WAS INVISIBLE, AND A CASE POSITION READ AS A PAYMENT.
--
--    The ALLOCATION branch carried an empty description and no amount of its
--    own, so a row reading "Payment applied" showed the case's paidMinor - the
--    position as of READ TIME - in a column headed "Paid". A first installment
--    of 5,000 rendered as 10,000 because a second installment had since been
--    applied. PAYMENT, REFUND, ADJUSTMENT and REVERSAL rows showed no amount at
--    all. Every row now carries line_amount_minor: the signed amount THAT ONE
--    ledger event moved, read from that event's own amount column, never
--    derived from any other row and never a total. The three case columns are
--    unchanged and are renamed in the UI to Case charge / Case paid /
--    Case balance so the two can never be confused.
--
-- 2. DRAFT CLINICAL CONTENT ENTERED THE PERMANENT RECORD UNMARKED.
--
--    The encounter, note, prescription, plan and periodontal branches selected
--    every row regardless of status and put the draft's text in description, so
--    an unfinished note was visually identical to a finalized clinical fact.
--    That was also a silent broadening: the browser merge this projection
--    replaced filtered periodontal examinations to status = 'FINAL'.
--    Every row that belongs to a source with a draft lifecycle now carries
--    `finalized`, and the screen marks a draft. Drafts are shown rather than
--    hidden - an unfinished note is part of the record-in-progress - but they
--    can no longer be mistaken for signed history.
--
-- 3. UNDISCLOSED PROVIDER INFERENCE ATTRIBUTED CLINICAL ACTS TO THE WRONG
--    CLINICIAN.
--
--    public.procedure_case_events has recorded_by and NO provider column. The
--    projection named the CHARGE's treating provider for every treatment,
--    follow-up and correction on that case, whoever actually performed it - a
--    permanent misattribution of a clinical act to a named clinician. It now
--    resolves the actual actor through public.providers.linked_user_id inside
--    the derived tenant, and reports NULL when that actor has no provider link
--    rather than borrowing somebody else's identity. Clinical photographs get
--    the same treatment from created_by, which was previously discarded.
--
-- HOW THE APPLIED BOUNDARY IS REPLACED
--
-- The reviewed repair pattern: a guarded replacement EXECUTEd inside a DO block,
-- exactly as 20260901010220 replaces public.post_charge. A bare top-level
-- CREATE OR REPLACE is not available here and must not be used - ADR-017
-- requires a REVOKE ALL adjacent to any SECURITY DEFINER creation, and revoking
-- would destroy the `authenticated` grant that 20260901010301 owns, which this
-- migration has no authority to re-issue. CREATE OR REPLACE through EXECUTE
-- preserves the existing ACL, so no privilege moves and this file grants and
-- revokes nothing on the boundary at all.
--
-- 20260901010220 rewrites ONE expression with pg_catalog.replace because that is
-- all it changes. This repair changes fifteen sites across nineteen union
-- branches and adds two columns to the source CTE, so the replacement text is
-- the whole restated body rather than a substring edit; string surgery at that
-- scale is strictly more dangerous than restating. The guards are correspondingly
-- stricter, and every one of them fails closed on 55000:
--
--   before  the target must exist with this exact signature, be SECURITY DEFINER,
--           be stable, carry an empty search_path, and already be executable by
--           `authenticated`;
--   before  three text targets are counted in the APPLIED body - the repaired
--           marker must be absent, and two branch anchors must each occur
--           EXACTLY once - so a different or already-repaired body is refused;
--   after   the posture is re-asserted AND the browser boundary is re-asserted
--           in both directions: `authenticated` may execute, and public, anon
--           and service_role may not. That is strictly stronger than the
--           adjacent-revoke rule it stands in for.

-- The actor a clinical event was recorded by, resolved to a provider identity
-- inside one tenant. NULL when that user is not a provider here, which is an
-- honest "not recorded" rather than a borrowed identity.
create function private.clinical_progress_actor_provider(
  p_organization_id uuid,
  p_user_id uuid
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select provider.id
  from public.providers as provider
  where provider.organization_id = p_organization_id
    and provider.linked_user_id = p_user_id
  order by provider.id
  limit 1;
$$;

revoke all on function private.clinical_progress_actor_provider(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function private.clinical_progress_actor_provider(uuid, uuid) is
  'Resolves the provider identity of the user who recorded a clinical event, inside one tenant, deterministically. Returns NULL when that user has no provider row here, so a record never attributes a clinical act to a clinician who did not perform it. Never browser callable; the calling projection has already authorized the read.';

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
      charge.provider_id,
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
      -charge.amount_centavos
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
  if pg_catalog.strpos(v_definition, 'lineAmountMinor') <> 0 then
    raise exception using errcode = '55000',
      message = 'the clinical progress projection already carries a line amount; refusing to replace it';
  end if;

  if (pg_catalog.length(v_definition) - pg_catalog.length(
        pg_catalog.replace(v_definition, '''financialVisible'', v_financial', '')))
     / pg_catalog.length('''financialVisible'', v_financial') <> 1 then
    raise exception using errcode = '55000',
      message = 'the financial-visibility target is not unique in the applied projection';
  end if;

  if (pg_catalog.length(v_definition) - pg_catalog.length(
        pg_catalog.replace(v_definition, '''ALLOCATION'', allocation.allocated_at', '')))
     / pg_catalog.length('''ALLOCATION'', allocation.allocated_at') <> 1 then
    raise exception using errcode = '55000',
      message = 'the allocation branch target is not unique in the applied projection';
  end if;

  -- CREATE OR REPLACE through EXECUTE: the ACL, and therefore the reviewed
  -- browser boundary, is carried over untouched.
  execute v_replacement;
end
$migration$;



comment on function public.get_clinical_progress_record_v1(uuid, uuid, integer, integer) is
  'The one authorized chronological progress record. It derives organization and actor inside a stable SECURITY DEFINER body with an empty search path, requires live patient.clinical.read at an active acting branch, refuses a foreign patient as unauthorized rather than reporting it absent, and accepts no organization identifier from a client. It unions the append-only clinical and ledger sources into one chronology ordered oldest first and tie-broken on (source_kind, source_id), which is total across the union. Each ledger row carries lineAmountMinor - the signed amount that ONE event moved, read from its own amount column - alongside the procedure case position, which is derived at read time from that one case''s charge, its non-reversed adjustments and its net allocations; no balance is stored, no patient-level balance is computed, and each row''s balance is exactly its own charge minus its own paid, so settling one case cannot move another. Ledger rows, the line amount and the case position all require billing.read at the same branch. Every row from a source with a draft lifecycle reports whether it is finalized, so unfinished clinical content can never be read as signed history. A clinical event''s provider is the actor who recorded it, resolved through providers.linked_user_id, and is NULL rather than borrowed when that actor is not a provider here. Service dates and posting dates stay separate rows at separate instants. The page is bounded in both size and offset. It writes nothing at all.';

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
       'lineAmountMinor') = 0 then
    raise exception using errcode = '55000',
      message = 'the replacement did not take';
  end if;

  if exists (
    select 1 from (values ('public'),('anon'),('authenticated'),('service_role')) as viewer(role_name)
    where pg_catalog.has_function_privilege(
      viewer.role_name, 'private.clinical_progress_actor_provider(uuid,uuid)', 'execute')
  ) then
    raise exception using errcode = '55000',
      message = 'the progress-record actor helper must not be browser or service callable';
  end if;
end
$verify$;
