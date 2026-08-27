-- P13-02 terminal: the only anon/authenticated grants for the four public
-- booking RPCs. These are the second deliberate unauthenticated surface after
-- get_public_site (P12-02) and are documented in scripts/approved-final-grants.mjs.

grant execute on function public.public_get_available_slots(text, text, integer) to anon, authenticated;
grant execute on function public.public_submit_booking_request(text, jsonb) to anon, authenticated;
grant execute on function public.public_get_booking_status(uuid, text) to anon, authenticated;
grant execute on function public.public_cancel_booking_request(uuid, text) to anon, authenticated;