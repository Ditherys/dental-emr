"use client";

import * as React from "react";

import type { NumberingSystem } from "@/lib/odontogram/dentition";
import type { DentitionFilter } from "./measured-chart";
import type { LabelDensity, LayerVisibility } from "./measured-tooth";
import { OVERLAY_LAYERS, type OverlayLayer } from "./overlay-registry";

export interface OdontogramSettingsValue {
  notation: NumberingSystem;
  dentition: DentitionFilter;
  labelDensity: LabelDensity;
  language: "en" | "fil";
  visibleLayers: LayerVisibility;
  exportPreference: "screen" | "print";
}

export const DEFAULT_ODONTOGRAM_SETTINGS: OdontogramSettingsValue = {
  notation: "FDI",
  dentition: "permanent",
  labelDensity: "comfortable",
  language: "en",
  visibleLayers: Object.fromEntries(OVERLAY_LAYERS.map((name) => [name, true])),
  exportPreference: "screen",
};

export interface OdontogramSettingsProps {
  value?: Partial<OdontogramSettingsValue>;
  onChange?: (value: OdontogramSettingsValue) => void;
}

const LAYER_LABELS: Partial<Record<OverlayLayer, string>> = {
  CARIES: "Caries",
  RESTORATION: "Restorations",
  ROOT_FILL_COMPLETE: "Completed root filling",
  ROOT_FILL_INCOMPLETE: "Incomplete root filling",
  ROOT_FILL_MEDICAMENT: "Medicinal root filling",
  PLANNED: "Planned patterns",
  ORTHODONTIC: "Orthodontic markers",
};

const copy = {
  en: { title: "Chart display", helper: "Display settings affect this chart only; they never change clinical records." },
  fil: { title: "Display ng chart", helper: "Ang display settings ay para sa chart lamang; hindi nito binabago ang clinical record." },
} as const;

export function OdontogramSettings({ value, onChange }: OdontogramSettingsProps): React.ReactElement {
  const current: OdontogramSettingsValue = {
    ...DEFAULT_ODONTOGRAM_SETTINGS,
    ...value,
    visibleLayers: { ...DEFAULT_ODONTOGRAM_SETTINGS.visibleLayers, ...(value?.visibleLayers ?? {}) },
  };
  const update = (patch: Partial<OdontogramSettingsValue>) => onChange?.({ ...current, ...patch, visibleLayers: patch.visibleLayers ?? current.visibleLayers });
  const language = current.language;
  const displayLayers = OVERLAY_LAYERS.filter((name) => LAYER_LABELS[name]);

  return (
    <section data-testid="odontogram-settings" aria-label={copy[language].title} className="space-y-3 rounded-md border bg-card p-3 text-sm">
      <div>
        <h2 className="font-semibold">{copy[language].title}</h2>
        <p className="text-xs text-muted-foreground">{copy[language].helper}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium" htmlFor="odontogram-notation">Notation
          <select id="odontogram-notation" value={current.notation} onChange={(event) => update({ notation: event.target.value as NumberingSystem })} className="min-h-9 rounded-md border bg-background px-2 text-sm font-normal">
            <option value="FDI">FDI</option><option value="UNIVERSAL">Universal</option><option value="PALMER">Palmer</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium" htmlFor="odontogram-dentition">Dentition
          <select id="odontogram-dentition" value={current.dentition} onChange={(event) => update({ dentition: event.target.value as DentitionFilter })} className="min-h-9 rounded-md border bg-background px-2 text-sm font-normal">
            <option value="permanent">Permanent</option><option value="primary">Primary</option><option value="mixed">Mixed</option><option value="all">All</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium" htmlFor="odontogram-label-density">Label density
          <select id="odontogram-label-density" value={current.labelDensity} onChange={(event) => update({ labelDensity: event.target.value as LabelDensity })} className="min-h-9 rounded-md border bg-background px-2 text-sm font-normal">
            <option value="comfortable">Comfortable</option><option value="compact">Compact</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium" htmlFor="odontogram-language">Language
          <select id="odontogram-language" value={current.language} onChange={(event) => update({ language: event.target.value as "en" | "fil" })} className="min-h-9 rounded-md border bg-background px-2 text-sm font-normal">
            <option value="en">English</option><option value="fil">Filipino</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium" htmlFor="odontogram-export">Export display
          <select id="odontogram-export" value={current.exportPreference} onChange={(event) => update({ exportPreference: event.target.value as "screen" | "print" })} className="min-h-9 rounded-md border bg-background px-2 text-sm font-normal">
            <option value="screen">Screen</option><option value="print">Print layout</option>
          </select>
        </label>
      </div>
      <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-1 text-xs font-medium">Visible layers</legend>
        {displayLayers.map((name) => (
          <label key={name} className="inline-flex min-h-8 items-center gap-2 text-xs font-normal">
            <input type="checkbox" checked={current.visibleLayers[name] !== false} onChange={(event) => update({ visibleLayers: { ...current.visibleLayers, [name]: event.target.checked } })} />
            {LAYER_LABELS[name]}
          </label>
        ))}
      </fieldset>
    </section>
  );
}
