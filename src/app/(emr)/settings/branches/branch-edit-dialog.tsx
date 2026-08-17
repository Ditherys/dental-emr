"use client";

import { startTransition, useActionState, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { useForm } from "react-hook-form";

import { updateBranchAction, type UpdateBranchState } from "./actions";
import { InlineFieldError } from "@/components/feedback/inline-field-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { BranchSummary } from "@/lib/branches";
import {
  branchUpdateFormSchema,
  type BranchUpdateFormValues,
} from "@/lib/branches/schema";

const initialState: UpdateBranchState = {};
const controlClasses =
  "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";

function defaultValuesFor(branch: BranchSummary): BranchUpdateFormValues {
  return {
    name: branch.name,
    phone: branch.phone ?? "",
    email: branch.email ?? "",
    addressLine1: branch.address_line1,
    addressLine2: branch.address_line2 ?? "",
    city: branch.city,
    province: branch.province,
    postalCode: branch.postal_code ?? "",
    timezone: branch.timezone as BranchUpdateFormValues["timezone"],
    websiteVisible: branch.website_visible,
  };
}

export function BranchEditDialog({ branch }: { branch: BranchSummary }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateBranchAction,
    initialState,
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BranchUpdateFormValues>({
    resolver: zodResolver(branchUpdateFormSchema),
    defaultValues: defaultValuesFor(branch),
  });

  const [handledState, setHandledState] = useState(state);

  if (state !== handledState) {
    setHandledState(state);

    if (state.success) {
      setOpen(false);
    }
  }

  function onOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(defaultValuesFor(branch));
    }

    setOpen(nextOpen);
  }

  const submit = handleSubmit((values) => {
    const formData = new FormData();
    formData.set("branchId", branch.id);

    for (const [key, value] of Object.entries(values)) {
      formData.set(key, String(value));
    }

    startTransition(() => formAction(formData));
  });

  function fieldError(field: keyof BranchUpdateFormValues) {
    return errors[field]?.message ?? state.fieldErrors?.[field]?.[0];
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Pencil aria-hidden="true" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {branch.name}</DialogTitle>
        </DialogHeader>

        <p className="text-xs leading-5 text-muted-foreground">
          Code <span className="font-mono">{branch.code}</span> and slug{" "}
          <span className="font-mono">{branch.slug}</span> are permanent and
          cannot be changed here.
        </p>

        <form onSubmit={submit} className="space-y-5" noValidate>
          <fieldset disabled={pending} className="space-y-5 disabled:opacity-70">
            <legend className="sr-only">Branch details</legend>

            <div>
              <label htmlFor="edit-branch-name" className="text-sm font-medium">
                Branch name
              </label>
              <input
                id="edit-branch-name"
                required
                aria-invalid={fieldError("name") ? true : undefined}
                className={controlClasses}
                {...register("name")}
              />
              {fieldError("name") && (
                <InlineFieldError>{fieldError("name")}</InlineFieldError>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="edit-branch-address-line1"
                  className="text-sm font-medium"
                >
                  Address line 1
                </label>
                <input
                  id="edit-branch-address-line1"
                  required
                  aria-invalid={fieldError("addressLine1") ? true : undefined}
                  className={controlClasses}
                  {...register("addressLine1")}
                />
                {fieldError("addressLine1") && (
                  <InlineFieldError>{fieldError("addressLine1")}</InlineFieldError>
                )}
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="edit-branch-address-line2"
                  className="text-sm font-medium"
                >
                  Address line 2{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  id="edit-branch-address-line2"
                  aria-invalid={fieldError("addressLine2") ? true : undefined}
                  className={controlClasses}
                  {...register("addressLine2")}
                />
              </div>

              <div>
                <label htmlFor="edit-branch-city" className="text-sm font-medium">
                  City or municipality
                </label>
                <input
                  id="edit-branch-city"
                  required
                  aria-invalid={fieldError("city") ? true : undefined}
                  className={controlClasses}
                  {...register("city")}
                />
                {fieldError("city") && (
                  <InlineFieldError>{fieldError("city")}</InlineFieldError>
                )}
              </div>

              <div>
                <label
                  htmlFor="edit-branch-province"
                  className="text-sm font-medium"
                >
                  Province
                </label>
                <input
                  id="edit-branch-province"
                  required
                  aria-invalid={fieldError("province") ? true : undefined}
                  className={controlClasses}
                  {...register("province")}
                />
                {fieldError("province") && (
                  <InlineFieldError>{fieldError("province")}</InlineFieldError>
                )}
              </div>

              <div>
                <label
                  htmlFor="edit-branch-postal-code"
                  className="text-sm font-medium"
                >
                  Postal code{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  id="edit-branch-postal-code"
                  inputMode="numeric"
                  className={controlClasses}
                  {...register("postalCode")}
                />
              </div>

              <div>
                <label
                  htmlFor="edit-branch-timezone"
                  className="text-sm font-medium"
                >
                  Timezone
                </label>
                <select
                  id="edit-branch-timezone"
                  required
                  className={controlClasses}
                  {...register("timezone")}
                >
                  <option value="Asia/Manila">Asia/Manila (Philippine Time)</option>
                </select>
              </div>

              <div>
                <label htmlFor="edit-branch-phone" className="text-sm font-medium">
                  Phone{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  id="edit-branch-phone"
                  type="tel"
                  className={controlClasses}
                  {...register("phone")}
                />
              </div>

              <div>
                <label htmlFor="edit-branch-email" className="text-sm font-medium">
                  Email{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  id="edit-branch-email"
                  type="email"
                  aria-invalid={fieldError("email") ? true : undefined}
                  className={controlClasses}
                  {...register("email")}
                />
                {fieldError("email") && (
                  <InlineFieldError>{fieldError("email")}</InlineFieldError>
                )}
              </div>
            </div>

            <label className="flex min-h-11 items-start gap-3 border-y py-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary"
                {...register("websiteVisible")}
              />
              <span>
                <span className="font-medium">Visible on the public website</span>
              </span>
            </label>
          </fieldset>

          {state.message && (
            <p
              role={state.success ? "status" : "alert"}
              className={
                state.success
                  ? "border-y border-success/25 bg-success-soft px-3 py-2 text-sm text-success"
                  : "border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              }
            >
              {state.message}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
