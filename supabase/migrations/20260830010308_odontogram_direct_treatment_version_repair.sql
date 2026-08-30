-- The O5 wrapper's output column `version` shadows the unqualified case
-- column in RETURNING.  Qualify that one ledger column; all authorization and
-- idempotency logic remains byte-for-byte unchanged.
do $$
declare v_definition text; v_repaired text;
begin
 select pg_catalog.pg_get_functiondef('public.record_direct_treatment_with_charge(uuid,uuid,uuid,bigint,jsonb,text)'::regprocedure) into v_definition;
 v_repaired:=pg_catalog.replace(v_definition,'returning id,version into v_case,v_version','returning id,public.procedure_cases.version into v_case,v_version');
 if v_repaired=v_definition then raise exception 'direct treatment version repair precondition not found'; end if;
 execute v_repaired;
end $$;
