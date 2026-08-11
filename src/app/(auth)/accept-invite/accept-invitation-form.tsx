"use client";

import { useActionState } from "react";
import { UserCheck } from "lucide-react";

import {
  acceptInvitation,
  type AcceptInvitationState,
} from "@/app/(auth)/accept-invite/actions";
import { InlineFieldError } from "@/components/feedback";
import { Button } from "@/components/ui/button";

const initialState: AcceptInvitationState = {};
const inputClasses =
  "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";

export function AcceptInvitationForm() {
  const [state, formAction, pending] = useActionState(
    acceptInvitation,
    initialState,
  );

  return (
    <form action={formAction} className="mt-7 space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="first-name" className="text-sm font-medium">
            First name
          </label>
          <input
            id="first-name"
            name="firstName"
            autoComplete="given-name"
            required
            aria-invalid={state.fieldErrors?.firstName ? true : undefined}
            aria-describedby={
              state.fieldErrors?.firstName ? "first-name-error" : undefined
            }
            className={inputClasses}
          />
          {state.fieldErrors?.firstName?.[0] && (
            <InlineFieldError id="first-name-error">
              {state.fieldErrors.firstName[0]}
            </InlineFieldError>
          )}
        </div>
        <div>
          <label htmlFor="last-name" className="text-sm font-medium">
            Last name
          </label>
          <input
            id="last-name"
            name="lastName"
            autoComplete="family-name"
            required
            aria-invalid={state.fieldErrors?.lastName ? true : undefined}
            aria-describedby={
              state.fieldErrors?.lastName ? "last-name-error" : undefined
            }
            className={inputClasses}
          />
          {state.fieldErrors?.lastName?.[0] && (
            <InlineFieldError id="last-name-error">
              {state.fieldErrors.lastName[0]}
            </InlineFieldError>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="new-password" className="text-sm font-medium">
          Create password
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={state.fieldErrors?.password ? true : undefined}
          aria-describedby={
            state.fieldErrors?.password
              ? "new-password-help new-password-error"
              : "new-password-help"
          }
          className={inputClasses}
        />
        <p
          id="new-password-help"
          className="mt-1.5 text-xs leading-5 text-muted-foreground"
        >
          Use at least 12 characters and a password unique to this account.
        </p>
        {state.fieldErrors?.password?.[0] && (
          <InlineFieldError id="new-password-error">
            {state.fieldErrors.password[0]}
          </InlineFieldError>
        )}
      </div>

      <div>
        <label htmlFor="confirm-password" className="text-sm font-medium">
          Confirm password
        </label>
        <input
          id="confirm-password"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={
            state.fieldErrors?.passwordConfirmation ? true : undefined
          }
          aria-describedby={
            state.fieldErrors?.passwordConfirmation
              ? "confirm-password-error"
              : undefined
          }
          className={inputClasses}
        />
        {state.fieldErrors?.passwordConfirmation?.[0] && (
          <InlineFieldError id="confirm-password-error">
            {state.fieldErrors.passwordConfirmation[0]}
          </InlineFieldError>
        )}
      </div>

      {state.message && (
        <p
          role="alert"
          className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        <UserCheck aria-hidden="true" />
        {pending ? "Activating account…" : "Activate account"}
      </Button>
    </form>
  );
}
