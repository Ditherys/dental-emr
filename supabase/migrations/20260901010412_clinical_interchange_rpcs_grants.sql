-- Browser boundary for the staged clinical interchange.
--
-- Five function grants and nothing else. No table privilege is granted on
-- public.clinical_import_batches, public.clinical_import_candidates or
-- public.clinical_export_records: the staging tables stay unreachable except
-- through these SECURITY DEFINER boundaries, each of which derives the
-- organization, the actor and - where it writes - the treating provider on the
-- server. Nothing is revoked here, so no approved grant is superseded.

grant execute on function public.create_clinical_import_batch_v1(uuid, uuid, text, text, jsonb, uuid)
to authenticated;

grant execute on function public.get_clinical_import_batch_v1(uuid, uuid, uuid)
to authenticated;

grant execute on function public.apply_clinical_import_batch_v1(uuid, uuid, uuid, uuid[], uuid)
to authenticated;

grant execute on function public.archive_clinical_import_batch_v1(uuid, uuid, uuid, text)
to authenticated;

grant execute on function public.record_clinical_export_v1(uuid, uuid, text, text, uuid)
to authenticated;
