import { appendFileSync, writeFileSync } from "node:fs";

/**
 * Creates a per-run writer for newly enrolled E2E TOTP credentials.
 *
 * The first credential replaces stale output from an earlier run. Later
 * credentials append to the same outside-repository file. Callers persist each
 * credential immediately after enrollment so a later enrollment failure cannot
 * strand an already-verified factor with its secret only in process memory.
 */
export function createTotpSecretWriter(
  outputPath,
  { appendFile = appendFileSync, writeFile = writeFileSync } = {},
) {
  let initialized = false;

  return (variableName, secret) => {
    const line = `${variableName}=${secret}\n`;
    const options = { encoding: "utf8", mode: 0o600 };

    if (initialized) {
      appendFile(outputPath, line, options);
    } else {
      writeFile(outputPath, line, options);
      initialized = true;
    }
  };
}
