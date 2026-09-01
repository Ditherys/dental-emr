-- Unified Clinical Chart workspace, task 7 review round 1.
--
-- Three forward-only repairs, none of which edits an applied migration file:
--
--   1. Staged implant placement. An implant is genuinely built across visits -
--      fixture, months of osseointegration, then abutment, then crown - but
--      20260901010130 could only ever record a chain that begins with its own
--      new fixture. A clinician returning to seat the abutment was offered a
--      submittable form whose payload private.normalize_implant_chain refuses.
--      This migration adds private.normalize_visit_implant_chain, which accepts
--      a root component depending on an EXISTING sealed CURRENT component and
--      revalidates that component server-side against the derived tenant, the
--      patient, the tooth position and the required parent kind.
--
--   2. The "one current fixture per tooth" invariant moves into the database.
--      It previously lived only in the browser's stage picker, so any caller
--      could place a second fixture on an already-implanted tooth. It is now a
--      trigger on public.dental_implant_components that serializes on the tooth
--      identity before it checks, so every insert path - the visit boundary, the
--      superseded v3 path and plan completion - is covered.
--
--   3. The superseded v3 relationship boundaries lose their browser grant.
--      public.record_current_bridge_v3 and
--      public.record_current_implant_component_v3 write encounter_id = null,
--      accept an unbounded client-supplied occurrence time including future
--      dates, and require only patient.clinical.write rather than the
--      billing.charge their replacements require. No production code calls them:
--      the two server actions that did were removed in the same commit. Revoking
--      them closes an encounter-attribution and backdating bypass, and restores
--      the invariant that a null encounter_id means "recorded before the unified
--      clinical chart workspace".
--
-- Every function replacement below uses the repository's pg_get_functiondef
-- guarded-replace pattern: each replace target is verified to occur exactly once
-- and every step fails closed with 55000 if its precondition is not found.

-- ---------------------------------------------------------------------------
-- 1. The staged-chain normalizer
-- ---------------------------------------------------------------------------

create function private.normalize_visit_implant_chain(
  p_organization_id uuid,
  p_patient_id uuid,
  p_components jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_count integer;
  v_row record;
  v_tooth text;
  v_kinds text[] := array[]::text[];
  v_result jsonb := '[]'::jsonb;
  v_parent_id uuid;
  v_parent_kind text;
  v_required_parent text;
begin
  if pg_catalog.jsonb_typeof(p_components) <> 'array' then
    raise invalid_parameter_value using message = 'invalid implant chain';
  end if;
  v_count := pg_catalog.jsonb_array_length(p_components);
  if v_count not between 1 and 4 then
    raise invalid_parameter_value using message = 'invalid implant chain';
  end if;

  for v_row in
    select value as node, ordinality::integer as position
    from pg_catalog.jsonb_array_elements(p_components) with ordinality
    order by ordinality
  loop
    if pg_catalog.jsonb_typeof(v_row.node) <> 'object'
       or nullif(v_row.node->>'ordinal','')::integer is distinct from v_row.position
       or (v_row.node->>'tooth_fdi') is null
       or not ((v_row.node->>'tooth_fdi') ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
       or (v_row.node->>'component_kind') not in ('FIXTURE','ABUTMENT','CROWN','ATTACHMENT') then
      raise invalid_parameter_value using message = 'invalid implant chain';
    end if;
    if v_tooth is null then v_tooth := v_row.node->>'tooth_fdi'; end if;
    if v_row.node->>'tooth_fdi' <> v_tooth then
      raise invalid_parameter_value using message = 'invalid implant chain';
    end if;

    if (v_row.node->>'component_kind') = 'ATTACHMENT' then
      if coalesce((v_row.node->>'attachment_value') not in ('locator','bar'), true) then
        raise invalid_parameter_value using message = 'invalid implant chain';
      end if;
    elsif nullif(v_row.node->>'attachment_value','') is not null then
      raise invalid_parameter_value using message = 'invalid implant chain';
    end if;

    if v_row.position = 1 then
      if (v_row.node->>'component_kind') = 'FIXTURE' then
        -- A chain that places its own fixture depends on nothing. The
        -- one-fixture-per-tooth invariant is enforced by the trigger below.
        if nullif(v_row.node->>'depends_on_ordinal','') is not null
           or nullif(v_row.node->>'depends_on_component_id','') is not null then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
      else
        -- A staged continuation. The named component is revalidated here, not
        -- trusted: it must be a live CURRENT component of the SAME tenant, the
        -- SAME patient and the SAME tooth position, and of exactly the kind this
        -- component may sit on.
        if nullif(v_row.node->>'depends_on_ordinal','') is not null
           or nullif(v_row.node->>'depends_on_component_id','') is null then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
        v_required_parent := case
          when (v_row.node->>'component_kind') = 'ABUTMENT' then 'FIXTURE'
          else 'ABUTMENT'
        end;
        begin
          v_parent_id := (v_row.node->>'depends_on_component_id')::uuid;
        exception when invalid_text_representation then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end;
        select existing.component_kind into v_parent_kind
        from public.dental_implant_components as existing
        where existing.organization_id = p_organization_id
          and existing.id = v_parent_id
          and existing.patient_id = p_patient_id
          and existing.tooth_fdi = v_tooth
          and existing.record_kind = 'CURRENT'
          and existing.sealed_at is not null
          and existing.voided_at is null
          and not exists (
            select 1
            from public.dental_implant_components as successor
            where successor.organization_id = existing.organization_id
              and successor.supersedes_component_id = existing.id
          )
        for key share of existing;
        if v_parent_kind is distinct from v_required_parent then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
      end if;
    else
      if nullif(v_row.node->>'depends_on_component_id','') is not null then
        raise invalid_parameter_value using message = 'invalid implant chain';
      end if;
      declare v_parent integer := nullif(v_row.node->>'depends_on_ordinal','')::integer;
      begin
        if v_parent is null or v_parent < 1 or v_parent >= v_row.position then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
        if (v_row.node->>'component_kind') = 'ABUTMENT' and v_kinds[v_parent] <> 'FIXTURE' then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
        if (v_row.node->>'component_kind') in ('CROWN','ATTACHMENT') and v_kinds[v_parent] <> 'ABUTMENT' then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
      end;
    end if;

    v_kinds := pg_catalog.array_append(v_kinds, v_row.node->>'component_kind');
    v_result := v_result || pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'tooth_fdi', v_tooth,
      'ordinal', v_row.position,
      'component_kind', v_row.node->>'component_kind',
      'attachment_value', nullif(v_row.node->>'attachment_value',''),
      'depends_on_ordinal', nullif(v_row.node->>'depends_on_ordinal','')::integer,
      'depends_on_component_id', nullif(v_row.node->>'depends_on_component_id',''),
      'provenance', nullif(v_row.node->>'provenance','')
    )));
  end loop;

  return v_result;
exception when invalid_text_representation then
  raise invalid_parameter_value using message = 'invalid implant chain';
end;
$$;

revoke all on function private.normalize_visit_implant_chain(uuid,uuid,jsonb)
from public, anon, authenticated, service_role;

comment on function private.normalize_visit_implant_chain(uuid,uuid,jsonb) is
  'Validates and normalizes an implant chain that may continue an existing one. Identical to private.normalize_implant_chain for a chain that places its own fixture; additionally accepts a root ABUTMENT, CROWN or ATTACHMENT carrying depends_on_component_id, which must resolve to a live sealed unvoided unsuperseded CURRENT component of the same organization, patient and tooth position and of exactly the required parent kind. The named component is revalidated against the derived tenant, never trusted from a client.';

-- ---------------------------------------------------------------------------
-- 2. One current fixture per tooth, enforced in the database
-- ---------------------------------------------------------------------------

create function private.reject_duplicate_current_implant_fixture()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- An amendment is a successor that supersedes its predecessor, so it is the
  -- one legitimate way a second CURRENT fixture row appears on a tooth.
  if new.supersedes_component_id is not null then
    return new;
  end if;

  -- Serialize on the tooth identity before reading, so two concurrent inserts
  -- cannot both observe an empty tooth and both place a fixture. Every insert
  -- path takes this lock, and each transaction takes at most one - the chain
  -- normalizers bound a chain to a single tooth position - so no deadlock cycle
  -- is constructible on this key space.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      new.organization_id::text || ':' || new.patient_id::text || ':' || new.tooth_fdi,
      5
    )
  );

  if exists (
    select 1
    from public.dental_implant_components as existing
    where existing.organization_id = new.organization_id
      and existing.patient_id = new.patient_id
      and existing.tooth_fdi = new.tooth_fdi
      and existing.record_kind = 'CURRENT'
      and existing.component_kind = 'FIXTURE'
      and existing.id <> new.id
      and existing.voided_at is null
      and not exists (
        select 1
        from public.dental_implant_components as successor
        where successor.organization_id = existing.organization_id
          and successor.supersedes_component_id = existing.id
      )
  ) then
    raise exception using
      errcode = '23505',
      message = 'tooth already carries a current implant fixture';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_duplicate_current_implant_fixture()
from public, anon, authenticated, service_role;

create trigger dental_implant_components_single_current_fixture
before insert on public.dental_implant_components
for each row
when (new.record_kind = 'CURRENT' and new.component_kind = 'FIXTURE')
execute function private.reject_duplicate_current_implant_fixture();

-- ---------------------------------------------------------------------------
-- 3. The visit-bound implant boundary learns the staged chain
-- ---------------------------------------------------------------------------

do $migration$
declare
  v_definition text;
  v_repaired text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_visit_implant_component_v2(uuid,uuid,jsonb,date,uuid,text,text)'::regprocedure
  ) into v_definition;

  -- Step 1: validate through the staged-chain normalizer, which additionally
  -- revalidates a named existing component against the derived tenant.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'private\.normalize_implant_chain\(p_components\)', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'record_visit_implant_component_v2 chain-normalizer precondition not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$private.normalize_implant_chain(p_components)$old$,
    $new$private.normalize_visit_implant_chain(v_organization_id, p_patient_id, p_components)$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'record_visit_implant_component_v2 chain-normalizer replacement made no change';
  end if;
  v_definition := v_repaired;

  -- Step 2: resolve a staged root's parent from the named existing component.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'when v_node \? ''depends_on_ordinal'' then v_ids\[', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'record_visit_implant_component_v2 parent-resolution precondition not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$when v_node ? 'depends_on_ordinal' then v_ids[(v_node->>'depends_on_ordinal')::integer]$old$,
    $new$when v_node ? 'depends_on_ordinal' then v_ids[(v_node->>'depends_on_ordinal')::integer] when v_node ? 'depends_on_component_id' then (v_node->>'depends_on_component_id')::uuid$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'record_visit_implant_component_v2 parent-resolution replacement made no change';
  end if;

  execute v_repaired;
end
$migration$;

comment on function public.record_visit_implant_component_v2(uuid,uuid,jsonb,date,uuid,text,text) is
  'The visit-bound browser boundary for recording a CURRENT implant chain, including a chain that continues an existing one across visits. It derives organization, actor, treating provider and the Philippine clinical date on the server, requires live patient.clinical.write and billing.charge at an active acting branch plus an active linked provider there, and validates the patient and the named charge against the derived tenant. private.normalize_visit_implant_chain revalidates the fixture/abutment/crown dependency chain and, for a staged continuation, revalidates the named existing component against the derived tenant, the patient, the tooth position and the required parent kind. A second CURRENT fixture on an already-implanted tooth is refused by a database trigger, not by the browser. A pre-existing external placeholder is refused because it records no work done at a visit. The encounter comes from public.start_or_resume_clinical_visit, and the visit linkage, the stated service date and the bounded note are written with the original rows. A replayed request key returns the stored identity; the same key with a different payload is refused. No organization, provider, actor or encounter may be supplied by a client.';

-- ---------------------------------------------------------------------------
-- 4. The composer projection reports the component a staged chain attaches to
-- ---------------------------------------------------------------------------

do $migration$
declare
  v_definition text;
  v_repaired text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_clinical_composer_context(uuid,uuid)'::regprocedure
  ) into v_definition;

  -- Step 1: schema-qualify the one unqualified aggregate in an empty-search_path
  -- body, so the file keeps its own convention throughout.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, '\(array_agg\(component\.component_kind order by component\.ordinal desc\)\)\[1\] as stage', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'get_clinical_composer_context aggregate precondition not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$(array_agg(component.component_kind order by component.ordinal desc))[1] as stage$old$,
    $new$(pg_catalog.array_agg(component.component_kind order by component.ordinal desc))[1] as stage$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'get_clinical_composer_context aggregate replacement made no change';
  end if;
  v_definition := v_repaired;

  -- Step 2: add the tip projection - the stage each tooth reached AND the
  -- component id a staged continuation must attach to. The write boundary
  -- revalidates whichever id it is given, so this only decides what may be
  -- offered.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, '''implant_stage_by_tooth'', coalesce\(\(', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'get_clinical_composer_context tip-projection precondition not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$'implant_stage_by_tooth', coalesce(($old$,
    $new$'implant_tip_by_tooth', coalesce((select pg_catalog.jsonb_object_agg(tip.tooth_fdi, pg_catalog.jsonb_build_object('stage', tip.stage, 'component_id', tip.component_id)) from (select component.tooth_fdi, (pg_catalog.array_agg(component.component_kind order by component.ordinal desc))[1] as stage, (pg_catalog.array_agg(component.id order by component.ordinal desc))[1] as component_id from public.dental_implant_components as component where component.organization_id = v_organization_id and component.patient_id = p_patient_id and component.record_kind = 'CURRENT' and component.sealed_at is not null and component.voided_at is null and not exists (select 1 from public.dental_implant_components as successor where successor.organization_id = component.organization_id and successor.supersedes_component_id = component.id) group by component.tooth_fdi) as tip), '{}'::jsonb), 'implant_stage_by_tooth', coalesce(($new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'get_clinical_composer_context tip-projection replacement made no change';
  end if;

  execute v_repaired;
end
$migration$;

-- ---------------------------------------------------------------------------
-- 5. Retire the superseded v3 relationship boundaries from every browser role
-- ---------------------------------------------------------------------------
--
-- They remain in the catalog so historical migrations and the reviewed O5
-- behavioural suites stay inspectable, but no browser role may execute them.
-- The two server actions that reached them were removed in the same commit.

revoke all on function public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,uuid,text)
from public, anon, authenticated, service_role;

revoke all on function public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,uuid,text)
from public, anon, authenticated, service_role;

comment on function public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,uuid,text) is
  'Superseded by public.record_visit_bridge_v2 and no longer reachable from any browser role. It opens no clinical visit, writes encounter_id = null, and accepts an unbounded client-supplied occurrence time, so leaving it granted would have bypassed the managed-visit encounter attribution and the one-year backdating window the visit-bound boundary enforces.';

comment on function public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,uuid,text) is
  'Superseded by public.record_visit_implant_component_v2 and no longer reachable from any browser role. It opens no clinical visit, writes encounter_id = null, and accepts an unbounded client-supplied occurrence time, so leaving it granted would have bypassed the managed-visit encounter attribution and the one-year backdating window the visit-bound boundary enforces.';
