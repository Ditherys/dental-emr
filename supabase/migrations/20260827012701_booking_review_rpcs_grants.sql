-- P13-03 terminal: the only authenticated grants for the staff booking review
-- RPCs. The private permission helper is granted to authenticated only so a
-- Data API RPC session can evaluate it directly if ever needed; the private
-- schema USAGE stays revoked, so it is not reachable as a public RPC. All three
-- are documented in scripts/approved-final-grants.mjs.

grant execute on function private.has_booking_review_permission_at_branch(uuid, text) to authenticated;
grant execute on function public.list_booking_requests(uuid, text) to authenticated;
grant execute on function public.review_booking_request(uuid, uuid, integer, text, text) to authenticated;