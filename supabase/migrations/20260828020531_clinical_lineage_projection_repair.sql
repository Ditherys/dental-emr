-- Preserve predecessor bytes. Terminality is derived from successor-side
-- lineage; the append-only history trigger remains fail-closed.

do $$
declare v_def text;v_new text;
begin
 select pg_get_functiondef('public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)'::regprocedure) into v_def;
 v_new:=replace(v_def,
  '  update public.tooth_clinical_entries
   set lifecycle = ''SUPERSEDED'', superseded_by_entry_id = v_new,
       version = v_old.version + 1
   where organization_id = v_org and id = v_old.id;

', '');
 if v_new=v_def then raise exception 'clinical predecessor mutation removal target not found';end if;
 execute v_new;
end $$;

do $$
declare v_def text;v_new text;
begin
 select pg_get_functiondef('public.get_patient_odontogram(uuid,uuid)'::regprocedure) into v_def;
 v_new:=replace(v_def,
  '''id'',e.id,''patient_id'',e.patient_id',
  '''id'',e.id,''event_state'',case when e.voided_at is not null then ''VOIDED'' when exists(select 1 from public.tooth_clinical_entries successor where successor.organization_id=e.organization_id and successor.supersedes_entry_id=e.id) then ''SUPERSEDED'' else ''CURRENT'' end,''patient_id'',e.patient_id');
 if v_new=v_def then raise exception 'clinical event-state DTO target not found';end if;
 execute v_new;
end $$;

revoke all on function public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text) from public,anon,authenticated,service_role;
revoke all on function public.get_patient_odontogram(uuid,uuid) from public,anon,authenticated,service_role;
