-- Task 16 review I1: close the TOCTOU window in the drawing retirement.
--
-- `20260901010500` counts unrecognized rows and then deletes, as two statements
-- in one `DO` block. Under READ COMMITTED a row COMMITTED BETWEEN THEM is
-- invisible to the preflight's snapshot and is then deleted by the unqualified
-- `delete` - the one outcome the whole design exists to make impossible.
--
-- The window is narrow but real, and it is widest exactly where it matters: the
-- revoke of `public.save_treatment_plan_drawing` lives in `20260901010501`,
-- which sorts AFTER `…010500`, so throughout `…010500` the browser role still
-- holds `execute` on the writer.
--
-- This is the forward-only fix. `…010500` is applied and is NOT edited. This
-- file re-runs the identical fail-closed preflight and delete, with one
-- difference:
--
--   LOCK TABLE public.treatment_plan_drawings IN ACCESS EXCLUSIVE MODE
--
-- taken as the FIRST statement inside the block, before the count. Nothing can
-- commit a row into the table between the count and the delete, because nothing
-- can touch the table at all until this transaction ends. By the time this file
-- runs, `…010501` has already revoked the writer and `…010500` has installed
-- the tombstone triggers, so this sweep is belt, braces and a locked door.
--
-- The recognition rule below is character-for-character the one in `…010500`.
-- If the two ever diverge, the one that deletes is this one.
--
-- DEPLOY NOTE. In any environment that has ever held rows, apply
-- `20260901010501` (the revoke) BEFORE `20260901010500` (the delete), so no
-- browser role can write a row during the unlocked preflight. Alphabetical
-- migration order does the opposite; on a fresh chain that is harmless because
-- this locked sweep runs last and would catch anything `…010500` raced past,
-- but on a populated database the manual ordering is the safer path.

do $migration$
declare
  v_unrecognized bigint;
  v_recognized bigint;
begin
  -- ----------------------------------------------------------------------
  -- 0. THE LOCK. First statement in the block, before anything is counted.
  --    Held to the end of the transaction, so the count and the delete see
  --    the same table and no concurrent writer can slip a row between them.
  -- ----------------------------------------------------------------------
  lock table public.treatment_plan_drawings in access exclusive mode;

  -- ----------------------------------------------------------------------
  -- 0b. `20260901010500` installed the tombstone guards AFTER its own delete,
  --     for the same reason this has to suspend them: a guard that refuses
  --     every mutation refuses the retirement's own sweep too. DDL is
  --     transactional, and the lock above already excludes every other
  --     session, so the table is unreachable by anyone else while the guard
  --     is off. Any raise below aborts the transaction and restores it.
  -- ----------------------------------------------------------------------
  alter table public.treatment_plan_drawings
    disable trigger treatment_plan_drawings_retired_row_guard;

  -- ----------------------------------------------------------------------
  -- 1. PREFLIGHT. Fail closed, before any deletion.
  --
  -- Identical to 20260901010500. A row is recognized only when its plan
  -- resolves, in the row's own organization, to one of the two deterministic
  -- synthetic fixture organizations declared in supabase/seed.sql, matched on
  -- id AND slug AND legal name together. Everything else is unrecognized and
  -- aborts the migration before a single row is removed.
  -- ----------------------------------------------------------------------
  select count(*)
  into v_unrecognized
  from public.treatment_plan_drawings as drawing
  where not exists (
    select 1
    from public.treatment_plans as plan
    join public.organizations as fixture
      on fixture.id = plan.organization_id
    where plan.id = drawing.plan_id
      and plan.organization_id = drawing.organization_id
      and (fixture.id, fixture.slug, fixture.legal_name) in (
        (
          '22000000-0000-0000-0000-000000000001'::uuid,
          'smilelab-demo-dental',
          'SmileLab Demo Dental (Synthetic)'
        ),
        (
          '22000000-0000-0000-0000-000000000002'::uuid,
          'other-dental-demo',
          'Other Dental Demo (Synthetic)'
        )
      )
  );

  if v_unrecognized > 0 then
    raise exception
      'treatment plan drawing retirement aborted before deleting anything'
      using
        errcode = 'raise_exception',
        detail = format(
          '%s treatment_plan_drawings row(s) are not linked to a repository synthetic fixture.',
          v_unrecognized
        ),
        hint = 'Review and migrate those rows deliberately. Do not widen the recognition rule to make this pass.';
  end if;

  -- ----------------------------------------------------------------------
  -- 2. Delete. Every remaining row was positively recognized above, under a
  --    lock that no other transaction could have written through.
  --    The count is reported; the content never is.
  -- ----------------------------------------------------------------------
  delete from public.treatment_plan_drawings;
  get diagnostics v_recognized = row_count;

  alter table public.treatment_plan_drawings
    enable trigger treatment_plan_drawings_retired_row_guard;

  raise notice
    'treatment plan drawing locked sweep: % recognized synthetic row(s) deleted.',
    v_recognized;
end;
$migration$;
