-- Forward-only repair: distinguish trigger-inferred tooth context from an
-- explicit canonical row, and merge a later compatible explicit INSERT.
alter table public.periodontal_tooth_measurements
  add column context_inferred boolean not null default false;

create index periodontal_tooth_measurements_inferred_context_idx
  on public.periodontal_tooth_measurements (
    organization_id, examination_id, tooth_fdi
  ) where context_inferred;

create or replace function private.enforce_periodontal_tooth_context()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_context public.periodontal_tooth_measurements%rowtype;
begin
  if tg_table_name = 'periodontal_tooth_measurements' then
    if tg_op = 'INSERT' then
      select tooth.* into v_context
      from public.periodontal_tooth_measurements as tooth
      where tooth.organization_id = new.organization_id
        and tooth.examination_id = new.examination_id
        and tooth.tooth_fdi = new.tooth_fdi
      for update;

      if found and v_context.context_inferred then
        if not new.tooth_present and (
          exists (
            select 1 from public.periodontal_site_measurements
            where organization_id = new.organization_id
              and examination_id = new.examination_id
              and tooth_fdi = new.tooth_fdi
          )
          or exists (
            select 1 from public.periodontal_plaque_measurements
            where organization_id = new.organization_id
              and examination_id = new.examination_id
              and tooth_fdi = new.tooth_fdi
          )
          or exists (
            select 1 from public.periodontal_furcation_measurements
            where organization_id = new.organization_id
              and examination_id = new.examination_id
              and tooth_fdi = new.tooth_fdi
          )
        ) then
          raise check_violation using message = 'missing tooth cannot have periodontal child measurements';
        end if;

        if new.implant_context and (
          new.mobility_miller is not null
          or exists (
            select 1 from public.periodontal_furcation_measurements
            where organization_id = new.organization_id
              and examination_id = new.examination_id
              and tooth_fdi = new.tooth_fdi
          )
        ) then
          raise check_violation using message = 'implant tooth cannot have mobility or furcation';
        end if;

        if exists (
          select 1 from public.periodontal_site_measurements
          where organization_id = new.organization_id
            and examination_id = new.examination_id
            and tooth_fdi = new.tooth_fdi
            and implant_context is distinct from new.implant_context
        ) then
          raise check_violation using message = 'site/tooth implant context mismatch';
        end if;

        update public.periodontal_tooth_measurements
        set tooth_present = new.tooth_present,
            mobility_miller = new.mobility_miller,
            implant_context = new.implant_context,
            context_inferred = false
        where organization_id = new.organization_id
          and examination_id = new.examination_id
          and tooth_fdi = new.tooth_fdi;

        return null;
      end if;
    end if;

    if not new.tooth_present and (
      exists (
        select 1 from public.periodontal_site_measurements
        where organization_id = new.organization_id
          and examination_id = new.examination_id
          and tooth_fdi = new.tooth_fdi
      )
      or exists (
        select 1 from public.periodontal_plaque_measurements
        where organization_id = new.organization_id
          and examination_id = new.examination_id
          and tooth_fdi = new.tooth_fdi
      )
      or exists (
        select 1 from public.periodontal_furcation_measurements
        where organization_id = new.organization_id
          and examination_id = new.examination_id
          and tooth_fdi = new.tooth_fdi
      )
    ) then
      raise check_violation using message = 'missing tooth cannot have periodontal child measurements';
    end if;

    if new.implant_context and (
      new.mobility_miller is not null
      or exists (
        select 1 from public.periodontal_furcation_measurements
        where organization_id = new.organization_id
          and examination_id = new.examination_id
          and tooth_fdi = new.tooth_fdi
      )
    ) then
      raise check_violation using message = 'implant tooth cannot have mobility or furcation';
    end if;

    if exists (
      select 1 from public.periodontal_site_measurements
      where organization_id = new.organization_id
        and examination_id = new.examination_id
        and tooth_fdi = new.tooth_fdi
        and implant_context is distinct from new.implant_context
    ) then
      raise check_violation using message = 'site/tooth implant context mismatch';
    end if;

    return new;
  end if;

  select tooth.* into v_context
  from public.periodontal_tooth_measurements as tooth
  where tooth.organization_id = new.organization_id
    and tooth.examination_id = new.examination_id
    and tooth.tooth_fdi = new.tooth_fdi
  for update;

  if not found then
    if tg_table_name = 'periodontal_site_measurements' then
      insert into public.periodontal_tooth_measurements (
        organization_id, examination_id, tooth_fdi, tooth_present,
        implant_context, context_inferred
      ) values (
        new.organization_id, new.examination_id, new.tooth_fdi, true,
        new.implant_context, true
      ) returning * into v_context;
    else
      insert into public.periodontal_tooth_measurements (
        organization_id, examination_id, tooth_fdi, tooth_present,
        implant_context, context_inferred
      ) values (
        new.organization_id, new.examination_id, new.tooth_fdi, true,
        false, true
      ) returning * into v_context;
    end if;
  elsif v_context.context_inferred then
    if tg_table_name = 'periodontal_site_measurements' then
      if new.implant_context and exists (
        select 1 from public.periodontal_furcation_measurements
        where organization_id = new.organization_id
          and examination_id = new.examination_id
          and tooth_fdi = new.tooth_fdi
      ) then
        raise check_violation using message = 'implant tooth cannot have furcation';
      end if;
      if exists (
        select 1 from public.periodontal_site_measurements
        where organization_id = new.organization_id
          and examination_id = new.examination_id
          and tooth_fdi = new.tooth_fdi
          and implant_context is distinct from new.implant_context
      ) then
        raise check_violation using message = 'site/tooth implant context mismatch';
      end if;
      update public.periodontal_tooth_measurements
      set implant_context = new.implant_context
      where organization_id = new.organization_id
        and examination_id = new.examination_id
        and tooth_fdi = new.tooth_fdi;
      v_context.implant_context := new.implant_context;
    elsif tg_table_name = 'periodontal_furcation_measurements' then
      if exists (
        select 1 from public.periodontal_site_measurements
        where organization_id = new.organization_id
          and examination_id = new.examination_id
          and tooth_fdi = new.tooth_fdi
          and implant_context
      ) then
        raise check_violation using message = 'implant tooth cannot have furcation';
      end if;
    end if;
  end if;

  if not v_context.tooth_present then
    raise check_violation using message = 'missing tooth cannot have periodontal child measurements';
  end if;

  if tg_table_name = 'periodontal_site_measurements' then
    if not v_context.context_inferred
       and v_context.implant_context is distinct from new.implant_context then
      raise check_violation using message = 'site/tooth implant context mismatch';
    end if;
  elsif tg_table_name = 'periodontal_furcation_measurements' then
    if v_context.implant_context then
      raise check_violation using message = 'implant tooth cannot have furcation';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_periodontal_tooth_context()
from public, anon, authenticated, service_role;
