-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
--
-- Bypass attempt. No `GRANT <privilege> ON <object>` appears, so a
-- privilege-keyword regex sees nothing, yet authenticated inherits every
-- privilege the other role holds.

grant fixture_privileged_role to authenticated;
