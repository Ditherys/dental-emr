/**
 * R6-D boundary privilege invariant — assertion logic.
 *
 * AUTHORED IN R6-B. NOT YET EXECUTED AGAINST ANY DATABASE.
 *
 * This module contains no I/O. It takes snapshots produced by
 * `supabase/verification/r6d/boundary-privilege-snapshot.sql` and decides
 * whether a migration boundary satisfies the ADR-017 grant-last invariant, so
 * the decision logic is unit-testable offline and only the remote execution
 * remains for R6-D.
 *
 * THE COMPARISON IS RELATIVE TO A MEASURED PLATFORM BASELINE.
 *
 * A hosted Supabase project already holds privileges nobody in this repository
 * granted — USAGE on schemas, privileges on `auth`, `storage`, and `graphql`
 * objects, and so on. Hard-coding a guess at that set would be wrong the moment
 * Supabase changed it. So R6-D snapshots the project BEFORE applying any
 * baseline migration, treats that as the platform baseline, and asserts:
 *
 *   at every boundary before the grant-terminal migration
 *       effective privileges == platform baseline          (nothing added)
 *
 *   at the grant-terminal migration
 *       effective privileges == platform baseline + the approved grant set
 *
 * `service_role` is deliberately not probed. ADR-017 §5 scopes the invariant to
 * roles reachable from a browser holding a publishable key.
 */

import { canonicalGrantKey, normalizeObjectIdentity } from "./migration-privilege-lint.mjs";

export const BOUNDARY_PROBE_FILE =
  "supabase/verification/r6d/boundary-privilege-snapshot.sql";

export const LIVE_AUTHORIZATION_PROBE_FILE =
  "supabase/verification/r6d/live-authorization-probe.sql";

export const PROBED_GRANTEES = Object.freeze(["public", "anon", "authenticated"]);

/**
 * Privileges that appear at a pre-final boundary and are accepted anyway.
 *
 * Each is an explicit, reasoned exception, not a silence. Keep this list as
 * close to empty as the architecture allows; every entry weakens what a passing
 * R6-D run proves.
 */
export const ACCEPTED_BOUNDARY_EXCEPTIONS = Object.freeze([
  Object.freeze({
    id: "extension-schema-public-execute",
    matches: (entry) =>
      entry.grantee === "public" &&
      entry.objectClass === "function" &&
      entry.object.startsWith("extensions."),
    reason:
      "Extension-owned functions are created with PUBLIC EXECUTE by the extension itself and cannot be revoked object-by-object by the baseline. The `extensions` schema is not exposed through the Data API. Governed instead by the approved-extension list in scripts/approved-final-grants.mjs; ADR-017 records removing pgTAP from the canonical baseline as an open decision.",
  }),
]);

/* -------------------------------------------------------------------------- */
/* Snapshot normalization                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Folds raw probe rows into canonical grant entries.
 *
 * Column rows for the same (grantee, object, privilege) collapse into one
 * table-class entry carrying a sorted column list, which is the same shape the
 * approved grant list uses, so the two are directly comparable.
 */
export function foldPrivilegeRows(rows) {
  const columnGroups = new Map();
  const entries = [];

  for (const row of rows) {
    const grantee = String(row.grantee).toLowerCase();
    const privilege = String(row.privilege).toLowerCase();
    const object = String(row.object);

    if (row.object_class === "column") {
      const key = `${grantee}|${object}|${privilege}`;
      const group = columnGroups.get(key) ?? {
        grantee,
        objectClass: "table",
        object,
        privilege,
        columns: [],
      };
      group.columns.push(String(row.column));
      columnGroups.set(key, group);
      continue;
    }

    entries.push({
      grantee,
      objectClass: String(row.object_class),
      object,
      privilege,
      columns: [],
    });
  }

  for (const group of columnGroups.values()) {
    entries.push({ ...group, columns: group.columns.toSorted() });
  }

  return entries;
}

export function snapshotEntryMap(snapshot) {
  const map = new Map();

  for (const entry of foldPrivilegeRows(snapshot.privileges ?? [])) {
    map.set(canonicalGrantKey(entry), entry);
  }

  return map;
}

function isAccepted(entry) {
  return ACCEPTED_BOUNDARY_EXCEPTIONS.some((exception) => exception.matches(entry));
}

/* -------------------------------------------------------------------------- */
/* Usability — a broken probe must never read as a clean result                */
/* -------------------------------------------------------------------------- */

/**
 * Rejects a snapshot that cannot support a conclusion.
 *
 * The failure mode this exists to prevent: a probe that silently returns nothing
 * — because a role did not exist, a schema was filtered out, or the query
 * errored into an empty result — looks exactly like a perfectly fail-closed
 * database.
 */
export function assertSnapshotUsable(snapshot, label, expected = {}) {
  const problems = [];

  if (!snapshot || typeof snapshot !== "object") {
    return [`${label}: the probe returned no snapshot object.`];
  }

  if (!Array.isArray(snapshot.privileges)) {
    problems.push(`${label}: the snapshot has no privileges array.`);
  }

  const examined = snapshot.examined;

  if (!examined || typeof examined !== "object") {
    return [...problems, `${label}: the snapshot records nothing about what it examined.`];
  }

  if (examined.browser_roles !== 2) {
    problems.push(
      `${label}: the probe found ${examined.browser_roles} of the 2 browser-reachable roles (anon, authenticated). ` +
        "Every has_*_privilege result would be empty, so a pass would be meaningless.",
    );
  }

  if (!(examined.schemas > 0)) {
    problems.push(`${label}: the probe examined no schemas.`);
  }

  if (expected.tables !== undefined && examined.tables < expected.tables) {
    problems.push(
      `${label}: the probe examined ${examined.tables} tables but the migrations applied so far create at least ${expected.tables}. The probe is not seeing the objects it is meant to judge.`,
    );
  }

  if (expected.functions !== undefined && examined.functions < expected.functions) {
    problems.push(
      `${label}: the probe examined ${examined.functions} functions but the migrations applied so far create at least ${expected.functions}.`,
    );
  }

  if (
    expected.securityDefinerFunctions !== undefined &&
    examined.security_definer_functions < expected.securityDefinerFunctions
  ) {
    problems.push(
      `${label}: the probe found ${examined.security_definer_functions} SECURITY DEFINER functions but the migrations applied so far create at least ${expected.securityDefinerFunctions}.`,
    );
  }

  return problems;
}

/**
 * The platform baseline must show that the probe can actually observe
 * privileges. A hosted Supabase project always grants the browser-reachable
 * roles something (schema USAGE at minimum); an empty baseline means the probe
 * is blind, not that the project is locked down.
 */
export function assertBaselineObservesPrivileges(snapshot) {
  const entries = foldPrivilegeRows(snapshot.privileges ?? []);

  if (entries.length === 0) {
    return [
      "platform baseline: the probe observed zero privileges for PUBLIC, anon, and authenticated. " +
        "A hosted project always grants these roles something, so this indicates a blind probe rather than a locked-down project. Refusing to treat later boundaries as verified.",
    ];
  }

  return [];
}

export function assertExaminedGrowth(previous, current, label) {
  if (!previous) {
    return [];
  }

  const problems = [];

  for (const field of ["tables", "functions", "schemas", "columns"]) {
    if (current.examined[field] < previous.examined[field]) {
      problems.push(
        `${label}: the probe examined fewer ${field} (${current.examined[field]}) than at the previous boundary (${previous.examined[field]}). Migrations only add objects, so the probe's view changed unexpectedly.`,
      );
    }
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* The invariant                                                               */
/* -------------------------------------------------------------------------- */

export function diffAgainstBaseline(baselineSnapshot, snapshot) {
  const baseline = snapshotEntryMap(baselineSnapshot);
  const current = snapshotEntryMap(snapshot);

  const added = [];
  const removed = [];

  for (const [key, entry] of current) {
    if (!baseline.has(key)) {
      added.push({ key, entry });
    }
  }

  for (const [key, entry] of baseline) {
    if (!current.has(key)) {
      removed.push({ key, entry });
    }
  }

  return { added, removed };
}

/**
 * Every boundary before the grant-terminal migration must hold no privilege
 * beyond the measured platform baseline.
 */
export function assertPreFinalBoundary({ label, baselineSnapshot, snapshot }) {
  const problems = [];
  const { added } = diffAgainstBaseline(baselineSnapshot, snapshot);

  for (const { key, entry } of added) {
    if (isAccepted(entry)) {
      continue;
    }

    problems.push(
      `${label}: a browser-reachable role holds "${key}", which did not exist in the platform baseline. ` +
        "Before the grant-terminal migration every boundary must be strictly more restrictive than the final state (ADR-017 §2).",
    );
  }

  problems.push(...assertStructuralExpectations(label, snapshot));

  return problems;
}

/**
 * Object classes for which PostgreSQL itself grants a default privilege to
 * PUBLIC at the instant of CREATE, before any adjacent REVOKE can run. This is
 * the exhaustive list of PostgreSQL's own automatic grants for objects the
 * baseline creates; it is not a policy choice and must not be extended to
 * cover anything ADR-017 actually expects the migration author to avoid.
 *
 * https://www.postgresql.org/docs/current/ddl-priv.html — "Whenever an object
 * is created, it is assigned an owner... PUBLIC represents the notion of
 * 'all roles, including those that might be created later'. ... EXECUTE
 * privilege for functions and procedures is granted to PUBLIC by default."
 *
 * The live probe (`boundary-privilege-snapshot.sql`) does not read ACL text —
 * it asks PostgreSQL what each role can effectively do (`has_function_privilege`
 * for `anon`/`authenticated`; `aclexplode` for PUBLIC). A privilege held by
 * PUBLIC is, by PostgreSQL's ACL semantics, held by every role, `anon` and
 * `authenticated` included — that is not a Supabase-specific or
 * project-specific fact, it is what "PUBLIC" means. So the single PostgreSQL
 * default above surfaces as three effective-privilege rows in the probe's
 * output, not one: `public`/execute, `anon`/execute, `authenticated`/execute,
 * all naming the same object. All three are listed explicitly rather than
 * deriving `anon`/`authenticated` from the `public` entry at match time, so
 * this remains a flat, exhaustive, auditable table.
 */
const KNOWN_CREATION_DEFAULT_PRIVILEGES = Object.freeze([
  Object.freeze({
    objectClass: "function",
    grantee: "public",
    privilege: "execute",
  }),
  Object.freeze({
    objectClass: "function",
    grantee: "anon",
    privilege: "execute",
  }),
  Object.freeze({
    objectClass: "function",
    grantee: "authenticated",
    privilege: "execute",
  }),
  Object.freeze({
    objectClass: "procedure",
    grantee: "public",
    privilege: "execute",
  }),
  Object.freeze({
    objectClass: "procedure",
    grantee: "anon",
    privilege: "execute",
  }),
  Object.freeze({
    objectClass: "procedure",
    grantee: "authenticated",
    privilege: "execute",
  }),
]);

/**
 * DELIBERATELY NOT COVERED: Supabase's `ALTER DEFAULT PRIVILEGES` on newly
 * created tables (ADR-017 §2, §4). Unlike the function/procedure PUBLIC
 * EXECUTE default above, that grant is not a PostgreSQL-wide constant — it is
 * a per-project, `FOR ROLE`-scoped configuration whose effective grantees and
 * privileges depend on which role actually creates the object during
 * `supabase db push`, a fact ADR-017 §4 records as unverified until R6-C/R6-D
 * execute against a real database. Hardcoding a guess here would be exactly
 * the "policy choice" this list's own contract forbids, and would silently
 * paper over a table-creation transient the invariant exists to catch. If a
 * live R6-D run observes such a transient, the correct fix is to measure it
 * (e.g. `pg_default_acl` for the creating role) and compute grace from that
 * measurement — not to extend this table by guesswork. Until then, statement
 * mode fails closed on any newly observed table privilege, adjacent-REVOKE or
 * not, which is the intended behavior, not a defect.
 */

/**
 * True only when `entry` is exactly the PostgreSQL-automatic default
 * privilege created by `statement` on the object `statement` just created —
 * not merely any newly observed privilege. All of the following must hold:
 *
 *   1. `statement` is a qualifying object creation (CREATE FUNCTION/PROCEDURE
 *      with a resolved identity);
 *   2. `entry` names that same object, by canonical identity;
 *   3. the (objectClass, grantee, privilege) triple is a documented
 *      PostgreSQL default for that object class, per
 *      KNOWN_CREATION_DEFAULT_PRIVILEGES above; and
 *   4. for an `anon`/`authenticated` entry, the SAME statement's newly-added
 *      set also contains the correlated PUBLIC EXECUTE row for the same
 *      object.
 *
 * Requirement 4 exists because an effective `anon`/`authenticated` privilege
 * does not by itself prove PUBLIC granted it — PostgreSQL also permits a
 * direct GRANT to those roles, role-inheritance effects, or an `ALTER DEFAULT
 * PRIVILEGES` on functions/routines (not just tables). The only fact ADR-017
 * treats as a PostgreSQL constant is "CREATE FUNCTION grants PUBLIC EXECUTE,"
 * which surfaces in the probe as three correlated rows (public/anon/
 * authenticated) for one object. Grace is for that correlated trio, observed
 * together, not for any row that merely has the right shape in isolation — an
 * anon/authenticated row without its PUBLIC sibling in the same statement's
 * diff is not evidence of the PostgreSQL default and must fail immediately.
 *
 * Anything else — an explicit GRANT, a side effect of a DO block, a default
 * privilege on a class PostgreSQL does not actually auto-grant — is not a
 * default this function recognizes, however "adjacent" its later removal is.
 */
export function isKnownCreationDefaultPrivilege(statement, entry, siblingEntries = []) {
  if (!statement || statement.type !== "create" || !statement.identity) {
    return false;
  }

  const known = KNOWN_CREATION_DEFAULT_PRIVILEGES.find(
    (candidate) =>
      candidate.objectClass === statement.objectClass &&
      candidate.objectClass === entry.objectClass &&
      candidate.grantee === entry.grantee &&
      candidate.privilege === entry.privilege,
  );

  if (!known) {
    return false;
  }

  const sameObject =
    normalizeObjectIdentity(entry.objectClass, entry.object) ===
    normalizeObjectIdentity(statement.objectClass, statement.identity);

  if (!sameObject) {
    return false;
  }

  if (entry.grantee === "public") {
    return true;
  }

  return siblingEntries.some(
    (sibling) =>
      sibling.grantee === "public" &&
      sibling.objectClass === entry.objectClass &&
      sibling.privilege === entry.privilege &&
      normalizeObjectIdentity(sibling.objectClass, sibling.object) ===
        normalizeObjectIdentity(entry.objectClass, entry.object),
  );
}

/**
 * Statement-mode counterpart to assertPreFinalBoundary for a non-terminal
 * file's INNER statement-by-statement snapshots only. The file's own
 * "boundary after <file>" snapshot must still go through the full, ungraced
 * assertPreFinalBoundary — this function must never be substituted for that.
 *
 * WHY A GRACE WINDOW EXISTS, AND WHY IT IS NARROW
 *
 * ADR-017 §2 requires every object to have its inherited/default privileges
 * revoked "adjacent to the CREATE" — the very next statement — because SQL has
 * no atomic CREATE+REVOKE. PostgreSQL grants EXECUTE on every new function to
 * PUBLIC at the instant of CREATE. Statement-mode replay therefore observes
 * that exact grant at exactly one statement boundary for every function the
 * baseline creates: the snapshot taken right after its CREATE and right
 * before its own adjacent REVOKE. That is the invariant working as designed —
 * ADR-017 promises "adjacent," not "the same statement," because the latter is
 * not expressible in SQL. It is not a boundary defect.
 *
 * Grace is therefore given to a specific, narrow claim — "the statement I just
 * executed is a CREATE FUNCTION/PROCEDURE, and this added entry is exactly
 * PostgreSQL's own PUBLIC EXECUTE default on the object that statement just
 * created" (isKnownCreationDefaultPrivilege) — never to "some privilege was
 * added and something later removed it." A newly added entry that is not that
 * specific default is reported as a violation immediately, at the boundary
 * where it first appears, rather than waiting a statement to see whether it
 * happens to get cleaned up. An entry that does qualify but is still present
 * at the FOLLOWING statement snapshot did not close adjacently and is
 * reported as a real violation, exactly where ADR-017's "adjacent" promise was
 * actually broken. Grace never spans a file boundary: callers must start
 * `pending` fresh for each file, and the unmodified boundary-after-file check
 * (using the full, ungraced assertPreFinalBoundary) still catches any entry
 * left open at file end.
 *
 * "NEWLY ADDED" IS RELATIVE TO THE PRECEDING STATEMENT, NOT TO THE BASELINE
 *
 * `previousSnapshot` must be the snapshot taken immediately before the
 * statement now being judged — the caller's running per-statement cursor, not
 * the platform baseline and not "whatever isn't currently pending." Sibling
 * correlation and grace eligibility are both computed from
 * `diffAgainstBaseline(previousSnapshot, snapshot)`: only a key that is absent
 * from the immediately preceding statement's snapshot and present in this
 * one counts as new here. This matters because an already-reported violation
 * — one that failed grace at an earlier statement and was therefore never
 * added to `pending` — remains present in every later snapshot (nothing
 * revoked it) and therefore remains present in `baselineSnapshot`-relative
 * `added` forever. Deriving "newly added" from "not already pending" (as
 * opposed to "not already in the previous snapshot") let that stale violation
 * re-enter the newly-added set at a later, unrelated statement boundary and
 * serve as a false correlated PUBLIC sibling — or, if a later CREATE OR
 * REPLACE happened to target the very same object, get its own rows
 * mistakenly re-graced into `pending` as if they were that later statement's
 * fresh default. Anchoring to the preceding statement's actual snapshot
 * instead means a key already present before this statement ran is never
 * "newly added" here, however it is later disposed of by the
 * pending/currentKeys check above.
 */
export function assertPreFinalStatementBoundary({
  label,
  baselineSnapshot,
  previousSnapshot,
  snapshot,
  pending,
  statement,
}) {
  const { added } = diffAgainstBaseline(baselineSnapshot, snapshot);
  const notAccepted = added.filter(({ entry }) => !isAccepted(entry));
  const currentKeys = new Set(notAccepted.map(({ key }) => key));

  const problems = pending
    .filter(({ key }) => currentKeys.has(key))
    .map(
      ({ key }) =>
        `${label}: a browser-reachable role still holds "${key}" at the statement following the one ` +
        'where it first appeared. ADR-017 §2 requires the revoke to be the statement "adjacent to the ' +
        'CREATE" — this privilege was not closed by then.',
    );

  const { added: addedSinceLastStatement } = diffAgainstBaseline(previousSnapshot, snapshot);
  const addedSinceLastStatementKeys = new Set(addedSinceLastStatement.map(({ key }) => key));
  const newlyAdded = notAccepted.filter(({ key }) => addedSinceLastStatementKeys.has(key));
  const newlyAddedEntries = newlyAdded.map(({ entry }) => entry);
  const nextPending = [];

  for (const candidate of newlyAdded) {
    if (isKnownCreationDefaultPrivilege(statement, candidate.entry, newlyAddedEntries)) {
      nextPending.push(candidate);
      continue;
    }

    problems.push(
      `${label}: a browser-reachable role holds "${candidate.key}", which did not exist in the platform ` +
        "baseline and is not a known PostgreSQL default privilege created by the statement just executed. " +
        "Before the grant-terminal migration every boundary must be strictly more restrictive than the " +
        "final state (ADR-017 §2).",
    );
  }

  problems.push(...assertStructuralExpectations(label, snapshot));

  return { problems, pending: nextPending };
}

/**
 * At the grant-terminal migration the effective privilege set must equal the
 * platform baseline plus exactly the approved grants — no more, no less.
 */
export function assertFinalBoundary({
  label,
  baselineSnapshot,
  snapshot,
  terminalMigrations,
}) {
  const problems = [];
  const { added } = diffAgainstBaseline(baselineSnapshot, snapshot);
  const approved = browserReachableApprovedKeys(terminalMigrations);
  const seen = new Set();

  for (const { key, entry } of added) {
    if (isAccepted(entry)) {
      continue;
    }

    seen.add(key);

    if (!approved.has(key)) {
      problems.push(
        `${label}: a browser-reachable role effectively holds "${key}", which is not in the approved final privilege set.`,
      );
    }
  }

  for (const [key, grant] of approved) {
    if (!seen.has(key)) {
      problems.push(
        `${label}: the approved final privilege set expects "${key}" (${grant.reason ?? "no reason recorded"}) but the database does not grant it effectively. ` +
          "Either the migration did not apply as reviewed, or the approved list no longer describes the real boundary.",
      );
    }
  }

  problems.push(...assertStructuralExpectations(label, snapshot));

  return problems;
}

/**
 * Structural properties every boundary must hold, independent of the privilege
 * diff: no Data API table without RLS, and no definer-rights function without a
 * pinned search_path.
 */
export function assertStructuralExpectations(label, snapshot) {
  const problems = [];

  for (const table of snapshot.public_tables_without_rls ?? []) {
    problems.push(
      `${label}: table ${table} is in the Data API schema but has row level security disabled.`,
    );
  }

  for (const routine of snapshot.security_definer_functions ?? []) {
    if (!/search_path=/.test(routine.configuration ?? "")) {
      problems.push(
        `${label}: SECURITY DEFINER function ${routine.object} has no pinned search_path, so its body resolves unqualified names through the caller's search_path.`,
      );
    }
  }

  return problems;
}

/**
 * The approved grants that the probe can actually observe. service_role grants
 * are excluded because ADR-017 §5 scopes the invariant to browser-reachable
 * roles and the probe does not inspect server-only roles.
 */
export function browserReachableApprovedKeys(terminalMigrations) {
  const keys = new Map();

  for (const terminal of terminalMigrations) {
    for (const grant of terminal.grants) {
      if (!PROBED_GRANTEES.includes(grant.grantee.toLowerCase())) {
        continue;
      }

      keys.set(canonicalGrantKey(grant), grant);
    }
  }

  return keys;
}
