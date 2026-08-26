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

function createAppointmentSql({ branchId, patientId, providerId, userId }) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', ${sqlLiteral(userId)}, true);
select version from public.create_appointment(
  ${sqlLiteral(branchId)}::uuid, ${sqlLiteral(patientId)}::uuid,
  '{"startsAt":"2030-05-06T09:00:00+00","endsAt":"2030-05-06T09:30:00+00","schedulingStatus":"SCHEDULED","providers":[{"providerId":"${providerId}","providerRole":"PRIMARY_DENTIST"}]}'::jsonb
);
commit;`;
}

function classifyOutcome(result) {
  if (result.status === 0) {
    return "COMMITTED";
  }

  if (
    result.status !== 0 &&
    /ERROR:\s+scheduling conflict/i.test(result.stderr)
  ) {
    return "SCHEDULING_CONFLICT";
  }

  throw new Error(`Unexpected concurrent create result: ${result.stderr.trim() || result.stdout.trim()}`);
}

export async function runAppointmentCreateConcurrencyTest({
  command,
  repositoryRoot,
  dockerEnvironment,
}) {
  const ids = {
    organization: randomUUID(),
    branch: randomUUID(),
    firstUser: randomUUID(),
    secondUser: randomUUID(),
    patient: randomUUID(),
    provider: randomUUID(),
  };
  const suffix = ids.organization.replaceAll("-", "").slice(0, 12);
  const options = { cwd: repositoryRoot, env: dockerEnvironment };

  const setup = `begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  (${sqlLiteral(ids.firstUser)}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${sqlLiteral(`scheduler-a-${suffix}@p606.example.test`)}, '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  (${sqlLiteral(ids.secondUser)}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${sqlLiteral(`scheduler-b-${suffix}@p606.example.test`)}, '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values (${sqlLiteral(ids.organization)}::uuid, 'P606 Concurrency Synthetic Inc.', 'P606 Concurrency Synthetic', ${sqlLiteral(`p606-concurrency-${suffix}`)});
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values (${sqlLiteral(ids.branch)}::uuid, ${sqlLiteral(ids.organization)}::uuid, 'P606 Concurrency Main', ${sqlLiteral(`p606-concurrency-main-${suffix}`)}, 'P606-C1', '1 Synthetic Street', 'Test City', 'Test Province');
insert into public.organization_members (organization_id, user_id, membership_status, joined_at) values
  (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.firstUser)}::uuid, 'active', statement_timestamp()),
  (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.secondUser)}::uuid, 'active', statement_timestamp());
insert into public.member_roles (organization_id, organization_member_id, role_id, assigned_by)
select member.organization_id, member.id, role.id, member.user_id
from public.organization_members as member
join public.roles as role on role.organization_id is null and role.code = 'DENTIST'
where member.organization_id = ${sqlLiteral(ids.organization)}::uuid;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values (${sqlLiteral(ids.patient)}::uuid, ${sqlLiteral(ids.organization)}::uuid, 'P606-CONC-1', 'Concurrent', 'Patient', date '1990-01-01');
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status) values (${sqlLiteral(ids.provider)}::uuid, ${sqlLiteral(ids.organization)}::uuid, 'Concurrent', 'Dentist', 'REGULAR', 'active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.provider)}::uuid, ${sqlLiteral(ids.branch)}::uuid, true);
insert into public.provider_availability_rules (organization_id, provider_id, branch_id, weekday, starts_at_local, ends_at_local, valid_from)
values (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.provider)}::uuid, ${sqlLiteral(ids.branch)}::uuid, EXTRACT(DOW FROM '2030-05-06 09:00:00+00'::timestamptz), time '08:00', time '18:00', date '2030-05-01');
commit;`;
  const cleanup = `begin;
alter table public.audit_events disable trigger audit_events_prevent_mutation;
delete from public.audit_events where organization_id = ${sqlLiteral(ids.organization)}::uuid;
alter table public.audit_events enable trigger audit_events_prevent_mutation;
delete from public.resource_reservations where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.provider_reservations where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.appointment_status_history where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.appointment_resources where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.appointment_providers where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.appointments where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.provider_schedule_exceptions where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.provider_availability_rules where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.provider_branches where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.providers where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.patients where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.member_roles where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.organization_members where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.branches where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.organizations where id = ${sqlLiteral(ids.organization)}::uuid;
delete from auth.users where id in (${sqlLiteral(ids.firstUser)}::uuid, ${sqlLiteral(ids.secondUser)}::uuid);
commit;`;

  try {
    requireSuccess(await execute(command, setup, options), "Concurrency fixture setup");

    const results = await Promise.all([
      execute(command, createAppointmentSql({ branchId: ids.branch, patientId: ids.patient, providerId: ids.provider, userId: ids.firstUser }), options),
      execute(command, createAppointmentSql({ branchId: ids.branch, patientId: ids.patient, providerId: ids.provider, userId: ids.secondUser }), options),
    ]);
    const outcomes = results.map(classifyOutcome).sort();

    if (outcomes.join(",") !== "COMMITTED,SCHEDULING_CONFLICT") {
      throw new Error(`Expected one COMMITTED and one SCHEDULING_CONFLICT result; received ${outcomes.join(",")}.`);
    }

    const count = await execute(
      command,
      `select count(*) as committed_appointments from public.appointments where organization_id = ${sqlLiteral(ids.organization)}::uuid;`,
      options,
    );
    requireSuccess(count, "Committed appointment count assertion");
    if (!/committed_appointments\s*\r?\n-+\r?\n\s*1\s*\r?\n\(1 row\)/.test(count.stdout)) {
      throw new Error("Expected exactly one appointment committed by the concurrent requests.");
    }

    const active = await execute(
      command,
      `select count(*) as active_reservations from public.provider_reservations where organization_id = ${sqlLiteral(ids.organization)}::uuid and reservation_status = 'ACTIVE';`,
      options,
    );
    requireSuccess(active, "Active reservation count assertion");
    if (!/active_reservations\s*\r?\n-+\r?\n\s*1\s*\r?\n\(1 row\)/.test(active.stdout)) {
      throw new Error("Expected exactly one ACTIVE provider reservation committed by the concurrent requests.");
    }
  } finally {
    requireSuccess(await execute(command, cleanup, options), "Concurrency fixture cleanup");
  }
}