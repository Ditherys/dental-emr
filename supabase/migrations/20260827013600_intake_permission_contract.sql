-- P17-01: the intake.manage permission and the digital intake schema.
--
-- Intake access is bound to a per-form link token whose SHA-256 hash is
-- stored (mirroring P13 booking management tokens); the token resolves exactly
-- one patient+form and no patient enumeration is possible. Consent templates
-- are versioned and, like specialties, global rows (org null) are immutable
-- defaults while each organization may own custom templates. intake_forms carry
-- a bounded answers object, a snapshot template_version, and signed/printed
-- metadata; intake_links are the short-lived token bindings.
--
-- Every table is RLS-enforced with zero base grants and no browser policies;
-- all reads and writes flow through the P17-02 SECURITY DEFINER RPCs. This
-- object migration grants nothing.

insert into public.permissions (code, description)
values (
  'intake.manage',
  'Create digital intake links, mark intake forms paper-signed/printed, and review intake status.'
)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN', 'RECEPTIONIST')
  and permission.code = 'intake.manage'
on conflict do nothing;

create or replace function private.protect_consent_template_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.organization_id is null then
    raise check_violation using message = 'global consent templates are immutable';
  end if;

  if tg_op = 'UPDATE'
     and new.organization_id is distinct from old.organization_id then
    raise check_violation using
      message = 'consent template organization scope is immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_consent_template_scope()
from public, anon, authenticated, service_role;

comment on function private.protect_consent_template_scope() is
  'Makes global (org null) consent templates immutable defaults and forbids re-scoping any consent template to another organization, mirroring the specialty scope guard.';

create table public.consent_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  body text not null,
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint consent_templates_code_bounded_check check (
    code = pg_catalog.upper(code)
    and code ~ '^[A-Z][A-Z0-9_]*$'
    and pg_catalog.length(code) <= 80
  ),
  constraint consent_templates_name_bounded_check check (
    pg_catalog.btrim(name) <> ''
    and pg_catalog.length(name) <= 200
  ),
  constraint consent_templates_body_bounded_check check (
    pg_catalog.btrim(body) <> ''
    and pg_catalog.length(body) <= 10000
  ),
  constraint consent_templates_version_positive_check check (version > 0)
);

revoke all on table public.consent_templates
from public, anon, authenticated, service_role;

alter table public.consent_templates enable row level security;

comment on table public.consent_templates is
  'Versioned consent template catalog: immutable global defaults and organization-owned custom templates; no browser policy exists.';

create unique index consent_templates_global_code_key
  on public.consent_templates (code)
  where organization_id is null;

create unique index consent_templates_organization_code_key
  on public.consent_templates (organization_id, code)
  where organization_id is not null;

create index consent_templates_organization_active_name_idx
  on public.consent_templates (organization_id, is_active, name);

create trigger consent_templates_protect_scope
before update or delete on public.consent_templates
for each row execute function private.protect_consent_template_scope();

create trigger consent_templates_set_updated_at
before update on public.consent_templates
for each row execute function private.set_updated_at();

create table public.intake_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  patient_id uuid not null,
  form_type text not null,
  consent_template_id uuid,
  template_version text not null,
  answers jsonb not null default '{}'::jsonb,
  privacy_acknowledged boolean not null default false,
  status text not null default 'PENDING',
  submitted_via text,
  submitted_at timestamptz,
  signed_by uuid references auth.users(id) on delete set null,
  signed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint intake_forms_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint intake_forms_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint intake_forms_consent_template_fk foreign key (
    consent_template_id
  ) references public.consent_templates(id) on delete restrict,
  constraint intake_forms_form_type_check check (
    form_type in ('MEDICAL_HISTORY', 'DENTAL_HISTORY', 'CONSENT')
  ),
  constraint intake_forms_consent_template_presence_check check (
    (form_type = 'CONSENT') = (consent_template_id is not null)
  ),
  constraint intake_forms_template_version_bounded_check check (
    pg_catalog.btrim(template_version) <> ''
    and pg_catalog.length(template_version) <= 16
  ),
  constraint intake_forms_answers_bounded_check check (
    jsonb_typeof(answers) = 'object'
    and pg_catalog.pg_column_size(answers) <= 16384
  ),
  constraint intake_forms_status_check check (
    status in ('PENDING', 'SUBMITTED', 'SIGNED', 'PRINTED')
  ),
  constraint intake_forms_submitted_via_check check (
    submitted_via is null or submitted_via in ('LINK', 'PAPER')
  ),
  constraint intake_forms_submitted_via_state_check check (
    submitted_via is null
    or (submitted_via = 'LINK' and submitted_at is not null)
    or (submitted_via = 'PAPER')
  ),
  constraint intake_forms_signed_state_check check (
    (signed_by is not null) = (signed_at is not null)
  ),
  constraint intake_forms_signature_status_check check (
    (status in ('SIGNED', 'PRINTED')) = (signed_at is not null)
  ),
  constraint intake_forms_version_positive_check check (version > 0),
  constraint intake_forms_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.intake_forms
from public, anon, authenticated, service_role;

alter table public.intake_forms enable row level security;

comment on table public.intake_forms is
  'Patient intake questionnaire and consent forms with a snapshot template_version, bounded answers, and signed/printed metadata; no browser policy exists.';

create index intake_forms_organization_patient_status_idx
  on public.intake_forms (organization_id, patient_id, status);

create index intake_forms_organization_branch_status_idx
  on public.intake_forms (organization_id, branch_id, status);

create trigger intake_forms_set_updated_at
before update on public.intake_forms
for each row execute function private.set_updated_at();

create table public.intake_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  intake_form_id uuid not null,
  token_hash text not null,
  status text not null default 'ACTIVE',
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint intake_links_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint intake_links_organization_form_fk foreign key (
    organization_id,
    intake_form_id
  ) references public.intake_forms(organization_id, id) on delete restrict,
  constraint intake_links_token_hash_check check (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint intake_links_token_hash_key unique (token_hash),
  constraint intake_links_status_check check (
    status in ('ACTIVE', 'EXPIRED', 'REVOKED')
  )
);

revoke all on table public.intake_links
from public, anon, authenticated, service_role;

alter table public.intake_links enable row level security;

comment on table public.intake_links is
  'Short-lived per-form link token bindings storing only the SHA-256 token hash; status transitions ACTIVE to EXPIRED/REVOKED. No browser policy exists.';

create index intake_links_organization_status_idx
  on public.intake_links (organization_id, status);

create index intake_links_organization_form_status_idx
  on public.intake_links (organization_id, intake_form_id, status);