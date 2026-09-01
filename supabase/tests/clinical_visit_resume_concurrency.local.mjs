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

/**
 * Two genuinely simultaneous sessions cannot be expressed inside one pgTAP
 * transaction, so the managed visit race lives here. Both sessions block on the
 * same patient row lock, are released together, and must converge on one
 * managed encounter identity and one audit event.
 */
export async function runClinicalVisitResumeConcurrencyTest({ command, repositoryRoot, dockerEnvironment }) {
  const ids = Object.fromEntries(["organization", "branch", "user", "member", "provider", "patient"].map((name) => [name, randomUUID()]));
  const suffix = ids.organization.replaceAll("-", "").slice(0, 12); const options = { cwd: repositoryRoot, env: dockerEnvironment };
  const setup = `begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,phone_change,phone_change_token,reauthentication_token) values(${uuid(ids.user)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${literal(`visit-${suffix}@synthetic.test`)},'',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp(),'','','','','','','','');
insert into public.organizations(id,legal_name,business_name,slug) values(${uuid(ids.organization)},'Visit Race Synthetic Inc','Visit Race Synthetic',${literal(`visit-race-${suffix}`)});
insert into public.branches(id,organization_id,name,slug,code,address_line1,city,province) values(${uuid(ids.branch)},${uuid(ids.organization)},'Synthetic Main',${literal(`visit-race-main-${suffix}`)},'VIS-R','1 Synthetic','Test City','Test Province');
insert into public.organization_members(id,organization_id,user_id,membership_status,joined_at) values(${uuid(ids.member)},${uuid(ids.organization)},${uuid(ids.user)},'active',statement_timestamp());
insert into public.branch_memberships(organization_id,branch_id,organization_member_id,access_status) values(${uuid(ids.organization)},${uuid(ids.branch)},${uuid(ids.member)},'active');
insert into public.member_roles(organization_id,organization_member_id,role_id,assigned_by) select ${uuid(ids.organization)},${uuid(ids.member)},id,${uuid(ids.user)} from public.roles where organization_id is null and code='DENTIST';
insert into public.providers(id,organization_id,linked_user_id,first_name,last_name,provider_type,status) values(${uuid(ids.provider)},${uuid(ids.organization)},${uuid(ids.user)},'Synthetic','Provider','REGULAR','active');
insert into public.provider_branches(organization_id,provider_id,branch_id,is_active) values(${uuid(ids.organization)},${uuid(ids.provider)},${uuid(ids.branch)},true);
insert into public.patients(id,organization_id,patient_number,first_name,last_name,birth_date,preferred_branch_id) values(${uuid(ids.patient)},${uuid(ids.organization)},${literal(`VIS-${suffix}`)},'Synthetic','Patient','1990-01-01',${uuid(ids.branch)}); commit;`;
  const request = `begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub',${literal(ids.user)},true); select 'VISIT_ID=' || encounter_id::text || ' RESUMED=' || resumed::text as marker from public.start_or_resume_clinical_visit(${uuid(ids.branch)},${uuid(ids.patient)},null,null); commit;`;
  const cleanup = `begin; alter table public.audit_events disable trigger user; delete from public.audit_events where organization_id=${uuid(ids.organization)}; delete from public.clinical_encounters where organization_id=${uuid(ids.organization)}; delete from public.patients where organization_id=${uuid(ids.organization)}; delete from public.provider_branches where organization_id=${uuid(ids.organization)}; delete from public.providers where organization_id=${uuid(ids.organization)}; delete from public.member_roles where organization_id=${uuid(ids.organization)}; delete from public.branch_memberships where organization_id=${uuid(ids.organization)}; delete from public.organization_members where organization_id=${uuid(ids.organization)}; delete from public.payment_methods where organization_id=${uuid(ids.organization)}; delete from public.branches where organization_id=${uuid(ids.organization)}; delete from public.organizations where id=${uuid(ids.organization)}; delete from auth.users where id=${uuid(ids.user)}; alter table public.audit_events enable trigger user; commit;`;
  try {
    requireSuccess(await execute(command, setup, options), "clinical visit resume concurrency setup");
    const locker = execute(command, `begin; select id from public.patients where id=${uuid(ids.patient)} for update; select pg_sleep(0.5); commit;`, options);
    await delay(100);
    const results = await Promise.all([execute(command, request, options), execute(command, request, options)]);
    requireSuccess(await locker, "clinical visit concurrency lock");
    if (results.some((result) => result.status !== 0)) {
      throw new Error(`simultaneous visit requests must both succeed: ${results.map((result) => result.stderr.trim()).join(" | ")}`);
    }
    const markers = results.map((result) => result.stdout.match(/VISIT_ID=([0-9a-f-]{36}) RESUMED=([tf])/i) ?? []);
    const returned = markers.map((marker) => marker[1]);
    if (!returned[0] || returned[0] !== returned[1]) {
      throw new Error("simultaneous visit requests did not return one canonical encounter identity");
    }
    const resumed = markers.map((marker) => marker[2]).sort();
    if (resumed.join(",") !== "f,t") {
      throw new Error(`exactly one simultaneous request must report resumed = false, got ${resumed.join(",") || "no resumed flags"}`);
    }
    const proof = await execute(command, `select case when (select count(*) from public.clinical_encounters where organization_id=${uuid(ids.organization)} and managed_visit)=1 and (select count(*) from public.audit_events where organization_id=${uuid(ids.organization)} and action='clinical.encounter.opened')=1 then 'VISIT_RACE_OK' else 'VISIT_RACE_FAILED' end;`, options);
    requireSuccess(proof, "clinical visit concurrency proof");
    if (!proof.stdout.includes("VISIT_RACE_OK")) {
      throw new Error("simultaneous visit requests created more than one managed encounter or audit event");
    }
  } finally {
    requireSuccess(await execute(command, cleanup, options), "clinical visit resume concurrency cleanup");
  }
}
