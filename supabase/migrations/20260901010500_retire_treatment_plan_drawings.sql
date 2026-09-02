-- Task 16: retire the treatment-plan freehand drawing canvas.
--
-- Freehand drawing is excluded from the unified clinical chart workspace. The
-- canvas was never a canonical clinical record - it is renderer-shaped ink on
-- top of one - and the workspace records anatomy, findings and periodontal
-- measurement in typed, constrained, attributable columns instead.
--
-- THIS FILE DELETES CLINICAL-ADJACENT ROWS. Nothing else in this plan does.
-- The design is therefore fail-closed and its ordering is load-bearing:
--
--   1. a PREFLIGHT positively identifies every remaining row as belonging to
--      one of the repository's two deterministic synthetic fixture
--      organizations. If ONE row cannot be identified, the whole migration
--      aborts and NOTHING is deleted. A migration that deletes what it
--      recognizes and leaves the rest would be wrong; one that deletes what it
--      does not recognize would be much worse;
--   2. only then are the recognized rows deleted, and only the COUNT is
--      reported. A drawing is patient-adjacent data and does not belong in a
--      migration notice, a log line or an audit record;
--   3. only then is the emptied table sealed as a revoked compatibility
--      tombstone. It is deliberately NOT dropped in this window, so a
--      deployment that still knows the name gets a refusal rather than an
--      "undefined table" it might interpret as a schema mismatch;
--   4. only then do the treatment-plan projections stop reading it.
--
-- The trigger is created AFTER the delete on purpose: sealing first would make
-- this migration's own delete impossible.

do $migration$
declare
  v_unrecognized bigint;
  v_recognized bigint;
begin
  -- ----------------------------------------------------------------------
  -- 1. PREFLIGHT. Fail closed, before any deletion.
  --
  -- The recognition rule is narrow and POSITIVE: a row is recognized only
  -- when its plan resolves, in the row's own organization, to one of the two
  -- deterministic synthetic fixture organizations declared in
  -- supabase/seed.sql, matched on id AND slug AND legal name together. An id
  -- alone would recognize a real organization that happened to be restored
  -- under a fixture identifier.
  --
  -- Everything else is unrecognized, including a drawing whose plan is
  -- missing, whose plan belongs to another organization, or whose
  -- organization is any real tenant.
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
  -- 2. Delete. Every remaining row was positively recognized above.
  --    The count is reported; the content never is.
  -- ----------------------------------------------------------------------
  delete from public.treatment_plan_drawings;
  get diagnostics v_recognized = row_count;

  raise notice
    'treatment plan drawing retirement: % recognized synthetic row(s) deleted.',
    v_recognized;
end;
$migration$;

-- --------------------------------------------------------------------------
-- 3. The compatibility tombstone.
--
-- The table stays, empty, RLS-enabled, with no browser grant and no policy,
-- and now refuses every mutation from every role including its owner. A
-- SECURITY DEFINER writer that still exists cannot get a row past this.
-- --------------------------------------------------------------------------

create function private.reject_treatment_plan_drawing_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise insufficient_privilege using message = 'treatment plan drawings are retired';
  return null;
end;
$$;

revoke all on function private.reject_treatment_plan_drawing_mutation()
from public, anon, authenticated, service_role;

comment on function private.reject_treatment_plan_drawing_mutation() is
  'Tombstone guard for the retired treatment-plan drawing canvas. Refuses every insert, update, delete and truncate so the emptied table cannot be repopulated while it remains for compatibility.';

create trigger treatment_plan_drawings_retired_row_guard
before insert or update or delete on public.treatment_plan_drawings
for each row execute function private.reject_treatment_plan_drawing_mutation();

create trigger treatment_plan_drawings_retired_truncate_guard
before truncate on public.treatment_plan_drawings
for each statement execute function private.reject_treatment_plan_drawing_mutation();

comment on table public.treatment_plan_drawings is
  'RETIRED (task 16). Emptied compatibility tombstone for the freehand plan drawing canvas: no row, no browser grant, no policy, and a trigger that refuses every mutation. Structured treatment-plan history lives in treatment_plans, treatment_plan_items, treatment_plan_alternatives and treatment_plan_discussions and is unaffected.';

-- --------------------------------------------------------------------------
-- 4. The projections stop reading the tombstone.
--
-- Guarded forward-only replaces. Each one fetches the LIVE definition, strips
-- carriage returns from BOTH the definition and its anchors - a CRLF checkout
-- otherwise makes a multi-line anchor unmatchable, which task 15 proved the
-- hard way - asserts the anchor is present exactly once, and asserts the
-- replacement actually removed the reference before executing it. Applying
-- twice is a no-op.
-- --------------------------------------------------------------------------

do $projection$
declare
  v_definition text;
  v_anchor text;
  v_replacement text;
  v_next text;
begin
  v_definition := replace(
    pg_get_functiondef('public.get_treatment_plan_detail(uuid,uuid)'::regprocedure),
    chr(13),
    ''
  );

  if position('treatment_plan_drawings' in v_definition) = 0 then
    return; -- already retired
  end if;

  v_anchor := replace($anchor$,'drawing',(select jsonb_build_object('drawingId',drawing.id,'drawing',drawing.drawing,'updatedBy',drawing.updated_by,'updatedAt',drawing.updated_at,'version',drawing.version) from public.treatment_plan_drawings drawing where drawing.organization_id=plan.organization_id and drawing.plan_id=plan.id limit 1)$anchor$, chr(13), '');
  -- The key survives with a null value. Removing it outright would break the
  -- strict projection schema the application parses this with, which is a
  -- separate reviewed change; what matters here is that no drawing content can
  -- reach a client and that the tombstone is no longer read.
  v_replacement := $replacement$,'drawing',null::jsonb$replacement$;

  if position(v_anchor in v_definition) = 0 then
    raise exception 'unexpected public.get_treatment_plan_detail definition'
      using errcode = '55000';
  end if;

  v_next := replace(v_definition, v_anchor, v_replacement);

  if position('treatment_plan_drawings' in v_next) > 0 then
    raise exception 'public.get_treatment_plan_detail still reads the retired drawing table'
      using errcode = '55000';
  end if;

  execute v_next;
end;
$projection$;

do $projection$
declare
  v_definition text;
  v_anchor text;
  v_next text;
begin
  v_definition := replace(
    pg_get_functiondef('public.list_treatment_plans(uuid,uuid)'::regprocedure),
    chr(13),
    ''
  );

  if position('treatment_plan_drawings' in v_definition) = 0 then
    return;
  end if;

  v_anchor := replace($anchor$  left join lateral (
    select true as has_drawing
    from public.treatment_plan_drawings as drawing
    where drawing.organization_id = plan.organization_id
      and drawing.plan_id = plan.id
    limit 1
  ) as drawing_count on true
$anchor$, chr(13), '');

  if position(v_anchor in v_definition) = 0 then
    raise exception 'unexpected public.list_treatment_plans definition'
      using errcode = '55000';
  end if;

  v_next := replace(v_definition, v_anchor, '');
  v_next := replace(
    v_next,
    replace($column$    coalesce(drawing_count.has_drawing, false)$column$, chr(13), ''),
    '    false'
  );

  if position('treatment_plan_drawings' in v_next) > 0
     or position('drawing_count' in v_next) > 0 then
    raise exception 'public.list_treatment_plans still reads the retired drawing table'
      using errcode = '55000';
  end if;

  execute v_next;
end;
$projection$;

do $projection$
declare
  v_definition text;
  v_anchor text;
  v_next text;
begin
  v_definition := replace(
    pg_get_functiondef('public.generate_document(uuid,uuid,text,jsonb)'::regprocedure),
    chr(13),
    ''
  );

  if position('treatment_plan_drawings' in v_definition) = 0 then
    return;
  end if;

  v_anchor := replace($anchor$    if v_include_set ? 'drawing' then
      v_snapshot := v_snapshot || jsonb_build_object(
        'drawing', (
          select jsonb_build_object(
            'drawingId', drawing.id,
            'drawing', drawing.drawing,
            'updatedBy', drawing.updated_by,
            'updatedAt', drawing.updated_at,
            'version', drawing.version
          )
          from public.treatment_plan_drawings as drawing
          where drawing.organization_id = v_organization_id
            and drawing.plan_id = v_plan_id
          limit 1
        )
      );
    end if;
$anchor$, chr(13), '');

  if position(v_anchor in v_definition) = 0 then
    raise exception 'unexpected public.generate_document definition'
      using errcode = '55000';
  end if;

  -- `drawing` stays in the accepted include-key allowlist so an existing
  -- caller is not rejected; it simply contributes nothing to the snapshot.
  v_next := replace(v_definition, v_anchor, '');

  if position('treatment_plan_drawings' in v_next) > 0 then
    raise exception 'public.generate_document still reads the retired drawing table'
      using errcode = '55000';
  end if;

  execute v_next;
end;
$projection$;

-- The three replaced functions keep the privileges their original terminal
-- migrations granted; CREATE OR REPLACE does not reset them. Nothing here
-- widens a boundary. `public.save_treatment_plan_drawing` is revoked by the
-- paired grants migration.
