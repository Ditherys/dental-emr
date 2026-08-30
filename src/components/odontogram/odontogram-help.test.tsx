/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { OdontogramHelp } from "./odontogram-help";

describe("odontogram contextual help", () => {
  it("explains chart interaction and credits the pinned measured source", () => {
    render(<OdontogramHelp />);
    expect(screen.getByTestId("odontogram-help")).toBeInTheDocument();
    expect(screen.getByText(/arrow keys/i)).toBeInTheDocument();
    expect(screen.getByText(/Ditherys\/React-Odontogram-Modul/i)).toBeInTheDocument();
    expect(screen.getByText(/MIT License/i)).toBeInTheDocument();
    expect(screen.getByText(/5e28d93/i)).toBeInTheDocument();
  });
});
