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

  it("declares patient demographics read as the capability for the Patients link", () => {
    expect(navigationItems.find(({ href }) => href === "/patients")).toMatchObject({
      requiredPermission: "patient.demographics.read",
    });
  });

  it("declares provider read for provider configuration links", () => {
    expect(navigationItems.find(({ href }) => href === "/providers")).toMatchObject({ requiredPermission: "provider.read" });
    expect(navigationItems.find(({ href }) => href === "/settings/specialties")).toMatchObject({ requiredPermission: "provider.read" });
    expect(navigationItems.find(({ href }) => href === "/settings/procedures")).toMatchObject({ requiredPermission: "provider.read" });
  });

  it("declares communication view as the capability for the Communications link", () => {
    expect(navigationItems.find(({ href }) => href === "/communications")).toMatchObject({
      requiredPermission: "communication.view",
    });
  });

  it("declares specialist request as the capability for the Specialists link", () => {
    expect(navigationItems.find(({ href }) => href === "/specialists")).toMatchObject({
      requiredPermission: "specialist.request",
    });
  });

  it("declares booking review as the capability for the Booking requests link", () => {
    expect(navigationItems.find(({ href }) => href === "/booking-requests")).toMatchObject({
      requiredPermission: "booking.review",
    });
  });

  it("declares site manage as the capability for the Website link", () => {
    expect(navigationItems.find(({ href }) => href === "/settings/site")).toMatchObject({
      requiredPermission: "site.manage",
    });
  });
});
