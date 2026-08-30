import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

function execute(command, input, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { ...options, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject); child.on("close", (status) => resolve({ status, stdout, stderr })); child.stdin.end(input);
  });
}
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const uuid = (value) => `${literal(value)}::uuid`;
function requireSuccess(result, label) { if (result.status !== 0) throw new Error(`${label}: ${result.stderr.trim() || result.stdout.trim()}`); }
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runOdontogramImplantIdempotencyConcurrencyTest({ command, repositoryRoot, dockerEnvironment }) {
  const ids = Object.fromEntries(["organization", "branch", "user", "member", "provider", "patient", "procedure", "charge"].map((name) => [name, randomUUID()]));
  const suffix = ids.organization.replaceAll("-", "").slice(0, 12); const options = { cwd: repositoryRoot, env: dockerEnvironment }; const key = `implant-race-${suffix}`;
  const setup = `begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(${uuid(ids.user)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${literal(`implant-${suffix}@synthetic.test`)},'',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations(id,legal_name,business_name,slug) values(${uuid(ids.organization)},'Implant Race Synthetic Inc','Implant Race Synthetic',${literal(`implant-race-${suffix}`)});
insert into public.branches(id,organization_id,name,slug,code,address_line1,city,province) values(${uuid(ids.branch)},${uuid(ids.organization)},'Synthetic Main',${literal(`implant-race-main-${suffix}`)},'IMPL-R','1 Synthetic','Test City','Test Province');
insert into public.organization_members(id,organization_id,user_id,membership_status,joined_at) values(${uuid(ids.member)},${uuid(ids.organization)},${uuid(ids.user)},'active',statement_timestamp());
insert into public.branch_memberships(organization_id,branch_id,organization_member_id,access_status) values(${uuid(ids.organization)},${uuid(ids.branch)},${uuid(ids.member)},'active');
insert into public.member_roles(organization_id,organization_member_id,role_id,assigned_by) select ${uuid(ids.organization)},${uuid(ids.member)},id,${uuid(ids.user)} from public.roles where organization_id is null and code='OWNER';
insert into public.providers(id,organization_id,linked_user_id,first_name,last_name,provider_type,status) values(${uuid(ids.provider)},${uuid(ids.organization)},${uuid(ids.user)},'Synthetic','Provider','REGULAR','active');
insert into public.provider_branches(organization_id,provider_id,branch_id,is_active) values(${uuid(ids.organization)},${uuid(ids.provider)},${uuid(ids.branch)},true);
insert into public.patients(id,organization_id,patient_number,first_name,last_name,birth_date,preferred_branch_id) values(${uuid(ids.patient)},${uuid(ids.organization)},${literal(`IMPL-${suffix}`)},'Synthetic','Patient','1990-01-01',${uuid(ids.branch)});
insert into public.procedures(id,organization_id,code,name,status) values(${uuid(ids.procedure)},${uuid(ids.organization)},'IMPL_RACE','Synthetic implant','active');
insert into public.charges(id,organization_id,patient_id,branch_id,provider_id,procedure_id,amount_centavos,service_date,idempotency_key,created_by) values(${uuid(ids.charge)},${uuid(ids.organization)},${uuid(ids.patient)},${uuid(ids.branch)},${uuid(ids.provider)},${uuid(ids.procedure)},10000,current_date,${literal(`charge-${suffix}`)},${uuid(ids.user)}); commit;`;
  const request = `begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub',${literal(ids.user)},true); select * from public.record_current_implant_component_v3(${uuid(ids.branch)},${uuid(ids.patient)},'[{"tooth_fdi":"16","ordinal":1,"component_kind":"FIXTURE"}]'::jsonb,'2026-08-30T00:00:00+00'::timestamptz,${uuid(ids.charge)},${literal(key)}); commit;`;
  const cleanup = `begin; alter table public.audit_events disable trigger user; alter table public.dental_implant_components disable trigger user; alter table public.charges disable trigger user; delete from private.odontogram_revamp_current_idempotency where organization_id=${uuid(ids.organization)}; delete from public.audit_events where organization_id=${uuid(ids.organization)}; delete from public.dental_implant_components where organization_id=${uuid(ids.organization)}; delete from public.charges where organization_id=${uuid(ids.organization)}; delete from public.procedures where organization_id=${uuid(ids.organization)}; delete from public.patients where organization_id=${uuid(ids.organization)}; delete from public.provider_branches where organization_id=${uuid(ids.organization)}; delete from public.providers where organization_id=${uuid(ids.organization)}; delete from public.member_roles where organization_id=${uuid(ids.organization)}; delete from public.branch_memberships where organization_id=${uuid(ids.organization)}; delete from public.organization_members where organization_id=${uuid(ids.organization)}; delete from public.payment_methods where organization_id=${uuid(ids.organization)}; delete from public.branches where organization_id=${uuid(ids.organization)}; delete from public.organizations where id=${uuid(ids.organization)}; delete from auth.users where id=${uuid(ids.user)}; alter table public.charges enable trigger user; alter table public.dental_implant_components enable trigger user; alter table public.audit_events enable trigger user; commit;`;
  try {
    requireSuccess(await execute(command, setup, options), "implant idempotency concurrency setup");
    const locker = execute(command, `begin; select id from public.charges where id=${uuid(ids.charge)} for update; select pg_sleep(0.5); commit;`, options); await delay(100);
    const results = await Promise.all([execute(command, request, options), execute(command, request, options)]); requireSuccess(await locker, "implant concurrency lock");
    if (results.some((result) => result.status !== 0)) throw new Error(`same-key implant requests must both succeed: ${results.map((result) => result.stderr.trim()).join(" | ")}`);
    const idsReturned = results.map((result) => (result.stdout.match(/[0-9a-f]{8}-[0-9a-f-]{27}/i) ?? [""])[0]);
    if (!idsReturned[0] || idsReturned[0] !== idsReturned[1]) throw new Error("same-key implant requests did not return one canonical component identity");
    const proof = await execute(command, `select case when (select count(*) from public.dental_implant_components where organization_id=${uuid(ids.organization)})=1 and (select count(*) from private.odontogram_revamp_current_idempotency where organization_id=${uuid(ids.organization)} and idempotency_key=${literal(key)})=1 then 'IMPLANT_SAME_KEY_OK' else 'IMPLANT_SAME_KEY_FAILED' end;`, options); requireSuccess(proof, "implant concurrency proof"); if (!proof.stdout.includes("IMPLANT_SAME_KEY_OK")) throw new Error("concurrent same-key implant requests created more than one canonical graph");
  } finally { requireSuccess(await execute(command, cleanup, options), "implant idempotency concurrency cleanup"); }
}
