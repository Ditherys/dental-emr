"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NumberingSystem } from "@/lib/odontogram/dentition";

export type DentitionFilter = "all" | "permanent" | "primary";
export type ChartViewFilter = "all" | "current" | "planned";

export interface OdontogramToolbarProps {
  notation: NumberingSystem;
  dentition: DentitionFilter;
  view: ChartViewFilter;
  canWriteClinical: boolean;
  onNotationChange(next: NumberingSystem): void;
  onDentitionChange(next: DentitionFilter): void;
  onViewChange(next: ChartViewFilter): void;
  onPerioEntry(): void;
}

export function OdontogramToolbar({
  notation,
  dentition,
  view,
  canWriteClinical,
  onNotationChange,
  onDentitionChange,
  onViewChange,
  onPerioEntry,
}: OdontogramToolbarProps): React.ReactElement {
  return (
    <div
      data-testid="odontogram-toolbar"
      className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-2 py-2"
    >
      <div className="flex items-center gap-1">
        <span className="mr-1 hidden text-xs font-medium text-muted-foreground sm:inline">Notation</span>
        {(["FDI", "UNIVERSAL", "PALMER"] as const).map((system) => (
          <Button
            key={system}
            type="button"
            size="sm"
            variant={notation === system ? "default" : "outline"}
            aria-pressed={notation === system}
            onClick={() => onNotationChange(system)}
            className="min-h-8 px-2.5 text-xs"
          >
            {system === "UNIVERSAL" ? "Universal" : system === "PALMER" ? "Palmer" : "FDI"}
          </Button>
        ))}
      </div>

      <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />

      <div className="flex items-center gap-1">
        <span className="mr-1 hidden text-xs font-medium text-muted-foreground sm:inline">Dentition</span>
        {(["all", "permanent", "primary"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={dentition === value ? "secondary" : "outline"}
            aria-pressed={dentition === value}
            onClick={() => onDentitionChange(value)}
            className="min-h-8 px-2.5 text-xs capitalize"
          >
            {value}
          </Button>
        ))}
      </div>

      <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />

      <div className="flex items-center gap-1">
        <span className="mr-1 hidden text-xs font-medium text-muted-foreground sm:inline">View</span>
        {(["all", "current", "planned"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={view === value ? "secondary" : "outline"}
            aria-pressed={view === value}
            onClick={() => onViewChange(value)}
            className="min-h-8 px-2.5 text-xs capitalize"
          >
            {value}
          </Button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="min-h-8 text-xs">
              Options
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <p className="text-xs font-medium">Advanced options</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Rare actions like correction and bridge workflows live in the inspector. Keep chart surface focused on selection and immediate findings.
            </p>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          size="sm"
          variant={canWriteClinical ? "default" : "outline"}
          onClick={onPerioEntry}
          className="min-h-8 text-xs"
          aria-label="Open periodontal entry"
        >
          Perio entry
        </Button>
      </div>
    </div>
  );
}
