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

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function uuid(value) {
  return `${sqlLiteral(value)}::uuid`;
}

function requireSuccess(result, operation) {
  if (result.status !== 0) {
    throw new Error(`${operation} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

function createScheduleSql({ branchId, userId, procedureCaseId, idempotencyKey }) {
  return `\\pset tuples_only on
\\pset format unaligned
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',${sqlLiteral(userId)},true);
select 'SCHEDULE_ID=' || (public.create_procedure_installment_schedule(
  ${uuid(branchId)}, ${uuid(procedureCaseId)},
  '[{"dueDate":"2030-01-15","expectedCentavos":"125000"}]'::jsonb,
  ${sqlLiteral(idempotencyKey)}
)->>'schedule_id');
commit;`;
}

function extractScheduleId(result) {
  return result.stdout.match(/SCHEDULE_ID=([0-9a-f]{8}-[0-9a-f-]{27})/i)?.[1] ?? null;
}

export async function runProcedureInstallmentSchedulesConcurrencyTest({
  command,
  repositoryRoot,
  dockerEnvironment,
}) {
  const ids = {
    organization: randomUUID(),
    branchA: randomUUID(),
    branchB: randomUUID(),
    user: randomUUID(),
    member: randomUUID(),
    patient: randomUUID(),
    procedure: randomUUID(),
    procedureCase: randomUUID(),
  };
  const suffix = ids.organization.replaceAll("-", "").slice(0, 12);
  const key = `schedule-race-${suffix}`;
  const options = { cwd: repositoryRoot, env: dockerEnvironment };

  const setup = `begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(${uuid(ids.user)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${sqlLiteral(`schedule-race-${suffix}@synthetic.test`)},'',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations(id,legal_name,business_name,slug)
values(${uuid(ids.organization)},'Schedule Race Synthetic Inc','Schedule Race Synthetic',${sqlLiteral(`schedule-race-${suffix}`)});
insert into public.branches(id,organization_id,name,slug,code,address_line1,city,province)
values
 (${uuid(ids.branchA)},${uuid(ids.organization)},'Schedule Race A',${sqlLiteral(`schedule-race-a-${suffix}`)},'SCH-R-A','1 Synthetic','Test City','Test Province'),
 (${uuid(ids.branchB)},${uuid(ids.organization)},'Schedule Race B',${sqlLiteral(`schedule-race-b-${suffix}`)},'SCH-R-B','2 Synthetic','Test City','Test Province');
insert into public.organization_members(id,organization_id,user_id,membership_status,joined_at)
values(${uuid(ids.member)},${uuid(ids.organization)},${uuid(ids.user)},'active',statement_timestamp());
insert into public.member_roles(organization_id,organization_member_id,role_id,assigned_by)
select ${uuid(ids.organization)},${uuid(ids.member)},role.id,${uuid(ids.user)}
from public.roles as role where role.organization_id is null and role.code='OWNER';
insert into public.patients(id,organization_id,patient_number,first_name,last_name,birth_date,preferred_branch_id)
values(${uuid(ids.patient)},${uuid(ids.organization)},${sqlLiteral(`SCH-R-${suffix}`)},'Synthetic','Schedule Race',date '1990-01-01',${uuid(ids.branchA)});
insert into public.procedures(id,organization_id,code,name,status)
values(${uuid(ids.procedure)},${uuid(ids.organization)},${sqlLiteral(`SCHR${suffix.slice(0, 8).toUpperCase()}`)},'Synthetic schedule race','active');
insert into public.procedure_cases(id,organization_id,patient_id,origin_branch_id,procedure_id,opened_by)
values(${uuid(ids.procedureCase)},${uuid(ids.organization)},${uuid(ids.patient)},${uuid(ids.branchA)},${uuid(ids.procedure)},${uuid(ids.user)});
commit;`;

  const cleanup = `begin;
alter table public.audit_events disable trigger audit_events_prevent_mutation;
delete from public.audit_events where organization_id=${uuid(ids.organization)};
delete from public.procedure_installment_schedule_operations where organization_id=${uuid(ids.organization)};
delete from public.procedure_installment_schedule_events where organization_id=${uuid(ids.organization)};
delete from public.procedure_installment_schedule_items where organization_id=${uuid(ids.organization)};
delete from public.procedure_installment_schedules where organization_id=${uuid(ids.organization)};
delete from public.procedure_case_events where organization_id=${uuid(ids.organization)};
delete from public.procedure_cases where organization_id=${uuid(ids.organization)};
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
alter table public.audit_events enable trigger audit_events_prevent_mutation;
commit;`;

  try {
    requireSuccess(await execute(command, setup, options), "schedule concurrency setup");

    const results = await Promise.all([
      execute(command, createScheduleSql({
        branchId: ids.branchA,
        userId: ids.user,
        procedureCaseId: ids.procedureCase,
        idempotencyKey: key,
      }), options),
      execute(command, createScheduleSql({
        branchId: ids.branchB,
        userId: ids.user,
        procedureCaseId: ids.procedureCase,
        idempotencyKey: key,
      }), options),
    ]);
    const committed = results.filter((result) => result.status === 0);
    const conflicts = results.filter((result) =>
      result.status !== 0 && /ERROR:\s+idempotency key conflicts with a different request/i.test(result.stderr),
    );
    if (committed.length !== 1 || conflicts.length !== 1) {
      throw new Error(`branch-specific same-key requests must yield one canonical commit and one idempotency conflict: ${results.map((result) => `${result.status}:${result.stderr.trim()}`).join(" | ")}`);
    }

    const returnedId = extractScheduleId(committed[0]);
    if (!returnedId) {
      throw new Error("the committed schedule request did not return a canonical schedule id");
    }

    const proof = await execute(
      command,
      `\\pset tuples_only on
\\pset format unaligned
select 'SCHEDULE_COUNT=' || count(*) from public.procedure_installment_schedules where organization_id=${uuid(ids.organization)} and procedure_case_id=${uuid(ids.procedureCase)};`,
      options,
    );
    requireSuccess(proof, "schedule concurrency proof");
    if (!proof.stdout.includes("SCHEDULE_COUNT=1")) {
      throw new Error("branch-specific same-key schedule requests created more than one schedule for the procedure case");
    }
  } finally {
    requireSuccess(await execute(command, cleanup, options), "schedule concurrency cleanup");
  }
}
