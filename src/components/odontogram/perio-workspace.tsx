"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { deriveCal, PERIO_SITE_ORDER } from "@/lib/odontogram/perio";
import type { PerioSite } from "@/lib/odontogram/clinical-codes";
import { PerioChart, type PerioChartMeasurement, type PerioSiteField, type PerioToothState } from "./perio-chart";

/**
 * The bounded six-site periodontal entry surface.
 *
 * Superseded as the primary work surface by
 * `periodontal-exam-workspace.tsx`, which is mounted as the third primary chart
 * mode and reads `get_periodontal_workspace_v2`. This component is retained and
 * still tested; it is no longer mounted by any route.
 */
type SiteKey = `${string}:${PerioSite}`;

export type PerioMeasurement = PerioChartMeasurement;
export type { PerioToothState };

export interface PerioExaminationMeta {
  id: string;
  status: "DRAFT" | "FINAL";
  version: number;
  examinationKind?: string;
  examinedAt?: string | null;
  examinedProviderId?: string | null;
  finalizedAt?: string | null;
  finalizedBy?: string | null;
  encounterId: string;
}

export interface PerioWorkspaceProps {
  patientId: string;
  actingBranchId: string;
  examination: PerioExaminationMeta;
  initialSites: PerioMeasurement[];
  historicalSites?: PerioMeasurement[];
  toothStates?: Readonly<Record<string, PerioToothState>>;
  onSave?: (payload: {
    actingBranchId: string;
    examinationId: string;
    sites: Array<{
      tooth_fdi: string;
      site: PerioSite;
      probing_depth_mm: number;
      gingival_margin_mm?: number;
      bleeding_on_probing?: boolean;
      suppuration?: boolean;
      tooth_present?: boolean;
      implant_context?: boolean;
    }>;
  }) => Promise<{ ok: boolean; code?: string }>;
  onFinalize?: (payload: { actingBranchId: string; examinationId: string; expectedVersion: number }) => Promise<{ ok: boolean; code?: string }>;
  onAmend?: (payload: { actingBranchId: string; predecessorExaminationId: string; encounterId: string }) => Promise<{ ok: boolean; code?: string; id?: string }>;
}

export const UPPER_TEETH = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"] as const;
export const LOWER_TEETH = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"] as const;
const ALL_PERIO_TEETH = [...UPPER_TEETH, ...LOWER_TEETH] as const;

function siteKey(toothFdi: string, site: PerioSite): SiteKey {
  return `${toothFdi}:${site}`;
}

function buildMap(sites: PerioMeasurement[]): Map<SiteKey, PerioMeasurement> {
  const map = new Map<SiteKey, PerioMeasurement>();
  for (const site of sites) map.set(siteKey(site.toothFdi, site.site), site);
  return map;
}

function defaultToothState(tooth: string, sites: ReadonlyMap<string, PerioMeasurement>, configured?: PerioToothState): Required<PerioToothState> {
  const measurements = PERIO_SITE_ORDER.map((site) => sites.get(siteKey(tooth, site)));
  return {
    toothPresent: configured?.toothPresent ?? !measurements.some((measurement) => measurement?.toothPresent === false),
    implantContext: configured?.implantContext ?? measurements.some((measurement) => measurement?.implantContext === true),
  };
}

function siteLabel(site: PerioSite): string {
  return ({ MB: "mesio-buccal", B: "buccal", DB: "disto-buccal", ML: "mesio-lingual", L: "lingual", DL: "disto-lingual" } as const)[site];
}

export function PerioWorkspace({
  patientId,
  actingBranchId,
  examination,
  initialSites,
  historicalSites,
  toothStates,
  onSave,
  onFinalize,
  onAmend,
}: PerioWorkspaceProps): React.ReactElement {
  const historicalMap = React.useMemo(() => buildMap(historicalSites ?? []), [historicalSites]);
  const [sites, setSites] = React.useState<Map<SiteKey, PerioMeasurement>>(() => buildMap(initialSites));
  const [saving, setSaving] = React.useState(false);
  const [finalizing, setFinalizing] = React.useState(false);
  const [amending, setAmending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [currentExam, setCurrentExam] = React.useState(examination);
  const [phoneTooth, setPhoneTooth] = React.useState<string>(UPPER_TEETH[0]);
  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSites(buildMap(initialSites));
    setCurrentExam(examination);
  }, [initialSites, examination]);

  const readOnly = currentExam.status === "FINAL";
  const getToothState = React.useCallback((tooth: string, source: ReadonlyMap<string, PerioMeasurement> = sites) => defaultToothState(tooth, source, toothStates?.[tooth]), [sites, toothStates]);

  const updateSite = React.useCallback((tooth: string, site: PerioSite, field: PerioSiteField, value: string | boolean) => {
    const state = getToothState(tooth);
    if (readOnly || !state.toothPresent || state.implantContext) return;
    setSites((previous) => {
      const next = new Map(previous);
      const key = siteKey(tooth, site);
      const existing = next.get(key);
      // Unknown is null all the way through. A margin nobody recorded is not a
      // margin of 0, and a bleeding answer nobody gave is not "no bleeding".
      let probingDepth = existing?.probingDepthMm ?? 0;
      let gingivalMargin: number | null = existing?.gingivalMarginMm ?? null;
      let bleedingOnProbing: boolean | null = existing?.bleedingOnProbing ?? null;
      let suppuration: boolean | null = existing?.suppuration ?? null;

      if (field === "pd") {
        const number = value === "" ? 0 : Number(value);
        if (value !== "" && (!Number.isInteger(number) || number < 1 || number > 15)) return previous;
        probingDepth = value === "" ? 0 : number;
        if (value === "") {
          next.delete(key);
          return next;
        }
      } else if (field === "gm") {
        const number = value === "" ? null : Number(value);
        if (number !== null && (!Number.isInteger(number) || number < -10 || number > 20)) return previous;
        gingivalMargin = number;
      } else if (field === "bop") {
        bleedingOnProbing = Boolean(value);
      } else {
        suppuration = Boolean(value);
      }

      if (probingDepth === 0) {
        next.delete(key);
        return next;
      }
      const calMm = deriveCal(probingDepth, gingivalMargin);
      if (calMm !== null && (calMm < -9 || calMm > 35)) return previous;
      next.set(key, {
        toothFdi: tooth,
        site,
        probingDepthMm: probingDepth,
        gingivalMarginMm: gingivalMargin,
        calMm,
        bleedingOnProbing,
        suppuration,
        toothPresent: state.toothPresent,
        implantContext: state.implantContext,
      });
      return next;
    });
  }, [getToothState, readOnly]);

  const handleSave = async () => {
    if (readOnly) return;
    const all = [...sites.values()].filter((measurement) => {
      const state = getToothState(measurement.toothFdi);
      return state.toothPresent && !state.implantContext;
    });
    if (all.length === 0) {
      setMessage("Nothing valid to save");
      return;
    }
    if (all.length > 200) {
      setMessage("Batch too large (max 200)");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = onSave ? await onSave({
        actingBranchId,
        examinationId: currentExam.id,
        sites: all.map((measurement) => ({
          tooth_fdi: measurement.toothFdi,
          site: measurement.site,
          probing_depth_mm: measurement.probingDepthMm,
          // An unknown value is omitted rather than sent. The existing save
          // boundary cannot yet persist "not assessed"; the periodontal
          // workspace boundary carries unknowns end to end.
          gingival_margin_mm: measurement.gingivalMarginMm ?? undefined,
          bleeding_on_probing: measurement.bleedingOnProbing ?? undefined,
          suppuration: measurement.suppuration ?? undefined,
          tooth_present: measurement.toothPresent,
          implant_context: measurement.implantContext,
        })),
      }) : { ok: true };
      setMessage(result.ok ? "Saved" : `Save failed: ${result.code ?? "error"}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmFinalize = async () => {
    if (readOnly) return;
    setFinalizing(true);
    setMessage(null);
    try {
      const result = onFinalize ? await onFinalize({ actingBranchId, examinationId: currentExam.id, expectedVersion: currentExam.version }) : { ok: true };
      if (result.ok) {
        setCurrentExam((previous) => ({ ...previous, status: "FINAL", version: previous.version + 1 }));
        setConfirmFinalizeOpen(false);
        setMessage("Finalized");
      } else {
        setMessage(`Finalize failed: ${result.code ?? "error"}`);
      }
    } finally {
      setFinalizing(false);
    }
  };

  const handleAmend = async () => {
    if (currentExam.status !== "FINAL") return;
    setAmending(true);
    setMessage(null);
    try {
      const result = onAmend ? await onAmend({ actingBranchId, predecessorExaminationId: currentExam.id, encounterId: currentExam.encounterId }) : { ok: true };
      setMessage(result.ok ? (result.id ? `Amended → ${result.id}` : "Amendment draft created") : `Amend failed: ${result.code ?? "error"}`);
    } finally {
      setAmending(false);
    }
  };

  const renderPhoneStep = () => {
    const phoneState = getToothState(phoneTooth);
    const index = ALL_PERIO_TEETH.indexOf(phoneTooth as (typeof ALL_PERIO_TEETH)[number]);
    const previousTooth = index > 0 ? ALL_PERIO_TEETH[index - 1] : null;
    const nextTooth = index >= 0 && index < ALL_PERIO_TEETH.length - 1 ? ALL_PERIO_TEETH[index + 1] : null;
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:hidden" aria-label="Stepwise phone edit">
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="text-xs font-medium text-slate-700" htmlFor="perio-phone-tooth">Tooth stepwise</label>
          <select id="perio-phone-tooth" value={phoneTooth} onChange={(event) => setPhoneTooth(event.target.value)} className="h-9 rounded-md border bg-white px-2 text-sm">
            {ALL_PERIO_TEETH.map((tooth) => <option key={tooth} value={tooth}>{tooth}</option>)}
          </select>
        </div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-9 flex-1" disabled={!previousTooth} onClick={() => previousTooth && setPhoneTooth(previousTooth)}>Prev {previousTooth ?? ""}</Button>
          <span className="text-sm font-semibold tabular-nums">{phoneTooth}</span>
          <Button type="button" variant="outline" size="sm" className="min-h-9 flex-1" disabled={!nextTooth} onClick={() => nextTooth && setPhoneTooth(nextTooth)}>Next {nextTooth ?? ""}</Button>
        </div>
        {!phoneState.toothPresent ? <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">Missing teeth cannot receive periodontal measurements.</p> : null}
        {phoneState.implantContext ? <p className="mb-2 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-800">Implant-context teeth use implant review; periodontal fields are disabled.</p> : null}
        <div className="grid gap-2">
          {PERIO_SITE_ORDER.map((site) => {
            const measurement = sites.get(siteKey(phoneTooth, site));
            const disabled = readOnly || !phoneState.toothPresent || phoneState.implantContext;
            const accessibleSite = siteLabel(site);
            return (
              <div key={site} className="grid grid-cols-[48px_1fr_1fr_auto] items-center gap-2 rounded-md border bg-white px-2 py-2">
                <span className="text-xs font-medium text-slate-600">{site}</span>
                <Input type="number" min={1} max={15} step={1} data-testid={`perio-phone-input-${phoneTooth}-${site}`} aria-label={`Tooth ${phoneTooth} ${accessibleSite} probing depth phone`} placeholder="PD" value={measurement?.probingDepthMm ? String(measurement.probingDepthMm) : ""} onChange={(event) => updateSite(phoneTooth, site, "pd", event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    document.getElementById(`perio-phone-tooth`)?.focus();
                  }
                }} className="h-9 text-center" disabled={disabled} inputMode="numeric" />
                <Input type="number" min={-10} max={20} step={1} aria-label={`Tooth ${phoneTooth} ${accessibleSite} gingival margin phone`} placeholder="GM" value={measurement && measurement.gingivalMarginMm !== null ? String(measurement.gingivalMarginMm) : ""} onChange={(event) => updateSite(phoneTooth, site, "gm", event.target.value)} className="h-9 w-full text-center" disabled={disabled} inputMode="numeric" />
                <span className="text-xs tabular-nums text-slate-600" data-testid={`perio-phone-cal-${phoneTooth}-${site}`}>{measurement && measurement.calMm !== null ? `CAL ${measurement.calMm}` : <span data-testid={`perio-unknown-cal-${phoneTooth}-${site}`} className="italic text-slate-400">Not recorded</span>}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderArch = (teeth: readonly string[], label: string) => (
    <PerioChart
      teeth={teeth}
      label={label}
      sites={sites}
      historicalSites={historicalMap}
      toothStates={toothStates}
      readOnly={readOnly}
      onSiteChange={updateSite}
      onToothFocus={setPhoneTooth}
    />
  );

  return (
    <div data-testid="perio-workspace" data-patient-id={patientId} data-examination-id={currentExam.id} className="@container max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusBadge variant={currentExam.status === "FINAL" ? "success" : "warning"}>{currentExam.status}</StatusBadge>
          <span className="text-slate-600">Exam {currentExam.id.slice(0, 8)} · v{currentExam.version}{currentExam.examinationKind ? ` · ${currentExam.examinationKind}` : ""}</span>
          {currentExam.examinedAt ? <span className="text-slate-500">· {new Date(currentExam.examinedAt).toLocaleDateString()}</span> : null}
          {currentExam.examinedProviderId ? <span className="text-slate-500">· provider {currentExam.examinedProviderId.slice(0, 8)}</span> : null}
          {historicalSites && historicalSites.length > 0 ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">history {historicalSites.length} sites</span> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={() => { setSites(buildMap(initialSites)); setMessage("Reloaded"); }} disabled={saving || finalizing} className="min-h-9">Reload</Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={readOnly || saving || sites.size === 0} data-testid="perio-save" className="min-h-9">{saving ? "Saving…" : "Save"}</Button>
          {currentExam.status === "DRAFT" ? <Button variant="secondary" size="sm" onClick={() => setConfirmFinalizeOpen(true)} disabled={finalizing} data-testid="perio-finalize" className="min-h-9">{finalizing ? "Finalizing…" : "Finalize"}</Button> : <Button variant="secondary" size="sm" onClick={() => void handleAmend()} disabled={amending} data-testid="perio-amend" className="min-h-9">{amending ? "Amending…" : "Create amendment"}</Button>}
        </div>
      </div>

      {message ? <div data-testid="perio-message" className="mb-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700" role="status">{message}</div> : null}
      {renderPhoneStep()}
      <div className="flex flex-col gap-6">{renderArch(UPPER_TEETH, "maxilla — buccal → palatal")}{renderArch(LOWER_TEETH, "mandible — buccal → lingual")}</div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500" aria-label="Severity legend not color only">
        <span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-emerald-400" aria-hidden="true" /> healthy H</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-amber-400 bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(255,255,255,0.45)_2px,rgba(255,255,255,0.45)_3px)]" aria-hidden="true" /> moderate M</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-red-500 bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,rgba(0,0,0,0.12)_3px,rgba(0,0,0,0.12)_4px)]" aria-hidden="true" /> severe S</span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Six probing sites: MB → B → DB → ML → L → DL. Arrow keys move between source inputs; Escape returns to the tooth. PD 1–15, GM −10…20, CAL = PD + GM (−9…35). BOP/SUP are available only for valid present natural teeth. Saves are bounded to 200 rows; final records are amended rather than edited.</p>

      <AlertDialog open={confirmFinalizeOpen} onOpenChange={setConfirmFinalizeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize periodontal examination?</AlertDialogTitle>
            <AlertDialogDescription>
              Finalizing locks this examination and its measurements. Corrections must be recorded as an attributed amendment; the signed-in dentist and service timestamp will be stored by the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={finalizing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void confirmFinalize(); }} disabled={finalizing}>{finalizing ? "Finalizing…" : "Confirm finalization"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
