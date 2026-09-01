-- Browser boundary for the visit-bound clinical record composer.
--
-- Both functions derive organization, actor, treating provider, encounter and
-- the Philippine clinical date on the server, and each obtains its encounter
-- from public.start_or_resume_clinical_visit. The superseded direct entry path
-- was revoked in the adjacent object migration, so after this file the browser
-- can reach exactly one tooth-finding write and one visit-note write, both of
-- which are attributable to a managed visit.

grant execute on function public.record_visit_tooth_findings(
  uuid, uuid, text[], text, text[], text, date, text, uuid
) to authenticated;

grant execute on function public.record_visit_clinical_note(uuid, uuid, text, text, uuid)
to authenticated;
