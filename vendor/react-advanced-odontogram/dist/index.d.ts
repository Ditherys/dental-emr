import { JSX as JSX_2 } from 'react/jsx-runtime';
import { ReactNode } from 'react';

/** User accepted the divergence: run the deferred edit (status only — the plan
 *  stays as planned), then notify (post-edit refresh + close the modal). No-op
 *  when nothing is pending. */
export declare function acceptDualStateConfirm(): void;

export declare type ActiveCaries = {
    surfaces: ActiveCariesSurface[];
    subcrownChecked: boolean;
    subcrownDisabled: boolean;
    subcrownLabel: string;
    cariesActiveDepth: number;
    rootCariesDisplay: string;
    cariesDepthVisible: boolean;
    rootCariesVisible: boolean;
    cariesSectionVisible: boolean;
};

/** One caries surface-cross cell's fully-resolved render state. */
export declare type ActiveCariesSurface = {
    value: string;
    surface: string;
    pos: string;
    letter: string;
    label: string;
    checked: boolean;
    disabled: boolean;
    depth: string;
    icdas: number;
    isIcdas: boolean;
    radio: string | null;
};

export declare type ActiveFillings = {
    surfaces: ActiveFillingSurface[];
    fillingMaterial: string;
    fillingOptions: {
        value: string;
        label: string;
    }[];
    surfaceGridVisible: boolean;
    defectDisabled: boolean;
    simpleMode: boolean;
    simpleRowVisible: boolean;
    simpleToggleChecked: boolean;
    simpleDefectRowVisible: boolean;
    simpleDefectValue: string;
    simpleDefectOptions: {
        value: string;
        label: string;
    }[];
    fissureSealing: boolean;
    fissureRowVisible: boolean;
    fillingSectionVisible: boolean;
    subcariesSummary: string;
    defectSummary: string;
};

/** One filling-surface cell's fully-resolved render state (mirrors the DOM the
 *  imperative `buildSurfaceCross` + `syncFillingSubcariesIndicator` +
 *  `syncFillingDefectIndicator` produced for `#fillingSurfaceChecks`). */
export declare type ActiveFillingSurface = {
    value: string;
    surface: string;
    pos: string;
    letter: string;
    label: string;
    labelId: string;
    checked: boolean;
    material: string;
    hasSubcaries: boolean;
    subDepth: string;
    subIcdas: number;
    isIcdas: boolean;
    hasDefect: boolean;
    defectValue: string | null;
};

export declare type ActiveOrtho = {
    appliance: string;
    drift: string;
    vertical: string;
    rotation: boolean;
    visible: boolean;
};

export declare type ActiveRootPerio = {
    sectionVisible: boolean;
    rootBlockVisible: boolean;
    perioBlockVisible: boolean;
    pulpEndoValue: string;
    pulpEndoNoneOption: RootPerioOption | null;
    pulpEndoGroups: RootPerioOptGroup[];
    pulpEndoDisabled: boolean;
    apicalDxValue: string;
    apicalDxOptions: RootPerioOption[];
    apicalDxDisabled: boolean;
    apicalDxRowVisible: boolean;
    periapicalTypeValue: string;
    periapicalTypeOptions: RootPerioOption[];
    periapicalRowVisible: boolean;
    resorptionValue: string;
    resorptionOptions: RootPerioOption[];
    resorptionDisabled: boolean;
    resorptionRowVisible: boolean;
    endoResectionChecked: boolean;
    endoResectionDisabled: boolean;
    parapulpalPinChecked: boolean;
    parapulpalPinDisabled: boolean;
    mobilityValue: string;
    mobilityOptions: RootPerioOption[];
    mobilityDisabled: boolean;
    mobilityRowVisible: boolean;
    perioRowVisible: boolean;
    mods: ActiveRootPerioMod[];
    calculusChecked: boolean;
    calculusRowVisible: boolean;
    periImplantValue: string;
    periImplantOptions: RootPerioOption[];
    periImplantRowVisible: boolean;
};

/** One `#modsChecks` checkbox's fully-resolved render state. `hiddenClass`
 *  reproduces the `.hidden` class the sub-syncs toggled on the wrapping
 *  `<label>`; `styleHidden` reproduces the `style.display:none` the
 *  `setDisabled()`→`syncControlLabelVisibility()` path applied. */
export declare type ActiveRootPerioMod = {
    value: string;
    label: string;
    checked: boolean;
    disabled: boolean;
    hiddenClass: boolean;
    styleHidden: boolean;
};

export declare type ActiveToothDetails = {
    toothSelectValue: string;
    toothSelectOptions: ToothDetailsOption[];
    substrateValue: string;
    substrateOptions: ToothDetailsOption[];
    substrateRowVisible: boolean;
    extractionWoundChecked: boolean;
    extractionRowVisible: boolean;
    missingClosedChecked: boolean;
    missingClosedRowVisible: boolean;
    restorationValue: string;
    restorationOptions: ToothDetailsOption[];
    restorationRowVisible: boolean;
    crownLeakageChecked: boolean;
    crownLeakageRowVisible: boolean;
    brokenMesialChecked: boolean;
    brokenIncisalChecked: boolean;
    brokenDistalChecked: boolean;
    brokenCrownRowVisible: boolean;
    contactMesialChecked: boolean;
    contactDistalChecked: boolean;
    contactPointRowVisible: boolean;
    bruxismRowVisible: boolean;
    wearSimple: boolean;
    wearEdgeValue: string;
    wearEdgeOptions: ToothDetailsOption[];
    wearEdgeToggleChecked: boolean;
    wearCervicalValue: string;
    wearCervicalOptions: ToothDetailsOption[];
    wearCervicalToggleChecked: boolean;
    discolorationRowVisible: boolean;
    discoSimple: boolean;
    discolorationValue: string;
    discolorationOptions: ToothDetailsOption[];
    discolorationToggleChecked: boolean;
    crownActionsRowVisible: boolean;
    bridgePillarChecked: boolean;
    bridgePillarRowVisible: boolean;
    extractionPlanChecked: boolean;
    extractionPlanRowVisible: boolean;
    extractionPlanParent: ExtractionPlanParent;
    crownReplaceChecked: boolean;
    crownReplaceRowVisible: boolean;
    crownNeededChecked: boolean;
    crownNeededRowVisible: boolean;
};

declare type Any = any;

/**
 * Root React component for the Odontogram Editor (aka `OdontogramShell`).
 *
 * Renders the full dental chart UI: top bar with language/numbering/dark-mode
 * controls, the SVG tooth grid, and the right-hand control panel for setting
 * tooth states (caries, fillings, crowns, endo, inflammation, etc.).
 *
 * Since the composable-UI refactor (design/composable-ui.md, Tier 1) this is a
 * THIN composition: it mounts {@link OdontogramProvider} (which owns all state,
 * effects and handlers) and lays out the four surface components + the
 * shell-managed perio bits and modals in the default arrangement. The default
 * composition renders byte-identical DOM to the pre-refactor shell (frozen by
 * `src/__tests__/parity/shell-dom.test.tsx`). A host can instead compose the
 * exported surfaces under its own wrappers inside an `OdontogramProvider`.
 *
 * @example
 * ```tsx
 * // Standalone usage
 * <App />
 *
 * // Controlled by a host application
 * <App
 *   language="en"
 *   onLanguageChange={setLang}
 *   numberingSystem="FDI"
 *   onNumberingChange={setNumbering}
 *   darkMode={isDark}
 *   onDarkModeChange={setDark}
 * />
 * ```
 */
declare function App(props: Omit<OdontogramProviderProps, "children">): JSX_2.Element;
export { App as OdontogramShell }
export default App;

/** Apply the MIXED dentition preset — see {@link applyPrimaryDentition}; gated
 *  STRUCTURAL edit with per-tooth no-op signaling and the `edentulous` flip
 *  inside the gated closure. */
export declare function applyMixedDentition(): void;

/** Apply the PRIMARY (deciduous) dentition preset — a STRUCTURAL
 *  interactive edit (not a reset), routed through the batch gate. `targetFor`
 *  is the state each tooth ends up in; only teeth that actually change are
 *  passed to the gate so unchanged teeth are not marked plan-edited / mirrored
 *  (per-tooth no-op signaling). Uninitialized plan stays a pure passthrough.
 *  The `edentulous` flip + button state live INSIDE the gated closure so on the
 *  deferred-confirm path they take effect only on Accept — otherwise Cancel
 *  would leave `edentulous` flipped while every tooth
 *  is untouched (flag/teeth mismatch). `notifyStateChange()` moves inside too so
 *  the whole-mouth refresh fires when the batch actually applies. */
export declare function applyPrimaryDentition(): void;

export declare function applyStatusExtra(option: Any): void;

/** User cancelled: do NOT apply the edit; re-sync the active tooth's controls
 *  from stored state so the control the user just changed snaps back (no stale
 *  UI), then notify (refresh + close the modal). No-op when nothing is pending. */
export declare function cancelDualStateConfirm(): void;

export declare function CariesCard(): JSX_2.Element;

declare type ChartMode = "status" | "plan";

/** Remove the stored entry for the active (or default) key. */
export declare function clearPersistedState(): void;

/**
 * Clear the current tooth selection and reset the active tooth. Useful when
 * switching to view or quote-builder mode from the host application.
 */
export declare function clearSelection(): void;

/** Close the perio-chart overlay. No-op (still notifies) if already closed. */
export declare function closePerioOverlay(): void;

/**
 * Tear down the odontogram engine: clear all DOM elements built by the engine,
 * unsubscribe from i18n changes, and reset internal state. After this call,
 * {@link initOdontogram} may be called again to re-initialise.
 */
export declare function destroyOdontogram(): void;

/** Stop persisting. The stored entry is left in place (see clearPersistedState).
 *  A pending debounced save is flushed first so the last edit isn't lost. */
export declare function disablePersistence(): void;

/**
 * Turn on localStorage persistence: restores a previously saved case (if any),
 * then saves on every state change. Idempotent — calling again replaces the
 * previous subscription and options. Call AFTER the odontogram has mounted.
 */
export declare function enablePersistence(options?: PersistenceOptions): void;

/**
 * Export the current odontogram as an HL7 FHIR R4 collection Bundle (JSON).
 * @param options - Optional subject reference (e.g. "Patient/123"); when
 *   omitted a placeholder Patient is embedded.
 */
export declare function exportFhir(options?: FhirExportOptions): void;

/**
 * Export the odontogram as PNG or JPG. Renders the serialized SVG via the
 * browser's native rasterizer (Image → canvas) — much faster than the previous
 * html2canvas DOM rasterization, and sharper.
 */
export declare function exportImage(format?: "png" | "jpg"): Promise<void>;

/**
 * Assemble a printable PDF report (jsPDF-native — vector text + raster chart
 * PNGs, no svg2pdf.js). Gathers all `data` (SVG→PNG
 * rasterization via {@link rasterizeSvgToPng}, summary/classification text,
 * `hasAnyPerioData()`), drives the export-progress overlay, then hands off
 * to the PURE `assemblePdf()` (`src/perioPdf.ts`), which decides section
 * layout from `opts`/`data` alone.
 *
 * jsPDF-in-jsdom note: constructing a real `jsPDF` instance depends on
 * browser canvas/font internals jsdom doesn't fully provide, so this
 * wrapper is NOT unit-tested directly — `assemblePdf`'s section-gating IS
 * thoroughly unit-tested with an injectable fake doc (see
 * `ui3b-export-pdf.test.ts`). This wrapper's own raster→layout→save path is a
 * browser-verify item.
 */
export declare function exportPdf(opts: PdfExportOptions): Promise<void>;

/** Export the full perio chart as PNG/JPG (SVG → canvas @2×, via the
 *  shared {@link rasterizeSvgToCanvas} raster core). */
export declare function exportPerioImage(format?: "png" | "jpg"): Promise<void>;

/** Export the full perio chart as a standalone vector SVG file. */
export declare function exportPerioSvg(): Promise<void>;

export declare function exportStatus(): void;

export declare function exportSvg(): Promise<void>;

export declare type ExtractionPlanParent = "brokenCrownRow" | "bruxismRow" | "crownActionsRow";

/** Options for buildFhirBundle / exportFhir. */
export declare interface FhirExportOptions {
    /**
     * FHIR reference string for the subject, e.g. "Patient/123".
     * When omitted, a placeholder Patient resource is added to the Bundle and
     * referenced by every Observation.
     */
    subject?: string;
}

/** Fillings card complexity — "complex" = per-surface grid (default), "simple"
 *  = one filled/not-filled toggle for the whole tooth. */
export declare type FillingComplexity = "complex" | "simple";

export declare function FillingsCard(): JSX_2.Element;

/** Formats a tooth number for display using the active numbering system AND
 *  the milktooth display-remap ({@link getDisplayedToothNumber}) — the exact
 *  same formatting {@link getOdontogramSummary} uses for every tooth number
 *  it prints (permanent/missing lists, per-section entries, implants). Exported
 *  so the "What changes" box in App.tsx can label a {@link PlanChange.toothNo}
 *  identically, without duplicating the numbering/milktooth logic. */
export declare function formatToothLabel(toothNo: number): string;

export declare function getActiveCaries(): ActiveCaries;

export declare function getActiveFillings(): ActiveFillings;

export declare function getActiveOrtho(): ActiveOrtho | null;

export declare function getActiveRootPerio(): ActiveRootPerio;

export declare function getActiveToothDetails(): ActiveToothDetails;

export declare function getCariesDepthEnabled(): boolean;

export declare function getCariesDepthOptions(): Array<{
    value: number;
    label: string;
    title?: string;
}>;

/** Current active chart mode ("status" | "plan"). */
export declare function getChartMode(): ChartMode;

export declare function getDiscolorationDetailLevel(): ToothDetailLevel;

/** Read the whole-mouth edentulous flag. Backs the declarative Statuses card's
 *  `#btnEdentulous` `aria-pressed` via `useEngineState(getEdentulous)`, replacing
 *  the former imperative `setToggleButton($("#btnEdentulous"), …)` syncs — every
 *  path that flips `edentulous` fires `notifyStateChange()`, so the React button
 *  re-reads this and re-renders. */
export declare function getEdentulous(): boolean;

export declare function getFillingComplexity(): "complex" | "simple";

export declare function getFillingDefectEnabled(): boolean;

export declare function getFillingMaterialAvailability(): Record<string, boolean>;

export declare function getFissureSealingEnabled(): boolean;

export declare function getIcdasEnabled(): boolean;

/**
 * Get the current notes-enabled state.
 */
export declare function getNotesEnabled(): boolean;

export declare function getOdontogramSummary(): OdontogramSummary;

export declare function getPdfSettings(): PdfSettings;

/** Current perio index-name display mode. Defaults to `"translated"`. */
export declare function getPerioIndexNameMode(): PerioIndexNameMode;

/** Current per-index perio-chart row visibility. Defaults to all-visible. */
export declare function getPerioRowVisibility(): Record<PerioRowId, boolean>;

/** Current perio-chart housing mode. Defaults to `"toggle"`. */
export declare function getPerioViewMode(): PerioViewMode;

/**
 * Compare the "status" chart against the "plan" chart, tooth by tooth and
 * axis by axis (see {@link DIFF_AXES}), and report every axis whose label
 * differs. Pure and read-only: never mutates either chart, never touches the
 * DOM, never renders — a `parity.test.ts`-safe addition.
 *
 * Returns `[]` whenever the plan chart hasn't been initialized yet (no plan
 * exists to diff against). A tooth absent from either chart resolves via
 * `defaultState()`, so a status-only or plan-only tooth still diffs correctly
 * against the clinical default rather than throwing.
 *
 * Iterates the fixed `ALL_TEETH` list (not chart key insertion order), so
 * results are always grouped by tooth in the same stable clinical order the
 * rest of the app already uses (quadrant-by-quadrant); within a tooth,
 * entries follow `DIFF_AXES` order.
 */
export declare function getPlanChanges(): PlanChange[];

/**
 * Export the PLAN chart's payload alone: same shape as the status export
 * (`{version, globals, teeth}`), but `teeth` is collected from `charts.plan`.
 * `globals` are shared app-level settings, not owned by either chart.
 */
export declare function getPlanChart(): Any;

/**
 * Get a plugin's custom state for a specific tooth.
 *
 * @param toothNo - The FDI tooth number (11–48).
 * @param pluginId - The plugin's unique identifier.
 * @returns The custom state value, or `undefined` if not set.
 */
export declare function getPluginState(toothNo: number, pluginId: string): unknown;

export declare function getPulpDetailLevel(): PulpDetailLevel;

export declare function getRadiographicDepthMode(): RadiographicDepthMode;

/**
 * Get the current read-only mode state.
 */
export declare function getReadOnly(): boolean;

export declare function getRootCariesMode(): RootCariesMode;

export declare function getSecondaryCariesMode(): SecondaryCariesMode;

/**
 * Export the STATUS chart's payload — identical to exportStatus()'s JSON
 * (status-primary; unaffected by the current chart mode).
 */
export declare function getStatusChart(): Any;

export declare function getStatusExtras(): ({
    label: string;
    id: string;
    labelKey: string;
    type: string;
    teeth: number[];
    material: string;
    arch?: undefined;
    missingMaterial?: undefined;
    implants?: undefined;
    missing?: undefined;
} | {
    label: string;
    id: string;
    labelKey: string;
    type: string;
    arch: string;
    material: string;
    missingMaterial: string;
    teeth?: undefined;
    implants?: undefined;
    missing?: undefined;
} | {
    label: string;
    id: string;
    labelKey: string;
    type: string;
    arch: string;
    teeth?: undefined;
    material?: undefined;
    missingMaterial?: undefined;
    implants?: undefined;
    missing?: undefined;
} | {
    label: string;
    id: string;
    labelKey: string;
    type: string;
    arch: string;
    implants: number[];
    missing: number[];
    teeth?: undefined;
    material?: undefined;
    missingMaterial?: undefined;
})[];

export declare function getSurfaceNotation(): SurfaceNotation;

/** Current tooth-anatomy profile selector. Defaults to `"classic"`. */
export declare function getToothAnatomy(): ToothAnatomy;

/**
 * Get a human-readable summary of all active states for a tooth.
 * Useful for building custom tooltip or info-panel UIs.
 *
 * @param toothNo - The FDI tooth number (11–48).
 * @returns Array of localized state description strings.
 */
export declare function getToothStateSummary(toothNo: number): string[];

export declare function getWearDetailLevel(): ToothDetailLevel;

/** True iff ANY periodontal axis has been charted anywhere in the mouth. Used
 *  to auto-skip the perio section of an export and to disable the
 *  perio image-export menu items on a blank chart. Derived entirely from
 *  `getPerioSummary()` — no new traversal. */
export declare function hasAnyPerioData(): boolean;

export declare function importStatus(data: Any): void;

/**
 * Initialise the odontogram engine: wire up DOM controls, build the SVG tooth
 * grid, and start listening for i18n changes. Safe to call multiple times
 * (subsequent calls are no-ops).
 */
export declare function initOdontogram(): Promise<void>;

/** Whether a status-vs-plan divergence confirm is awaiting the user's choice. */
export declare function isDualStateConfirmPending(): boolean;

/** Whether the perio-chart overlay is currently open. */
export declare function isPerioOverlayOpen(): boolean;

/** True while a state-change subscription is active. */
export declare function isPersistenceEnabled(): boolean;

/**
 * Supported UI languages.
 *
 * | Code  | Language             |
 * |-------|-----------------------|
 * | hu    | Hungarian             |
 * | en    | English               |
 * | de    | German                |
 * | es    | Spanish               |
 * | it    | Italian               |
 * | sk    | Slovak                |
 * | pl    | Polish                |
 * | ru    | Russian               |
 * | pt-br | Portuguese (Brazil)   |
 * | zh    | Chinese (Simplified) |
 * | ar    | Arabic (RTL — UI mirrors, dental/perio charts pinned LTR) |
 * | fr    | French                |
 */
declare type Language = "hu" | "en" | "de" | "es" | "it" | "sk" | "pl" | "ru" | "pt-br" | "zh" | "ar" | "fr";

/**
 * Supported tooth numbering systems.
 * - **FDI** – ISO 3950 two-digit notation (default in most countries).
 * - **UNIVERSAL** – ADA numbering (1-32 adult, A-T primary).
 * - **PALMER** – Quadrant-based notation (UR/UL/LL/LR + position).
 */
declare type NumberingSystem = "FDI" | "UNIVERSAL" | "PALMER";

export declare function OdontogramChartSurface(): JSX_2.Element;

/**
 * Custom SVG plugin definition for the Odontogram engine.
 *
 * Plugins can inject custom SVG content into each tooth's rendering and
 * maintain per-tooth custom state that is automatically included in
 * JSON export/import.
 *
 * @example
 * ```typescript
 * const implantBrandPlugin: OdontogramPlugin = {
 *   id: "implant-brand",
 *   label: { hu: "Implantátum márka", en: "Implant brand", de: "Implantat-Marke", ... },
 *   layer: "overlay",
 *   renderSvg: (toothNo, _quadrant, customState) => {
 *     if (!customState?.brand) return null;
 *     return `<text x="16" y="60" font-size="6" fill="#3b7bff">${customState.brand}</text>`;
 *   },
 * };
 * ```
 */
export declare type OdontogramPlugin = {
    /** Unique plugin identifier (used as key in customStates). */
    id: string;
    /** Localized display label for the plugin (shown in the state tooltip). */
    label: Partial<Record<Language, string>>;
    /**
     * SVG layer where this plugin's output will be rendered.
     * @see {@link PluginLayer}
     */
    layer: PluginLayer;
    /**
     * Render SVG markup for a specific tooth. Return an SVG fragment string
     * (will be wrapped in a `<g>` element) or `null`/`undefined` to render nothing.
     *
     * @param toothNo - The FDI tooth number (11–48).
     * @param quadrant - The quadrant (1–4) derived from the tooth number.
     * @param customState - The plugin's custom state for this tooth, or `undefined`.
     */
    renderSvg: (toothNo: number, quadrant: 1 | 2 | 3 | 4, customState: unknown) => string | null | undefined;
    /**
     * Optional: which panel section this plugin adds controls to.
     * When set to `"custom"`, the engine will render a dedicated panel
     * section for the plugin (future expansion).
     */
    panelSection?: "custom";
};

/**
 * Owns all odontogram shell state, effects, and handlers and provides them to
 * composed surfaces + modals. Renders only the `.odontogram-root` wrapper around
 * `children` — no extra DOM node.
 */
export declare function OdontogramProvider({ children, language, onLanguageChange, numberingSystem, onNumberingChange, darkMode, onDarkModeChange, themeConfig, plugins, readOnly: readOnlyProp, enableNotes, enableIcdas, pulpDetailLevel, secondaryCariesMode, rootCariesMode, radiographicDepthMode, cariesDepthEnabled, wearDetailLevel, discolorationDetailLevel, surfaceNotation, showStatusCard: showStatusCardProp, showOrthoCard: showOrthoCardProp, fillingComplexity, onFillingComplexityChange, fillingDefectEnabled: fillingDefectEnabledProp, onFillingDefectEnabledChange, fillingMaterialAvailability, onFillingMaterialAvailabilityChange, fissureSealingEnabled: fissureSealingEnabledProp, onFissureSealingEnabledChange, }: OdontogramProviderProps): JSX_2.Element;

/**
 * Props for {@link OdontogramProvider} — the full former `OdontogramShell`
 * (`App`) props surface plus the composed `children`. All state/behavior props
 * are optional: when omitted the provider operates in **standalone** mode with
 * internal state; when provided it operates in **controlled** mode and delegates
 * state to the parent.
 */
declare type OdontogramProviderProps = {
    /** Override the UI language (controlled mode). */
    language?: Language;
    /** Callback when the user changes the language. */
    onLanguageChange?: (lang: Language) => void;
    /** Override the tooth numbering system (controlled mode). */
    numberingSystem?: NumberingSystem;
    /** Callback when the user changes the numbering system. */
    onNumberingChange?: (system: NumberingSystem) => void;
    /** Override dark mode state (controlled mode). */
    darkMode?: boolean;
    /** Callback when the user toggles dark mode. */
    onDarkModeChange?: (dark: boolean) => void;
    /**
     * Custom theme configuration. Overrides the default color palette via
     * CSS custom properties (`--odon-*`). See {@link OdontogramThemeConfig}.
     */
    themeConfig?: OdontogramThemeConfig;
    /**
     * Custom SVG plugins for extending the odontogram with additional visual
     * overlays and per-tooth custom state. See {@link OdontogramPlugin}.
     */
    plugins?: OdontogramPlugin[];
    /**
     * When true, disables all interactions (click, touch, keyboard).
     * Useful for print/report/view modes.
     */
    readOnly?: boolean;
    /**
     * When true, enables per-tooth notes. Double-click a tooth to add/edit a note.
     * Notes are shown in hover tooltips and included in JSON export/import.
     */
    enableNotes?: boolean;
    /**
     * Enable ICDAS II per-surface caries scoring (0–6). When enabled, the depth
     * selector/popup expose ICDAS codes 1–6 and the surface indicator shows a
     * numeric badge; otherwise the 3-level scale is used.
     */
    enableIcdas?: boolean;
    /**
     * Pulp-diagnosis detail level for the pulp control:
     * `"simple"` (healthy / pulpitis), `"aae"` (4 AAE pulp diagnoses, default) or
     * `"latin"` (9 practical-Latin subtypes). A stored value round-trips at every
     * level; the level only governs how the pulp control presents it.
     */
    pulpDetailLevel?: PulpDetailLevel;
    /**
     * Secondary-caries (CARS) granularity for the per-surface score picker:
     * `"simple"` ([0,3]), `"standard"` ([0,1,3,6], default) or `"full"` ([0..6]).
     * A stored score round-trips at every mode; the mode only governs the offered
     * option list. (The mode UI lives in the Settings modal; this prop is the
     * controlled entry point.)
     */
    secondaryCariesMode?: SecondaryCariesMode;
    /**
     * Root-caries granularity for the per-tooth picker: `"simple"` (none /
     * present, default) or `"severity"` (the full none/active/arrested/
     * active-cavitated enum). Non-collapsing across modes.
     */
    rootCariesMode?: RootCariesMode;
    /**
     * Radiographic-depth granularity for the per-surface picker: `"off"`
     * (hidden, default), `"threeLevel"` (superficial/middle/deep) or `"detailed"`
     * (E1..D3). When off, the per-surface radiographic badge is not shown.
     */
    radiographicDepthMode?: RadiographicDepthMode;
    /**
     * Whether the visual caries-depth encoding (per-surface depth picker + the
     * opacity/contour depth tier in the render) is active. Default `true`; set
     * `false` to render caried surfaces at the SVG default with no depth tier.
     */
    cariesDepthEnabled?: boolean;
    /**
     * Detail level for the per-tooth wear control: `"simple"` (yes/no toggle for
     * attrition) or `"complex"` (wear type per edge and cervix, default).
     */
    wearDetailLevel?: ToothDetailLevel;
    /**
     * Detail level for the per-tooth discoloration control: `"simple"` (yes/no
     * toggle) or `"complex"` (choose the discoloration cause, default).
     */
    discolorationDetailLevel?: ToothDetailLevel;
    /**
     * Surface-notation mode for caries/filling surface letters + captions:
     * `"full"` (default) makes them position-aware (incisal on an anterior
     * tooth, labial on an anterior buccal surface, palatal on an upper lingual
     * surface) or `"simple"` (always the tooth-independent B/O/L set).
     */
    surfaceNotation?: SurfaceNotation;
    /**
     * Whether the Statuses panel (`#statusCard`) is shown. Default `true`. The
     * panel visibility is a settings-driven wrapper around the section — the
     * section's own imperative collapse/expand behavior is unaffected.
     */
    showStatusCard?: boolean;
    /**
     * Whether the Orthodontics panel (`#orthoCard`) is shown. Default `true`.
     * Composes with the panel's own imperative ortho-eligibility gate (hidden
     * when no selected tooth is ortho-eligible) — both must be satisfied for
     * the panel to render.
     */
    showOrthoCard?: boolean;
    /**
     * Filling-complexity level for the Fillings card: `"simple"` (one material
     * per tooth, no per-surface picker) or `"complex"` (per-surface materials,
     * default). Contrast with {@link settings.panels} — this one mirrors the
     * `fillingComplexity` engine flag (Settings → Fillings). When provided, the
     * value overrides the engine/UI default; when omitted, whatever the engine
     * holds (module default or a prior `setFillingComplexity` call) stays put.
     */
    fillingComplexity?: FillingComplexity;
    /**
     * Called after the user changes the filling-complexity level in the
     * Settings modal: `(value: FillingComplexity) => void`. Not fired for
     * prop-driven restores. The write-back counterpart of {@link fillingComplexity}.
     */
    onFillingComplexityChange?: (value: FillingComplexity) => void;
    /**
     * Whether filling-defect findings are enabled on the Fillings card. Default
     * `true`. Mirrors the `fillingDefectEnabled` engine flag (Settings →
     * Fillings); same controlled/standalone contract as {@link fillingComplexity}.
     */
    fillingDefectEnabled?: boolean;
    /** See {@link onFillingComplexityChange} — the defect toggle's counterpart. */
    onFillingDefectEnabledChange?: (enabled: boolean) => void;
    /**
     * Available filling materials as a `Record<material, boolean>` over
     * `"amalgam" | "composite" | "gic" | "temporary"` (unknown keys are
     * ignored). Default: all four available. Mirrors the `fillingMaterialAvail`
     * engine map (Settings → Fillings). Hosts may pass an inline literal — the
     * sync effect keys on a canonical serialized form, so re-renders with
     * identical content do not re-fire.
     */
    fillingMaterialAvailability?: Record<string, boolean>;
    /**
     * Called after the user toggles a material in the Settings modal:
     * `(material: string, enabled: boolean) => void` — per-material, mirroring
     * the engine's `setFillingMaterialAvailability` setter (no whole-record
     * change ever happens). Not fired for prop-driven restores.
     */
    onFillingMaterialAvailabilityChange?: (material: string, enabled: boolean) => void;
    /**
     * Whether fissure-sealing is offered on the Fillings card. Default `true`.
     * Mirrors the `fissureSealingEnabled` engine flag (Settings → Fillings);
     * same controlled/standalone contract as {@link fillingComplexity}.
     */
    fissureSealingEnabled?: boolean;
    /** See {@link onFillingComplexityChange} — the fissure-sealing toggle's counterpart. */
    onFissureSealingEnabledChange?: (enabled: boolean) => void;
    /** The composed UI (surfaces + shell layout). */
    children?: ReactNode;
};

/** Structured, already-localized textual summary of the whole odontogram. */
export declare type OdontogramSummary = {
    overview: string;
    permanentList: string | null;
    missingList: string | null;
    /** Grouped dentition table (the flat permanent/missing lists stay for
     *  back-compat). */
    toothTable: OdontogramToothTable;
    /** True when any odontogram-markable periodontal finding
     *  (inflammation, mobility, calculus, …) exists — drives showing the perio
     *  summary line in the PDF's odontogram section even with no perio module. */
    periodontalHasFindings: boolean;
    sections: OdontogramSummarySection[];
    /** Implants heading + list — only present when at least one implant exists. */
    implants: {
        heading: string;
        text: string;
    } | null;
    periodontalTitle: string;
    periodontalText: string;
    /** The status->plan diff (see {@link getPlanChanges}), verbatim.
     *  `[]` whenever the plan chart hasn't been initialized or plan === status —
     *  a distinct field, not a section, since it's a diff rather than a status
     *  list. The "What changes" box in App.tsx renders from this field only
     *  when it's non-empty. */
    plannedChanges: PlanChange[];
    /** Per-tooth free-text notes — one "&lt;tooth&gt;: &lt;note&gt;" line per tooth
     *  that carries a note (gated on the notes-enabled setting, like the tooltip).
     *  `null` when no tooth has a note, so the panel/PDF omit the section entirely. */
    individualNotes: {
        heading: string;
        items: string[];
    } | null;
};

/** One heading + its per-tooth entries in the tooth-information summary. */
export declare type OdontogramSummarySection = {
    key: "caries" | "fillings" | "endo" | "diagnoses" | "wear" | "discoloration" | "orthodontics" | "prosthetics";
    heading: string;
    items: string[];
    /** Localized "no such tooth" sentence, shown when `items` is empty. */
    emptyText: string;
};

/**
 * Theme configuration for the Odontogram component.
 *
 * Allows host applications to override the default color palette without
 * modifying CSS files. All properties are optional — only the provided
 * values are overridden; the rest fall back to the built-in defaults.
 *
 * Colors are applied as CSS custom properties (`--odon-*`) on the
 * component root element, so they work regardless of whether the host
 * uses Tailwind CSS or plain CSS.
 *
 * @example
 * ```tsx
 * const myTheme: OdontogramThemeConfig = {
 *   colors: {
 *     accent: '#e74c3c',
 *     background: '#fafafa',
 *   },
 * };
 * <App themeConfig={myTheme} />
 * ```
 */
export declare type OdontogramThemeConfig = {
    colors?: {
        /** Primary background. Default: `#f3f6fb` (light) / `#0f172a` (dark). */
        background?: string;
        /** Panel & card background. Default: `#ffffff` (light) / `#1e293b` (dark). */
        panel?: string;
        /** Card background. Default: same as panel. */
        card?: string;
        /** Primary text color. Default: `#1e2a3a` (light) / `#f1f5f9` (dark). */
        text?: string;
        /** Muted / secondary text color. Default: `#5b6b7d` (light) / `#94a3b8` (dark). */
        muted?: string;
        /** Border / divider color. Default: `#d7e0ec` (light) / `#334155` (dark). */
        line?: string;
        /** Primary accent (buttons, active states). Default: `#3b7bff`. */
        accent?: string;
        /** Secondary accent (success, selected states). Default: `#12b981`. */
        accent2?: string;
    };
};

/** A grouped dentition overview: category columns (only non-empty ones) ×
 *  anatomical group rows (whole mouth / jaw / quadrant / sextant), each cell a
 *  list of that group's teeth of that category, tagged with a status. */
declare interface OdontogramToothTable {
    columns: {
        key: string;
        label: string;
    }[];
    rows: {
        key: string;
        label: string;
        cells: Record<string, ToothTableCell[]>;
    }[];
    /** Localized note explaining the bold / bold-italic emphasis. */
    legend: string;
}

export declare function OdontogramTopbar(): JSX_2.Element;

/**
 * Everything the surface components and shell-managed modals consume. Cross-cutting
 * state read across ≥2 regions/modals lives here; strictly region-local state
 * (the header dropdown open flags + outside-click effect) stays inside its surface.
 */
export declare type OdontogramUiContextValue = {
    t: TranslateFn;
    lang: Language;
    setLang: (lang: Language) => void;
    isDark: boolean;
    toggleDark: () => void;
    currentNumbering: NumberingSystem;
    setNumbering: (next: NumberingSystem) => void;
    viewMode: PerioViewMode;
    activeView: "odontogram" | "dentalChart";
    setActiveView: (view: "odontogram" | "dentalChart") => void;
    isPerioView: boolean;
    perioChartAvailable: boolean;
    perioOpen: boolean;
    confirmOpen: boolean;
    hasPerio: boolean;
    exportPngOn: boolean;
    exportJpgOn: boolean;
    exportSvgOn: boolean;
    exportPdfOn: boolean;
    importStatusOn: boolean;
    importFhirOn: boolean;
    summary: OdontogramSummary | null;
    toothInfoOn: boolean;
    screenSpacing: ScreenToothSpacing;
    screenNumberSize: ScreenToothNumberSize;
    selectionColor: string;
    selectionBorderStyle: SelectionBorderStyle;
    toothAnatomy: ToothAnatomy;
    planModeAvailable: boolean;
    showStatusCard: boolean;
    showOrthoCard: boolean;
    settingsState: SettingsState;
    settingsOpen: boolean;
    setSettingsOpen: (open: boolean) => void;
    pdfOpen: boolean;
    setPdfOpen: (open: boolean) => void;
    creditsOpen: boolean;
    setCreditsOpen: (open: boolean) => void;
};

/**
 * Subscribe to odontogram state changes. The callback runs after any tooth
 * state edit, the edentulous toggle, or an import.
 *
 * @param cb - Callback invoked on each change.
 * @returns An unsubscribe function.
 */
export declare function onStateChange(cb: () => void): () => void;

/** Public entry point for the declarative `CariesCard`'s per-surface `.surf-depth`
 *  indicator click: opens the contextual severity popup for `surface`, anchored
 *  to `anchor`, on the currently-active tooth — the exact call `wireControls()`
 *  made (`showCariesDepthPopup(surface, ind, activeTooth)`). Kept as a thin
 *  wrapper so the popup overlay itself stays imperative (module-private state:
 *  `activeTooth` / `applyToSelected`). */
export declare function openCariesDepthPopup(surface: string, anchor: HTMLElement): void;

/** Public entry point for the declarative `FillingsCard`'s per-surface LEFT-side
 *  `.surf-defect` indicator click: opens the contextual filling-defect popup for
 *  `surface`, anchored to `anchor`, on the currently-active tooth — the exact
 *  call `wireControls()` made (`showFillingDefectPopup(surface, ind,
 *  activeTooth)`). Thin wrapper so the popup itself stays imperative. */
export declare function openFillingDefectPopup(surface: string, anchor: HTMLElement): void;

/** Open the perio-chart overlay. No-op (still notifies) if already open. */
export declare function openPerioOverlay(): void;

export declare function OrthodonticsCard(): JSX_2.Element;

/** Parameter map for template placeholders (`{{key}}`). */
declare type Params = Record<string, string | number>;

declare type PdfBorderThickness = "thin" | "medium" | "thick";

/** Selectable report colour themes — the default is "blue"; the other three are
 *  distinct but equally calm/medical. */
declare type PdfColorTheme = "blue" | "teal" | "amber" | "slate";

declare type PdfDateFormat = "iso" | "dmy" | "mdy";

/** Which PDF sections the user opted into. The perio sections are additionally
 *  auto-skipped whenever `data.hasPerio` is false (see {@link assemblePdf}),
 *  regardless of these flags — a blank perio chart never gets an empty
 *  "Periodontal status" page. */
declare interface PdfExportOptions {
    patientData: boolean;
    /** The odontogram chart IMAGE — selectable independently of its prose
     *  description in the export dialog. */
    odontogramChart: boolean;
    /** The whole-mouth odontogram summary PROSE. */
    odontogramDescription: boolean;
    /** The per-tooth "Individual notes" section — omitted whenever no tooth
     *  carries a note (`data.individualNotes` empty), regardless of this flag. */
    individualNotes: boolean;
    perioStatus: boolean;
    perioDescription: boolean;
}

declare type PdfPerioFontSize = "small" | "normal" | "xlarge";

declare type PdfPerioLabelPlacement = "center" | "edge";

declare interface PdfSettings {
    /** Placeholder patient name when the case has none (default "John Doe"). */
    defaultName: string;
    /** Placeholder DOB (ISO `YYYY-MM-DD`) when the case has none. */
    defaultDob: string;
    /** Show the patient's age (in parentheses) after the DOB. */
    showAge: boolean;
    /** Date order for DOB / exam date / generation timestamp. */
    dateFormat: PdfDateFormat;
    /** Report colour theme. */
    colorTheme: PdfColorTheme;
    /** Show the bone/gum base layer on the dental chart. */
    showBone: boolean;
    /** Show the healthy-pulp layer on the dental chart. */
    showHealthyPulp: boolean;
    /** How close the teeth sit — closer spacing yields a taller chart image. */
    toothSpacing: PdfToothSpacing;
    /** Draw a frame around the dental-chart image. */
    border: boolean;
    borderThickness: PdfBorderThickness;
    /** Frame colour (CSS hex, default black). */
    borderColor: string;
    /** Tooth-number label size. */
    toothNumberSize: PdfToothNumberSize;
    /** Include the whole-mouth prose description of the chart. */
    includeOdontogramText: boolean;
    /** Include the tabular findings/prosthetic summary. */
    includeOdontogramTable: boolean;
    /** Perio-chart tooth spacing (closer → taller chart image). */
    perioToothSpacing: PdfToothSpacing;
    /** Show numeric rows that have no charted value anywhere. */
    perioShowEmptyRows: boolean;
    /** Buccal / Lingual-Palatal band-label placement. */
    perioLabelPlacement: PdfPerioLabelPlacement;
    /** Perio-chart row/label font size. */
    perioFontSize: PdfPerioFontSize;
    /** Include the periodontal metrics + classification table. */
    includePerioTable: boolean;
    /** Include the abbreviation glossary. */
    includePerioAbbrev: boolean;
    /** Show the medical disclaimer at the bottom of the report. */
    showDisclaimer: boolean;
    /** Custom disclaimer text; empty = use the localized default. Editable only
     *  while `showDisclaimer` is on. */
    disclaimerText: string;
    /** Show the generation / version / attribution stamp. */
    showGenerator: boolean;
    /** How the dentition overview table is grouped (also drives the on-screen
     *  Tooth-information panel table). */
    summaryGrouping: PdfSummaryGrouping;
}

declare type PdfSummaryGrouping = "whole" | "jaw" | "quadrant" | "sextant";

declare type PdfToothNumberSize = "small" | "normal" | "xlarge";

declare type PdfToothSpacing = "wide" | "medium" | "close";

/**
 * Full-mouth perio-chart. The 32-tooth x 6-site grid (~450+ interactive
 * cells) is built with plain DOM (`buildArch`), NOT JSX/React state, and
 * updated via targeted `syncToothCells` calls rather than a full React
 * re-render — see `syncOneTooth`/`fullResync` below. Only the compact summary
 * bar is React-controlled (`useState`), since re-rendering ~4 numbers on every
 * edit is cheap. `suppressResyncRef` prevents the grid's own edits from ALSO
 * triggering a redundant full resync via the `onStateChange` subscription
 * (setPerioSite/setToothMobility both fire it synchronously) — external edits
 * (dual-state chart-mode switch, or another consumer editing perio data while
 * the overlay is open) still trigger the full resync normally. All writes go
 * through the data core (`setPerioSite`/`getToothPerio`/`getToothCal`/
 * `getPerioSummary`/`getPerioChart`); keyboard auto-advance between cells is
 * handled by `handleGridKeyDown`.
 *
 * Layers OVER the odontogram, which it never unmounts: `position: fixed`,
 * full-screen, high z-index (`.perio-overlay` in `index.css`). Mirrors
 * `SettingsModal`'s dialog contract — `role="dialog"` + `aria-modal`, Esc
 * closes, backdrop click closes, focus trap + focus-restore on close — on a
 * single element (`#perioOverlay` itself is the dialog; there is no separate
 * backdrop element, unlike `SettingsModal`).
 *
 * The optional `inline` prop selects a second chrome for the SAME body (grid +
 * summary bar) — a plain panel (`#perioInlinePanel`) meant to fill the chart
 * area in place of the hidden-but-mounted odontogram, instead of the
 * fixed-position modal dialog. `open`/`onClose` are the MODAL chrome's
 * contract and are ignored when `inline` is true (the caller controls
 * mount/unmount of an inline instance directly via conditional rendering) —
 * there is nothing to "close" in an embedded panel. Dialog-only concerns
 * (focus trap/restore, Esc-to-close, backdrop click, `role="dialog"`) do not
 * apply to the inline chrome at all.
 */
export declare function PerioChart({ open, onClose, inline, }: {
    open?: boolean;
    onClose?: () => void;
    inline?: boolean;
}): JSX_2.Element;

/** How perio-chart index row labels are rendered. */
export declare type PerioIndexNameMode = "translated" | "canonical";

/** The 16 toggleable periodontal index rows the Dental Chart can show/hide. */
export declare type PerioRowId = "plaque" | "bop" | "cal" | "gm" | "pd" | "furcation" | "mobility" | "cej" | "rootConcavity" | "pi" | "gi" | "mpi" | "mbi" | "kg" | "gt" | "miller";

export declare type PerioViewMode = "toggle" | "popup";

export declare type PersistenceOptions = {
    /** localStorage key. Default: "react-advanced-odontogram". */
    key?: string;
    /** Persist the plan chart too (payload's `plan` field). Default: false. */
    includePlan?: boolean;
    /** Called on any storage/parse error instead of console.warn. */
    onError?: (err: Error) => void;
};

declare type PlanChange = {
    toothNo: number;
    axis: string;
    from: string;
    to: string;
};

/**
 * Defines the SVG layer where a plugin's visual output will be inserted.
 *
 * | Layer         | Z-order | Description                             |
 * |---------------|---------|----------------------------------------|
 * | `base`        | 0       | Below the tooth — background indicators |
 * | `restoration` | 3       | Between endo and crown layers           |
 * | `overlay`     | 6       | Top-most — badges, markers, highlights  |
 */
export declare type PluginLayer = "base" | "restoration" | "overlay";

export declare type PulpDetailLevel = "simple" | "aae" | "latin";

export declare type RadiographicDepthMode = "off" | "threeLevel" | "detailed";

/**
 * Rebuild the SVG tooth grid after the chart column remounts (composable-UI
 * Tier 2). Preserves the current selection/active tooth across buildGrid()'s
 * internal reset, clears+rebuilds the four grid element maps, and bumps
 * `initToken` so any in-flight/toggle-spam build supersedes cleanly. No-op
 * before init or if a newer build/teardown supersedes this one mid-await.
 */
export declare function rebuildGrid(): Promise<void>;

/**
 * Register one or more custom SVG plugins. Plugins can inject visual overlays
 * into the tooth SVG and maintain per-tooth custom state included in export/import.
 *
 * @param plugins - Array of {@link OdontogramPlugin} definitions.
 */
export declare function registerPlugins(plugins: OdontogramPlugin[]): void;

/** Reset the WHOLE mouth to a blank slate — the exact closure the imperative
 *  `#btnResetAll` handler used, now called directly from the declarative Statuses
 *  card's onClick. Clears the edentulous flag + case-level metadata, resets every
 *  tooth to `defaultState()`, re-syncs the active tooth's controls, and notifies
 *  once at the end so the mounted case-metadata/Statuses subscribers re-read the
 *  cleared state. */
export declare function resetMouth(): void;

/** Reset the whole current selection to `defaultState()` — the exact closure the
 *  imperative `#btnResetTooth` handler used, now called from the declarative card
 *  title button's onClick. */
export declare function resetTooth(): void;

/**
 * Re-run control wiring after a controls surface remounts (composable-UI Tier 2).
 * `wireControls()` is idempotent per-element (bindOnce + populated-container
 * guards), so this wires ONLY the freshly-mounted nodes and leaves still-mounted
 * ones untouched; the trailing syncControlsFromState() re-derives the active
 * tooth's per-tooth option lists/values on the (possibly new) select nodes.
 * No-op before init (the provider's own init effect does the first wiring).
 */
export declare function rewireControls(): void;

export declare type RootCariesMode = "simple" | "severity";

/** Root-caries options at a given mode (defaults to the module setting).
 *  simple -> none / present (present writes the canonical "active-cavitated"
 *  enum — the most-severe value, so simple-mode "present" renders at full
 *  opacity); severity -> the full rootCaries enum. Pure. */
export declare function rootCariesOptions(mode?: RootCariesMode): {
    value: string;
    label: string;
}[];

export declare function RootPeriodontiumCard(): JSX_2.Element;

export declare type RootPerioOptGroup = {
    label: string;
    options: RootPerioOption[];
};

export declare type RootPerioOption = {
    value: string;
    label: string;
};

declare type ScreenToothNumberSize = "small" | "normal" | "xlarge";

/**
 * The full set of live setting values + change handlers the modal drives.
 *
 * Every field maps 1:1 to an existing App-level piece of state / module
 * accessor — the modal never owns behavior, it only surfaces the controls.
 * New settings are added here and wired into a tab's `render()`.
 */
/** On-screen odontogram layout controls (distinct from the PDF/export
 *  equivalents). Spacing = inter-tooth gap in the live grid; number size = the
 *  tooth-number font size. Session-only, pure CSS via data-attributes on the
 *  grid. */
declare type ScreenToothSpacing = "wide" | "normal" | "close";

export declare type SecondaryCariesMode = "simple" | "standard" | "full";

/** Selection-ring border style (default dashed). */
declare type SelectionBorderStyle = "solid" | "dashed" | "dotted";

/** Apical (AAE) diagnosis on the current selection — clears the periapical
 *  lesion subtype unless the diagnosis is (a)symptomatic apical periodontitis. */
export declare function setApicalDxForSelection(value: string): void;

/** Bridge-abutment toggle on the current selection. */
export declare function setBridgePillarForSelection(on: boolean): void;

/** Broken distal corner toggle on the current selection. */
export declare function setBrokenDistalForSelection(on: boolean): void;

/** Broken incisal corner toggle on the current selection. */
export declare function setBrokenIncisalForSelection(on: boolean): void;

/** Broken mesial corner toggle on the current selection. */
export declare function setBrokenMesialForSelection(on: boolean): void;

/** Calculus toggle on the current selection. */
export declare function setCalculusForSelection(on: boolean): void;

/** Set the default (active) caries depth for newly-tapped surfaces. */
export declare function setCariesActiveDepthForSelection(value: number): void;

export declare function setCariesDepthEnabled(value: boolean): void;

/** Toggle one caries surface (or the subcrown) on the current selection —
 *  wraps the exact `cariesOnToggle` closure `wireControls()` bound. */
export declare function setCariesSurfaceForSelection(id: string, on: boolean): void;

/**
 * Switch the active chart between "status" (current findings) and "plan"
 * (proposed treatment). The first time "plan" is entered, it is deep-cloned
 * from "status" (see {@link cloneChart}); later switches reuse the existing
 * plan chart untouched. Re-renders every tooth from the newly active chart
 * via the SAME full-repaint mechanism `importStatus()` uses, so no new
 * render path is introduced and SVG output stays byte-identical to the
 * single-chart render (parity is unaffected — only WHICH chart is active
 * changes, never how a chart renders).
 *
 * @param mode - "status" or "plan"; any other value is ignored.
 */
export declare function setChartMode(mode: ChartMode): void;

/** Distal contact-loss toggle on the current selection. */
export declare function setContactDistalForSelection(on: boolean): void;

/** Mesial contact-loss toggle on the current selection. */
export declare function setContactMesialForSelection(on: boolean): void;

/** Crown marginal-leakage toggle on the current selection. */
export declare function setCrownLeakageForSelection(on: boolean): void;

/** Crown-needed toggle on the current selection. */
export declare function setCrownNeededForSelection(on: boolean): void;

/** Crown-replacement toggle on the current selection. */
export declare function setCrownReplaceForSelection(on: boolean): void;

export declare function setDiscolorationDetailLevel(value: ToothDetailLevel): void;

/** Discoloration cause on the current selection (complex-mode select). */
export declare function setDiscolorationForSelection(value: string): void;

/** Discoloration simple-mode toggle (other / none) on the selection. */
export declare function setDiscolorationToggleForSelection(on: boolean): void;

export declare function setEdentulous(on: Any): void;

/** Apicoectomy (resected tooth) toggle on the current selection. */
export declare function setEndoResectionForSelection(on: boolean): void;

/** Planned-extraction toggle on the current selection. */
export declare function setExtractionPlanForSelection(on: boolean): void;

/** Extraction-wound toggle on the current selection. */
export declare function setExtractionWoundForSelection(on: boolean): void;

export declare function setFillingComplexity(v: "complex" | "simple"): void;

export declare function setFillingDefectEnabled(v: boolean): void;

export declare function setFillingMaterialAvailability(material: string, v: boolean): void;

/** Set the active filling material on the current selection — wraps the exact
 *  `#fillingSelect` closure `wireControls()` bound (clearing "none" removes any
 *  orphaned per-surface fillings). */
export declare function setFillingMaterialForSelection(mat: string): void;

/** Simple-mode filling-defect select — applies a defect to EVERY filled surface.
 *  Wraps the `#fillingSimpleDefectSelect` closure. */
export declare function setFillingSimpleDefectForSelection(value: string): void;

/** Simple-mode filled/not-filled toggle — applies the current material to ALL
 *  surfaces (or clears them). Wraps the `#fillingSimpleToggle` closure. */
export declare function setFillingSimpleToggleForSelection(on: boolean): void;

/** Toggle one filling surface on the current selection — wraps the exact
 *  `buildSurfaceCross($("#fillingSurfaceChecks"), …)` closure. */
export declare function setFillingSurfaceForSelection(surf: string, on: boolean): void;

export declare function setFissureSealingEnabled(v: boolean): void;

/** Fissure-sealing toggle on the current selection. Wraps the `#fissureSealing`
 *  closure. */
export declare function setFissureSealingForSelection(on: boolean): void;

/** Toggle visibility of the healthy-pulp layer on all teeth. */
export declare function setHealthyPulpVisible(on: Any): void;

export declare function setIcdasEnabled(value: boolean): void;

/** Set which parser the next file import uses. Defaults back to "status" after each import. */
export declare function setImportFormat(format: "status" | "fhir"): void;

/** Closed-gap toggle on the current selection. */
export declare function setMissingClosedForSelection(on: boolean): void;

/** Tooth mobility grade on the current selection. */
export declare function setMobilityForSelection(value: string): void;

/** Toggle one `#modsChecks` modifier (parodontal / inflammation) on the current
 *  selection — wraps the exact set add/delete closure `wireControls()` bound. */
export declare function setModForSelection(id: string, on: boolean): void;

/**
 * Enable or disable per-tooth notes. When enabled, double-clicking a tooth
 * opens a note editor popover, and notes are shown in hover tooltips with
 * a badge indicator.
 *
 * @param value - `true` to enable notes, `false` to disable.
 */
export declare function setNotesEnabled(value: boolean): void;

/**
 * Switch the displayed tooth numbering system and re-render all tooth labels.
 * @param system - The target {@link NumberingSystem}.
 */
export declare function setNumberingSystem(system: NumberingSystem): void;

/** Toggle visibility of occlusal-view tiles (premolars and molars). */
export declare function setOcclusalVisible(on: Any): void;

export declare function setOrthoApplianceForSelection(value: string): void;

export declare function setOrthoDriftForSelection(value: string): void;

export declare function setOrthoRotationForSelection(on: boolean): void;

export declare function setOrthoVerticalForSelection(value: string): void;

/** Parapulpal pin toggle on the current selection. */
export declare function setParapulpalPinForSelection(on: boolean): void;

export declare function setPdfSettings(patch: Partial<PdfSettings>): void;

/** Periapical lesion subtype on the current selection. */
export declare function setPeriapicalTypeForSelection(value: string): void;

/** Peri-implant status on the current selection. */
export declare function setPeriImplantForSelection(value: string): void;

/** Switch the perio index-name display mode. No-op (does not notify) if unchanged. */
export declare function setPerioIndexNameMode(mode: PerioIndexNameMode): void;

/** Show/hide one perio-chart index row. No-op (does not notify) if unchanged. */
export declare function setPerioRowVisibility(id: PerioRowId, visible: boolean): void;

/** Switch the perio-chart housing mode. No-op (does not notify) if unchanged. */
export declare function setPerioViewMode(mode: PerioViewMode): void;

/**
 * Hydrate `payload.teeth` into the PLAN chart ONLY (status is left
 * untouched), mirroring the per-tooth hydrate importStatus() performs for
 * the status chart. Marks the plan chart initialized. Repaints the DOM only
 * when PLAN is the currently active chart mode — hydrating a chart that
 * isn't on screen must not visibly disturb whatever IS on screen (mirrors
 * setChartMode()'s own full-repaint-on-activation behavior).
 */
export declare function setPlanChart(payload: Any): void;

/**
 * Set a plugin's custom state for a specific tooth. Triggers SVG re-render
 * for that tooth and updates the tooltip.
 *
 * @param toothNo - The FDI tooth number (11–48).
 * @param pluginId - The plugin's unique identifier.
 * @param value - The custom state value (any JSON-serializable value, or `undefined` to clear).
 */
export declare function setPluginState(toothNo: number, pluginId: string, value: unknown): void;

export declare function setPulpDetailLevel(value: PulpDetailLevel): void;

/** Merged pulp/endo selection on the current selection — wraps the exact
 *  `pulpEndoOnSelect` closure `wireControls()` bound (incl. the endo↔pulpDx
 *  mutual-exclusion normalization). */
export declare function setPulpEndoForSelection(value: string): void;

export declare function setRadiographicDepthMode(value: RadiographicDepthMode): void;

/**
 * Enable or disable read-only mode. When read-only, all click, touch, and
 * keyboard interactions are disabled. The control panel is dimmed and
 * non-interactive. Useful for print/report views.
 *
 * @param value - `true` to enable read-only mode, `false` to disable.
 */
export declare function setReadOnly(value: boolean): void;

/** Root resorption type on the current selection. */
export declare function setResorptionForSelection(value: string): void;

/** Combined restoration dropdown on the current selection — wraps the exact
 *  `#restorationSelect` closure (`applyRestorationSelection` decode of
 *  `${type}|${material}` / `prosthesis|<value>` + the trailing
 *  `setEdentulous(false)`). */
export declare function setRestorationForSelection(value: string): void;

/** Set the per-tooth root-caries value (the picker already emits the canonical
 *  enum value; simple-mode "present" maps to "active-cavitated"). */
export declare function setRootCariesForSelection(value: string): void;

export declare function setRootCariesMode(value: RootCariesMode): void;

export declare function setSecondaryCariesMode(value: SecondaryCariesMode): void;

/** Toggle visibility of the bone/gum base layer on all teeth. */
export declare function setShowBase(on: Any): void;

/** Substrate (natural / radix / broken / crown-prep) on the current selection —
 *  wraps the exact `#substrateSelect` closure (broken-part + crown-needed clears
 *  and the trailing `setEdentulous(false)`). */
export declare function setSubstrateForSelection(value: string): void;

export declare function setSurfaceNotation(value: SurfaceNotation): void;

declare type SettingsState = {
    numbering: NumberingSystem;
    onNumbering: (value: NumberingSystem) => void;
    language: Language;
    onLanguage: (value: Language) => void;
    isDark: boolean;
    onToggleDark: () => void;
    toothInfo: boolean;
    onToothInfo: (value: boolean) => void;
    exportPng: boolean;
    onExportPng: (value: boolean) => void;
    exportJpg: boolean;
    onExportJpg: (value: boolean) => void;
    exportSvg: boolean;
    onExportSvg: (value: boolean) => void;
    exportPdf: boolean;
    onExportPdf: (value: boolean) => void;
    importStatus: boolean;
    onImportStatus: (value: boolean) => void;
    importFhir: boolean;
    onImportFhir: (value: boolean) => void;
    secondaryCariesMode: SecondaryCariesMode;
    onSecondaryCariesMode: (value: SecondaryCariesMode) => void;
    icdas: boolean;
    onIcdas: (value: boolean) => void;
    cariesDepth: boolean;
    onCariesDepth: (value: boolean) => void;
    rootCariesMode: RootCariesMode;
    onRootCariesMode: (value: RootCariesMode) => void;
    radiographicDepthMode: RadiographicDepthMode;
    onRadiographicDepthMode: (value: RadiographicDepthMode) => void;
    selectionColor: string;
    onSelectionColor: (value: string) => void;
    selectionBorderStyle: SelectionBorderStyle;
    onSelectionBorderStyle: (value: SelectionBorderStyle) => void;
    pulpLevel: PulpDetailLevel;
    onPulpLevel: (value: PulpDetailLevel) => void;
    wearDetailLevel: ToothDetailLevel;
    onWearDetailLevel: (value: ToothDetailLevel) => void;
    discolorationDetailLevel: ToothDetailLevel;
    onDiscolorationDetailLevel: (value: ToothDetailLevel) => void;
    surfaceNotation: SurfaceNotation;
    onSurfaceNotation: (value: SurfaceNotation) => void;
    notes: boolean;
    onNotes: (value: boolean) => void;
    planModeAvailable: boolean;
    onPlanModeAvailable: (value: boolean) => void;
    screenToothSpacing: ScreenToothSpacing;
    onScreenToothSpacing: (value: ScreenToothSpacing) => void;
    screenToothNumberSize: ScreenToothNumberSize;
    onScreenToothNumberSize: (value: ScreenToothNumberSize) => void;
    toothAnatomy: ToothAnatomy;
    onToothAnatomy: (value: ToothAnatomy) => void;
    showStatusCard: boolean;
    onShowStatusCard: (value: boolean) => void;
    showOrthoCard: boolean;
    onShowOrthoCard: (value: boolean) => void;
    perioChartAvailable: boolean;
    onPerioChartAvailable: (value: boolean) => void;
    perioViewMode: PerioViewMode;
    onPerioViewMode: (value: PerioViewMode) => void;
    perioRowVisibility: Record<PerioRowId, boolean>;
    onPerioRowVisibility: (id: PerioRowId, visible: boolean) => void;
    perioIndexNameMode: PerioIndexNameMode;
    onPerioIndexNameMode: (value: PerioIndexNameMode) => void;
    fillingDefectEnabled: boolean;
    onFillingDefectEnabled: (value: boolean) => void;
    fillingComplexity: FillingComplexity;
    onFillingComplexity: (value: FillingComplexity) => void;
    fillingMaterials: Record<string, boolean>;
    onFillingMaterial: (material: string, value: boolean) => void;
    fissureSealingEnabled: boolean;
    onFissureSealingEnabled: (value: boolean) => void;
    pdfSettings: PdfSettings;
    onPdfSettings: (patch: Partial<PdfSettings>) => void;
};

/** Switch the tooth-anatomy profile. No-op (does not notify) if unchanged.
 *  Invalidates the perio-chart template cache so that chart re-parses the new
 *  profile's templates on its next load (the odontogram grid is rebuilt by the
 *  caller via `rebuildGrid()`). */
export declare function setToothAnatomy(v: ToothAnatomy): void;

/** Base tooth picker on the current selection — wraps the exact `#toothSelect`
 *  closure `wireControls()` bound (the `defaultState()` reset with the milk-block
 *  guard + the extraction/caries/endo/filling clears, and the trailing
 *  `setEdentulous(false)` when the base is not "none"). */
export declare function setToothSelectionForSelection(value: string): void;

/** Cervical wear type on the current selection (complex-mode select). */
export declare function setWearCervicalForSelection(value: string): void;

/** Cervical wear simple-mode toggle (abrasion / none) on the selection. */
export declare function setWearCervicalToggleForSelection(on: boolean): void;

export declare function setWearDetailLevel(value: ToothDetailLevel): void;

/** Incisal/occlusal wear type on the current selection (complex-mode select). */
export declare function setWearEdgeForSelection(value: string): void;

/** Incisal/occlusal wear simple-mode toggle (attrition / none) on the selection. */
export declare function setWearEdgeToggleForSelection(on: boolean): void;

/** Toggle visibility of wisdom teeth (18, 28, 38, 48). */
export declare function setWisdomVisible(on: Any): void;

/** Start the interactive intro tour. */
export declare function startIntroTour(): void;

export declare function StatusesCard(): JSX_2.Element;

/** One surface-cross cell's fully-resolved render state. */
export declare type SurfaceCell = {
    value: string;
    pos: string;
    letter: string;
    label: string;
    labelId: string;
    checked: boolean;
    disabled: boolean;
    onToggle: (checked: boolean) => void;
    indicators?: SurfaceIndicator[];
    attrs?: Record<string, string>;
};

export declare function SurfaceCross({ cells }: {
    cells: SurfaceCell[];
}): JSX_2.Element;

/** One injected per-cell indicator span (e.g. the `.surf-depth` severity popup
 *  affordance). `side` decides whether it renders before the checkbox (left) or
 *  after the caption (right), matching the imperative insert order. */
export declare type SurfaceIndicator = {
    key: string;
    className: string;
    title: string;
    side: "left" | "right";
    attrs?: Record<string, string>;
    children?: ReactNode;
    onClick?: (anchor: HTMLElement) => void;
};

export declare type SurfaceNotation = "simple" | "full";

/** Selectable tooth-anatomy profiles. */
export declare type ToothAnatomy = "classic" | "measured";

export declare function ToothControlsSurface(): JSX_2.Element;

export declare type ToothDetailLevel = "simple" | "complex";

export declare function ToothDetailsCard(): JSX_2.Element;

export declare type ToothDetailsOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

export declare function ToothInfoSurface(): JSX_2.Element;

declare interface ToothTableCell {
    toothNo: number;
    label: string;
    status: ToothTableStatus;
}

/** Per-tooth status in the grouped dentition table — `empty`
 *  (nothing charted), `content` (has some finding/treatment — shown bold/accent),
 *  `problem` (caries / root inflammation / diagnosis / wear / discoloration —
 *  shown bold-italic in a warning colour). */
declare type ToothTableStatus = "empty" | "content" | "problem";

/** The translate function surfaced by {@link useI18n}. */
declare type TranslateFn = ReturnType<typeof useI18n>["t"];

export declare function useEngineState<T>(read: () => T): T;

/**
 * React hook for i18n. Supports both **controlled** mode (parent provides
 * `language` prop) and **standalone** mode (internal state).
 *
 * @param options - Optional controlled-mode props.
 * @returns `{ lang, setLang, t }` — current language, setter, and scoped translate function.
 */
declare function useI18n(options?: UseI18nOptions): {
    lang: Language;
    setLang: (next: Language) => void;
    t: (key: string, params?: Params) => string;
};

declare type UseI18nOptions = {
    language?: Language;
    onLanguageChange?: (lang: Language) => void;
};

/**
 * Read the shared odontogram UI context. Throws when used outside an
 * {@link OdontogramProvider}, so a misplaced surface fails loudly at mount.
 */
export declare function useOdontogramUi(): OdontogramUiContextValue;

export { }
