-- Unified Clinical Chart workspace, task 11: the versioned periodontal
-- examination workflows.
--
-- Forward-only. Nothing applied is edited; the three shipped periodontal
-- boundaries are repaired in place with the guarded-replace pattern, every
-- target verified to occur exactly the expected number of times and every step
-- failing closed on 55000.
--
-- What this migration adds, and why each part exists:
--
-- 1. private.periodontal_workflow_idempotency. An actor-scoped request-key
--    store so a replayed submission returns the original result instead of
--    opening a second draft, writing a second batch, or finalizing twice.
--
-- 2. private.resolve_actor_provider_at_branch. private.resolve_actor_provider
--    ignores the acting branch and provider_branches.is_active entirely and
--    picks the oldest active provider row linked to the actor anywhere in the
--    organization. The two shipped boundaries that used it are moved onto this
--    branch-aware replacement, which still returns NULL when the actor holds no
--    active link at the acting branch, so their existing contract - an actor
--    without a link is attributed to NO provider - is preserved exactly while
--    the branch and is_active blind spots close. The v2 boundaries below do not
--    use it: they call private.require_active_actor_provider and refuse
--    outright, because every clinical write in this workspace derives a real
--    treating provider or does not happen.
--
-- 3. private.periodontal_tooth_reductions and
--    private.periodontal_derived_classification. The trusted server-side
--    recomputation of the 2017/2018 classification from canonical rows. It is
--    the SQL counterpart of the reviewed pure port in
--    src/lib/odontogram/perio-classification.ts and carries the same two
--    properties: it is deterministic, and an unmeasured site is excluded from
--    every numerator AND every denominator rather than contributing a zero.
--    Finalization uses it; a client-calculated diagnosis is never accepted as
--    truth.
--
-- 4. Repairs to the three shipped boundaries:
--    a. public.create_periodontal_examination and
--       public.finalize_periodontal_examination move to the branch-aware
--       provider resolution, and finalization stops falling back to the
--       examined provider. That fallback was an authorization defect: an actor
--       with no provider link could finalize a DRAFT another clinician opened
--       and the immutable record was attributed to THAT clinician's provider.
--    b. public.save_periodontal_measurements stops coalescing an omitted
--       gingival margin to 0 and an omitted bleeding, suppuration, or plaque
--       assessment to false. Task 9 made NULL the single representation of
--       unknown and every calculation carries it through; this RPC was the one
--       place that destroyed it.
--
-- 5. The four versioned v2 write boundaries. They accept no organization, no
--    provider, no actor and no encounter from a client, serialize per
--    examination on a distinct advisory-lock key space, and increment the
--    examination version exactly once per accepted batch.
--
-- This migration grants nothing. 20260901010241 owns the browser boundary.

-- ---------------------------------------------------------------------------
-- 1. Request keys
-- ---------------------------------------------------------------------------

create table private.periodontal_workflow_idempotency (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (operation in ('DRAFT', 'SAVE', 'FINALIZE', 'AMEND')),
  idempotency_key uuid not null,
  examination_id uuid,
  encounter_id uuid,
  result_version integer,
  saved_sites integer,
  saved_plaque integer,
  saved_tooth integer,
  saved_furcation integer,
  resumed boolean,
  adopted boolean,
  derived_diagnosis text,
  confirmed_diagnosis text,
  overridden boolean,
  created_at timestamptz not null default statement_timestamp(),
  primary key (organization_id, actor_user_id, operation, idempotency_key),
  foreign key (organization_id, examination_id)
    references public.periodontal_examinations (organization_id, id) on delete restrict,
  foreign key (organization_id, encounter_id)
    references public.clinical_encounters (organization_id, id) on delete restrict
);

revoke all on table private.periodontal_workflow_idempotency
from public, anon, authenticated, service_role;

comment on table private.periodontal_workflow_idempotency is
  'Actor-scoped request keys for the versioned periodontal workflows. A replayed submission returns the stored result instead of opening a second draft, writing a second batch, finalizing twice, or amending twice. It stores identities, counters and classification codes only - never a measurement. Never readable by a browser role.';

-- ---------------------------------------------------------------------------
-- 2. Branch-aware provider resolution that still tolerates no link
-- ---------------------------------------------------------------------------

create function private.resolve_actor_provider_at_branch(
  p_organization_id uuid,
  p_branch_id uuid,
  p_actor_user_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select provider.id
  from public.providers as provider
  join public.provider_branches as provider_branch
    on provider_branch.organization_id = provider.organization_id
   and provider_branch.provider_id = provider.id
  where provider.organization_id = p_organization_id
    and provider.linked_user_id = p_actor_user_id
    and provider.status = 'active'
    and provider_branch.branch_id = p_branch_id
    and provider_branch.is_active
  order by provider.created_at, provider.id
  limit 1;
$$;

revoke all on function private.resolve_actor_provider_at_branch(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

comment on function private.resolve_actor_provider_at_branch(uuid, uuid, uuid) is
  'The acting provider of a signed-in user AT one branch: an active provider row in the given organization linked to that user, with an active provider_branches row for that branch. Returns NULL when there is none, so a caller whose contract tolerates an actor with no provider link keeps that contract while gaining the branch and is_active checks private.resolve_actor_provider never made. A caller that must refuse instead uses private.require_active_actor_provider.';

-- ---------------------------------------------------------------------------
-- 3. The canonical current-state guard, factored out of the shipped boundary
-- ---------------------------------------------------------------------------

create function private.periodontal_current_state_conflict(
  p_organization_id uuid,
  p_patient_id uuid,
  p_tooth_fdi text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.tooth_clinical_entries as entry
    where entry.organization_id = p_organization_id
      and entry.patient_id = p_patient_id
      and entry.tooth_code = p_tooth_fdi
      and entry.lifecycle = 'OPEN'
      and entry.voided_at is null
      and not exists (
        select 1
        from public.tooth_clinical_entry_voids as void_event
        where void_event.organization_id = entry.organization_id
          and void_event.entry_id = entry.id
      )
      and not exists (
        select 1
        from public.tooth_clinical_entries as successor
        where successor.organization_id = entry.organization_id
          and successor.supersedes_entry_id = entry.id
      )
      and (
        entry.clinical_code = 'MISSING'
        or (
          entry.clinical_code = 'TOOTH_STATE'
          and exists (
            select 1
            from public.tooth_clinical_entry_details as detail
            where detail.organization_id = entry.organization_id
              and detail.entry_id = entry.id
              and detail.feature_code = 'TOOTH_STATE'
              and detail.detail->>'state' = 'MISSING'
          )
        )
      )
  ) or exists (
    select 1
    from public.dental_implant_components as component
    where component.organization_id = p_organization_id
      and component.patient_id = p_patient_id
      and component.tooth_fdi = p_tooth_fdi
      and component.record_kind = 'CURRENT'
      and component.component_kind = 'FIXTURE'
      and component.depends_on_component_id is null
      and component.voided_at is null
      and not exists (
        select 1
        from public.dental_implant_component_voids as void_event
        where void_event.organization_id = component.organization_id
          and void_event.component_id = component.id
      )
      and not exists (
        select 1
        from public.dental_implant_components as successor
        where successor.organization_id = component.organization_id
          and successor.supersedes_component_id = component.id
      )
  );
$$;

revoke all on function private.periodontal_current_state_conflict(uuid, uuid, text)
from public, anon, authenticated, service_role;

comment on function private.periodontal_current_state_conflict(uuid, uuid, text) is
  'Whether the canonical current odontogram state refuses a periodontal measurement on this tooth: it is currently recorded MISSING, or it carries a live CURRENT implant fixture chain root. Both liveness tests are append-only aware - the void tables, not a voided_at column, are the authority - and mirror the guard already enforced by public.save_periodontal_measurements so the two boundaries cannot drift apart.';

-- ---------------------------------------------------------------------------
-- 4. Per-tooth reduction of the canonical six-site chart
-- ---------------------------------------------------------------------------

create function private.periodontal_tooth_reductions(
  p_organization_id uuid,
  p_examination_id uuid
)
returns table (
  tooth_fdi text,
  fdi_number integer,
  present boolean,
  implant_context boolean,
  interdental_cal_mm integer,
  buccal_oral_cal_mm integer,
  max_probing_depth_mm integer,
  charted_site_count integer,
  known_cal_site_count integer,
  assessed_bop_site_count integer,
  bleeding_site_count integer,
  complete boolean,
  arch text,
  arch_index integer
)
language sql
stable
set search_path = ''
as $$
  select
    tooth.tooth_fdi,
    tooth.tooth_fdi::integer,
    tooth.tooth_present,
    tooth.implant_context,
    pg_catalog.max(site.cal_mm) filter (where site.site in ('MB', 'DB', 'ML', 'DL')),
    pg_catalog.max(site.cal_mm) filter (where site.site in ('B', 'L')),
    pg_catalog.max(site.probing_depth_mm),
    pg_catalog.count(site.probing_depth_mm)::integer,
    pg_catalog.count(site.cal_mm)::integer,
    pg_catalog.count(site.bleeding_on_probing)::integer,
    pg_catalog.count(*) filter (where site.bleeding_on_probing)::integer,
    pg_catalog.count(site.probing_depth_mm) = 6 and pg_catalog.count(site.cal_mm) = 6,
    case
      when pg_catalog.substr(tooth.tooth_fdi, 1, 1) in ('1', '2') then 'U'
      when pg_catalog.substr(tooth.tooth_fdi, 1, 1) in ('3', '4') then 'L'
    end,
    -- The two permanent arch sequences, 1..16 each, so consecutive positions
    -- within one arch are adjacent and the 28/48 boundary is not. A deciduous
    -- tooth has no sequence position and is therefore adjacent to nothing,
    -- which mirrors the ported indexOf(-1) behaviour exactly.
    case
      when pg_catalog.substr(tooth.tooth_fdi, 1, 1) in ('1', '4')
        then 9 - pg_catalog.substr(tooth.tooth_fdi, 2, 1)::integer
      when pg_catalog.substr(tooth.tooth_fdi, 1, 1) in ('2', '3')
        then 8 + pg_catalog.substr(tooth.tooth_fdi, 2, 1)::integer
    end
  from public.periodontal_tooth_measurements as tooth
  left join public.periodontal_site_measurements as site
    on site.organization_id = tooth.organization_id
   and site.examination_id = tooth.examination_id
   and site.tooth_fdi = tooth.tooth_fdi
  where tooth.organization_id = p_organization_id
    and tooth.examination_id = p_examination_id
  group by tooth.tooth_fdi, tooth.tooth_present, tooth.implant_context;
$$;

revoke all on function private.periodontal_tooth_reductions(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function private.periodontal_tooth_reductions(uuid, uuid) is
  'One row per charted tooth of a periodontal examination, reduced to the scalars the 2017 derivation consumes: worst known interdental and buccal/oral attachment level, worst probing depth, and the counts of charted, known-attachment and actually-assessed-for-bleeding sites. A site that was never measured contributes to no count and no maximum, so unknown never becomes zero.';

-- ---------------------------------------------------------------------------
-- 5. The trusted server-side classification
-- ---------------------------------------------------------------------------

create function private.periodontal_derived_classification(
  p_organization_id uuid,
  p_examination_id uuid
)
returns table (
  diagnosis text,
  stage text,
  grade text,
  extent text,
  present_tooth_count integer,
  teeth_with_known_interdental_cal integer,
  assessed_bop_site_count integer,
  bleeding_site_count integer,
  bop_percent numeric,
  complete boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_age smallint;
  v_smoking text;
  v_cigarettes smallint;
  v_diabetes text;
  v_hba1c numeric;
  v_teeth_lost smallint;
  v_bone_loss smallint;
  v_affected_count integer;
  v_nonadjacent boolean;
  v_buccal_qualifying integer;
  v_max_interdental integer;
  v_max_probing integer;
  v_max_furcation smallint;
  v_cal_band integer;
  v_bone_band integer;
  v_band integer;
  v_direct text;
  v_smoking_grade text;
  v_diabetes_grade text;
  v_grade text;
  v_stage text;
  v_extent text;
  v_all_molar_incisor boolean;
  v_has_molar boolean;
  v_has_incisor boolean;
  v_known_denominator integer;
begin
  select exam.age_years_snapshot, exam.smoking_status, exam.cigarettes_per_day,
         exam.diabetes_status, exam.hba1c_percent, exam.teeth_lost_to_periodontitis,
         exam.radiographic_bone_loss_percent
    into v_age, v_smoking, v_cigarettes, v_diabetes, v_hba1c, v_teeth_lost, v_bone_loss
  from public.periodontal_examinations as exam
  where exam.organization_id = p_organization_id
    and exam.id = p_examination_id;

  if not found then
    return;
  end if;

  select
    pg_catalog.count(*) filter (where reduction.present)::integer,
    pg_catalog.count(*) filter (
      where reduction.present and reduction.interdental_cal_mm is not null)::integer,
    coalesce(pg_catalog.sum(reduction.assessed_bop_site_count)
      filter (where reduction.present), 0)::integer,
    coalesce(pg_catalog.sum(reduction.bleeding_site_count)
      filter (where reduction.present), 0)::integer,
    pg_catalog.count(*) filter (where reduction.present) > 0
      and pg_catalog.count(*) filter (where reduction.present and not reduction.complete) = 0
    into present_tooth_count, teeth_with_known_interdental_cal,
         assessed_bop_site_count, bleeding_site_count, complete
  from private.periodontal_tooth_reductions(p_organization_id, p_examination_id) as reduction;

  bop_percent := case
    when assessed_bop_site_count = 0 then null
    else bleeding_site_count::numeric * 100 / assessed_bop_site_count
  end;

  select pg_catalog.count(*)::integer into v_affected_count
  from private.periodontal_tooth_reductions(p_organization_id, p_examination_id) as reduction
  where reduction.present and reduction.interdental_cal_mm >= 1;

  -- Periodontitis needs interdental attachment loss at two or more NON-adjacent
  -- teeth. A tooth whose interdental attachment level is unknown is neither
  -- affected nor unaffected: it can satisfy no criterion and dilutes no
  -- denominator.
  select exists (
    select 1
    from private.periodontal_tooth_reductions(p_organization_id, p_examination_id) as left_tooth
    join private.periodontal_tooth_reductions(p_organization_id, p_examination_id) as right_tooth
      on left_tooth.tooth_fdi < right_tooth.tooth_fdi
    where left_tooth.present and left_tooth.interdental_cal_mm >= 1
      and right_tooth.present and right_tooth.interdental_cal_mm >= 1
      and not (
        left_tooth.arch is not null
        and left_tooth.arch = right_tooth.arch
        and pg_catalog.abs(left_tooth.arch_index - right_tooth.arch_index) = 1
      )
  ) into v_nonadjacent;

  select pg_catalog.count(*)::integer into v_buccal_qualifying
  from private.periodontal_tooth_reductions(p_organization_id, p_examination_id) as reduction
  where reduction.present
    and reduction.buccal_oral_cal_mm >= 3
    and reduction.max_probing_depth_mm > 3;

  if v_nonadjacent or v_buccal_qualifying >= 2 then
    select pg_catalog.max(reduction.interdental_cal_mm),
           pg_catalog.max(reduction.max_probing_depth_mm)
      into v_max_interdental, v_max_probing
    from private.periodontal_tooth_reductions(p_organization_id, p_examination_id) as reduction
    where reduction.present;

    select pg_catalog.max(furcation.grade) into v_max_furcation
    from public.periodontal_furcation_measurements as furcation
    where furcation.organization_id = p_organization_id
      and furcation.examination_id = p_examination_id;

    v_cal_band := case
      when v_max_interdental is null or v_max_interdental < 1 then null
      when v_max_interdental >= 5 then 3
      when v_max_interdental >= 3 then 2
      else 1
    end;
    v_bone_band := case
      when v_bone_loss is null then null
      when v_bone_loss > 33 then 3
      when v_bone_loss >= 15 then 2
      else 1
    end;

    if v_cal_band is null and v_bone_band is null then
      v_stage := null;
    else
      v_band := greatest(coalesce(v_cal_band, 0), coalesce(v_bone_band, 0));
      if (v_max_probing is not null and v_max_probing >= 6)
         or (v_max_furcation is not null and v_max_furcation >= 2) then
        v_band := greatest(v_band, 3);
      end if;
      v_stage := case v_band when 1 then 'I' when 2 then 'II' else 'III' end;
      if v_teeth_lost is not null and v_teeth_lost >= 5 then
        v_stage := 'IV';
      end if;
    end if;

    if v_age is not null and v_age > 0 and v_bone_loss is not null then
      v_direct := case
        when v_bone_loss::numeric / v_age > 1 then 'C'
        when v_bone_loss::numeric / v_age >= 0.25 then 'B'
        else 'A'
      end;
    end if;
    v_smoking_grade := case
      when v_smoking = 'CURRENT'
        then case when v_cigarettes is not null and v_cigarettes >= 10 then 'C' else 'B' end
      else 'A'
    end;
    v_diabetes_grade := case
      when v_diabetes is not null and v_diabetes <> 'NONE'
        then case when v_hba1c is not null and v_hba1c >= 7 then 'C' else 'B' end
      else 'A'
    end;
    if v_direct is null and v_smoking is null and v_diabetes is null then
      v_grade := null;
    else
      -- Ported as-is from the reviewed pure module: when the bone-loss-over-age
      -- ratio cannot be computed but at least one modifier IS known, the grade
      -- falls back to a B baseline. Changing it is a clinical decision, not a
      -- refactor.
      v_grade := greatest(coalesce(v_direct, 'B'), v_smoking_grade, v_diabetes_grade);
    end if;

    select coalesce(pg_catalog.bool_and(affected.position in (1, 2, 6, 7, 8)), false),
           coalesce(pg_catalog.bool_or(affected.position in (6, 7, 8)), false),
           coalesce(pg_catalog.bool_or(affected.position in (1, 2)), false)
      into v_all_molar_incisor, v_has_molar, v_has_incisor
    from (
      select reduction.fdi_number % 10 as position
      from private.periodontal_tooth_reductions(p_organization_id, p_examination_id) as reduction
      where reduction.present and reduction.interdental_cal_mm >= 1
    ) as affected;

    select pg_catalog.count(*)::integer into v_known_denominator
    from private.periodontal_tooth_reductions(p_organization_id, p_examination_id) as reduction
    where reduction.present and reduction.interdental_cal_mm is not null;

    if v_affected_count > 0 and v_all_molar_incisor and v_has_molar and v_has_incisor then
      v_extent := 'MOLAR_INCISOR';
    elsif v_known_denominator = 0 then
      v_extent := null;
    elsif v_affected_count::numeric / v_known_denominator < 0.3 then
      v_extent := 'LOCALIZED';
    else
      v_extent := 'GENERALIZED';
    end if;

    diagnosis := 'PERIODONTITIS';
    stage := v_stage;
    grade := v_grade;
    extent := v_extent;
  else
    -- Health and gingivitis are conditions, never staged or graded, mirroring
    -- perio_exam_derived_stageable_check. With nothing assessed, "healthy"
    -- would be a manufactured finding, so the classification stays unknown.
    diagnosis := case
      when present_tooth_count = 0 or bop_percent is null then null
      when bop_percent >= 10 then 'GINGIVITIS'
      else 'HEALTH'
    end;
    stage := null;
    grade := null;
    extent := null;
  end if;

  return next;
end
$$;

revoke all on function private.periodontal_derived_classification(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function private.periodontal_derived_classification(uuid, uuid) is
  'The 2017/2018 periodontal classification recomputed from the canonical rows of one examination, plus the completeness summary finalization gates on. It is the SQL counterpart of the reviewed pure port in src/lib/odontogram/perio-classification.ts and shares its two properties: deterministic, and unknown is excluded from every numerator and denominator rather than counted as zero. An examination is complete only when it has at least one present tooth and every present tooth carries six charted sites with a known attachment level. The clinical mapping is subject to the dentist acceptance gate recorded in docs/AI_HANDOFF.md.';

-- ---------------------------------------------------------------------------
-- 6. Batch shape validation shared by the versioned autosave boundary
-- ---------------------------------------------------------------------------

create function private.periodontal_batch_section_is_valid(
  p_rows jsonb,
  p_allowed text[],
  p_numeric text[],
  p_boolean text[],
  p_text text[]
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_rows) as row_entry(value)
    where pg_catalog.jsonb_typeof(row_entry.value) <> 'object'
       or exists (
         select 1
         from pg_catalog.jsonb_each(row_entry.value) as field(key, value)
         where field.key <> all (p_allowed)
            -- One object, one array of rows, one row object, scalars. Anything
            -- deeper is refused, which bounds the JSON depth structurally
            -- rather than by counting braces.
            or pg_catalog.jsonb_typeof(field.value) in ('object', 'array')
            or (field.key = any (p_numeric)
                and pg_catalog.jsonb_typeof(field.value) not in ('number', 'null'))
            or (field.key = any (p_boolean)
                and pg_catalog.jsonb_typeof(field.value) not in ('boolean', 'null'))
            or (field.key = any (p_text)
                and pg_catalog.jsonb_typeof(field.value) not in ('string', 'null'))
       )
  );
$$;

revoke all on function private.periodontal_batch_section_is_valid(jsonb, text[], text[], text[], text[])
from public, anon, authenticated, service_role;

comment on function private.periodontal_batch_section_is_valid(jsonb, text[], text[], text[], text[]) is
  'Whether every element of one autosave batch section is a flat object whose keys are all allowed and whose values carry the expected JSON type. Refusing any nested object or array bounds the accepted JSON depth structurally.';

-- ---------------------------------------------------------------------------
-- 7. Repairing the three shipped periodontal boundaries in place
-- ---------------------------------------------------------------------------

do $migration$
declare
  v_definition text;
  v_repaired text;
  v_target text;
  v_replacement text;
  v_found integer;
  v_step record;
  v_signature text;
begin
  for v_signature in
    select unnest(array[
      'public.create_periodontal_examination(uuid,uuid,uuid,text)',
      'public.finalize_periodontal_examination(uuid,uuid,integer)',
      'public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)'
    ])
  loop
    -- The stored body carries the newline convention of the machine that
    -- applied its source migration, and this file is checked out with the
    -- convention of the machine replaying it. Normalize both sides. Matching is
    -- exact substring counting, never a regex: an unescaped metacharacter in a
    -- SQL anchor would make the count meaningless.
    select pg_catalog.replace(
      pg_catalog.pg_get_functiondef(v_signature::regprocedure),
      pg_catalog.chr(13) || pg_catalog.chr(10),
      pg_catalog.chr(10)
    ) into v_repaired;

    for v_step in
      select step.target, step.replacement, step.occurrences
      from (values
        ('public.create_periodontal_examination(uuid,uuid,uuid,text)',
         'private.resolve_actor_provider(v_organization_id)',
         'private.resolve_actor_provider_at_branch(v_organization_id, p_acting_branch_id, v_actor_user_id)',
         1),
        ('public.finalize_periodontal_examination(uuid,uuid,integer)',
         'private.resolve_actor_provider(v_organization_id)',
         'private.resolve_actor_provider_at_branch(v_organization_id, p_acting_branch_id, v_actor_user_id)',
         1),
        ('public.finalize_periodontal_examination(uuid,uuid,integer)',
         'coalesce(v_provider_id, v_exam.examined_provider_id, v_provider_id)',
         'v_provider_id',
         1),
        ('public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)',
         'coalesce((r->>''gingival_margin_mm'')::integer,0)',
         '(r->>''gingival_margin_mm'')::integer',
         2),
        ('public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)',
         'coalesce((r->>''bleeding_on_probing'')::boolean,false)',
         '(r->>''bleeding_on_probing'')::boolean',
         1),
        ('public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)',
         'coalesce((r->>''suppuration'')::boolean,false)',
         '(r->>''suppuration'')::boolean',
         1),
        ('public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)',
         'coalesce((r->>''plaque_present'')::boolean,false)',
         '(r->>''plaque_present'')::boolean',
         1)
      ) as step(signature, target, replacement, occurrences)
      where step.signature = v_signature
    loop
      v_definition := v_repaired;
      v_target := v_step.target;
      v_replacement := v_step.replacement;

      v_found := (pg_catalog.length(v_definition)
                  - pg_catalog.length(pg_catalog.replace(v_definition, v_target, '')))
                 / pg_catalog.length(v_target);

      if v_found <> v_step.occurrences then
        raise exception using errcode = '55000',
          message = v_signature || ' repair target was found ' || v_found::text
            || ' times, expected ' || v_step.occurrences::text;
      end if;

      v_repaired := pg_catalog.replace(v_definition, v_target, v_replacement);

      if v_repaired = v_definition then
        raise exception using errcode = '55000',
          message = v_signature || ' repair replacement made no change';
      end if;
    end loop;

    execute v_repaired;
  end loop;
end
$migration$;

comment on function public.create_periodontal_examination(uuid, uuid, uuid, text) is
  'The shipped periodontal draft boundary, superseded for new work by public.create_periodontal_draft_v2. It now derives the treating provider with private.resolve_actor_provider_at_branch, so the provider it records is one the signed-in actor actually holds at the acting branch with an active provider_branches row. An actor with no such link is still attributed to NO provider, exactly as before.';

comment on function public.finalize_periodontal_examination(uuid, uuid, integer) is
  'The shipped periodontal finalization boundary, superseded for new work by public.finalize_periodontal_examination_v2. Two authorization defects are closed here: the treating provider is now resolved at the acting branch with private.resolve_actor_provider_at_branch, and finalized_provider_id is no longer allowed to fall back to the examined provider. That fallback let an actor with no provider link finalize a DRAFT another clinician opened and attribute the immutable record to THAT clinician; the finalized-state check now refuses such an attempt instead.';

comment on function public.save_periodontal_measurements(uuid, uuid, jsonb, jsonb, jsonb, jsonb) is
  'The shipped periodontal autosave boundary, superseded for new work by public.save_periodontal_measurements_v2. It no longer coalesces an omitted gingival margin to 0 or an omitted bleeding, suppuration, or plaque assessment to false. Task 9 made NULL the single representation of unknown and every downstream calculation carries it through; inventing a zero here destroyed that distinction at the only place a browser can write it.';

-- ---------------------------------------------------------------------------
-- 8. Versioned draft creation
-- ---------------------------------------------------------------------------

create function public.create_periodontal_draft_v2(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_examination_kind text,
  p_examined_at timestamptz,
  p_idempotency_key uuid
)
returns table (
  examination_id uuid,
  patient_id uuid,
  encounter_id uuid,
  version integer,
  resumed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_provider_id uuid;
  v_kind text := pg_catalog.btrim(p_examination_kind);
  v_encounter_id uuid;
  v_clinical_date date;
  v_examination_id uuid;
  v_version integer;
  v_resumed boolean := false;
  v_stored_examination uuid;
  v_stored_encounter uuid;
  v_stored_version integer;
  v_stored_resumed boolean;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or p_idempotency_key is null
     or v_kind is null or v_kind not in ('INITIAL', 'RE-EVALUATION', 'MAINTENANCE') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- Request lock in its own key space (seed 6), always taken before the
  -- per-examination identity lock (seed 7) and before the managed visit's
  -- request-key lock (seed 1) and identity lock (seed 0). Every periodontal
  -- caller takes them in that order, so no deadlock cycle is constructible.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_actor_user_id::text
        || ':PERIO_DRAFT:' || p_idempotency_key::text,
      6
    )
  );

  -- Identity lock (seed 7). Before the examination exists the identity is the
  -- patient it will belong to; every later periodontal write locks the
  -- examination itself in the same key space.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':PATIENT:' || p_patient_id::text,
      7
    )
  );

  insert into private.periodontal_workflow_idempotency (
    organization_id, actor_user_id, operation, idempotency_key
  ) values (
    v_organization_id, v_actor_user_id, 'DRAFT', p_idempotency_key
  ) on conflict do nothing;

  select request.examination_id, request.encounter_id, request.result_version, request.resumed
    into v_stored_examination, v_stored_encounter, v_stored_version, v_stored_resumed
  from private.periodontal_workflow_idempotency as request
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'DRAFT'
    and request.idempotency_key = p_idempotency_key
  for update;

  if v_stored_examination is not null then
    examination_id := v_stored_examination;
    patient_id := p_patient_id;
    encounter_id := v_stored_encounter;
    version := v_stored_version;
    resumed := v_stored_resumed;
    return next;
    return;
  end if;

  -- No provider selector exists anywhere in this workspace. An actor without an
  -- active provider link at the acting branch does not treat and therefore does
  -- not open a periodontal examination.
  v_provider_id := private.require_active_actor_provider(
    v_organization_id, p_acting_branch_id, v_actor_user_id
  );

  select visit.encounter_id, visit.clinical_date
    into v_encounter_id, v_clinical_date
  from public.start_or_resume_clinical_visit(
    p_acting_branch_id, p_patient_id, null, p_idempotency_key
  ) as visit;

  if v_encounter_id is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- A browser may name the moment of examination but can never move the visit:
  -- the time must be in the past and must fall on the visit's own Philippine
  -- clinical date, which the visit derived for itself.
  if p_examined_at is not null
     and (p_examined_at > pg_catalog.statement_timestamp()
          or (pg_catalog.timezone('Asia/Manila', p_examined_at))::date <> v_clinical_date) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select exam.id, exam.version into v_examination_id, v_version
  from public.periodontal_examinations as exam
  where exam.organization_id = v_organization_id
    and exam.encounter_id = v_encounter_id
    and exam.patient_id = p_patient_id
    and exam.status = 'DRAFT'
    and exam.predecessor_examination_id is null
  order by exam.recorded_at
  limit 1
  for no key update;

  if v_examination_id is not null then
    v_resumed := true;
  else
    insert into public.periodontal_examinations (
      organization_id, patient_id, encounter_id, examination_kind,
      status, version, examined_at, examined_by, examined_provider_id
    ) values (
      v_organization_id, p_patient_id, v_encounter_id, v_kind,
      'DRAFT', 1, coalesce(p_examined_at, pg_catalog.statement_timestamp()),
      v_actor_user_id, v_provider_id
    ) returning id, public.periodontal_examinations.version
      into v_examination_id, v_version;

    insert into public.audit_events (
      organization_id, branch_id, actor_user_id, actor_type, category, action,
      entity_type, entity_id, patient_id, result, metadata
    ) values (
      v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
      'clinical.perio.examination.created', 'periodontal_examination', v_examination_id,
      p_patient_id, 'SUCCESS',
      pg_catalog.jsonb_build_object('examination_kind', v_kind)
    );
  end if;

  update private.periodontal_workflow_idempotency as request
  set examination_id = v_examination_id,
      encounter_id = v_encounter_id,
      result_version = v_version,
      resumed = v_resumed
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'DRAFT'
    and request.idempotency_key = p_idempotency_key;

  examination_id := v_examination_id;
  patient_id := p_patient_id;
  encounter_id := v_encounter_id;
  version := v_version;
  resumed := v_resumed;
  return next;
end
$$;

revoke all on function public.create_periodontal_draft_v2(uuid, uuid, text, timestamptz, uuid)
from public, anon, authenticated, service_role;

comment on function public.create_periodontal_draft_v2(uuid, uuid, text, timestamptz, uuid) is
  'The visit-bound periodontal draft boundary. It derives organization, actor, treating provider and encounter server-side, requires live patient.clinical.write at an active acting branch plus an active linked provider there, validates the patient against the derived tenant, and obtains its encounter from public.start_or_resume_clinical_visit so a periodontal examination can never exist without a managed visit. A replayed request key returns the original draft, and a second call on the same visit resumes the open draft rather than forking it. No organization, provider, actor, encounter or provider display name may be supplied by a client.';

-- ---------------------------------------------------------------------------
-- 9. Versioned batch autosave
-- ---------------------------------------------------------------------------

create function public.save_periodontal_measurements_v2(
  p_examination_id uuid,
  p_expected_version integer,
  p_measurement_batch jsonb,
  p_idempotency_key uuid
)
returns table (
  examination_id uuid,
  patient_id uuid,
  version integer,
  saved_sites integer,
  saved_plaque integer,
  saved_tooth integer,
  saved_furcation integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_branch_id uuid;
  v_patient_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_status text;
  v_current_version integer;
  v_sites jsonb;
  v_plaque jsonb;
  v_tooth jsonb;
  v_furcation jsonb;
  v_risk jsonb;
  v_total integer;
  v_written integer;
  v_saved_sites integer := 0;
  v_saved_plaque integer := 0;
  v_saved_tooth integer := 0;
  v_saved_furcation integer := 0;
  v_new_version integer;
  v_stored_examination uuid;
  v_stored_version integer;
  v_stored_sites integer;
  v_stored_plaque integer;
  v_stored_tooth integer;
  v_stored_furcation integer;
  v_tooth_code text;
begin
  if p_examination_id is null or p_idempotency_key is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select exam.organization_id, exam.patient_id, encounter.branch_id
    into v_organization_id, v_patient_id, v_branch_id
  from public.periodontal_examinations as exam
  join public.clinical_encounters as encounter
    on encounter.organization_id = exam.organization_id
   and encounter.id = exam.encounter_id
  where exam.id = p_examination_id;

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       v_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  perform private.require_active_actor_provider(
    v_organization_id, v_branch_id, v_actor_user_id
  );

  if p_expected_version is null or p_expected_version < 1
     or p_measurement_batch is null
     or pg_catalog.jsonb_typeof(p_measurement_batch) <> 'object'
     or pg_catalog.pg_column_size(p_measurement_batch) > 65536
     or exists (
       select 1 from pg_catalog.jsonb_object_keys(p_measurement_batch) as batch_key(key)
       where batch_key.key not in ('sites', 'plaque', 'tooth', 'furcation', 'risk')
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_sites := coalesce(p_measurement_batch -> 'sites', '[]'::jsonb);
  v_plaque := coalesce(p_measurement_batch -> 'plaque', '[]'::jsonb);
  v_tooth := coalesce(p_measurement_batch -> 'tooth', '[]'::jsonb);
  v_furcation := coalesce(p_measurement_batch -> 'furcation', '[]'::jsonb);
  v_risk := p_measurement_batch -> 'risk';

  if pg_catalog.jsonb_typeof(v_sites) <> 'array'
     or pg_catalog.jsonb_typeof(v_plaque) <> 'array'
     or pg_catalog.jsonb_typeof(v_tooth) <> 'array'
     or pg_catalog.jsonb_typeof(v_furcation) <> 'array'
     or (v_risk is not null and pg_catalog.jsonb_typeof(v_risk) <> 'object') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_total := pg_catalog.jsonb_array_length(v_sites)
    + pg_catalog.jsonb_array_length(v_plaque)
    + pg_catalog.jsonb_array_length(v_tooth)
    + pg_catalog.jsonb_array_length(v_furcation);

  if v_total > 200 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not private.periodontal_batch_section_is_valid(
       v_sites,
       array['tooth_fdi', 'site', 'probing_depth_mm', 'gingival_margin_mm',
             'bleeding_on_probing', 'suppuration', 'implant_context'],
       array['probing_depth_mm', 'gingival_margin_mm'],
       array['bleeding_on_probing', 'suppuration', 'implant_context'],
       array['tooth_fdi', 'site'])
     or not private.periodontal_batch_section_is_valid(
       v_plaque,
       array['tooth_fdi', 'surface', 'plaque_present', 'plaque_index', 'gingival_index',
             'modified_plaque_index', 'modified_bleeding_index'],
       array['plaque_index', 'gingival_index', 'modified_plaque_index', 'modified_bleeding_index'],
       array['plaque_present'],
       array['tooth_fdi', 'surface'])
     or not private.periodontal_batch_section_is_valid(
       v_tooth,
       array['tooth_fdi', 'tooth_present', 'implant_context', 'mobility_miller', 'notes',
             'keratinized_gingiva_mm', 'gingival_thickness_mm', 'gingival_phenotype',
             'miller_recession_class', 'cej_visible', 'root_concavity'],
       array['keratinized_gingiva_mm', 'gingival_thickness_mm'],
       array['tooth_present', 'implant_context', 'cej_visible', 'root_concavity'],
       array['tooth_fdi', 'mobility_miller', 'notes', 'gingival_phenotype', 'miller_recession_class'])
     or not private.periodontal_batch_section_is_valid(
       v_furcation,
       array['tooth_fdi', 'entrance', 'grade'],
       array['grade'],
       array[]::text[],
       array['tooth_fdi', 'entrance'])
     or (v_risk is not null and exists (
       select 1 from pg_catalog.jsonb_each(v_risk) as field(key, value)
       where field.key not in ('age_years_snapshot', 'smoking_status', 'cigarettes_per_day',
                               'diabetes_status', 'hba1c_percent', 'teeth_lost_to_periodontitis',
                               'radiographic_bone_loss_percent')
          or pg_catalog.jsonb_typeof(field.value) in ('object', 'array')
     )) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if exists (
       select 1 from pg_catalog.jsonb_array_elements(v_sites) as entry(value)
       where pg_catalog.btrim(coalesce(entry.value ->> 'tooth_fdi', '')) !~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
          or pg_catalog.btrim(coalesce(entry.value ->> 'site', '')) not in ('MB', 'B', 'DB', 'ML', 'L', 'DL')
          or coalesce(entry.value ->> 'probing_depth_mm', '') !~ '^[0-9]+$'
          or (entry.value ->> 'probing_depth_mm')::integer not between 1 and 15
          or (entry.value ->> 'gingival_margin_mm' is not null
              and (entry.value ->> 'gingival_margin_mm' !~ '^-?[0-9]+$'
                   or (entry.value ->> 'gingival_margin_mm')::integer not between -10 and 20))
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(v_sites) as entry(value)
       group by pg_catalog.btrim(entry.value ->> 'tooth_fdi'), pg_catalog.btrim(entry.value ->> 'site')
       having pg_catalog.count(*) > 1
     )
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(v_plaque) as entry(value)
       where pg_catalog.btrim(coalesce(entry.value ->> 'tooth_fdi', '')) !~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
          or pg_catalog.btrim(coalesce(entry.value ->> 'surface', '')) not in ('MESIAL', 'DISTAL', 'BUCCAL', 'LINGUAL')
          or exists (
            select 1 from pg_catalog.jsonb_each(entry.value) as field(key, value)
            where field.key in ('plaque_index', 'gingival_index', 'modified_plaque_index', 'modified_bleeding_index')
              and field.value <> 'null'::jsonb
              and (field.value #>> '{}' !~ '^[0-9]+$' or (field.value #>> '{}')::integer not between 0 and 3)
          )
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(v_plaque) as entry(value)
       group by pg_catalog.btrim(entry.value ->> 'tooth_fdi'), pg_catalog.btrim(entry.value ->> 'surface')
       having pg_catalog.count(*) > 1
     )
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(v_tooth) as entry(value)
       where pg_catalog.btrim(coalesce(entry.value ->> 'tooth_fdi', '')) !~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
          or (entry.value ->> 'mobility_miller' is not null
              and pg_catalog.btrim(entry.value ->> 'mobility_miller') not in ('M0', 'M1', 'M2', 'M3'))
          or (entry.value ->> 'gingival_phenotype' is not null
              and entry.value ->> 'gingival_phenotype' not in ('THIN', 'THICK'))
          or (entry.value ->> 'miller_recession_class' is not null
              and entry.value ->> 'miller_recession_class' not in ('I', 'II', 'III', 'IV'))
          or (entry.value ->> 'notes' is not null and pg_catalog.length(entry.value ->> 'notes') > 2000)
          or (entry.value ->> 'keratinized_gingiva_mm' is not null
              and (entry.value ->> 'keratinized_gingiva_mm' !~ '^[0-9]+(\.[0-9])?$'
                   or (entry.value ->> 'keratinized_gingiva_mm')::numeric not between 0 and 15))
          or (entry.value ->> 'gingival_thickness_mm' is not null
              and (entry.value ->> 'gingival_thickness_mm' !~ '^[0-9]+(\.[0-9])?$'
                   or (entry.value ->> 'gingival_thickness_mm')::numeric not between 0.1 and 9.9))
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(v_tooth) as entry(value)
       group by pg_catalog.btrim(entry.value ->> 'tooth_fdi')
       having pg_catalog.count(*) > 1
     )
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(v_furcation) as entry(value)
       where pg_catalog.btrim(coalesce(entry.value ->> 'tooth_fdi', '')) !~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
          or pg_catalog.btrim(coalesce(entry.value ->> 'entrance', '')) not in ('mesial', 'distal', 'buccal', 'lingual')
          or coalesce(entry.value ->> 'grade', '') !~ '^[0-9]+$'
          or (entry.value ->> 'grade')::integer not between 1 and 4
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(v_furcation) as entry(value)
       group by pg_catalog.btrim(entry.value ->> 'tooth_fdi'), pg_catalog.btrim(entry.value ->> 'entrance')
       having pg_catalog.count(*) > 1
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_risk is not null and (
       (v_risk ->> 'smoking_status' is not null
        and v_risk ->> 'smoking_status' not in ('NEVER', 'FORMER', 'CURRENT'))
       or (v_risk ->> 'diabetes_status' is not null
           and v_risk ->> 'diabetes_status' not in ('NONE', 'TYPE_1', 'TYPE_2', 'OTHER'))
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- The canonical current odontogram state, not a caller-supplied flag, decides
  -- whether a tooth may carry a periodontal measurement at all.
  for v_tooth_code in
    select distinct pg_catalog.btrim(entry.value ->> 'tooth_fdi')
    from pg_catalog.jsonb_array_elements(v_sites || v_plaque || v_tooth || v_furcation) as entry(value)
  loop
    if private.periodontal_current_state_conflict(v_organization_id, v_patient_id, v_tooth_code) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_actor_user_id::text
        || ':PERIO_SAVE:' || p_idempotency_key::text,
      6
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':EXAMINATION:' || p_examination_id::text,
      7
    )
  );

  insert into private.periodontal_workflow_idempotency (
    organization_id, actor_user_id, operation, idempotency_key
  ) values (
    v_organization_id, v_actor_user_id, 'SAVE', p_idempotency_key
  ) on conflict do nothing;

  select request.examination_id, request.result_version, request.saved_sites,
         request.saved_plaque, request.saved_tooth, request.saved_furcation
    into v_stored_examination, v_stored_version, v_stored_sites,
         v_stored_plaque, v_stored_tooth, v_stored_furcation
  from private.periodontal_workflow_idempotency as request
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'SAVE'
    and request.idempotency_key = p_idempotency_key
  for update;

  if v_stored_examination is not null then
    examination_id := v_stored_examination;
    patient_id := v_patient_id;
    version := v_stored_version;
    saved_sites := v_stored_sites;
    saved_plaque := v_stored_plaque;
    saved_tooth := v_stored_tooth;
    saved_furcation := v_stored_furcation;
    return next;
    return;
  end if;

  select exam.status, exam.version into v_status, v_current_version
  from public.periodontal_examinations as exam
  where exam.organization_id = v_organization_id
    and exam.id = p_examination_id
  for update;

  if v_status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_current_version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  -- Write order is load bearing. A peri-implant surface index is refused until
  -- the tooth row records the implant context, so tooth rows go first, then the
  -- six-site chart, then surfaces, then furcation.
  --
  -- Every write below is a DIFF. PostgreSQL fires an UPDATE trigger whether or
  -- not a value changed, and task 9's reset triggers withdraw the entire
  -- classification block on any child mutation, so rewriting unchanged rows
  -- would silently revoke a clinician's confirmation. A statement that matches
  -- no row leaves an empty transition table and withdraws nothing.
  with parsed as (
    select pg_catalog.btrim(entry.value ->> 'tooth_fdi') as tooth_fdi,
           entry.value ? 'tooth_present' as has_tooth_present,
           (entry.value ->> 'tooth_present')::boolean as tooth_present,
           entry.value ? 'implant_context' as has_implant_context,
           (entry.value ->> 'implant_context')::boolean as implant_context,
           entry.value ? 'mobility_miller' as has_mobility,
           pg_catalog.btrim(entry.value ->> 'mobility_miller') as mobility_miller,
           entry.value ? 'notes' as has_notes,
           entry.value ->> 'notes' as notes,
           entry.value ? 'keratinized_gingiva_mm' as has_keratinized,
           (entry.value ->> 'keratinized_gingiva_mm')::numeric as keratinized_gingiva_mm,
           entry.value ? 'gingival_thickness_mm' as has_thickness,
           (entry.value ->> 'gingival_thickness_mm')::numeric as gingival_thickness_mm,
           entry.value ? 'gingival_phenotype' as has_phenotype,
           entry.value ->> 'gingival_phenotype' as gingival_phenotype,
           entry.value ? 'miller_recession_class' as has_recession,
           entry.value ->> 'miller_recession_class' as miller_recession_class,
           entry.value ? 'cej_visible' as has_cej,
           (entry.value ->> 'cej_visible')::boolean as cej_visible,
           entry.value ? 'root_concavity' as has_concavity,
           (entry.value ->> 'root_concavity')::boolean as root_concavity
    from pg_catalog.jsonb_array_elements(v_tooth) as entry(value)
  )
  update public.periodontal_tooth_measurements as target
  set tooth_present = case when parsed.has_tooth_present then parsed.tooth_present else target.tooth_present end,
      implant_context = case when parsed.has_implant_context then parsed.implant_context else target.implant_context end,
      mobility_miller = case when parsed.has_mobility then parsed.mobility_miller else target.mobility_miller end,
      notes = case when parsed.has_notes then parsed.notes else target.notes end,
      keratinized_gingiva_mm = case when parsed.has_keratinized then parsed.keratinized_gingiva_mm else target.keratinized_gingiva_mm end,
      gingival_thickness_mm = case when parsed.has_thickness then parsed.gingival_thickness_mm else target.gingival_thickness_mm end,
      gingival_phenotype = case when parsed.has_phenotype then parsed.gingival_phenotype else target.gingival_phenotype end,
      miller_recession_class = case when parsed.has_recession then parsed.miller_recession_class else target.miller_recession_class end,
      cej_visible = case when parsed.has_cej then parsed.cej_visible else target.cej_visible end,
      root_concavity = case when parsed.has_concavity then parsed.root_concavity else target.root_concavity end,
      context_inferred = false
  from parsed
  where target.organization_id = v_organization_id
    and target.examination_id = p_examination_id
    and target.tooth_fdi = parsed.tooth_fdi
    and (
      target.context_inferred
      or (parsed.has_tooth_present and target.tooth_present is distinct from parsed.tooth_present)
      or (parsed.has_implant_context and target.implant_context is distinct from parsed.implant_context)
      or (parsed.has_mobility and target.mobility_miller is distinct from parsed.mobility_miller)
      or (parsed.has_notes and target.notes is distinct from parsed.notes)
      or (parsed.has_keratinized and target.keratinized_gingiva_mm is distinct from parsed.keratinized_gingiva_mm)
      or (parsed.has_thickness and target.gingival_thickness_mm is distinct from parsed.gingival_thickness_mm)
      or (parsed.has_phenotype and target.gingival_phenotype is distinct from parsed.gingival_phenotype)
      or (parsed.has_recession and target.miller_recession_class is distinct from parsed.miller_recession_class)
      or (parsed.has_cej and target.cej_visible is distinct from parsed.cej_visible)
      or (parsed.has_concavity and target.root_concavity is distinct from parsed.root_concavity)
    );
  get diagnostics v_written = row_count;
  v_saved_tooth := v_saved_tooth + v_written;

  with parsed as (
    select pg_catalog.btrim(entry.value ->> 'tooth_fdi') as tooth_fdi,
           (entry.value ->> 'tooth_present')::boolean as tooth_present,
           (entry.value ->> 'implant_context')::boolean as implant_context,
           pg_catalog.btrim(entry.value ->> 'mobility_miller') as mobility_miller,
           entry.value ->> 'notes' as notes,
           (entry.value ->> 'keratinized_gingiva_mm')::numeric as keratinized_gingiva_mm,
           (entry.value ->> 'gingival_thickness_mm')::numeric as gingival_thickness_mm,
           entry.value ->> 'gingival_phenotype' as gingival_phenotype,
           entry.value ->> 'miller_recession_class' as miller_recession_class,
           (entry.value ->> 'cej_visible')::boolean as cej_visible,
           (entry.value ->> 'root_concavity')::boolean as root_concavity
    from pg_catalog.jsonb_array_elements(v_tooth) as entry(value)
  )
  insert into public.periodontal_tooth_measurements (
    organization_id, examination_id, tooth_fdi, tooth_present, implant_context,
    mobility_miller, notes, keratinized_gingiva_mm, gingival_thickness_mm,
    gingival_phenotype, miller_recession_class, cej_visible, root_concavity
  )
  -- On INSERT there is no prior value to preserve and the two flag columns are
  -- NOT NULL, so the column defaults apply; nothing measurable is invented.
  select v_organization_id, p_examination_id, parsed.tooth_fdi,
         coalesce(parsed.tooth_present, true), coalesce(parsed.implant_context, false),
         parsed.mobility_miller, parsed.notes, parsed.keratinized_gingiva_mm,
         parsed.gingival_thickness_mm, parsed.gingival_phenotype,
         parsed.miller_recession_class, parsed.cej_visible, parsed.root_concavity
  from parsed
  where not exists (
    select 1 from public.periodontal_tooth_measurements as existing
    where existing.organization_id = v_organization_id
      and existing.examination_id = p_examination_id
      and existing.tooth_fdi = parsed.tooth_fdi
  );
  get diagnostics v_written = row_count;
  v_saved_tooth := v_saved_tooth + v_written;

  with parsed as (
    select pg_catalog.btrim(entry.value ->> 'tooth_fdi') as tooth_fdi,
           pg_catalog.btrim(entry.value ->> 'site') as site,
           (entry.value ->> 'probing_depth_mm')::integer as probing_depth_mm,
           entry.value ? 'gingival_margin_mm' as has_margin,
           (entry.value ->> 'gingival_margin_mm')::integer as gingival_margin_mm,
           entry.value ? 'bleeding_on_probing' as has_bleeding,
           (entry.value ->> 'bleeding_on_probing')::boolean as bleeding_on_probing,
           entry.value ? 'suppuration' as has_suppuration,
           (entry.value ->> 'suppuration')::boolean as suppuration,
           entry.value ? 'implant_context' as has_implant_context,
           (entry.value ->> 'implant_context')::boolean as implant_context
    from pg_catalog.jsonb_array_elements(v_sites) as entry(value)
  )
  update public.periodontal_site_measurements as target
  set probing_depth_mm = parsed.probing_depth_mm,
      gingival_margin_mm = case when parsed.has_margin then parsed.gingival_margin_mm else target.gingival_margin_mm end,
      bleeding_on_probing = case when parsed.has_bleeding then parsed.bleeding_on_probing else target.bleeding_on_probing end,
      suppuration = case when parsed.has_suppuration then parsed.suppuration else target.suppuration end,
      implant_context = case when parsed.has_implant_context then parsed.implant_context else target.implant_context end
  from parsed
  where target.organization_id = v_organization_id
    and target.examination_id = p_examination_id
    and target.tooth_fdi = parsed.tooth_fdi
    and target.site = parsed.site
    and (
      target.probing_depth_mm is distinct from parsed.probing_depth_mm
      or (parsed.has_margin and target.gingival_margin_mm is distinct from parsed.gingival_margin_mm)
      or (parsed.has_bleeding and target.bleeding_on_probing is distinct from parsed.bleeding_on_probing)
      or (parsed.has_suppuration and target.suppuration is distinct from parsed.suppuration)
      or (parsed.has_implant_context and target.implant_context is distinct from parsed.implant_context)
    );
  get diagnostics v_written = row_count;
  v_saved_sites := v_saved_sites + v_written;

  with parsed as (
    select pg_catalog.btrim(entry.value ->> 'tooth_fdi') as tooth_fdi,
           pg_catalog.btrim(entry.value ->> 'site') as site,
           (entry.value ->> 'probing_depth_mm')::integer as probing_depth_mm,
           (entry.value ->> 'gingival_margin_mm')::integer as gingival_margin_mm,
           (entry.value ->> 'bleeding_on_probing')::boolean as bleeding_on_probing,
           (entry.value ->> 'suppuration')::boolean as suppuration,
           (entry.value ->> 'implant_context')::boolean as implant_context
    from pg_catalog.jsonb_array_elements(v_sites) as entry(value)
  )
  insert into public.periodontal_site_measurements (
    organization_id, examination_id, tooth_fdi, site, probing_depth_mm,
    gingival_margin_mm, bleeding_on_probing, suppuration, tooth_present, implant_context
  )
  select v_organization_id, p_examination_id, parsed.tooth_fdi, parsed.site,
         parsed.probing_depth_mm, parsed.gingival_margin_mm, parsed.bleeding_on_probing,
         parsed.suppuration, true, coalesce(parsed.implant_context, false)
  from parsed
  where not exists (
    select 1 from public.periodontal_site_measurements as existing
    where existing.organization_id = v_organization_id
      and existing.examination_id = p_examination_id
      and existing.tooth_fdi = parsed.tooth_fdi
      and existing.site = parsed.site
  );
  get diagnostics v_written = row_count;
  v_saved_sites := v_saved_sites + v_written;

  with parsed as (
    select pg_catalog.btrim(entry.value ->> 'tooth_fdi') as tooth_fdi,
           pg_catalog.btrim(entry.value ->> 'surface') as surface,
           entry.value ? 'plaque_present' as has_plaque_present,
           (entry.value ->> 'plaque_present')::boolean as plaque_present,
           entry.value ? 'plaque_index' as has_plaque_index,
           (entry.value ->> 'plaque_index')::smallint as plaque_index,
           entry.value ? 'gingival_index' as has_gingival_index,
           (entry.value ->> 'gingival_index')::smallint as gingival_index,
           entry.value ? 'modified_plaque_index' as has_modified_plaque_index,
           (entry.value ->> 'modified_plaque_index')::smallint as modified_plaque_index,
           entry.value ? 'modified_bleeding_index' as has_modified_bleeding_index,
           (entry.value ->> 'modified_bleeding_index')::smallint as modified_bleeding_index
    from pg_catalog.jsonb_array_elements(v_plaque) as entry(value)
  )
  update public.periodontal_plaque_measurements as target
  set plaque_present = case when parsed.has_plaque_present then parsed.plaque_present else target.plaque_present end,
      plaque_index = case when parsed.has_plaque_index then parsed.plaque_index else target.plaque_index end,
      gingival_index = case when parsed.has_gingival_index then parsed.gingival_index else target.gingival_index end,
      modified_plaque_index = case when parsed.has_modified_plaque_index then parsed.modified_plaque_index else target.modified_plaque_index end,
      modified_bleeding_index = case when parsed.has_modified_bleeding_index then parsed.modified_bleeding_index else target.modified_bleeding_index end
  from parsed
  where target.organization_id = v_organization_id
    and target.examination_id = p_examination_id
    and target.tooth_fdi = parsed.tooth_fdi
    and target.surface = parsed.surface
    and (
      (parsed.has_plaque_present and target.plaque_present is distinct from parsed.plaque_present)
      or (parsed.has_plaque_index and target.plaque_index is distinct from parsed.plaque_index)
      or (parsed.has_gingival_index and target.gingival_index is distinct from parsed.gingival_index)
      or (parsed.has_modified_plaque_index and target.modified_plaque_index is distinct from parsed.modified_plaque_index)
      or (parsed.has_modified_bleeding_index and target.modified_bleeding_index is distinct from parsed.modified_bleeding_index)
    );
  get diagnostics v_written = row_count;
  v_saved_plaque := v_saved_plaque + v_written;

  with parsed as (
    select pg_catalog.btrim(entry.value ->> 'tooth_fdi') as tooth_fdi,
           pg_catalog.btrim(entry.value ->> 'surface') as surface,
           (entry.value ->> 'plaque_present')::boolean as plaque_present,
           (entry.value ->> 'plaque_index')::smallint as plaque_index,
           (entry.value ->> 'gingival_index')::smallint as gingival_index,
           (entry.value ->> 'modified_plaque_index')::smallint as modified_plaque_index,
           (entry.value ->> 'modified_bleeding_index')::smallint as modified_bleeding_index
    from pg_catalog.jsonb_array_elements(v_plaque) as entry(value)
  )
  insert into public.periodontal_plaque_measurements (
    organization_id, examination_id, tooth_fdi, surface, plaque_present,
    plaque_index, gingival_index, modified_plaque_index, modified_bleeding_index
  )
  select v_organization_id, p_examination_id, parsed.tooth_fdi, parsed.surface,
         parsed.plaque_present, parsed.plaque_index, parsed.gingival_index,
         parsed.modified_plaque_index, parsed.modified_bleeding_index
  from parsed
  where not exists (
    select 1 from public.periodontal_plaque_measurements as existing
    where existing.organization_id = v_organization_id
      and existing.examination_id = p_examination_id
      and existing.tooth_fdi = parsed.tooth_fdi
      and existing.surface = parsed.surface
  );
  get diagnostics v_written = row_count;
  v_saved_plaque := v_saved_plaque + v_written;

  with parsed as (
    select pg_catalog.btrim(entry.value ->> 'tooth_fdi') as tooth_fdi,
           pg_catalog.btrim(entry.value ->> 'entrance') as entrance,
           (entry.value ->> 'grade')::smallint as grade
    from pg_catalog.jsonb_array_elements(v_furcation) as entry(value)
  )
  update public.periodontal_furcation_measurements as target
  set grade = parsed.grade
  from parsed
  where target.organization_id = v_organization_id
    and target.examination_id = p_examination_id
    and target.tooth_fdi = parsed.tooth_fdi
    and target.entrance = parsed.entrance
    and target.grade is distinct from parsed.grade;
  get diagnostics v_written = row_count;
  v_saved_furcation := v_saved_furcation + v_written;

  with parsed as (
    select pg_catalog.btrim(entry.value ->> 'tooth_fdi') as tooth_fdi,
           pg_catalog.btrim(entry.value ->> 'entrance') as entrance,
           (entry.value ->> 'grade')::smallint as grade
    from pg_catalog.jsonb_array_elements(v_furcation) as entry(value)
  )
  insert into public.periodontal_furcation_measurements (
    organization_id, examination_id, tooth_fdi, entrance, grade
  )
  select v_organization_id, p_examination_id, parsed.tooth_fdi, parsed.entrance, parsed.grade
  from parsed
  where not exists (
    select 1 from public.periodontal_furcation_measurements as existing
    where existing.organization_id = v_organization_id
      and existing.examination_id = p_examination_id
      and existing.tooth_fdi = parsed.tooth_fdi
      and existing.entrance = parsed.entrance
  );
  get diagnostics v_written = row_count;
  v_saved_furcation := v_saved_furcation + v_written;

  -- The risk inputs and the version move together in ONE statement, and that
  -- statement never touches a fingerprint. A SET expression sees the pre-update
  -- row while the AFTER verification sees the post-update row, so writing risk
  -- inputs and provenance together fails closed.
  update public.periodontal_examinations as exam
  set age_years_snapshot = case when v_risk ? 'age_years_snapshot'
        then (v_risk ->> 'age_years_snapshot')::smallint else exam.age_years_snapshot end,
      smoking_status = case when v_risk ? 'smoking_status'
        then v_risk ->> 'smoking_status' else exam.smoking_status end,
      cigarettes_per_day = case when v_risk ? 'cigarettes_per_day'
        then (v_risk ->> 'cigarettes_per_day')::smallint else exam.cigarettes_per_day end,
      diabetes_status = case when v_risk ? 'diabetes_status'
        then v_risk ->> 'diabetes_status' else exam.diabetes_status end,
      hba1c_percent = case when v_risk ? 'hba1c_percent'
        then (v_risk ->> 'hba1c_percent')::numeric else exam.hba1c_percent end,
      teeth_lost_to_periodontitis = case when v_risk ? 'teeth_lost_to_periodontitis'
        then (v_risk ->> 'teeth_lost_to_periodontitis')::smallint else exam.teeth_lost_to_periodontitis end,
      radiographic_bone_loss_percent = case when v_risk ? 'radiographic_bone_loss_percent'
        then (v_risk ->> 'radiographic_bone_loss_percent')::smallint else exam.radiographic_bone_loss_percent end,
      version = exam.version + 1,
      updated_at = pg_catalog.statement_timestamp()
  where exam.organization_id = v_organization_id
    and exam.id = p_examination_id
    and exam.version = p_expected_version
  returning exam.version into v_new_version;

  if v_new_version is null then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, v_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.perio.measurements.saved', 'periodontal_examination', p_examination_id,
    v_patient_id, 'SUCCESS',
    pg_catalog.jsonb_build_object(
      'saved_sites', v_saved_sites, 'saved_plaque', v_saved_plaque,
      'saved_tooth', v_saved_tooth, 'saved_furcation', v_saved_furcation)
  );

  update private.periodontal_workflow_idempotency as request
  set examination_id = p_examination_id,
      result_version = v_new_version,
      saved_sites = v_saved_sites,
      saved_plaque = v_saved_plaque,
      saved_tooth = v_saved_tooth,
      saved_furcation = v_saved_furcation
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'SAVE'
    and request.idempotency_key = p_idempotency_key;

  examination_id := p_examination_id;
  patient_id := v_patient_id;
  version := v_new_version;
  saved_sites := v_saved_sites;
  saved_plaque := v_saved_plaque;
  saved_tooth := v_saved_tooth;
  saved_furcation := v_saved_furcation;
  return next;
end
$$;

revoke all on function public.save_periodontal_measurements_v2(uuid, integer, jsonb, uuid)
from public, anon, authenticated, service_role;

comment on function public.save_periodontal_measurements_v2(uuid, integer, jsonb, uuid) is
  'The versioned periodontal autosave boundary. It derives organization, patient, acting branch and treating provider from the examination and the signed-in actor, requires live patient.clinical.write at that branch plus an active linked provider there, and accepts none of them from a client. The batch is bounded in bytes, row count, key set, value type and structural depth; a duplicate row within a section is refused; the canonical current odontogram state, not a caller flag, decides whether a tooth may be measured. Writes are serialized per examination on advisory seed 7 behind a request-key lock on seed 6, only rows whose values actually changed are written, an omitted measurement stays unknown rather than becoming zero or false, and one accepted batch increments the examination version exactly once. A stale expected_version returns a typed conflict having written nothing, and a replayed request key returns the original result.';

-- ---------------------------------------------------------------------------
-- 10. Trusted finalization
-- ---------------------------------------------------------------------------

create function public.finalize_periodontal_examination_v2(
  p_examination_id uuid,
  p_expected_version integer,
  p_confirmation jsonb,
  p_idempotency_key uuid
)
returns table (
  examination_id uuid,
  patient_id uuid,
  version integer,
  derived_diagnosis text,
  confirmed_diagnosis text,
  overridden boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_branch_id uuid;
  v_patient_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_provider_id uuid;
  v_status text;
  v_current_version integer;
  v_derived record;
  v_confirmed_diagnosis text;
  v_confirmed_stage text;
  v_confirmed_grade text;
  v_confirmed_extent text;
  v_reason text;
  v_overridden boolean;
  v_digest text;
  v_new_version integer;
  v_stored_examination uuid;
  v_stored_version integer;
  v_stored_derived text;
  v_stored_confirmed text;
  v_stored_overridden boolean;
begin
  if p_examination_id is null or p_idempotency_key is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select exam.organization_id, exam.patient_id, encounter.branch_id
    into v_organization_id, v_patient_id, v_branch_id
  from public.periodontal_examinations as exam
  join public.clinical_encounters as encounter
    on encounter.organization_id = exam.organization_id
   and encounter.id = exam.encounter_id
  where exam.id = p_examination_id;

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       v_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- The finalizing clinician is the signed-in actor's own active provider at
  -- the acting branch, or the finalization does not happen. It is never the
  -- provider who happened to open the draft.
  v_provider_id := private.require_active_actor_provider(
    v_organization_id, v_branch_id, v_actor_user_id
  );

  if p_expected_version is null or p_expected_version < 1
     or p_confirmation is null
     or pg_catalog.jsonb_typeof(p_confirmation) <> 'object'
     or pg_catalog.pg_column_size(p_confirmation) > 8192
     or exists (
       select 1 from pg_catalog.jsonb_each(p_confirmation) as field(key, value)
       where field.key not in ('diagnosis', 'stage', 'grade', 'extent', 'override_reason')
          or pg_catalog.jsonb_typeof(field.value) not in ('string', 'null')
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_confirmed_diagnosis := p_confirmation ->> 'diagnosis';
  v_confirmed_stage := p_confirmation ->> 'stage';
  v_confirmed_grade := p_confirmation ->> 'grade';
  v_confirmed_extent := p_confirmation ->> 'extent';
  v_reason := nullif(pg_catalog.btrim(coalesce(p_confirmation ->> 'override_reason', '')), '');

  if v_confirmed_diagnosis is null
     or v_confirmed_diagnosis not in (
       'HEALTH', 'GINGIVITIS', 'PERIODONTITIS', 'NECROTIZING_PERIODONTAL_DISEASE',
       'PERIODONTITIS_AS_MANIFESTATION_OF_SYSTEMIC_DISEASE',
       'PERI_IMPLANT_HEALTH', 'PERI_IMPLANT_MUCOSITIS', 'PERI_IMPLANTITIS')
     or (v_confirmed_stage is not null and v_confirmed_stage not in ('I', 'II', 'III', 'IV'))
     or (v_confirmed_grade is not null and v_confirmed_grade not in ('A', 'B', 'C'))
     or (v_confirmed_extent is not null
         and v_confirmed_extent not in ('LOCALIZED', 'GENERALIZED', 'MOLAR_INCISOR'))
     or (v_reason is not null and pg_catalog.length(v_reason) > 2000) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_actor_user_id::text
        || ':PERIO_FINALIZE:' || p_idempotency_key::text,
      6
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':EXAMINATION:' || p_examination_id::text,
      7
    )
  );

  insert into private.periodontal_workflow_idempotency (
    organization_id, actor_user_id, operation, idempotency_key
  ) values (
    v_organization_id, v_actor_user_id, 'FINALIZE', p_idempotency_key
  ) on conflict do nothing;

  select request.examination_id, request.result_version, request.derived_diagnosis,
         request.confirmed_diagnosis, request.overridden
    into v_stored_examination, v_stored_version, v_stored_derived,
         v_stored_confirmed, v_stored_overridden
  from private.periodontal_workflow_idempotency as request
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'FINALIZE'
    and request.idempotency_key = p_idempotency_key
  for update;

  if v_stored_examination is not null then
    examination_id := v_stored_examination;
    patient_id := v_patient_id;
    version := v_stored_version;
    derived_diagnosis := v_stored_derived;
    confirmed_diagnosis := v_stored_confirmed;
    overridden := v_stored_overridden;
    return next;
    return;
  end if;

  select exam.status, exam.version into v_status, v_current_version
  from public.periodontal_examinations as exam
  where exam.organization_id = v_organization_id
    and exam.id = p_examination_id
  for update;

  if v_status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_current_version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  select * into v_derived
  from private.periodontal_derived_classification(v_organization_id, p_examination_id) as derivation;

  if v_derived.complete is not true then
    raise exception using errcode = 'P0001', message = 'incomplete examination';
  end if;

  v_overridden :=
    v_confirmed_diagnosis is distinct from v_derived.diagnosis
    or v_confirmed_stage is distinct from v_derived.stage
    or v_confirmed_grade is distinct from v_derived.grade
    or v_confirmed_extent is distinct from v_derived.extent;

  if v_overridden and v_reason is null then
    raise exception using errcode = 'P0001', message = 'override reason required';
  end if;

  v_digest := private.periodontal_measurement_digest(v_organization_id, p_examination_id);

  -- Derived and confirmed provenance are written in the SAME statement, from
  -- the SAME digest, and no risk input moves here. Writing only one of the two
  -- fingerprints would satisfy the early return in
  -- private.reset_perio_classification_on_risk_change and could leave the other
  -- one stale.
  update public.periodontal_examinations as exam
  set status = 'FINAL',
      finalized_at = pg_catalog.statement_timestamp(),
      finalized_by = v_actor_user_id,
      finalized_provider_id = v_provider_id,
      derived_diagnosis = v_derived.diagnosis,
      derived_stage = v_derived.stage,
      derived_grade = v_derived.grade,
      derived_extent = v_derived.extent,
      derived_measurement_fingerprint = case when v_derived.diagnosis is null then null else v_digest end,
      confirmed_diagnosis = v_confirmed_diagnosis,
      confirmed_stage = v_confirmed_stage,
      confirmed_grade = v_confirmed_grade,
      confirmed_extent = v_confirmed_extent,
      confirmed_measurement_fingerprint = v_digest,
      confirmed_at = pg_catalog.statement_timestamp(),
      confirmed_by = v_actor_user_id,
      confirmed_provider_id = v_provider_id,
      classification_override_reason = case when v_overridden then v_reason else null end,
      version = exam.version + 1,
      updated_at = pg_catalog.statement_timestamp()
  where exam.organization_id = v_organization_id
    and exam.id = p_examination_id
    and exam.version = p_expected_version
  returning exam.version into v_new_version;

  if v_new_version is null then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  -- Deliberately empty metadata. A diagnosis, a stage and an override reason
  -- are clinical content; they belong on the RLS-protected examination row, not
  -- in an audit event.
  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, v_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.perio.examination.finalized', 'periodontal_examination', p_examination_id,
    v_patient_id, 'SUCCESS', '{}'::jsonb
  );

  update private.periodontal_workflow_idempotency as request
  set examination_id = p_examination_id,
      result_version = v_new_version,
      derived_diagnosis = v_derived.diagnosis,
      confirmed_diagnosis = v_confirmed_diagnosis,
      overridden = v_overridden
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'FINALIZE'
    and request.idempotency_key = p_idempotency_key;

  examination_id := p_examination_id;
  patient_id := v_patient_id;
  version := v_new_version;
  derived_diagnosis := v_derived.diagnosis;
  confirmed_diagnosis := v_confirmed_diagnosis;
  overridden := v_overridden;
  return next;
end
$$;

revoke all on function public.finalize_periodontal_examination_v2(uuid, integer, jsonb, uuid)
from public, anon, authenticated, service_role;

comment on function public.finalize_periodontal_examination_v2(uuid, integer, jsonb, uuid) is
  'The versioned periodontal finalization boundary. It derives organization, patient, acting branch and the finalizing provider from the examination and the signed-in actor - never from the draft''s author - and requires live patient.clinical.write at that branch plus an active linked provider there. It finalizes only a complete DRAFT at the expected version, recomputes the classification from the canonical rows with private.periodontal_derived_classification rather than trusting the submitted one, requires a bounded reason whenever the clinician''s confirmation departs from it, stores both provenance fingerprints as the true measurement digest in a single statement that touches no risk input, and audits the transition with no clinical content.';

-- ---------------------------------------------------------------------------
-- 11. Amendment that can adopt an existing reason-less successor
-- ---------------------------------------------------------------------------

create function public.amend_periodontal_examination_v2(
  p_predecessor_examination_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns table (
  examination_id uuid,
  patient_id uuid,
  encounter_id uuid,
  version integer,
  adopted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_branch_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_provider_id uuid;
  v_pred public.periodontal_examinations%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_encounter_id uuid;
  v_successor_id uuid;
  v_successor_status text;
  v_new_id uuid;
  v_new_version integer;
  v_adopted boolean := false;
  v_stored_examination uuid;
  v_stored_encounter uuid;
  v_stored_version integer;
  v_stored_adopted boolean;
begin
  if p_predecessor_examination_id is null or p_idempotency_key is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select exam.* into v_pred
  from public.periodontal_examinations as exam
  where exam.id = p_predecessor_examination_id;

  v_organization_id := v_pred.organization_id;

  select encounter.branch_id into v_branch_id
  from public.clinical_encounters as encounter
  where encounter.organization_id = v_pred.organization_id
    and encounter.id = v_pred.encounter_id;

  -- Elevated: correcting finalized clinical history needs both the clinical
  -- write permission and the correction permission at the acting branch.
  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       v_branch_id, 'patient.clinical.write'
     )
     or not private.has_branch_permission(
       v_branch_id, 'patient.clinical.correct'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_reason is null or pg_catalog.length(v_reason) > 2000 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_provider_id := private.require_active_actor_provider(
    v_organization_id, v_branch_id, v_actor_user_id
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_actor_user_id::text
        || ':PERIO_AMEND:' || p_idempotency_key::text,
      6
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':EXAMINATION:' || p_predecessor_examination_id::text,
      7
    )
  );

  insert into private.periodontal_workflow_idempotency (
    organization_id, actor_user_id, operation, idempotency_key
  ) values (
    v_organization_id, v_actor_user_id, 'AMEND', p_idempotency_key
  ) on conflict do nothing;

  select request.examination_id, request.encounter_id, request.result_version, request.adopted
    into v_stored_examination, v_stored_encounter, v_stored_version, v_stored_adopted
  from private.periodontal_workflow_idempotency as request
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'AMEND'
    and request.idempotency_key = p_idempotency_key
  for update;

  if v_stored_examination is not null then
    examination_id := v_stored_examination;
    patient_id := v_pred.patient_id;
    encounter_id := v_stored_encounter;
    version := v_stored_version;
    adopted := v_stored_adopted;
    return next;
    return;
  end if;

  if v_pred.status <> 'FINAL' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  select visit.encounter_id into v_encounter_id
  from public.start_or_resume_clinical_visit(
    v_branch_id, v_pred.patient_id, null, p_idempotency_key
  ) as visit;

  if v_encounter_id is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- periodontal_examinations_one_amendment_idx keys on the predecessor
  -- REGARDLESS of status and there is no delete path for a DRAFT examination,
  -- so a successor already occupying the slot cannot be replaced by inserting
  -- another one. The revoked three-argument boundary created exactly such a
  -- reason-less DRAFT on one click. It is ADOPTED here rather than discarded:
  -- discarding would destroy autosaved clinical measurements with no recovery
  -- path, while adopting gives the successor the explanation it never had.
  select successor.id, successor.status into v_successor_id, v_successor_status
  from public.periodontal_examinations as successor
  where successor.organization_id = v_organization_id
    and successor.predecessor_examination_id = p_predecessor_examination_id
  for update;

  if v_successor_id is not null then
    if v_successor_status <> 'DRAFT' then
      raise exception using errcode = 'P0001', message = 'invalid state';
    end if;

    update public.periodontal_examinations as successor
    set amendment_reason = v_reason,
        encounter_id = v_encounter_id,
        examined_at = pg_catalog.statement_timestamp(),
        examined_by = v_actor_user_id,
        examined_provider_id = v_provider_id,
        version = successor.version + 1,
        updated_at = pg_catalog.statement_timestamp()
    where successor.organization_id = v_organization_id
      and successor.id = v_successor_id
    returning successor.id, successor.version into v_new_id, v_new_version;

    v_adopted := true;
  else
    insert into public.periodontal_examinations (
      organization_id, patient_id, encounter_id, predecessor_examination_id,
      examination_kind, status, version, examined_at, examined_by, examined_provider_id,
      amendment_reason, age_years_snapshot, smoking_status, cigarettes_per_day,
      diabetes_status, hba1c_percent, teeth_lost_to_periodontitis,
      radiographic_bone_loss_percent
    ) values (
      v_organization_id, v_pred.patient_id, v_encounter_id, p_predecessor_examination_id,
      'AMENDMENT', 'DRAFT', v_pred.version + 1,
      pg_catalog.statement_timestamp(), v_actor_user_id, v_provider_id,
      v_reason, v_pred.age_years_snapshot, v_pred.smoking_status, v_pred.cigarettes_per_day,
      v_pred.diabetes_status, v_pred.hba1c_percent, v_pred.teeth_lost_to_periodontitis,
      v_pred.radiographic_bone_loss_percent
    ) returning id, public.periodontal_examinations.version into v_new_id, v_new_version;

    -- The amendment starts as a clone of the record it corrects. The
    -- classification block is deliberately not cloned: corrected measurements
    -- must be re-derived and re-confirmed.
    insert into public.periodontal_tooth_measurements (
      organization_id, examination_id, tooth_fdi, mobility_miller, implant_context,
      tooth_present, notes, keratinized_gingiva_mm, gingival_thickness_mm,
      gingival_phenotype, miller_recession_class, cej_visible, root_concavity
    )
    select v_organization_id, v_new_id, source.tooth_fdi, source.mobility_miller,
           source.implant_context, source.tooth_present, source.notes,
           source.keratinized_gingiva_mm, source.gingival_thickness_mm,
           source.gingival_phenotype, source.miller_recession_class,
           source.cej_visible, source.root_concavity
    from public.periodontal_tooth_measurements as source
    where source.organization_id = v_organization_id
      and source.examination_id = p_predecessor_examination_id;

    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site, probing_depth_mm,
      gingival_margin_mm, bleeding_on_probing, suppuration, tooth_present, implant_context
    )
    select v_organization_id, v_new_id, source.tooth_fdi, source.site,
           source.probing_depth_mm, source.gingival_margin_mm, source.bleeding_on_probing,
           source.suppuration, source.tooth_present, source.implant_context
    from public.periodontal_site_measurements as source
    where source.organization_id = v_organization_id
      and source.examination_id = p_predecessor_examination_id;

    insert into public.periodontal_plaque_measurements (
      organization_id, examination_id, tooth_fdi, surface, plaque_present,
      plaque_index, gingival_index, modified_plaque_index, modified_bleeding_index
    )
    select v_organization_id, v_new_id, source.tooth_fdi, source.surface,
           source.plaque_present, source.plaque_index, source.gingival_index,
           source.modified_plaque_index, source.modified_bleeding_index
    from public.periodontal_plaque_measurements as source
    where source.organization_id = v_organization_id
      and source.examination_id = p_predecessor_examination_id;

    insert into public.periodontal_furcation_measurements (
      organization_id, examination_id, tooth_fdi, entrance, grade
    )
    select v_organization_id, v_new_id, source.tooth_fdi, source.entrance, source.grade
    from public.periodontal_furcation_measurements as source
    where source.organization_id = v_organization_id
      and source.examination_id = p_predecessor_examination_id;
  end if;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, v_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.perio.examination.amended', 'periodontal_examination', v_new_id,
    v_pred.patient_id, 'SUCCESS',
    pg_catalog.jsonb_build_object(
      'predecessor_examination_id', p_predecessor_examination_id::text)
  );

  update private.periodontal_workflow_idempotency as request
  set examination_id = v_new_id,
      encounter_id = v_encounter_id,
      result_version = v_new_version,
      adopted = v_adopted
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'AMEND'
    and request.idempotency_key = p_idempotency_key;

  examination_id := v_new_id;
  patient_id := v_pred.patient_id;
  encounter_id := v_encounter_id;
  version := v_new_version;
  adopted := v_adopted;
  return next;
end
$$;

revoke all on function public.amend_periodontal_examination_v2(uuid, text, uuid)
from public, anon, authenticated, service_role;

comment on function public.amend_periodontal_examination_v2(uuid, text, uuid) is
  'The explained periodontal amendment boundary that replaces the revoked reason-less three-argument signature. It derives organization, patient, acting branch, actor, provider and encounter server-side, requires patient.clinical.write plus patient.clinical.correct at the acting branch and an active linked provider there, and refuses an empty or unbounded reason. Because periodontal_examinations_one_amendment_idx keys on the predecessor regardless of status and no delete path exists for a DRAFT examination, a pre-existing reason-less DRAFT successor is ADOPTED and given the reason it lacked rather than being duplicated or discarded; a FINAL successor means the chain is already amended and is refused. Otherwise it clones the predecessor''s full measurement set and risk snapshot, never its classification, and never mutates the predecessor.';
