-- O12 forward-only repair: derivative metadata must stay within the fixed
-- variant envelopes; callers cannot claim arbitrary dimensions or sizes.
do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_clinical_photo_derivatives(uuid,uuid,text,bigint,jsonb)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode='55000', message='expected derivative RPC is missing';
  end if;
  if v_definition like '%r->>''variant''=''thumbnail''%' then
    return;
  end if;
  if v_definition not like '%r->>''checksum_sha256'' !~ ''^[0-9a-f]{64}$''%' then
    raise exception using errcode='55000', message='unexpected derivative bounds guard';
  end if;
  v_replacement := pg_catalog.replace(
    v_definition,
    $old$r->>'checksum_sha256' !~ '^[0-9a-f]{64}$'$old$,
    $new$r->>'checksum_sha256' !~ '^[0-9a-f]{64}$'
     or coalesce((r->>'size_bytes')::bigint,0)>26214400
     or (r->>'variant'='thumbnail' and (coalesce((r->>'width')::integer,0)>320 or coalesce((r->>'height')::integer,0)>240))
     or (r->>'variant'='preview' and (coalesce((r->>'width')::integer,0)>1280 or coalesce((r->>'height')::integer,0)>960))
     or (r->>'variant'='display' and (coalesce((r->>'width')::integer,0)>2048 or coalesce((r->>'height')::integer,0)>1536))$new$
  );
  if v_replacement = v_definition then
    raise exception using errcode='55000', message='derivative bounds guard anchor is missing';
  end if;
  execute v_replacement;
end;
$do$;
