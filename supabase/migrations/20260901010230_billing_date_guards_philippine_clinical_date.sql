-- Billing date-derivation correction, part two. Authorized by the controller
-- during task 9 review round 3, after round 2 fixed the same expression in
-- public.post_charge. Forward-only; every applied migration is left untouched
-- and each replacement is guarded, verified to occur exactly once, and fails
-- closed on 55000.
--
-- THE DEFECT, in three more places
--
-- The database runs in UTC. The clinical stack derives its date as
-- timezone('Asia/Manila', statement_timestamp())::date. These three functions
-- still derived it as statement_timestamp()::date, so between 16:00 and 24:00
-- UTC - which for a Philippine clinic is 00:00 to 08:00 Manila, the whole
-- morning session - they disagreed with every clinical record in the system.
--
-- Measured on the live database while writing this migration:
--
--   manila_today | utc_today  | manila_today_rejected_as_future | pdc_days_utc | pdc_days_manila
--   2026-09-02   | 2026-09-01 | t                               |            9 |               8
--
-- 1. public.post_charge_with_attribution_override
--      if p_service_date > statement_timestamp()::date then raise invalid_parameter_value
--    A clinician entering TODAY'S date during the morning session was told the
--    date was in the future and the write was refused. This is worse than the
--    posting-date bug repaired in 20260901010220: a wrongly recorded date can be
--    corrected afterwards, while a false rejection blocks the work outright and
--    gives a reason that is not true.
--
-- 2. public.correct_charge_attribution
--      if p_corrected_service_date > statement_timestamp()::date
--    The same false rejection on the correction path - so the very route out of
--    a mis-dated charge was itself shut during those eight hours.
--
-- 3. public.list_pending_pdc
--      (cheque.date_due - statement_timestamp()::date)::integer
--    Read-only, and merely off by one: a cheque due in eight days was reported
--    as nine. Included because it is the same expression in the same round and
--    costs nothing.
--
-- SCOPE
--
-- Only the date derivation changes. No amount, allocation, attribution rule,
-- permission, grant, or append-only guarantee is touched, and CREATE OR REPLACE
-- preserves each function's ACL, SECURITY DEFINER flag and empty search_path.
-- The bounds checks themselves are unchanged: a service date in the future is
-- still refused, and a post-dated cheque is still counted down to its due date.
-- Only the definition of "today" moves, from the server's timezone to the
-- clinic's.
--
-- NOT CHANGED, and deliberately so. The same bare expression appears in seven
-- patient-domain birth-date guards and in
-- public.get_treatment_plan_completion_context. The controller ruled those out
-- of scope for this task: their breadth shows this is a repository-wide
-- timezone convention defect rather than a set of individual bugs, and the right
-- response is one deliberate sweep with its own review. The recommended shape of
-- that sweep is recorded in docs/AI_HANDOFF.md: a shared private.clinic_today()
-- helper plus a lint that fails on any new bare statement_timestamp()::date or
-- current_date in a clinical or financial path.
--
-- This migration grants and revokes nothing.

do $migration$
declare
  v_signatures text[] := array[
    'public.post_charge_with_attribution_override(uuid,uuid,uuid,date,uuid,uuid,bigint,uuid,boolean,text,text,text)',
    'public.correct_charge_attribution(uuid,uuid,uuid,date,text,text)',
    'public.list_pending_pdc(uuid,uuid)'
  ];
  v_targets text[] := array[
    'if p_service_date > statement_timestamp()::date then',
    'if p_corrected_service_date > statement_timestamp()::date',
    '(cheque.date_due - statement_timestamp()::date)::integer'
  ];
  v_replacements text[] := array[
    'if p_service_date > (pg_catalog.timezone(''Asia/Manila'', pg_catalog.statement_timestamp()))::date then',
    'if p_corrected_service_date > (pg_catalog.timezone(''Asia/Manila'', pg_catalog.statement_timestamp()))::date',
    '(cheque.date_due - (pg_catalog.timezone(''Asia/Manila'', pg_catalog.statement_timestamp()))::date)::integer'
  ];
  v_index integer;
  v_definition text;
  v_repaired text;
  v_target text;
  v_replacement text;
  v_occurrences integer;
begin
  for v_index in 1 .. pg_catalog.array_length(v_signatures, 1) loop
    -- Normalized on both sides: the stored body carries the newline convention
    -- of the machine that applied it, and this file is checked out with the
    -- convention of the machine replaying it.
    select pg_catalog.replace(
      pg_catalog.pg_get_functiondef(v_signatures[v_index]::regprocedure),
      pg_catalog.chr(13) || pg_catalog.chr(10),
      pg_catalog.chr(10)
    ) into v_definition;

    v_target := pg_catalog.replace(
      v_targets[v_index], pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
    v_replacement := pg_catalog.replace(
      v_replacements[v_index], pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

    -- Exact substring counting, never a regex: an unescaped metacharacter in a
    -- SQL anchor would make the count meaningless.
    v_occurrences := (pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_target, '')))
      / pg_catalog.length(v_target);

    if v_occurrences <> 1 then
      raise exception using errcode = '55000',
        message = v_signatures[v_index]
                  || ' UTC date derivation expected exactly once, found '
                  || v_occurrences::text;
    end if;

    if pg_catalog.strpos(v_definition, 'Asia/Manila') <> 0 then
      raise exception using errcode = '55000',
        message = v_signatures[v_index] || ' already derives a Philippine date';
    end if;

    v_repaired := pg_catalog.replace(v_definition, v_target, v_replacement);

    if v_repaired = v_definition then
      raise exception using errcode = '55000',
        message = v_signatures[v_index] || ' date replacement made no change';
    end if;

    -- No server-timezone date may survive anywhere in the repaired body.
    if pg_catalog.strpos(v_repaired, 'statement_timestamp()::date') <> 0
       or pg_catalog.strpos(v_repaired, 'current_date') <> 0 then
      raise exception using errcode = '55000',
        message = v_signatures[v_index]
                  || ' still derives a date from the server timezone';
    end if;

    execute v_repaired;
  end loop;
end
$migration$;

comment on function public.post_charge_with_attribution_override(uuid, uuid, uuid, date, uuid, uuid, bigint, uuid, boolean, text, text, text) is
  'Posts one immutable charge with an explicit service date and attribution override. A future service date is still refused, but "future" is now measured against the Philippine clinical date rather than the UTC date, so a clinician entering today''s date during the 00:00-08:00 Manila window is no longer told it is in the future. Amounts, allocation, attribution rules, permissions and the append-only posture are unchanged.';

comment on function public.correct_charge_attribution(uuid, uuid, uuid, date, text, text) is
  'Corrects the attribution and service date of an existing charge under a bounded mandatory reason. A future corrected service date is still refused, measured against the Philippine clinical date rather than the UTC date, so the route out of a mis-dated charge is no longer itself closed during the 00:00-08:00 Manila window. The correction remains append-only and the reason remains mandatory.';

comment on function public.list_pending_pdc(uuid, uuid) is
  'Bounded read-only projection of pending post-dated cheques for the acting branch. Days until due are counted from the Philippine clinical date rather than the UTC date, so the countdown is no longer one day long during the 00:00-08:00 Manila window. Writes no audit event and grants no base-table access.';
