import { describe, expect, it } from "vitest";

import { buildForkPayload, forkPayloadToClinicalDraft } from "./fork-adapter";
import type { PatientOdontogramDTO } from "./types";

const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const ENTRY_ID = "00000000-0000-4000-8000-000000000002";
const RECORDED_AT = "2026-08-30T00:00:00.000Z";

function dto(overrides: Partial<PatientOdontogramDTO> = {}): PatientOdontogramDTO {
  return {
    patientId: PATIENT_ID,
    entries: [],
    bridges: [],
    implantChains: [],
    periodontalExaminations: [],
    legacyReconciliationFlags: [],
    treatmentExecutions: [],
    ...overrides,
  };
}

function entry(overrides: Partial<PatientOdontogramDTO["entries"][number]>): PatientOdontogramDTO["entries"][number] {
  return {
    id: ENTRY_ID,
    patient_id: PATIENT_ID,
    tooth_code: "11",
    kind: "FINDING",
    clinical_code: "CARIES",
    status: "ACTIVE",
    lifecycle: "OPEN",
    event_state: "CURRENT",
    provenance: "INTERNAL",
    notes: null,
    version: 1,
    recorded_at: RECORDED_AT,
    recorded_by: null,
    treating_provider_id: null,
    encounter_id: null,
    treatment_plan_item_id: null,
    charge_id: null,
    effective_at: null,
    completed_at: null,
    voided_at: null,
    supersedes_entry_id: null,
    superseded_by_entry_id: null,
    surfaces: ["O"],
    detail: { code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null },
    ...overrides,
  };
}

describe("fork adapter", () => {
  it("maps canonical current and planned data to fixed v2.20 fork payloads without identities", () => {
    const result = buildForkPayload(dto({
      entries: [
        entry({
          tooth_code: "11",
          surfaces: ["O", "I"],
          detail: { code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null },
        }),
        entry({
          id: "00000000-0000-4000-8000-000000000003",
          tooth_code: "12",
          kind: "TREATMENT",
          status: "COMPLETED",
          clinical_code: "ROOT_CANAL",
          surfaces: ["O"],
          detail: { code: "ROOT_CANAL", state: "endo-glass-pin" },
        }),
        entry({
          id: "00000000-0000-4000-8000-000000000004",
          tooth_code: "13",
          clinical_code: "MISSING",
          surfaces: ["O"],
          detail: { code: "TOOTH_STATE", state: "MISSING" },
        }),
        entry({
          id: "00000000-0000-4000-8000-000000000005",
          tooth_code: "14",
          clinical_code: "RESTORATION",
          surfaces: ["B", "I"],
          detail: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false },
        }),
        entry({
          id: "00000000-0000-4000-8000-000000000006",
          tooth_code: "15",
          clinical_code: "ORTHODONTIC",
          surfaces: ["B"],
          detail: { code: "ORTHODONTIC", appliance: "BRACKET", movement: "INTRUSION" },
        }),
        entry({
          id: "00000000-0000-4000-8000-000000000007",
          tooth_code: "16",
          status: "PLANNED",
          notes: "Synthetic planned treatment note",
          detail: { code: "CARIES", depth: "ENAMEL", icdas: 1, cars: null, radiographicDepth: null },
        }),
        entry({
          id: "00000000-0000-4000-8000-000000000013",
          tooth_code: "17",
          clinical_code: "RESTORATION",
          surfaces: ["B"],
          detail: { code: "RESTORATION", restorationType: "none", material: "composite", marginalLeakage: false },
        }),
        entry({
          id: "00000000-0000-4000-8000-000000000008",
          tooth_code: "51",
          detail: { code: "CARIES", depth: "ENAMEL", icdas: 1, cars: null, radiographicDepth: null },
        }),
      ],
      bridges: [{
        bridgeId: "00000000-0000-4000-8000-000000000009",
        patient_id: PATIENT_ID,
        record_kind: "CURRENT",
        parent_plan_id: null,
        parent_plan_item_id: null,
        source_plan_design_id: null,
        support_kind: "NATURAL_TOOTH",
        treating_provider_id: null,
        executed_at: RECORDED_AT,
        charge_id: null,
        recorded_by: null,
        recorded_at: RECORDED_AT,
        version: 1,
        sealed_at: RECORDED_AT,
        voided_at: null,
        supersedes_bridge_id: null,
        event_state: "CURRENT",
        units: [
          { tooth_fdi: "21", ordinal: 1, role: "ABUTMENT", support_kind: "NATURAL_TOOTH", support_component_id: null },
          { tooth_fdi: "22", ordinal: 2, role: "PONTIC", support_kind: "NONE", support_component_id: null },
          { tooth_fdi: "23", ordinal: 3, role: "ABUTMENT", support_kind: "NATURAL_TOOTH", support_component_id: null },
        ],
      }],
      implantChains: [{
        root_component_id: "00000000-0000-4000-8000-000000000010",
        tooth_fdi: "24",
        record_kind: "CURRENT",
        parent_plan_id: null,
        parent_plan_item_id: null,
        source_plan_design_component_id: null,
        treating_provider_id: null,
        executed_at: RECORDED_AT,
        charge_id: null,
        recorded_by: null,
        recorded_at: RECORDED_AT,
        event_state: "CURRENT",
        components: [
          { id: "00000000-0000-4000-8000-000000000010", ordinal: 1, component_kind: "FIXTURE", attachment_value: null, depends_on_component_id: null, supersedes_component_id: null, version: 1, sealed_at: RECORDED_AT, event_state: "CURRENT" },
          { id: "00000000-0000-4000-8000-000000000011", ordinal: 2, component_kind: "ABUTMENT", attachment_value: null, depends_on_component_id: "00000000-0000-4000-8000-000000000010", supersedes_component_id: null, version: 1, sealed_at: RECORDED_AT, event_state: "CURRENT" },
          { id: "00000000-0000-4000-8000-000000000012", ordinal: 3, component_kind: "CROWN", attachment_value: null, depends_on_component_id: "00000000-0000-4000-8000-000000000011", supersedes_component_id: null, version: 1, sealed_at: RECORDED_AT, event_state: "CURRENT" },
        ],
      }],
    }));

    const status = result.status as { version?: string; teeth?: Record<string, unknown> };
    const plan = result.plan as { version?: string; teeth?: Record<string, unknown> } | null;

    expect(status).toMatchObject({ version: "2.20" });
    expect(Object.keys(status.teeth ?? {})).toHaveLength(32);
    expect(result.status).not.toHaveProperty("patientId");
    expect(JSON.stringify(result.status)).not.toContain(PATIENT_ID);
    expect(status.teeth).toMatchObject({
      "11": { caries: ["caries-occlusal"], cariesSeverity: { occlusal: 4 } },
      "12": { endo: "endo-glass-pin" },
      "13": { toothSelection: "no-tooth-after-extraction" },
      "14": { restorationType: "crown", restorationMaterial: "zircon" },
      "17": { fillingSurfaceMaterials: { buccal: "composite" } },
      "15": { orthoAppliance: "bracket", orthoVertical: "intrusion" },
      "21": { bridgePillar: true },
      "22": { toothSelection: "none" },
      "23": { bridgePillar: true },
      "24": { toothSelection: "implant" },
    });
    expect(status.teeth).not.toHaveProperty("51");
    expect(plan).toMatchObject({
      version: "2.20",
      teeth: { "16": { caries: ["caries-occlusal"], note: "Synthetic planned treatment note" } },
    });
  });

  it("extracts only allowlisted axes into bounded canonical drafts and ignores identity-like data", () => {
    const drafts = forkPayloadToClinicalDraft({
      version: "2.20",
      patientId: PATIENT_ID,
      globals: { organizationId: "forged-org", branchId: "forged-branch", providerId: "forged-provider" },
      teeth: {
        "11": {
          toothSelection: "tooth-base",
          caries: ["caries-occlusal", "caries-invalid"],
          cariesSeverity: { occlusal: 5, invalid: 99 },
          fillingSurfaceMaterials: { buccal: "amalgam", invalid: "gold" },
          endo: "endo-metal-pin",
          rootCaries: "active-cavitated",
          restorationType: "crown",
          restorationMaterial: "zircon",
          orthoAppliance: "bracket",
          orthoVertical: "intrusion",
          note: "Synthetic import note",
          patient_id: PATIENT_ID,
          organization_id: "forged-org",
        },
        "12": { toothSelection: "no-tooth-after-extraction", note: "Missing" },
        "99": { caries: ["caries-occlusal"] },
      },
    });

    expect(drafts).toEqual(expect.arrayContaining([
      expect.objectContaining({ toothCode: "11", surfaces: ["O"], kind: "FINDING", status: "ACTIVE", detail: { code: "CARIES", depth: "PULPAL", icdas: 5, cars: null, radiographicDepth: null }, note: "Synthetic import note" }),
      expect.objectContaining({ toothCode: "11", surfaces: ["B"], kind: "FINDING", status: "ACTIVE", detail: { code: "RESTORATION", restorationType: "none", material: "amalgam", marginalLeakage: false } }),
      expect.objectContaining({ toothCode: "11", surfaces: ["O"], kind: "TREATMENT", status: "ACTIVE", detail: { code: "ROOT_CANAL", state: "endo-metal-pin" } }),
      expect.objectContaining({ toothCode: "11", surfaces: ["O"], kind: "FINDING", status: "ACTIVE", detail: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false } }),
      expect.objectContaining({ toothCode: "11", surfaces: ["O"], kind: "FINDING", status: "ACTIVE", detail: { code: "ORTHODONTIC", appliance: "BRACKET", movement: "INTRUSION" } }),
      expect.objectContaining({ toothCode: "11", surfaces: ["O"], kind: "FINDING", status: "ACTIVE", detail: { code: "OTHER", controlledCode: "FORK_ROOT_CARIES_ACTIVE_CAVITATED" } }),
      expect.objectContaining({ toothCode: "12", surfaces: ["O"], kind: "FINDING", status: "ACTIVE", detail: { code: "TOOTH_STATE", state: "MISSING" }, note: "Missing" }),
    ]));
    expect(drafts).toHaveLength(7);
    expect(JSON.stringify(drafts)).not.toContain(PATIENT_ID);
    expect(JSON.stringify(drafts)).not.toContain("forged-org");
  });

  it("does not project superseded relationship records into the fork display state", () => {
    const result = buildForkPayload(dto({
      bridges: [{
        bridgeId: "00000000-0000-4000-8000-000000000014",
        patient_id: PATIENT_ID,
        record_kind: "CURRENT",
        parent_plan_id: null,
        parent_plan_item_id: null,
        source_plan_design_id: null,
        support_kind: "NATURAL_TOOTH",
        treating_provider_id: null,
        executed_at: RECORDED_AT,
        charge_id: null,
        recorded_by: null,
        recorded_at: RECORDED_AT,
        version: 1,
        sealed_at: RECORDED_AT,
        voided_at: null,
        supersedes_bridge_id: null,
        event_state: "SUPERSEDED",
        units: [
          { tooth_fdi: "25", ordinal: 1, role: "ABUTMENT", support_kind: "NATURAL_TOOTH", support_component_id: null },
          { tooth_fdi: "26", ordinal: 2, role: "PONTIC", support_kind: "NONE", support_component_id: null },
        ],
      }],
    }));

    const status = result.status as { teeth?: Record<string, Record<string, unknown>> };
    expect(status.teeth?.["25"]).not.toHaveProperty("bridgePillar");
    expect(status.teeth?.["26"]).toMatchObject({ toothSelection: "tooth-base" });
  });

  it("reads a plan payload as planned drafts and drops unsupported surfaces and axes", () => {
    const drafts = forkPayloadToClinicalDraft({
      version: "2.20",
      teeth: {
      },
      plan: {
        version: "2.20",
        teeth: {
          "11": {
            caries: ["caries-occlusal", "caries-root"],
            cariesSeverity: { occlusal: 1, root: 6 },
            rootCaries: "arrested",
            note: "x".repeat(2001),
            customStates: { untrusted: "value" },
          },
        },
      },
    });

    expect(drafts).toEqual([
      {
        toothCode: "11",
        surfaces: ["O"],
        kind: "FINDING",
        status: "PLANNED",
        detail: { code: "CARIES", depth: "ENAMEL", icdas: 1, cars: null, radiographicDepth: null },
        note: null,
      },
      {
        toothCode: "11",
        surfaces: ["O"],
        kind: "FINDING",
        status: "PLANNED",
        detail: { code: "OTHER", controlledCode: "FORK_ROOT_CARIES_ARRESTED" },
        note: null,
      },
    ]);
  });
});
