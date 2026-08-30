-- O12 security repair: browser sessions may claim a photo, but derivative
-- completion is server-worker-only because Postgres cannot attest MinIO/R2
-- object bytes itself.
revoke execute on function public.record_clinical_photo_derivatives(uuid,uuid,text,bigint,jsonb)
from authenticated;
