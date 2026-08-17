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
import {
  assertR6dExecutionIsApproved,
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

  it("does not report PostgreSQL's own default PUBLIC EXECUTE the statement it first appears", () => {
    const result = assertPreFinalStatementBoundary({
      label: "boundary N (CREATE FUNCTION statement)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE] }),
      pending: [],
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
    });

    const second = assertPreFinalStatementBoundary({
      label: "boundary N+1 (still not revoked)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE] }),
      pending: first.pending,
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
    });

    const second = assertPreFinalStatementBoundary({
      label: "boundary N+1 (REVOKE statement)",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: PLATFORM_BASELINE.privileges }),
      pending: first.pending,
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
    });

    expect(result.problems.join("\n")).toContain("row level security disabled");
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
