"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PESO_FORMAT = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Centavos are the ledger unit; pesos exist only for a human to read. */
export function formatCentavos(centavos: number): string {
  return PESO_FORMAT.format(centavos / 100);
}

export type ProcedureChargeConfirmationProps = {
  open: boolean;
  /** How this patient is identified on paper — number and name, never an id. */
  patientIdentifier: string;
  procedureName: string;
  toothCodes: readonly string[];
  serviceDate: string;
  amountCentavos: number;
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

/**
 * The last thing a dentist sees before a charge exists.
 *
 * It restates every fact the charge will carry and says plainly that the amount
 * is final. Nothing is written from here: cancelling returns to the form with
 * the draft intact, and confirming hands control back to the form, which owns
 * the single server call. Corrections after confirmation go through the
 * adjustment and void ledger workflow, never an edit of the amount.
 */
export function ProcedureChargeConfirmation({
  open,
  patientIdentifier,
  procedureName,
  toothCodes,
  serviceDate,
  amountCentavos,
  pending = false,
  onConfirm,
  onCancel,
}: ProcedureChargeConfirmationProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm procedure charge</DialogTitle>
          <DialogDescription>
            Check every line. Once confirmed this charge is part of the ledger and can only be
            corrected by an adjustment or a void, never by editing the amount.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-y py-3 text-sm">
          <dt className="text-muted-foreground">Patient</dt>
          <dd className="min-w-0 break-words font-medium">{patientIdentifier}</dd>
          <dt className="text-muted-foreground">Procedure</dt>
          <dd className="min-w-0 break-words font-medium">{procedureName}</dd>
          <dt className="text-muted-foreground">Teeth</dt>
          <dd className="min-w-0 break-words font-medium">{[...toothCodes].join(", ")}</dd>
          <dt className="text-muted-foreground">Service date</dt>
          <dd className="font-medium">{serviceDate}</dd>
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="text-base font-semibold tabular-nums">{formatCentavos(amountCentavos)}</dd>
        </dl>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="min-h-11"
            onClick={() => void onConfirm()}
            disabled={pending}
            aria-busy={pending}
          >
            Confirm charge — cannot be edited afterwards
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
