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

function allocateSql({ branchId, userId, paymentId, chargeId, patientId, amountCentavos, key }) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', ${sqlLiteral(userId)}, true);
select public.allocate_payment(${sqlLiteral(branchId)}::uuid, ${sqlLiteral(paymentId)}::uuid, ${sqlLiteral(chargeId)}::uuid, ${sqlLiteral(patientId)}::uuid, ${sqlLiteral(amountCentavos)}::bigint, ${sqlLiteral(key)}::text);
commit;`;
}

function classifyOutcome(result) {
  if (result.status === 0) {
    return "COMMITTED";
  }

  if (result.status !== 0 && /ERROR:\s+insufficient payment availability/i.test(result.stderr)) {
    return "INSUFFICIENT_AVAILABILITY";
  }

  if (result.status !== 0 && /ERROR:\s+allocation exceeds adjusted due/i.test(result.stderr)) {
    return "EXCEEDS_DUE";
  }

  throw new Error(`Unexpected concurrent allocation result: ${result.stderr.trim() || result.stdout.trim()}`);
}

export async function runBillingAllocationConcurrencyTest({
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
    charge: randomUUID(),
    payment: randomUUID(),
  };
  const suffix = ids.organization.replaceAll("-", "").slice(0, 12);
  const options = { cwd: repositoryRoot, env: dockerEnvironment };

  const setup = `begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  (${sqlLiteral(ids.firstUser)}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${sqlLiteral(`first-${suffix}@p310c.example.test`)}, '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  (${sqlLiteral(ids.secondUser)}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${sqlLiteral(`second-${suffix}@p310c.example.test`)}, '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values (${sqlLiteral(ids.organization)}::uuid, 'P310C Concurrency Synthetic Inc.', 'P310C Concurrency Synthetic', ${sqlLiteral(`p310c-concurrency-${suffix}`)});
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values (${sqlLiteral(ids.branch)}::uuid, ${sqlLiteral(ids.organization)}::uuid, 'P310C Concurrency Main', ${sqlLiteral(`p310c-concurrency-main-${suffix}`)}, 'P310C-C1', '1 Synthetic Street', 'Test City', 'Test Province');
insert into public.organization_members (organization_id, user_id, membership_status, joined_at) values
  (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.firstUser)}::uuid, 'active', statement_timestamp()),
  (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.secondUser)}::uuid, 'active', statement_timestamp());
insert into public.member_roles (organization_id, organization_member_id, role_id, assigned_by)
select member.organization_id, member.id, role.id, member.user_id
from public.organization_members as member
join public.roles as role on role.organization_id is null and role.code = 'OWNER'
where member.organization_id = ${sqlLiteral(ids.organization)}::uuid;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values (${sqlLiteral(ids.patient)}::uuid, ${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(`P310C-${suffix}`)}, 'Concurrent', 'Allocation', date '1990-01-01');
insert into public.charges (id, organization_id, patient_id, branch_id, amount_centavos, service_date, idempotency_key, non_clinical) values
  (${sqlLiteral(ids.charge)}::uuid, ${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.patient)}::uuid, ${sqlLiteral(ids.branch)}::uuid, 200000, date '2026-08-01', ${sqlLiteral(`p310c-charge-${suffix}`)}, true);
insert into public.payments (id, organization_id, patient_id, branch_id, payment_method_id, amount_centavos, idempotency_key) values
  (${sqlLiteral(ids.payment)}::uuid, ${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.patient)}::uuid, ${sqlLiteral(ids.branch)}::uuid, (select id from public.payment_methods where organization_id=${sqlLiteral(ids.organization)}::uuid and code='CASH' limit 1), 200000, ${sqlLiteral(`p310c-payment-${suffix}`)};
commit;`;
  const cleanup = `begin;
alter table public.audit_events disable trigger audit_events_prevent_mutation;
delete from public.audit_events where organization_id = ${sqlLiteral(ids.organization)}::uuid;
alter table public.audit_events enable trigger audit_events_prevent_mutation;
delete from public.payment_allocation_reversals where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.payment_allocations where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.payments where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.charges where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.payment_methods where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.patient_contacts where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.patients where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.member_roles where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.organization_members where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.branches where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.organizations where id = ${sqlLiteral(ids.organization)}::uuid;
delete from auth.users where id in (${sqlLiteral(ids.firstUser)}::uuid, ${sqlLiteral(ids.secondUser)}::uuid);
commit;`;

  try {
    requireSuccess(await execute(command, setup, options), "Billing concurrency fixture setup");

    const results = await Promise.all([
      execute(command, allocateSql({
        branchId: ids.branch, userId: ids.firstUser, paymentId: ids.payment,
        chargeId: ids.charge, patientId: ids.patient, amountCentavos: "150000", key: `alloc-a-${suffix}`,
      }), options),
      execute(command, allocateSql({
        branchId: ids.branch, userId: ids.secondUser, paymentId: ids.payment,
        chargeId: ids.charge, patientId: ids.patient, amountCentavos: "150000", key: `alloc-b-${suffix}`,
      }), options),
    ]);
    const outcomes = results.map(classifyOutcome).sort();

    if (!outcomes.includes("COMMITTED") || !outcomes.includes("EXCEEDS_DUE")) {
      throw new Error(`Expected one COMMITTED and one EXCEEDS_DUE result; received ${outcomes.join(",")}.`);
    }

    const check = await execute(
      command,
      `select sum(amount_centavos) as total_allocated from public.payment_allocations where organization_id = ${sqlLiteral(ids.organization)}::uuid;`,
      options,
    );
    requireSuccess(check, "Allocated total assertion");
    if (!/total_allocated\s*\r?\n-+\r?\n\s*150000\s*\r?\n\(1 row\)/.test(check.stdout)) {
      throw new Error("Expected exactly 150000 centavos allocated by the concurrent requests.");
    }
  } finally {
    requireSuccess(await execute(command, cleanup, options), "Billing concurrency fixture cleanup");
  }
}