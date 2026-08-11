"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";

import { login, type LoginState } from "@/app/(auth)/login/actions";
import { InlineFieldError } from "@/components/feedback";
import { Button } from "@/components/ui/button";

const initialState: LoginState = {};

const inputClasses =
  "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const emailError = state.fieldErrors?.email?.[0];
  const passwordError = state.fieldErrors?.password?.[0];

  return (
    <form action={formAction} className="mt-7 space-y-5" noValidate>
      <div>
        <label htmlFor="email" className="text-sm font-medium">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
          className={inputClasses}
        />
        {emailError && (
          <InlineFieldError id="email-error">{emailError}</InlineFieldError>
        )}
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "password-error" : undefined}
          className={inputClasses}
        />
        {passwordError && (
          <InlineFieldError id="password-error">
            {passwordError}
          </InlineFieldError>
        )}
      </div>

      {state.message && (
        <p
          role="alert"
          className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        <LogIn aria-hidden="true" />
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
