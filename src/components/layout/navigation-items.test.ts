import { describe, expect, it } from "vitest";

import {
  navigationItems,
  visibleNavigationItems,
  type NavigationHref,
} from "./navigation-items";

describe("permission-aware navigation", () => {
  it("omits the branch-management destination when the server does not authorize it", () => {
    const visibleHrefs: NavigationHref[] = [
      "/dashboard",
      "/settings/account",
    ];

    expect(
      visibleNavigationItems(visibleHrefs).map(({ href }) => href),
    ).toEqual(visibleHrefs);
  });

  it("shows the branch-management destination when the server authorizes it", () => {
    const visibleHrefs = navigationItems.map(({ href }) => href);

    expect(
      visibleNavigationItems(visibleHrefs).map(({ href }) => href),
    ).toContain("/settings/branches");
  });

  it("declares branch management as the capability for the Branches link", () => {
    expect(
      navigationItems.find(({ href }) => href === "/settings/branches"),
    ).toMatchObject({ requiredPermission: "branch.manage" });
  });
});
