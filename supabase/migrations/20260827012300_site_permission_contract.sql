-- P12-01: site permission vocabulary and the public_site_settings table.
-- Mirrors the P6-01 contract pattern. Grants no functions.

insert into public.permissions (code, description)
values (
  'site.manage',
  'Manage the organization public website content and settings.'
)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN')
  and permission.code = 'site.manage'
on conflict do nothing;

create table public.public_site_settings (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  hero_heading text,
  hero_subtext text,
  about_text text,
  contact_phone text,
  contact_email text,
  address_override text,
  operating_hours jsonb not null default '{}'::jsonb,
  privacy_notice text,
  messenger_link text,
  booking_link text,
  social_links jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint public_site_settings_bounded_texts_check check (
    (hero_heading is null or pg_catalog.length(hero_heading) <= 200)
    and (hero_subtext is null or pg_catalog.length(hero_subtext) <= 500)
    and (about_text is null or pg_catalog.length(about_text) <= 5000)
    and (contact_phone is null or pg_catalog.length(contact_phone) <= 40)
    and (contact_email is null or pg_catalog.length(contact_email) <= 320)
    and (address_override is null or pg_catalog.length(address_override) <= 500)
    and (privacy_notice is null or pg_catalog.length(privacy_notice) <= 10000)
    and (messenger_link is null or pg_catalog.length(messenger_link) <= 500)
    and (booking_link is null or pg_catalog.length(booking_link) <= 500)
  ),
  constraint public_site_settings_operating_hours_object_check check (
    jsonb_typeof(operating_hours) = 'object'
    and pg_column_size(operating_hours) <= 2048
  ),
  constraint public_site_settings_social_links_object_check check (
    jsonb_typeof(social_links) = 'object'
    and pg_column_size(social_links) <= 2048
  ),
  constraint public_site_settings_version_positive_check check (version > 0)
);

revoke all on table public.public_site_settings
from public, anon, authenticated, service_role;

alter table public.public_site_settings enable row level security;