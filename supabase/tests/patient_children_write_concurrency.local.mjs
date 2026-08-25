import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

function execute(command, input, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject); child.on("close", (status) => resolve({ status, stdout, stderr })); child.stdin.end(input);
  });
}

const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const assertSuccess = (result, operation) => { if (result.status !== 0) throw new Error(`${operation} failed: ${result.stderr.trim() || result.stdout.trim()}`); };

export async function runPatientChildrenWriteConcurrencyTest({ command, repositoryRoot, dockerEnvironment }) {
  const ids = { organization: randomUUID(), branch: randomUUID(), firstUser: randomUUID(), secondUser: randomUUID(), firstPatient: randomUUID(), secondPatient: randomUUID(), firstContact: randomUUID(), secondContact: randomUUID() };
  const suffix = ids.organization.replaceAll("-", "").slice(0, 12); const options = { cwd: repositoryRoot, env: dockerEnvironment };
  const setup = `begin;
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values (${literal(ids.firstUser)}::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${literal(`a-${suffix}@p207.example.test`)},'',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),(${literal(ids.secondUser)}::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${literal(`b-${suffix}@p207.example.test`)},'',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id,legal_name,business_name,slug) values (${literal(ids.organization)}::uuid,'P207 Race Inc.','P207 Race',${literal(`p207-race-${suffix}`)});
insert into public.branches (id,organization_id,name,slug,code,address_line1,city,province) values (${literal(ids.branch)}::uuid,${literal(ids.organization)}::uuid,'P207 Race',${literal(`p207-race-b-${suffix}`)},'P207-R','1 Test','Test','Test');
insert into public.organization_members (organization_id,user_id,membership_status,joined_at) values (${literal(ids.organization)}::uuid,${literal(ids.firstUser)}::uuid,'active',statement_timestamp()),(${literal(ids.organization)}::uuid,${literal(ids.secondUser)}::uuid,'active',statement_timestamp());
insert into public.member_roles (organization_id,organization_member_id,role_id,assigned_by) select m.organization_id,m.id,r.id,m.user_id from public.organization_members m join public.roles r on r.organization_id is null and r.code='DENTIST' where m.organization_id=${literal(ids.organization)}::uuid;
insert into public.patients (id,organization_id,patient_number,first_name,last_name,birth_date) values (${literal(ids.firstPatient)}::uuid,${literal(ids.organization)}::uuid,'P-000001','First','Patient',date '1990-01-01'),(${literal(ids.secondPatient)}::uuid,${literal(ids.organization)}::uuid,'P-000002','Second','Patient',date '1991-01-01');
insert into public.patient_contacts (id,organization_id,patient_id,contact_type,value,is_primary) values (${literal(ids.firstContact)}::uuid,${literal(ids.organization)}::uuid,${literal(ids.firstPatient)}::uuid,'MOBILE','09171234567',true),(${literal(ids.secondContact)}::uuid,${literal(ids.organization)}::uuid,${literal(ids.secondPatient)}::uuid,'MOBILE','09181234567',true); commit;`;
  const update = ({ userId, patientId, contactId }) => `begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub',${literal(userId)},true); select * from public.update_patient_contact(${literal(ids.branch)}::uuid,${literal(contactId)}::uuid,${literal(patientId)}::uuid,1,'MOBILE',null,'09191234567',true,false); commit;`;
  const cleanup = `begin; alter table public.audit_events disable trigger audit_events_prevent_mutation; delete from public.audit_events where organization_id=${literal(ids.organization)}::uuid; alter table public.audit_events enable trigger audit_events_prevent_mutation; delete from public.patient_contacts where organization_id=${literal(ids.organization)}::uuid; delete from public.patients where organization_id=${literal(ids.organization)}::uuid; delete from public.member_roles where organization_id=${literal(ids.organization)}::uuid; delete from public.organization_members where organization_id=${literal(ids.organization)}::uuid; delete from public.branches where organization_id=${literal(ids.organization)}::uuid; delete from public.organizations where id=${literal(ids.organization)}::uuid; delete from auth.users where id in (${literal(ids.firstUser)}::uuid,${literal(ids.secondUser)}::uuid); commit;`;
  try {
    assertSuccess(await execute(command, setup, options), "P2-07 concurrency fixture setup");
    const results = await Promise.all([execute(command, update({ userId: ids.firstUser, patientId: ids.firstPatient, contactId: ids.firstContact }), options), execute(command, update({ userId: ids.secondUser, patientId: ids.secondPatient, contactId: ids.secondContact }), options)]);
    const outcomes = results.map((result) => result.status === 0 ? "COMMITTED" : /duplicate review required/i.test(result.stderr) ? "DUPLICATE_REVIEW_REQUIRED" : "FAILED").sort().join(",");
    if (outcomes !== "COMMITTED,DUPLICATE_REVIEW_REQUIRED") throw new Error(`Concurrent contact updates produced ${outcomes}.`);
  } finally { assertSuccess(await execute(command, cleanup, options), "P2-07 concurrency fixture cleanup"); }
}
