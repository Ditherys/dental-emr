/**
 * R6-B static migration privilege lint.
 *
 * Enforces the ADR-017 grant-last fail-closed invariant over the ACTIVE files in
 * `supabase/migrations/`, so the H2 class of defect (an intermediate migration
 * boundary at which a browser-reachable role holds administrative write
 * capability) cannot be reintroduced silently.
 *
 * The checker deliberately does NOT work by grepping for `GRANT INSERT`. It
 * tokenizes each migration into statements, parses the privilege statements into
 * a structured model, and evaluates rules over that model:
 *
 *   - table privileges          (GRANT/REVOKE ... ON [TABLE] ...)
 *   - column privileges         (GRANT SELECT (a, b) ..., GRANT UPDATE (a) ...)
 *   - schema privileges         (GRANT USAGE ON SCHEMA ...)
 *   - sequence privileges       (GRANT ... ON SEQUENCE ...)
 *   - function/procedure EXECUTE
 *   - PUBLIC / anon / authenticated as grantees, including implicit PUBLIC
 *   - ALTER DEFAULT PRIVILEGES
 *   - wildcard GRANT ... ON ALL <objects> IN SCHEMA ...
 *   - role-membership grants (GRANT authenticated TO ...)
 *   - SECURITY DEFINER creation fail-closure and `set search_path = ''`
 *   - privilege statements built dynamically inside function bodies / DO blocks
 *
 * Fail-closed posture: anything the parser cannot fully understand in a
 * privilege-relevant position is reported as a violation. The checker never
 * "passes" because it failed to parse something.
 */

export const BROWSER_REACHABLE_GRANTEES = Object.freeze([
  "public",
  "anon",
  "authenticated",
]);

/**
 * Object classes that carry an ACL and are therefore privilege-bearing. Creating
 * one of these opens a privilege window that must be closed in the same file,
 * before the next privilege-bearing object is created.
 */
const PRIVILEGE_BEARING_CREATIONS = Object.freeze([
  "table",
  "view",
  "materialized view",
  "function",
  "procedure",
  "schema",
  "sequence",
]);

/**
 * Creations with no ACL of their own. Indexes, triggers, and policies cannot
 * grant access to a role; they are recorded but impose no revoke obligation.
 */
const NON_PRIVILEGE_CREATIONS = Object.freeze([
  "index",
  "unique index",
  "trigger",
  "policy",
  "type",
  "domain",
]);

const PRIVILEGE_WORDS = Object.freeze([
  "all",
  "select",
  "insert",
  "update",
  "delete",
  "truncate",
  "references",
  "trigger",
  "maintain",
  "execute",
  "usage",
  "create",
  "connect",
  "temporary",
  "temp",
  "set",
  "alter",
]);

/**
 * Matches a privilege statement in a position where only free text is expected
 * (a PL/pgSQL body, a DO block, a dynamic EXECUTE string). Requires a privilege
 * keyword after GRANT so ordinary identifiers such as `grant_permission
 * boolean` and `grant_role boolean` are not false positives.
 */
const DYNAMIC_PRIVILEGE_PATTERN =
  /\b(?:grant|revoke)\s+(?:all|select|insert|update|delete|truncate|references|trigger|maintain|execute|usage|create|connect|temporary|temp)\b|\balter\s+default\s+privileges\b/i;

const MULTI_WORD_TYPE_PREFIXES = Object.freeze([
  ["double", "precision"],
  ["character", "varying"],
  ["bit", "varying"],
  ["time", "with", "time", "zone"],
  ["time", "without", "time", "zone"],
  ["timestamp", "with", "time", "zone"],
  ["timestamp", "without", "time", "zone"],
]);

export class SqlParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "SqlParseError";
  }
}

/* -------------------------------------------------------------------------- */
/* Statement splitting                                                         */
/* -------------------------------------------------------------------------- */

const DOLLAR_TAG_PATTERN =
  /^\$([A-Za-z_-￿][A-Za-z0-9_-￿]*)?\$/;

function isIdentifierCharacter(character) {
  return character !== undefined && /[A-Za-z0-9_$]/.test(character);
}

/**
 * Splits SQL into statements while tracking line comments, block comments
 * (nested), single-quoted strings, quoted identifiers, and dollar-quoted bodies.
 *
 * Each statement carries:
 *   raw        — original text, used only for reporting
 *   sanitized  — comments removed and string/dollar bodies emptied, so keyword
 *                matching can never be fooled by text inside a literal
 *   bodies     — dollar-quoted body text, scanned separately for dynamic SQL
 *   literals   — single-quoted string contents, also scanned for dynamic SQL
 */
export function splitSqlStatements(source, filename = "<source>") {
  const statements = [];

  let index = 0;
  let line = 1;
  let raw = "";
  let sanitized = "";
  let bodies = [];
  let literals = [];
  let startLine = null;

  const beginStatement = () => {
    if (startLine === null) {
      startLine = line;
    }
  };

  const flush = () => {
    if (sanitized.trim() !== "") {
      statements.push({
        raw: raw.trim(),
        sanitized: sanitized.trim(),
        bodies,
        literals,
        line: startLine ?? line,
      });
    }

    raw = "";
    sanitized = "";
    bodies = [];
    literals = [];
    startLine = null;
  };

  while (index < source.length) {
    const character = source[index];

    if (character === "-" && source[index + 1] === "-") {
      let end = source.indexOf("\n", index);
      end = end === -1 ? source.length : end;
      raw += source.slice(index, end);
      sanitized += " ";
      index = end;
      continue;
    }

    if (character === "/" && source[index + 1] === "*") {
      let depth = 0;
      let cursor = index;

      while (cursor < source.length) {
        if (source[cursor] === "/" && source[cursor + 1] === "*") {
          depth += 1;
          cursor += 2;
          continue;
        }

        if (source[cursor] === "*" && source[cursor + 1] === "/") {
          depth -= 1;
          cursor += 2;

          if (depth === 0) {
            break;
          }

          continue;
        }

        if (source[cursor] === "\n") {
          line += 1;
        }

        cursor += 1;
      }

      if (depth !== 0) {
        throw new SqlParseError(
          `${filename}: unterminated block comment starting at line ${line}.`,
        );
      }

      raw += source.slice(index, cursor);
      sanitized += " ";
      index = cursor;
      continue;
    }

    if (character === "'") {
      beginStatement();
      let cursor = index + 1;

      for (;;) {
        if (cursor >= source.length) {
          throw new SqlParseError(
            `${filename}: unterminated string literal starting at line ${startLine ?? line}.`,
          );
        }

        if (source[cursor] === "'") {
          if (source[cursor + 1] === "'") {
            cursor += 2;
            continue;
          }

          cursor += 1;
          break;
        }

        if (source[cursor] === "\n") {
          line += 1;
        }

        cursor += 1;
      }

      const literal = source.slice(index, cursor);
      literals.push({ text: literal.slice(1, -1).replaceAll("''", "'"), line: startLine ?? line });
      raw += literal;
      sanitized += "''";
      index = cursor;
      continue;
    }

    if (character === '"') {
      beginStatement();
      let cursor = index + 1;

      for (;;) {
        if (cursor >= source.length) {
          throw new SqlParseError(
            `${filename}: unterminated quoted identifier starting at line ${startLine ?? line}.`,
          );
        }

        if (source[cursor] === '"') {
          if (source[cursor + 1] === '"') {
            cursor += 2;
            continue;
          }

          cursor += 1;
          break;
        }

        if (source[cursor] === "\n") {
          line += 1;
        }

        cursor += 1;
      }

      const text = source.slice(index, cursor);
      raw += text;
      sanitized += text;
      index = cursor;
      continue;
    }

    if (character === "$" && !isIdentifierCharacter(source[index - 1])) {
      const tagMatch = DOLLAR_TAG_PATTERN.exec(source.slice(index));

      if (tagMatch) {
        beginStatement();
        const tag = tagMatch[0];
        const bodyStart = index + tag.length;
        const bodyEnd = source.indexOf(tag, bodyStart);

        if (bodyEnd === -1) {
          throw new SqlParseError(
            `${filename}: unterminated dollar-quoted block starting at line ${line}.`,
          );
        }

        const body = source.slice(bodyStart, bodyEnd);
        bodies.push({ text: body, line });

        raw += source.slice(index, bodyEnd + tag.length);
        sanitized += `${tag}${tag}`;
        line += (body.match(/\n/g) ?? []).length;
        index = bodyEnd + tag.length;
        continue;
      }
    }

    if (character === ";") {
      raw += character;
      index += 1;
      flush();
      continue;
    }

    if (character === "\n") {
      line += 1;
      raw += character;
      sanitized += character;
      index += 1;
      continue;
    }

    if (!/\s/.test(character)) {
      beginStatement();
    }

    raw += character;
    sanitized += character;
    index += 1;
  }

  // Trailing comments and whitespace are fine; unterminated SQL is not. The
  // check reads `sanitized` so a comment-only tail is not misreported as an
  // unterminated statement.
  if (sanitized.trim() !== "") {
    throw new SqlParseError(
      `${filename}: the statement starting at line ${startLine ?? line} is not terminated by a semicolon.`,
    );
  }

  return statements;
}

/* -------------------------------------------------------------------------- */
/* Tokenizing                                                                  */
/* -------------------------------------------------------------------------- */

const TOKEN_PATTERN =
  /"(?:[^"]|"")*"|[A-Za-z_-￿][A-Za-z0-9_$-￿]*|\d+(?:\.\d+)?|::|[(),.]|\S/gu;

export function tokenizeSql(text) {
  return [...text.matchAll(TOKEN_PATTERN)].map((match) => match[0]);
}

function lower(token) {
  return token === undefined ? undefined : token.toLowerCase();
}

function unquoteIdentifier(token) {
  if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
    return token.slice(1, -1).replaceAll('""', '"');
  }

  return token.toLowerCase();
}

/** Reads `schema.name` / `name` starting at `position`. */
function readQualifiedName(tokens, position) {
  const parts = [];
  let cursor = position;

  for (;;) {
    const token = tokens[cursor];

    if (token === undefined || /^[(),]$/.test(token)) {
      break;
    }

    parts.push(unquoteIdentifier(token));
    cursor += 1;

    if (tokens[cursor] === ".") {
      cursor += 1;
      continue;
    }

    break;
  }

  if (parts.length === 0) {
    return null;
  }

  return { name: parts.join("."), next: cursor, parts };
}

/** Returns the index just past the matching close paren for `tokens[open]`. */
function matchParen(tokens, open) {
  let depth = 0;

  for (let cursor = open; cursor < tokens.length; cursor += 1) {
    if (tokens[cursor] === "(") {
      depth += 1;
    } else if (tokens[cursor] === ")") {
      depth -= 1;

      if (depth === 0) {
        return cursor + 1;
      }
    }
  }

  return -1;
}

function splitTopLevel(tokens) {
  const groups = [];
  let current = [];
  let depth = 0;

  for (const token of tokens) {
    if (token === "(") {
      depth += 1;
    } else if (token === ")") {
      depth -= 1;
    }

    if (token === "," && depth === 0) {
      groups.push(current);
      current = [];
      continue;
    }

    current.push(token);
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

function indexOfTopLevelKeyword(tokens, keyword, from = 0) {
  let depth = 0;

  for (let cursor = from; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor];

    if (token === "(") {
      depth += 1;
      continue;
    }

    if (token === ")") {
      depth -= 1;
      continue;
    }

    if (depth === 0 && lower(token) === keyword) {
      return cursor;
    }
  }

  return -1;
}

/* -------------------------------------------------------------------------- */
/* Type-signature normalization                                                */
/* -------------------------------------------------------------------------- */

function normalizeTypeTokens(tokens) {
  const normalized = tokens.map((token) => lower(token));
  return normalized.join(" ").replaceAll(" ( ", "(").replaceAll(" )", ")").replaceAll(" ,", ",").trim();
}

/**
 * Derives the argument type list from a CREATE FUNCTION parameter group so the
 * created function can be matched against the type-only signature used by
 * REVOKE ... ON FUNCTION.
 *
 * Conservative by design: OUT parameters are excluded, DEFAULT expressions are
 * stripped, and a parameter that cannot be resolved to a type yields `null`,
 * which the caller reports as a violation rather than silently accepting.
 */
export function deriveArgumentTypes(parameterTokens) {
  const parameters = splitTopLevel(parameterTokens).filter(
    (group) => group.length > 0,
  );
  const types = [];

  for (const parameter of parameters) {
    let tokens = [...parameter];

    const defaultIndex = tokens.findIndex(
      (token) => lower(token) === "default" || token === "=",
    );

    if (defaultIndex !== -1) {
      tokens = tokens.slice(0, defaultIndex);
    }

    let mode = "in";

    if (tokens.length > 1 && ["in", "out", "inout", "variadic"].includes(lower(tokens[0]))) {
      mode = lower(tokens[0]);
      tokens = tokens.slice(1);
    }

    if (mode === "out") {
      continue;
    }

    if (tokens.length === 0) {
      return null;
    }

    if (tokens.length === 1) {
      types.push(normalizeTypeTokens(tokens));
      continue;
    }

    // A leading parameter name is present unless the whole token run is a known
    // multi-word type spelling.
    const asWords = tokens.map((token) => lower(token));
    const isMultiWordType = MULTI_WORD_TYPE_PREFIXES.some(
      (prefix) =>
        prefix.length === asWords.length &&
        prefix.every((word, position) => word === asWords[position]),
    );

    if (isMultiWordType) {
      types.push(normalizeTypeTokens(tokens));
      continue;
    }

    types.push(normalizeTypeTokens(tokens.slice(1)));
  }

  return types;
}

export function normalizeFunctionIdentity(name, argumentTypes) {
  return `${name.toLowerCase()}(${argumentTypes.map((type) => type.replaceAll(" ", "")).join(",")})`;
}

/** Normalizes a `name(type, type)` identity written by hand or parsed from SQL. */
export function normalizeObjectIdentity(objectClass, identity) {
  if (objectClass !== "function" && objectClass !== "procedure" && objectClass !== "routine") {
    return identity.toLowerCase().replaceAll(" ", "");
  }

  const openParen = identity.indexOf("(");

  if (openParen === -1) {
    return `${identity.toLowerCase().trim()}()`;
  }

  const name = identity.slice(0, openParen).trim().toLowerCase();
  const inner = identity.slice(openParen + 1, identity.lastIndexOf(")"));
  const argumentTypes = inner
    .split(",")
    .map((type) => type.trim().toLowerCase().replaceAll(/\s+/g, ""))
    .filter((type) => type !== "");

  return `${name}(${argumentTypes.join(",")})`;
}

/* -------------------------------------------------------------------------- */
/* Privilege statement parsing                                                 */
/* -------------------------------------------------------------------------- */

const OBJECT_CLASS_KEYWORDS = Object.freeze({
  table: "table",
  sequence: "sequence",
  function: "function",
  procedure: "procedure",
  routine: "routine",
  schema: "schema",
  database: "database",
  domain: "domain",
  language: "language",
  tablespace: "tablespace",
  type: "type",
  parameter: "parameter",
});

/**
 * Parses GRANT / REVOKE into a structured model.
 *
 * Returns `{ ok: false, reason }` when the statement is a privilege statement
 * the parser cannot fully model. Callers must treat that as a violation.
 */
export function parsePrivilegeStatement(sanitized) {
  const tokens = tokenizeSql(sanitized);

  if (tokens.length === 0) {
    return null;
  }

  const keyword = lower(tokens[0]);

  if (keyword !== "grant" && keyword !== "revoke") {
    return null;
  }

  const kind = keyword;
  let cursor = 1;
  let grantOptionFor = false;

  if (
    kind === "revoke" &&
    lower(tokens[1]) === "grant" &&
    lower(tokens[2]) === "option" &&
    lower(tokens[3]) === "for"
  ) {
    grantOptionFor = true;
    cursor = 4;
  }

  if (kind === "revoke" && lower(tokens[1]) === "admin" && lower(tokens[2]) === "option") {
    return { ok: false, kind, reason: "role-membership REVOKE is not modelled" };
  }

  const separator = kind === "grant" ? "to" : "from";
  const onIndex = indexOfTopLevelKeyword(tokens, "on", cursor);
  const separatorIndex = indexOfTopLevelKeyword(tokens, separator, cursor);

  if (separatorIndex === -1) {
    return {
      ok: false,
      kind,
      reason: `missing ${separator.toUpperCase()} clause`,
    };
  }

  if (onIndex === -1 || onIndex > separatorIndex) {
    // GRANT <role> TO <role> — role membership, never legitimate in a migration
    // of this project because it can hand a browser-reachable role every
    // privilege of another role without any GRANT ... ON appearing.
    return {
      ok: true,
      kind,
      isRoleMembership: true,
      roles: splitTopLevel(tokens.slice(cursor, separatorIndex)).map((group) =>
        group.map((token) => unquoteIdentifier(token)).join(""),
      ),
      grantees: parseGrantees(tokens.slice(separatorIndex + 1)),
      grantOption: false,
      grantOptionFor,
    };
  }

  const privileges = parsePrivileges(tokens.slice(cursor, onIndex));

  if (privileges === null) {
    return { ok: false, kind, reason: "unparseable privilege list" };
  }

  const objectSection = tokens.slice(onIndex + 1, separatorIndex);
  const objectModel = parseObjectSection(objectSection);

  if (objectModel === null) {
    return { ok: false, kind, reason: "unparseable object list" };
  }

  const trailer = tokens.slice(separatorIndex + 1);
  const withIndex = indexOfTopLevelKeyword(trailer, "with");
  const granteeTokens = withIndex === -1 ? trailer : trailer.slice(0, withIndex);
  const grantees = parseGrantees(granteeTokens);

  if (grantees === null || grantees.length === 0) {
    return { ok: false, kind, reason: "unparseable grantee list" };
  }

  const grantOption =
    withIndex !== -1 && lower(trailer[withIndex + 1]) === "grant";

  return {
    ok: true,
    kind,
    isRoleMembership: false,
    privileges,
    objectClass: objectModel.objectClass,
    objects: objectModel.objects,
    wildcardSchemas: objectModel.wildcardSchemas,
    grantees,
    grantOption,
    grantOptionFor,
  };
}

function parsePrivileges(tokens) {
  if (tokens.length === 0) {
    return null;
  }

  const privileges = [];

  for (const group of splitTopLevel(tokens)) {
    if (group.length === 0) {
      return null;
    }

    const words = [];
    let columns = [];
    let cursor = 0;

    while (cursor < group.length && group[cursor] !== "(") {
      words.push(lower(group[cursor]));
      cursor += 1;
    }

    if (cursor < group.length && group[cursor] === "(") {
      const close = matchParen(group, cursor);

      if (close === -1) {
        return null;
      }

      columns = splitTopLevel(group.slice(cursor + 1, close - 1))
        .map((columnTokens) =>
          columnTokens.map((token) => unquoteIdentifier(token)).join(""),
        )
        .filter((column) => column !== "");
      cursor = close;
    }

    if (cursor !== group.length) {
      return null;
    }

    const filtered = words.filter((word) => word !== "privileges");

    if (filtered.length === 0) {
      return null;
    }

    const privilege = filtered.join(" ");

    if (!PRIVILEGE_WORDS.includes(filtered[0])) {
      return null;
    }

    privileges.push({ privilege, columns });
  }

  return privileges;
}

function parseObjectSection(tokens) {
  if (tokens.length === 0) {
    return null;
  }

  if (lower(tokens[0]) === "all") {
    const kind = lower(tokens[1]);
    const inIndex = indexOfTopLevelKeyword(tokens, "in");

    if (
      inIndex === -1 ||
      lower(tokens[inIndex + 1]) !== "schema" ||
      !["tables", "sequences", "functions", "procedures", "routines"].includes(kind)
    ) {
      return null;
    }

    const schemas = splitTopLevel(tokens.slice(inIndex + 2)).map((group) =>
      group.map((token) => unquoteIdentifier(token)).join(""),
    );

    return {
      objectClass: `all ${kind} in schema`,
      objects: schemas.map((schema) => `${schema}.*`),
      wildcardSchemas: schemas,
    };
  }

  let cursor = 0;
  let objectClass = "table";
  const firstWord = lower(tokens[0]);

  if (firstWord === "foreign") {
    return null;
  }

  if (firstWord === "large" && lower(tokens[1]) === "object") {
    return null;
  }

  if (Object.hasOwn(OBJECT_CLASS_KEYWORDS, firstWord)) {
    objectClass = OBJECT_CLASS_KEYWORDS[firstWord];
    cursor = 1;
  }

  const objects = [];

  for (const group of splitTopLevel(tokens.slice(cursor))) {
    if (group.length === 0) {
      return null;
    }

    const qualified = readQualifiedName(group, 0);

    if (qualified === null) {
      return null;
    }

    if (objectClass === "function" || objectClass === "procedure" || objectClass === "routine") {
      if (group[qualified.next] !== "(") {
        // A function grant without an argument list is ambiguous under
        // overloading; refuse to model it.
        return null;
      }

      const close = matchParen(group, qualified.next);

      if (close === -1 || close !== group.length) {
        return null;
      }

      const argumentTypes = splitTopLevel(
        group.slice(qualified.next + 1, close - 1),
      )
        .map((typeTokens) => normalizeTypeTokens(typeTokens))
        .filter((type) => type !== "");

      objects.push(normalizeFunctionIdentity(qualified.name, argumentTypes));
      continue;
    }

    if (qualified.next !== group.length) {
      return null;
    }

    objects.push(qualified.name);
  }

  if (objects.length === 0) {
    return null;
  }

  return { objectClass, objects, wildcardSchemas: [] };
}

function parseGrantees(tokens) {
  const grantees = [];

  for (const group of splitTopLevel(tokens)) {
    let working = [...group];

    if (working.length > 1 && ["group", "role"].includes(lower(working[0]))) {
      working = working.slice(1);
    }

    if (working.length !== 1) {
      return null;
    }

    grantees.push(unquoteIdentifier(working[0]));
  }

  return grantees;
}

/* -------------------------------------------------------------------------- */
/* Statement classification                                                    */
/* -------------------------------------------------------------------------- */

export function classifyStatement(statement) {
  const tokens = tokenizeSql(statement.sanitized);
  const first = lower(tokens[0]);

  const base = {
    line: statement.line,
    raw: statement.raw,
    sanitized: statement.sanitized,
    bodies: statement.bodies,
    literals: statement.literals,
    tokens,
  };

  if (first === "grant" || first === "revoke") {
    return { ...base, type: "privilege", privilege: parsePrivilegeStatement(statement.sanitized) };
  }

  if (first === "alter" && lower(tokens[1]) === "default" && lower(tokens[2]) === "privileges") {
    return { ...base, type: "alter-default-privileges" };
  }

  if (first === "alter" && lower(tokens[1]) === "table") {
    let nameStart = 2;

    if (lower(tokens[nameStart]) === "if" && lower(tokens[nameStart + 1]) === "exists") {
      nameStart += 2;
    }

    if (lower(tokens[nameStart]) === "only") {
      nameStart += 1;
    }

    const qualified = readQualifiedName(tokens, nameStart);
    const enablesRls = /\benable\s+row\s+level\s+security\b/i.test(
      statement.sanitized,
    );

    return {
      ...base,
      type: "alter-table",
      target: qualified?.name ?? null,
      enablesRls,
    };
  }

  if (first === "create") {
    return classifyCreate(base, tokens, statement);
  }

  if (first === "do") {
    return { ...base, type: "do-block" };
  }

  return { ...base, type: "other" };
}

function classifyCreate(base, tokens, statement) {
  let cursor = 1;

  if (lower(tokens[cursor]) === "or" && lower(tokens[cursor + 1]) === "replace") {
    cursor += 2;
  }

  const modifiers = [];

  while (
    ["unique", "materialized", "temporary", "temp", "unlogged", "global", "local", "recursive", "constraint"].includes(
      lower(tokens[cursor]),
    )
  ) {
    modifiers.push(lower(tokens[cursor]));
    cursor += 1;
  }

  const keyword = lower(tokens[cursor]);
  cursor += 1;

  if (lower(tokens[cursor]) === "if" && lower(tokens[cursor + 1]) === "not" && lower(tokens[cursor + 2]) === "exists") {
    cursor += 3;
  }

  const objectClass =
    keyword === "view" && modifiers.includes("materialized")
      ? "materialized view"
      : keyword === "index" && modifiers.includes("unique")
        ? "unique index"
        : keyword;

  if (keyword === "extension") {
    const qualified = readQualifiedName(tokens, cursor);
    return {
      ...base,
      type: "create",
      objectClass: "extension",
      identity: qualified?.name ?? null,
      privilegeBearing: false,
    };
  }

  if (keyword === "function" || keyword === "procedure") {
    const qualified = readQualifiedName(tokens, cursor);

    if (qualified === null || tokens[qualified.next] !== "(") {
      return {
        ...base,
        type: "create",
        objectClass: keyword,
        identity: null,
        privilegeBearing: true,
        unparseable: true,
      };
    }

    const close = matchParen(tokens, qualified.next);

    if (close === -1) {
      return {
        ...base,
        type: "create",
        objectClass: keyword,
        identity: null,
        privilegeBearing: true,
        unparseable: true,
      };
    }

    const argumentTypes = deriveArgumentTypes(
      tokens.slice(qualified.next + 1, close - 1),
    );

    return {
      ...base,
      type: "create",
      objectClass: keyword,
      identity:
        argumentTypes === null
          ? null
          : normalizeFunctionIdentity(qualified.name, argumentTypes),
      privilegeBearing: true,
      unparseable: argumentTypes === null,
      securityDefiner: /\bsecurity\s+definer\b/i.test(statement.sanitized),
      hasEmptySearchPath:
        /\bset\s+search_path\s*(?:=|to)\s*''/i.test(statement.sanitized),
      returnsTrigger: /\breturns\s+trigger\b/i.test(statement.sanitized),
    };
  }

  if (PRIVILEGE_BEARING_CREATIONS.includes(objectClass)) {
    const qualified = readQualifiedName(tokens, cursor);

    return {
      ...base,
      type: "create",
      objectClass,
      identity: qualified?.name ?? null,
      privilegeBearing: true,
      unparseable: qualified === null,
    };
  }

  if (NON_PRIVILEGE_CREATIONS.includes(objectClass)) {
    const qualified = readQualifiedName(tokens, cursor);

    return {
      ...base,
      type: "create",
      objectClass,
      identity: qualified?.name ?? null,
      privilegeBearing: false,
    };
  }

  return {
    ...base,
    type: "create",
    objectClass: objectClass ?? "unknown",
    identity: null,
    privilegeBearing: true,
    unmodelled: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Grant entry expansion                                                       */
/* -------------------------------------------------------------------------- */

export function expandGrantEntries(privilege) {
  const entries = [];

  for (const object of privilege.objects) {
    for (const { privilege: name, columns } of privilege.privileges) {
      for (const grantee of privilege.grantees) {
        entries.push({
          privilege: name,
          objectClass: privilege.objectClass,
          object,
          columns: [...columns].sort(),
          grantee,
        });
      }
    }
  }

  return entries;
}

export function canonicalGrantKey(entry) {
  const object = normalizeObjectIdentity(entry.objectClass, entry.object);
  const columns = [...(entry.columns ?? [])]
    .map((column) => column.toLowerCase())
    .sort();

  return [
    entry.grantee.toLowerCase(),
    entry.objectClass.toLowerCase(),
    object,
    entry.privilege.toLowerCase(),
    columns.join("+"),
  ].join(" | ");
}

/* -------------------------------------------------------------------------- */
/* Rules                                                                       */
/* -------------------------------------------------------------------------- */

function isBrowserReachable(grantee) {
  return BROWSER_REACHABLE_GRANTEES.includes(grantee.toLowerCase());
}

function coveringRevokeGrantees(statements) {
  const covered = new Set();

  for (const statement of statements) {
    const model = statement.privilege;

    if (
      !model?.ok ||
      model.kind !== "revoke" ||
      model.isRoleMembership ||
      model.grantOptionFor
    ) {
      continue;
    }

    if (!model.privileges.some(({ privilege, columns }) => privilege === "all" && columns.length === 0)) {
      continue;
    }

    for (const grantee of model.grantees) {
      covered.add(grantee.toLowerCase());
    }
  }

  return covered;
}

/**
 * Runs the full rule set.
 *
 * @param {{
 *   files: {name: string, source: string}[],
 *   terminalMigrations: {file: string, grants: object[]}[],
 *   approvedExtensions?: {name: string}[],
 * }} input
 */
export function lintMigrations({
  files,
  terminalMigrations,
  approvedExtensions = [],
}) {
  const violations = [];
  const add = (file, line, rule, message) =>
    violations.push({ file, line, rule, message });

  const fileNames = files.map((file) => file.name);
  const terminalByFile = new Map(
    terminalMigrations.map((terminal) => [terminal.file, terminal]),
  );
  const approvedExtensionNames = new Set(
    approvedExtensions.map((extension) => extension.name.toLowerCase()),
  );

  for (const terminal of terminalMigrations) {
    if (!fileNames.includes(terminal.file)) {
      add(
        terminal.file,
        0,
        "terminal-migration-missing",
        `The approved grant-terminal migration "${terminal.file}" is not present in the migration directory. Either it was renamed or deleted; the approved grant set must be re-reviewed.`,
      );
    }
  }

  const orderedTerminals = terminalMigrations
    .map((terminal) => fileNames.indexOf(terminal.file))
    .filter((index) => index !== -1);

  for (let position = 1; position < orderedTerminals.length; position += 1) {
    if (orderedTerminals[position] <= orderedTerminals[position - 1]) {
      add(
        terminalMigrations[position].file,
        0,
        "terminal-migration-order",
        "Approved grant-terminal migrations must be registered in migration order.",
      );
    }
  }

  let statementsChecked = 0;
  let privilegeStatementsChecked = 0;

  for (const file of files) {
    let statements;

    try {
      statements = splitSqlStatements(file.source, file.name).map((statement) =>
        classifyStatement(statement),
      );
    } catch (error) {
      add(
        file.name,
        0,
        "parse-error",
        `${error instanceof Error ? error.message : "Unknown parse failure."} The checker fails closed: an unparseable migration is treated as a violation.`,
      );
      continue;
    }

    if (statements.length === 0) {
      add(
        file.name,
        0,
        "empty-migration",
        "No SQL statement was recognized in this migration. The checker fails closed rather than reporting a vacuous pass.",
      );
      continue;
    }

    statementsChecked += statements.length;

    const isTerminal = terminalByFile.has(file.name);
    const grantEntries = [];

    for (let position = 0; position < statements.length; position += 1) {
      const statement = statements[position];

      if (statement.type === "alter-default-privileges") {
        add(
          file.name,
          statement.line,
          "alter-default-privileges",
          "ALTER DEFAULT PRIVILEGES is deliberately not used in this project (ADR-017 §4): it is role-specific, so applying it against the wrong creating role is a silent no-op that produces false confidence. Adding one requires an ADR update and human approval.",
        );
        continue;
      }

      if (statement.type === "privilege") {
        privilegeStatementsChecked += 1;
        const model = statement.privilege;

        if (!model || model.ok === false) {
          add(
            file.name,
            statement.line,
            "unparseable-privilege-statement",
            `A ${model?.kind ?? "privilege"} statement could not be fully modelled (${model?.reason ?? "unknown form"}). The checker fails closed: extend the parser and re-review rather than ignoring it.`,
          );
          continue;
        }

        if (model.isRoleMembership) {
          add(
            file.name,
            statement.line,
            "role-membership-grant",
            `Role membership is ${model.kind === "grant" ? "granted" : "revoked"} here (${model.roles.join(", ")} ${model.kind === "grant" ? "to" : "from"} ${model.grantees.join(", ")}). Role membership can hand a browser-reachable role every privilege of another role without any GRANT ... ON statement appearing, so it is refused outright.`,
          );
          continue;
        }

        if (model.kind === "grant") {
          if (model.grantOption) {
            add(
              file.name,
              statement.line,
              "grant-option",
              "WITH GRANT OPTION lets the grantee re-grant the privilege, which places the effective privilege set outside static review.",
            );
          }

          for (const object of model.objects) {
            if (
              model.objectClass !== "schema" &&
              model.objectClass !== "database" &&
              !model.objectClass.startsWith("all ") &&
              !object.includes(".")
            ) {
              add(
                file.name,
                statement.line,
                "unqualified-grant-target",
                `"${object}" is not schema-qualified, so the object it resolves to depends on search_path at apply time. Schema-qualify every grant target.`,
              );
            }
          }

          if (!isTerminal) {
            add(
              file.name,
              statement.line,
              "grant-outside-terminal-migration",
              `GRANT is only permitted in an approved grant-terminal migration. ${describeGrant(model)} Grant-last (ADR-017 §2) requires every intermediate boundary to be strictly more restrictive than the final state.`,
            );
            continue;
          }

          grantEntries.push(
            ...expandGrantEntries(model).map((entry) => ({
              ...entry,
              line: statement.line,
            })),
          );
        }

        continue;
      }

      if (statement.type === "create") {
        if (statement.unmodelled) {
          add(
            file.name,
            statement.line,
            "unmodelled-object-creation",
            `CREATE ${statement.objectClass.toUpperCase()} is not modelled by the privilege checker. The checker fails closed: decide explicitly whether this object class carries an ACL, extend the checker, and re-review.`,
          );
          continue;
        }

        if (statement.objectClass === "extension") {
          if (!approvedExtensionNames.has((statement.identity ?? "").toLowerCase())) {
            add(
              file.name,
              statement.line,
              "unapproved-extension",
              `Extension "${statement.identity}" is not in the approved extension list. Extension functions are created with PUBLIC EXECUTE by default and cannot be revoked object-by-object by this checker, so each extension needs an explicit, documented approval.`,
            );
          }

          continue;
        }

        if (statement.unparseable) {
          add(
            file.name,
            statement.line,
            "unparseable-object-creation",
            `A CREATE ${statement.objectClass.toUpperCase()} statement could not be resolved to an object identity, so its revoke obligation cannot be verified. The checker fails closed.`,
          );
          continue;
        }

        if (!statement.privilegeBearing) {
          continue;
        }

        const nextCreation = statements.findIndex(
          (candidate, candidateIndex) =>
            candidateIndex > position &&
            candidate.type === "create" &&
            candidate.privilegeBearing,
        );
        const windowEnd = nextCreation === -1 ? statements.length : nextCreation;
        const window = statements
          .slice(position + 1, windowEnd)
          .filter((candidate) => candidate.type === "privilege");

        const objectClassForRevoke =
          statement.objectClass === "view" || statement.objectClass === "materialized view"
            ? "table"
            : statement.objectClass;

        const matching = window.filter((candidate) => {
          const model = candidate.privilege;

          if (!model?.ok || model.isRoleMembership) {
            return false;
          }

          if (model.objectClass !== objectClassForRevoke) {
            return false;
          }

          return model.objects.some(
            (object) =>
              normalizeObjectIdentity(model.objectClass, object) ===
              normalizeObjectIdentity(objectClassForRevoke, statement.identity),
          );
        });

        const covered = coveringRevokeGrantees(matching);
        const missing = BROWSER_REACHABLE_GRANTEES.filter(
          (grantee) => !covered.has(grantee),
        );

        if (missing.length > 0) {
          add(
            file.name,
            statement.line,
            statement.securityDefiner
              ? "security-definer-not-fail-closed"
              : "creation-not-fail-closed",
            `${statement.securityDefiner ? "SECURITY DEFINER " : ""}${statement.objectClass} ${statement.identity} is created without an adjacent REVOKE ALL from ${missing.join(", ")}. ${revokeRationale(statement)} The revoke must appear before the next privilege-bearing CREATE in the same file.`,
          );
        }

        if (
          (statement.objectClass === "function" || statement.objectClass === "procedure") &&
          !statement.hasEmptySearchPath
        ) {
          add(
            file.name,
            statement.line,
            "function-search-path",
            `${statement.objectClass} ${statement.identity} does not declare "set search_path = ''". Without it the function resolves unqualified names through the caller's search_path, which is a definer-rights hijack path for SECURITY DEFINER functions and a correctness hazard for the rest.`,
          );
        }

        continue;
      }
    }

    // Row Level Security obligation for Data API-exposed tables.
    const publicTables = statements.filter(
      (statement) =>
        statement.type === "create" &&
        statement.objectClass === "table" &&
        typeof statement.identity === "string" &&
        statement.identity.startsWith("public."),
    );

    for (const table of publicTables) {
      const enabled = statements.some(
        (candidate) =>
          candidate.type === "alter-table" &&
          candidate.enablesRls &&
          candidate.target === table.identity,
      );

      if (!enabled) {
        add(
          file.name,
          table.line,
          "public-table-without-rls",
          `Table ${table.identity} is exposed through the Data API schema but the file that creates it never enables row level security. A later GRANT SELECT would expose every row.`,
        );
      }
    }

    // Dynamic privilege statements hidden in function bodies, DO blocks, and
    // string literals. Comment text is never scanned — `sanitized` has comments
    // stripped — so prose in a migration header cannot produce a false positive.
    for (const statement of statements) {
      const candidates = [
        ...statement.bodies.map((body) => ({ text: body.text, line: body.line })),
        ...statement.literals.map((literal) => ({
          text: literal.text,
          line: literal.line,
        })),
      ];

      if (statement.type === "do-block" || statement.type === "other") {
        candidates.push({ text: statement.sanitized, line: statement.line });
      }

      for (const candidate of candidates) {
        if (DYNAMIC_PRIVILEGE_PATTERN.test(candidate.text)) {
          add(
            file.name,
            candidate.line,
            "dynamic-privilege-statement",
            "A GRANT / REVOKE / ALTER DEFAULT PRIVILEGES appears inside a function body, DO block, or other non-top-level position. Privilege changes issued at runtime are invisible to static review and are refused.",
          );
        }
      }
    }

    if (isTerminal) {
      violations.push(
        ...compareTerminalGrants(file.name, grantEntries, terminalByFile.get(file.name)),
      );
    }
  }

  violations.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
  );

  return {
    violations,
    checked: {
      files: files.length,
      statements: statementsChecked,
      privilegeStatements: privilegeStatementsChecked,
      terminalMigrations: terminalMigrations.length,
    },
  };
}

function describeGrant(model) {
  const privileges = model.privileges
    .map(({ privilege, columns }) =>
      columns.length > 0 ? `${privilege} (${columns.join(", ")})` : privilege,
    )
    .join(", ");

  const browserReachable = model.grantees.filter((grantee) =>
    isBrowserReachable(grantee),
  );

  return `It grants ${privileges} on ${model.objects.join(", ")} to ${model.grantees.join(", ")}${
    browserReachable.length > 0
      ? ` (browser-reachable: ${browserReachable.join(", ")})`
      : ""
  }.`;
}

function revokeRationale(statement) {
  if (statement.objectClass === "function" || statement.objectClass === "procedure") {
    return "PostgreSQL grants EXECUTE on every new function to PUBLIC by default, so the function is callable from the instant it is created until it is revoked.";
  }

  if (statement.objectClass === "table") {
    return "Supabase projects carry ALTER DEFAULT PRIVILEGES granting new objects in the API schema to anon and authenticated, so a new table can inherit privileges without any GRANT appearing.";
  }

  return "Default and inherited privileges must be revoked adjacent to creation so no boundary is ever wider than the final state.";
}

function compareTerminalGrants(fileName, actualEntries, terminal) {
  const violations = [];
  const approvedByKey = new Map();

  for (const grant of terminal.grants) {
    const key = canonicalGrantKey(grant);

    if (approvedByKey.has(key)) {
      violations.push({
        file: fileName,
        line: 0,
        rule: "duplicate-approved-grant",
        message: `The approved grant list contains "${key}" twice.`,
      });
    }

    approvedByKey.set(key, grant);
  }

  const seen = new Set();

  for (const entry of actualEntries) {
    const key = canonicalGrantKey(entry);
    seen.add(key);

    if (!approvedByKey.has(key)) {
      violations.push({
        file: fileName,
        line: entry.line,
        rule: "unapproved-grant",
        message: `"${key}" is not in the approved final privilege set. Every privilege held by a browser-reachable role must be explicitly approved and justified; add it to the approved list with a reason, or remove the grant.`,
      });
    }
  }

  for (const [key, grant] of approvedByKey) {
    if (!seen.has(key)) {
      violations.push({
        file: fileName,
        line: 0,
        rule: "missing-approved-grant",
        message: `The approved final privilege set expects "${key}" (${grant.reason ?? "no reason recorded"}) but the migration does not grant it. Either the migration regressed or the approved list is stale; both need review.`,
      });
    }
  }

  return violations;
}

export function formatViolations(violations) {
  return violations
    .map(
      (violation) =>
        `  ${violation.file}:${violation.line} [${violation.rule}]\n    ${violation.message}`,
    )
    .join("\n\n");
}
