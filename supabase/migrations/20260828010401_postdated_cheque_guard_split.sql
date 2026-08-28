-- B5 correction: split the single AFTER status-event trigger into a BEFORE
-- context validator (terminal/current-state/legal-pair checks, raised before
-- the table CHECK constraints mask them) and an AFTER projection updater. The
-- live database already applied the combined AFTER version.

drop trigger postdated_cheque_status_events_apply on public.postdated_cheque_status_events;

create or replace function private.validate_postdated_cheque_transition_context()
returns trigger language plpgsql set search_path = '' as $$
declare v_current_status text;
begin
  select cheque.status into v_current_status
  from public.postdated_cheques as cheque
  where cheque.id = new.cheque_id and cheque.organization_id = new.organization_id
  for update;

  if v_current_status is null then
    raise check_violation using message = 'postdated cheque does not exist';
  end if;

  if v_current_status in ('CLEARED','CANCELLED','REPLACED') then
    raise check_violation using message = 'postdated cheque is terminal and cannot transition';
  end if;

  if new.from_status <> v_current_status then
    raise check_violation using message = 'postdated cheque transition must start from the current state';
  end if;

  if not (
    (new.from_status='HELD' and new.to_status in ('DEPOSITED','CANCELLED','REPLACED'))
    or (new.from_status='DEPOSITED' and new.to_status in ('CLEARED','BOUNCED','CANCELLED','REPLACED'))
    or (new.from_status='BOUNCED' and new.to_status='REPLACED')
  ) then
    raise check_violation using message = 'postdated cheque transition is not allowed';
  end if;

  return new;
end;
$$;
revoke all on function private.validate_postdated_cheque_transition_context() from public, anon, authenticated, service_role;

create trigger postdated_cheque_status_events_validate_context
before insert on public.postdated_cheque_status_events
for each row execute function private.validate_postdated_cheque_transition_context();

create or replace function private.apply_postdated_cheque_status_event()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.postdated_cheques as cheque
  set status = new.to_status, current_status_event_id = new.id, updated_at = statement_timestamp()
  where cheque.id = new.cheque_id and cheque.organization_id = new.organization_id;

  return new;
end;
$$;
revoke all on function private.apply_postdated_cheque_status_event() from public, anon, authenticated, service_role;

create trigger postdated_cheque_status_events_apply
after insert on public.postdated_cheque_status_events
for each row execute function private.apply_postdated_cheque_status_event();