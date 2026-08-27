import { NextRequest, NextResponse } from "next/server";

import { submitIntakeFormInputSchema } from "@/lib/intake/schema";
import { IntakeServiceError, submitIntakeForm } from "@/lib/intake/service";

// The anonymous intake submission surface. This route is deliberately
// unauthenticated and bounded: it validates the exact minimal submission
// allowlist (org slug, link token, a bounded answers object, and the privacy
// acknowledgement), delegates to public_submit_intake_form, and never returns
// or logs patient, clinical, or internal data. An unknown, expired, revoked,
// or foreign-organization token answers identically as "invalid or expired".
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = submitIntakeFormInputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Review your answers and try again." }, { status: 400 });
  }

  try {
    const result = await submitIntakeForm(
      parsed.data.orgSlug,
      parsed.data.token,
      parsed.data.answers,
      parsed.data.privacyAcknowledged,
    );
    return NextResponse.json({ ...result }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof IntakeServiceError) {
      switch (error.code) {
        case "NOT_FOUND":
          return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 404 });
        case "INVALID_INPUT":
          return NextResponse.json({ error: "Review your answers and try again." }, { status: 400 });
        default:
          return NextResponse.json({ error: "Your form could not be submitted. Try again." }, { status: 500 });
      }
    }
    return NextResponse.json({ error: "Your form could not be submitted. Try again." }, { status: 500 });
  }
}