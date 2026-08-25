# Phase 3 Provider, Specialty & Procedure Foundation Design

## Goal

Deliver a tenant-safe internal foundation for managing clinical provider
profiles, specialties, branch associations, and procedure definitions. This
phase prepares later scheduling and public-website work without treating a
provider as available, publishing staff data, or creating billing prices.

## Scope

- Organization-owned provider directory with regular, part-time, visiting,
  on-call, and external-referral provider types.
- Optional linkage from a provider profile to one authenticated application
  user; a provider profile does not itself grant an application role or
  clinical access.
- Provider-to-branch associations and provider-to-specialty assignments, with
  one optional primary specialty.
- A controlled global specialty catalog plus tenant-owned custom specialties.
- Organization-owned procedure/service catalog entries, including default
  duration, pre/post buffers, public-profile flags, and online-booking mode.
- Procedure specialty requirements and optional explicit eligible-provider
  allow-lists.
- Internal administration screens for providers, specialties, and procedures.
- RLS, server-side authorization, auditability, migration safety, and negative
  authorization coverage for every exposed tenant surface.

## Explicit Non-Scope

- Provider availability, time off, calendar connections, appointment slots,
  reservations, conflict detection, resources, and scheduling.
- Public provider directory pages, public APIs, or website rendering. Public
  profile fields and visibility flags are stored only for later website work.
- Patient, clinical, referral, treatment-plan, billing, pricing-guidance,
  inventory, document, file, or communication functionality.
- Automatic provider eligibility inference beyond the configured specialty
  requirements and explicit provider allow-list.

## Data Model

All tenant-owned provider and procedure tables carry `organization_id` and use
tenant-aware composite foreign keys. A relation may never associate records
from different organizations.

### Providers

Each provider has an opaque ID, organization ID, optional linked user ID,
person name fields, optional professional title and license number, optional
internal contact fields, provider type, active/archive state, and stored-only
website profile fields (`website_visible`, optional bio, and any future public
profile metadata). Provider types are constrained to `REGULAR`, `PART_TIME`,
`VISITING`, `ON_CALL`, and `EXTERNAL_REFERRAL`.

`ON_CALL` and `VISITING` are classifications, not availability claims. An
external-referral provider may exist without a linked user. A linked user must
belong to the same organization when one is provided, and linking a profile
does not modify workforce membership, roles, permissions, or branch access.

### Specialties

System specialty rows have a null organization ID and are immutable to tenant
administrators. Tenant custom specialties have the tenant organization ID. Both
use a stable code and display name; codes are unique in the appropriate system
or tenant scope. A specialty may be deactivated rather than deleted when it is
already referenced.

### Provider associations

`provider_branches` records active/inactive provider-to-branch operational
association. It does not define availability or online booking. A unique
tenant-aware provider/branch relation prevents duplicate membership.

`provider_specialties` records each provider/specialty association and a
primary marker. A database invariant permits at most one primary specialty per
provider. Only system specialties or specialties from that provider's
organization can be assigned.

### Procedures and qualification

Procedures are organization-owned and have a code, name, optional description,
default duration, pre/post buffers, active state, stored-only website visibility
and online-booking flags, and constrained booking mode (`REQUIRES_REVIEW` or
`REQUEST_ONLY`). `AUTO_CONFIRM` is deliberately deferred until the scheduling
engine can enforce conflicts and resource constraints.

Procedures do not include a price or price guidance in this phase. They may
have one or more specialty requirements, each marked `REQUIRED` or `PREFERRED`,
and optional explicit eligible-provider associations. Specialty requirements
and explicit allow-lists coexist: later scheduling must satisfy required
specialties and, where an allow-list exists, choose only a listed provider.
Procedure qualification data is configuration, not an assertion that a
provider is available, clinically credentialed, or authorized to treat a
specific patient.

## Authorization and Audit Design

`provider.read` grants bounded internal reads only within the actor's active
organization. `provider.manage` is required for all provider, specialty,
procedure, and association mutations. Server actions validate untrusted input,
recheck live permission and active branch workflow context, and invoke only
reviewed server-side service/RPC adapters. They never accept organization ID,
actor ID, role, audit action, or arbitrary permission data from the browser.

All exposed tenant tables use RLS. Base-table access stays unavailable to anon
and the browser roles unless an approved bounded read is required; mutations
are RPC-only. Every SECURITY DEFINER helper/function uses a fixed safe
`search_path`, derives the actor from `auth.uid()`, verifies current
organization membership and permission, uses tenant-aware lookup/locking, and
has default execution revoked before exact final grants are restored. High
impact provider/procedure configuration changes emit sanitized, opaque audit
events atomically with the mutation. Audit metadata must not contain provider
contact details, profile text, or other sensitive values.

## Internal User Experience

The EMR navigation provides Provider, Specialty, and Procedure administration
only to users with the applicable live read/manage permission. Direct routes
always reauthorize on the server. Each screen is an operational table with
search/filter and a focused create/edit flow; it is not a dashboard, KPI grid,
or public profile preview. Phone layouts become compact touch-safe lists/forms;
tablet and desktop retain dense readable tables. Forms preserve edits across
safe validation errors, return focus from dialogs, and provide accessible labels
and error associations.

## Testing and Verification

- pgTAP tests for schema constraints, RLS, exact grants, function search paths,
  tenant-aware foreign keys, direct base-table denial, and atomically audited
  mutations.
- Negative authorization tests for foreign organization/provider/specialty/
  procedure IDs, forged branch context, revoked membership/permission, and
  self-escalating linked-user attempts.
- Constraint tests for provider type, custom versus global specialties, one
  primary specialty, duplicate associations, cross-tenant links, valid duration
  and buffer bounds, booking mode, and active/inactive behavior.
- Application unit/component tests for input validation, safe error mapping,
  permission-aware navigation, explicit provider eligibility and specialty
  requirement editing, and inaccessible direct routes.
- Synthetic-only responsive and accessibility tests at phone, tablet, and
  desktop widths. No real provider, patient, or clinic data appears in fixtures,
  logs, screenshots, or test reports.
- Local migration reconstruction, pgTAP/concurrency suites as applicable,
  lint, typecheck, unit tests, secrets scan, dependency audit, and final diff
  review. Cloud TEST remains a mandatory pre-production gate under ADR-020.

## Deferred Follow-On Work

Phase 6 scheduling may add provider availability, time off, resource
requirements, reservations, conflict controls, and `AUTO_CONFIRM` only through
a separately reviewed plan. Website phases may expose explicitly published
provider and procedure projections through separate public-safe endpoints;
they must never expose these internal administration tables directly. Billing
and treatment planning may later introduce non-binding price guidance under a
separate reviewed design.

## Acceptance Criteria

1. A provider can belong to one organization, multiple branches, and multiple
   specialties without cross-tenant associations.
2. Provider type never implies schedule availability, public visibility, or
   application authorization.
3. Procedures can state specialty requirements and an optional explicit
   eligible-provider allow-list, but carry no authoritative fixed price.
4. Public-profile data is persisted only; no public page/API is introduced.
5. Direct table access, forged organization/branch identifiers, stale or
   revoked permissions, and cross-tenant IDs fail closed.
6. Every high-impact configuration mutation is permission-checked and audited
   atomically, without sensitive values in audit metadata or logs.
7. Internal screens remain accessible, responsive, and scoped to Phase 3.
