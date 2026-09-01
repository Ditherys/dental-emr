-- Billing date-derivation correction, authorized by the controller during task 9
-- review round 2. Forward-only. 20260828010500 and 20260828010502 are long
-- applied and are not edited; the guarded-replace pattern verifies the target
-- occurs exactly once and every step fails closed on 55000.
--
-- THE DEFECT
--
-- public.post_charge derives the posting date it writes onto a charge as
-- `statement_timestamp()::date`. The database runs in UTC. The entire clinical
-- stack - public.start_or_resume_clinical_visit, public.record_treatment_event_v2
-- and the periodontal boundary among them - derives its clinical date as
-- `timezone('Asia/Manila', statement_timestamp())::date`. Between 16:00 and
-- 24:00 UTC those disagree, and for a Philippine clinic that window is 00:00 to
-- 08:00 Manila: the whole morning session.
--
-- So every charge posted before 08:00 Manila was dated to the previous day in
-- the ledger while the clinical record it belongs to carried the correct day.
-- Observed directly:
--
--   tz  | ts_raw                        | utc_date   | manila_date
--   UTC | 2026-09-01 16:23:06.161414+00 | 2026-09-01 | 2026-09-02
--
-- This is not the service-date / posting-date split, which is ordinary
-- double-entry practice and is preserved exactly. "The day the charge was
-- posted" is a defensible accounting fact; "the UTC day, which for a Philippine
-- clinic is sometimes yesterday" is not. It is a timezone bug in the derivation
-- of that fact.
--
-- SCOPE
--
-- Only the date derivation changes. Amounts, allocation, attribution,
-- permissions, grants and the append-only posture are untouched, and
-- CREATE OR REPLACE preserves the function's existing ACL, SECURITY DEFINER and
-- empty search_path. The appointment-linked branch is untouched too: when the
-- charge is tied to an appointment the service date still comes from
-- `v_appointment_starts::date`, which is a stored timestamptz rendered in the
-- session zone and is a separate question from this one.
--
-- The controller identified two call sites, in 20260828010500 line 630 and
-- 20260828010502 line 81. Both are the same statement: 20260828010502 recreated
-- public.post_charge and carried the defect forward. Only ONE survives in the
-- live catalog, because the later definition replaced the earlier one, and the
-- guard below asserts exactly that.
--
-- Three further occurrences of the same expression exist elsewhere in billing.
-- They are NOT changed here, because each alters what the system accepts or
-- reports rather than what it records, which is a billing behaviour decision
-- reserved to the controller. They are named in docs/AI_HANDOFF.md and in the
-- task 9 report so the ruling is cheap:
--
--   public.post_charge_with_attribution_override - `p_service_date > statement_timestamp()::date`
--   public.correct_charge_attribution            - `p_corrected_service_date > statement_timestamp()::date`
--   public.list_pending_pdc                      - `cheque.date_due - statement_timestamp()::date`
--
-- This migration grants and revokes nothing.

do $migration$
declare
  v_definition text;
  v_repaired text;
  v_target text := '    v_service_date := statement_timestamp()::date;';
  v_replacement text := '    v_service_date := (pg_catalog.timezone(''Asia/Manila'', pg_catalog.statement_timestamp()))::date;';
  v_occurrences integer;
begin
  -- Normalized on both sides: the stored body carries the newline convention of
  -- the machine that applied it, and this file is checked out with the
  -- convention of the machine replaying it.
  select pg_catalog.replace(
    pg_catalog.pg_get_functiondef(
      'public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)'::regprocedure),
    pg_catalog.chr(13) || pg_catalog.chr(10),
    pg_catalog.chr(10)
  ) into v_definition;

  v_target := pg_catalog.replace(v_target, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
  v_replacement := pg_catalog.replace(v_replacement, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  -- Exact substring counting, never a regex: an unescaped metacharacter in a SQL
  -- anchor would make the count meaningless.
  v_occurrences := (pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_target, '')))
    / pg_catalog.length(v_target);

  if v_occurrences <> 1 then
    raise exception using errcode = '55000',
      message = 'post_charge UTC posting-date derivation expected exactly once, found '
                || v_occurrences::text;
  end if;

  if pg_catalog.strpos(v_definition, 'Asia/Manila') <> 0 then
    raise exception using errcode = '55000',
      message = 'post_charge already derives a Philippine date';
  end if;

  -- The whole point of the repair: the appointment-linked branch must survive.
  if pg_catalog.strpos(v_definition, 'v_service_date := v_appointment_starts::date;') = 0 then
    raise exception using errcode = '55000',
      message = 'post_charge appointment-linked service date branch not found';
  end if;

  v_repaired := pg_catalog.replace(v_definition, v_target, v_replacement);

  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'post_charge posting-date replacement made no change';
  end if;

  -- No UTC-derived date may survive anywhere in the repaired body.
  if pg_catalog.strpos(v_repaired, 'statement_timestamp()::date') <> 0
     or pg_catalog.strpos(v_repaired, 'current_date') <> 0 then
    raise exception using errcode = '55000',
      message = 'post_charge still derives a date from the server timezone';
  end if;

  execute v_repaired;
end
$migration$;

comment on function public.post_charge(uuid, uuid, uuid, uuid, bigint, uuid, boolean, text, text) is
  'Posts one immutable charge to the ledger. The posting date is the Philippine clinical date, derived server-side as timezone(''Asia/Manila'', statement_timestamp())::date so it agrees with the clinical stack; before this migration it was the UTC date, which for a Philippine clinic is the previous day between 00:00 and 08:00 Manila. A charge tied to a completed appointment still takes its service date from that appointment. Amounts, allocation, attribution, permissions and the append-only posture are unchanged.';
