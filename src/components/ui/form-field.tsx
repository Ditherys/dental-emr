import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
};

export function FormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
  className,
}: FormFieldProps) {
  return (
    <label htmlFor={htmlFor} className={cn("grid gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </span>
      {children}
      {hint && !error && (
        <span className="text-xs leading-5 text-muted-foreground">{hint}</span>
      )}
      {error && (
        <span role="alert" className="text-xs leading-5 text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}