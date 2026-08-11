import type { ReactNode } from "react";

type InlineFieldErrorProps = {
  id?: string;
  children: ReactNode;
};

export function InlineFieldError({ id, children }: InlineFieldErrorProps) {
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm text-destructive">
      {children}
    </p>
  );
}
