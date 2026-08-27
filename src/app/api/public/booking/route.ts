import { NextRequest, NextResponse } from "next/server";

import { submitBookingRequestInputSchema } from "@/lib/booking/schema";
import { BookingServiceError, submitBookingRequest } from "@/lib/booking/service";

// The anonymous website booking submission surface. This route is deliberately
// unauthenticated and bounded: it validates the exact minimal submission
// allowlist, delegates to public_submit_booking_request, and returns the
// management token exactly once in the response body (the caller must capture
// it; only its hash is ever stored). It never reads or returns patient,
// clinical, workforce, internal, or audit data, and it never logs the token.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = submitBookingRequestInputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Review your booking details and try again." }, { status: 400 });
  }

  try {
    const result = await submitBookingRequest(parsed.data);
    return NextResponse.json({ ...result }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof BookingServiceError) {
      switch (error.code) {
        case "SLOT_UNAVAILABLE":
          return NextResponse.json({ error: "That time is no longer available. Choose another slot and try again." }, { status: 409 });
        case "INVALID_INPUT":
          return NextResponse.json({ error: "Review your booking details and try again." }, { status: 400 });
        case "NOT_AUTHORIZED":
          return NextResponse.json({ error: "Booking is not currently available." }, { status: 401 });
        default:
          return NextResponse.json({ error: "Your booking could not be submitted. Try again." }, { status: 500 });
      }
    }
    return NextResponse.json({ error: "Your booking could not be submitted. Try again." }, { status: 500 });
  }
}