import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

function execute(command, input, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}

const literal = (value) => `'${value.replaceAll("'", "''")}'`;

function assertSuccess(result, operation) {
  if (result.status !== 0) throw new Error(`${operation} failed: ${result.stderr.trim() || result.stdout.trim()}`);
}

function updateSql({ branchId, patientId, userId, patch, expectedVersion = 1 }) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', ${literal(userId)}, true);
select * from public.update_patient(${literal(branchId)}::uuid, ${literal(patientId)}::uuid, ${expectedVersion}, ${literal(JSON.stringify(patch))}::jsonb, false);
commit;`;
}

function outcome(result) {
  if (result.status === 0) return "COMMITTED";
  if (/ERROR:\s+stale version/i.test(result.stderr)) return "STALE_VERSION";
  if (/ERROR:\s+duplicate review required/i.test(result.stderr)) return "DUPLICATE_REVIEW_REQUIRED";
  throw new Error(`Unexpected concurrent update result: ${result.stderr.trim() || result.stdout.trim()}`);
}

export async function runPatientDemographicsWriteConcurrencyTest({ command, repositoryRoot, dockerEnvironment }) {
  const ids = { organization: randomUUID(), branch: randomUUID(), firstUser: randomUUID(), secondUser: randomUUID(), firstPatient: randomUUID(), secondPatient: randomUUID() };
  const suffix = ids.organization.replaceAll("-", "").slice(0, 12);
  const options = { cwd: repositoryRoot, env: dockerEnvironment };
  const setup = `begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
(${literal(ids.firstUser)}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${literal(`writer-a-${suffix}@p206.example.test`)}, '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
(${literal(ids.secondUser)}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${literal(`writer-b-${suffix}@p206.example.test`)}, '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values (${literal(ids.organization)}::uuid, 'P206 Concurrency Synthetic Inc.', 'P206 Concurrency Synthetic', ${literal(`p206-concurrency-${suffix}`)});
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values (${literal(ids.branch)}::uuid, ${literal(ids.organization)}::uuid, 'P206 Concurrency', ${literal(`p206-branch-${suffix}`)}, 'P206-C', '1 Synthetic Street', 'Test City', 'Test Province');
insert into public.organization_members (organization_id, user_id, membership_status, joined_at) values (${literal(ids.organization)}::uuid, ${literal(ids.firstUser)}::uuid, 'active', statement_timestamp()), (${literal(ids.organization)}::uuid, ${literal(ids.secondUser)}::uuid, 'active', statement_timestamp());
insert into public.member_roles (organization_id, organization_member_id, role_id, assigned_by) select member.organization_id, member.id, role.id, member.user_id from public.organization_members member join public.roles role on role.organization_id is null and role.code = 'DENTIST' where member.organization_id = ${literal(ids.organization)}::uuid;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values (${literal(ids.firstPatient)}::uuid, ${literal(ids.organization)}::uuid, 'P-000001', 'First', 'Patient', date '1990-01-01'), (${literal(ids.secondPatient)}::uuid, ${literal(ids.organization)}::uuid, 'P-000002', 'Second', 'Patient', date '1991-01-01');
commit;`;
  const cleanup = `begin; alter table public.audit_events disable trigger audit_events_prevent_mutation; delete from public.audit_events where organization_id = ${literal(ids.organization)}::uuid; alter table public.audit_events enable trigger audit_events_prevent_mutation; delete from public.patients where organization_id = ${literal(ids.organization)}::uuid; delete from public.member_roles where organization_id = ${literal(ids.organization)}::uuid; delete from public.organization_members where organization_id = ${literal(ids.organization)}::uuid; delete from public.branches where organization_id = ${literal(ids.organization)}::uuid; delete from public.organizations where id = ${literal(ids.organization)}::uuid; delete from auth.users where id in (${literal(ids.firstUser)}::uuid, ${literal(ids.secondUser)}::uuid); commit;`;
  try {
    assertSuccess(await execute(command, setup, options), "Concurrency fixture setup");
    const staleResults = await Promise.all([
      execute(command, updateSql({ branchId: ids.branch, patientId: ids.firstPatient, userId: ids.firstUser, patch: { city: "One" } }), options),
      execute(command, updateSql({ branchId: ids.branch, patientId: ids.firstPatient, userId: ids.secondUser, patch: { city: "Two" } }), options),
    ]);
    if (staleResults.map(outcome).sort().join(",") !== "COMMITTED,STALE_VERSION") throw new Error("Concurrent same-version updates did not yield one commit and one stale version.");
    const duplicateResults = await Promise.all([
      execute(command, updateSql({ branchId: ids.branch, patientId: ids.firstPatient, userId: ids.firstUser, expectedVersion: 2, patch: { firstName: "Shared", lastName: "Name", birthDate: "1995-01-01" } }), options),
      execute(command, updateSql({ branchId: ids.branch, patientId: ids.secondPatient, userId: ids.secondUser, patch: { firstName: "Shared", lastName: "Name", birthDate: "1995-01-01" } }), options),
    ]);
    if (duplicateResults.map(outcome).sort().join(",") !== "COMMITTED,DUPLICATE_REVIEW_REQUIRED") throw new Error("Concurrent duplicate-key updates did not yield one commit and one duplicate review.");
  } finally {
    assertSuccess(await execute(command, cleanup, options), "Concurrency fixture cleanup");
  }
}
