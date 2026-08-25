"use client";

import { useState, type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ProcedureDetail } from "@/lib/procedures/types";
import type { ProviderListItem, Specialty } from "@/lib/providers/types";

import { ProcedureForm } from "./procedure-form";

export function ProcedureDialog({
  actingBranchId,
  children,
  procedure,
  specialties,
  providers,
}: {
  actingBranchId: string;
  children: ReactNode;
  procedure?: ProcedureDetail;
  specialties: Specialty[];
  providers: ProviderListItem[];
}) {
  const [open, setOpen] = useState(false);
  const title = procedure ? `Edit ${procedure.name}` : "Add procedure";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ProcedureForm
          actingBranchId={actingBranchId}
          inDialog
          onSuccess={() => setOpen(false)}
          procedure={procedure}
          specialties={specialties}
          providers={providers}
        />
      </DialogContent>
    </Dialog>
  );
}
