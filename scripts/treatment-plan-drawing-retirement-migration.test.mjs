import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The migration contract for the one migration in this plan that deletes
 * clinical-adjacent rows.
 *
 * These are STATIC assertions about the migration text, and that is the point:
 * the guarantee being proved is an ORDERING guarantee inside a single
 * transactional file. A behavioural test can show that a bad row was not
 * deleted; only reading the file can show that the abort is positioned where
 * no deletion can have happened yet. pgTAP proves the resulting state
 * separately, in supabase/tests/treatment_plan_drawing_retirement.test.sql.
 *
 * Every check here fails closed: an unrecognized shape is a failure, never a
 * skip.
 */

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

const MIGRATION = "20260901010500_retire_treatment_plan_drawings.sql";
const GRANTS_MIGRATION = "20260901010501_retire_treatment_plan_drawings_grants.sql";
const SWEEP_MIGRATION = "20260901010502_retire_treatment_plan_drawings_locked_sweep.sql";

function migrationSource(name) {
  return readFileSync(join(repositoryRoot, "supabase", "migrations", name), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

const source = migrationSource(MIGRATION);
const grants = migrationSource(GRANTS_MIGRATION);
const sweepSource = migrationSource(SWEEP_MIGRATION);

/** Statement positions, with comment lines removed so a comment cannot pass. */
function executableOf(text) {
  return text
    .split("\n")
    .map((line) => (line.trimStart().startsWith("--") ? "" : line))
    .join("\n");
}

const executable = executableOf(source);
const sweep = executableOf(sweepSource);

function indexOfOrFail(haystack, needle) {
  const at = haystack.indexOf(needle);
  expect(at, `the migration must contain ${JSON.stringify(needle)}`).toBeGreaterThanOrEqual(0);
  return at;
}

describe("the treatment-plan drawing retirement migration", () => {
  it("deletes from exactly one table, once", () => {
    const deletes = executable.match(/\bdelete\s+from\s+[a-z_.]+/gi) ?? [];
    expect(deletes).toEqual(["delete from public.treatment_plan_drawings"]);
  });

  it("runs the fail-closed preflight BEFORE the delete", () => {
    const preflightCount = indexOfOrFail(executable, "into v_unrecognized");
    const abort = indexOfOrFail(
      executable,
      "treatment plan drawing retirement aborted before deleting anything",
    );
    const deletion = indexOfOrFail(executable, "delete from public.treatment_plan_drawings");

    // The count, then the abort, then - and only then - the delete.
    expect(preflightCount).toBeLessThan(abort);
    expect(abort).toBeLessThan(deletion);
  });

  it("aborts the whole migration on a single unrecognized row", () => {
    const guard = /if\s+v_unrecognized\s*>\s*0\s+then\s+raise\s+exception/i;
    expect(executable).toMatch(guard);
    // No conditional that would let the delete proceed for "the rest".
    expect(executable).not.toMatch(/delete\s+from\s+public\.treatment_plan_drawings\s+where/i);
  });

  it("recognizes a row only through the two deterministic synthetic fixtures", () => {
    // A positive rule: the count is of rows that do NOT match a fixture.
    expect(executable).toMatch(/where\s+not\s+exists\s*\(/i);
    expect(executable).toContain("'22000000-0000-0000-0000-000000000001'::uuid");
    expect(executable).toContain("'smilelab-demo-dental'");
    expect(executable).toContain("'SmileLab Demo Dental (Synthetic)'");
    expect(executable).toContain("'22000000-0000-0000-0000-000000000002'::uuid");
    expect(executable).toContain("'other-dental-demo'");
    expect(executable).toContain("'Other Dental Demo (Synthetic)'");
    // Identity is matched on id AND slug AND legal name together.
    expect(executable).toMatch(/\(fixture\.id,\s*fixture\.slug,\s*fixture\.legal_name\)\s+in\s*\(/i);
    // And the plan must resolve inside the row's own organization.
    expect(executable).toMatch(/plan\.organization_id\s*=\s*drawing\.organization_id/i);
  });

  it("reports counts and never drawing content", () => {
    // The deletion block is the only place that touches rows. It counts and
    // joins on keys; `drawing.drawing` is the content column and must not
    // appear there at all. (The projection blocks below quote it inside the
    // anchors they DELETE from three function bodies, which is the opposite
    // of exposing it.)
    const block = /\$migration\$([\s\S]*?)\$migration\$/.exec(executable);
    expect(block, "the deletion block must be delimited by $migration$").not.toBeNull();
    expect(block[1]).not.toMatch(/drawing\.drawing/);
    expect(block[1]).not.toMatch(/\bjsonb\b/i);

    for (const reporting of block[1].match(/raise\s+(?:notice|exception)[\s\S]*?;/gi) ?? []) {
      // Only bigint counters may be interpolated into a message.
      for (const interpolated of reporting.match(/v_[a-z_]+/g) ?? []) {
        expect(["v_unrecognized", "v_recognized"]).toContain(interpolated);
      }
    }
    expect(block[1]).toMatch(/raise\s+notice[\s\S]*?v_recognized/i);
  });

  it("seals the tombstone only after the delete, so its own delete is possible", () => {
    const deletion = indexOfOrFail(executable, "delete from public.treatment_plan_drawings");
    const guardFunction = indexOfOrFail(
      executable,
      "create function private.reject_treatment_plan_drawing_mutation()",
    );
    const rowTrigger = indexOfOrFail(executable, "create trigger treatment_plan_drawings_retired_row_guard");
    expect(deletion).toBeLessThan(guardFunction);
    expect(guardFunction).toBeLessThan(rowTrigger);
  });

  it("refuses every mutation on the tombstone, including truncate", () => {
    expect(executable).toMatch(/before\s+insert\s+or\s+update\s+or\s+delete\s+on\s+public\.treatment_plan_drawings/i);
    expect(executable).toMatch(/before\s+truncate\s+on\s+public\.treatment_plan_drawings/i);
    expect(executable).toContain("raise insufficient_privilege using message = 'treatment plan drawings are retired'");
  });

  it("does not drop the table in this window", () => {
    expect(executable).not.toMatch(/drop\s+table/i);
    expect(executable).not.toMatch(/drop\s+function\s+public\.save_treatment_plan_drawing/i);
  });

  it("grants nothing and revokes the one browser door", () => {
    expect(grants).not.toMatch(/^\s*grant\s/im);
    expect(grants).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.save_treatment_plan_drawing\(uuid,\s*uuid,\s*integer,\s*jsonb\)\s+from\s+anon,\s*authenticated,\s*service_role,\s*public;/i,
    );
    expect(grants).toMatch(
      /revoke\s+all\s+on\s+table\s+public\.treatment_plan_drawings\s+from\s+anon,\s*authenticated,\s*service_role,\s*public;/i,
    );
  });

  it("normalizes carriage returns on both sides of every guarded replace", () => {
    const guards = executable.match(/pg_get_functiondef\([\s\S]*?\);/g) ?? [];
    expect(guards.length).toBe(3);
    for (const guard of guards) expect(guard).toContain("chr(13)");
    // Each anchor literal is stripped too, or a CRLF checkout cannot match it.
    const anchors = executable.match(/\$anchor\$[\s\S]*?\$anchor\$[^;]*/g) ?? [];
    expect(anchors.length).toBe(3);
    for (const anchor of anchors) expect(anchor).toContain("chr(13)");
  });

  it("proves each replaced projection stopped reading the retired table", () => {
    const proofs = executable.match(/still reads the retired drawing table/g) ?? [];
    expect(proofs.length).toBe(3);
  });

  it("re-runs the identical recognition rule in the locked sweep", () => {
    // REVIEW I1. The sweep must not be an opportunity to quietly relax the
    // rule. Compare the predicate itself, whitespace-normalized.
    const predicate = (text) => {
      const match = /where not exists \(([\s\S]*?)\n  \);/.exec(text);
      expect(match, "the recognition predicate must be findable").not.toBeNull();
      return match[1].replaceAll(/\s+/g, " ").trim();
    };
    expect(predicate(sweep)).toBe(predicate(executable));
  });
});

describe("the locked sweep that closes the TOCTOU window", () => {
  it("takes an ACCESS EXCLUSIVE lock BEFORE the count and the delete", () => {
    const lock = sweep.indexOf(
      "lock table public.treatment_plan_drawings in access exclusive mode;",
    );
    const count = sweep.indexOf("into v_unrecognized");
    const abort = sweep.indexOf(
      "treatment plan drawing retirement aborted before deleting anything",
    );
    const deletion = sweep.indexOf("delete from public.treatment_plan_drawings");

    expect(lock, "the sweep must take the lock").toBeGreaterThanOrEqual(0);
    expect(count).toBeGreaterThanOrEqual(0);
    expect(deletion).toBeGreaterThanOrEqual(0);

    // Lock, then count, then abort, then - only then - delete.
    expect(lock).toBeLessThan(count);
    expect(count).toBeLessThan(abort);
    expect(abort).toBeLessThan(deletion);
  });

  it("takes the lock as the first statement in the block", () => {
    const block = /\$migration\$([\s\S]*?)\$migration\$/.exec(sweep);
    expect(block).not.toBeNull();
    // Everything before `begin` is the DECLARE section, which executes
    // nothing. The first executable statement is what matters.
    const body = block[1].slice(block[1].indexOf("\nbegin\n") + "\nbegin\n".length);
    const statements = body
      .split(";")
      .map((statement) => statement.replaceAll(/\s+/g, " ").trim())
      .filter((statement) => statement !== "");
    expect(statements[0]).toBe(
      "lock table public.treatment_plan_drawings in access exclusive mode",
    );
  });

  it("suspends the row guard only inside the locked transaction, and restores it", () => {
    const disable = sweep.indexOf("disable trigger treatment_plan_drawings_retired_row_guard");
    const enable = sweep.indexOf("enable trigger treatment_plan_drawings_retired_row_guard");
    const lock = sweep.indexOf("in access exclusive mode");
    const deletion = sweep.indexOf("delete from public.treatment_plan_drawings");
    expect(lock).toBeLessThan(disable);
    expect(disable).toBeLessThan(deletion);
    expect(deletion).toBeLessThan(enable);
  });

  it("deletes from exactly one table, once, with no WHERE clause", () => {
    const deletes = sweep.match(/\bdelete\s+from\s+[a-z_.]+/gi) ?? [];
    expect(deletes).toEqual(["delete from public.treatment_plan_drawings"]);
    expect(sweep).not.toMatch(/delete\s+from\s+public\.treatment_plan_drawings\s+where/i);
  });

  it("does not edit the applied migration it supersedes", () => {
    // The fix is forward-only: 20260901010500 must still contain its own
    // preflight and delete, unlocked, exactly as it was applied.
    expect(executable).toContain("delete from public.treatment_plan_drawings");
    expect(executable).not.toContain("in access exclusive mode");
  });

  it("records the deploy ordering the revoke needs", () => {
    expect(sweepSource).toMatch(/DEPLOY NOTE/);
    expect(sweepSource).toMatch(/20260901010501[\s\S]{0,120}BEFORE[\s\S]{0,40}20260901010500/);
  });
});
