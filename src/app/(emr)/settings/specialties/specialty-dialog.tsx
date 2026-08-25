"use client";

import { useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Specialty } from "@/lib/providers/types";

import { SpecialtyForm } from "./specialty-form";

export function SpecialtyDialog({ actingBranchId, children, specialty }: { actingBranchId: string; children: ReactNode; specialty?: Specialty }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{specialty ? `Edit ${specialty.name}` : "Add custom specialty"}</DialogTitle>
        </DialogHeader>
        <SpecialtyForm actingBranchId={actingBranchId} inDialog onSuccess={() => setOpen(false)} specialty={specialty} />
      </DialogContent>
    </Dialog>
  );
}
