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

function migrationSource(name) {
  return readFileSync(join(repositoryRoot, "supabase", "migrations", name), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

const source = migrationSource(MIGRATION);
const grants = migrationSource(GRANTS_MIGRATION);

/** Statement positions, with comment lines removed so a comment cannot pass. */
const executable = source
  .split("\n")
  .map((line) => (line.trimStart().startsWith("--") ? "" : line))
  .join("\n");

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
});
