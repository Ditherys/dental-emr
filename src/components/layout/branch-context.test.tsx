// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALL_BRANCHES_VALUE,
  BranchContextProvider,
  resolveBranchSelection,
  useBranchContext,
} from "@/components/layout/branch-context";
import { BranchSelector } from "@/components/layout/branch-selector";
import type { BranchContextModel } from "@/lib/authorization/policy";

const organizationWideModel: BranchContextModel = {
  organization: { id: "org-a", name: "Synthetic Dental A" },
  branches: [
    { id: "branch-a1", name: "Demo Main" },
    { id: "branch-a2", name: "Demo Second" },
  ],
  allowAllBranches: true,
};

const branchScopedModel: BranchContextModel = {
  ...organizationWideModel,
  branches: [{ id: "branch-a1", name: "Demo Main" }],
  allowAllBranches: false,
};

function ContextHarness() {
  const { selection, selectBranch } = useBranchContext();

  return (
    <>
      <output data-testid="selection">{selection ?? "none"}</output>
      <button type="button" onClick={() => selectBranch("branch-a2")}>
        Select second
      </button>
      <label>
        Unsaved note
        <input />
      </label>
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("branch context selection", () => {
  it("defaults organization-wide users to the All Branches workflow scope", () => {
    expect(resolveBranchSelection(organizationWideModel)).toBe(
      ALL_BRANCHES_VALUE,
    );
  });

  it("rejects All Branches and unauthorized stored IDs for branch-scoped users", () => {
    expect(
      resolveBranchSelection(branchScopedModel, ALL_BRANCHES_VALUE),
    ).toBe("branch-a1");
    expect(resolveBranchSelection(branchScopedModel, "branch-b1")).toBe(
      "branch-a1",
    );
  });

  it("restores only an authorized organization-scoped preference", async () => {
    window.localStorage.setItem(
      "dental-emr:branch-context:org-a",
      "branch-a2",
    );

    render(
      <BranchContextProvider model={organizationWideModel}>
        <ContextHarness />
      </BranchContextProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("selection").textContent).toBe("branch-a2");
    });
  });

  it("switches without remounting unsaved shell content and persists the choice", async () => {
    const user = userEvent.setup();

    render(
      <BranchContextProvider model={organizationWideModel}>
        <ContextHarness />
      </BranchContextProvider>,
    );

    const note = screen.getByRole("textbox", { name: "Unsaved note" });
    await user.type(note, "Draft remains");
    await user.click(screen.getByRole("button", { name: "Select second" }));

    expect(screen.getByTestId("selection").textContent).toBe("branch-a2");
    expect((note as HTMLInputElement).value).toBe("Draft remains");
    expect(
      window.localStorage.getItem("dental-emr:branch-context:org-a"),
    ).toBe("branch-a2");
  });

  it("keeps the current shell preference when browser storage rejects writes", async () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new DOMException("Storage is unavailable.");
      });
    const user = userEvent.setup();

    render(
      <BranchContextProvider model={organizationWideModel}>
        <ContextHarness />
      </BranchContextProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Select second" }));

    expect(screen.getByTestId("selection").textContent).toBe("branch-a2");
    setItem.mockRestore();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
  });
});

describe("branch selector", () => {
  it("exposes All Branches and only the server-authorized branch options", async () => {
    const user = userEvent.setup();

    render(
      <BranchContextProvider model={organizationWideModel}>
        <BranchSelector />
      </BranchContextProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Branch context: All Branches" }),
    );

    expect(
      screen.getByRole("menuitemradio", { name: /All Branches/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitemradio", { name: "Demo Main" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitemradio", { name: "Demo Second" }),
    ).toBeTruthy();
  });

  it("fixes a branch-scoped user to their only authorized branch", () => {
    render(
      <BranchContextProvider model={branchScopedModel}>
        <BranchSelector />
      </BranchContextProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Branch context: Demo Main" }),
    ).toBeTruthy();
  });

  it("fills the expanded sidebar without changing the selected branch", () => {
    render(
      <BranchContextProvider model={branchScopedModel}>
        <BranchSelector presentation="sidebar" />
      </BranchContextProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Branch context: Demo Main" }),
    ).toHaveClass("w-full", "justify-start");
    expect(screen.getByText("Demo Main")).toBeVisible();
  });

  it("opens and dismisses the expanded-sidebar branch menu from the keyboard", async () => {
    const user = userEvent.setup();

    render(
      <BranchContextProvider model={branchScopedModel}>
        <BranchSelector presentation="sidebar" />
      </BranchContextProvider>,
    );

    const trigger = screen.getByRole("button", {
      name: "Branch context: Demo Main",
    });
    trigger.focus();

    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("menuitemradio", { name: "Demo Main" }),
    ).toBeVisible();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("menuitemradio", { name: "Demo Main" })).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it("opens and dismisses the topbar branch menu from the keyboard", async () => {
    const user = userEvent.setup();

    render(
      <BranchContextProvider model={organizationWideModel}>
        <BranchSelector presentation="topbar" />
      </BranchContextProvider>,
    );

    const trigger = screen.getByRole("button", {
      name: "Branch context: All Branches",
    });
    trigger.focus();

    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("menuitemradio", { name: /All Branches/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitemradio", { name: "Demo Main" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitemradio", { name: "Demo Second" }),
    ).toBeVisible();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("menuitemradio", { name: /All Branches/ }),
      ).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it("keeps the branch menu accessible in the collapsed rail", () => {
    render(
      <BranchContextProvider model={branchScopedModel}>
        <BranchSelector presentation="rail" />
      </BranchContextProvider>,
    );

    const trigger = screen.getByRole("button", {
      name: "Branch context: Demo Main",
    });
    expect(trigger).toHaveClass("size-9");
    expect(screen.queryByText("Demo Main")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("title", "Working branch: Demo Main");
  });

  it("opens and dismisses the collapsed-rail branch menu from the keyboard", async () => {
    const user = userEvent.setup();

    render(
      <BranchContextProvider model={branchScopedModel}>
        <BranchSelector presentation="rail" />
      </BranchContextProvider>,
    );

    const trigger = screen.getByRole("button", {
      name: "Branch context: Demo Main",
    });
    trigger.focus();

    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("menuitemradio", { name: "Demo Main" }),
    ).toBeVisible();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("menuitemradio", { name: "Demo Main" })).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it("keeps long branch names discoverable in the branch menu", async () => {
    const user = userEvent.setup();
    const longBranchName =
      "Demo Main Branch With A Deliberately Long Name For Discoverability";

    render(
      <BranchContextProvider
        model={{
          ...branchScopedModel,
          branches: [{ id: "branch-a1", name: longBranchName }],
        }}
      >
        <BranchSelector presentation="sidebar" />
      </BranchContextProvider>,
    );

    const trigger = screen.getByRole("button", {
      name: `Branch context: ${longBranchName}`,
    });
    await user.click(trigger);

    const option = screen.getByRole("menuitemradio", { name: longBranchName });
    const optionLabel = option.querySelector(`span[title="${longBranchName}"]`);

    expect(trigger).toHaveAttribute("title", longBranchName);
    expect(optionLabel).toHaveClass("break-words", "whitespace-normal");
    expect(optionLabel).toHaveAttribute("title", longBranchName);
  });
});
