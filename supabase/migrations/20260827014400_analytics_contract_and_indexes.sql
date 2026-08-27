-- P20-01 broadens the existing OWNER/ADMIN analytics permission description
-- and adds only the tenant/time indexes needed by the aggregate query layer.

update public.permissions
set description = 'View organization-level operational, acquisition, and referral analytics.'
where code = 'analytics.view';

create index patients_organization_preferred_branch_created_idx
  on public.patients (organization_id, preferred_branch_id, created_at);

create index patient_referrals_org_created_idx
  on public.patient_referrals (org_id, created_at);

create index booking_requests_org_branch_created_idx
  on public.booking_requests (organization_id, branch_id, created_at);

create index communications_org_branch_created_idx
  on public.communications (organization_id, branch_id, created_at);

create index provider_reservations_org_branch_appointment_starts_idx
  on public.provider_reservations (organization_id, branch_id, starts_at)
  where reservation_status = 'ACTIVE' and reservation_kind = 'APPOINTMENT';

create index resource_reservations_org_branch_appointment_starts_idx
  on public.resource_reservations (organization_id, branch_id, starts_at)
  where reservation_status = 'ACTIVE' and reservation_kind = 'APPOINTMENT';
