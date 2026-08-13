"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { InlineFieldError } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { isValidTotpCode } from "@/lib/auth/mfa-policy";
import { createClient } from "@/lib/supabase/client";
import { useHydrated } from "@/lib/hooks/use-hydrated";

type ChallengeFactor = {
  id: string;
  friendlyName: string;
};

type MfaChallengeFormProps = {
  factors: ChallengeFactor[];
  nextPath: string;
};

const inputClasses =
  "mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-base tracking-[0.2em] text-foreground outline-none transition-colors placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";

export function MfaChallengeForm({
  factors,
  nextPath,
}: MfaChallengeFormProps) {
  const router = useRouter();
  const [factorId, setFactorId] = useState(factors[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const hydrated = useHydrated();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);

    if (!factorId || !isValidTotpCode(code)) {
      setMessage("Enter the current six-digit code.");
      return;
    }

    setPending(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });

      if (error) {
        setMessage("That code could not be verified. Check the code and try again.");
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setMessage("Security verification is temporarily unavailable. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      className="mt-7 space-y-5"
      noValidate
    >
      {factors.length > 1 && (
        <div>
          <label htmlFor="mfa-factor" className="text-sm font-medium">
            Authenticator
          </label>
          <select
            id="mfa-factor"
            value={factorId}
            onChange={(event) => setFactorId(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
          >
            {factors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.friendlyName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="mfa-code" className="text-sm font-medium">
          Six-digit code
        </label>
        <input
          id="mfa-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          required
          autoFocus
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? "mfa-code-error" : undefined}
          className={inputClasses}
        />
        {message && (
          <InlineFieldError id="mfa-code-error">{message}</InlineFieldError>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={pending || !hydrated}
      >
        <ShieldCheck aria-hidden="true" />
        {pending ? "Verifying…" : "Verify and continue"}
      </Button>
    </form>
  );
}
