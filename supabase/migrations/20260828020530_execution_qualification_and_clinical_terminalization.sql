-- Repair PL/pgSQL OUT-parameter ambiguity and terminalize the predecessor
-- after constructing its append-only clinical successor.

do $$
declare v_def text;v_new text;v_signature regprocedure;
begin
 foreach v_signature in array array[
  'public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)'::regprocedure,
  'public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)'::regprocedure,
  'public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text)'::regprocedure
 ] loop
  select pg_get_functiondef(v_signature) into v_def;
  v_new:=replace(v_def,'item_id=p_item_id','item_id=$2');
  v_new:=replace(v_new,'item_id = p_item_id','item_id = $2');
  if v_new=v_def then raise exception 'qualification target not found for %',v_signature;end if;
  execute v_new;
 end loop;
end $$;

do $$
declare v_def text;v_new text;
begin
 select pg_get_functiondef('public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)'::regprocedure) into v_def;
 v_new:=replace(v_def,
  '  insert into public.audit_events (',
  '  update public.tooth_clinical_entries
   set lifecycle = ''SUPERSEDED'', superseded_by_entry_id = v_new,
       version = v_old.version + 1
   where organization_id = v_org and id = v_old.id;

  insert into public.audit_events (');
 if v_new=v_def then raise exception 'clinical predecessor terminalization target not found';end if;
 execute v_new;
end $$;

revoke all on function public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text) from public,anon,authenticated,service_role;
