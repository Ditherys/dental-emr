-- Unified Clinical Chart workspace, task 13: the canonical chronological
-- progress-record projection.
--
-- ONE read-only boundary. It unions the append-only clinical and financial
-- sources a patient's record is actually made of and returns them as one
-- chronology. It writes nothing - no row, no state change, and no audit event -
-- so reading a patient's history never records that it was read as if it were
-- clinical work, and no clinical content can reach the audit log through it.
--
-- MONEY
--
-- Nothing here stores, caches, or accumulates a balance. Every one of
-- chargeMinor, paidMinor and balanceMinor is derived at read time from the
-- ledger entries and allocations belonging to ONE procedure case's charge, via
-- the reviewed helpers private.charge_adjusted_amount and
-- private.charge_net_allocated. A patient-level balance is never computed here
-- and no row carries a running total: balanceMinor is always exactly that same
-- row's chargeMinor minus its own paidMinor. Paying one procedure case
-- therefore cannot move another case's numbers, because the two cases share no
-- term in the arithmetic.
--
-- A voided charge is reported as owing nothing rather than disappearing. The
-- charge row, and the void that withdrew it, both remain in the chronology: a
-- correction that vanishes from the record is the defect this projection
-- exists to prevent.
--
-- DATES
--
-- The service fact and the posting fact are separate rows at separate
-- instants, never one row with one date. A treatment performed on the 16th and
-- charged on the 23rd appears twice, on both days. No date is derived here at
-- all - each row carries the canonical timestamptz its own source recorded - so
-- this migration adds no `statement_timestamp()::date` derivation to the eight
-- pre-existing sites named in docs/AI_HANDOFF.md.
--
-- ORDERING
--
-- Chronological ascending, tie-broken on (source_kind, source_id). That pair is
-- unique across the whole union because source_id is a primary key within its
-- own source table, so the order is total and two events recorded at the same
-- instant always come back in the same order.
--
-- VOIDS
--
-- Each source is asked how IT records a withdrawal, because they do not agree:
--   public.tooth_clinical_entries  - `lifecycle = 'VOIDED'`, with voided_at kept
--                                    in step by tooth_clinical_entries_voided_state_check
--   public.charges                 - a row in public.charge_voids
--   public.payments                - a row in public.payment_voids
--   public.charge_adjustments      - a row in public.charge_adjustment_reversals
--   public.payment_allocations     - rows in public.payment_allocation_reversals
-- A bare `voided_at is null` predicate would be wrong for four of those five.
--
-- PERMISSIONS
--
-- patient.clinical.read at an active acting branch is required to call this at
-- all. The ledger rows and the three money fields additionally require
-- billing.read at that same branch, so a dental assistant (clinical read, no
-- billing read) gets the complete clinical chronology with the money withheld
-- and the payload says so. A receptionist holds billing.read and payment.record
-- but NO clinical permission (20260827012800, "Reception gets neither clinical
-- permission"), so a receptionist is refused outright.
--
-- This migration grants nothing. 20260901010301 owns the browser boundary.

-- private.charge_adjusted_amount scans public.charge_adjustments by charge on
-- every money read, and the ADJUSTMENT branch below scans it per patient. The
-- table carried no index on that path at all.
create index if not exists charge_adjustments_org_charge_occurred_idx
  on public.charge_adjustments (organization_id, charge_id, occurred_at, id);

create function private.clinical_progress_case_money(
  p_charge_id uuid,
  p_organization_id uuid
)
returns table (charge_minor bigint, paid_minor bigint, balance_minor bigint)
language sql
stable
set search_path = ''
as $$
  select ledger.charge_minor, ledger.paid_minor, ledger.charge_minor - ledger.paid_minor
  from (
    select
      case
        when exists (
          select 1 from public.charge_voids as void
          where void.charge_id = p_charge_id
            and void.organization_id = p_organization_id
        ) then 0::bigint
        else private.charge_adjusted_amount(p_charge_id, p_organization_id)
      end as charge_minor,
      private.charge_net_allocated(p_charge_id, p_organization_id) as paid_minor
    where exists (
      select 1 from public.charges as charge
      where charge.id = p_charge_id and charge.organization_id = p_organization_id
    )
  ) as ledger;
$$;

revoke all on function private.clinical_progress_case_money(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function private.clinical_progress_case_money(uuid, uuid) is
  'One procedure case''s ledger position, derived at read time from the immutable charge, its non-reversed adjustments and its net allocations. Returns no row when the charge does not belong to the given tenant, so a null or foreign charge yields nothing rather than a zero. A voided charge reports a zero charge and, because void_charge reverses every allocation with it, a zero balance. It stores nothing and knows nothing about any other case, which is why settling one case cannot move another. Never browser callable; the calling projection has already authorized the read.';

create function private.clinical_progress_case_teeth(
  p_organization_id uuid,
  p_procedure_case_id uuid
)
returns integer[]
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(distinct tooth.code order by tooth.code), array[]::integer[])
  from (
    select entry.tooth_code::integer as code
    from public.procedure_cases as kase
    join public.tooth_clinical_entries as entry
      on entry.organization_id = kase.organization_id
     and entry.charge_id = kase.charge_id
    where kase.organization_id = p_organization_id
      and kase.id = p_procedure_case_id
    union
    select item.tooth_code::integer
    from public.procedure_cases as kase
    join public.treatment_plan_items as item
      on item.organization_id = kase.organization_id
     and item.id = kase.treatment_plan_item_id
    where kase.organization_id = p_organization_id
      and kase.id = p_procedure_case_id
      and item.tooth_code ~ '^[1-8][1-5]$|^[1-4][1-8]$'
  ) as tooth;
$$;

revoke all on function private.clinical_progress_case_teeth(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function private.clinical_progress_case_teeth(uuid, uuid) is
  'The FDI teeth a procedure case actually concerns, taken from the canonical clinical entries bound to the case charge and from the case''s plan item. Returns an empty array rather than null for a case with no charted tooth, so an unknown tooth is never rendered as a tooth. Never browser callable; the calling projection has already authorized the read.';

create function public.get_clinical_progress_record_v1(
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
as $$
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
      ''::text as description
    from public.clinical_encounters as encounter
    where encounter.organization_id = v_organization_id
      and encounter.patient_id = p_patient_id

    union all
    select
      'clinical_note', note.id,
      'NOTE', coalesce(note.finalized_at, note.created_at),
      null, null, null, null,
      encounter.treating_provider_id,
      note.content
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
      ''
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
      coalesce(entry.notes, '')
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
      coalesce(entry.void_reason, '')
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
      plan.title
    from public.treatment_plans as plan
    where plan.organization_id = v_organization_id
      and plan.patient_id = p_patient_id

    -- procedure_case_events is a closed five-value vocabulary and the row
    -- contract is a closed eighteen. COMPLETION and CANCELLATION are follow-up
    -- shaped; CORRECTION is the withdrawal of an earlier recorded fact, which
    -- is what VOID means throughout this projection.
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
      charge.provider_id,
      coalesce(event.notes, event.reason, '')
    from public.procedure_case_events as event
    join public.procedure_cases as kase
      on kase.organization_id = event.organization_id
     and kase.id = event.procedure_case_id
    join public.procedures as service
      on service.organization_id = kase.organization_id
     and service.id = kase.procedure_id
    left join public.charges as charge
      on charge.organization_id = kase.organization_id
     and charge.id = kase.charge_id
    where event.organization_id = v_organization_id
      and kase.patient_id = p_patient_id

    union all
    select
      'periodontal_examination', exam.id,
      'PERIODONTAL', coalesce(exam.examined_at, exam.finalized_at, exam.recorded_at),
      null, null, null, null,
      coalesce(exam.examined_provider_id, exam.finalized_provider_id),
      coalesce(exam.amendment_reason, exam.notes, '')
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
      null,
      coalesce(photo.note, '')
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
      null,
      coalesce(photo.archive_reason, '')
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
    -- ------------------------------------------------------------------

    union all
    select
      'charge', charge.id,
      'CHARGE', charge.posted_at,
      kase.id, charge.id, service.name, null,
      charge.provider_id,
      coalesce(charge.zero_amount_reason, '')
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
      coalesce(payment.reference, '')
    from public.payments as payment
    where v_financial
      and payment.organization_id = v_organization_id
      and payment.patient_id = p_patient_id

    union all
    select
      'payment_allocation', allocation.id,
      'ALLOCATION', allocation.allocated_at,
      kase.id, allocation.charge_id, service.name, null, null, ''
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
      refund.reason
    from public.payment_refunds as refund
    where v_financial
      and refund.organization_id = v_organization_id
      and refund.patient_id = p_patient_id

    union all
    select
      'payment_allocation_reversal', reversal.id,
      'REVERSAL', reversal.reversed_at,
      kase.id, allocation.charge_id, service.name, null, null,
      reversal.reason
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
      adjustment.reason
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

    union all
    select
      'charge_adjustment_reversal', reversal.id,
      'REVERSAL', reversal.occurred_at,
      kase.id, adjustment.charge_id, service.name, null, null,
      reversal.reason
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
      void.reason
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
      void.reason
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
$$;

revoke all on function public.get_clinical_progress_record_v1(uuid, uuid, integer, integer)
from public, anon, authenticated, service_role;

comment on function public.get_clinical_progress_record_v1(uuid, uuid, integer, integer) is
  'The one authorized chronological progress record. It derives organization and actor inside a stable SECURITY DEFINER body with an empty search path, requires live patient.clinical.read at an active acting branch, refuses a foreign patient as unauthorized rather than reporting it absent, and accepts no organization identifier from a client. It unions the append-only clinical and ledger sources into one chronology ordered oldest first and tie-broken on (source_kind, source_id), which is total across the union. Every money value is derived at read time from one procedure case''s charge, its non-reversed adjustments and its net allocations; no balance is stored, no patient-level balance is computed, and each row''s balance is exactly its own charge minus its own paid, so settling one case cannot move another. Ledger rows and money require billing.read at the same branch, so a clinical-only caller sees the complete chronology with the money withheld. Service dates and posting dates stay separate rows at separate instants. The page is bounded in both size and offset. It writes nothing at all.';
