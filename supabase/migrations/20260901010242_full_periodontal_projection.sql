-- Unified Clinical Chart workspace, task 11: the periodontal read projections.
--
-- Two read-only boundaries. Neither writes a row, changes any state, or emits
-- an audit event, so opening the periodontal workspace never opens an encounter
-- and never records that a chart was looked at as if it were clinical work.
--
-- Both derive organization and actor inside a SECURITY DEFINER body with an
-- empty search path, require live patient.clinical.read at an active acting
-- branch, and revalidate every identifier the browser supplied against the
-- derived tenant and the derived patient. A client cannot widen what it sees by
-- naming a foreign examination.
--
-- The derived classification in both payloads is recomputed from the canonical
-- rows by private.periodontal_derived_classification. The stored derived_* and
-- confirmed_* columns are returned alongside it, so a workspace can show what
-- the clinician signed and what the evidence says today without the browser
-- having to decide which is authoritative.
--
-- This migration grants nothing. 20260901010243 owns the browser boundary.

create function public.get_periodontal_workspace_v2(
  p_patient_id uuid,
  p_branch_id uuid,
  p_examination_id uuid default null
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
  v_examination_id uuid;
  v_derived record;
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

  if p_patient_id is null or not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_examination_id is not null then
    select exam.id into v_examination_id
    from public.periodontal_examinations as exam
    where exam.organization_id = v_organization_id
      and exam.id = p_examination_id
      and exam.patient_id = p_patient_id;

    -- A named examination that is not this tenant's and this patient's is not a
    -- "not found"; it is a request the caller was never entitled to make.
    if v_examination_id is null then
      raise insufficient_privilege using message = 'not authorized';
    end if;
  else
    select exam.id into v_examination_id
    from public.periodontal_examinations as exam
    where exam.organization_id = v_organization_id
      and exam.patient_id = p_patient_id
    order by (exam.status = 'DRAFT') desc, exam.recorded_at desc, exam.id
    limit 1;
  end if;

  if v_examination_id is not null then
    select * into v_derived
    from private.periodontal_derived_classification(v_organization_id, v_examination_id) as derivation;
  end if;

  payload := pg_catalog.jsonb_build_object(
    'examination', (
      select pg_catalog.jsonb_build_object(
        'id', exam.id,
        'patient_id', exam.patient_id,
        'encounter_id', exam.encounter_id,
        'predecessor_examination_id', exam.predecessor_examination_id,
        'examination_kind', exam.examination_kind,
        'status', exam.status,
        'version', exam.version,
        'recorded_at', exam.recorded_at,
        'examined_at', exam.examined_at,
        'finalized_at', exam.finalized_at,
        'amendment_reason', exam.amendment_reason,
        'risk', pg_catalog.jsonb_build_object(
          'age_years_snapshot', exam.age_years_snapshot,
          'smoking_status', exam.smoking_status,
          'cigarettes_per_day', exam.cigarettes_per_day,
          'diabetes_status', exam.diabetes_status,
          'hba1c_percent', exam.hba1c_percent,
          'teeth_lost_to_periodontitis', exam.teeth_lost_to_periodontitis,
          'radiographic_bone_loss_percent', exam.radiographic_bone_loss_percent),
        'stored_derived', pg_catalog.jsonb_build_object(
          'diagnosis', exam.derived_diagnosis,
          'stage', exam.derived_stage,
          'grade', exam.derived_grade,
          'extent', exam.derived_extent,
          'measurement_fingerprint', exam.derived_measurement_fingerprint),
        'confirmed', pg_catalog.jsonb_build_object(
          'diagnosis', exam.confirmed_diagnosis,
          'stage', exam.confirmed_stage,
          'grade', exam.confirmed_grade,
          'extent', exam.confirmed_extent,
          'measurement_fingerprint', exam.confirmed_measurement_fingerprint,
          'confirmed_at', exam.confirmed_at,
          'override_reason', exam.classification_override_reason))
      from public.periodontal_examinations as exam
      where exam.organization_id = v_organization_id
        and exam.id = v_examination_id
    ),
    'sites', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'tooth_fdi', site.tooth_fdi,
        'site', site.site,
        'probing_depth_mm', site.probing_depth_mm,
        'gingival_margin_mm', site.gingival_margin_mm,
        'cal_mm', site.cal_mm,
        'bleeding_on_probing', site.bleeding_on_probing,
        'suppuration', site.suppuration,
        'implant_context', site.implant_context)
        order by site.tooth_fdi, site.site)
      from public.periodontal_site_measurements as site
      where site.organization_id = v_organization_id
        and site.examination_id = v_examination_id
    ), '[]'::jsonb),
    'plaque', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'tooth_fdi', surface.tooth_fdi,
        'surface', surface.surface,
        'plaque_present', surface.plaque_present,
        'plaque_index', surface.plaque_index,
        'gingival_index', surface.gingival_index,
        'modified_plaque_index', surface.modified_plaque_index,
        'modified_bleeding_index', surface.modified_bleeding_index)
        order by surface.tooth_fdi, surface.surface)
      from public.periodontal_plaque_measurements as surface
      where surface.organization_id = v_organization_id
        and surface.examination_id = v_examination_id
    ), '[]'::jsonb),
    'tooth', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'tooth_fdi', tooth.tooth_fdi,
        'tooth_present', tooth.tooth_present,
        'implant_context', tooth.implant_context,
        'context_inferred', tooth.context_inferred,
        'mobility_miller', tooth.mobility_miller,
        'notes', tooth.notes,
        'keratinized_gingiva_mm', tooth.keratinized_gingiva_mm,
        'gingival_thickness_mm', tooth.gingival_thickness_mm,
        'gingival_phenotype', tooth.gingival_phenotype,
        'miller_recession_class', tooth.miller_recession_class,
        'cej_visible', tooth.cej_visible,
        'root_concavity', tooth.root_concavity)
        order by tooth.tooth_fdi)
      from public.periodontal_tooth_measurements as tooth
      where tooth.organization_id = v_organization_id
        and tooth.examination_id = v_examination_id
    ), '[]'::jsonb),
    'furcation', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'tooth_fdi', furcation.tooth_fdi,
        'entrance', furcation.entrance,
        'grade', furcation.grade)
        order by furcation.tooth_fdi, furcation.entrance)
      from public.periodontal_furcation_measurements as furcation
      where furcation.organization_id = v_organization_id
        and furcation.examination_id = v_examination_id
    ), '[]'::jsonb),
    'derived', case when v_examination_id is null then null else pg_catalog.jsonb_build_object(
      'diagnosis', v_derived.diagnosis,
      'stage', v_derived.stage,
      'grade', v_derived.grade,
      'extent', v_derived.extent,
      'present_tooth_count', v_derived.present_tooth_count,
      'teeth_with_known_interdental_cal', v_derived.teeth_with_known_interdental_cal,
      'assessed_bop_site_count', v_derived.assessed_bop_site_count,
      'bleeding_site_count', v_derived.bleeding_site_count,
      'bop_percent', v_derived.bop_percent,
      'complete', v_derived.complete) end,
    'timeline', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', exam.id,
        'examination_kind', exam.examination_kind,
        'status', exam.status,
        'version', exam.version,
        'recorded_at', exam.recorded_at,
        'finalized_at', exam.finalized_at,
        'predecessor_examination_id', exam.predecessor_examination_id,
        'confirmed_diagnosis', exam.confirmed_diagnosis)
        order by exam.recorded_at desc, exam.id)
      from public.periodontal_examinations as exam
      where exam.organization_id = v_organization_id
        and exam.patient_id = p_patient_id
    ), '[]'::jsonb)
  );

  return next;
end
$$;

revoke all on function public.get_periodontal_workspace_v2(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.get_periodontal_workspace_v2(uuid, uuid, uuid) is
  'The read-only projection the periodontal workspace is rebuilt from on every load. It derives organization and actor inside a stable SECURITY DEFINER body with an empty search path, requires live patient.clinical.read at an active acting branch, validates the patient and any named examination against the derived tenant, and refuses a foreign examination as unauthorized rather than reporting it absent. It returns the canonical examination, its site, surface, tooth and furcation rows, the classification recomputed server-side from those rows, the classification the clinician actually signed, and the patient''s examination timeline. It writes nothing at all.';

create function private.periodontal_examination_summary(
  p_organization_id uuid,
  p_examination_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', exam.id,
    'examination_kind', exam.examination_kind,
    'status', exam.status,
    'version', exam.version,
    'recorded_at', exam.recorded_at,
    'finalized_at', exam.finalized_at,
    'predecessor_examination_id', exam.predecessor_examination_id,
    'confirmed_diagnosis', exam.confirmed_diagnosis,
    'confirmed_stage', exam.confirmed_stage,
    'confirmed_grade', exam.confirmed_grade,
    'confirmed_extent', exam.confirmed_extent)
  from public.periodontal_examinations as exam
  where exam.organization_id = p_organization_id
    and exam.id = p_examination_id;
$$;

revoke all on function private.periodontal_examination_summary(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function private.periodontal_examination_summary(uuid, uuid) is
  'One periodontal examination reduced to the identity, lifecycle and signed-classification fields a comparison header needs. Tenant-scoped by argument and never browser callable; the calling projection has already authorized the read.';

create function public.compare_periodontal_examinations_v2(
  p_patient_id uuid,
  p_branch_id uuid,
  p_left_examination_id uuid,
  p_right_examination_id uuid
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
  v_left_derived record;
  v_right_derived record;
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

  if p_patient_id is null or p_left_examination_id is null or p_right_examination_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if (
    select pg_catalog.count(*)
    from public.periodontal_examinations as exam
    where exam.organization_id = v_organization_id
      and exam.patient_id = p_patient_id
      and exam.id in (p_left_examination_id, p_right_examination_id)
  ) <> (case when p_left_examination_id = p_right_examination_id then 1 else 2 end) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select * into v_left_derived
  from private.periodontal_derived_classification(v_organization_id, p_left_examination_id) as derivation;
  select * into v_right_derived
  from private.periodontal_derived_classification(v_organization_id, p_right_examination_id) as derivation;

  payload := pg_catalog.jsonb_build_object(
    'left', private.periodontal_examination_summary(v_organization_id, p_left_examination_id),
    'right', private.periodontal_examination_summary(v_organization_id, p_right_examination_id),
    'left_derived', pg_catalog.jsonb_build_object(
      'diagnosis', v_left_derived.diagnosis,
      'stage', v_left_derived.stage,
      'grade', v_left_derived.grade,
      'extent', v_left_derived.extent,
      'bop_percent', v_left_derived.bop_percent,
      'complete', v_left_derived.complete),
    'right_derived', pg_catalog.jsonb_build_object(
      'diagnosis', v_right_derived.diagnosis,
      'stage', v_right_derived.stage,
      'grade', v_right_derived.grade,
      'extent', v_right_derived.extent,
      'bop_percent', v_right_derived.bop_percent,
      'complete', v_right_derived.complete),
    -- A FULL OUTER JOIN, so two examinations with different tooth sets compare
    -- honestly: a site charted on only one side reports the other side as null
    -- and its delta as unknown. Treating an absent counterpart as zero would
    -- manufacture an improvement or a deterioration that nobody measured.
    'sites', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'tooth_fdi', coalesce(left_site.tooth_fdi, right_site.tooth_fdi),
        'site', coalesce(left_site.site, right_site.site),
        'left_probing_depth_mm', left_site.probing_depth_mm,
        'left_gingival_margin_mm', left_site.gingival_margin_mm,
        'left_cal_mm', left_site.cal_mm,
        'left_bleeding_on_probing', left_site.bleeding_on_probing,
        'right_probing_depth_mm', right_site.probing_depth_mm,
        'right_gingival_margin_mm', right_site.gingival_margin_mm,
        'right_cal_mm', right_site.cal_mm,
        'right_bleeding_on_probing', right_site.bleeding_on_probing,
        'delta_probing_depth_mm', right_site.probing_depth_mm - left_site.probing_depth_mm,
        'delta_cal_mm', right_site.cal_mm - left_site.cal_mm)
        order by coalesce(left_site.tooth_fdi, right_site.tooth_fdi),
                 coalesce(left_site.site, right_site.site))
      from (
        select site.tooth_fdi, site.site, site.probing_depth_mm, site.gingival_margin_mm,
               site.cal_mm, site.bleeding_on_probing
        from public.periodontal_site_measurements as site
        where site.organization_id = v_organization_id
          and site.examination_id = p_left_examination_id
      ) as left_site
      full outer join (
        select site.tooth_fdi, site.site, site.probing_depth_mm, site.gingival_margin_mm,
               site.cal_mm, site.bleeding_on_probing
        from public.periodontal_site_measurements as site
        where site.organization_id = v_organization_id
          and site.examination_id = p_right_examination_id
      ) as right_site
        on right_site.tooth_fdi = left_site.tooth_fdi
       and right_site.site = left_site.site
    ), '[]'::jsonb)
  );

  return next;
end
$$;

revoke all on function public.compare_periodontal_examinations_v2(uuid, uuid, uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.compare_periodontal_examinations_v2(uuid, uuid, uuid, uuid) is
  'The read-only periodontal comparison projection. It derives organization and actor inside a stable SECURITY DEFINER body with an empty search path, requires live patient.clinical.read at an active acting branch, and refuses as unauthorized any examination that is not this tenant''s and this patient''s. The two six-site charts are FULL OUTER JOINed, so examinations with different tooth sets compare honestly: a site charted on only one side reports the missing counterpart and its delta as unknown rather than as zero. It writes nothing at all.';
