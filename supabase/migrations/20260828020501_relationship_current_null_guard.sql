-- O14 forward correction: CHECK constraints must reject NULL/unknown states.
alter table public.dental_bridges
  drop constraint dental_bridges_record_kind_columns_check,
  add constraint dental_bridges_record_kind_columns_check check (coalesce(
    (record_kind = 'PLAN_DESIGN' and parent_plan_id is not null and treating_provider_id is null and executed_at is null and charge_id is null and sealed_at is null and supersedes_bridge_id is null and provenance is null and design_snapshot is null)
    or
    (record_kind = 'CURRENT' and parent_plan_id is null and parent_plan_item_id is null and design_snapshot is null and ((provenance = 'PREEXISTING_EXTERNAL' and treating_provider_id is null and executed_at is null) or (provenance is null and treating_provider_id is not null and executed_at is not null)) and (charge_id is not null or provenance = 'PREEXISTING_EXTERNAL')),
    false
  ));

alter table public.dental_implant_components
  drop constraint dental_implant_components_record_kind_columns_check,
  add constraint dental_implant_components_record_kind_columns_check check (coalesce(
    (record_kind = 'PLAN_DESIGN' and parent_plan_id is not null and treating_provider_id is null and executed_at is null and charge_id is null and sealed_at is null and supersedes_component_id is null and provenance is null and design_snapshot is null)
    or
    (record_kind = 'CURRENT' and parent_plan_id is null and parent_plan_item_id is null and design_snapshot is null and ((provenance = 'PREEXISTING_EXTERNAL' and treating_provider_id is null and executed_at is null) or (provenance is null and treating_provider_id is not null and executed_at is not null)) and (charge_id is not null or provenance = 'PREEXISTING_EXTERNAL')),
    false
  ));
