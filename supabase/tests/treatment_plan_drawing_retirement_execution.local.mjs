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
 *             deleted, and the block reports exactly one row.
 *   ABORT     a drawing on a plan in a THIRD, non-fixture organization aborts
 *             the block with the expected message, having DELETED NOTHING.
 *   TEETH     the same abort checks, run against a block deliberately mutated
 *             to delete BEFORE aborting, must fail.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. It cannot prove "the row survived" by
 * counting rows after the abort. A `DO` block is a single statement, so
 * PostgreSQL rolls back its partial effects whatever happened inside it: a
 * post-abort count reports the seeded state by construction and reads the same
 * whether the block aborted before deleting, deleted and then aborted, or never
 * ran. Such a check tests the engine, not this migration. An earlier version of
 * this harness contained exactly that check, and it could not fail.
 *
 * What IS observable is whether a delete ever EXECUTED. A `raise notice` from a
 * BEFORE DELETE trigger reaches the client the moment it is raised and is not
 * undone by the rollback, so the probe reports what the block actually did.
 * That, together with the static `abort < delete` ordering assertion in
 * scripts/treatment-plan-drawing-retirement-migration.test.mjs, is what carries
 * the weight - and the TEETH scenario is what proves those checks can fail.
 *
 * It also exercises what static reading is weakest on: PostgreSQL's
 * row-constructor `IN` semantics and the cross-organization join.
 *
 * The SQL is EXTRACTED FROM THE MIGRATION FILE, never retyped, so the file
 * stays the single source of truth and this harness cannot drift into testing
 * a copy that no longer matches what ships.
 *
 * Run directly:
 *   node supabase/tests/treatment_plan_drawing_retirement_execution.local.mjs
 *
 * All data is synthetic. No drawing content is ever logged: the harness asserts
 * on row COUNTS, on the abort message, and on the probe's notice.
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

-- THE DELETE PROBE. A NOTICE is written to the client the moment it is raised
-- and is NOT undone by the rollback that follows, so it is the one signal that
-- survives an aborted block. Row counts do not: a DO block is a single
-- statement, so PostgreSQL rolls back its partial effects whatever the block
-- did, and reading the table afterwards therefore reports the seeded state by
-- construction. This trigger reports what the block ACTUALLY DID.
--
-- The block suspends only treatment_plan_drawings_retired_row_guard by name,
-- so this probe stays armed throughout it.
create function public.harness_drawing_delete_probe()
returns trigger language plpgsql as $probe$
begin
  raise notice 'HARNESS_ROW_DELETED';
  return old;
end;
$probe$;

create trigger harness_drawing_delete_probe
before delete on public.treatment_plan_drawings
for each row execute function public.harness_drawing_delete_probe();

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

/**
 * Runs the abort scenario against `block` and returns everything wrong with it.
 * Returning failures rather than throwing is what lets the teeth check below
 * run the SAME checks against a deliberately broken block and require them to
 * fire.
 */
async function abortScenarioFailures(block, command, options) {
  const failures = [];
  const abort = await execute(
    command,
    scenarioSql({ block, organizationId: FOREIGN_ORGANIZATION, seedFixtureOrganization: false }),
    options,
  );
  const output = abort.stdout + abort.stderr;

  if (!output.includes("SEEDED=1")) {
    failures.push("abort scenario: the unrecognized drawing row was not seeded.");
    return failures; // nothing below means anything without the row.
  }
  if (abort.status === 0) {
    failures.push(
      "abort scenario: the block SUCCEEDED on an unrecognized row. It must abort instead.",
    );
  }
  if (!output.includes("treatment plan drawing retirement aborted before deleting anything")) {
    failures.push("abort scenario: the expected abort message was not raised.");
  }
  if (!output.includes("are not linked to a repository synthetic fixture")) {
    failures.push("abort scenario: the abort did not report the unrecognized count.");
  }
  if (output.includes("recognized synthetic row(s) deleted")) {
    failures.push("abort scenario: the block reported a deletion despite aborting.");
  }
  // THE ONE THAT MATTERS: the probe fires per deleted row, whatever the
  // transaction does afterwards.
  if (output.includes("HARNESS_ROW_DELETED")) {
    failures.push(
      "abort scenario: the block deleted a row before aborting. An unrecognized row was removed.",
    );
  }
  return failures;
}

/**
 * Moves the delete ahead of the abort, which is precisely the defect the whole
 * fail-closed design exists to prevent. Fails closed if the anchor is not
 * found: a mutation that did not apply would make the teeth check vacuous.
 */
export function mutateDeleteBeforeAbort(block) {
  const anchor = "  if v_unrecognized > 0 then";
  if (!block.includes(anchor)) {
    throw new Error("Could not find the abort guard to mutate; the teeth check would be vacuous.");
  }
  const mutated = block.replace(
    anchor,
    `  delete from public.treatment_plan_drawings;\n${anchor}`,
  );
  if (mutated === block) {
    throw new Error("The delete-before-abort mutation did not apply.");
  }
  return mutated;
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
  // 2. ABORT. An unrecognized row aborts the block, and the block deletes
  //    NOTHING on its way there.
  //
  //    "The row survived" is deliberately NOT asserted by counting rows
  //    afterwards. A `DO` block is a single statement, so PostgreSQL rolls
  //    back its partial effects whatever happened inside it; a post-abort
  //    count reports the seeded state by construction and would read the same
  //    whether the block aborted before deleting, deleted and then aborted, or
  //    never ran at all. That check would test the engine, not this migration.
  //
  //    What IS observable is whether a delete ever EXECUTED, because the probe
  //    trigger's NOTICE reaches the client the moment it is raised and is not
  //    undone by the rollback. That, plus the static `abort < delete` ordering
  //    assertion in
  //    scripts/treatment-plan-drawing-retirement-migration.test.mjs, is what
  //    actually carries the weight here.
  // ---------------------------------------------------------------------
  failures.push(...(await abortScenarioFailures(block, resolved, options)));

  // ---------------------------------------------------------------------
  // 3. THE HARNESS HAS TEETH. Mutate the extracted block so the delete runs
  //    BEFORE the abort, and require that the abort checks above turn red.
  //    A harness that stays green on a migration that deletes what it does
  //    not recognize is worse than no harness.
  // ---------------------------------------------------------------------
  const mutated = mutateDeleteBeforeAbort(block);
  const mutantFailures = await abortScenarioFailures(mutated, resolved, options);
  if (mutantFailures.length === 0) {
    failures.push(
      "teeth check: a block mutated to DELETE BEFORE ABORTING passed the abort checks. The checks above prove nothing.",
    );
  } else if (!mutantFailures.some((failure) => failure.includes("deleted a row"))) {
    failures.push(
      `teeth check: the mutant was caught, but not by the delete probe, so the probe is not what is catching it: ${mutantFailures.join("; ")}`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`DRAWING_RETIREMENT_EXECUTION_FAIL\n- ${failures.join("\n- ")}`);
  }

  console.log("DRAWING_RETIREMENT_EXECUTION_PASS");
  console.log("  deletion : one recognized fixture row deleted, reported as one");
  console.log("  abort    : one unrecognized row aborted the block, deleting nothing");
  console.log(
    `  teeth    : a delete-before-abort mutant was caught (${mutantFailures.length} failure(s))`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runTreatmentPlanDrawingRetirementExecutionTest().catch((error) => {
    console.error(String(error.message ?? error));
    process.exit(1);
  });
}
