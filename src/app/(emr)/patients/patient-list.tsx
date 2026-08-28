"use client";

import { useEffect, useState } from "react";
import { Search, UsersRound } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/feedback/empty-state";
import { useBranchContext, ALL_BRANCHES_VALUE } from "@/components/layout/branch-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PatientListActionResult } from "./actions";
import { searchPatientsAction } from "./actions";
import type { PatientListItem, PatientListQuery } from "@/lib/patients/types";

type PatientListProps = {
  initialResult: Extract<PatientListActionResult, { ok: true }>;
  initialActingBranchId: string;
  canViewArchived: boolean;
  loadPatients?: (query: PatientListQuery) => Promise<PatientListActionResult>;
};

const pageSize = 25;

function contactSummary(patient: PatientListItem) {
  return patient.primaryMobile ?? patient.primaryEmail ?? "No primary contact recorded";
}

export function PatientList({
  initialResult,
  initialActingBranchId,
  canViewArchived,
  loadPatients = searchPatientsAction,
}: PatientListProps) {
  const { selection } = useBranchContext();
  const [query, setQuery] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "archived" | "">("");
  const [sort, setSort] = useState<PatientListQuery["sort"]>("name_asc");
  const [page, setPage] = useState(initialResult.page);
  const [result, setResult] = useState(initialResult);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const actingBranchId =
    selection && selection !== ALL_BRANCHES_VALUE ? selection : initialActingBranchId;

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      const next = await loadPatients({
        actingBranchId,
        query: query || undefined,
        birthDate: birthDate || undefined,
        status: status || undefined,
        sort,
        page,
        pageSize,
      });
      setIsLoading(false);

      if (next.ok) {
        setResult(next);
        setError(null);
      } else if (next.code === "NOT_AUTHORIZED") {
        setError("Your access or selected branch changed. Return to the dashboard and try again.");
      } else {
        setError("Patient results could not be loaded. Try again.");
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [actingBranchId, birthDate, loadPatients, page, query, sort, status]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const changePage = (nextPage: number) => setPage(Math.min(Math.max(1, nextPage), totalPages));

  return (
    <section aria-labelledby="patient-directory-title" className="mt-4">
      <div className="border-y py-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_10rem_11rem_12rem] lg:items-end">
          <label className="grid gap-1.5 text-sm font-medium" htmlFor="patient-search">
            Find a patient
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="patient-search" value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} className="pl-9" placeholder="Name, number, mobile, or email" />
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium" htmlFor="patient-birth-date">
            Birth date
            <Input id="patient-birth-date" type="date" value={birthDate} onChange={(event) => { setPage(1); setBirthDate(event.target.value); }} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium" htmlFor="patient-sort">
            Sort by
            <Select id="patient-sort" value={sort} onChange={(event) => { setPage(1); setSort(event.target.value as PatientListQuery["sort"]); }}>
              <option value="name_asc">Name, A to Z</option>
              <option value="name_desc">Name, Z to A</option>
              <option value="patient_number_asc">Patient number</option>
              <option value="updated_desc">Recently updated</option>
            </Select>
          </label>
          {canViewArchived && (
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="patient-status">
              Status
              <Select id="patient-status" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as typeof status); }}>
                <option value="">Active</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </Select>
            </label>
          )}
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Patient records are shared across the organization. The selected branch provides workflow context and does not filter this directory.</p>
      </div>

      {error ? (
        <div role="alert" className="border-b px-4 py-5 text-sm text-muted-foreground">{error}</div>
      ) : result.rows.length === 0 && !isLoading ? (
        <EmptyState icon={UsersRound} title="No patients found" description="Try a different name, patient number, contact detail, birth date, or status." />
      ) : (
        <>
          <p id="patient-directory-title" className="py-2.5 text-sm text-muted-foreground" aria-live="polite">
            {isLoading ? "Updating patient results" : `${result.total} patient${result.total === 1 ? "" : "s"} found`}
          </p>
          <div className="hidden overflow-x-auto border-y md:block">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="bg-subtle-surface text-xs font-medium text-muted-foreground"><tr><th className="px-4 py-2.5">Patient</th><th className="px-4 py-2.5">Number</th><th className="px-4 py-2.5">Birth date</th><th className="px-4 py-2.5">Primary contact</th><th className="px-4 py-2.5">Status</th></tr></thead>
              <tbody>{result.rows.map((patient) => <tr key={patient.patientId} className="border-t"><td className="px-4 py-2.5 font-medium text-foreground"><Link className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/patients/${patient.patientId}`}>{patient.displayName}</Link></td><td className="px-4 py-2.5 font-mono text-xs">{patient.patientNumber}</td><td className="px-4 py-2.5">{patient.birthDate}</td><td className="px-4 py-2.5 text-muted-foreground">{contactSummary(patient)}</td><td className="px-4 py-2.5"><StatusBadge variant={patient.status === "active" ? "success" : patient.status === "archived" ? "neutral" : "warning"}>{patient.status}</StatusBadge></td></tr>)}</tbody>
            </table>
          </div>
          <ul className="divide-y border-y md:hidden" aria-label="Patient results">{result.rows.map((patient) => <li key={patient.patientId}><Link href={`/patients/${patient.patientId}`} className="block px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><p className="font-medium">{patient.displayName}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{patient.patientNumber}</p><p className="mt-2 text-sm">Born {patient.birthDate}</p><p className="mt-1 text-sm text-muted-foreground">{contactSummary(patient)}</p><p className="mt-2 text-xs font-medium capitalize text-muted-foreground">Status: {patient.status}</p></Link></li>)}</ul>
        </>
      )}

      <nav aria-label="Patient result pages" className="flex items-center justify-between gap-3 pt-4">
        <p className="text-sm text-muted-foreground">Page {result.page} of {totalPages}</p>
        <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => changePage(page - 1)} disabled={isLoading || page === 1}>Previous</Button><Button type="button" variant="outline" onClick={() => changePage(page + 1)} disabled={isLoading || page >= totalPages}>Next</Button></div>
      </nav>
    </section>
  );
}
