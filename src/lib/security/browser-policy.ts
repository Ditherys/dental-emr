type HeaderEntry = Readonly<{
  key: string;
  value: string;
}>;

type HeaderRule = Readonly<{
  source: string;
  headers: readonly HeaderEntry[];
}>;

type BrowserPolicyOptions = Readonly<{
  allowInsecureLocalSupabase?: boolean;
  isHttpsDeployment: boolean;
  isProduction: boolean;
  storageEndpointUrl?: string;
  supabaseUrl: string;
}>;

const permissionsPolicy = [
  "accelerometer=()",
  "autoplay=()",
  "browsing-topics=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-create=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "usb=()",
].join(", ");

export const PRIVATE_NO_STORE_HEADERS = [
  {
    key: "Cache-Control",
    value: "private, no-store, max-age=0, must-revalidate",
  },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
] as const satisfies readonly HeaderEntry[];

/**
 * Current routes whose responses can contain identity, invitation, MFA, or
 * organization-scoped application state. Add later protected route roots here
 * as they are introduced; public routes intentionally remain cacheable.
 */
export const PRIVATE_NO_STORE_ROUTE_PATTERNS = [
  "/accept-invite/:path*",
  "/auth/:path*",
  "/dashboard/:path*",
  "/login/:path*",
  "/mfa/:path*",
  "/settings/:path*",
] as const;

export function isHttpsDeploymentUrl(appUrl: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(appUrl);
  } catch {
    throw new Error(
      "APP_URL must be a valid absolute HTTP(S) URL before browser security headers can be created.",
    );
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("APP_URL must use HTTP or HTTPS.");
  }

  if (
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      "APP_URL must be an origin without credentials, path, query, or fragment.",
    );
  }

  return parsedUrl.protocol === "https:";
}

function getSupabaseConnectSources(
  supabaseUrl: string,
  isProduction: boolean,
  allowInsecureLocalSupabase: boolean,
) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be a valid absolute HTTP(S) URL before browser security headers can be created.",
    );
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTP or HTTPS.");
  }

  if (
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be an origin without credentials, path, query, or fragment.",
    );
  }

  const isExactLocalSupabaseOrigin =
    parsedUrl.origin === "http://127.0.0.1:54321";

  if (allowInsecureLocalSupabase && !isExactLocalSupabaseOrigin) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must exactly match the local Supabase API origin.",
    );
  }

  if (
    isProduction &&
    parsedUrl.protocol !== "https:" &&
    !allowInsecureLocalSupabase
  ) {
    throw new Error("Production Supabase browser connections must use HTTPS.");
  }

  const websocketUrl = new URL(parsedUrl.origin);
  websocketUrl.protocol = parsedUrl.protocol === "https:" ? "wss:" : "ws:";

  return [parsedUrl.origin, websocketUrl.origin];
}

function getStorageConnectSource(
  storageEndpointUrl: string,
  isProduction: boolean,
  allowInsecureLocalStorage: boolean,
) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(storageEndpointUrl);
  } catch {
    throw new Error(
      "STORAGE_ENDPOINT must be a valid absolute HTTP(S) URL before browser security headers can be created.",
    );
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("STORAGE_ENDPOINT must use HTTP or HTTPS.");
  }

  if (
    parsedUrl.username ||
    parsedUrl.password ||
    (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "") ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      "STORAGE_ENDPOINT must be an origin without credentials, path, query, or fragment.",
    );
  }

  const isExactLocalMinioOrigin =
    parsedUrl.origin === "http://127.0.0.1:9000";

  if (allowInsecureLocalStorage && !isExactLocalMinioOrigin) {
    throw new Error(
      "STORAGE_ENDPOINT must exactly match the local MinIO API origin.",
    );
  }

  if (
    isProduction &&
    parsedUrl.protocol !== "https:" &&
    !allowInsecureLocalStorage
  ) {
    throw new Error("Production storage browser connections must use HTTPS.");
  }

  return parsedUrl.origin;
}

export function createContentSecurityPolicy({
  allowInsecureLocalSupabase = false,
  isHttpsDeployment,
  isProduction,
  storageEndpointUrl,
  supabaseUrl,
}: BrowserPolicyOptions) {
  const connectSources = getSupabaseConnectSources(
    supabaseUrl,
    isProduction,
    allowInsecureLocalSupabase,
  );

  if (storageEndpointUrl) {
    connectSources.push(
      getStorageConnectSource(
        storageEndpointUrl,
        isProduction,
        allowInsecureLocalSupabase,
      ),
    );
  }

  const scriptSources = ["'self'", "'unsafe-inline'"];

  if (!isProduction) {
    // Required by the installed Next.js development runtime. Never emitted by
    // the production configuration.
    scriptSources.push("'unsafe-eval'");
  }

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${connectSources.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
  ];

  if (isProduction && isHttpsDeployment) {
    directives.push("upgrade-insecure-requests");
  }

  return `${directives.join("; ")};`;
}

export function createBrowserSecurityHeaders(
  options: BrowserPolicyOptions,
): readonly HeaderEntry[] {
  const headers: HeaderEntry[] = [
    {
      key: "Content-Security-Policy",
      value: createContentSecurityPolicy(options),
    },
    { key: "Permissions-Policy", value: permissionsPolicy },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
  ];

  if (options.isProduction && options.isHttpsDeployment) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000",
    });
  }

  return headers;
}

export function createBrowserHeaderRules(
  options: BrowserPolicyOptions,
): readonly HeaderRule[] {
  return [
    {
      source: "/:path*",
      headers: createBrowserSecurityHeaders(options),
    },
    ...PRIVATE_NO_STORE_ROUTE_PATTERNS.map((source) => ({
      source,
      headers: PRIVATE_NO_STORE_HEADERS,
    })),
  ];
}
