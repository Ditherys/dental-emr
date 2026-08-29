import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

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

function transitionSql({ branch, user, item, key }) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',${literal(user)},true);
select * from public.transition_treatment_plan_item_execution(
  ${uuid(branch)},${uuid(item)},1,'ACCEPTED',null,${literal(key)}
);
commit;`;
}

function holdPlanLockSql(plan) {
  return `begin;
select id from public.treatment_plans where id=${uuid(plan)} for update;
select pg_sleep(0.5);
commit;`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runTreatmentItemExecutionConcurrencyTest({
  command,
  repositoryRoot,
  dockerEnvironment,
}) {
  const ids = {
    organization: randomUUID(),
    branch: randomUUID(),
    user: randomUUID(),
    member: randomUUID(),
    patient: randomUUID(),
    procedure: randomUUID(),
    plan: randomUUID(),
    sameKeyItem: randomUUID(),
    competingItem: randomUUID(),
  };
  const suffix = ids.organization.replaceAll("-", "").slice(0, 12);
  const options = { cwd: repositoryRoot, env: dockerEnvironment };

  const setup = `begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(${uuid(ids.user)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${literal(`execution-${suffix}@synthetic.test`)},'',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations(id,legal_name,business_name,slug)
values(${uuid(ids.organization)},'Execution Concurrency Synthetic Inc','Execution Concurrency Synthetic',${literal(`execution-concurrency-${suffix}`)});
insert into public.branches(id,organization_id,name,slug,code,address_line1,city,province)
values(${uuid(ids.branch)},${uuid(ids.organization)},'Synthetic Main',${literal(`execution-main-${suffix}`)},'EXEC-C','1 Synthetic','Test City','Test Province');
insert into public.organization_members(id,organization_id,user_id,membership_status,joined_at)
values(${uuid(ids.member)},${uuid(ids.organization)},${uuid(ids.user)},'active',statement_timestamp());
insert into public.branch_memberships(organization_id,branch_id,organization_member_id,access_status)
values(${uuid(ids.organization)},${uuid(ids.branch)},${uuid(ids.member)},'active');
insert into public.member_roles(organization_id,organization_member_id,role_id,assigned_by)
select ${uuid(ids.organization)},${uuid(ids.member)},role.id,${uuid(ids.user)}
from public.roles role where role.organization_id is null and role.code='OWNER';
insert into public.patients(id,organization_id,patient_number,first_name,last_name,birth_date,preferred_branch_id)
values(${uuid(ids.patient)},${uuid(ids.organization)},${literal(`EXEC-${suffix}`)},'Synthetic','Concurrency','1990-01-01',${uuid(ids.branch)});
insert into public.procedures(id,organization_id,code,name,status)
values(${uuid(ids.procedure)},${uuid(ids.organization)},${literal(`EX${suffix.slice(0, 6).toUpperCase()}`)},'Synthetic execution','active');
insert into public.treatment_plans(id,organization_id,patient_id,title,status,version,created_by)
values(${uuid(ids.plan)},${uuid(ids.organization)},${uuid(ids.patient)},'Synthetic execution concurrency','DRAFT',1,${uuid(ids.user)});
insert into public.treatment_plan_items(id,organization_id,plan_id,line_no,procedure_id,tooth_code,description,estimated_fee_centavos) values
 (${uuid(ids.sameKeyItem)},${uuid(ids.organization)},${uuid(ids.plan)},1,${uuid(ids.procedure)},'11','Same idempotency race',10000),
 (${uuid(ids.competingItem)},${uuid(ids.organization)},${uuid(ids.plan)},2,${uuid(ids.procedure)},'12','Competing version race',10000);
update public.treatment_plans set status='ACKNOWLEDGED',version=2 where id=${uuid(ids.plan)};
commit;`;

  const cleanup = `begin;
alter table public.audit_events disable trigger user;
alter table public.treatment_plan_item_execution_events disable trigger user;
alter table public.treatment_plan_item_executions disable trigger user;
alter table public.treatment_plan_items disable trigger user;
alter table public.treatment_plans disable trigger user;
delete from public.audit_events where organization_id=${uuid(ids.organization)};
delete from public.treatment_plan_item_executions where organization_id=${uuid(ids.organization)};
delete from public.treatment_plan_item_execution_events where organization_id=${uuid(ids.organization)};
delete from public.treatment_plan_item_materialization_contracts where organization_id=${uuid(ids.organization)};
delete from public.treatment_plan_items where organization_id=${uuid(ids.organization)};
delete from public.treatment_plans where organization_id=${uuid(ids.organization)};
delete from public.procedures where organization_id=${uuid(ids.organization)};
delete from public.patient_contacts where organization_id=${uuid(ids.organization)};
delete from public.patients where organization_id=${uuid(ids.organization)};
delete from public.member_roles where organization_id=${uuid(ids.organization)};
delete from public.branch_memberships where organization_id=${uuid(ids.organization)};
delete from public.organization_members where organization_id=${uuid(ids.organization)};
delete from public.payment_methods where organization_id=${uuid(ids.organization)};
delete from public.branches where organization_id=${uuid(ids.organization)};
delete from public.organizations where id=${uuid(ids.organization)};
delete from auth.users where id=${uuid(ids.user)};
alter table public.treatment_plan_items enable trigger user;
alter table public.treatment_plans enable trigger user;
alter table public.treatment_plan_item_executions enable trigger user;
alter table public.treatment_plan_item_execution_events enable trigger user;
alter table public.audit_events enable trigger user;
commit;`;

  try {
    requireSuccess(await execute(command, setup, options), "execution concurrency setup");

    const sameKey = `same-${suffix}`;
    const sameKeyLocker = execute(command, holdPlanLockSql(ids.plan), options);
    await delay(100);
    const sameKeyResults = await Promise.all([
      execute(command, transitionSql({ branch: ids.branch, user: ids.user, item: ids.sameKeyItem, key: sameKey }), options),
      execute(command, transitionSql({ branch: ids.branch, user: ids.user, item: ids.sameKeyItem, key: sameKey }), options),
    ]);
    requireSuccess(await sameKeyLocker, "same-key plan lock");
    if (sameKeyResults.some((result) => result.status !== 0)) {
      throw new Error(`same idempotency-key requests must both resolve successfully: ${sameKeyResults.map((result) => `${result.status}:${result.stderr.trim()}`).join(" | ")}`);
    }

    const sameKeyProof = await execute(command, `select case when e.current_state='ACCEPTED' and e.version=2 and count(v.*)=2 then 'SAME_KEY_OK' else 'SAME_KEY_FAILED' end
from public.treatment_plan_item_executions e
join public.treatment_plan_item_execution_events v on v.organization_id=e.organization_id and v.item_id=e.item_id
where e.organization_id=${uuid(ids.organization)} and e.item_id=${uuid(ids.sameKeyItem)}
group by e.current_state,e.version;`, options);
    requireSuccess(sameKeyProof, "same-key proof");
    if (!sameKeyProof.stdout.includes("SAME_KEY_OK")) {
      throw new Error("concurrent duplicate idempotency created extra history or wrong projection");
    }

    const competingLocker = execute(command, holdPlanLockSql(ids.plan), options);
    await delay(100);
    const competingResults = await Promise.all([
      execute(command, transitionSql({ branch: ids.branch, user: ids.user, item: ids.competingItem, key: `a-${suffix}` }), options),
      execute(command, transitionSql({ branch: ids.branch, user: ids.user, item: ids.competingItem, key: `b-${suffix}` }), options),
    ]);
    requireSuccess(await competingLocker, "competing-key plan lock");
    const committed = competingResults.filter((result) => result.status === 0).length;
    const stale = competingResults.filter((result) => result.status !== 0 && /ERROR:\s+stale version/i.test(result.stderr)).length;
    if (committed !== 1 || stale !== 1) {
      throw new Error(`distinct concurrent transitions must yield one commit and one stale denial: ${competingResults.map((result) => `${result.status}:${result.stderr.trim()}`).join(" | ")}`);
    }

    const competingProof = await execute(command, `select case when e.current_state='ACCEPTED' and e.version=2 and count(v.*)=2 then 'COMPETING_OK' else 'COMPETING_FAILED' end
from public.treatment_plan_item_executions e
join public.treatment_plan_item_execution_events v on v.organization_id=e.organization_id and v.item_id=e.item_id
where e.organization_id=${uuid(ids.organization)} and e.item_id=${uuid(ids.competingItem)}
group by e.current_state,e.version;`, options);
    requireSuccess(competingProof, "competing-key proof");
    if (!competingProof.stdout.includes("COMPETING_OK")) {
      throw new Error("concurrent competing transitions left extra history or a mismatched projection");
    }
  } finally {
    requireSuccess(await execute(command, cleanup, options), "execution concurrency cleanup");
  }
}
