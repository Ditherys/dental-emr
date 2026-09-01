-- Browser boundary for the managed clinical visit lifecycle.
--
-- `create_clinical_encounter_v2` derived the provider correctly but still opened
-- an unmanaged encounter on every call: no clinical date, no identity, and no
-- idempotency. The managed lifecycle now owns encounter creation, so browser
-- execute on that superseded path is withdrawn. Historical read, finalize, and
-- amend paths keep their grants, and both legacy creation functions remain
-- defined so existing encounters stay explainable.

revoke execute on function public.create_clinical_encounter_v2(uuid, uuid, uuid)
from authenticated;

grant execute on function public.start_or_resume_clinical_visit(uuid, uuid, uuid, uuid)
to authenticated;
