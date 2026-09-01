/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PeriodontalExamWorkspace, type PeriodontalWorkspaceHandlers } from "./periodontal-exam-workspace";
import type { PeriodontalWorkspacePayload } from "./periodontal-summary";

afterEach(() => cleanup());

const EXAM_ID = "00000000-0000-4000-a000-000000000099";
const PATIENT_ID = "00000000-0000-4000-a000-000000000020";
const BRANCH_ID = "00000000-0000-4000-a000-000000000010";

function emptyPayload(): PeriodontalWorkspacePayload {
  return { examination: null, sites: [], plaque: [], tooth: [], furcation: [], derived: null, timeline: [] };
}

function draftPayload(overrides: Partial<PeriodontalWorkspacePayload> = {}): PeriodontalWorkspacePayload {
  return {
    examination: {
      id: EXAM_ID,
      patient_id: PATIENT_ID,
      encounter_id: "00000000-0000-4000-a000-000000000040",
      predecessor_examination_id: null,
      examination_kind: "INITIAL",
      status: "DRAFT",
      version: 4,
      recorded_at: "2026-09-01T01:00:00Z",
      examined_at: "2026-09-01T01:00:00Z",
      finalized_at: null,
      amendment_reason: null,
      risk: {
        age_years_snapshot: null,
        smoking_status: null,
        cigarettes_per_day: null,
        diabetes_status: null,
        hba1c_percent: null,
        teeth_lost_to_periodontitis: null,
        radiographic_bone_loss_percent: null,
      },
      stored_derived: { diagnosis: null, stage: null, grade: null, extent: null, measurement_fingerprint: null },
      confirmed: {
        diagnosis: null,
        stage: null,
        grade: null,
        extent: null,
        measurement_fingerprint: null,
        confirmed_at: null,
        override_reason: null,
      },
    },
    sites: [
      {
        tooth_fdi: "16",
        site: "MB",
        probing_depth_mm: 3,
        gingival_margin_mm: 1,
        cal_mm: 4,
        bleeding_on_probing: null,
        suppuration: null,
        implant_context: false,
      },
      {
        tooth_fdi: "16",
        site: "B",
        probing_depth_mm: 7,
        gingival_margin_mm: null,
        cal_mm: null,
        bleeding_on_probing: true,
        suppuration: null,
        implant_context: false,
      },
    ],
    plaque: [],
    tooth: [
      {
        tooth_fdi: "16",
        tooth_present: true,
        implant_context: false,
        context_inferred: false,
        mobility_miller: null,
        notes: null,
        keratinized_gingiva_mm: null,
        gingival_thickness_mm: null,
        gingival_phenotype: null,
        miller_recession_class: null,
        cej_visible: null,
        root_concavity: null,
      },
    ],
    furcation: [],
    derived: {
      diagnosis: null,
      stage: null,
      grade: null,
      extent: null,
      present_tooth_count: 1,
      teeth_with_known_interdental_cal: 1,
      assessed_bop_site_count: 1,
      bleeding_site_count: 1,
      bop_percent: 100,
      complete: false,
    },
    timeline: [
      {
        id: EXAM_ID,
        examination_kind: "INITIAL",
        status: "DRAFT",
        version: 4,
        recorded_at: "2026-09-01T01:00:00Z",
        finalized_at: null,
        predecessor_examination_id: null,
        confirmed_diagnosis: null,
      },
    ],
    ...overrides,
  };
}

function handlers(overrides: Partial<PeriodontalWorkspaceHandlers> = {}): PeriodontalWorkspaceHandlers {
  return {
    load: vi.fn(async () => ({ ok: true as const, payload: draftPayload() })),
    createDraft: vi.fn(async () => ({ ok: true as const, id: EXAM_ID, version: 1 })),
    save: vi.fn(async () => ({ ok: true as const, id: EXAM_ID, version: 5 })),
    finalize: vi.fn(async () => ({ ok: true as const, id: EXAM_ID, version: 6 })),
    amend: vi.fn(async () => ({ ok: true as const, id: "00000000-0000-4000-a000-0000000000aa", version: 1 })),
    compare: vi.fn(async () => ({ ok: false as const, code: "FAILED" })),
    ...overrides,
  };
}

function renderWorkspace(payload: PeriodontalWorkspacePayload, api: PeriodontalWorkspaceHandlers, overrides: Record<string, unknown> = {}) {
  return render(
    <PeriodontalExamWorkspace
      patientId={PATIENT_ID}
      actingBranchId={BRANCH_ID}
      canWriteClinical
      canCorrect
      handlers={api}
      initialPayload={payload}
      dentition={["16", "15"]}
      autosaveDelayMs={5}
      {...overrides}
    />,
  );
}

describe("PeriodontalExamWorkspace", () => {
  it("offers a bounded start form when the patient has no periodontal examination", async () => {
    const user = userEvent.setup();
    const api = handlers();
    renderWorkspace(emptyPayload(), api);

    expect(screen.getByTestId("perio-exam-empty")).toHaveTextContent(/no periodontal examination/i);

    await user.selectOptions(screen.getByRole("combobox", { name: /examination type/i }), "RE-EVALUATION");
    await user.click(screen.getByRole("button", { name: /start new examination/i }));

    await waitFor(() => expect(api.createDraft).toHaveBeenCalledTimes(1));
    const call = (api.createDraft as ReturnType<typeof vi.fn>).mock.calls[0][0] as { examinationKind: string; examinedAt: string | null };
    expect(call.examinationKind).toBe("RE-EVALUATION");
    expect(api.load).toHaveBeenCalledWith({ examinationId: EXAM_ID });
  }, 20000);

  it("offers all three examination types", () => {
    renderWorkspace(emptyPayload(), handlers());
    const select = screen.getByRole("combobox", { name: /examination type/i }) as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "INITIAL",
      "RE-EVALUATION",
      "MAINTENANCE",
    ]);
  });

  it("records the examination date the clinician gives it", async () => {
    const user = userEvent.setup();
    const api = handlers();
    renderWorkspace(emptyPayload(), api);

    await user.type(screen.getByLabelText(/examination date/i), "2026-08-30T09:15");
    await user.click(screen.getByRole("button", { name: /start new examination/i }));

    await waitFor(() => expect(api.createDraft).toHaveBeenCalledTimes(1));
    const call = (api.createDraft as ReturnType<typeof vi.fn>).mock.calls[0][0] as { examinedAt: string | null };
    expect(call.examinedAt).toMatch(/^2026-08-30T/);
  }, 20000);

  it("autosaves only the rows that actually changed", async () => {
    const user = userEvent.setup();
    const api = handlers();
    renderWorkspace(draftPayload(), api);

    const pd = screen.getByRole("spinbutton", { name: /tooth 16 disto-buccal probing depth/i });
    await user.type(pd, "5");

    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const batch = (api.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      expectedVersion: number;
      batch: { sites?: unknown[]; tooth?: unknown[]; plaque?: unknown[]; furcation?: unknown[] };
    };
    expect(batch.expectedVersion).toBe(4);
    expect(batch.batch.sites).toEqual([{ tooth_fdi: "16", site: "DB", probing_depth_mm: 5 }]);
    expect(batch.batch.tooth ?? []).toEqual([]);
  }, 20000);

  it("never sends a second autosave when nothing changed", async () => {
    const user = userEvent.setup();
    const api = handlers();
    renderWorkspace(draftPayload(), api);

    const pd = screen.getByRole("spinbutton", { name: /tooth 16 disto-buccal probing depth/i });
    await user.type(pd, "5");
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /save draft/i }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(api.save).toHaveBeenCalledTimes(1);
  }, 20000);

  it("reports Saving before the write resolves and only then reports Saved", async () => {
    const user = userEvent.setup();
    let release: (value: { ok: true; id: string; version: number }) => void = () => {};
    const save = vi.fn(
      () => new Promise<{ ok: true; id: string; version: number }>((resolve) => { release = resolve; }),
    );
    const api = handlers({ save: save as unknown as PeriodontalWorkspaceHandlers["save"] });
    renderWorkspace(draftPayload(), api);

    await user.type(screen.getByRole("spinbutton", { name: /tooth 16 disto-buccal probing depth/i }), "5");

    await waitFor(() => expect(screen.getByTestId("perio-autosave-status")).toHaveTextContent(/saving/i));
    expect(screen.getByTestId("perio-autosave-status")).not.toHaveTextContent(/saved/i);

    release({ ok: true, id: EXAM_ID, version: 5 });
    await waitFor(() => expect(screen.getByTestId("perio-autosave-status")).toHaveTextContent(/saved/i));
  }, 20000);

  it("surfaces a stale version as an actionable conflict, not a generic failure", async () => {
    const user = userEvent.setup();
    const api = handlers({ save: vi.fn(async () => ({ ok: false as const, code: "STALE_VERSION" })) });
    renderWorkspace(draftPayload(), api);

    await user.type(screen.getByRole("spinbutton", { name: /tooth 16 disto-buccal probing depth/i }), "5");

    const conflict = await screen.findByTestId("perio-conflict");
    expect(conflict).toHaveTextContent(/conflict/i);
    expect(conflict).toHaveTextContent(/another/i);
    expect(screen.getByTestId("perio-autosave-status")).not.toHaveTextContent(/saved/i);

    await user.click(within(conflict).getByRole("button", { name: /reload/i }));
    await waitFor(() => expect(api.load).toHaveBeenCalled());
  }, 20000);

  it("reports a transport failure as offline with a retry rather than as success", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async () => { throw new Error("network"); });
    const api = handlers({ save: save as unknown as PeriodontalWorkspaceHandlers["save"] });
    renderWorkspace(draftPayload(), api);

    await user.type(screen.getByRole("spinbutton", { name: /tooth 16 disto-buccal probing depth/i }), "5");

    await waitFor(() => expect(screen.getByTestId("perio-autosave-status")).toHaveTextContent(/offline/i));
    expect(screen.getByTestId("perio-autosave-status")).not.toHaveTextContent(/saved/i);

    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  }, 20000);

  it("refuses to withdraw a probing depth already on the record and says why", async () => {
    const user = userEvent.setup();
    const api = handlers();
    renderWorkspace(draftPayload(), api);

    const pd = screen.getByRole("spinbutton", { name: /tooth 16 mesio-buccal probing depth/i }) as HTMLInputElement;
    await user.clear(pd);

    expect(await screen.findByTestId("perio-withdraw-refused")).toHaveTextContent(/cannot be withdrawn/i);
    expect(pd.value).toBe("3");
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(api.save).not.toHaveBeenCalled();
  }, 20000);

  it("shows examination completeness and the summary statistics over known readings only", () => {
    renderWorkspace(draftPayload(), handlers());
    const summary = screen.getByTestId("perio-summary");

    // Two probing depths known: 3 and 7 -> mean 5, max 7.
    expect(within(summary).getByTestId("perio-summary-mean-pd")).toHaveTextContent("5");
    expect(within(summary).getByTestId("perio-summary-max-pd")).toHaveTextContent("7");
    // Only one attachment level is known, so the mean is over that one reading.
    expect(within(summary).getByTestId("perio-summary-mean-cal")).toHaveTextContent("4");
    expect(within(summary).getByTestId("perio-summary-known-cal")).toHaveTextContent(/1 of 2/);
    // Nothing was scored for plaque, so the share is unknown, not zero.
    expect(within(summary).getByTestId("perio-summary-plaque")).toHaveTextContent(/not assessed/i);
    expect(within(summary).getByTestId("perio-summary-plaque")).not.toHaveTextContent("0%");
    expect(within(summary).getByTestId("perio-summary-max-furcation")).toHaveTextContent(/not recorded/i);
    expect(within(summary).getByTestId("perio-summary-completeness")).toHaveTextContent(/incomplete/i);
  });

  it("counts a probing depth with no gingival margin as an unknown attachment level, never as the depth", () => {
    renderWorkspace(draftPayload(), handlers());
    const summary = screen.getByTestId("perio-summary");
    expect(within(summary).getByTestId("perio-summary-max-cal")).toHaveTextContent("4");
    expect(within(summary).getByTestId("perio-summary-max-cal")).not.toHaveTextContent("7");
  });

  it("distributes probing depths into bands and counts the unknown ones separately", () => {
    renderWorkspace(draftPayload(), handlers());
    const distribution = screen.getByTestId("perio-summary-pd-distribution");
    expect(distribution).toHaveTextContent(/1–3 mm/);
    expect(distribution).toHaveTextContent(/≥ 6 mm/);
    expect(distribution).toHaveTextContent(/4 not recorded/);
  });

  it("finalizes with the server-derived classification the clinician confirmed", async () => {
    const user = userEvent.setup();
    const api = handlers();
    const payload = draftPayload();
    payload.derived = { ...payload.derived!, diagnosis: "GINGIVITIS", complete: true };
    renderWorkspace(payload, api);

    await user.click(screen.getByRole("checkbox", { name: /i confirm this classification/i }));
    await user.click(screen.getByRole("button", { name: /confirm and finalize/i }));

    await waitFor(() => expect(api.finalize).toHaveBeenCalledTimes(1));
    expect(api.finalize).toHaveBeenCalledWith({
      examinationId: EXAM_ID,
      expectedVersion: 4,
      confirmation: { diagnosis: "GINGIVITIS" },
    });
  }, 20000);

  it("keeps a finalized examination readable and routes correction through amendment", async () => {
    const user = userEvent.setup();
    const api = handlers();
    const payload = draftPayload();
    payload.examination = { ...payload.examination!, status: "FINAL", finalized_at: "2026-09-01T05:00:00Z" };
    renderWorkspace(payload, api);

    expect(screen.getByRole("spinbutton", { name: /tooth 16 mesio-buccal probing depth/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /save draft/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: /amend this examination/i }));
    const reason = screen.getByRole("textbox", { name: /amendment reason/i });
    const confirm = screen.getByRole("button", { name: /create amendment/i });
    expect(confirm).toBeDisabled();

    await user.type(reason, "Transcription error at 16.");
    await user.click(confirm);

    await waitFor(() => expect(api.amend).toHaveBeenCalledWith({
      predecessorExaminationId: EXAM_ID,
      reason: "Transcription error at 16.",
    }));
  }, 20000);

  it("opens an earlier finalized examination through the same authorized projection", async () => {
    const user = userEvent.setup();
    const api = handlers();
    const payload = draftPayload();
    const legacyId = "00000000-0000-4000-a000-0000000000bb";
    payload.timeline = [
      ...payload.timeline,
      {
        id: legacyId,
        examination_kind: "INITIAL",
        status: "FINAL",
        version: 2,
        recorded_at: "2025-02-03T01:00:00Z",
        finalized_at: "2025-02-03T02:00:00Z",
        predecessor_examination_id: null,
        confirmed_diagnosis: "GINGIVITIS",
      },
    ];
    renderWorkspace(payload, api);

    await user.selectOptions(screen.getByRole("combobox", { name: /open examination/i }), legacyId);
    await waitFor(() => expect(api.load).toHaveBeenCalledWith({ examinationId: legacyId }));
  }, 20000);

  it("rebuilds the chart from the authorized projection on reload", async () => {
    const user = userEvent.setup();
    const reloaded = draftPayload();
    reloaded.sites = [
      { tooth_fdi: "15", site: "MB", probing_depth_mm: 9, gingival_margin_mm: 2, cal_mm: 11, bleeding_on_probing: null, suppuration: null, implant_context: false },
    ];
    const api = handlers({ load: vi.fn(async () => ({ ok: true as const, payload: reloaded })) });
    renderWorkspace(draftPayload(), api);

    await user.click(screen.getByRole("button", { name: /^reload$/i }));
    await waitFor(() =>
      expect((screen.getByRole("spinbutton", { name: /tooth 15 mesio-buccal probing depth/i }) as HTMLInputElement).value).toBe("9"),
    );
  }, 20000);

  it("gives a read-only clinician no write control at all", () => {
    renderWorkspace(draftPayload(), handlers(), { canWriteClinical: false });
    expect(screen.queryByRole("button", { name: /save draft/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /start new examination/i })).toBeNull();
    expect(screen.getByRole("spinbutton", { name: /tooth 16 mesio-buccal probing depth/i })).toBeDisabled();
  });
});
