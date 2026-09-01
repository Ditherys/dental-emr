-- Unified Clinical Chart workspace, task 12: provider and branch attribution on
-- the periodontal comparison projection.
--
-- A comparison of two periodontal examinations is a clinical judgement about
-- change over time, and who performed each examination and where is material to
-- reading it. Two examinations charted by different clinicians at different
-- branches are not straightforwardly comparable, and the screen must be able to
-- say so. `private.periodontal_examination_summary` returned identity,
-- lifecycle and the signed classification only, so the workspace had nothing to
-- label the two sides with and correctly refused to invent it.
--
-- This migration is ADDITIVE and touches one function body:
--
--   * `private.periodontal_examination_summary(uuid, uuid)` gains six keys -
--     the examining and finalizing provider ids and display names, and the
--     branch id and name taken from the examination's own encounter.
--
-- Nothing else moves. `public.compare_periodontal_examinations_v2` is NOT
-- replaced: it already embeds the helper's whole jsonb result under 'left' and
-- 'right', so the new keys reach the payload without touching the boundary, its
-- authorization, its FULL OUTER JOIN, or its null deltas. No table, column,
-- constraint, index, policy or trigger changes. This migration creates no new
-- object, grants nothing, and is not a grant-terminal.
--
-- The helper is replaced with CREATE OR REPLACE rather than the text-surgery
-- guarded replace used by 20260901010244 and 20260901010245. Those exist to
-- preserve the browser grants on an applied SECURITY DEFINER boundary while
-- patching it in place; this helper is `private`, holds no grant at all, and is
-- being rewritten wholesale rather than patched, so surgery on its text would
-- buy nothing. The guards that matter are kept and are asserted below: the
-- function must already exist with this exact signature before it is replaced,
-- and it must still be revoked from every browser-reachable role afterwards.
--
-- The display name uses the same concat_ws form as every other provider
-- projection in this repository (20260826010300, 20260827010900,
-- 20260827011600), so a comparison header reads the provider exactly as the
-- scheduler and the queue do.
--
-- A provider name is workforce attribution, not patient or clinical content.
-- The projection remains read-only and remains gated by the caller's
-- patient.clinical.read at an active acting branch.

do $guard$
begin
  if to_regprocedure('private.periodontal_examination_summary(uuid,uuid)') is null then
    raise exception using errcode = '55000',
      message = 'private.periodontal_examination_summary(uuid,uuid) is absent, so there is nothing to extend';
  end if;
end
$guard$;

create or replace function private.periodontal_examination_summary(
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
    'confirmed_extent', exam.confirmed_extent,
    -- Attribution. Every one of these is nullable and stays null rather than
    -- being coalesced to a placeholder: an examination whose provider link was
    -- never established is not attributable, and a comparison must say so
    -- rather than name somebody.
    'examined_provider_id', exam.examined_provider_id,
    'examined_provider_name', examined_provider.display_name,
    'finalized_provider_id', exam.finalized_provider_id,
    'finalized_provider_name', finalized_provider.display_name,
    'branch_id', encounter.branch_id,
    'branch_name', branch.name)
  from public.periodontal_examinations as exam
  left join public.clinical_encounters as encounter
    on encounter.id = exam.encounter_id
   and encounter.organization_id = exam.organization_id
  left join public.branches as branch
    on branch.id = encounter.branch_id
   and branch.organization_id = exam.organization_id
  left join lateral (
    select pg_catalog.concat_ws(
      ' ', provider.first_name, provider.middle_name, provider.last_name, provider.suffix
    ) as display_name
    from public.providers as provider
    where provider.id = exam.examined_provider_id
      and provider.organization_id = exam.organization_id
  ) as examined_provider on true
  left join lateral (
    select pg_catalog.concat_ws(
      ' ', provider.first_name, provider.middle_name, provider.last_name, provider.suffix
    ) as display_name
    from public.providers as provider
    where provider.id = exam.finalized_provider_id
      and provider.organization_id = exam.organization_id
  ) as finalized_provider on true
  where exam.organization_id = p_organization_id
    and exam.id = p_examination_id;
$$;

revoke all on function private.periodontal_examination_summary(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function private.periodontal_examination_summary(uuid, uuid) is
  'One periodontal examination reduced to the identity, lifecycle, signed-classification and attribution fields a comparison header needs: the examining and finalizing providers by id and display name, and the branch the examination''s own encounter belongs to. Every join is tenant-scoped by the examination''s organization, and every attribution field stays NULL when it is genuinely unknown rather than being coalesced to a placeholder. Tenant-scoped by argument and never browser callable; the calling projection has already authorized the read.';

-- The helper must still be unreachable from any browser role. CREATE OR REPLACE
-- preserves an existing ACL, and this one is empty, but that is asserted here
-- rather than assumed.
do $boundary$
declare
  v_leak text;
begin
  select pg_catalog.string_agg(p.proname, ', ')
  into v_leak
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'periodontal_examination_summary'
    and (
      p.proconfig is distinct from array['search_path=""']::text[]
      or pg_catalog.has_function_privilege('public', p.oid, 'execute')
      or pg_catalog.has_function_privilege('anon', p.oid, 'execute')
      or pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
      or pg_catalog.has_function_privilege('service_role', p.oid, 'execute')
    );

  if v_leak is not null then
    raise exception using errcode = '55000',
      message = 'the extended periodontal comparison helper became browser reachable or lost its empty search path: ' || v_leak;
  end if;
end
$boundary$;
