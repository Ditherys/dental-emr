-- Restores the exact reviewed browser boundary after the lock-seed replacement.
-- The preceding migration revokes adjacent to CREATE OR REPLACE, so the single
-- authenticated EXECUTE is re-granted here and nowhere else. The boundary is
-- unchanged: `start_or_resume_clinical_visit` remains the only browser-callable
-- clinical encounter creation path, and `service_role` still holds nothing.

grant execute on function public.start_or_resume_clinical_visit(uuid, uuid, uuid, uuid)
to authenticated;
