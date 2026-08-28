-- B2 correction: the organizations seed hook referenced new.organization_id
-- but the organizations primary key column is id. Recreate the function with
-- the correct field so an organization insert fires the default-method seeding.

create or replace function private.seed_organization_default_payment_methods()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.payment_methods (organization_id, code, name)
  select new.id, default_method.code, default_method.name
  from (values
    ('CASH','Cash'),
    ('CARD','Card'),
    ('GCASH','GCash'),
    ('MAYA','Maya'),
    ('BANK_TRANSFER','Bank Transfer'),
    ('CHEQUE','Cheque'),
    ('OTHER','Other')
  ) as default_method(code, name)
  on conflict (organization_id, code) do nothing;
  return new;
end;
$$;
revoke all on function private.seed_organization_default_payment_methods() from public, anon, authenticated, service_role;