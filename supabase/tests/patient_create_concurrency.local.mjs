import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

function execute(command, input, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

function requireSuccess(result, operation) {
  if (result.status !== 0) {
    throw new Error(`${operation} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function createPatientSql({ branchId, userId, firstName, lastName, email }) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', ${sqlLiteral(userId)}, true);
select version from public.create_patient(
  ${sqlLiteral(branchId)}::uuid, ${sqlLiteral(firstName)}, null, ${sqlLiteral(lastName)}, null, null,
  date '1990-01-01', null, null, null, null, null, null, null, '09171234567', ${sqlLiteral(email)}, false
);
commit;`;
}

function classifyOutcome(result) {
  if (result.status === 0) {
    return "COMMITTED";
  }

  if (
    result.status !== 0 &&
    /ERROR:\s+duplicate review required/i.test(result.stderr)
  ) {
    return "DUPLICATE_REVIEW_REQUIRED";
  }

  throw new Error(`Unexpected concurrent create result: ${result.stderr.trim() || result.stdout.trim()}`);
}

export async function runPatientCreateConcurrencyTest({
  command,
  repositoryRoot,
  dockerEnvironment,
}) {
  const ids = {
    organization: randomUUID(),
    branch: randomUUID(),
    firstUser: randomUUID(),
    secondUser: randomUUID(),
  };
  const suffix = ids.organization.replaceAll("-", "").slice(0, 12);
  const firstName = `Concurrent${suffix}`;
  const lastName = "Patient";
  const email = `concurrent-${suffix}@p204.example.test`;
  const options = { cwd: repositoryRoot, env: dockerEnvironment };

  const setup = `begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  (${sqlLiteral(ids.firstUser)}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${sqlLiteral(`first-${suffix}@p204.example.test`)}, '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  (${sqlLiteral(ids.secondUser)}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${sqlLiteral(`second-${suffix}@p204.example.test`)}, '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values (${sqlLiteral(ids.organization)}::uuid, 'P204 Concurrency Synthetic Inc.', 'P204 Concurrency Synthetic', ${sqlLiteral(`p204-concurrency-${suffix}`)});
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values (${sqlLiteral(ids.branch)}::uuid, ${sqlLiteral(ids.organization)}::uuid, 'P204 Concurrency Main', ${sqlLiteral(`p204-concurrency-main-${suffix}`)}, 'P204-C1', '1 Synthetic Street', 'Test City', 'Test Province');
insert into public.organization_members (organization_id, user_id, membership_status, joined_at) values
  (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.firstUser)}::uuid, 'active', statement_timestamp()),
  (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.secondUser)}::uuid, 'active', statement_timestamp());
insert into public.member_roles (organization_id, organization_member_id, role_id, assigned_by)
select member.organization_id, member.id, role.id, member.user_id
from public.organization_members as member
join public.roles as role on role.organization_id is null and role.code = 'DENTIST'
where member.organization_id = ${sqlLiteral(ids.organization)}::uuid;
commit;`;
  const cleanup = `begin;
alter table public.audit_events disable trigger audit_events_prevent_mutation;
delete from public.audit_events where organization_id = ${sqlLiteral(ids.organization)}::uuid;
alter table public.audit_events enable trigger audit_events_prevent_mutation;
delete from public.patient_contacts where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.patients where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from private.patient_number_counters where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.member_roles where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.organization_members where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.branches where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.organizations where id = ${sqlLiteral(ids.organization)}::uuid;
delete from auth.users where id in (${sqlLiteral(ids.firstUser)}::uuid, ${sqlLiteral(ids.secondUser)}::uuid);
commit;`;

  try {
    requireSuccess(await execute(command, setup, options), "Concurrency fixture setup");

    const results = await Promise.all([
      execute(command, createPatientSql({ branchId: ids.branch, userId: ids.firstUser, firstName, lastName, email }), options),
      execute(command, createPatientSql({ branchId: ids.branch, userId: ids.secondUser, firstName, lastName, email }), options),
    ]);
    const outcomes = results.map(classifyOutcome).sort();

    if (outcomes.join(",") !== "COMMITTED,DUPLICATE_REVIEW_REQUIRED") {
      throw new Error(`Expected one COMMITTED and one DUPLICATE_REVIEW_REQUIRED result; received ${outcomes.join(",")}.`);
    }

    const count = await execute(
      command,
      `select count(*) as committed_patients from public.patients where organization_id = ${sqlLiteral(ids.organization)}::uuid;`,
      options,
    );
    requireSuccess(count, "Committed patient count assertion");
    if (!/committed_patients\s*\r?\n-+\r?\n\s*1\s*\r?\n\(1 row\)/.test(count.stdout)) {
      throw new Error("Expected exactly one patient committed by the concurrent requests.");
    }
  } finally {
    requireSuccess(await execute(command, cleanup, options), "Concurrency fixture cleanup");
  }
}
