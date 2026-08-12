import { Building2, Globe2 } from "lucide-react";

import type { BranchSummary } from "@/lib/branches";

function contactLabel(branch: BranchSummary) {
  return [branch.phone, branch.email].filter(Boolean).join(" · ") || "Not set";
}

function locationLabel(branch: BranchSummary) {
  return [branch.city, branch.province].filter(Boolean).join(", ");
}

function statusLabel(status: BranchSummary["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function BranchList({ branches }: { branches: BranchSummary[] }) {
  return (
    <section aria-labelledby="branch-directory-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="branch-directory-title" className="text-lg font-semibold">
            Branch directory
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {branches.length} {branches.length === 1 ? "location" : "locations"}
          </p>
        </div>
      </div>

      {branches.length === 0 ? (
        <div className="mt-4 flex gap-3 border-y bg-subtle-surface/60 px-4 py-6">
          <Building2
            className="mt-0.5 size-5 shrink-0 text-brand-navy-800"
            aria-hidden="true"
          />
          <div>
            <h3 className="text-sm font-semibold">No branches yet</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Add the organization&apos;s first operating location below.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto border-y md:block">
            <table className="w-full min-w-3xl border-collapse text-left text-sm">
              <thead className="bg-subtle-surface text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Branch
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Location
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Contact
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Website
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {branches.map((branch) => (
                  <tr key={branch.id}>
                    <th scope="row" className="px-3 py-3 font-medium">
                      {branch.name}
                      <span className="mt-0.5 block font-mono text-xs font-normal text-muted-foreground">
                        {branch.code} · {branch.slug}
                      </span>
                    </th>
                    <td className="px-3 py-3 text-muted-foreground">
                      {locationLabel(branch)}
                    </td>
                    <td className="max-w-72 px-3 py-3 text-muted-foreground">
                      {contactLabel(branch)}
                    </td>
                    <td className="px-3 py-3">
                      {statusLabel(branch.status)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {branch.website_visible ? "Visible" : "Hidden"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 divide-y border-y md:hidden">
            {branches.map((branch) => (
              <article key={branch.id} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{branch.name}</h3>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {branch.code} · {branch.slug}
                    </p>
                  </div>
                  <span className="text-xs font-medium">
                    {statusLabel(branch.status)}
                  </span>
                </div>
                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                    <dt className="text-muted-foreground">Location</dt>
                    <dd>{locationLabel(branch)}</dd>
                  </div>
                  <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                    <dt className="text-muted-foreground">Contact</dt>
                    <dd className="break-words">{contactLabel(branch)}</dd>
                  </div>
                  <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                    <dt className="text-muted-foreground">Website</dt>
                    <dd className="flex items-center gap-1.5">
                      <Globe2 className="size-3.5" aria-hidden="true" />
                      {branch.website_visible ? "Visible" : "Hidden"}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
