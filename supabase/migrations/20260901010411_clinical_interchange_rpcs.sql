-- Unified Clinical Chart workspace, task 15: the clinical interchange boundary.
--
-- Five narrow SECURITY DEFINER functions with an empty search path. Every one
-- of them derives the organization from an ACTIVE acting branch and the actor
-- from auth.uid(); none accepts an organization, provider, encounter or author
-- identity from a client, and none reads one out of an uploaded file.
--
-- The load-bearing separation:
--
--   create_clinical_import_batch_v1  stages candidates and WRITES NO CLINICAL
--                                    RECORD AND OPENS NO ENCOUNTER. It requires
--                                    patient.clinical.write, revalidates every
--                                    normalized candidate the parser produced,
--                                    and re-derives each candidate's
--                                    classification from the canonical chart
--                                    rather than trusting the submitted one.
--
--   apply_clinical_import_batch_v1   appends the candidates the clinician
--                                    explicitly selected, in one transaction,
--                                    through the EXISTING reviewed writer
--                                    public.record_visit_tooth_findings. It
--                                    duplicates no authorization: the provider
--                                    comes from private.require_active_actor_provider
--                                    and the encounter from the managed visit
--                                    that writer already opens. A CONFLICT or
--                                    UNSUPPORTED candidate can never be
--                                    applied, and nothing is ever replaced.
--
-- Advisory-lock seed 8 is new to this migration; seeds 0-7 belong to the visit
-- lifecycle, the composer and the periodontal workflows and are untouched.

-- ---------------------------------------------------------------------------
-- The canonical comparison
-- ---------------------------------------------------------------------------

create function private.clinical_import_candidate_classification(
  p_organization_id uuid,
  p_patient_id uuid,
  p_tooth_code text,
  p_clinical_code text,
  p_surfaces text[]
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select
      entry.id,
      entry.clinical_code,
      coalesce((
        select pg_catalog.array_agg(surface.surface order by surface.surface)
        from public.tooth_clinical_entry_surfaces as surface
        where surface.organization_id = entry.organization_id
          and surface.entry_id = entry.id
      ), '{}'::text[]) as surfaces
    from public.tooth_clinical_entries as entry
    where entry.organization_id = p_organization_id
      and entry.patient_id = p_patient_id
      and entry.tooth_code = p_tooth_code
      and entry.kind = 'FINDING'
      -- Liveness is the projection's own definition of CURRENT: not voided in
      -- place, not withdrawn by an append-only void row, and not superseded.
      -- A voided_at column alone is not the whole story on this table.
      and entry.voided_at is null
      and not exists (
        select 1
        from public.tooth_clinical_entry_voids as withdrawal
        where withdrawal.organization_id = entry.organization_id
          and withdrawal.entry_id = entry.id
      )
      and not exists (
        select 1
        from public.tooth_clinical_entries as successor
        where successor.organization_id = entry.organization_id
          and successor.supersedes_entry_id = entry.id
      )
  ),
  candidate as (
    select coalesce((
      select pg_catalog.array_agg(distinct element.value order by element.value)
      from pg_catalog.unnest(p_surfaces) as element(value)
    ), '{}'::text[]) as surfaces
  )
  select case
    when exists (
      select 1
      from live, candidate
      where live.clinical_code = p_clinical_code
        and live.surfaces = candidate.surfaces
    ) then 'DUPLICATE'
    when exists (
      select 1
      from live, candidate
      where live.clinical_code <> p_clinical_code
        and (
          (
            pg_catalog.cardinality(live.surfaces) = 0
            and pg_catalog.cardinality(candidate.surfaces) = 0
          )
          or live.surfaces && candidate.surfaces
        )
    ) then 'CONFLICT'
    else 'NEW'
  end
$$;

revoke all on function private.clinical_import_candidate_classification(uuid, uuid, text, text, text[])
from public, anon, authenticated, service_role;

comment on function private.clinical_import_candidate_classification(uuid, uuid, text, text, text[]) is
  'Decides what a normalized import candidate is against the patient''s live canonical findings: DUPLICATE when the same tooth already carries the same code on the same surface set, CONFLICT when the same tooth and overlapping surfaces already assert a different code, NEW otherwise. It is the database''s own answer, so a client cannot mislabel a conflict as new.';

-- ---------------------------------------------------------------------------
-- Staging
-- ---------------------------------------------------------------------------

create function public.create_clinical_import_batch_v1(
  p_branch_id uuid,
  p_patient_id uuid,
  p_format text,
  p_source_digest text,
  p_candidates jsonb,
  p_idempotency_key uuid
)
returns table (
  batch_id uuid,
  staged_count integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_batch_id uuid;
  v_today date;
  v_item jsonb;
  v_ordinal bigint;
  v_kind text;
  v_classification text;
  v_derived text;
  v_tooth text;
  v_code text;
  v_surfaces text[];
  v_date text;
  v_note text;
  v_label text;
  v_reason text;
  v_stored_batch uuid;
  v_stored_count integer;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null
     or p_idempotency_key is null
     or p_format is null
     or p_format not in ('EMR_JSON_V1', 'FHIR_R4_BUNDLE')
     or p_source_digest is null
     or p_source_digest !~ '^[0-9a-f]{64}$'
     or p_candidates is null
     or pg_catalog.jsonb_typeof(p_candidates) <> 'array'
     or pg_catalog.jsonb_array_length(p_candidates) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- Request lock in its own key space (seed 8), never shared with the visit
  -- lifecycle (0/1), the composer (2) or the periodontal workflows.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_actor_user_id::text
        || ':IMPORT_STAGE:' || p_idempotency_key::text,
      8
    )
  );

  insert into private.clinical_interchange_idempotency (
    organization_id, actor_user_id, operation, idempotency_key
  ) values (
    v_organization_id, v_actor_user_id, 'IMPORT_STAGE', p_idempotency_key
  ) on conflict do nothing;

  select request.batch_id, request.result_count
    into v_stored_batch, v_stored_count
  from private.clinical_interchange_idempotency as request
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'IMPORT_STAGE'
    and request.idempotency_key = p_idempotency_key
  for update;

  if v_stored_batch is not null then
    create_clinical_import_batch_v1.batch_id := v_stored_batch;
    create_clinical_import_batch_v1.staged_count := v_stored_count;
    create_clinical_import_batch_v1.replayed := true;
    return next;
    return;
  end if;

  v_today := (pg_catalog.timezone('Asia/Manila', pg_catalog.statement_timestamp()))::date;

  insert into public.clinical_import_batches as batch (
    organization_id, branch_id, patient_id, batch_format, source_digest,
    staged_count, batch_status, created_by
  ) values (
    v_organization_id, p_branch_id, p_patient_id, p_format, p_source_digest,
    pg_catalog.jsonb_array_length(p_candidates), 'STAGED', v_actor_user_id
  ) returning batch.id into v_batch_id;

  for v_item, v_ordinal in
    select element.value, element.ordinality
    from pg_catalog.jsonb_array_elements(p_candidates)
      with ordinality as element(value, ordinality)
    order by element.ordinality
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object' then
      raise invalid_parameter_value using message = 'invalid input';
    end if;

    v_kind := v_item ->> 'kind';
    v_classification := v_item ->> 'classification';

    if v_kind = 'TOOTH_FINDING' then
      -- A closed key allowlist. It is what refuses __proto__, constructor and
      -- prototype, and equally what refuses an embedded organizationId,
      -- branchId, providerId or createdBy: a file does not get to name any
      -- authority, and an unmodelled key is never silently ignored.
      if exists (
        select 1
        from pg_catalog.jsonb_object_keys(v_item) as candidate_key(key)
        where candidate_key.key not in (
          'kind', 'classification', 'toothCode', 'clinicalCode',
          'surfaces', 'clinicalDate', 'note'
        )
      ) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;

      if pg_catalog.jsonb_typeof(v_item -> 'surfaces') <> 'array' then
        raise invalid_parameter_value using message = 'invalid input';
      end if;

      select coalesce(
        pg_catalog.array_agg(element.value order by element.value),
        '{}'::text[]
      )
        into v_surfaces
      from pg_catalog.jsonb_array_elements_text(v_item -> 'surfaces') as element(value);

      v_tooth := v_item ->> 'toothCode';
      v_code := v_item ->> 'clinicalCode';
      v_date := v_item ->> 'clinicalDate';
      v_note := nullif(pg_catalog.btrim(coalesce(v_item ->> 'note', '')), '');

      if v_tooth is null
         or v_tooth !~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
         or v_code is null
         or v_code not in (
           'CARIES', 'RESTORATION', 'CROWN', 'MISSING', 'SEALANT', 'FRACTURE', 'OTHER'
         )
         or v_classification is null
         or v_classification not in ('NEW', 'DUPLICATE', 'CONFLICT')
         or pg_catalog.cardinality(v_surfaces) > 7
         or not (v_surfaces <@ array['O', 'B', 'L', 'M', 'D', 'I', 'F']::text[])
         or pg_catalog.cardinality(v_surfaces) <> (
           select pg_catalog.count(distinct element.value)::integer
           from pg_catalog.unnest(v_surfaces) as element(value)
         )
         or coalesce(pg_catalog.length(v_note), 0) > 2000
         or v_date is null
         or v_date !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
        raise invalid_parameter_value using message = 'invalid input';
      end if;

      -- A crown or a missing tooth is a whole-tooth fact; every other imported
      -- finding names at least one surface. The same rule the composer applies.
      if v_code in ('CROWN', 'MISSING') then
        if pg_catalog.cardinality(v_surfaces) <> 0 then
          raise invalid_parameter_value using message = 'invalid input';
        end if;
      elsif pg_catalog.cardinality(v_surfaces) = 0 then
        raise invalid_parameter_value using message = 'invalid input';
      end if;

      -- The second FDI digit is the position in the arch: 1-3 anterior, 4-8
      -- posterior. An occlusal table exists only on a posterior tooth and an
      -- incisal edge only on an anterior one.
      if pg_catalog.substr(v_tooth, 2, 1) in ('1', '2', '3') then
        if 'O' = any(v_surfaces) then
          raise invalid_parameter_value using message = 'invalid input';
        end if;
      elsif 'I' = any(v_surfaces) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;

      if v_date::date > v_today or v_date::date < v_today - 36525 then
        raise invalid_parameter_value using message = 'invalid input';
      end if;

      -- The database decides what this candidate is. A submitted classification
      -- that disagrees with the canonical chart is refused rather than stored,
      -- so a client can neither hide a conflict nor invent a duplicate.
      v_derived := private.clinical_import_candidate_classification(
        v_organization_id, p_patient_id, v_tooth, v_code, v_surfaces
      );

      if v_derived is distinct from v_classification then
        raise invalid_parameter_value using message = 'invalid input';
      end if;

      insert into public.clinical_import_candidates (
        organization_id, batch_id, ordinal, candidate_kind, classification,
        tooth_code, clinical_code, surfaces, clinical_date, note
      ) values (
        v_organization_id, v_batch_id, v_ordinal::integer, 'TOOTH_FINDING',
        v_derived, v_tooth, v_code, v_surfaces, v_date::date, v_note
      );

    elsif v_kind = 'UNSUPPORTED' then
      if exists (
        select 1
        from pg_catalog.jsonb_object_keys(v_item) as candidate_key(key)
        where candidate_key.key not in ('kind', 'classification', 'resourceLabel', 'reason')
      ) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;

      v_label := v_item ->> 'resourceLabel';
      v_reason := v_item ->> 'reason';

      if v_label is null
         or v_label !~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'
         or v_reason is null
         or v_reason not in (
           'UNSUPPORTED_RESOURCE', 'UNSUPPORTED_RECORD_KIND', 'INVALID_CANDIDATE'
         )
         or v_classification is distinct from 'UNSUPPORTED' then
        raise invalid_parameter_value using message = 'invalid input';
      end if;

      insert into public.clinical_import_candidates (
        organization_id, batch_id, ordinal, candidate_kind, classification,
        unsupported_label, unsupported_reason
      ) values (
        v_organization_id, v_batch_id, v_ordinal::integer, 'UNSUPPORTED',
        'UNSUPPORTED', v_label, v_reason
      );

    else
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end loop;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.import.staged', 'clinical_import_batch', v_batch_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  update private.clinical_interchange_idempotency as request
  set batch_id = v_batch_id,
      result_count = pg_catalog.jsonb_array_length(p_candidates)
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'IMPORT_STAGE'
    and request.idempotency_key = p_idempotency_key;

  create_clinical_import_batch_v1.batch_id := v_batch_id;
  create_clinical_import_batch_v1.staged_count := pg_catalog.jsonb_array_length(p_candidates);
  create_clinical_import_batch_v1.replayed := false;
  return next;
end;
$$;

revoke all on function public.create_clinical_import_batch_v1(uuid, uuid, text, text, jsonb, uuid)
from public, anon, authenticated, service_role;

comment on function public.create_clinical_import_batch_v1(uuid, uuid, text, text, jsonb, uuid) is
  'Stages a bounded set of normalized import candidates against one patient. It requires live patient.clinical.write at an active acting branch, derives the organization and actor server-side, and validates the patient against the derived tenant. It WRITES NO CLINICAL RECORD AND OPENS NO ENCOUNTER: parsing is not a clinical write. Every candidate is revalidated here as well as in the server action - a closed key allowlist (which is what refuses __proto__, constructor, prototype and any embedded organization, branch or provider identifier), the FDI tooth ranges, the accepted clinical codes, surface anatomy, whole-tooth versus surface compatibility, the bounded note, and the Philippine clinical-date bound. Each candidate''s NEW/DUPLICATE/CONFLICT classification is re-derived from the canonical chart and a submitted classification that disagrees is refused. A replayed request key returns the original batch. One bounded audit event carries no candidate payload.';

-- ---------------------------------------------------------------------------
-- Reading a staged batch back
-- ---------------------------------------------------------------------------

create function public.get_clinical_import_batch_v1(
  p_branch_id uuid,
  p_patient_id uuid,
  p_batch_id uuid
)
returns table (
  batch_id uuid,
  batch_status text,
  batch_format text,
  source_digest text,
  staged_count integer,
  created_at timestamptz,
  applied_encounter_id uuid,
  candidate_id uuid,
  ordinal integer,
  classification text,
  candidate_kind text,
  tooth_code text,
  clinical_code text,
  surfaces text[],
  clinical_date date,
  note text,
  unsupported_label text,
  unsupported_reason text,
  applied_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
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

  -- A batch belonging to another tenant, another patient or another branch is
  -- refused as unauthorized rather than reported absent.
  if p_batch_id is null or not exists (
    select 1
    from public.clinical_import_batches as batch
    where batch.organization_id = v_organization_id
      and batch.id = p_batch_id
      and batch.patient_id = p_patient_id
      and batch.branch_id = p_branch_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- Every column reference is qualified. This projection's OUT parameters share
  -- names with the columns it reads, and an unqualified reference would make
  -- the success path fail with 42702 while a denial-only suite still passed.
  return query
  select
    batch.id,
    batch.batch_status,
    batch.batch_format,
    batch.source_digest,
    batch.staged_count,
    batch.created_at,
    batch.applied_encounter_id,
    candidate.id,
    candidate.ordinal,
    candidate.classification,
    candidate.candidate_kind,
    candidate.tooth_code,
    candidate.clinical_code,
    candidate.surfaces,
    candidate.clinical_date,
    candidate.note,
    candidate.unsupported_label,
    candidate.unsupported_reason,
    candidate.applied_at
  from public.clinical_import_batches as batch
  join public.clinical_import_candidates as candidate
    on candidate.organization_id = batch.organization_id
   and candidate.batch_id = batch.id
  where batch.organization_id = v_organization_id
    and batch.id = p_batch_id
    and batch.patient_id = p_patient_id
  order by candidate.ordinal
  limit 500;
end;
$$;

revoke all on function public.get_clinical_import_batch_v1(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.get_clinical_import_batch_v1(uuid, uuid, uuid) is
  'The read-only projection the import review table is rebuilt from. It requires live patient.clinical.read at an active acting branch, derives the organization and actor server-side, and refuses a batch that is not this tenant''s, this patient''s and this branch''s as unauthorized rather than reporting it absent. Its page is bounded by the same five-hundred-candidate ceiling the staging boundary enforces. It writes nothing at all - no row, no state change and no audit event.';

-- ---------------------------------------------------------------------------
-- Applying the selected candidates
-- ---------------------------------------------------------------------------

create function public.apply_clinical_import_batch_v1(
  p_branch_id uuid,
  p_patient_id uuid,
  p_batch_id uuid,
  p_candidate_ids uuid[],
  p_idempotency_key uuid
)
returns table (
  applied_count integer,
  encounter_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_batch_status text;
  v_encounter_id uuid;
  v_applied integer := 0;
  v_candidate record;
  v_stored_count integer;
  v_stored_encounter uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null
     or p_batch_id is null
     or p_idempotency_key is null
     or p_candidate_ids is null
     or pg_catalog.cardinality(p_candidate_ids) not between 1 and 500
     or pg_catalog.cardinality(p_candidate_ids) <> (
       select pg_catalog.count(distinct element.value)::integer
       from pg_catalog.unnest(p_candidate_ids) as element(value)
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- Seed 8, always taken before the composer's seed-2 request lock and the
  -- visit lifecycle's seed-1 and seed-0 locks that record_visit_tooth_findings
  -- takes below, so lock ordering stays structural and cannot deadlock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_actor_user_id::text
        || ':IMPORT_APPLY:' || p_idempotency_key::text,
      8
    )
  );

  insert into private.clinical_interchange_idempotency (
    organization_id, actor_user_id, operation, idempotency_key
  ) values (
    v_organization_id, v_actor_user_id, 'IMPORT_APPLY', p_idempotency_key
  ) on conflict do nothing;

  select request.result_count, request.encounter_id
    into v_stored_count, v_stored_encounter
  from private.clinical_interchange_idempotency as request
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'IMPORT_APPLY'
    and request.idempotency_key = p_idempotency_key
  for update;

  if v_stored_count is not null then
    apply_clinical_import_batch_v1.applied_count := v_stored_count;
    apply_clinical_import_batch_v1.encounter_id := v_stored_encounter;
    apply_clinical_import_batch_v1.replayed := true;
    return next;
    return;
  end if;

  select batch.batch_status into v_batch_status
  from public.clinical_import_batches as batch
  where batch.organization_id = v_organization_id
    and batch.id = p_batch_id
    and batch.patient_id = p_patient_id
    and batch.branch_id = p_branch_id
  for update;

  if v_batch_status is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_batch_status <> 'STAGED' then
    raise exception using message = 'invalid state';
  end if;

  -- A candidate identifier that is not in this batch is not a validation
  -- problem, it is an attempt to reach a row through the wrong door.
  if exists (
    select 1
    from pg_catalog.unnest(p_candidate_ids) as selected(id)
    where not exists (
      select 1
      from public.clinical_import_candidates as candidate
      where candidate.organization_id = v_organization_id
        and candidate.batch_id = p_batch_id
        and candidate.id = selected.id
    )
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- Only a supported candidate the clinician selected may be applied. A
  -- CONFLICT stays refused until it is explicitly excluded from the selection,
  -- and an UNSUPPORTED candidate can never be applied at all.
  if exists (
    select 1
    from public.clinical_import_candidates as candidate
    where candidate.organization_id = v_organization_id
      and candidate.batch_id = p_batch_id
      and candidate.id = any(p_candidate_ids)
      and (
        candidate.candidate_kind <> 'TOOTH_FINDING'
        or candidate.classification not in ('NEW', 'DUPLICATE')
        or candidate.applied_at is not null
      )
  ) then
    raise exception using message = 'invalid state';
  end if;

  -- The treating provider is derived from the signed-in user before anything
  -- is written, so a clinician with no active provider link at this branch is
  -- refused without a managed visit having been opened on their behalf.
  perform private.require_active_actor_provider(
    v_organization_id, p_branch_id, v_actor_user_id
  );

  for v_candidate in
    select
      candidate.id,
      candidate.tooth_code,
      candidate.clinical_code,
      candidate.surfaces,
      candidate.clinical_date,
      candidate.note
    from public.clinical_import_candidates as candidate
    where candidate.organization_id = v_organization_id
      and candidate.batch_id = p_batch_id
      and candidate.id = any(p_candidate_ids)
    order by candidate.ordinal
  loop
    -- The existing reviewed writer, not a second insert path. It opens or
    -- resumes the managed visit, derives the treating provider again,
    -- revalidates the finding, appends the entry and audits it. Nothing here
    -- duplicates its authorization, and nothing here replaces a chart row.
    select visit.encounter_id into v_encounter_id
    from public.record_visit_tooth_findings(
      p_branch_id,
      p_patient_id,
      array[v_candidate.tooth_code],
      v_candidate.clinical_code,
      v_candidate.surfaces,
      'ACTIVE',
      v_candidate.clinical_date,
      v_candidate.note,
      (pg_catalog.md5(p_batch_id::text || ':' || v_candidate.id::text))::uuid
    ) as visit;

    if v_encounter_id is null then
      raise insufficient_privilege using message = 'not authorized';
    end if;

    update public.clinical_import_candidates as candidate
    set applied_at = pg_catalog.statement_timestamp()
    where candidate.organization_id = v_organization_id
      and candidate.id = v_candidate.id;

    v_applied := v_applied + 1;
  end loop;

  update public.clinical_import_batches as batch
  set batch_status = 'APPLIED',
      applied_at = pg_catalog.statement_timestamp(),
      applied_by = v_actor_user_id,
      applied_encounter_id = v_encounter_id
  where batch.organization_id = v_organization_id
    and batch.id = p_batch_id;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.import.applied', 'clinical_import_batch', p_batch_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  update private.clinical_interchange_idempotency as request
  set batch_id = p_batch_id,
      encounter_id = v_encounter_id,
      result_count = v_applied
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'IMPORT_APPLY'
    and request.idempotency_key = p_idempotency_key;

  apply_clinical_import_batch_v1.applied_count := v_applied;
  apply_clinical_import_batch_v1.encounter_id := v_encounter_id;
  apply_clinical_import_batch_v1.replayed := false;
  return next;
end;
$$;

revoke all on function public.apply_clinical_import_batch_v1(uuid, uuid, uuid, uuid[], uuid)
from public, anon, authenticated, service_role;

comment on function public.apply_clinical_import_batch_v1(uuid, uuid, uuid, uuid[], uuid) is
  'Appends the staged candidates a clinician explicitly selected, in one transaction. It requires live patient.clinical.write at an active acting branch plus an active linked provider there through private.require_active_actor_provider, so an owner who does not treat is refused. Only a STAGED batch belonging to this tenant, this patient and this branch may be applied, only candidates in that batch may be named, and only supported NEW or DUPLICATE candidates may be applied - a CONFLICT stays refused until it is excluded and an UNSUPPORTED candidate can never be applied. Each selected candidate is written through the existing public.record_visit_tooth_findings boundary, so the managed visit, the derived treating provider, the clinical revalidation and the per-entry audit event are the reviewed ones rather than a second path; a deterministic per-candidate request key makes a retry replay instead of appending twice. The chart is only ever appended to: no existing row is rewritten, superseded or deleted. A replayed request key returns the original result. No organization, provider, actor, encounter or visit date may be supplied by a client.';

-- ---------------------------------------------------------------------------
-- Abandoning a batch
-- ---------------------------------------------------------------------------

create function public.archive_clinical_import_batch_v1(
  p_branch_id uuid,
  p_patient_id uuid,
  p_batch_id uuid,
  p_reason text
)
returns table (
  batch_id uuid,
  batch_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_reason text;
  v_status text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_reason := pg_catalog.btrim(coalesce(p_reason, ''));

  if p_patient_id is null
     or p_batch_id is null
     or v_reason = ''
     or pg_catalog.length(v_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select batch.batch_status into v_status
  from public.clinical_import_batches as batch
  where batch.organization_id = v_organization_id
    and batch.id = p_batch_id
    and batch.patient_id = p_patient_id
    and batch.branch_id = p_branch_id
  for update;

  if v_status is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_status <> 'STAGED' then
    raise exception using message = 'invalid state';
  end if;

  update public.clinical_import_batches as batch
  set batch_status = 'ARCHIVED',
      archived_at = pg_catalog.statement_timestamp(),
      archived_by = v_actor_user_id,
      archive_reason = v_reason
  where batch.organization_id = v_organization_id
    and batch.id = p_batch_id;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.import.archived', 'clinical_import_batch', p_batch_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  archive_clinical_import_batch_v1.batch_id := p_batch_id;
  archive_clinical_import_batch_v1.batch_status := 'ARCHIVED';
  return next;
end;
$$;

revoke all on function public.archive_clinical_import_batch_v1(uuid, uuid, uuid, text)
from public, anon, authenticated, service_role;

comment on function public.archive_clinical_import_batch_v1(uuid, uuid, uuid, text) is
  'Abandons a STAGED import batch with a bounded reason. It requires live patient.clinical.write at an active acting branch and refuses a batch that is not this tenant''s, this patient''s and this branch''s as unauthorized. An APPLIED batch cannot be archived and an archived batch can never afterwards reach the chart. The reason stays on the row-level-security protected batch row and is never copied into the audit event.';

-- ---------------------------------------------------------------------------
-- Registering an export
-- ---------------------------------------------------------------------------

create function public.record_clinical_export_v1(
  p_branch_id uuid,
  p_patient_id uuid,
  p_format text,
  p_scope text,
  p_idempotency_key uuid
)
returns table (
  export_id uuid,
  patient_code text,
  clinical_date date,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_export_id uuid;
  v_code text;
  v_today date;
  v_stored_export uuid;
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

  if p_patient_id is null
     or p_idempotency_key is null
     or p_format is null
     or p_format not in ('EMR_JSON_V1', 'FHIR_R4_BUNDLE', 'PDF', 'SVG', 'PNG')
     or p_scope is null
     or p_scope not in ('CHART_CURRENT', 'PROGRESS_RECORD', 'CHART_AND_PROGRESS') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- The display code is derived here, from the stored patient number, and
  -- stripped to a filename-safe alphabet. A display filename must never carry
  -- a name, a diagnosis or any other clinical text.
  select nullif(
    pg_catalog.substr(
      pg_catalog.regexp_replace(patient.patient_number, '[^A-Za-z0-9-]', '', 'g'),
      1, 32
    ),
    ''
  )
    into v_code
  from public.patients as patient
  where patient.id = p_patient_id
    and patient.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_code := coalesce(v_code, pg_catalog.substr(pg_catalog.replace(p_patient_id::text, '-', ''), 1, 8));
  v_today := (pg_catalog.timezone('Asia/Manila', pg_catalog.statement_timestamp()))::date;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_actor_user_id::text
        || ':EXPORT_RECORD:' || p_idempotency_key::text,
      8
    )
  );

  insert into private.clinical_interchange_idempotency (
    organization_id, actor_user_id, operation, idempotency_key
  ) values (
    v_organization_id, v_actor_user_id, 'EXPORT_RECORD', p_idempotency_key
  ) on conflict do nothing;

  select request.export_id into v_stored_export
  from private.clinical_interchange_idempotency as request
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'EXPORT_RECORD'
    and request.idempotency_key = p_idempotency_key
  for update;

  if v_stored_export is not null then
    select export.clinical_date into v_today
    from public.clinical_export_records as export
    where export.organization_id = v_organization_id and export.id = v_stored_export;

    record_clinical_export_v1.export_id := v_stored_export;
    record_clinical_export_v1.patient_code := v_code;
    record_clinical_export_v1.clinical_date := v_today;
    record_clinical_export_v1.replayed := true;
    return next;
    return;
  end if;

  insert into public.clinical_export_records as export (
    organization_id, branch_id, patient_id, export_format, export_scope,
    clinical_date, requested_by
  ) values (
    v_organization_id, p_branch_id, p_patient_id, p_format, p_scope,
    v_today, v_actor_user_id
  ) returning export.id into v_export_id;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.export.recorded', 'clinical_export_record', v_export_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  update private.clinical_interchange_idempotency as request
  set export_id = v_export_id
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'EXPORT_RECORD'
    and request.idempotency_key = p_idempotency_key;

  record_clinical_export_v1.export_id := v_export_id;
  record_clinical_export_v1.patient_code := v_code;
  record_clinical_export_v1.clinical_date := v_today;
  record_clinical_export_v1.replayed := false;
  return next;
end;
$$;

revoke all on function public.record_clinical_export_v1(uuid, uuid, text, text, uuid)
from public, anon, authenticated, service_role;

comment on function public.record_clinical_export_v1(uuid, uuid, text, text, uuid) is
  'Registers and audits one authorized export BEFORE any document is generated or any download is created. It requires live patient.clinical.read at an active acting branch, derives the organization and actor server-side, validates the patient against the derived tenant, and holds the format and the scope to their allowlists, so neither is a client decision. It returns a synthetic-safe patient code derived from the stored patient number and stripped to a filename-safe alphabet, plus the Philippine clinical date, which are the only two things a display filename may contain. It stores and audits no exported content, no filename, no signed URL and no token.';
