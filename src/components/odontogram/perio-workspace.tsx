"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { calculateCal, getCalSeverity, PERIO_SITE_ORDER } from "@/lib/odontogram/perio";
import type { PerioSite } from "@/lib/odontogram/clinical-codes";

type SiteKey = `${string}:${PerioSite}`;

export type PerioMeasurement = {
  toothFdi: string;
  site: PerioSite;
  probingDepthMm: number;
  gingivalMarginMm: number;
  calMm: number;
  bleedingOnProbing?: boolean;
  suppuration?: boolean;
};

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
  onSave?: (payload: {
    actingBranchId: string;
    examinationId: string;
    sites: Array<{
      tooth_fdi: string;
      site: PerioSite;
      probing_depth_mm: number;
      gingival_margin_mm: number;
      bleeding_on_probing?: boolean;
      suppuration?: boolean;
    }>;
  }) => Promise<{ ok: boolean; code?: string }>;
  onFinalize?: (payload: { actingBranchId: string; examinationId: string; expectedVersion: number }) => Promise<{ ok: boolean; code?: string }>;
  onAmend?: (payload: { actingBranchId: string; predecessorExaminationId: string; encounterId: string }) => Promise<{ ok: boolean; code?: string; id?: string }>;
}

const UPPER_TEETH = ["18","17","16","15","14","13","12","11","21","22","23","24","25","26","27","28"];
const LOWER_TEETH = ["48","47","46","45","44","43","42","41","31","32","33","34","35","36","37","38"];
const ALL_PERIO_TEETH = [...UPPER_TEETH, ...LOWER_TEETH] as const;

function siteKey(toothFdi: string, site: PerioSite): SiteKey { return `${toothFdi}:${site}`; }

function buildMap(sites: PerioMeasurement[]): Map<SiteKey, PerioMeasurement> {
  const m = new Map<SiteKey, PerioMeasurement>();
  for (const s of sites) m.set(siteKey(s.toothFdi, s.site), s);
  return m;
}

function VisBar({ cal, prevCal }: { cal: number | null; prevCal?: number | null }) {
  const severity = cal === null ? "healthy" : getCalSeverity(cal);
  const h = cal === null ? 2 : Math.min(36, Math.max(4, cal * 4));
  const color = severity === "healthy" ? "bg-emerald-400" : severity === "moderate" ? "bg-amber-400" : "bg-red-500";
  const pattern = severity === "healthy" ? "" : severity === "moderate" ? "bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(255,255,255,0.45)_2px,rgba(255,255,255,0.45)_3px)]" : "bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,rgba(0,0,0,0.12)_3px,rgba(0,0,0,0.12)_4px)]";
  return (
    <div className="flex flex-col items-center gap-0.5" title={cal === null ? "no CAL" : `CAL ${cal} — ${severity}`}>
      <div className="flex h-9 items-end">
        <div
          data-testid="perio-vis-bar"
          data-cal={cal ?? "—"}
          data-severity={severity}
          aria-label={cal === null ? "no measurement" : `CAL ${cal} ${severity}`}
          className={`w-3 rounded-t ${color} ${pattern} transition-all`}
          style={{ height: h }}
          aria-hidden="false"
          role="img"
        />
      </div>
      <span className="sr-only">{cal === null ? "no CAL" : `${cal} ${severity}`}</span>
      {prevCal !== null && prevCal !== undefined && cal !== null ? (
        <span className="text-[9px] tabular-nums text-slate-500">
          {cal - (prevCal as number) === 0 ? "±0" : cal - (prevCal as number) > 0 ? `+${cal - (prevCal as number)}` : `${cal - (prevCal as number)}`}
        </span>
      ) : null}
      {cal !== null ? (
        <span className="text-[8px] font-medium uppercase tracking-wide text-slate-500" aria-hidden="true">{severity === "healthy" ? "H" : severity === "moderate" ? "M" : "S"}</span>
      ) : null}
    </div>
  );
}

export function PerioWorkspace({
  patientId,
  actingBranchId,
  examination,
  initialSites,
  historicalSites,
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
  const [phoneTooth, setPhoneTooth] = React.useState<string>(UPPER_TEETH[0] as string);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSites(buildMap(initialSites));
    setCurrentExam(examination);
  }, [initialSites, examination]);

  const readOnly = currentExam.status === "FINAL";

  const getPdGm = (tooth: string, site: PerioSite): { pd: string; gm: string } => {
    const m = sites.get(siteKey(tooth, site));
    if (!m) return { pd: "", gm: "0" };
    return { pd: String(m.probingDepthMm), gm: String(m.gingivalMarginMm) };
  };

  const updateSite = (tooth: string, site: PerioSite, field: "pd" | "gm" | "bop" | "sup", value: string | boolean) => {
    if (readOnly) return;
    setSites((prev) => {
      const next = new Map(prev);
      const key = siteKey(tooth, site);
      const existing = next.get(key);
      let pd = existing?.probingDepthMm ?? 0;
      let gm = existing?.gingivalMarginMm ?? 0;
      let bop = existing?.bleedingOnProbing ?? false;
      let sup = existing?.suppuration ?? false;

      if (field === "pd") {
        const n = value === "" ? 0 : Number(value);
        if (value !== "" && (!Number.isInteger(n) || n < 1 || n > 15)) return prev;
        pd = value === "" ? 0 : n;
        if (value === "") { next.delete(key); return next; }
      } else if (field === "gm") {
        const n = value === "" ? 0 : Number(value);
        if (value !== "" && (!Number.isInteger(n) || n < -10 || n > 20)) return prev;
        gm = value === "" ? 0 : n;
      } else if (field === "bop") {
        bop = Boolean(value);
      } else if (field === "sup") {
        sup = Boolean(value);
      }

      if (pd === 0) { next.delete(key); return next; }
      const cal = calculateCal(pd, gm);
      if (cal < -9 || cal > 35) return prev;
      next.set(key, { toothFdi: tooth, site, probingDepthMm: pd, gingivalMarginMm: gm, calMm: cal, bleedingOnProbing: bop, suppuration: sup });
      return next;
    });
  };

  const handleSave = async () => {
    if (readOnly) return;
    const all = [...sites.values()];
    if (all.length === 0) { setMessage("Nothing to save"); return; }
    if (all.length > 200) { setMessage("Batch too large (max 200)"); return; }
    setSaving(true);
    setMessage(null);
    const payload = {
      actingBranchId,
      examinationId: currentExam.id,
      sites: all.map((m) => ({
        tooth_fdi: m.toothFdi,
        site: m.site,
        probing_depth_mm: m.probingDepthMm,
        gingival_margin_mm: m.gingivalMarginMm,
        bleeding_on_probing: m.bleedingOnProbing,
        suppuration: m.suppuration,
      })),
    };
    try {
      if (onSave) {
        const res = await onSave(payload);
        setMessage(res.ok ? "Saved" : `Save failed: ${res.code ?? "error"}`);
      } else {
        setMessage("Saved");
      }
    } finally { setSaving(false); }
  };

  const handleReload = () => {
    setSites(buildMap(initialSites));
    setMessage("Reloaded");
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    setMessage(null);
    try {
      if (onFinalize) {
        const res = await onFinalize({ actingBranchId, examinationId: currentExam.id, expectedVersion: currentExam.version });
        if (res.ok) { setCurrentExam((e) => ({ ...e, status: "FINAL", version: e.version + 1 })); setMessage("Finalized"); }
        else setMessage(`Finalize failed: ${res.code ?? "error"}`);
      } else {
        setCurrentExam((e) => ({ ...e, status: "FINAL", version: e.version + 1 }));
        setMessage("Finalized");
      }
    } finally { setFinalizing(false); }
  };

  const handleAmend = async () => {
    setAmending(true);
    setMessage(null);
    try {
      if (onAmend) {
        const res = await onAmend({ actingBranchId, predecessorExaminationId: currentExam.id, encounterId: currentExam.encounterId });
        if (res.ok) setMessage(res.id ? `Amended → ${res.id}` : "Amended");
        else setMessage(`Amend failed: ${res.code ?? "error"}`);
      } else {
        setMessage("Amended");
      }
    } finally { setAmending(false); }
  };

  const renderArch = (teeth: string[], label: string) => (
    <div data-arch={label} className="min-w-0" role="region" aria-label={`${label} periodontal grid`}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</div>
      <div className="overflow-x-auto -mx-1 px-1 [scrollbar-width:thin]" tabIndex={0} aria-label={`${label} horizontal scroll, use arrow keys to pan`}>
        <div className="min-w-[720px]">
          <div role="row" className="grid" style={{ gridTemplateColumns: `48px repeat(${teeth.length}, minmax(0, 1fr))` }}>
            <div role="columnheader" className="px-1 py-1 text-[10px] font-medium text-slate-500">Site</div>
            {teeth.map((t) => (
              <div key={t} role="columnheader" className="px-0.5 py-1 text-center text-xs font-semibold tabular-nums text-slate-700">{t}</div>
            ))}
          </div>

          <div role="row" className="grid" style={{ gridTemplateColumns: `48px repeat(${teeth.length}, minmax(0, 1fr))` }}>
            <div className="px-1 py-1 text-[10px] text-slate-500">Vis</div>
            {teeth.map((t) => {
              const calVals = PERIO_SITE_ORDER.map((s) => {
                const m = sites.get(siteKey(t, s));
                return m?.calMm ?? null;
              });
              const avgCal = calVals.filter((v): v is number => v !== null).length ? Math.round(calVals.filter((v): v is number => v !== null).reduce((a,b)=>a+b,0)/ calVals.filter((v): v is number => v !== null).length) : null;
              const prevAvg = (() => {
                const vals = PERIO_SITE_ORDER.map((s) => historicalMap.get(siteKey(t, s))?.calMm ?? null).filter((v): v is number => v!==null);
                return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : null;
              })();
              return (
                <div key={t} className="flex justify-center px-0.5 py-1">
                  <VisBar cal={avgCal} prevCal={prevAvg} />
                </div>
              );
            })}
          </div>

          {PERIO_SITE_ORDER.map((site) => (
            <div key={site} role="row" className="grid border-t border-slate-100" style={{ gridTemplateColumns: `48px repeat(${teeth.length}, minmax(0, 1fr))` }}>
              <div role="rowheader" className="flex items-center px-1 py-1 text-[11px] font-medium text-slate-600">{site}</div>
              {teeth.map((t) => {
                const m = sites.get(siteKey(t, site));
                const prev = historicalMap.get(siteKey(t, site));
                const { pd } = getPdGm(t, site);
                const gmVal = getPdGm(t, site).gm;
                const inputId = `perio-${t}-${site}-pd`;
                return (
                  <div key={`${t}-${site}`} role="gridcell" className="flex flex-col gap-0.5 px-0.5 py-1">
                    <div className="flex gap-0.5">
                      <Input
                        id={inputId}
                        data-testid={`perio-input-${t}-${site}`}
                        aria-label={`Tooth ${t} ${site} probing depth`}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="PD"
                        value={pd}
                        onChange={(e) => updateSite(t, site, "pd", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const idx = PERIO_SITE_ORDER.indexOf(site);
                            const nextSite = PERIO_SITE_ORDER[idx + 1];
                            const tIdx = teeth.indexOf(t);
                            if (nextSite) document.getElementById(`perio-${t}-${nextSite}-pd`)?.focus();
                            else if (tIdx < teeth.length - 1) document.getElementById(`perio-${teeth[tIdx+1]!}-MB-pd`)?.focus();
                          }
                          if (e.key === "Escape") (e.target as HTMLElement).blur();
                        }}
                        disabled={readOnly}
                        className="h-8 min-h-[32px] px-1 text-center text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-blue-500"
                      />
                      <Input
                        id={`perio-${t}-${site}-gm`}
                        data-testid={`perio-gm-${t}-${site}`}
                        aria-label={`Tooth ${t} ${site} gingival margin`}
                        inputMode="numeric"
                        pattern="-?[0-9]*"
                        placeholder="GM"
                        value={gmVal}
                        onChange={(e) => updateSite(t, site, "gm", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Tab" && !e.shiftKey) {
                            const idx = PERIO_SITE_ORDER.indexOf(site);
                            const nextSite = PERIO_SITE_ORDER[idx + 1];
                            if (nextSite) {
                              e.preventDefault();
                              document.getElementById(`perio-${t}-${nextSite}-pd`)?.focus();
                            }
                          } else if (e.key === "Tab" && e.shiftKey) {
                            e.preventDefault();
                            document.getElementById(`perio-${t}-${site}-pd`)?.focus();
                          }
                          if (e.key === "Escape") (e.target as HTMLElement).blur();
                        }}
                        disabled={readOnly}
                        className="h-8 w-9 min-h-[32px] px-1 text-center text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-blue-500"
                      />
                    </div>
                    {m ? (
                      <div className="flex items-center justify-between px-0.5 text-[10px] tabular-nums">
                        <span className={`font-medium ${m.calMm >= 6 ? "text-red-600" : m.calMm >= 4 ? "text-amber-600" : "text-slate-600"}`} data-testid={`perio-cal-${t}-${site}`} title={`${getCalSeverity(m.calMm)} severity`} aria-label={`CAL ${m.calMm} ${getCalSeverity(m.calMm)}`}>CAL {m.calMm}<span aria-hidden="true" className="ml-1 text-[9px]">{getCalSeverity(m.calMm) === "healthy" ? "H" : getCalSeverity(m.calMm) === "moderate" ? "M" : "S"}</span></span>
                        {prev ? <span className="text-slate-400">prev {prev.calMm}</span> : null}
                      </div>
                    ) : (
                      <span className="px-0.5 text-[10px] text-slate-400" aria-hidden="true">—</span>
                    )}
                    <label className="flex min-h-[28px] items-center gap-1 rounded px-1 py-0.5 text-[10px] text-slate-600 touch-manipulation focus-within:ring-1 focus-within:ring-blue-400">
                      <input
                        type="checkbox"
                        aria-label={`Tooth ${t} ${site} bleeding`}
                        checked={Boolean(m?.bleedingOnProbing)}
                        onChange={(e) => updateSite(t, site, "bop", e.target.checked)}
                        disabled={readOnly}
                        className="size-4 rounded border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500"
                      />
                      BOP
                      <input
                        type="checkbox"
                        aria-label={`Tooth ${t} ${site} suppuration`}
                        checked={Boolean(m?.suppuration)}
                        onChange={(e) => updateSite(t, site, "sup", e.target.checked)}
                        disabled={readOnly}
                        className="ml-1 size-4 rounded border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500"
                      />
                      SUP
                    </label>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const phoneIdx = ALL_PERIO_TEETH.indexOf(phoneTooth as never);
  const phonePrev = phoneIdx > 0 ? ALL_PERIO_TEETH[phoneIdx - 1] : null;
  const phoneNext = phoneIdx < ALL_PERIO_TEETH.length - 1 ? ALL_PERIO_TEETH[phoneIdx + 1] : null;

  const renderPhoneStep = () => {
    const mFor = (site: PerioSite) => sites.get(siteKey(phoneTooth, site));
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:hidden" aria-label="Stepwise phone edit">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium text-slate-700" htmlFor="perio-phone-tooth">Tooth stepwise</label>
          <select id="perio-phone-tooth" value={phoneTooth} onChange={(e) => setPhoneTooth(e.target.value)} className="h-9 rounded-md border bg-white px-2 text-sm">
            {ALL_PERIO_TEETH.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-9 flex-1" disabled={!phonePrev} onClick={() => phonePrev && setPhoneTooth(phonePrev)}>Prev {phonePrev ?? ""}</Button>
          <span className="text-sm font-semibold tabular-nums">{phoneTooth}</span>
          <Button type="button" variant="outline" size="sm" className="min-h-9 flex-1" disabled={!phoneNext} onClick={() => phoneNext && setPhoneTooth(phoneNext)}>Next {phoneNext ?? ""}</Button>
        </div>
        <div className="grid gap-2">
          {PERIO_SITE_ORDER.map((site) => {
            const m = mFor(site);
            const pd = getPdGm(phoneTooth, site).pd;
            const gm = getPdGm(phoneTooth, site).gm;
            return (
              <div key={site} className="grid grid-cols-[48px_1fr_1fr_auto] items-center gap-2 rounded-md border bg-white px-2 py-2">
                <span className="text-xs font-medium text-slate-600">{site}</span>
                <Input data-testid={`perio-phone-input-${phoneTooth}-${site}`} aria-label={`Tooth ${phoneTooth} ${site} probing depth phone`} placeholder="PD" value={pd} onChange={(e) => updateSite(phoneTooth, site, "pd", e.target.value)} className="h-9 text-center" disabled={readOnly} inputMode="numeric" />
                <Input aria-label={`Tooth ${phoneTooth} ${site} gingival margin phone`} placeholder="GM" value={gm} onChange={(e) => updateSite(phoneTooth, site, "gm", e.target.value)} className="h-9 w-full text-center" disabled={readOnly} inputMode="numeric" />
                <span className="text-xs tabular-nums text-slate-600" data-testid={`perio-phone-cal-${phoneTooth}-${site}`}>{m ? `CAL ${m.calMm}` : "—"}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div data-testid="perio-workspace" data-patient-id={patientId} data-examination-id={currentExam.id} className="@container max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusBadge variant={currentExam.status === "FINAL" ? "success" : "warning"}>{currentExam.status}</StatusBadge>
          <span className="text-slate-600">Exam {currentExam.id.slice(0, 8)} · v{currentExam.version} {currentExam.examinationKind ? `· ${currentExam.examinationKind}` : ""}</span>
          {currentExam.examinedAt ? <span className="text-slate-500">· {new Date(currentExam.examinedAt).toLocaleDateString()}</span> : null}
          {currentExam.examinedProviderId ? <span className="text-slate-500">· provider {currentExam.examinedProviderId.slice(0, 8)}</span> : null}
          {historicalSites && historicalSites.length > 0 ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">history {historicalSites.length} sites</span> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={handleReload} disabled={saving || finalizing} className="min-h-9">Reload</Button>
          <Button size="sm" onClick={handleSave} disabled={readOnly || saving || sites.size === 0} data-testid="perio-save" className="min-h-9">{saving ? "Saving…" : "Save"}</Button>
          {currentExam.status === "DRAFT" ? (
            <Button variant="secondary" size="sm" onClick={handleFinalize} disabled={finalizing} data-testid="perio-finalize" className="min-h-9">{finalizing ? "Finalizing…" : "Finalize"}</Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={handleAmend} disabled={amending} data-testid="perio-amend" className="min-h-9">{amending ? "Amending…" : "Amend"}</Button>
          )}
        </div>
      </div>

      {message ? <div data-testid="perio-message" className="mb-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700" role="status">{message}</div> : null}

      {renderPhoneStep()}

      <div className="flex flex-col gap-6">
        {renderArch(UPPER_TEETH, "maxilla — buccal → palatal")}
        {renderArch(LOWER_TEETH, "mandible — buccal → lingual")}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500" aria-label="Severity legend not color only">
        <span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-emerald-400" aria-hidden="true" /> healthy H</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-amber-400 bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(255,255,255,0.45)_2px,rgba(255,255,255,0.45)_3px)]" aria-hidden="true" /> moderate M</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-red-500 bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,rgba(0,0,0,0.12)_3px,rgba(0,0,0,0.12)_4px)]" aria-hidden="true" /> severe S</span>
      </div>

      <div className="mt-2 text-[11px] text-slate-500">
        Tab through MB → B → DB → ML → L → DL per tooth, Enter advances. PD 1–15, GM −10…20, CAL = PD + GM (−9…35). BOP/SUP only at charted sites. Bounded batches ≤200 rows via savePeriodontalMeasurements. On phone use stepwise tooth selector above; grid scrolls horizontally without page overflow.
      </div>
    </div>
  );
}
