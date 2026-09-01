-- Browser boundary for the composer's read-only context projection.
--
-- It derives organization and actor server-side, requires live
-- patient.clinical.read at an active acting branch, gates money behind the
-- caller's own billing permissions, and writes nothing. `authenticated` is the
-- only role that may execute it.

grant execute on function public.get_clinical_composer_context(uuid,uuid) to authenticated;
