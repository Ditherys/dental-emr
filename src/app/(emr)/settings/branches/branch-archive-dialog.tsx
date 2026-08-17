"use client";

import { startTransition, useActionState, useState } from "react";
import { Archive } from "lucide-react";

import { archiveBranchAction, type ArchiveBranchState } from "./actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { BranchSummary } from "@/lib/branches";

const initialState: ArchiveBranchState = {};

export function BranchArchiveDialog({ branch }: { branch: BranchSummary }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    archiveBranchAction,
    initialState,
  );
  const [handledState, setHandledState] = useState(state);

  if (state !== handledState) {
    setHandledState(state);

    if (state.success) {
      setOpen(false);
    }
  }

  function submit(event: { preventDefault: () => void }) {
    // AlertDialogAction closes the dialog on click by default (Radix); that
    // would hide a failure message (e.g. "last remaining branch") the instant
    // it appears. Prevent the automatic close and let the success effect
    // above close it deliberately once the action actually succeeds.
    event.preventDefault();
    const formData = new FormData();
    formData.set("branchId", branch.id);
    startTransition(() => formAction(formData));
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Archive aria-hidden="true" />
          Archive
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {branch.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This branch will no longer appear as an active operating location.
            Staff access, schedules, and historical records tied to it are not
            deleted. This cannot be undone from this screen.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {state.message && !state.success && (
          <p
            role="alert"
            className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {state.message}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={submit}>
            {pending ? "Archiving…" : "Archive branch"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
