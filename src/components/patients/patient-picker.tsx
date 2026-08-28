"use client";

import { useId, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";

import { searchPatientsAction } from "@/app/(emr)/patients/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PatientListItem } from "@/lib/patients/types";

type PatientPickerProps = {
  actingBranchId: string;
  label?: string;
  onSelect(patient: PatientListItem): void;
};

export function PatientPicker({
  actingBranchId,
  label = "Patient",
  onSelect,
}: PatientPickerProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    setSearching(true);
    setError(null);
    try {
      const result = await searchPatientsAction({
        actingBranchId,
        query: query.trim() || undefined,
        status: "active",
        sort: "name_asc",
        page: 1,
        pageSize: 20,
      });
      if (!result.ok) {
        setResults([]);
        setError(
          result.code === "NOT_AUTHORIZED"
            ? "Your access does not allow searching patients."
            : "Patients could not be searched. Try again.",
        );
        return;
      }
      setResults(result.rows);
      if (result.rows.length === 0) setError("No patients match that search.");
    } catch {
      setResults([]);
      setError("Patients could not be searched. Try again.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="grid gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void runSearch();
            }
          }}
          placeholder="Name or patient number"
          aria-label={label}
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0"
          onClick={() => void runSearch()}
          disabled={searching}
        >
          {searching ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Search aria-hidden="true" />
          )}
          <span className="sr-only">Search</span>
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm leading-5 text-destructive">
          {error}
        </p>
      )}
      {results.length > 0 && (
        <ul className="divide-y rounded-md border" aria-label="Patient search results">
          {results.map((patient) => (
            <li key={patient.patientId}>
              <button
                type="button"
                onClick={() => {
                  onSelect(patient);
                  setResults([]);
                  setQuery("");
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <span className="truncate font-medium">{patient.displayName}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {patient.patientNumber}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}