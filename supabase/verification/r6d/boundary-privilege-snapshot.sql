-- R6-D boundary privilege snapshot — PASSES against a fresh, empty Cloud TEST
-- project in both `--mode=file` and `--mode=statement` (see docs/AI_HANDOFF.md's
-- current checkpoint; the function-signature normalization bug, found on the
-- first real `--mode=file` run, is fixed).
--
-- Read-only. Creates nothing, changes nothing, and returns one JSON row
-- describing the EFFECTIVE privileges the browser-reachable roles hold at the
-- current migration boundary.
--
-- WHY EFFECTIVE, NOT TEXTUAL
--
-- Comparing ACL strings is not a security check: consolidation legitimately
-- changes how an ACL is represented without changing access, and an absent ACL
-- is not an absence of privilege. This probe therefore asks PostgreSQL what each
-- role can actually do:
--
--   * `anon` / `authenticated` — has_table_privilege, has_column_privilege,
--     has_function_privilege, has_schema_privilege, has_sequence_privilege.
--     These account for privileges inherited through PUBLIC and through role
--     membership, which a catalog read of relacl alone would miss.
--
--   * PUBLIC — has no entry in pg_roles, so it is resolved by exploding
--     `coalesce(<acl>, acldefault(...))`. The coalesce is the important half:
--     a NULL proacl means "PostgreSQL's default", and PostgreSQL's default for a
--     function is EXECUTE TO PUBLIC. A probe that only read non-NULL ACLs would
--     report a freshly created SECURITY DEFINER function as harmless.
--
-- The privilege type lists are derived from acldefault() rather than hard-coded,
-- so a newer PostgreSQL that adds a privilege (MAINTAIN, for example) is covered
-- without editing this file.
--
-- EXTENSION-OWNED OBJECTS are excluded and counted separately. They cannot be
-- revoked object-by-object by the migration baseline; they are governed by the
-- approved-extension list in scripts/approved-final-grants.mjs. The count is
-- reported so the size of that exception is visible rather than implied.

with target_schemas as (
  select namespace.oid, namespace.nspname
  from pg_catalog.pg_namespace as namespace
  where namespace.nspname not in ('pg_catalog', 'information_schema')
    and namespace.nspname not like 'pg\_temp%'
    and namespace.nspname not like 'pg\_toast%'
),

browser_roles as (
  select role.rolname
  from pg_catalog.pg_roles as role
  where role.rolname in ('anon', 'authenticated')
),

extension_members as (
  select dependency.classid, dependency.objid
  from pg_catalog.pg_depend as dependency
  where dependency.deptype = 'e'
),

relation_privileges as (
  select distinct entry.privilege_type
  from pg_catalog.aclexplode(pg_catalog.acldefault('r', 10::oid)) as entry
),

sequence_privileges as (
  select distinct entry.privilege_type
  from pg_catalog.aclexplode(pg_catalog.acldefault('s', 10::oid)) as entry
),

function_privileges as (
  select distinct entry.privilege_type
  from pg_catalog.aclexplode(pg_catalog.acldefault('f', 10::oid)) as entry
),

schema_privileges as (
  select distinct entry.privilege_type
  from pg_catalog.aclexplode(pg_catalog.acldefault('n', 10::oid)) as entry
),

column_privileges as (
  select unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as privilege_type
),

relations as (
  select
    class.oid,
    class.relowner,
    class.relacl,
    schema.nspname || '.' || class.relname as identity
  from pg_catalog.pg_class as class
  join target_schemas as schema on schema.oid = class.relnamespace
  where class.relkind in ('r', 'p', 'v', 'm', 'f')
    and not exists (
      select 1
      from extension_members as member
      where member.classid = 'pg_catalog.pg_class'::regclass
        and member.objid = class.oid
    )
),

sequences as (
  select
    class.oid,
    class.relowner,
    class.relacl,
    schema.nspname || '.' || class.relname as identity
  from pg_catalog.pg_class as class
  join target_schemas as schema on schema.oid = class.relnamespace
  where class.relkind = 'S'
    and not exists (
      select 1
      from extension_members as member
      where member.classid = 'pg_catalog.pg_class'::regclass
        and member.objid = class.oid
    )
),

routines as (
  select
    procedure.oid,
    procedure.proowner,
    procedure.proacl,
    -- `object_class` mirrors migration-privilege-lint.mjs's classifyStatement,
    -- which reads the literal CREATE keyword ("function" or "procedure") off
    -- the migration text. prokind = 'p' is PostgreSQL's own way of recording
    -- that the routine was declared with CREATE PROCEDURE. Any other prokind
    -- ('f' normal function, 'a' aggregate, 'w' window) is reported as
    -- "function", matching what classifyStatement would call anything that
    -- isn't literally CREATE PROCEDURE.
    case when procedure.prokind = 'p' then 'procedure' else 'function' end as object_class,
    -- Bare comma-separated types, matching normalizeObjectIdentity's expected
    -- input shape (scripts/migration-privilege-lint.mjs) and
    -- approved-final-grants.mjs's signature strings. pg_get_function_identity_
    -- arguments() includes parameter NAMES ("target_branch_id uuid"), which
    -- normalizeObjectIdentity's whitespace-stripping then glues into one wrong
    -- token ("target_branch_iduuid") instead of extracting the type — a false
    -- boundary violation on every named-parameter function, found on R6-D's
    -- first real execution. proargtypes carries only IN/INOUT/VARIADIC
    -- argument types, with no names, in the same order identity_arguments
    -- would list them; no baseline function uses VARIADIC, so the distinct
    -- array-type spelling that would apply there is not a concern here.
    --
    -- string_agg's input order is unspecified without an explicit ORDER BY
    -- (unnest's own storage order is not a documented guarantee for
    -- aggregation purposes) — ORDER BY ordinality pins it to proargtypes'
    -- actual positional order, which is the call signature.
    schema.nspname || '.' || procedure.proname
      || '(' || (
        select coalesce(
          string_agg(pg_catalog.format_type(argument.argtype, null), ',' order by argument.ordinality),
          ''
        )
        from unnest(procedure.proargtypes) with ordinality as argument(argtype, ordinality)
      ) || ')'
      as identity
  from pg_catalog.pg_proc as procedure
  join target_schemas as schema on schema.oid = procedure.pronamespace
  where not exists (
    select 1
    from extension_members as member
    where member.classid = 'pg_catalog.pg_proc'::regclass
      and member.objid = procedure.oid
  )
),

relation_columns as (
  select
    relation.oid as relation_oid,
    relation.identity,
    attribute.attnum,
    attribute.attname,
    attribute.attacl
  from relations as relation
  join pg_catalog.pg_attribute as attribute on attribute.attrelid = relation.oid
  where attribute.attnum > 0
    and not attribute.attisdropped
),

-- PUBLIC ------------------------------------------------------------------

public_relation_privileges as (
  select
    'public' as grantee,
    'table' as object_class,
    relation.identity as object,
    lower(entry.privilege_type) as privilege,
    null::text as column_name
  from relations as relation
  cross join lateral pg_catalog.aclexplode(
    coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) as entry
  where entry.grantee = 0
),

public_column_privileges as (
  select
    'public' as grantee,
    'column' as object_class,
    relation_column.identity as object,
    lower(entry.privilege_type) as privilege,
    relation_column.attname as column_name
  from relation_columns as relation_column
  cross join lateral pg_catalog.aclexplode(relation_column.attacl) as entry
  where entry.grantee = 0
),

public_sequence_privileges as (
  select
    'public' as grantee,
    'sequence' as object_class,
    sequence.identity as object,
    lower(entry.privilege_type) as privilege,
    null::text as column_name
  from sequences as sequence
  cross join lateral pg_catalog.aclexplode(
    coalesce(sequence.relacl, pg_catalog.acldefault('s', sequence.relowner))
  ) as entry
  where entry.grantee = 0
),

public_function_privileges as (
  select
    'public' as grantee,
    routine.object_class,
    routine.identity as object,
    lower(entry.privilege_type) as privilege,
    null::text as column_name
  from routines as routine
  cross join lateral pg_catalog.aclexplode(
    coalesce(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
  ) as entry
  where entry.grantee = 0
),

public_schema_privileges as (
  select
    'public' as grantee,
    'schema' as object_class,
    schema.nspname as object,
    lower(entry.privilege_type) as privilege,
    null::text as column_name
  from target_schemas as schema
  join pg_catalog.pg_namespace as namespace on namespace.oid = schema.oid
  cross join lateral pg_catalog.aclexplode(
    coalesce(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))
  ) as entry
  where entry.grantee = 0
),

-- anon / authenticated ----------------------------------------------------

role_relation_privileges as (
  select
    browser_role.rolname::text as grantee,
    'table' as object_class,
    relation.identity as object,
    lower(privilege.privilege_type) as privilege,
    null::text as column_name
  from relations as relation
  cross join browser_roles as browser_role
  cross join relation_privileges as privilege
  where pg_catalog.has_table_privilege(
    browser_role.rolname,
    relation.oid,
    privilege.privilege_type
  )
),

role_column_privileges as (
  select
    browser_role.rolname::text as grantee,
    'column' as object_class,
    relation_column.identity as object,
    lower(privilege.privilege_type) as privilege,
    relation_column.attname as column_name
  from relation_columns as relation_column
  cross join browser_roles as browser_role
  cross join column_privileges as privilege
  where pg_catalog.has_column_privilege(
    browser_role.rolname,
    relation_column.relation_oid,
    relation_column.attnum,
    privilege.privilege_type
  )
  -- Only report a column privilege that is NOT already held table-wide, so a
  -- table-level SELECT does not explode into one row per column.
  and not pg_catalog.has_table_privilege(
    browser_role.rolname,
    relation_column.relation_oid,
    privilege.privilege_type
  )
),

role_sequence_privileges as (
  select
    browser_role.rolname::text as grantee,
    'sequence' as object_class,
    sequence.identity as object,
    lower(privilege.privilege_type) as privilege,
    null::text as column_name
  from sequences as sequence
  cross join browser_roles as browser_role
  cross join sequence_privileges as privilege
  where pg_catalog.has_sequence_privilege(
    browser_role.rolname,
    sequence.oid,
    privilege.privilege_type
  )
),

role_function_privileges as (
  select
    browser_role.rolname::text as grantee,
    routine.object_class,
    routine.identity as object,
    lower(privilege.privilege_type) as privilege,
    null::text as column_name
  from routines as routine
  cross join browser_roles as browser_role
  cross join function_privileges as privilege
  where pg_catalog.has_function_privilege(
    browser_role.rolname,
    routine.oid,
    privilege.privilege_type
  )
),

role_schema_privileges as (
  select
    browser_role.rolname::text as grantee,
    'schema' as object_class,
    schema.nspname as object,
    lower(privilege.privilege_type) as privilege,
    null::text as column_name
  from target_schemas as schema
  cross join browser_roles as browser_role
  cross join schema_privileges as privilege
  where pg_catalog.has_schema_privilege(
    browser_role.rolname,
    schema.oid,
    privilege.privilege_type
  )
),

effective_privileges as (
  select * from public_relation_privileges
  union all select * from public_column_privileges
  union all select * from public_sequence_privileges
  union all select * from public_function_privileges
  union all select * from public_schema_privileges
  union all select * from role_relation_privileges
  union all select * from role_column_privileges
  union all select * from role_sequence_privileges
  union all select * from role_function_privileges
  union all select * from role_schema_privileges
),

definer_functions as (
  select
    routine.identity,
    procedure.prosecdef,
    coalesce(procedure.proconfig::text, '') as configuration
  from routines as routine
  join pg_catalog.pg_proc as procedure on procedure.oid = routine.oid
  where procedure.prosecdef
),

relations_without_rls as (
  select relation.identity
  from relations as relation
  join pg_catalog.pg_class as class on class.oid = relation.oid
  where class.relkind in ('r', 'p')
    and relation.identity like 'public.%'
    and not class.relrowsecurity
)

select jsonb_build_object(
  'examined', jsonb_build_object(
    'schemas', (select count(*) from target_schemas),
    'browser_roles', (select count(*) from browser_roles),
    'tables', (select count(*) from relations),
    'columns', (select count(*) from relation_columns),
    'sequences', (select count(*) from sequences),
    'functions', (select count(*) from routines),
    'security_definer_functions', (select count(*) from definer_functions),
    'extension_owned_objects', (select count(*) from extension_members)
  ),
  'public_tables_without_rls', coalesce(
    (select jsonb_agg(identity order by identity) from relations_without_rls),
    '[]'::jsonb
  ),
  'security_definer_functions', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('object', identity, 'configuration', configuration)
        order by identity
      )
      from definer_functions
    ),
    '[]'::jsonb
  ),
  'privileges', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'grantee', grantee,
          'object_class', object_class,
          'object', object,
          'privilege', privilege,
          'column', column_name
        )
        order by grantee, object_class, object, privilege, column_name
      )
      from effective_privileges
    ),
    '[]'::jsonb
  )
) as r6d_boundary_snapshot;
