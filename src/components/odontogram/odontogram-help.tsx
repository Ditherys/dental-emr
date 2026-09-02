"use client";

import * as React from "react";

/**
 * The clinical chart's contextual help.
 *
 * It explains the EMR's own workspace: the three chart modes, notation,
 * selection, what a clinical record is, how a charge behaves, and how work is
 * saved. It deliberately documents no reset action, no Classic renderer, no
 * freehand drawing and no browser-local persistence, because none of those
 * exist here: every reload rebuilds the chart from authorized PostgreSQL
 * projections.
 */
export function OdontogramHelp(): React.ReactElement {
  return (
    <details data-testid="odontogram-help" className="rounded-md border bg-card px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">Clinical chart help</summary>
      <div className="mt-2 space-y-3 text-xs text-muted-foreground">
        <section aria-label="Chart modes">
          <h4 className="font-medium text-foreground">Chart modes</h4>
          <p>
            <strong>Current status</strong> shows what is true of the mouth now.{" "}
            <strong>Treatment plan</strong> shows what is proposed and has not happened;
            a proposal is never a record of care given.{" "}
            <strong>Periodontal</strong> is the six-site examination, its indices, and the
            staging/grading derived from them.
          </p>
        </section>

        <section aria-label="Notation and selection">
          <h4 className="font-medium text-foreground">Notation and selection</h4>
          <p>
            FDI is canonical; Universal and Palmer are display conversions only and never change
            what is stored. Tab enters the chart, arrow keys move between teeth, Home and End jump
            to the first or last tooth, and Enter or Space selects. Touch users tap a tooth. Use
            Select multiple for a range. Selection changes display state only and records nothing.
          </p>
        </section>

        <section aria-label="Clinical records">
          <h4 className="font-medium text-foreground">What you can record</h4>
          <p>
            Findings, planned treatment, treatment events, bridges, implants, notes and
            photographs. Every one derives its treating provider from your signed-in identity at
            the branch you are working in; there is no provider selector, and no record can be
            filed under another clinician.
          </p>
        </section>

        <section aria-label="Charges">
          <h4 className="font-medium text-foreground">Charges are confirmed once</h4>
          <p>
            The treating dentist confirms a procedure charge once. After confirmation it is
            immutable: a correction is a new, attributed ledger entry, never an edit. Payment may
            be immediate or by installment against the intended procedure case.
          </p>
        </section>

        <section aria-label="Saving">
          <h4 className="font-medium text-foreground">Saving, finalizing and amending</h4>
          <p>
            A periodontal examination autosaves as a draft while you measure. Finalizing signs it.
            A signed record is never overwritten: correcting it creates an amendment under its own
            lineage, and a withdrawal records a void. Both stay visible in the record. Nothing is
            held in this browser — every reload rebuilds the chart from the authorized record.
          </p>
        </section>

        <section aria-label="Legend">
          <h4 className="font-medium text-foreground">Legend</h4>
          <ul className="mt-1 grid gap-0.5">
            <li>Solid label — current clinical state</li>
            <li>Dashed label — planned proposal</li>
            <li>Struck label — void (withdrawn)</li>
            <li>Amended — corrected under its own lineage</li>
            <li>Draft — recorded but not yet signed</li>
          </ul>
          <p className="mt-1">
            The distinction is never colour alone: each state carries its own label and border
            style.
          </p>
        </section>

        <p>
          Measured anatomy source:{" "}
          <a
            className="underline"
            href="https://github.com/Ditherys/React-Odontogram-Modul"
            target="_blank"
            rel="noreferrer"
          >
            Ditherys/React-Odontogram-Modul
          </a>
          , pinned at <code>5e28d93</code>. <span>MIT License</span>; see{" "}
          <code>THIRD_PARTY_NOTICES.md</code>. The templates are reviewed and checked in; no
          renderer package runs here.
        </p>
      </div>
    </details>
  );
}
