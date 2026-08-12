"use client";

import { startTransition, useActionState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";

import {
  createBranchAction,
  type CreateBranchState,
} from "@/app/(emr)/settings/branches/actions";
import { InlineFieldError } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import {
  branchFormSchema,
  branchSlugFromName,
  type BranchFormValues,
} from "@/lib/branches/schema";

const initialState: CreateBranchState = {};
const defaultValues: BranchFormValues = {
  name: "",
  code: "",
  slug: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  province: "",
  postalCode: "",
  timezone: "Asia/Manila",
  websiteVisible: false,
};
const controlClasses =
  "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";

export function BranchForm() {
  const [state, formAction, pending] = useActionState(
    createBranchAction,
    initialState,
  );
  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { dirtyFields, errors },
  } = useForm<BranchFormValues>({
    resolver: zodResolver(branchFormSchema),
    defaultValues,
  });
  const branchName = useWatch({ control, name: "name" });

  useEffect(() => {
    if (!dirtyFields.slug) {
      setValue("slug", branchSlugFromName(branchName), {
        shouldDirty: false,
      });
    }
  }, [branchName, dirtyFields.slug, setValue]);

  useEffect(() => {
    if (state.success && state.branchId) {
      reset(defaultValues);
    }
  }, [reset, state.branchId, state.success]);

  const submit = handleSubmit((values) => {
    const formData = new FormData();

    for (const [key, value] of Object.entries(values)) {
      formData.set(key, String(value));
    }

    startTransition(() => formAction(formData));
  });

  function fieldError(field: keyof BranchFormValues) {
    return errors[field]?.message ?? state.fieldErrors?.[field]?.[0];
  }

  function resetForm() {
    reset(defaultValues);
  }

  return (
    <section aria-labelledby="add-branch-title" className="mt-10 border-t pt-8">
      <div className="max-w-2xl">
        <h2 id="add-branch-title" className="text-lg font-semibold">
          Add branch
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Create the location record only. Staff, schedules, resources, and
          inventory are configured separately in later phases.
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Fields labeled optional may be left blank; all other fields are
          required.
        </p>
      </div>

      <form onSubmit={submit} className="mt-6 max-w-3xl space-y-6" noValidate>
        <fieldset disabled={pending} className="space-y-6 disabled:opacity-70">
          <legend className="sr-only">New branch details</legend>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="branch-name" className="text-sm font-medium">
                Branch name
              </label>
              <input
                id="branch-name"
                autoComplete="organization"
                required
                aria-invalid={fieldError("name") ? true : undefined}
                aria-describedby={
                  fieldError("name") ? "branch-name-error" : undefined
                }
                className={controlClasses}
                {...register("name")}
              />
              {fieldError("name") && (
                <InlineFieldError id="branch-name-error">
                  {fieldError("name")}
                </InlineFieldError>
              )}
            </div>

            <div>
              <label htmlFor="branch-code" className="text-sm font-medium">
                Code
              </label>
              <input
                id="branch-code"
                autoCapitalize="characters"
                spellCheck={false}
                required
                aria-invalid={fieldError("code") ? true : undefined}
                aria-describedby={
                  fieldError("code")
                    ? "branch-code-help branch-code-error"
                    : "branch-code-help"
                }
                className={controlClasses}
                {...register("code", {
                  onChange: (event) => {
                    event.target.value = event.target.value.toUpperCase();
                  },
                })}
              />
              <p
                id="branch-code-help"
                className="mt-1.5 text-xs leading-5 text-muted-foreground"
              >
                Short internal identifier, unique within this organization.
              </p>
              {fieldError("code") && (
                <InlineFieldError id="branch-code-error">
                  {fieldError("code")}
                </InlineFieldError>
              )}
            </div>

            <div>
              <label htmlFor="branch-slug" className="text-sm font-medium">
                Slug
              </label>
              <input
                id="branch-slug"
                autoCapitalize="none"
                spellCheck={false}
                required
                aria-invalid={fieldError("slug") ? true : undefined}
                aria-describedby={
                  fieldError("slug")
                    ? "branch-slug-help branch-slug-error"
                    : "branch-slug-help"
                }
                className={controlClasses}
                {...register("slug")}
              />
              <p
                id="branch-slug-help"
                className="mt-1.5 text-xs leading-5 text-muted-foreground"
              >
                Generated from the name; editable before saving.
              </p>
              {fieldError("slug") && (
                <InlineFieldError id="branch-slug-error">
                  {fieldError("slug")}
                </InlineFieldError>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Address</h3>
            <div className="mt-3 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="branch-address-line1"
                  className="text-sm font-medium"
                >
                  Address line 1
                </label>
                <input
                  id="branch-address-line1"
                  autoComplete="address-line1"
                  required
                  aria-invalid={fieldError("addressLine1") ? true : undefined}
                  aria-describedby={
                    fieldError("addressLine1")
                      ? "branch-address-line1-error"
                      : undefined
                  }
                  className={controlClasses}
                  {...register("addressLine1")}
                />
                {fieldError("addressLine1") && (
                  <InlineFieldError id="branch-address-line1-error">
                    {fieldError("addressLine1")}
                  </InlineFieldError>
                )}
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="branch-address-line2"
                  className="text-sm font-medium"
                >
                  Address line 2{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  id="branch-address-line2"
                  autoComplete="address-line2"
                  aria-invalid={fieldError("addressLine2") ? true : undefined}
                  aria-describedby={
                    fieldError("addressLine2")
                      ? "branch-address-line2-error"
                      : undefined
                  }
                  className={controlClasses}
                  {...register("addressLine2")}
                />
                {fieldError("addressLine2") && (
                  <InlineFieldError id="branch-address-line2-error">
                    {fieldError("addressLine2")}
                  </InlineFieldError>
                )}
              </div>

              <div>
                <label htmlFor="branch-city" className="text-sm font-medium">
                  City or municipality
                </label>
                <input
                  id="branch-city"
                  autoComplete="address-level2"
                  required
                  aria-invalid={fieldError("city") ? true : undefined}
                  aria-describedby={
                    fieldError("city") ? "branch-city-error" : undefined
                  }
                  className={controlClasses}
                  {...register("city")}
                />
                {fieldError("city") && (
                  <InlineFieldError id="branch-city-error">
                    {fieldError("city")}
                  </InlineFieldError>
                )}
              </div>

              <div>
                <label
                  htmlFor="branch-province"
                  className="text-sm font-medium"
                >
                  Province
                </label>
                <input
                  id="branch-province"
                  autoComplete="address-level1"
                  required
                  aria-invalid={fieldError("province") ? true : undefined}
                  aria-describedby={
                    fieldError("province")
                      ? "branch-province-error"
                      : undefined
                  }
                  className={controlClasses}
                  {...register("province")}
                />
                {fieldError("province") && (
                  <InlineFieldError id="branch-province-error">
                    {fieldError("province")}
                  </InlineFieldError>
                )}
              </div>

              <div>
                <label
                  htmlFor="branch-postal-code"
                  className="text-sm font-medium"
                >
                  Postal code{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  id="branch-postal-code"
                  autoComplete="postal-code"
                  inputMode="numeric"
                  aria-invalid={fieldError("postalCode") ? true : undefined}
                  aria-describedby={
                    fieldError("postalCode")
                      ? "branch-postal-code-error"
                      : undefined
                  }
                  className={controlClasses}
                  {...register("postalCode")}
                />
                {fieldError("postalCode") && (
                  <InlineFieldError id="branch-postal-code-error">
                    {fieldError("postalCode")}
                  </InlineFieldError>
                )}
              </div>

              <div>
                <label
                  htmlFor="branch-timezone"
                  className="text-sm font-medium"
                >
                  Timezone
                </label>
                <select
                  id="branch-timezone"
                  required
                  aria-invalid={fieldError("timezone") ? true : undefined}
                  aria-describedby={
                    fieldError("timezone")
                      ? "branch-timezone-error"
                      : undefined
                  }
                  className={controlClasses}
                  {...register("timezone")}
                >
                  <option value="Asia/Manila">Asia/Manila (Philippine Time)</option>
                </select>
                {fieldError("timezone") && (
                  <InlineFieldError id="branch-timezone-error">
                    {fieldError("timezone")}
                  </InlineFieldError>
                )}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Contact and visibility</h3>
            <div className="mt-3 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="branch-phone" className="text-sm font-medium">
                  Phone{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  id="branch-phone"
                  type="tel"
                  autoComplete="tel"
                  aria-invalid={fieldError("phone") ? true : undefined}
                  aria-describedby={
                    fieldError("phone") ? "branch-phone-error" : undefined
                  }
                  className={controlClasses}
                  {...register("phone")}
                />
                {fieldError("phone") && (
                  <InlineFieldError id="branch-phone-error">
                    {fieldError("phone")}
                  </InlineFieldError>
                )}
              </div>

              <div>
                <label htmlFor="branch-email" className="text-sm font-medium">
                  Email{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  id="branch-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  aria-invalid={fieldError("email") ? true : undefined}
                  aria-describedby={
                    fieldError("email") ? "branch-email-error" : undefined
                  }
                  className={controlClasses}
                  {...register("email")}
                />
                {fieldError("email") && (
                  <InlineFieldError id="branch-email-error">
                    {fieldError("email")}
                  </InlineFieldError>
                )}
              </div>
            </div>

            <label className="mt-5 flex min-h-11 items-start gap-3 border-y py-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary"
                {...register("websiteVisible")}
              />
              <span>
                <span className="font-medium">Visible on the public website</span>
                <span className="mt-0.5 block leading-5 text-muted-foreground">
                  Leave off until the public location details have been reviewed.
                  This does not enable online booking.
                </span>
              </span>
            </label>
          </div>
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

        <div className="flex flex-wrap items-center gap-3 border-t pt-5">
          <Button type="submit" size="lg" disabled={pending}>
            <Plus aria-hidden="true" />
            {pending ? "Adding branch…" : "Add branch"}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={pending}
            onClick={resetForm}
          >
            Clear form
          </Button>
          <p className="basis-full text-xs leading-5 text-muted-foreground sm:basis-auto">
            MFA confirmation is required before creation.
          </p>
        </div>
      </form>
    </section>
  );
}
