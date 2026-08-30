-- O12 forward-only hardening: an archived clinical photograph is immutable.
-- Processing workers can race an archive request, so every lifecycle transition
-- rejects an archived row after taking the row lock. The guards are installed
-- by replacing the reviewed function bodies and are idempotent on re-apply.

do $claim_guard$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.claim_clinical_photo_processing(uuid,uuid)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode='55000', message='expected photo claim RPC is missing';
  end if;
  if v_definition like '%v_photo.archived_at is not null%' then
    return;
  end if;
  v_replacement := pg_catalog.replace(
    v_definition,
    $$  if not found then
    raise insufficient_privilege using message='not authorized';
  end if;

  if v_photo.processing_status in$$,
    $$  if not found then
    raise insufficient_privilege using message='not authorized';
  end if;
  if v_photo.archived_at is not null then
    raise exception using errcode='P0001', message='invalid state';
  end if;

  if v_photo.processing_status in$$
  );
  if v_replacement = v_definition then
    raise exception using errcode='55000', message='claim archive guard anchor is missing';
  end if;
  execute v_replacement;
end;
$claim_guard$;

do $fail_guard$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.fail_clinical_photo_processing(uuid,uuid)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode='55000', message='expected photo failure RPC is missing';
  end if;
  if v_definition like '%v_photo.archived_at is not null%' then
    return;
  end if;
  v_replacement := pg_catalog.replace(
    v_definition,
    $$  if not found then
    raise insufficient_privilege using message='not authorized';
  end if;
  if v_photo.processing_status='READY' then$$,
    $$  if not found then
    raise insufficient_privilege using message='not authorized';
  end if;
  if v_photo.archived_at is not null then
    raise exception using errcode='P0001', message='invalid state';
  end if;
  if v_photo.processing_status='READY' then$$
  );
  if v_replacement = v_definition then
    raise exception using errcode='55000', message='failure archive guard anchor is missing';
  end if;
  execute v_replacement;
end;
$fail_guard$;

do $complete_guard$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.complete_clinical_photo_derivatives(uuid,uuid,uuid,text,bigint,jsonb)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode='55000', message='expected photo completion RPC is missing';
  end if;
  if v_definition like '%v_photo.archived_at is not null%' then
    return;
  end if;
  v_replacement := pg_catalog.replace(
    v_definition,
    $$  if not found then raise insufficient_privilege using message='not authorized'; end if;
  if v_photo.processing_status='READY' then return true; end if;$$,
    $$  if not found then raise insufficient_privilege using message='not authorized'; end if;
  if v_photo.archived_at is not null then
    raise exception using errcode='P0001', message='invalid state';
  end if;
  if v_photo.processing_status='READY' then return true; end if;$$
  );
  if v_replacement = v_definition then
    raise exception using errcode='55000', message='completion archive guard anchor is missing';
  end if;
  execute v_replacement;
end;
$complete_guard$;

-- Defense in depth for any future lifecycle writer: once archived, the row
-- cannot be changed by a direct table writer or a racing worker.
create or replace function private.prevent_archived_clinical_photo_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is not null then
    raise exception using errcode='P0001', message='invalid state';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_archived_clinical_photo_update()
from public, anon, authenticated, service_role;

do $trigger$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.clinical_photographs'::regclass
      and tgname = 'clinical_photographs_archived_immutable'
      and not tgisinternal
  ) then
    create trigger clinical_photographs_archived_immutable
    before update on public.clinical_photographs
    for each row execute function private.prevent_archived_clinical_photo_update();
  end if;
end;
$trigger$;
