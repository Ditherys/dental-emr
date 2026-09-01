import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

/**
 * Concurrency proof for `public.complete_treatment_case`.
 *
 * Task 8 made the completion path obtain its managed clinical visit before the
 * completion request lock. The first revision also read the case patient with
 * `for key share`, ahead of the `for update` the same function takes on that row
 * moments later. Two transactions that both hold KEY SHARE and then both request
 * FOR UPDATE deadlock, so a double-submitted completion returned `40P01` where it
 * used to serialize and replay. This test pins both races:
 *
 *   1. two concurrent completions under the SAME request key - both succeed, one
 *      replaying the stored result, and exactly one charge exists;
 *   2. two concurrent completions under DISTINCT keys - one commits and the
 *      other is refused as invalid state, again with exactly one charge.
 *
 * Neither may report a deadlock. A third session holds the patient row so both
 * callers are inside the function together before either can take the request
 * lock, which is what makes the old cycle reproducible rather than incidental.
 */

function execute(command, input, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      ...options,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}

function literal(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function uuid(value) {
  return `${literal(value)}::uuid`;
}

function requireSuccess(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label}: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

function isDeadlock(result) {
  return /deadlock detected/i.test(result.stderr) || /40P01/.test(result.stderr);
}

function describe(results) {
  return results.map((result) => `${result.status}:${result.stderr.trim()}`).join(" | ");
}

function completeSql({ branch, user, procedureCase, item, key }) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',${literal(user)},true);
select * from public.complete_treatment_case(
  ${uuid(branch)},${uuid(procedureCase)},${uuid(item)},1,array[]::uuid[],125000,
  '{"code":"ROOT_CANAL","state":"endo-filling"}'::jsonb,${literal(key)}
);
commit;`;
}

/** Held by a third session so both callers enter the function together. */
function holdPatientLockSql(patient) {
  return `begin;
select id from public.patients where id=${uuid(patient)} for update;
select pg_sleep(0.5);
commit;`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runTreatmentCaseCompletionConcurrencyTest({
  command,
  repositoryRoot,
  dockerEnvironment,
}) {
  const ids = {
    organization: randomUUID(),
    branch: randomUUID(),
    user: randomUUID(),
    member: randomUUID(),
    provider: randomUUID(),
    patient: randomUUID(),
    procedure: randomUUID(),
    plan: randomUUID(),
    sameKeyItem: randomUUID(),
    sameKeyCase: randomUUID(),
    competingItem: randomUUID(),
    competingCase: randomUUID(),
  };
  const suffix = ids.organization.replaceAll("-", "").slice(0, 12);
  const options = { cwd: repositoryRoot, env: dockerEnvironment };

  const setup = `begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(${uuid(ids.user)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${literal(`completion-${suffix}@synthetic.test`)},'',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations(id,legal_name,business_name,slug)
values(${uuid(ids.organization)},'Completion Concurrency Synthetic Inc','Completion Concurrency Synthetic',${literal(`completion-concurrency-${suffix}`)});
insert into public.branches(id,organization_id,name,slug,code,address_line1,city,province)
values(${uuid(ids.branch)},${uuid(ids.organization)},'Synthetic Main',${literal(`completion-main-${suffix}`)},'COMP-C','1 Synthetic','Test City','Test Province');
insert into public.organization_members(id,organization_id,user_id,membership_status,joined_at)
values(${uuid(ids.member)},${uuid(ids.organization)},${uuid(ids.user)},'active',statement_timestamp());
insert into public.branch_memberships(organization_id,branch_id,organization_member_id,access_status)
values(${uuid(ids.organization)},${uuid(ids.branch)},${uuid(ids.member)},'active');
insert into public.member_roles(organization_id,organization_member_id,role_id,assigned_by)
select ${uuid(ids.organization)},${uuid(ids.member)},role.id,${uuid(ids.user)}
from public.roles role where role.organization_id is null and role.code='OWNER';
insert into public.providers(id,organization_id,linked_user_id,first_name,last_name,provider_type,status)
values(${uuid(ids.provider)},${uuid(ids.organization)},${uuid(ids.user)},'Synthetic','Dentist','REGULAR','active');
insert into public.provider_branches(organization_id,provider_id,branch_id,is_active)
values(${uuid(ids.organization)},${uuid(ids.provider)},${uuid(ids.branch)},true);
insert into public.patients(id,organization_id,patient_number,first_name,last_name,birth_date,preferred_branch_id)
values(${uuid(ids.patient)},${uuid(ids.organization)},${literal(`COMP-${suffix}`)},'Synthetic','Completion','1990-01-01',${uuid(ids.branch)});
insert into public.procedures(id,organization_id,code,name,status)
values(${uuid(ids.procedure)},${uuid(ids.organization)},${literal(`CP${suffix.slice(0, 6).toUpperCase()}`)},'Synthetic completion','active');
insert into public.treatment_plans(id,organization_id,patient_id,title,status,version,created_by)
values(${uuid(ids.plan)},${uuid(ids.organization)},${uuid(ids.patient)},'Synthetic completion concurrency','DRAFT',1,${uuid(ids.user)});
insert into public.treatment_plan_items(id,organization_id,plan_id,line_no,procedure_id,tooth_code,description,estimated_fee_centavos) values
 (${uuid(ids.sameKeyItem)},${uuid(ids.organization)},${uuid(ids.plan)},1,${uuid(ids.procedure)},'26','Same key completion race',125000),
 (${uuid(ids.competingItem)},${uuid(ids.organization)},${uuid(ids.plan)},2,${uuid(ids.procedure)},'27','Competing key completion race',125000);
update public.treatment_plan_item_materialization_contracts
set materialization_kind='CLINICAL',design_snapshot='{"tooth_code":"26","clinical_code":"ROOT_CANAL"}'::jsonb
where organization_id=${uuid(ids.organization)} and item_id=${uuid(ids.sameKeyItem)};
update public.treatment_plan_item_materialization_contracts
set materialization_kind='CLINICAL',design_snapshot='{"tooth_code":"27","clinical_code":"ROOT_CANAL"}'::jsonb
where organization_id=${uuid(ids.organization)} and item_id=${uuid(ids.competingItem)};
update public.treatment_plans set status='ACKNOWLEDGED',version=2 where id=${uuid(ids.plan)};
insert into public.procedure_cases(id,organization_id,patient_id,origin_branch_id,procedure_id,treatment_plan_item_id,opened_by,status,version) values
 (${uuid(ids.sameKeyCase)},${uuid(ids.organization)},${uuid(ids.patient)},${uuid(ids.branch)},${uuid(ids.procedure)},${uuid(ids.sameKeyItem)},${uuid(ids.user)},'OPEN',1),
 (${uuid(ids.competingCase)},${uuid(ids.organization)},${uuid(ids.patient)},${uuid(ids.branch)},${uuid(ids.procedure)},${uuid(ids.competingItem)},${uuid(ids.user)},'OPEN',1);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',${literal(ids.user)},true);
select public.transition_treatment_plan_item_execution(${uuid(ids.branch)},${uuid(ids.sameKeyItem)},1,'ACCEPTED',null,${literal(`accept-a-${suffix}`)});
select public.transition_treatment_plan_item_execution(${uuid(ids.branch)},${uuid(ids.sameKeyItem)},2,'IN_PROGRESS',null,${literal(`start-a-${suffix}`)});
select public.transition_treatment_plan_item_execution(${uuid(ids.branch)},${uuid(ids.competingItem)},1,'ACCEPTED',null,${literal(`accept-b-${suffix}`)});
select public.transition_treatment_plan_item_execution(${uuid(ids.branch)},${uuid(ids.competingItem)},2,'IN_PROGRESS',null,${literal(`start-b-${suffix}`)});
reset role;
commit;`;

  const cleanup = `begin;
alter table public.audit_events disable trigger user;
alter table public.tooth_clinical_entries disable trigger user;
alter table public.procedure_cases disable trigger user;
alter table public.procedure_case_events disable trigger user;
alter table public.procedure_case_finding_resolutions disable trigger user;
alter table public.tooth_clinical_entry_details disable trigger user;
alter table public.tooth_clinical_entry_surfaces disable trigger user;
alter table public.treatment_plan_item_execution_events disable trigger user;
alter table public.treatment_plan_item_executions disable trigger user;
alter table public.treatment_plan_items disable trigger user;
alter table public.treatment_plans disable trigger user;
alter table public.charges disable trigger user;
alter table public.clinical_encounters disable trigger user;
delete from private.procedure_case_completion_idempotency where organization_id=${uuid(ids.organization)};
delete from public.audit_events where organization_id=${uuid(ids.organization)};
delete from public.procedure_case_finding_resolutions where organization_id=${uuid(ids.organization)};
delete from public.procedure_case_events where organization_id=${uuid(ids.organization)};
delete from public.treatment_plan_item_executions where organization_id=${uuid(ids.organization)};
delete from public.treatment_plan_item_execution_events where organization_id=${uuid(ids.organization)};
delete from public.tooth_clinical_entry_surfaces where organization_id=${uuid(ids.organization)};
delete from public.tooth_clinical_entry_details where organization_id=${uuid(ids.organization)};
delete from public.tooth_clinical_entries where organization_id=${uuid(ids.organization)};
update public.procedure_cases set charge_id=null where organization_id=${uuid(ids.organization)};
delete from public.procedure_cases where organization_id=${uuid(ids.organization)};
delete from public.charges where organization_id=${uuid(ids.organization)};
delete from public.treatment_plan_item_materialization_contracts where organization_id=${uuid(ids.organization)};
delete from public.treatment_plan_items where organization_id=${uuid(ids.organization)};
delete from public.treatment_plans where organization_id=${uuid(ids.organization)};
delete from public.clinical_encounters where organization_id=${uuid(ids.organization)};
delete from public.procedures where organization_id=${uuid(ids.organization)};
delete from public.provider_branches where organization_id=${uuid(ids.organization)};
delete from public.providers where organization_id=${uuid(ids.organization)};
delete from public.patient_contacts where organization_id=${uuid(ids.organization)};
delete from public.patients where organization_id=${uuid(ids.organization)};
delete from public.member_roles where organization_id=${uuid(ids.organization)};
delete from public.branch_memberships where organization_id=${uuid(ids.organization)};
delete from public.organization_members where organization_id=${uuid(ids.organization)};
delete from public.payment_methods where organization_id=${uuid(ids.organization)};
delete from public.branches where organization_id=${uuid(ids.organization)};
delete from public.organizations where id=${uuid(ids.organization)};
delete from auth.users where id=${uuid(ids.user)};
alter table public.clinical_encounters enable trigger user;
alter table public.charges enable trigger user;
alter table public.treatment_plans enable trigger user;
alter table public.treatment_plan_items enable trigger user;
alter table public.treatment_plan_item_executions enable trigger user;
alter table public.treatment_plan_item_execution_events enable trigger user;
alter table public.tooth_clinical_entry_surfaces enable trigger user;
alter table public.tooth_clinical_entry_details enable trigger user;
alter table public.procedure_case_finding_resolutions enable trigger user;
alter table public.procedure_case_events enable trigger user;
alter table public.procedure_cases enable trigger user;
alter table public.tooth_clinical_entries enable trigger user;
alter table public.audit_events enable trigger user;
commit;`;

  try {
    requireSuccess(await execute(command, setup, options), "completion concurrency setup");

    const sameKey = `complete-same-${suffix}`;
    const sameKeyLocker = execute(command, holdPatientLockSql(ids.patient), options);
    await delay(100);
    const sameKeyResults = await Promise.all([
      execute(command, completeSql({ branch: ids.branch, user: ids.user, procedureCase: ids.sameKeyCase, item: ids.sameKeyItem, key: sameKey }), options),
      execute(command, completeSql({ branch: ids.branch, user: ids.user, procedureCase: ids.sameKeyCase, item: ids.sameKeyItem, key: sameKey }), options),
    ]);
    requireSuccess(await sameKeyLocker, "same-key patient lock");
    if (sameKeyResults.some(isDeadlock)) {
      throw new Error(`concurrent completions must not deadlock: ${describe(sameKeyResults)}`);
    }
    if (sameKeyResults.some((result) => result.status !== 0)) {
      throw new Error(`same request-key completions must both resolve successfully: ${describe(sameKeyResults)}`);
    }

    const sameKeyProof = await execute(command, `select case
  when (select count(*) from public.charges where organization_id=${uuid(ids.organization)} and treatment_plan_item_id=${uuid(ids.sameKeyItem)})=1
   and (select count(*) from public.tooth_clinical_entries where organization_id=${uuid(ids.organization)} and treatment_plan_item_id=${uuid(ids.sameKeyItem)})=1
   and (select count(*) from public.tooth_clinical_entries where organization_id=${uuid(ids.organization)} and treatment_plan_item_id=${uuid(ids.sameKeyItem)} and encounter_id is null)=0
   and (select status from public.procedure_cases where id=${uuid(ids.sameKeyCase)})='COMPLETED'
  then 'SAME_KEY_OK' else 'SAME_KEY_FAILED' end;`, options);
    requireSuccess(sameKeyProof, "same-key proof");
    if (!sameKeyProof.stdout.includes("SAME_KEY_OK")) {
      throw new Error("a replayed concurrent completion posted a second charge, a second entry, or left an unbound encounter");
    }

    const competingLocker = execute(command, holdPatientLockSql(ids.patient), options);
    await delay(100);
    const competingResults = await Promise.all([
      execute(command, completeSql({ branch: ids.branch, user: ids.user, procedureCase: ids.competingCase, item: ids.competingItem, key: `complete-a-${suffix}` }), options),
      execute(command, completeSql({ branch: ids.branch, user: ids.user, procedureCase: ids.competingCase, item: ids.competingItem, key: `complete-b-${suffix}` }), options),
    ]);
    requireSuccess(await competingLocker, "competing-key patient lock");
    if (competingResults.some(isDeadlock)) {
      throw new Error(`concurrent competing completions must not deadlock: ${describe(competingResults)}`);
    }
    const committed = competingResults.filter((result) => result.status === 0).length;
    const refused = competingResults.filter(
      (result) => result.status !== 0 && /ERROR:\s+(invalid state|stale version)/i.test(result.stderr),
    ).length;
    if (committed !== 1 || refused !== 1) {
      throw new Error(`distinct concurrent completions must yield one commit and one clean refusal: ${describe(competingResults)}`);
    }

    const competingProof = await execute(command, `select case
  when (select count(*) from public.charges where organization_id=${uuid(ids.organization)} and treatment_plan_item_id=${uuid(ids.competingItem)})=1
   and (select count(*) from public.tooth_clinical_entries where organization_id=${uuid(ids.organization)} and treatment_plan_item_id=${uuid(ids.competingItem)})=1
   and (select status from public.procedure_cases where id=${uuid(ids.competingCase)})='COMPLETED'
  then 'COMPETING_OK' else 'COMPETING_FAILED' end;`, options);
    requireSuccess(competingProof, "competing-key proof");
    if (!competingProof.stdout.includes("COMPETING_OK")) {
      throw new Error("concurrent competing completions posted a second charge or a second clinical entry");
    }
  } finally {
    requireSuccess(await execute(command, cleanup, options), "completion concurrency cleanup");
  }
}
