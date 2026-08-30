/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { MeasuredInlineAsset } from "./measured-inline-asset";

describe("MeasuredInlineAsset", () => {
  it("mounts fork SVG markup inline so embedded root layers can be activated", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(`
      <svg viewBox="0 0 40 80"><style>[data-active="0"]{display:none}</style>
        <g id="tooth" data-active="1"><path id="tooth-base" data-active="1" /></g>
        <g id="endos" data-active="1"><path id="endo-filling" data-active="0" /></g>
      </svg>
    `, { status: 200, headers: { "content-type": "image/svg+xml" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <MeasuredInlineAsset
        fdi={11}
        view="front"
        alt="Tooth 11"
        layerInput={{ anatomy: "NATURAL", view: "front", current: [{ detail: { code: "ROOT_CANAL", state: "endo-filling" } }], planned: [] }}
      />,
    );

    await waitFor(() => expect(container.querySelector("svg #endo-filling")).toHaveAttribute("data-active", "1"));
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });
});
