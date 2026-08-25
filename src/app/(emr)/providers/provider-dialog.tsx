"use client";

import { useState, type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ProviderDetail, Specialty } from "@/lib/providers/types";

import { ProviderForm } from "./provider-form";

type Branch = { id: string; name: string };

export function ProviderDialog({
  actingBranchId,
  branches,
  children,
  provider,
  specialties,
}: {
  actingBranchId: string;
  branches: Branch[];
  children: ReactNode;
  provider?: ProviderDetail;
  specialties: Specialty[];
}) {
  const [open, setOpen] = useState(false);
  const title = provider ? `Edit ${provider.firstName} ${provider.lastName}` : "Add provider";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ProviderForm
          actingBranchId={actingBranchId}
          branches={branches}
          inDialog
          onSuccess={() => setOpen(false)}
          provider={provider}
          specialties={specialties}
        />
      </DialogContent>
    </Dialog>
  );
}
