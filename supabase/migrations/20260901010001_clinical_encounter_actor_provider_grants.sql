-- O14 browser boundary: the provider cannot be selected or forged by clients.

revoke execute on function public.create_clinical_encounter(uuid, uuid, uuid, uuid)
from authenticated;

grant execute on function public.create_clinical_encounter_v2(uuid, uuid, uuid)
to authenticated;

revoke execute on function public.create_clinical_encounter_v2(uuid, uuid, uuid)
from service_role;
