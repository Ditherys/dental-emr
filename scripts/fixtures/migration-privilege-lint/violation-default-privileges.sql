-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
--
-- Bypass attempt. Names no object at all, but every table created afterwards is
-- writable by a browser-reachable role. ADR-017 §4 refuses ALTER DEFAULT
-- PRIVILEGES outright because it is role-specific and silently no-ops when
-- pointed at the wrong creating role.

alter default privileges in schema public
grant insert, update, delete on tables to authenticated;
