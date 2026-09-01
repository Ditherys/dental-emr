-- Browser boundary for the read-only current managed visit projection.
--
-- One additive authenticated EXECUTE. No table privilege, no anon exposure, and
-- nothing for service_role. The clinical write boundary is untouched:
-- start_or_resume_clinical_visit remains the only browser-callable path that
-- creates an encounter.

grant execute on function public.get_current_managed_visit(uuid, uuid)
to authenticated;
