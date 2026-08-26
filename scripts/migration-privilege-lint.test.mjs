import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  APPROVED_EXTENSIONS,
  MIGRATIONS_DIRECTORY,
  TERMINAL_MIGRATIONS,
} from "./approved-final-grants.mjs";
import {
  canonicalGrantKey,
  classifyStatement,
  deriveArgumentTypes,
  lintMigrations,
  parsePrivilegeStatement,
  splitSqlStatements,
  SqlParseError,
  tokenizeSql,
} from "./migration-privilege-lint.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const migrationsDirectory = join(repositoryRoot, ...MIGRATIONS_DIRECTORY.split("/"));
const fixtureDirectory = join(
  repositoryRoot,
  "scripts",
  "fixtures",
  "migration-privilege-lint",
);

const FIXTURE_MARKER = "FIXTURE_NOT_A_MIGRATION";
const PATIENT_PERMISSION_OBJECT_MIGRATION =
  "20260819010000_patient_permission_contract.sql";

function readFixture(name) {
  return readFileSync(join(fixtureDirectory, name), "utf8");
}

function readActiveMigrations() {
  return readdirSync(migrationsDirectory)
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      source: readFileSync(join(migrationsDirectory, name), "utf8"),
    }));
}

/* -------------------------------------------------------------------------- */
/* The fixture world                                                           */
/* -------------------------------------------------------------------------- */

const FIXTURE_OBJECTS_FILE = "20990101000000_fixture_objects.sql";
const FIXTURE_MIDDLE_FILE = "20990101000050_fixture_middle.sql";
const FIXTURE_FINAL_FILE = "20990101000100_fixture_final_grants.sql";

const FIXTURE_TERMINALS = [
  {
    file: FIXTURE_FINAL_FILE,
    grants: [
      {
        grantee: "authenticated",
        objectClass: "table",
        object: "public.fixture_roles",
        privilege: "select",
        columns: [],
        reason: "RLS-filtered read.",
      },
      {
        grantee: "authenticated",
        objectClass: "table",
        object: "public.fixture_roles",
        privilege: "update",
        columns: ["fixture_display_name"],
        reason: "Self-service display name only.",
      },
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "fixture_private.fixture_guard(uuid)",
        privilege: "execute",
        columns: [],
        reason: "Policy expression evaluation.",
      },
    ],
  },
];

const FIXTURE_EXTENSIONS = [{ name: "pgtap", reason: "Fixture parity." }];

/** Builds a fixture migration set, optionally with a middle or terminal file. */
function fixtureSet({ middle, finalFile = "safe-final-grants.sql" } = {}) {
  const files = [
    { name: FIXTURE_OBJECTS_FILE, source: readFixture("safe-objects.sql") },
  ];

  if (middle) {
    files.push({ name: FIXTURE_MIDDLE_FILE, source: readFixture(middle) });
  }

  files.push({ name: FIXTURE_FINAL_FILE, source: readFixture(finalFile) });

  return files;
}

function lintFixture(options) {
  return lintMigrations({
    files: fixtureSet(options),
    terminalMigrations: FIXTURE_TERMINALS,
    approvedExtensions: FIXTURE_EXTENSIONS,
  });
}

function rulesOf(result) {
  return result.violations.map((violation) => violation.rule).sort();
}

/* -------------------------------------------------------------------------- */

describe("SQL statement splitting", () => {
  it("does not treat text inside comments, strings, or dollar-quoted bodies as SQL", () => {
    const statements = splitSqlStatements(
      [
        "-- grant insert on public.roles to authenticated;",
        "/* nested /* block */ grant all on x to anon; */",
        "select 'a semicolon ; and a quote '' inside' as sample;",
        "create or replace function f() returns void language plpgsql as $tag$",
        "begin perform 1; end;",
        "$tag$;",
      ].join("\n"),
    );

    expect(statements).toHaveLength(2);
    expect(statements[0].sanitized).toMatch(/^select ''.* as sample$/);
    expect(statements[1].sanitized).toContain("$tag$$tag$");
    expect(statements[1].bodies[0].text).toContain("perform 1");
  });

  it("reports the line each statement starts on", () => {
    const statements = splitSqlStatements("\n\n-- header\nselect 1;\n\nselect 2;\n");

    expect(statements.map((statement) => statement.line)).toEqual([4, 6]);
  });

  it("throws rather than guessing when input is malformed", () => {
    expect(() => splitSqlStatements("select $$ unterminated;", "x.sql")).toThrow(
      SqlParseError,
    );
    expect(() => splitSqlStatements("select 'unterminated;", "x.sql")).toThrow(
      SqlParseError,
    );
    expect(() => splitSqlStatements("/* unterminated", "x.sql")).toThrow(
      SqlParseError,
    );
    expect(() => splitSqlStatements("select 1", "x.sql")).toThrow(
      /not terminated by a semicolon/,
    );
  });

  it("does not mistake positional parameters or identifiers for dollar quotes", () => {
    const statements = splitSqlStatements("select $1, a$b from t;");

    expect(statements).toHaveLength(1);
    expect(statements[0].bodies).toHaveLength(0);
  });
});

describe("privilege statement parsing", () => {
  it("models table, column, function, schema, and sequence privileges", () => {
    expect(
      parsePrivilegeStatement("grant select, update (a, b) on public.t to authenticated"),
    ).toMatchObject({
      ok: true,
      kind: "grant",
      objectClass: "table",
      objects: ["public.t"],
      privileges: [
        { privilege: "select", columns: [] },
        { privilege: "update", columns: ["a", "b"] },
      ],
      grantees: ["authenticated"],
    });

    expect(
      parsePrivilegeStatement("grant execute on function private.f(uuid, text) to anon"),
    ).toMatchObject({
      ok: true,
      objectClass: "function",
      objects: ["private.f(uuid,text)"],
      grantees: ["anon"],
    });

    expect(parsePrivilegeStatement("grant usage on schema private to public")).toMatchObject({
      ok: true,
      objectClass: "schema",
      objects: ["private"],
      grantees: ["public"],
    });

    expect(
      parsePrivilegeStatement("grant usage, select on sequence public.s to authenticated"),
    ).toMatchObject({ ok: true, objectClass: "sequence", objects: ["public.s"] });
  });

  it("does not confuse the `public` schema of an object with the PUBLIC grantee", () => {
    const model = parsePrivilegeStatement(
      "revoke all on table public.organizations from public, anon, authenticated",
    );

    expect(model.objects).toEqual(["public.organizations"]);
    expect(model.grantees).toEqual(["public", "anon", "authenticated"]);
  });

  it("recognizes wildcard and role-membership forms", () => {
    expect(
      parsePrivilegeStatement("grant all on all tables in schema public to authenticated"),
    ).toMatchObject({ ok: true, objectClass: "all tables in schema" });

    expect(parsePrivilegeStatement("grant admin_role to authenticated")).toMatchObject({
      ok: true,
      isRoleMembership: true,
      grantees: ["authenticated"],
    });
  });

  it("refuses forms it cannot fully model instead of ignoring them", () => {
    expect(parsePrivilegeStatement("grant select on public.t")).toMatchObject({ ok: false });
    expect(
      parsePrivilegeStatement("grant execute on function public.f to authenticated"),
    ).toMatchObject({ ok: false });
    expect(
      parsePrivilegeStatement("grant all on foreign server s to authenticated"),
    ).toMatchObject({ ok: false });
  });
});

describe("function signature derivation", () => {
  it("derives the type-only signature a REVOKE must name", () => {
    expect(
      deriveArgumentTypes(
        tokenizeSql("target_organization_id uuid, branch_name text default 'x', flag boolean"),
      ),
    ).toEqual(["uuid", "text", "boolean"]);
  });

  it("excludes OUT parameters and keeps multi-word types intact", () => {
    expect(deriveArgumentTypes(tokenizeSql("a uuid, out b text, c double precision"))).toEqual([
      "uuid",
      "double precision",
    ]);
    expect(deriveArgumentTypes(tokenizeSql("timestamp with time zone"))).toEqual([
      "timestamp with time zone",
    ]);
  });

  it("matches a created function to its revoke through the derived signature", () => {
    const [creation] = splitSqlStatements(
      "create or replace function public.f(a uuid, b text default 'x') returns void language sql as $$ select $$;",
    ).map(classifyStatement);

    expect(creation.identity).toBe("public.f(uuid,text)");
  });
});

describe("grant canonicalization", () => {
  it("ignores whitespace and column order but not column membership", () => {
    const written = canonicalGrantKey({
      grantee: "authenticated",
      objectClass: "function",
      object: "public.create_branch(uuid, text,  numeric)",
      privilege: "EXECUTE",
      columns: [],
    });

    expect(written).toBe(canonicalGrantKey({
      grantee: "AUTHENTICATED",
      objectClass: "function",
      object: "public.create_branch(uuid,text,numeric)",
      privilege: "execute",
      columns: [],
    }));

    expect(
      canonicalGrantKey({
        grantee: "authenticated",
        objectClass: "table",
        object: "public.profiles",
        privilege: "update",
        columns: ["b", "a"],
      }),
    ).not.toBe(
      canonicalGrantKey({
        grantee: "authenticated",
        objectClass: "table",
        object: "public.profiles",
        privilege: "update",
        columns: ["a", "b", "c"],
      }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Requirement 1 — the current baseline passes                                 */
/* -------------------------------------------------------------------------- */

describe("the active migration chain", () => {
  const files = readActiveMigrations();

  it("satisfies the grant-last invariant", () => {
    const result = lintMigrations({
      files,
      terminalMigrations: TERMINAL_MIGRATIONS,
      approvedExtensions: APPROVED_EXTENSIONS,
    });

    expect(result.violations).toEqual([]);
  });

  it("is actually inspected, not trivially skipped", () => {
    const result = lintMigrations({
      files,
      terminalMigrations: TERMINAL_MIGRATIONS,
      approvedExtensions: APPROVED_EXTENSIONS,
    });

    expect(result.checked.files).toBe(70);
    expect(result.checked.statements).toBeGreaterThan(250);
    expect(result.checked.privilegeStatements).toBeGreaterThan(100);
  });

  it("parses every object the baseline is documented to contain", () => {
    const classified = files.flatMap((file) =>
      splitSqlStatements(file.source, file.name).map(classifyStatement),
    );
    const created = classified.filter((statement) => statement.type === "create");

    const count = (objectClass) =>
      created.filter((statement) => statement.objectClass === objectClass).length;

expect(count("table")).toBe(38);
    expect(count("function")).toBe(117);
    expect(count("policy")).toBe(25);
    // btree_gist (P6-05) is the sole approved production extension; it backs the
    // reservation-ledger exclusion constraints. pgTAP is still provisioned only
    // into non-production projects.
    expect(count("extension")).toBe(1);
    expect(
      created.filter((statement) => statement.securityDefiner === true).length,
    ).toBe(95);
    expect(
      created.filter(
        (statement) =>
          statement.objectClass === "function" && statement.hasEmptySearchPath !== true,
      ),
    ).toEqual([]);
  });

  it("keeps every synthetic violation fixture out of the active migration chain", () => {
    for (const file of files) {
      expect(file.source).not.toContain(FIXTURE_MARKER);
    }

    for (const name of readdirSync(fixtureDirectory)) {
      expect(readFileSync(join(fixtureDirectory, name), "utf8")).toContain(
        FIXTURE_MARKER,
      );
    }
  });

  it("opens P2-01 with the complete contiguous pre-revoke block", () => {
    const migration = files.find(
      ({ name }) => name === PATIENT_PERMISSION_OBJECT_MIGRATION,
    );
    expect(migration).toBeDefined();

    const firstStatements = splitSqlStatements(
      migration.source,
      migration.name,
    ).slice(0, 5);
    const expectedObjects = [
      "private.validate_workforce_invitation_scope(uuid,uuid,uuid,uuid)",
      "public.list_workforce_invitation_options(uuid)",
      "public.prepare_workforce_invitation(uuid,uuid,uuid,text,uuid,uuid)",
      "public.finalize_workforce_invitation(uuid,uuid,uuid)",
      "public.set_member_role(uuid,uuid,uuid,boolean)",
    ];

    expect(firstStatements).toHaveLength(expectedObjects.length);
    firstStatements.forEach((statement, index) => {
      expect(parsePrivilegeStatement(statement.sanitized)).toMatchObject({
        ok: true,
        kind: "revoke",
        objectClass: "function",
        objects: [expectedObjects[index]],
        privileges: [{ privilege: "all", columns: [] }],
        grantees: ["public", "anon", "authenticated", "service_role"],
      });
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Requirement 5 — the fixture world's approved final grants pass              */
/* -------------------------------------------------------------------------- */

describe("the safe fixture set", () => {
  it("passes with no violations", () => {
    expect(lintFixture().violations).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Requirements 2, 3, 6, 7 — pre-final violations                              */
/* -------------------------------------------------------------------------- */

describe("pre-final boundary violations", () => {
  it("fails on an administrative table DML grant before the terminal migration", () => {
    const result = lintFixture({ middle: "violation-pre-final-table-dml.sql" });

    expect(rulesOf(result)).toEqual(["grant-outside-terminal-migration"]);
    expect(result.violations[0].message).toContain("browser-reachable: authenticated");
    expect(result.violations[0].file).toBe(FIXTURE_MIDDLE_FILE);
  });

  it("fails on a SECURITY DEFINER function whose default PUBLIC EXECUTE is never revoked", () => {
    const result = lintFixture({
      middle: "violation-security-definer-public-execute.sql",
    });

    expect(rulesOf(result)).toEqual(["security-definer-not-fail-closed"]);
    expect(result.violations[0].message).toContain("public, anon, authenticated");
  });

  it("fails on a table that never revokes its inherited default privileges", () => {
    expect(rulesOf(lintFixture({ middle: "violation-table-not-fail-closed.sql" }))).toEqual([
      "creation-not-fail-closed",
    ]);
  });

  it("fails on a definer-rights function without a pinned search_path", () => {
    expect(rulesOf(lintFixture({ middle: "violation-missing-search-path.sql" }))).toEqual([
      "function-search-path",
    ]);
  });

  it("fails on a Data API table created without row level security", () => {
    expect(rulesOf(lintFixture({ middle: "violation-missing-rls.sql" }))).toEqual([
      "public-table-without-rls",
    ]);
  });
});

describe("bypass attempts that name no privilege and no object", () => {
  it("fails on a role-membership grant to a browser-reachable role", () => {
    expect(rulesOf(lintFixture({ middle: "violation-role-membership.sql" }))).toEqual([
      "role-membership-grant",
    ]);
  });

  it("fails on ALTER DEFAULT PRIVILEGES", () => {
    expect(rulesOf(lintFixture({ middle: "violation-default-privileges.sql" }))).toEqual([
      "alter-default-privileges",
    ]);
  });

  it("fails on a privilege statement built at run time inside a DO block", () => {
    expect(rulesOf(lintFixture({ middle: "violation-dynamic-grant.sql" }))).toEqual([
      "dynamic-privilege-statement",
    ]);
  });

  it("fails on a wildcard grant over every table in the API schema", () => {
    const result = lintFixture({ finalFile: "final-violation-wildcard-grant.sql" });

    expect(rulesOf(result)).toEqual(["unapproved-grant"]);
    expect(result.violations[0].message).toContain("all tables in schema");
  });
});

/* -------------------------------------------------------------------------- */
/* Requirement 4 — the terminal migration is not a free pass                   */
/* -------------------------------------------------------------------------- */

describe("terminal migration allowlist", () => {
  it("fails on an unapproved grant even though it occurs in the terminal migration", () => {
    const result = lintFixture({ finalFile: "final-violation-extra-grant.sql" });

    expect(rulesOf(result)).toEqual(["unapproved-grant"]);
    expect(result.violations[0].message).toContain("delete");
  });

  it("fails on a column-scoped grant widened by exactly one column", () => {
    const result = lintFixture({ finalFile: "final-violation-widened-columns.sql" });

    expect(rulesOf(result)).toEqual(["missing-approved-grant", "unapproved-grant"]);
  });

  it("fails when the migration drops a privilege the approved list still records", () => {
    const result = lintFixture({ finalFile: "final-violation-dropped-grant.sql" });

    expect(rulesOf(result)).toEqual(["missing-approved-grant"]);
  });

  it("fails when a registered terminal migration is renamed or deleted", () => {
    const result = lintMigrations({
      files: [{ name: FIXTURE_OBJECTS_FILE, source: readFixture("safe-objects.sql") }],
      terminalMigrations: FIXTURE_TERMINALS,
      approvedExtensions: FIXTURE_EXTENSIONS,
    });

    expect(rulesOf(result)).toContain("terminal-migration-missing");
  });
});

/* -------------------------------------------------------------------------- */
/* Requirement 7 — parser and checker failures fail closed                     */
/* -------------------------------------------------------------------------- */

describe("fail-closed behaviour", () => {
  it("reports a violation rather than skipping an unparseable migration", () => {
    const result = lintFixture({ middle: "violation-unterminated-body.sql" });

    expect(rulesOf(result)).toEqual(["parse-error"]);
    expect(result.violations[0].message).toContain("fails closed");
  });

  it("reports a violation for an empty migration instead of a vacuous pass", () => {
    const result = lintMigrations({
      files: [
        { name: FIXTURE_OBJECTS_FILE, source: "-- nothing here\n" },
        { name: FIXTURE_FINAL_FILE, source: readFixture("safe-final-grants.sql") },
      ],
      terminalMigrations: FIXTURE_TERMINALS,
      approvedExtensions: FIXTURE_EXTENSIONS,
    });

    expect(rulesOf(result)).toContain("empty-migration");
  });

  it("reports a violation for a privilege statement the parser cannot model", () => {
    const result = lintMigrations({
      files: [
        {
          name: FIXTURE_OBJECTS_FILE,
          source: "grant all on foreign server anything to authenticated;\n",
        },
        { name: FIXTURE_FINAL_FILE, source: readFixture("safe-final-grants.sql") },
      ],
      terminalMigrations: FIXTURE_TERMINALS,
      approvedExtensions: FIXTURE_EXTENSIONS,
    });

    expect(rulesOf(result)).toContain("unparseable-privilege-statement");
  });

  it("reports a violation for an object class it does not model", () => {
    const result = lintMigrations({
      files: [
        {
          name: FIXTURE_OBJECTS_FILE,
          source: "create foreign table public.remote_patients ();\n",
        },
        { name: FIXTURE_FINAL_FILE, source: readFixture("safe-final-grants.sql") },
      ],
      terminalMigrations: FIXTURE_TERMINALS,
      approvedExtensions: FIXTURE_EXTENSIONS,
    });

    expect(rulesOf(result)).toContain("unmodelled-object-creation");
  });

  it("reports a violation for an extension outside the approved list", () => {
    const result = lintMigrations({
      files: [
        {
          name: FIXTURE_OBJECTS_FILE,
          source: "create extension if not exists http with schema extensions;\n",
        },
        { name: FIXTURE_FINAL_FILE, source: readFixture("safe-final-grants.sql") },
      ],
      terminalMigrations: FIXTURE_TERMINALS,
      approvedExtensions: FIXTURE_EXTENSIONS,
    });

    expect(rulesOf(result)).toContain("unapproved-extension");
  });

  it("refuses a grant whose target is not schema-qualified", () => {
    const result = lintMigrations({
      files: [
        { name: FIXTURE_OBJECTS_FILE, source: readFixture("safe-objects.sql") },
        {
          name: FIXTURE_FINAL_FILE,
          source: "grant select on fixture_roles to authenticated;\n",
        },
      ],
      terminalMigrations: FIXTURE_TERMINALS,
      approvedExtensions: FIXTURE_EXTENSIONS,
    });

    expect(rulesOf(result)).toContain("unqualified-grant-target");
  });

  it("refuses WITH GRANT OPTION", () => {
    const result = lintMigrations({
      files: [
        { name: FIXTURE_OBJECTS_FILE, source: readFixture("safe-objects.sql") },
        {
          name: FIXTURE_FINAL_FILE,
          source:
            "grant select on table public.fixture_roles to authenticated with grant option;\n",
        },
      ],
      terminalMigrations: FIXTURE_TERMINALS,
      approvedExtensions: FIXTURE_EXTENSIONS,
    });

    expect(rulesOf(result)).toContain("grant-option");
  });
});

/* -------------------------------------------------------------------------- */
/* The approved list itself                                                    */
/* -------------------------------------------------------------------------- */

describe("the approved final privilege set", () => {
  it("documents a reason for every approved privilege", () => {
    for (const terminal of TERMINAL_MIGRATIONS) {
      for (const grant of terminal.grants) {
        expect(grant.reason ?? "").not.toBe("");
      }
    }

    for (const extension of APPROVED_EXTENSIONS) {
      expect(extension.reason ?? "").not.toBe("");
    }
  });

  // R6-C1 / ADR-018. The empty list is the enforcement mechanism, so a test
  // must fail if a later change quietly re-approves an extension without the
  // review that entry represents.
  it("approves exactly the btree_gist extension in the canonical baseline", () => {
    expect(APPROVED_EXTENSIONS).toEqual([
      {
        name: "btree_gist",
        reason:
          "Provides the uuid `=` operator class required by the reservation-ledger partial GiST exclusion constraints (P6-05) that reject provider/resource double booking at the database level.",
      },
    ]);
  });

  it("refuses pgTAP if it is ever reintroduced into a migration", () => {
    const result = lintMigrations({
      files: [
        {
          name: FIXTURE_OBJECTS_FILE,
          source: "create extension if not exists pgtap with schema extensions;\n",
        },
        { name: FIXTURE_FINAL_FILE, source: readFixture("safe-final-grants.sql") },
      ],
      terminalMigrations: FIXTURE_TERMINALS,
      approvedExtensions: APPROVED_EXTENSIONS,
    });

    expect(rulesOf(result)).toContain("unapproved-extension");
  });

  it("grants browser-reachable roles no write privilege beyond the profiles self-service columns", () => {
    const writes = TERMINAL_MIGRATIONS.flatMap((terminal) => terminal.grants).filter(
      (grant) =>
        ["public", "anon", "authenticated"].includes(grant.grantee) &&
        ["insert", "update", "delete", "truncate", "all"].includes(grant.privilege),
    );

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      grantee: "authenticated",
      object: "public.profiles",
      privilege: "update",
    });
    expect(writes[0].columns.toSorted()).toEqual([
      "avatar_object_key",
      "display_name",
      "first_name",
      "last_name",
      "mobile",
    ]);
  });

  it("grants anon and PUBLIC nothing at all", () => {
    const exposed = TERMINAL_MIGRATIONS.flatMap((terminal) => terminal.grants).filter(
      (grant) => ["anon", "public"].includes(grant.grantee),
    );

    expect(exposed).toEqual([]);
  });
});
