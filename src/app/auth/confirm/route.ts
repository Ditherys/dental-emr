import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";

const supportedEmailOtpTypes = new Set<EmailOtpType>([
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function isSupportedEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && supportedEmailOtpTypes.has(value);
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (tokenHash && isSupportedEmailOtpType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      const next = getSafeRedirectPath(
        request.nextUrl.searchParams.get("next"),
      );
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(
    new URL("/login?authError=confirmation", request.url),
  );
}
