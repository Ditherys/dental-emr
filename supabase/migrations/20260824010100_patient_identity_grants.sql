-- P2-02 grant terminal. Required only to evaluate the stored patient RLS
-- expression. The private schema remains unavailable through the Data API.

grant execute on function private.has_shared_patient_permission(uuid, text)
to authenticated;
