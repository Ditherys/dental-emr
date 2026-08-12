import { NextResponse } from "next/server";

// A health check must reflect the live process, not a cached/static snapshot
// captured at build time. `force-dynamic` guarantees this route executes on
// every request instead of being served from Next.js's static route cache.
export const dynamic = "force-dynamic";

/**
 * Minimal, unauthenticated liveness endpoint for deployment tooling.
 *
 * Intentionally returns nothing beyond a fixed status. It must never expose
 * environment values, Supabase URLs/keys, dependency versions,
 * infrastructure details, database identifiers, or organization/tenant
 * information — anonymous callers are not entitled to any of that.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok" },
    {
      headers: {
        // Deployment/uptime tooling must see the current status on every
        // request; an intermediary or browser cache could otherwise mask a
        // real outage behind a stale "ok".
        "Cache-Control": "no-store",
      },
    },
  );
}
