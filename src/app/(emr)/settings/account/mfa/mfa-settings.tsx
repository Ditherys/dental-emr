"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  KeyRound,
  Plus,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Trash2,
} from "lucide-react";

import { InlineFieldError } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { isValidTotpCode } from "@/lib/auth/mfa-policy";
import { createClient } from "@/lib/supabase/client";

type Factor = {
  id: string;
  friendlyName: string;
  createdAt: string;
  createdLabel: string;
};

type Enrollment = {
  factorId: string;
  qrCodeUrl: string;
  secret: string;
};

type MfaSettingsProps = {
  factors: Factor[];
  isAal2: boolean;
  nextPath: string;
};

const inputClasses =
  "mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";

export function MfaSettings({ factors, isAal2, nextPath }: MfaSettingsProps) {
  const router = useRouter();
  const [friendlyName, setFriendlyName] = useState("Primary authenticator");
  const [enrollment, setEnrollment] = useState<Enrollment>();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [removingFactorId, setRemovingFactorId] = useState<string>();

  async function startEnrollment() {
    const trimmedName = friendlyName.trim();

    if (!trimmedName || trimmedName.length > 64) {
      setMessage("Use a device name between 1 and 64 characters.");
      return;
    }

    setMessage(undefined);
    setPending(true);

    try {
      const supabase = createClient();
      const { data: existingFactors, error: factorsError } =
        await supabase.auth.mfa.listFactors();

      if (factorsError || !existingFactors) {
        setMessage("Unable to start authenticator setup. Try again.");
        return;
      }

      for (const factor of existingFactors.all) {
        if (factor.factor_type === "totp" && factor.status === "unverified") {
          const { error: cleanupError } = await supabase.auth.mfa.unenroll({
            factorId: factor.id,
          });

          if (cleanupError) {
            setMessage("Unable to clear an incomplete setup. Try again.");
            return;
          }
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: trimmedName,
        issuer: "Dental EMR",
      });

      if (error || !data) {
        setMessage("Unable to start authenticator setup. Try again.");
        return;
      }

      setEnrollment({
        factorId: data.id,
        qrCodeUrl: `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`,
        secret: data.totp.secret,
      });
      setCode("");
    } catch {
      setMessage("Authenticator setup is temporarily unavailable. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function cancelEnrollment() {
    if (!enrollment) {
      return;
    }

    setMessage(undefined);
    setPending(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: enrollment.factorId,
      });

      if (error) {
        setMessage("Unable to cancel this setup. Try again.");
        return;
      }

      setEnrollment(undefined);
      setCode("");
    } catch {
      setMessage("Unable to cancel this setup. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function verifyEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);

    if (!enrollment || !isValidTotpCode(code)) {
      setMessage("Enter the current six-digit code.");
      return;
    }

    setPending(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollment.factorId,
        code,
      });

      if (error) {
        setMessage("That code could not be verified. Check the code and try again.");
        return;
      }

      setEnrollment(undefined);
      setCode("");
      router.replace(nextPath);
      router.refresh();
    } catch {
      setMessage("Authenticator verification is temporarily unavailable. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function removeFactor(factorId: string) {
    setMessage(undefined);
    setPending(true);

    try {
      const supabase = createClient();
      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (
        assuranceError ||
        assurance?.currentLevel !== "aal2" ||
        assurance.nextLevel !== "aal2"
      ) {
        router.push(
          `/mfa/challenge?next=${encodeURIComponent("/settings/account/mfa")}`,
        );
        return;
      }

      const { error } = await supabase.auth.mfa.unenroll({ factorId });

      if (error) {
        setMessage("Unable to remove that authenticator. Verify again and retry.");
        return;
      }

      setRemovingFactorId(undefined);

      if (factors.length === 1) {
        await supabase.auth.signOut({ scope: "local" });
        router.replace("/login");
        router.refresh();
        return;
      }

      router.refresh();
    } catch {
      setMessage("Unable to remove that authenticator. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-9">
      <section aria-labelledby="factor-status-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="factor-status-heading" className="text-base font-semibold">
              Authenticator apps
            </h2>
            <p className="mt-1 max-w-[70ch] text-sm leading-6 text-muted-foreground">
              Each verified app can generate the second factor needed at sign-in
              and before sensitive security operations.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-success">
            {factors.length > 0 ? (
              <ShieldCheck className="size-4" aria-hidden="true" />
            ) : (
              <ShieldOff className="size-4 text-warning" aria-hidden="true" />
            )}
            <span className={factors.length > 0 ? undefined : "text-warning"}>
              {factors.length > 0 ? "MFA enrolled" : "MFA not enrolled"}
            </span>
          </div>
        </div>

        {factors.length > 0 && (
          <ul className="mt-5 divide-y border-y" aria-label="Verified authenticators">
            {factors.map((factor) => (
              <li key={factor.id} className="py-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-navy-50 text-brand-navy-800">
                      <Smartphone className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {factor.friendlyName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Enrolled <time dateTime={factor.createdAt}>{factor.createdLabel}</time>
                      </p>
                    </div>
                  </div>

                  {removingFactorId === factor.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-destructive">
                        Remove this factor?
                      </span>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={pending}
                        onClick={() => removeFactor(factor.id)}
                      >
                        Confirm removal
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => setRemovingFactorId(undefined)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start text-destructive hover:bg-destructive/5 hover:text-destructive sm:self-center"
                      onClick={() => setRemovingFactorId(factor.id)}
                    >
                      <Trash2 aria-hidden="true" />
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="enroll-heading" className="border-t pt-7">
        <h2 id="enroll-heading" className="text-base font-semibold">
          {factors.length > 0
            ? "Add another authenticator"
            : "Set up an authenticator"}
        </h2>

        {!enrollment ? (
          <div className="mt-4 max-w-xl">
            <label htmlFor="factor-name" className="text-sm font-medium">
              Device name
            </label>
            <input
              id="factor-name"
              type="text"
              value={friendlyName}
              maxLength={64}
              onChange={(event) => setFriendlyName(event.target.value)}
              className={inputClasses}
              aria-describedby="factor-name-help"
            />
            <p id="factor-name-help" className="mt-1.5 text-xs leading-5 text-muted-foreground">
              Use a recognizable name such as “Work phone” or “Backup device.”
            </p>
            <Button
              type="button"
              className="mt-4"
              disabled={pending}
              onClick={startEnrollment}
            >
              <Plus aria-hidden="true" />
              {pending ? "Starting setup…" : "Start setup"}
            </Button>
          </div>
        ) : (
          <div className="mt-5 max-w-2xl">
            <ol className="space-y-6">
              <li className="flex gap-4">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-navy-900 text-xs font-semibold text-white">
                  1
                </span>
                <div>
                  <h3 className="text-sm font-semibold">Scan the QR code</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    In your authenticator app, add an account and scan this code.
                  </p>
                  <div className="mt-3 w-fit border bg-white p-3">
                    <Image
                      src={enrollment.qrCodeUrl}
                      width={216}
                      height={216}
                      unoptimized
                      alt="QR code containing the one-time authenticator enrollment secret"
                      className="size-[216px]"
                    />
                  </div>
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium text-brand-navy-800">
                      Enter a setup key instead
                    </summary>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      If scanning is unavailable, type this key into the app. Treat
                      it like a password and never send or save it elsewhere.
                    </p>
                    <code className="mt-2 block break-all border bg-muted px-3 py-2 text-sm font-semibold tracking-[0.08em]">
                      {enrollment.secret}
                    </code>
                  </details>
                </div>
              </li>

              <li className="flex gap-4">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-navy-900 text-xs font-semibold text-white">
                  2
                </span>
                <form onSubmit={verifyEnrollment} className="min-w-0 flex-1" noValidate>
                  <h3 className="text-sm font-semibold">Verify the setup</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Enter the current six-digit code. The factor is not active until
                    verification succeeds.
                  </p>
                  <div className="mt-3 max-w-xs">
                    <label htmlFor="enrollment-code" className="text-sm font-medium">
                      Six-digit code
                    </label>
                    <input
                      id="enrollment-code"
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
                      aria-invalid={message ? true : undefined}
                      aria-describedby={message ? "enrollment-error" : undefined}
                      className={`${inputClasses} text-base tracking-[0.2em] placeholder:tracking-normal`}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="submit" disabled={pending}>
                      <ShieldCheck aria-hidden="true" />
                      {pending ? "Verifying…" : "Enable MFA"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={cancelEnrollment}
                    >
                      Cancel setup
                    </Button>
                  </div>
                </form>
              </li>
            </ol>
          </div>
        )}

        {message && (
          <InlineFieldError id="enrollment-error">{message}</InlineFieldError>
        )}
      </section>

      <section aria-labelledby="recovery-heading" className="border-t pt-7">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-brand-navy-800" aria-hidden="true" />
          <div>
            <h2 id="recovery-heading" className="text-base font-semibold">
              Recovery guidance
            </h2>
            <div className="mt-2 max-w-[70ch] space-y-2 text-sm leading-6 text-muted-foreground">
              <p>
                This foundation does not create custom recovery codes. Enroll a
                second authenticator on a separately secured device when your clinic
                policy permits it.
              </p>
              <p>
                If every enrolled device is lost, contact the clinic administrator.
                Administrative recovery must verify your identity and must never ask
                you to disclose a QR code, setup key, password, or one-time code.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="verification-test-heading" className="border-t pt-7">
        <h2 id="verification-test-heading" className="text-base font-semibold">
          Security-gate check
        </h2>
        <p className="mt-1 max-w-[70ch] text-sm leading-6 text-muted-foreground">
          This administrative test route proves that the reusable server-side AAL2
          gate rejects a password-only session before future high-risk operations use
          it.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/settings/account/mfa/verified">
            <ShieldCheck aria-hidden="true" />
            {isAal2 ? "Open AAL2-protected check" : "Verify to open protected check"}
          </Link>
        </Button>
      </section>
    </div>
  );
}
