"use client";

import { useActionState, useMemo, useState } from "react";
import { Send } from "lucide-react";

import {
  inviteWorkforceUser,
  type InviteWorkforceState,
} from "@/app/(emr)/settings/users/invite/actions";
import { InlineFieldError } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import type { InvitationOption } from "@/lib/auth/workforce-invitations";

const initialState: InviteWorkforceState = {};
const controlClasses =
  "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";

export function InviteWorkforceForm({
  options,
}: {
  options: InvitationOption[];
}) {
  const [state, formAction, pending] = useActionState(
    inviteWorkforceUser,
    initialState,
  );
  const [organizationId, setOrganizationId] = useState(
    options[0]?.organizationId ?? "",
  );
  const selectedOrganization = useMemo(
    () =>
      options.find((option) => option.organizationId === organizationId) ??
      options[0],
    [options, organizationId],
  );
  const [roleId, setRoleId] = useState(selectedOrganization?.roles[0]?.id ?? "");
  const selectedRole = selectedOrganization?.roles.find(
    (role) => role.id === roleId,
  );
  const roleIsOrganizationWide =
    selectedRole?.code === "OWNER" || selectedRole?.code === "ADMIN";

  function handleOrganizationChange(value: string) {
    const organization = options.find(
      (option) => option.organizationId === value,
    );
    setOrganizationId(value);
    setRoleId(organization?.roles[0]?.id ?? "");
  }

  return (
    <form action={formAction} className="mt-6 max-w-2xl space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="invite-email" className="text-sm font-medium">
            Staff email address
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            aria-invalid={state.fieldErrors?.email ? true : undefined}
            aria-describedby={
              state.fieldErrors?.email ? "invite-email-error" : "invite-email-help"
            }
            className={controlClasses}
          />
          <p
            id="invite-email-help"
            className="mt-1.5 text-xs leading-5 text-muted-foreground"
          >
            Use the person&apos;s individual work email. Shared clinic accounts are
            not permitted.
          </p>
          {state.fieldErrors?.email?.[0] && (
            <InlineFieldError id="invite-email-error">
              {state.fieldErrors.email[0]}
            </InlineFieldError>
          )}
        </div>

        <div>
          <label htmlFor="invite-organization" className="text-sm font-medium">
            Organization
          </label>
          <select
            id="invite-organization"
            name="organizationId"
            value={organizationId}
            onChange={(event) => handleOrganizationChange(event.target.value)}
            required
            aria-invalid={state.fieldErrors?.organizationId ? true : undefined}
            aria-describedby={
              state.fieldErrors?.organizationId
                ? "invite-organization-error"
                : undefined
            }
            className={controlClasses}
          >
            {options.map((option) => (
              <option key={option.organizationId} value={option.organizationId}>
                {option.organizationName}
              </option>
            ))}
          </select>
          {state.fieldErrors?.organizationId?.[0] && (
            <InlineFieldError id="invite-organization-error">
              {state.fieldErrors.organizationId[0]}
            </InlineFieldError>
          )}
        </div>

        <div>
          <label htmlFor="invite-role" className="text-sm font-medium">
            Intended role
          </label>
          <select
            id="invite-role"
            name="roleId"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            required
            aria-invalid={state.fieldErrors?.roleId ? true : undefined}
            aria-describedby={
              state.fieldErrors?.roleId ? "invite-role-error" : undefined
            }
            className={controlClasses}
          >
            {selectedOrganization?.roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          {state.fieldErrors?.roleId?.[0] && (
            <InlineFieldError id="invite-role-error">
              {state.fieldErrors.roleId[0]}
            </InlineFieldError>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="invite-branch" className="text-sm font-medium">
            Branch scope <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <select
            id="invite-branch"
            name="branchId"
            defaultValue=""
            disabled={roleIsOrganizationWide}
            aria-describedby={
              state.fieldErrors?.branchId
                ? "invite-branch-help invite-branch-error"
                : "invite-branch-help"
            }
            aria-invalid={state.fieldErrors?.branchId ? true : undefined}
            className={controlClasses}
          >
            <option value="">All authorized organization locations</option>
            {selectedOrganization?.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <p
            id="invite-branch-help"
            className="mt-1.5 text-xs leading-5 text-muted-foreground"
          >
            A branch selection creates branch-scoped access. Owner and
            administrator roles are always organization-wide.
          </p>
          {state.fieldErrors?.branchId?.[0] && (
            <InlineFieldError id="invite-branch-error">
              {state.fieldErrors.branchId[0]}
            </InlineFieldError>
          )}
        </div>
      </div>

      {state.message && (
        <p
          role={state.success ? "status" : "alert"}
          className={
            state.success
              ? "rounded-md border border-success/25 bg-success-soft px-3 py-2 text-sm text-success"
              : "rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          }
        >
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-3 border-t pt-5">
        <Button type="submit" size="lg" disabled={pending}>
          <Send aria-hidden="true" />
          {pending ? "Sending invitation…" : "Send invitation"}
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          Membership stays inactive until the recipient accepts.
        </p>
      </div>
    </form>
  );
}
