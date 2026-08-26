import { describe, expect, it } from "vitest";

import {
  SMOKE_BROWSER_ORIGIN,
  SMOKE_CONTENT_TYPE,
  SMOKE_OBJECT_CONTENT,
  SMOKE_SYNTHETIC_ORGANIZATION_ID,
  SMOKE_SYNTHETIC_PATIENT_ID,
  analyzePresignedUrl,
  buildSmokeObjectBytes,
  buildSmokeObjectKey,
  findActualResponseDefects,
  findPreflightResponseDefects,
  findPresignedUrlDefects,
  redactSmokeOutput,
  summarizeBrowserCorsResponse,
} from "./local-storage-smoke.mjs";

describe("synthetic smoke object", () => {
  it("builds the plan-shaped opaque key without patient-identifying data", () => {
    const key = buildSmokeObjectKey(
      "00000000-0000-4000-8000-000000000003",
    );

    expect(key).toBe(
      `org/${SMOKE_SYNTHETIC_ORGANIZATION_ID}/patients/${SMOKE_SYNTHETIC_PATIENT_ID}/files/00000000-0000-4000-8000-000000000003`,
    );
    expect(key.startsWith(`org/${SMOKE_SYNTHETIC_ORGANIZATION_ID}/patients/`)).toBe(
      true,
    );
  });

  it.each(["not-a-uuid", "", "../escape", null])(
    "refuses a non-UUID file id (%s)",
    (fileId) => {
      expect(() => buildSmokeObjectKey(fileId)).toThrow(/must be a UUID/);
    },
  );

  it("uses a fixed synthetic payload with a dialog-compatible content type", () => {
    expect(SMOKE_CONTENT_TYPE).toBe("text/plain");
    expect(SMOKE_OBJECT_CONTENT).toMatch(
      /dental-emr synthetic storage smoke payload/,
    );
    expect(SMOKE_OBJECT_CONTENT).not.toMatch(/patient/i);
    expect(buildSmokeObjectBytes()).toEqual(
      Uint8Array.from(Buffer.from(SMOKE_OBJECT_CONTENT, "utf8")),
    );
  });
});

const SAMPLE_PRESIGNED_URL =
  "http://127.0.0.1:9000/dental-emr-local/org%2Fkey?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=stub%2F20260826%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20260826T000000Z&X-Amz-Expires=120&X-Amz-SignedHeaders=host&X-Amz-Signature=abcdef1234567890";

describe("presigned URL analysis", () => {
  it("exposes structure and parameter names but never signature values", () => {
    const analyzed = analyzePresignedUrl(SAMPLE_PRESIGNED_URL);

    expect(analyzed).toEqual({
      protocol: "http:",
      host: "127.0.0.1:9000",
      pathname: "/dental-emr-local/org/key",
      signedParameterNames: [
        "X-Amz-Algorithm",
        "X-Amz-Credential",
        "X-Amz-Date",
        "X-Amz-Expires",
        "X-Amz-Signature",
        "X-Amz-SignedHeaders",
      ],
    });
    expect(JSON.stringify(analyzed)).not.toContain("abcdef1234567890");
    expect(JSON.stringify(analyzed)).not.toContain("AWS4-HMAC-SHA256");
  });

  it("accepts a structurally complete URL for the expected host and path", () => {
    const analyzed = analyzePresignedUrl(SAMPLE_PRESIGNED_URL);

    expect(
      findPresignedUrlDefects(analyzed, {
        host: "127.0.0.1:9000",
        pathname: "dental-emr-local/org/key",
      }),
    ).toEqual([]);
  });

  it.each([
    [{ host: "s3.amazonaws.com" }, /unexpected host/],
    [{ host: "127.0.0.1:9000", pathname: "other-bucket/object" }, /unexpected object path/],
  ])("reports defects for %j", (overrides) => {
    const analyzed = analyzePresignedUrl(SAMPLE_PRESIGNED_URL);
    const defects = findPresignedUrlDefects(analyzed, overrides);

    expect(defects.length).toBeGreaterThan(0);
  });

  it("reports every missing signature parameter by name only", () => {
    const analyzed = analyzePresignedUrl("http://127.0.0.1:9000/bucket/key");

    expect(findPresignedUrlDefects(analyzed, { host: "127.0.0.1:9000" })).toEqual([
      "missing signature parameter X-Amz-Algorithm",
      "missing signature parameter X-Amz-Credential",
      "missing signature parameter X-Amz-Date",
      "missing signature parameter X-Amz-Expires",
      "missing signature parameter X-Amz-SignedHeaders",
      "missing signature parameter X-Amz-Signature",
    ]);
  });
});

describe("smoke output redaction", () => {
  it("removes local credentials and signature values from any output", () => {
    const redacted = redactSmokeOutput(
      "PUT http://127.0.0.1:9000/bucket/k?X-Amz-Signature=deadbeef99 user=minioadmin cred=X-Amz-Credential=abc%2Fdef failed",
    );

    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("minioadmin");
    expect(redacted).not.toContain("deadbeef99");
    expect(redacted).not.toMatch(/X-Amz-Signature=dead|X-Amz-Credential=abc/);
  });

  it("keeps ordinary progress lines intact", () => {
    const line = "PASS storage:smoke:local:put (checksum verified)";

    expect(redactSmokeOutput(line)).toBe(line);
  });
});

function headersFrom(entries) {
  return new Headers(entries);
}

describe("browser CORS response evaluation", () => {
  const allowed = summarizeBrowserCorsResponse(
    headersFrom({
      "Access-Control-Allow-Origin": SMOKE_BROWSER_ORIGIN,
      "Access-Control-Allow-Methods": "GET, PUT",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Expose-Headers": "etag",
    }),
  );

  it("summarizes lowercase CORS headers", () => {
    expect(allowed).toEqual({
      allowOrigin: SMOKE_BROWSER_ORIGIN,
      allowMethods: "get, put",
      allowHeaders: "content-type",
      exposeHeaders: "etag",
    });
  });

  it("accepts a compliant preflight and actual response pair", () => {
    expect(
      findPreflightResponseDefects(
        { status: 204, cors: allowed },
        {
          expectedOrigin: SMOKE_BROWSER_ORIGIN,
          expectedMethod: "PUT",
          expectedHeader: "content-type",
        },
      ),
    ).toEqual([]);
    expect(
      findActualResponseDefects(
        { ok: true, status: 200, cors: allowed },
        { expectedOrigin: SMOKE_BROWSER_ORIGIN },
      ),
    ).toEqual([]);
  });

  it.each([
    [
      { status: 403, cors: allowed },
      { expectedOrigin: SMOKE_BROWSER_ORIGIN, expectedMethod: "PUT", expectedHeader: "content-type" },
      /unexpected preflight status 403/,
    ],
    [
      {
        status: 204,
        cors: summarizeBrowserCorsResponse(headersFrom({ "Access-Control-Allow-Origin": "http://evil.example" })),
      },
      { expectedOrigin: SMOKE_BROWSER_ORIGIN, expectedMethod: "PUT", expectedHeader: "content-type" },
      /did not allow origin/,
    ],
    [
      {
        status: 204,
        cors: summarizeBrowserCorsResponse(headersFrom({ "Access-Control-Allow-Origin": "*" })),
      },
      { expectedOrigin: SMOKE_BROWSER_ORIGIN, expectedMethod: "PUT", expectedHeader: "content-type" },
      /did not allow origin/,
    ],
    [
      {
        status: 204,
        cors: summarizeBrowserCorsResponse(headersFrom({ "Access-Control-Allow-Origin": SMOKE_BROWSER_ORIGIN })),
      },
      { expectedOrigin: SMOKE_BROWSER_ORIGIN, expectedMethod: "DELETE", expectedHeader: "content-type" },
      /did not allow method DELETE/,
    ],
  ])("reports preflight defects for %j", (response, expectations, pattern) => {
    expect(findPreflightResponseDefects(response, expectations).join("; ")).toMatch(
      pattern,
    );
  });

  it.each([
    [{ ok: false, status: 500, cors: allowed }, /unexpected response status 500/],
    [
      {
        ok: true,
        status: 200,
        cors: summarizeBrowserCorsResponse(headersFrom({})),
      },
      /did not allow origin/,
    ],
  ])("reports actual-request defects for %j", (response, pattern) => {
    expect(
      findActualResponseDefects(response, {
        expectedOrigin: SMOKE_BROWSER_ORIGIN,
      }).join("; "),
    ).toMatch(pattern);
  });
});
