"use client";

import { Building2, ChevronDown } from "lucide-react";

import {
  ALL_BRANCHES_VALUE,
  useBranchContext,
} from "@/components/layout/branch-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type BranchSelectorPresentation = "topbar" | "sidebar" | "rail";

export function BranchSelector({
  presentation = "topbar",
}: {
  presentation?: BranchSelectorPresentation;
}) {
  const { model, selection, selectBranch } = useBranchContext();
  const selectedBranch = model.branches.find(({ id }) => id === selection);
  const selectedLabel =
    selection === ALL_BRANCHES_VALUE
      ? "All Branches"
      : (selectedBranch?.name ?? "No branch access");
  const hasOptions = model.allowAllBranches || model.branches.length > 0;
  const rail = presentation === "rail";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={!hasOptions}>
        <Button
          variant="outline"
        className={cn(
          "min-w-0 justify-start gap-2",
            presentation === "topbar" &&
              "max-w-36 px-2.5 sm:min-w-44 sm:max-w-64",
            presentation === "sidebar" && "w-full max-w-none px-2.5",
            rail && "size-9 justify-center px-0",
        )}
        aria-label={`Branch context: ${selectedLabel}`}
        title={rail ? `Working branch: ${selectedLabel}` : selectedLabel}
      >
          <Building2 className="size-4 shrink-0" aria-hidden="true" />
          {!rail && <span className="truncate">{selectedLabel}</span>}
          {!rail && hasOptions && (
            <ChevronDown
              className="ml-auto size-4 shrink-0"
              aria-hidden="true"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={presentation === "topbar" ? "end" : "start"}
        side={rail ? "right" : "bottom"}
        className="w-[min(20rem,calc(100vw-1.5rem))] sm:w-(--radix-dropdown-menu-trigger-width) sm:min-w-56"
      >
        <DropdownMenuLabel>Working branch</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={selection ?? undefined}
          onValueChange={selectBranch}
          aria-label="Select working branch"
        >
          {model.allowAllBranches && (
            <DropdownMenuRadioItem value={ALL_BRANCHES_VALUE}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">All Branches</span>
                <span className="block text-xs text-muted-foreground">
                  Organization-wide workflow scope
                </span>
              </span>
            </DropdownMenuRadioItem>
          )}
          {model.branches.map((branch) => (
            <DropdownMenuRadioItem key={branch.id} value={branch.id}>
              <span
                className="min-w-0 flex-1 break-words whitespace-normal"
                title={branch.name}
              >
                {branch.name}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
