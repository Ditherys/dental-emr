import { NextRequest, NextResponse } from "next/server";

import { getAvailableSlotsInputSchema } from "@/lib/booking/schema";
import { getAvailableSlots } from "@/lib/booking/service";

// Anonymous slot enumeration for the website booking form, fed by the
// anon-granted public_get_available_slots RPC. Bounded to a procedure code
// and a 1-30 day window; returns only deterministic slot start/end times and
// never patient, clinical, or internal data.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const daysAheadRaw = searchParams.get("daysAhead");

  const parsed = getAvailableSlotsInputSchema.safeParse({
    orgSlug: searchParams.get("slug"),
    procedureCode: searchParams.get("procedureCode") || null,
    daysAhead: daysAheadRaw == null ? 7 : Number(daysAheadRaw),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid slot request." }, { status: 400 });
  }

  try {
    const slots = await getAvailableSlots(parsed.data);
    return NextResponse.json({ slots }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Slots could not be loaded. Try again." }, { status: 500 });
  }
}