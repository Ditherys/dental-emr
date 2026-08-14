import { describe, expect, it, vi } from "vitest";

import { createTotpSecretWriter } from "./e2e-totp-secret-output.mjs";

describe("createTotpSecretWriter", () => {
  it("persists the first secret immediately and appends later secrets", () => {
    const writeFile = vi.fn();
    const appendFile = vi.fn();
    const writeSecret = createTotpSecretWriter("C:\\outside\\totp.txt", {
      appendFile,
      writeFile,
    });

    writeSecret("E2E_OWNER_TOTP_SECRET", "owner-synthetic-secret");

    expect(writeFile).toHaveBeenCalledWith(
      "C:\\outside\\totp.txt",
      "E2E_OWNER_TOTP_SECRET=owner-synthetic-secret\n",
      { encoding: "utf8", mode: 0o600 },
    );
    expect(appendFile).not.toHaveBeenCalled();

    writeSecret("E2E_ADMIN_TOTP_SECRET", "admin-synthetic-secret");

    expect(appendFile).toHaveBeenCalledWith(
      "C:\\outside\\totp.txt",
      "E2E_ADMIN_TOTP_SECRET=admin-synthetic-secret\n",
      { encoding: "utf8", mode: 0o600 },
    );
  });
});
