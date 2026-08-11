const defaultRedirectPath = "/dashboard";

export function getSafeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return defaultRedirectPath;
  }

  try {
    const decodedValue = decodeURIComponent(value);

    if (decodedValue.includes("\\") || decodedValue.startsWith("//")) {
      return defaultRedirectPath;
    }

    const baseUrl = new URL("https://app.invalid");
    const redirectUrl = new URL(value, baseUrl);

    if (redirectUrl.origin !== baseUrl.origin) {
      return defaultRedirectPath;
    }

    return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
  } catch {
    return defaultRedirectPath;
  }
}

export function getSafeMfaRedirectPath(value: string | null) {
  const safePath = getSafeRedirectPath(value);

  if (safePath === "/mfa/challenge" || safePath.startsWith("/mfa/challenge?")) {
    return defaultRedirectPath;
  }

  return safePath;
}
