-- Paired privilege registration for the O8 forward repair.
revoke all on table public.procedure_case_finding_resolutions from public, anon, authenticated, service_role;
revoke all on function private.reject_procedure_case_finding_resolution_mutation() from public, anon, authenticated, service_role;
