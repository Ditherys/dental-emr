import { describe, expect, it } from "vitest";

import { TERMINAL_MIGRATIONS } from "./approved-final-grants.mjs";
import {
  ACCEPTED_BOUNDARY_EXCEPTIONS,
  assertBaselineObservesPrivileges,
  assertExaminedGrowth,
  assertFinalBoundary,
  assertPreFinalBoundary,
  assertPreFinalStatementBoundary,
  assertSnapshotUsable,
  browserReachableApprovedKeys,
  diffAgainstBaseline,
  foldPrivilegeRows,
} from "./boundary-privilege-invariant.mjs";
import { splitSqlStatements } from "./migration-privilege-lint.mjs";
import {
  assertR6dExecutionIsApproved,
  assertStatementModeFile,
  R6D_BOUNDARY_TEST_CONFIRMATION,
  resolveMode,
} from "./run-boundary-privilege-invariant.mjs";

/**
 * Synthetic snapshots. R6-D has not run; these exercise the decision logic that
 * will judge the real snapshots, so the only thing R6-D adds is the remote
 * execution itself.
 */
function snapshot({ privileges = [], examined = {}, ...rest } = {}) {
  return {
    examined: {
      schemas: 6,
      browser_roles: 2,
      tables: 11,
      columns: 120,
      sequences: 0,
      functions: 27,
      security_definer_functions: 21,
      extension_owned_objects: 400,
      ...examined,
    },
    public_tables_without_rls: [],
    security_definer_functions: [],
    privileges,
    ...rest,
  };
}

const PLATFORM_BASELINE = snapshot({
  examined: { tables: 0, columns: 0, functions: 0, security_definer_functions: 0 },
  privileges: [
    { grantee: "anon", object_class: "schema", object: "public", privilege: "usage", column: null },
    {
      grantee: "authenticated",
      object_class: "schema",
      object: "public",
      privilege: "usage",
      column: null,
    },
    { grantee: "public", object_class: "schema", object: "public", privilege: "usage", column: null },
  ],
});

const APPROVED_FINAL_PRIVILEGES = [
  ...PLATFORM_BASELINE.privileges,
  ...[
    "public.organizations",
    "public.branches",
    "public.profiles",
    "public.organization_members",
    "public.roles",
    "public.permissions",
    "public.role_permissions",
    "public.branch_memberships",
    "public.member_roles",
    "public.audit_events",
  ].map((object) => ({
    grantee: "authenticated",
    object_class: "table",
    object,
    privilege: "select",
    column: null,
  })),
  ...["display_name", "first_name", "last_name", "mobile", "avatar_object_key"].map(
    (column) => ({
      grantee: "authenticated",
      object_class: "column",
      object: "public.profiles",
      privilege: "update",
      column,
    }),
  ),
  ...[
    "private.is_active_org_member(uuid)",
    "private.has_org_permission(uuid, text)",
    "private.has_branch_access(uuid)",
    "private.has_branch_permission(uuid, text)",
    "private.is_own_organization_member(uuid)",
    "public.create_branch(uuid, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, boolean)",
    "public.set_role_permission(uuid, text, boolean)",
    "public.set_member_role(uuid, uuid, uuid, boolean)",
    "public.set_branch_membership(uuid, uuid, text)",
    "public.update_organization_member_status(uuid, text)",
    "public.record_mfa_enrollment(uuid)",
  ].map((object) => ({
    grantee: "authenticated",
    object_class: "function",
    object,
    privilege: "execute",
    column: null,
  })),
];

describe("probe row folding", () => {
  it("folds column rows into one column-scoped table entry", () => {
    const folded = foldPrivilegeRows([
      {
        grantee: "authenticated",
        object_class: "column",
        object: "public.profiles",
        privilege: "update",
        column: "mobile",
      },
      {
        grantee: "authenticated",
        object_class: "column",
        object: "public.profiles",
        privilege: "update",
        column: "display_name",
      },
    ]);

    expect(folded).toEqual([
      {
        grantee: "authenticated",
        objectClass: "table",
        object: "public.profiles",
        privilege: "update",
        columns: ["display_name", "mobile"],
      },
    ]);
  });

  it("keeps different privileges on the same object separate", () => {
    expect(
      foldPrivilegeRows([
        {
          grantee: "authenticated",
          object_class: "column",
          object: "public.profiles",
          privilege: "update",
          column: "mobile",
        },
        {
          grantee: "authenticated",
          object_class: "column",
          object: "public.profiles",
          privilege: "insert",
          column: "mobile",
        },
      ]),
    ).toHaveLength(2);
  });
});

describe("snapshot usability", () => {
  it("refuses a snapshot taken while the browser-reachable roles were not visible", () => {
    const problems = assertSnapshotUsable(
      snapshot({ examined: { browser_roles: 0 } }),
      "boundary 3",
    );

    expect(problems.join("\n")).toContain("a pass would be meaningless");
  });

  it("refuses a snapshot that examined fewer objects than the migrations create", () => {
    const problems = assertSnapshotUsable(snapshot({ examined: { tables: 2 } }), "boundary 3", {
      tables: 11,
    });

    expect(problems.join("\n")).toContain("not seeing the objects it is meant to judge");
  });

  it("refuses a platform baseline in which the probe observed nothing at all", () => {
    expect(assertBaselineObservesPrivileges(snapshot({ privileges: [] }))).toHaveLength(1);
    expect(assertBaselineObservesPrivileges(PLATFORM_BASELINE)).toEqual([]);
  });

  it("refuses a missing or malformed snapshot instead of treating it as clean", () => {
    expect(assertSnapshotUsable(undefined, "boundary 3")).toHaveLength(1);
    expect(assertSnapshotUsable({}, "boundary 3").join("\n")).toContain(
      "records nothing about what it examined",
    );
  });

  it("refuses a probe whose view of the database shrank between boundaries", () => {
    const problems = assertExaminedGrowth(
      snapshot({ examined: { tables: 11 } }),
      snapshot({ examined: { tables: 4 } }),
      "boundary 5",
    );

    expect(problems.join("\n")).toContain("examined fewer tables");
  });
});

describe("pre-final boundaries", () => {
  it("passes when a boundary adds nothing beyond the platform baseline", () => {
    expect(
      assertPreFinalBoundary({
        label: "boundary 3",
        baselineSnapshot: PLATFORM_BASELINE,
        snapshot: snapshot({ privileges: PLATFORM_BASELINE.privileges }),
      }),
    ).toEqual([]);
  });

  it("fails when a browser-reachable role gains any table privilege early", () => {
    const problems = assertPreFinalBoundary({
      label: "boundary 3",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: [
          ...PLATFORM_BASELINE.privileges,
          {
            grantee: "authenticated",
            object_class: "table",
            object: "public.role_permissions",
            privilege: "insert",
            column: null,
          },
        ],
      }),
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("public.role_permissions");
    expect(problems[0]).toContain("insert");
  });

  it("fails when a new SECURITY DEFINER function is left executable by PUBLIC", () => {
    const problems = assertPreFinalBoundary({
      label: "boundary 7",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: [
          ...PLATFORM_BASELINE.privileges,
          {
            grantee: "public",
            object_class: "function",
            object: "public.set_role_permission(uuid, text, boolean)",
            privilege: "execute",
            column: null,
          },
        ],
      }),
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("set_role_permission");
  });

  it("fails when a Data API table has RLS disabled", () => {
    const problems = assertPreFinalBoundary({
      label: "boundary 2",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: PLATFORM_BASELINE.privileges,
        public_tables_without_rls: ["public.branches"],
      }),
    });

    expect(problems.join("\n")).toContain("row level security disabled");
  });

  it("fails when a SECURITY DEFINER function has no pinned search_path", () => {
    const problems = assertPreFinalBoundary({
      label: "boundary 6",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: PLATFORM_BASELINE.privileges,
        security_definer_functions: [
          { object: "private.has_org_permission(uuid, text)", configuration: "" },
        ],
      }),
    });

    expect(problems.join("\n")).toContain("no pinned search_path");
  });

  it("accepts only the documented extension-schema exception", () => {
    expect(ACCEPTED_BOUNDARY_EXCEPTIONS).toHaveLength(1);

    expect(
      assertPreFinalBoundary({
        label: "boundary 1",
        baselineSnapshot: PLATFORM_BASELINE,
        snapshot: snapshot({
          privileges: [
            ...PLATFORM_BASELINE.privileges,
            {
              grantee: "public",
              object_class: "function",
              object: "extensions.pgtap_version()",
              privilege: "execute",
              column: null,
            },
          ],
        }),
      }),
    ).toEqual([]);

    // The same shape in an application schema is NOT excused.
    expect(
      assertPreFinalBoundary({
        label: "boundary 1",
        baselineSnapshot: PLATFORM_BASELINE,
        snapshot: snapshot({
          privileges: [
            ...PLATFORM_BASELINE.privileges,
            {
              grantee: "public",
              object_class: "function",
              object: "public.pgtap_version()",
              privilege: "execute",
              column: null,
            },
          ],
        }),
      }),
    ).toHaveLength(1);
  });
});

describe("statement-mode grace window", () => {
  const NEW_FUNCTION_EXECUTE = {
    grantee: "public",
    object_class: "function",
    object: "public.set_role_permission(uuid, text, boolean)",
    privilege: "execute",
    column: null,
  };

  const CREATE_SET_ROLE_PERMISSION = {
    type: "create",
    objectClass: "function",
    identity: "public.set_role_permission(uuid, text, boolean)",
  };

  const NOT_A_CREATE = { type: "other" };

  const NEW_MEMBER_ROLE_EXECUTE = {
    grantee: "public",
    object_class: "function",
    object: "public.set_member_role(uuid, uuid, uuid, boolean)",
    privilege: "execute",
    column: null,
  };

  const CREATE_SET_MEMBER_ROLE = {
    type: "create",
    objectClass: "function",
    identity: "public.set_member_role(uuid, uuid, uuid, boolean)",
  };

  it("does not report PostgreSQL's own default PUBLIC EXECUTE the statement it first appears", () => {
    const result = assertPreFinalStatementBoundary({
      label: "boundary N (CREATE FUNCTION statement)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE] }),
      pending: [],
      statement: CREATE_SET_ROLE_PERMISSION,
    });

    expect(result.problems).toEqual([]);
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0].key).toContain("set_role_permission");
  });

  it("reports it as a real violation if it is still present the following statement", () => {
    const first = assertPreFinalStatementBoundary({
      label: "boundary N (CREATE FUNCTION statement)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE] }),
      pending: [],
      statement: CREATE_SET_ROLE_PERMISSION,
    });

    const second = assertPreFinalStatementBoundary({
      label: "boundary N+1 (still not revoked)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE] }),
      pending: first.pending,
      statement: NOT_A_CREATE,
    });

    expect(second.problems).toHaveLength(1);
    expect(second.problems[0]).toContain("set_role_permission");
    expect(second.problems[0]).toContain("adjacent");
  });

  it("reports nothing once the adjacent REVOKE closes it by the following statement", () => {
    const first = assertPreFinalStatementBoundary({
      label: "boundary N (CREATE FUNCTION statement)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE] }),
      pending: [],
      statement: CREATE_SET_ROLE_PERMISSION,
    });

    const second = assertPreFinalStatementBoundary({
      label: "boundary N+1 (REVOKE statement)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: PLATFORM_BASELINE.privileges }),
      pending: first.pending,
      statement: NOT_A_CREATE,
    });

    expect(second.problems).toEqual([]);
    expect(second.pending).toEqual([]);
  });

  it("never treats the accepted extension-schema exception as pending", () => {
    const result = assertPreFinalStatementBoundary({
      label: "boundary N",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: [
          ...PLATFORM_BASELINE.privileges,
          {
            grantee: "public",
            object_class: "function",
            object: "extensions.pgtap_version()",
            privilege: "execute",
            column: null,
          },
        ],
      }),
      pending: [],
      statement: { type: "create", objectClass: "function", identity: "extensions.pgtap_version()" },
    });

    expect(result.problems).toEqual([]);
    expect(result.pending).toEqual([]);
  });

  it("still enforces structural expectations every statement, ungraced", () => {
    const result = assertPreFinalStatementBoundary({
      label: "boundary N",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: PLATFORM_BASELINE.privileges,
        public_tables_without_rls: ["public.branches"],
      }),
      pending: [],
      statement: NOT_A_CREATE,
    });

    expect(result.problems.join("\n")).toContain("row level security disabled");
  });

  it("does not grant grace to an unexpected privilege merely because it disappears next statement", () => {
    const UNEXPECTED_GRANT = {
      grantee: "authenticated",
      object_class: "table",
      object: "public.audit_events",
      privilege: "delete",
      column: null,
    };

    const first = assertPreFinalStatementBoundary({
      label: "boundary N (unexplained privilege appears)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, UNEXPECTED_GRANT] }),
      pending: [],
      statement: NOT_A_CREATE,
    });

    // Fails immediately, at first appearance — it must not wait a statement to
    // see whether a later REVOKE happens to clean it up.
    expect(first.problems).toHaveLength(1);
    expect(first.problems[0]).toContain("audit_events");
    expect(first.problems[0]).not.toContain("adjacent");
    expect(first.pending).toEqual([]);

    const second = assertPreFinalStatementBoundary({
      label: "boundary N+1 (removed by REVOKE)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: PLATFORM_BASELINE.privileges }),
      pending: first.pending,
      statement: NOT_A_CREATE,
    });

    // Already reported once; not re-flagged, but never silently accepted either.
    expect(second.problems).toEqual([]);
  });

  it("does not grant grace to a default privilege that does not belong to the statement just executed", () => {
    // NEW_FUNCTION_EXECUTE appears, but the statement just run created a
    // *different* function. The privilege cannot be that statement's own
    // PostgreSQL default, so it must fail immediately rather than wait.
    const result = assertPreFinalStatementBoundary({
      label: "boundary N (unrelated CREATE FUNCTION)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE] }),
      pending: [],
      statement: CREATE_SET_MEMBER_ROLE,
    });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("set_role_permission");
    expect(result.pending).toEqual([]);
  });

  it("attributes two interleaved privilege-bearing creates to their own objects independently", () => {
    // Statement 1: CREATE FUNCTION set_role_permission — its own default appears.
    const first = assertPreFinalStatementBoundary({
      label: "boundary 1 (CREATE FUNCTION set_role_permission)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE] }),
      pending: [],
      statement: CREATE_SET_ROLE_PERMISSION,
    });

    expect(first.problems).toEqual([]);
    expect(first.pending).toHaveLength(1);

    // Statement 2: a second CREATE FUNCTION, before the first's REVOKE has run.
    // Object A's grace was for exactly one statement — this next statement is
    // it, and a different CREATE intervened rather than A's own adjacent
    // REVOKE, so A is a real ADR-017 violation right here, not still-graced.
    // Object B, created by *this* statement, gets its own fresh grace.
    const second = assertPreFinalStatementBoundary({
      label: "boundary 2 (CREATE FUNCTION set_member_role)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE, NEW_MEMBER_ROLE_EXECUTE],
      }),
      pending: first.pending,
      statement: CREATE_SET_MEMBER_ROLE,
    });

    expect(second.problems).toHaveLength(1);
    expect(second.problems[0]).toContain("set_role_permission");
    expect(second.problems[0]).toContain("adjacent");
    expect(second.pending).toHaveLength(1);
    expect(second.pending[0].key).toContain("set_member_role");

    // Statement 3: object A already reported and dropped from tracking; object
    // B is now on its own "following statement" and still present, so it — and
    // only it — is reported here.
    const third = assertPreFinalStatementBoundary({
      label: "boundary 3 (still no REVOKE for set_member_role)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, NEW_MEMBER_ROLE_EXECUTE] }),
      pending: second.pending,
      statement: NOT_A_CREATE,
    });

    expect(third.problems).toHaveLength(1);
    expect(third.problems[0]).toContain("set_member_role");
    expect(third.problems[0]).not.toContain("set_role_permission");
  });
});

describe("assertStatementModeFile (per-file grace reset)", () => {
  const CREATE_SET_ROLE_PERMISSION_SQL = `
    create function public.set_role_permission(p_role_id uuid, p_permission text, p_granted boolean)
    returns void
    language plpgsql
    security definer
    set search_path = ''
    as $$ begin null; end; $$;
    revoke execute on function public.set_role_permission(uuid, text, boolean) from public;
  `;

  const NEW_FUNCTION_EXECUTE = {
    grantee: "public",
    object_class: "function",
    object: "public.set_role_permission(uuid, text, boolean)",
    privilege: "execute",
    column: null,
  };

  it("catches a function whose adjacent REVOKE never runs, by the file's own boundary check", () => {
    // Deliberately drop the REVOKE statement to prove nothing downstream
    // silently closes it: only two statements, so the grace window is
    // exhausted by the last one and never rechecked at a following statement
    // inside this function — that's the job of the caller's ungraced
    // "boundary after <file>" check, run separately after this returns.
    const source = `
      create function public.set_role_permission(p_role_id uuid, p_permission text, p_granted boolean)
      returns void
      language plpgsql
      security definer
      set search_path = ''
      as $$ begin null; end; $$;
    `;
    const statements = splitSqlStatements(source, "0100_leaves_open.sql");
    const afterCreate = snapshot({
      privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE],
    });

    const result = assertStatementModeFile({
      file: { name: "0100_leaves_open.sql" },
      statements,
      snapshots: [afterCreate],
      baselineSnapshot: PLATFORM_BASELINE,
      isTerminal: false,
      previousSnapshot: PLATFORM_BASELINE,
    });

    // Within this one-statement file, nothing has failed yet — that's correct:
    // grace for the CREATE's own default has not been checked against a
    // following statement because there isn't one in this file.
    expect(result.problems).toEqual([]);
    expect(result.previousSnapshot).toBe(afterCreate);

    // The still-open entry must be visible to the caller's own ungraced
    // "boundary after <file>" check — assertStatementModeFile does not, and
    // must not, swallow it.
    const fileBoundaryProblems = assertPreFinalBoundary({
      label: "boundary after 0100_leaves_open.sql",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: result.previousSnapshot,
    });

    expect(fileBoundaryProblems.join("\n")).toContain("set_role_permission");
  });

  it("does not carry a resolved file's grace state into the next file", () => {
    const statements = splitSqlStatements(
      CREATE_SET_ROLE_PERMISSION_SQL,
      "0100_creates_and_revokes.sql",
    );
    const afterCreate = snapshot({
      privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE],
    });
    const afterRevoke = snapshot({ privileges: PLATFORM_BASELINE.privileges });

    const firstFile = assertStatementModeFile({
      file: { name: "0100_creates_and_revokes.sql" },
      statements,
      snapshots: [afterCreate, afterRevoke],
      baselineSnapshot: PLATFORM_BASELINE,
      isTerminal: false,
      previousSnapshot: PLATFORM_BASELINE,
    });

    expect(firstFile.problems).toEqual([]);

    // A second, unrelated file whose single statement is not a CREATE at all.
    // If pending grace had leaked from the first file (a regression this test
    // exists to catch), there would be nothing pending to leak into anyway in
    // this scenario — so instead assert directly that a fresh call starts
    // clean: an entry appearing here with no matching CREATE in *this* file's
    // statement must fail immediately, not be silently treated as still
    // within some carried-over grace.
    const secondFileStatements = splitSqlStatements(
      "revoke all on table public.branches from anon;",
      "0101_unrelated.sql",
    );
    const secondFileSnapshot = snapshot({
      privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE],
    });

    const secondFile = assertStatementModeFile({
      file: { name: "0101_unrelated.sql" },
      statements: secondFileStatements,
      snapshots: [secondFileSnapshot],
      baselineSnapshot: PLATFORM_BASELINE,
      isTerminal: false,
      previousSnapshot: firstFile.previousSnapshot,
    });

    expect(secondFile.problems).toHaveLength(1);
    expect(secondFile.problems[0]).toContain("set_role_permission");
    expect(secondFile.problems[0]).not.toContain("adjacent");
  });

  it("reports assertSnapshotUsable and assertExaminedGrowth problems per statement", () => {
    const statements = splitSqlStatements(
      "revoke all on table public.branches from anon;",
      "0100_single.sql",
    );
    const previous = snapshot({ examined: { schemas: 6, tables: 11 } });
    const regressed = snapshot({
      privileges: [],
      examined: { schemas: 6, tables: 10 },
    });

    const result = assertStatementModeFile({
      file: { name: "0100_single.sql" },
      statements,
      snapshots: [regressed],
      baselineSnapshot: PLATFORM_BASELINE,
      isTerminal: false,
      previousSnapshot: previous,
    });

    expect(result.problems.join("\n")).toContain("fewer tables");
  });

  it("skips the pre-final grace assertion for the terminal file's statements", () => {
    const statements = splitSqlStatements(
      CREATE_SET_ROLE_PERMISSION_SQL,
      "9999_terminal.sql",
    );
    const afterCreate = snapshot({
      privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE],
    });

    const result = assertStatementModeFile({
      file: { name: "9999_terminal.sql" },
      statements,
      snapshots: [afterCreate, afterCreate],
      baselineSnapshot: PLATFORM_BASELINE,
      isTerminal: true,
      previousSnapshot: PLATFORM_BASELINE,
    });

    expect(result.problems).toEqual([]);
  });
});

describe("the grant-terminal boundary", () => {
  it("passes when the effective privilege set equals baseline plus the approved set", () => {
    expect(
      assertFinalBoundary({
        label: "final",
        baselineSnapshot: PLATFORM_BASELINE,
        snapshot: snapshot({ privileges: APPROVED_FINAL_PRIVILEGES }),
        terminalMigrations: TERMINAL_MIGRATIONS,
      }),
    ).toEqual([]);
  });

  it("fails on one extra effective privilege", () => {
    const problems = assertFinalBoundary({
      label: "final",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: [
          ...APPROVED_FINAL_PRIVILEGES,
          {
            grantee: "authenticated",
            object_class: "table",
            object: "public.audit_events",
            privilege: "insert",
            column: null,
          },
        ],
      }),
      terminalMigrations: TERMINAL_MIGRATIONS,
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("not in the approved final privilege set");
  });

  it("fails when the self-service column grant is one column wider than approved", () => {
    const problems = assertFinalBoundary({
      label: "final",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: [
          ...APPROVED_FINAL_PRIVILEGES,
          {
            grantee: "authenticated",
            object_class: "column",
            object: "public.profiles",
            privilege: "update",
            column: "user_id",
          },
        ],
      }),
      terminalMigrations: TERMINAL_MIGRATIONS,
    });

    // The widened column set is a different entry, so the approved one is
    // reported missing and the widened one unapproved.
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("user_id");
  });

  it("fails when an approved privilege is not effectively present", () => {
    const problems = assertFinalBoundary({
      label: "final",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: APPROVED_FINAL_PRIVILEGES.filter(
          (entry) => entry.object !== "public.audit_events",
        ),
      }),
      terminalMigrations: TERMINAL_MIGRATIONS,
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("does not grant it effectively");
  });

  it("does not expect server-only service_role grants from a browser-role probe", () => {
    const approved = browserReachableApprovedKeys(TERMINAL_MIGRATIONS);

    expect([...approved.keys()].some((key) => key.startsWith("service_role"))).toBe(false);
    expect(approved.size).toBe(22);
  });
});

describe("the R6-D execution gate", () => {
  it("refuses to run without the explicit approval argument", () => {
    expect(() =>
      assertR6dExecutionIsApproved([], {
        R6D_BOUNDARY_TEST_CONFIRMATION: R6D_BOUNDARY_TEST_CONFIRMATION,
      }),
    ).toThrow(/R6-D has not been approved/);
  });

  it("refuses to run without the exact target confirmation", () => {
    expect(() => assertR6dExecutionIsApproved(["--approved-r6d"], {})).toThrow(
      /does not authorize/,
    );

    expect(() =>
      assertR6dExecutionIsApproved(["--approved-r6d"], {
        R6D_BOUNDARY_TEST_CONFIRMATION: "yes",
      }),
    ).toThrow(/does not authorize/);
  });

  it("passes only when both gates are satisfied deliberately", () => {
    expect(() =>
      assertR6dExecutionIsApproved(["--approved-r6d"], {
        R6D_BOUNDARY_TEST_CONFIRMATION: R6D_BOUNDARY_TEST_CONFIRMATION,
      }),
    ).not.toThrow();
  });

  it("offers only the two reviewed replay modes", () => {
    expect(resolveMode([])).toBe("file");
    expect(resolveMode(["--mode=statement"])).toBe("statement");
    expect(() => resolveMode(["--mode=whatever"])).toThrow(/--mode must be/);
  });
});

describe("baseline diffing", () => {
  it("reports privileges removed from the platform baseline as well as added", () => {
    const { added, removed } = diffAgainstBaseline(
      PLATFORM_BASELINE,
      snapshot({ privileges: PLATFORM_BASELINE.privileges.slice(0, 1) }),
    );

    expect(added).toEqual([]);
    expect(removed).toHaveLength(2);
  });
});
