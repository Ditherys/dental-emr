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

function clearSql({ branchId, userId, chequeId, key }) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', ${sqlLiteral(userId)}, true);
select public.clear_postdated_cheque(${sqlLiteral(branchId)}::uuid, ${sqlLiteral(chequeId)}::uuid, ${sqlLiteral(key)}::text);
commit;`;
}

function classifyOutcome(result) {
  if (result.status === 0) {
    return "COMMITTED";
  }

  if (result.status !== 0 && /ERROR:\s+(postdated cheque is terminal|invalid state)/i.test(result.stderr)) {
    return "TERMINAL";
  }

  throw new Error(`Unexpected concurrent clearance result: ${result.stderr.trim() || result.stdout.trim()}`);
}

export async function runPostdatedChequeClearanceConcurrencyTest({
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
    cheque: randomUUID(),
  };
  const suffix = ids.organization.replaceAll("-", "").slice(0, 12);
  const options = { cwd: repositoryRoot, env: dockerEnvironment };

  const setup = `begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  (${sqlLiteral(ids.firstUser)}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${sqlLiteral(`first-${suffix}@p510c.example.test`)}, '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  (${sqlLiteral(ids.secondUser)}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${sqlLiteral(`second-${suffix}@p510c.example.test`)}, '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values (${sqlLiteral(ids.organization)}::uuid, 'P510C Concurrency Synthetic Inc.', 'P510C Concurrency Synthetic', ${sqlLiteral(`p510c-concurrency-${suffix}`)});
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values (${sqlLiteral(ids.branch)}::uuid, ${sqlLiteral(ids.organization)}::uuid, 'P510C Concurrency Main', ${sqlLiteral(`p510c-concurrency-main-${suffix}`)}, 'P510C-C1', '1 Synthetic Street', 'Test City', 'Test Province');
insert into public.organization_members (organization_id, user_id, membership_status, joined_at) values
  (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.firstUser)}::uuid, 'active', statement_timestamp()),
  (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.secondUser)}::uuid, 'active', statement_timestamp());
insert into public.member_roles (organization_id, organization_member_id, role_id, assigned_by)
select member.organization_id, member.id, role.id, member.user_id
from public.organization_members as member
join public.roles as role on role.organization_id is null and role.code = 'OWNER'
where member.organization_id = ${sqlLiteral(ids.organization)}::uuid;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values (${sqlLiteral(ids.patient)}::uuid, ${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(`P510C-${suffix}`)}, 'Concurrent', 'Cheque', date '1990-01-01');
insert into public.charges (id, organization_id, patient_id, branch_id, amount_centavos, service_date, idempotency_key, non_clinical) values
  (${sqlLiteral(ids.charge)}::uuid, ${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.patient)}::uuid, ${sqlLiteral(ids.branch)}::uuid, 300000, date '2026-08-01', ${sqlLiteral(`p510c-charge-${suffix}`)}, true);
insert into public.postdated_cheques (id, organization_id, patient_id, branch_id, cheque_number, bank_name, amount_centavos, date_due, idempotency_key) values
  (${sqlLiteral(ids.cheque)}::uuid, ${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.patient)}::uuid, ${sqlLiteral(ids.branch)}::uuid, ${sqlLiteral(`XXXX-${suffix}`)}, 'BANK ONE', 300000, date '2026-09-30', ${sqlLiteral(`p510c-pdc-${suffix}`)});
insert into public.postdated_cheque_allocations (organization_id, cheque_id, charge_id, patient_id, amount_centavos) values
  (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.cheque)}::uuid, ${sqlLiteral(ids.charge)}::uuid, ${sqlLiteral(ids.patient)}::uuid, 300000);
insert into public.postdated_cheque_status_events (organization_id, cheque_id, from_status, to_status, reason, idempotency_key) values
  (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.cheque)}::uuid, 'HELD', 'DEPOSITED', 'deposited', ${sqlLiteral(`p510c-deposit-${suffix}`)});
commit;`;
  const cleanup = `begin;
 alter table public.audit_events disable trigger user;
 alter table public.payment_allocation_reversals disable trigger user;
 alter table public.payment_allocations disable trigger user;
 alter table public.payments disable trigger user;
 alter table public.postdated_cheque_allocations disable trigger user;
 alter table public.postdated_cheque_status_events disable trigger user;
 alter table public.postdated_cheques disable trigger user;
 alter table public.charges disable trigger user;
delete from public.audit_events where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.payment_allocation_reversals where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.payment_allocations where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.payments where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.postdated_cheque_allocations where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.postdated_cheque_status_events where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.postdated_cheques where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.charges where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.payment_methods where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.patient_contacts where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.patients where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.member_roles where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.organization_members where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.branches where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.organizations where id = ${sqlLiteral(ids.organization)}::uuid;
 delete from auth.users where id in (${sqlLiteral(ids.firstUser)}::uuid, ${sqlLiteral(ids.secondUser)}::uuid);
 alter table public.audit_events enable trigger user;
 alter table public.payment_allocation_reversals enable trigger user;
 alter table public.payment_allocations enable trigger user;
 alter table public.payments enable trigger user;
 alter table public.postdated_cheque_allocations enable trigger user;
 alter table public.postdated_cheque_status_events enable trigger user;
 alter table public.postdated_cheques enable trigger user;
 alter table public.charges enable trigger user;
 commit;`;

  try {
    requireSuccess(await execute(command, setup, options), "PDC clearance fixture setup");

    const results = await Promise.all([
      execute(command, clearSql({ branchId: ids.branch, userId: ids.firstUser, chequeId: ids.cheque, key: `clear-a-${suffix}` }), options),
      execute(command, clearSql({ branchId: ids.branch, userId: ids.secondUser, chequeId: ids.cheque, key: `clear-b-${suffix}` }), options),
    ]);
    const outcomes = results.map(classifyOutcome).sort();

    if (!outcomes.includes("COMMITTED") || !outcomes.includes("TERMINAL")) {
      throw new Error(`Expected one COMMITTED and one terminal-state denial; received ${outcomes.join(",")}.`);
    }

    const check = await execute(
      command,
      `select count(*) as cleared_payments from public.payments where organization_id = ${sqlLiteral(ids.organization)}::uuid;`,
      options,
    );
    requireSuccess(check, "Cleared payment count assertion");
    if (!/cleared_payments\s*\r?\n-+\r?\n\s*1\s*\r?\n\(1 row\)/.test(check.stdout)) {
      throw new Error("Expected exactly one CHEQUE payment created by the concurrent clearances.");
    }
  } finally {
    requireSuccess(await execute(command, cleanup, options), "PDC clearance fixture cleanup");
  }
}
