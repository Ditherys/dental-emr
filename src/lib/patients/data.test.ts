import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc })),
}));

import { getPatient, listPatients } from "./data";

beforeEach(() => rpc.mockReset());

describe("patient read adapters", () => {
  it("uses only the bounded search RPC with validated pagination", async () => {
    rpc.mockResolvedValue({ data: { rows: [], total: 0, page: 1, pageSize: 25 }, error: null });

    await expect(listPatients({
      actingBranchId: "22000000-0000-0000-0000-000000000001",
      sort: "name_asc",
      page: 1,
      pageSize: 25,
    })).resolves.toMatchObject({ total: 0 });
    expect(rpc).toHaveBeenCalledWith("search_patients", expect.objectContaining({ p_page_size: 25 }));
  });

  it("uses only the bounded detail RPC", async () => {
    rpc.mockResolvedValue({
      data: {
        patientId: "22000000-0000-0000-0000-000000000001", patientNumber: "P-000001",
        firstName: "Ana", middleName: null, lastName: "Santos", suffix: null, preferredName: null,
        birthDate: "1990-01-01", sexAtRegistration: null, addressLine1: null, addressLine2: null,
        city: null, province: null, postalCode: null, preferredBranch: null, status: "active",
        version: 1, contacts: [], relationships: [],
      }, error: null,
    });

    await expect(getPatient(
      "22000000-0000-0000-0000-000000000001",
      "22000000-0000-0000-0000-000000000002",
    )).resolves.toMatchObject({ patientNumber: "P-000001" });
    expect(rpc).toHaveBeenCalledWith("get_patient_detail", expect.any(Object));
  });
});
