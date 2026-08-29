create constraint trigger periodontal_furcation_anatomy_check
after insert or update on public.periodontal_furcation_measurements deferrable initially immediate
for each row execute function private.validate_periodontal_cross_row();

create or replace function public.save_periodontal_measurements(
 p_acting_branch_id uuid,p_examination_id uuid,p_sites jsonb,p_plaque jsonb,p_tooth jsonb,p_furcation jsonb
) returns table(examination_id uuid,version integer,saved_sites integer,saved_plaque integer,saved_tooth integer,saved_furcation integer)
language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_exam public.periodontal_examinations%rowtype;
v_sc integer:=0;v_pc integer:=0;v_tc integer:=0;v_fc integer:=0;r jsonb;v_fdi text;v_implant boolean;v_present boolean;v_mobility text;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
 if p_examination_id is null or (p_sites is not null and jsonb_typeof(p_sites)<>'array') or (p_plaque is not null and jsonb_typeof(p_plaque)<>'array')
  or (p_tooth is not null and jsonb_typeof(p_tooth)<>'array') or (p_furcation is not null and jsonb_typeof(p_furcation)<>'array') then raise invalid_parameter_value using message='invalid input'; end if;
 v_sc:=coalesce(jsonb_array_length(p_sites),0);v_pc:=coalesce(jsonb_array_length(p_plaque),0);v_tc:=coalesce(jsonb_array_length(p_tooth),0);v_fc:=coalesce(jsonb_array_length(p_furcation),0);
 if v_sc+v_pc+v_tc+v_fc>200 then raise invalid_parameter_value using message='batch too large'; end if;
 select * into v_exam from public.periodontal_examinations where organization_id=v_org and id=p_examination_id for update;
 if not found then raise insufficient_privilege using message='not authorized'; end if;
 if v_exam.status<>'DRAFT' then raise exception using errcode='P0001',message='invalid state'; end if;

 for r in select * from jsonb_array_elements(coalesce(p_tooth,'[]')) loop
  v_fdi:=btrim(r->>'tooth_fdi');v_mobility:=nullif(btrim(r->>'mobility_miller'),'');v_implant:=coalesce((r->>'implant_context')::boolean,false);v_present:=coalesce((r->>'tooth_present')::boolean,true);
  if v_fdi is null or not v_fdi~'^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$' or (v_mobility is not null and v_mobility not in ('M0','M1','M2','M3'))
   or (v_implant and v_mobility is not null) or (not v_present and (v_implant or v_mobility is not null)) then raise invalid_parameter_value using message='invalid input'; end if;
  insert into public.periodontal_tooth_measurements(organization_id,examination_id,tooth_fdi,mobility_miller,implant_context,tooth_present)
  values(v_org,p_examination_id,v_fdi,v_mobility,v_implant,v_present)
  on conflict(examination_id,tooth_fdi) do update set mobility_miller=excluded.mobility_miller,implant_context=excluded.implant_context,tooth_present=excluded.tooth_present;
 end loop;

 for r in select * from jsonb_array_elements(coalesce(p_sites,'[]')) loop
  v_fdi:=btrim(r->>'tooth_fdi');v_implant:=coalesce((r->>'implant_context')::boolean,false);v_present:=coalesce((r->>'tooth_present')::boolean,true);
  if v_fdi is null or not v_fdi~'^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$' or btrim(r->>'site') not in ('MB','B','DB','ML','L','DL')
   or (r->>'probing_depth_mm')::integer not between 1 and 15 or coalesce((r->>'gingival_margin_mm')::integer,0) not between -10 and 20 or not v_present then raise invalid_parameter_value using message='invalid input'; end if;
  insert into public.periodontal_site_measurements(organization_id,examination_id,tooth_fdi,site,probing_depth_mm,gingival_margin_mm,bleeding_on_probing,suppuration,tooth_present,implant_context)
  values(v_org,p_examination_id,v_fdi,btrim(r->>'site'),(r->>'probing_depth_mm')::integer,coalesce((r->>'gingival_margin_mm')::integer,0),coalesce((r->>'bleeding_on_probing')::boolean,false),coalesce((r->>'suppuration')::boolean,false),true,v_implant)
  on conflict(examination_id,tooth_fdi,site) do update set probing_depth_mm=excluded.probing_depth_mm,gingival_margin_mm=excluded.gingival_margin_mm,bleeding_on_probing=excluded.bleeding_on_probing,suppuration=excluded.suppuration,implant_context=excluded.implant_context;
 end loop;

 for r in select * from jsonb_array_elements(coalesce(p_plaque,'[]')) loop
  v_fdi:=btrim(r->>'tooth_fdi');if v_fdi is null or not v_fdi~'^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$' or btrim(r->>'surface') not in ('MESIAL','DISTAL','BUCCAL','LINGUAL') then raise invalid_parameter_value using message='invalid input'; end if;
  insert into public.periodontal_plaque_measurements(organization_id,examination_id,tooth_fdi,surface,plaque_present)
  values(v_org,p_examination_id,v_fdi,btrim(r->>'surface'),coalesce((r->>'plaque_present')::boolean,false))
  on conflict(examination_id,tooth_fdi,surface) do update set plaque_present=excluded.plaque_present;
 end loop;

 for r in select * from jsonb_array_elements(coalesce(p_furcation,'[]')) loop
  v_fdi:=btrim(r->>'tooth_fdi');if v_fdi is null or not v_fdi~'^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$' or btrim(r->>'entrance') not in ('mesial','distal','buccal','lingual') or (r->>'grade')::integer not between 1 and 4 then raise invalid_parameter_value using message='invalid input'; end if;
  insert into public.periodontal_furcation_measurements(organization_id,examination_id,tooth_fdi,entrance,grade)
  values(v_org,p_examination_id,v_fdi,btrim(r->>'entrance'),(r->>'grade')::smallint)
  on conflict(examination_id,tooth_fdi,entrance) do update set grade=excluded.grade;
 end loop;
 update public.periodontal_examinations set updated_at=statement_timestamp() where organization_id=v_org and id=p_examination_id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.perio.measurements.saved','periodontal_examination',p_examination_id,v_exam.patient_id,'SUCCESS',jsonb_build_object('saved_sites',v_sc,'saved_plaque',v_pc,'saved_tooth',v_tc,'saved_furcation',v_fc));
 examination_id:=p_examination_id;version:=v_exam.version;saved_sites:=v_sc;saved_plaque:=v_pc;saved_tooth:=v_tc;saved_furcation:=v_fc;return next;
end $$;
revoke all on function public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function private.validate_bridge_unit_support()
returns trigger language plpgsql set search_path='' as $$
declare c public.dental_implant_components%rowtype;b public.dental_bridges%rowtype;
begin
 if new.support_component_id is null then return new;end if;
 select * into c from public.dental_implant_components where organization_id=new.organization_id and id=new.support_component_id for key share;
 select * into b from public.dental_bridges where organization_id=new.organization_id and id=new.bridge_id for key share;
 if c.patient_id is distinct from b.patient_id or c.tooth_fdi is distinct from new.tooth_fdi or c.component_kind<>'ABUTMENT'
  or (b.record_kind='CURRENT' and (c.record_kind<>'CURRENT' or c.sealed_at is null or c.voided_at is not null))
  or (b.record_kind='PLAN_DESIGN' and c.record_kind='PLAN_DESIGN' and c.parent_plan_id is distinct from b.parent_plan_id) then raise check_violation using message='bridge implant support must be compatible and share the plan when planned';end if;
 return new;
end $$;
revoke all on function private.validate_bridge_unit_support() from public,anon,authenticated,service_role;
