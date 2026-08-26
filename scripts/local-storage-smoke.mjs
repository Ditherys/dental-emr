import { randomUUID } from "node:crypto";

export const SMOKE_BROWSER_ORIGIN = "http://127.0.0.1:3000";

export const SMOKE_SYNTHETIC_ORGANIZATION_ID =
  "00000000-0000-4000-8000-000000000001";
export const SMOKE_SYNTHETIC_PATIENT_ID = "00000000-0000-4000-8000-000000000002";
export const SMOKE_CONTENT_TYPE = "text/plain";
export const SMOKE_OBJECT_CONTENT =
  "dental-emr synthetic storage smoke payload; deterministic fixture bytes only.\n";

export function buildSmokeObjectBytes() {
  return Uint8Array.from(Buffer.from(SMOKE_OBJECT_CONTENT, "utf8"));
}

const SIGNED_PARAMETER_NAMES = Object.freeze([
  "X-Amz-Algorithm",
  "X-Amz-Credential",
  "X-Amz-Date",
  "X-Amz-Expires",
  "X-Amz-SignedHeaders",
  "X-Amz-Signature",
]);

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value ?? "",
  );
}

export function buildSmokeObjectKey(fileId = randomUUID()) {
  if (!isUuid(fileId)) {
    throw new Error("The smoke object file id must be a UUID.");
  }

  return `org/${SMOKE_SYNTHETIC_ORGANIZATION_ID}/patients/${SMOKE_SYNTHETIC_PATIENT_ID}/files/${fileId}`;
}

// Returns only structural fields; presigned URL values are never exposed.
export function analyzePresignedUrl(rawUrl) {
  const url = new URL(rawUrl);

  return Object.freeze({
    protocol: url.protocol,
    host: url.host,
    pathname: decodeURIComponent(url.pathname),
    signedParameterNames: [...url.searchParams.keys()]
      .filter((name) => name.startsWith("X-Amz-"))
      .sort(),
  });
}

export function findPresignedUrlDefects(analyzed, { host, pathname }) {
  const defects = [];

  if (analyzed.protocol !== "http:") {
    defects.push(`unexpected protocol ${analyzed.protocol}`);
  }

  if (analyzed.host !== host) {
    defects.push(`unexpected host ${analyzed.host}`);
  }

  if (pathname !== undefined && analyzed.pathname !== `/${pathname}`) {
    defects.push("unexpected object path");
  }

  for (const name of SIGNED_PARAMETER_NAMES) {
    if (!analyzed.signedParameterNames.includes(name)) {
      defects.push(`missing signature parameter ${name}`);
    }
  }

  return defects;
}

export function redactSmokeOutput(output) {
  let redacted = String(output ?? "");

  redacted = redacted.replaceAll("minioadmin", "[REDACTED]");
  redacted = redacted.replace(
    /(X-Amz-(?:Signature|Credential))=[^\s&"']+/gi,
    "$1=[REDACTED]",
  );

  return redacted;
}

export function summarizeBrowserCorsResponse(headers) {
  const pick = (name) => headers.get(name)?.toLowerCase() ?? "";

  return Object.freeze({
    allowOrigin: pick("access-control-allow-origin"),
    allowMethods: pick("access-control-allow-methods"),
    allowHeaders: pick("access-control-allow-headers"),
    exposeHeaders: pick("access-control-expose-headers"),
  });
}

export function findPreflightResponseDefects(
  { status, cors },
  { expectedOrigin, expectedMethod, expectedHeader },
) {
  const defects = [];
  const tokens = (value, transform) =>
    value
      .split(",")
      .map((token) => transform(token.trim()))
      .filter((token) => token !== "");

  if (status !== 200 && status !== 204) {
    defects.push(`unexpected preflight status ${status}`);
  }

  if (cors.allowOrigin !== expectedOrigin) {
    defects.push(`preflight did not allow origin ${expectedOrigin}`);
  }

  if (!tokens(cors.allowMethods, (token) => token.toUpperCase()).includes(expectedMethod.toUpperCase())) {
    defects.push(`preflight did not allow method ${expectedMethod}`);
  }

  if (!tokens(cors.allowHeaders, (token) => token.toLowerCase()).includes(expectedHeader.toLowerCase())) {
    defects.push(`preflight did not allow header ${expectedHeader}`);
  }

  return defects;
}

export function findActualResponseDefects({ ok, status, cors }, { expectedOrigin }) {
  const defects = [];

  if (!ok || status < 200 || status >= 300) {
    defects.push(`unexpected response status ${status}`);
  }

  if (cors.allowOrigin !== expectedOrigin) {
    defects.push(`response did not allow origin ${expectedOrigin}`);
  }

  return defects;
}
