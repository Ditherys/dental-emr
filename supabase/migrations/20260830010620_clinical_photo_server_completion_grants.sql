-- O12 server-only completion grant terminal. No browser role can attest or
-- persist derivative metadata; the worker must verify objects before calling it.
grant execute on function public.complete_clinical_photo_derivatives(uuid,uuid,uuid,text,bigint,jsonb)
to service_role;
