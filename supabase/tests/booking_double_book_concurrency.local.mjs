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

function submitBookingSql({ slug, providerId, slot, idempotencyKey, mobile }) {
  return `begin;
set local role anon;
select public.public_submit_booking_request(
  ${sqlLiteral(slug)},
  '{"firstName":"Concurrent","lastName":"Booker","birthDate":"1990-05-06","mobile":"${mobile}","requestedProcedureCode":"P1303_CONCURRENT","requestedProviderId":"${providerId}","requestedStartsAt":"${slot}","idempotencyKey":"${idempotencyKey}"}'::jsonb
);
commit;`;
}

function classifyOutcome(result) {
  if (result.status === 0) {
    return "COMMITTED";
  }

  if (
    result.status !== 0 &&
    /ERROR:\s+slot unavailable/i.test(result.stderr)
  ) {
    return "SLOT_UNAVAILABLE";
  }

  throw new Error(`Unexpected concurrent submit result: ${result.stderr.trim() || result.stdout.trim()}`);
}

export async function runBookingDoubleBookConcurrencyTest({
  command,
  repositoryRoot,
  dockerEnvironment,
}) {
  const ids = {
    organization: randomUUID(),
    branch: randomUUID(),
    procedure: randomUUID(),
    provider: randomUUID(),
  };
  const suffix = ids.organization.replaceAll("-", "").slice(0, 12);
  const slug = `p1303-concurrency-${suffix}`;
  const slot = "2030-05-06T09:00:00+00";
  const options = { cwd: repositoryRoot, env: dockerEnvironment };

  const setup = `begin;
insert into public.organizations (id, legal_name, business_name, slug) values (${sqlLiteral(ids.organization)}::uuid, 'P1303 Concurrency Synthetic Inc.', 'P1303 Concurrency Synthetic', ${sqlLiteral(slug)});
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values (${sqlLiteral(ids.branch)}::uuid, ${sqlLiteral(ids.organization)}::uuid, 'P1303 Concurrency Main', ${sqlLiteral(`${slug}-main`)}, 'P1303-C1', '1 Synthetic Street', 'Test City', 'Test Province');
insert into public.procedures (id, organization_id, code, name, status, website_visible, online_booking_enabled, booking_mode, default_duration_minutes) values (${sqlLiteral(ids.procedure)}::uuid, ${sqlLiteral(ids.organization)}::uuid, 'P1303_CONCURRENT', 'Concurrent Cleaning', 'active', true, true, 'REQUIRES_REVIEW', 30);
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status) values (${sqlLiteral(ids.provider)}::uuid, ${sqlLiteral(ids.organization)}::uuid, 'Concurrent', 'Dentist', 'REGULAR', 'active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.provider)}::uuid, ${sqlLiteral(ids.branch)}::uuid, true);
insert into public.provider_availability_rules (organization_id, provider_id, branch_id, weekday, starts_at_local, ends_at_local, valid_from)
values (${sqlLiteral(ids.organization)}::uuid, ${sqlLiteral(ids.provider)}::uuid, ${sqlLiteral(ids.branch)}::uuid, EXTRACT(DOW FROM '2030-05-06 09:00:00+00'::timestamptz), time '08:00', time '18:00', date '2030-05-01');
commit;`;
  const cleanup = `begin;
alter table public.audit_events disable trigger audit_events_prevent_mutation;
delete from public.audit_events where organization_id = ${sqlLiteral(ids.organization)}::uuid;
alter table public.audit_events enable trigger audit_events_prevent_mutation;
delete from public.booking_requests where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.provider_reservations where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.provider_schedule_exceptions where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.provider_availability_rules where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.provider_branches where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.providers where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.procedures where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.branches where organization_id = ${sqlLiteral(ids.organization)}::uuid;
delete from public.organizations where id = ${sqlLiteral(ids.organization)}::uuid;
commit;`;

  try {
    requireSuccess(await execute(command, setup, options), "Concurrency fixture setup");

    const results = await Promise.all([
      execute(
        command,
        submitBookingSql({
          slug,
          providerId: ids.provider,
          slot,
          idempotencyKey: `p1303-concurrency-a-${suffix}`,
          mobile: "+639170000001",
        }),
        options,
      ),
      execute(
        command,
        submitBookingSql({
          slug,
          providerId: ids.provider,
          slot,
          idempotencyKey: `p1303-concurrency-b-${suffix}`,
          mobile: "+639170000002",
        }),
        options,
      ),
    ]);
    const outcomes = results.map(classifyOutcome).sort();

    if (outcomes.join(",") !== "COMMITTED,SLOT_UNAVAILABLE") {
      throw new Error(
        `Expected one COMMITTED and one SLOT_UNAVAILABLE result; received ${outcomes.join(",")}.`,
      );
    }

    const submitted = await execute(
      command,
      `select count(*) as submitted_requests from public.booking_requests where organization_id = ${sqlLiteral(ids.organization)}::uuid and request_status = 'SUBMITTED';`,
      options,
    );
    requireSuccess(submitted, "Committed request count assertion");
    if (!/submitted_requests\s*\r?\n-+\r?\n\s*1\s*\r?\n\(1 row\)/.test(submitted.stdout)) {
      throw new Error("Expected exactly one SUBMITTED booking request committed by the concurrent submissions.");
    }

    const active = await execute(
      command,
      `select count(*) as active_holds from public.provider_reservations where organization_id = ${sqlLiteral(ids.organization)}::uuid and reservation_kind = 'HOLD' and reservation_status = 'ACTIVE';`,
      options,
    );
    requireSuccess(active, "Active hold count assertion");
    if (!/active_holds\s*\r?\n-+\r?\n\s*1\s*\r?\n\(1 row\)/.test(active.stdout)) {
      throw new Error("Expected exactly one ACTIVE HOLD provider reservation committed by the concurrent submissions.");
    }
  } finally {
    requireSuccess(await execute(command, cleanup, options), "Concurrency fixture cleanup");
  }
}