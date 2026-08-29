-- Split polymorphic periodontal context branches so PostgreSQL never resolves a
-- field that does not exist on the triggering relation.
create or replace function private.enforce_periodontal_tooth_context()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_context public.periodontal_tooth_measurements%rowtype;
begin
  if tg_table_name = 'periodontal_tooth_measurements' then
    if not new.tooth_present
       and (
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

    if new.implant_context
       and (
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
  for key share;

  if not found then
    if tg_table_name = 'periodontal_site_measurements' then
      insert into public.periodontal_tooth_measurements (
        organization_id, examination_id, tooth_fdi, tooth_present, implant_context
      ) values (
        new.organization_id, new.examination_id, new.tooth_fdi, true, new.implant_context
      ) returning * into v_context;
    else
      insert into public.periodontal_tooth_measurements (
        organization_id, examination_id, tooth_fdi, tooth_present, implant_context
      ) values (
        new.organization_id, new.examination_id, new.tooth_fdi, true, false
      ) returning * into v_context;
    end if;
  end if;

  if not v_context.tooth_present then
    raise check_violation using message = 'missing tooth cannot have periodontal child measurements';
  end if;

  if tg_table_name = 'periodontal_site_measurements' then
    if v_context.implant_context is distinct from new.implant_context then
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
