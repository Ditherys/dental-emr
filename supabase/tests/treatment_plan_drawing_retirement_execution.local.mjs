import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The two-way EXECUTION proof for the drawing retirement.
 *
 * `scripts/treatment-plan-drawing-retirement-migration.test.mjs` proves the
 * ORDERING by reading the migration text. That is honest and it is the only way
 * to prove a property of an already-applied file - but it proves the text, not
 * the behaviour, and neither branch of the preflight had ever run against an
 * actual row: the table was empty when the migration was written.
 *
 * This runs the real block, from the real file, against real rows, in both
 * directions, inside a transaction that is always rolled back:
 *
 *   DELETION  a drawing on a plan in a recognized fixture organization is
 *             deleted, and the block reports one row.
 *   ABORT     a drawing on a plan in a THIRD, non-fixture organization aborts
 *             the block with the expected message AND LEAVES THE ROW IN PLACE.
 *
 * That last assertion is the one static reading structurally cannot give, and
 * it is the property that matters most. It also exercises what reading is
 * weakest on: PostgreSQL's row-constructor `IN` semantics, NULL `slug`
 * behaviour, and the cross-organization join.
 *
 * The SQL is EXTRACTED FROM THE MIGRATION FILE, never retyped, so the file
 * stays the single source of truth and this harness cannot drift into testing
 * a copy that no longer matches what ships.
 *
 * Run directly:
 *   node supabase/tests/treatment_plan_drawing_retirement_execution.local.mjs
 *
 * All data is synthetic. No drawing content is ever logged: the harness asserts
 * on row COUNTS and on the abort message, exactly as the migration reports.
 */

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");

const SWEEP_MIGRATION = "20260901010502_retire_treatment_plan_drawings_locked_sweep.sql";

/** A third organization, deliberately NOT one of the two seed fixtures. */
const FOREIGN_ORGANIZATION = "9f000000-0000-4000-a000-0000000000f1";
const FIXTURE_ORGANIZATION = "22000000-0000-0000-0000-000000000001";

function execute(command, input, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command[0], command.slice(1), {
      ...options,
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
    child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}

/**
 * The `do $migration$ … $migration$;` block, taken verbatim from the migration.
 * Fails closed if the file's shape is not what this harness understands.
 */
export function extractMigrationBlock(source) {
  const matches = source.match(/do \$migration\$[\s\S]*?\$migration\$;/g) ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one do $migration$ block in ${SWEEP_MIGRATION}, found ${matches.length}.`,
    );
  }
  const block = matches[0];
  // The properties this harness exists to exercise must actually be in it.
  for (const required of [
    "lock table public.treatment_plan_drawings in access exclusive mode",
    "into v_unrecognized",
    "delete from public.treatment_plan_drawings",
    "treatment plan drawing retirement aborted before deleting anything",
  ]) {
    if (!block.includes(required)) {
      throw new Error(`The extracted block does not contain ${JSON.stringify(required)}.`);
    }
  }
  return block;
}

const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const uuid = (value) => `${literal(value)}::uuid`;

/**
 * Seeds one plan and one drawing under `organizationId`, runs the extracted
 * block, and reports what happened. Everything rolls back.
 *
 * The tombstone guard is suspended for the SEEDING only - the retirement
 * installed a trigger that refuses every insert, which is the whole point, so a
 * row cannot otherwise be created to test against. The block under test
 * manages the guard itself.
 */
function scenarioSql({ block, organizationId, seedFixtureOrganization }) {
  const branch = "9f000000-0000-4000-a000-0000000000b1";
  const patient = "9f000000-0000-4000-a000-0000000000c1";
  const plan = "9f000000-0000-4000-a000-0000000000d1";

  return `begin;

-- The two deterministic seed fixtures may or may not be present on this
-- database. Ensure the recognized one exists with EXACTLY the id, slug and
-- legal name the recognition rule names, so the positive branch is genuinely
-- exercised rather than accidentally failing on a missing fixture.
${
  seedFixtureOrganization
    ? `insert into public.organizations (id, legal_name, business_name, slug)
values (${uuid(FIXTURE_ORGANIZATION)}, 'SmileLab Demo Dental (Synthetic)', 'SmileLab Demo Dental', 'smilelab-demo-dental')
on conflict (id) do update set legal_name = excluded.legal_name, slug = excluded.slug;`
    : `insert into public.organizations (id, legal_name, business_name, slug)
values (${uuid(FOREIGN_ORGANIZATION)}, 'Not A Fixture Inc.', 'Not A Fixture', 'not-a-fixture-org')
on conflict (id) do nothing;`
}

insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province)
values (${uuid(branch)}, ${uuid(organizationId)}, 'Harness Main', 'drawing-harness-main', 'DHM', '1 Synthetic St', 'Test City', 'Test Province')
on conflict (id) do nothing;

insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id)
values (${uuid(patient)}, ${uuid(organizationId)}, 'DH-1', 'Synthetic', 'Patient', date '1990-01-01', ${uuid(branch)})
on conflict (id) do nothing;

insert into public.treatment_plans (id, organization_id, patient_id, title)
values (${uuid(plan)}, ${uuid(organizationId)}, ${uuid(patient)}, 'Harness plan');

-- Seeding only. The retirement guard refuses every insert, which is exactly
-- what it is for; the block under test suspends and restores it itself.
alter table public.treatment_plan_drawings disable trigger treatment_plan_drawings_retired_row_guard;
insert into public.treatment_plan_drawings (organization_id, plan_id, drawing, version)
values (${uuid(organizationId)}, ${uuid(plan)}, '{"strokes":[]}'::jsonb, 1);
alter table public.treatment_plan_drawings enable trigger treatment_plan_drawings_retired_row_guard;

select 'SEEDED=' || count(*)::text from public.treatment_plan_drawings where plan_id = ${uuid(plan)};

${block}

select 'SURVIVING=' || count(*)::text from public.treatment_plan_drawings where plan_id = ${uuid(plan)};

rollback;`;
}

function resolveCommand() {
  const container = spawnSyncCapture("docker", [
    "--context",
    "desktop-linux",
    "ps",
    "--filter",
    `label=com.supabase.cli.workdir=${repositoryRoot}`,
    "--format",
    "{{.Names}}",
  ]);
  const names = container
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter((name) => /^supabase_db_[a-z0-9_-]+$/.test(name));
  if (names.length !== 1) {
    throw new Error("Expected exactly one local Supabase Postgres container for this worktree.");
  }
  return [
    "docker",
    "--context",
    "desktop-linux",
    "exec",
    "-i",
    names[0],
    "psql",
    "-U",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ];
}

function spawnSyncCapture(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr ?? result.error}`);
  }
  return result.stdout ?? "";
}

export async function runTreatmentPlanDrawingRetirementExecutionTest({ command } = {}) {
  const resolved = command ?? resolveCommand();
  const source = readFileSync(
    join(repositoryRoot, "supabase", "migrations", SWEEP_MIGRATION),
    "utf8",
  ).replaceAll("\r\n", "\n");
  const block = extractMigrationBlock(source);
  const options = { cwd: repositoryRoot };
  const failures = [];

  // ---------------------------------------------------------------------
  // 1. DELETION. A recognized fixture row is removed, and reported as one.
  // ---------------------------------------------------------------------
  const deletion = await execute(
    resolved,
    scenarioSql({ block, organizationId: FIXTURE_ORGANIZATION, seedFixtureOrganization: true }),
    options,
  );

  if (deletion.status !== 0) {
    failures.push(
      `deletion scenario: the block should have SUCCEEDED on a recognized row, but psql exited ${deletion.status}: ${(deletion.stderr || deletion.stdout).trim().slice(0, 400)}`,
    );
  }
  if (!deletion.stdout.includes("SEEDED=1")) {
    failures.push("deletion scenario: the fixture drawing row was not seeded.");
  }
  if (!deletion.stdout.includes("SURVIVING=0")) {
    failures.push("deletion scenario: the recognized row was NOT deleted.");
  }
  if (!/1 recognized synthetic row\(s\) deleted/.test(deletion.stdout + deletion.stderr)) {
    failures.push("deletion scenario: the block did not report exactly one recognized row.");
  }

  // ---------------------------------------------------------------------
  // 2. ABORT. An unrecognized row aborts the block AND SURVIVES.
  //
  // The surviving-row assertion is the one static reading cannot give: it is
  // the difference between "the migration raised" and "the migration raised
  // WITHOUT having already deleted something".
  // ---------------------------------------------------------------------
  const abort = await execute(
    resolved,
    scenarioSql({ block, organizationId: FOREIGN_ORGANIZATION, seedFixtureOrganization: false }),
    options,
  );

  const abortOutput = abort.stdout + abort.stderr;
  if (abort.status === 0) {
    failures.push(
      "abort scenario: the block SUCCEEDED on an unrecognized row. It must abort instead.",
    );
  }
  if (!abortOutput.includes("treatment plan drawing retirement aborted before deleting anything")) {
    failures.push("abort scenario: the expected abort message was not raised.");
  }
  if (!abortOutput.includes("are not linked to a repository synthetic fixture")) {
    failures.push("abort scenario: the abort did not report the unrecognized count.");
  }
  if (abortOutput.includes("recognized synthetic row(s) deleted")) {
    failures.push("abort scenario: the block reported a deletion despite aborting.");
  }
  if (!abortOutput.includes("SEEDED=1")) {
    failures.push("abort scenario: the unrecognized drawing row was not seeded.");
  }

  // psql aborts the whole script at the raise under ON_ERROR_STOP, so
  // `SURVIVING` never prints in the scenario above. Prove survival separately,
  // WITHOUT ON_ERROR_STOP, so execution continues past the expected raise: roll
  // back to a savepoint taken before the block and read the row count. If the
  // preflight had deleted before aborting, that count would be zero.
  const survival = await execute(
    resolved.filter((argument) => argument !== "-v" && argument !== "ON_ERROR_STOP=1"),
    `begin;
insert into public.organizations (id, legal_name, business_name, slug)
values (${uuid(FOREIGN_ORGANIZATION)}, 'Not A Fixture Inc.', 'Not A Fixture', 'not-a-fixture-org')
on conflict (id) do nothing;
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province)
values ('9f000000-0000-4000-a000-0000000000b2'::uuid, ${uuid(FOREIGN_ORGANIZATION)}, 'Harness Main 2', 'drawing-harness-main-2', 'DH2', '1 Synthetic St', 'Test City', 'Test Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id)
values ('9f000000-0000-4000-a000-0000000000c2'::uuid, ${uuid(FOREIGN_ORGANIZATION)}, 'DH-2', 'Synthetic', 'Patient', date '1990-01-01', '9f000000-0000-4000-a000-0000000000b2'::uuid);
insert into public.treatment_plans (id, organization_id, patient_id, title)
values ('9f000000-0000-4000-a000-0000000000d2'::uuid, ${uuid(FOREIGN_ORGANIZATION)}, '9f000000-0000-4000-a000-0000000000c2'::uuid, 'Harness plan 2');
alter table public.treatment_plan_drawings disable trigger treatment_plan_drawings_retired_row_guard;
insert into public.treatment_plan_drawings (organization_id, plan_id, drawing, version)
values (${uuid(FOREIGN_ORGANIZATION)}, '9f000000-0000-4000-a000-0000000000d2'::uuid, '{"strokes":[]}'::jsonb, 1);
alter table public.treatment_plan_drawings enable trigger treatment_plan_drawings_retired_row_guard;

savepoint before_block;
${block}
rollback to savepoint before_block;

select 'SURVIVED=' || count(*)::text from public.treatment_plan_drawings where organization_id = ${uuid(FOREIGN_ORGANIZATION)};
rollback;`,
    options,
  );

  const survivalOutput = survival.stdout + survival.stderr;
  if (!survivalOutput.includes("SURVIVED=1")) {
    failures.push(
      "abort scenario: the unrecognized row did NOT survive the aborted block. The preflight deleted something it did not recognize.",
    );
  }

  if (failures.length > 0) {
    throw new Error(`DRAWING_RETIREMENT_EXECUTION_FAIL\n- ${failures.join("\n- ")}`);
  }

  console.log("DRAWING_RETIREMENT_EXECUTION_PASS");
  console.log("  deletion : one recognized fixture row deleted, reported as one");
  console.log("  abort    : one unrecognized row aborted the block and SURVIVED it");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runTreatmentPlanDrawingRetirementExecutionTest().catch((error) => {
    console.error(String(error.message ?? error));
    process.exit(1);
  });
}
