import { z } from "zod";

/**
 * A UUID as PostgreSQL defines one.
 *
 * Use this, not `z.uuid()`, for any identifier that comes from or goes to the
 * database.
 *
 * Zod 4's `z.uuid()` enforces RFC 9562 *versioned* UUIDs: the version nibble
 * must be 1–8 and the variant nibble must be 8/9/a/b. PostgreSQL's `uuid` type
 * enforces neither — it stores any 128-bit value, and `gen_random_uuid()`
 * merely happens to produce v4.
 *
 * That mismatch is not theoretical. It made the application return a 500 for
 * every request by a member of an organization whose id was
 * `22000000-0000-0000-0000-000000000001` — a perfectly valid row that the
 * project's own synthetic seed creates, rejected by a validator sitting between
 * the database and the authorization layer. It surfaced only when the E2E flows
 * were first executed against a real project.
 *
 * Version tagging is not a security property. Nothing downstream branches on it,
 * and a caller who forges an id gains nothing: every identifier is still
 * authorized against the database by RLS and by the administrative RPCs.
 * Validating the shape is worth doing; validating the version rejects valid data
 * for no benefit.
 */
export const databaseUuid = z.guid();
