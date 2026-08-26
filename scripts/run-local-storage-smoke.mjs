import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { register } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  SMOKE_BROWSER_ORIGIN,
  SMOKE_CONTENT_TYPE,
  analyzePresignedUrl,
  buildSmokeObjectBytes,
  buildSmokeObjectKey,
  findActualResponseDefects,
  findPreflightResponseDefects,
  findPresignedUrlDefects,
  redactSmokeOutput,
  summarizeBrowserCorsResponse,
} from "./local-storage-smoke.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

const TRANSFORM_MARKER = "DENTAL_EMR_STORAGE_SMOKE_TRANSFORM";
const SMOKE_BUCKET = "dental-emr-local";
const ALLOWED_ENDPOINT_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);

function emit(line) {
  console.log(redactSmokeOutput(line));
}

function fail(message) {
  console.error(`FAIL storage:smoke:local: ${redactSmokeOutput(message)}`);
  process.exit(1);
}

if (process.env[TRANSFORM_MARKER] !== "1") {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-transform-types",
      "--disable-warning=ExperimentalWarning",
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      fileURLToPath(import.meta.url),
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, [TRANSFORM_MARKER]: "1" },
      stdio: "inherit",
    },
  );
  process.exit(result.status ?? 1);
}

async function loadStorageClient() {
  await register(
    "./local-node-ts-loader.mjs",
    pathToFileURL(`${scriptDirectory}/`).href,
  );
  const storageModule = await import("../src/lib/storage/index.ts");

  return {
    storage: storageModule.createStorageClient(),
    StorageError: storageModule.StorageError,
  };
}

function assertLocalStorageEnvironment() {
  const endpoint = process.env.STORAGE_ENDPOINT ?? "";
  const bucket = process.env.STORAGE_BUCKET ?? "";

  let endpointHostname;

  try {
    endpointHostname = new URL(endpoint).hostname;
  } catch {
    fail("STORAGE_ENDPOINT is not a usable URL; run npm run storage:start:local first.");
  }

  if (!ALLOWED_ENDPOINT_HOSTNAMES.has(endpointHostname)) {
    fail("storage:smoke:local refuses non-loopback STORAGE_ENDPOINT targets.");
  }

  if (bucket !== SMOKE_BUCKET) {
    fail(`storage:smoke:local only runs against the ${SMOKE_BUCKET} local bucket.`);
  }
}

async function readAllBytes(webStream) {
  return new Uint8Array(await new Response(webStream).arrayBuffer());
}

function streamFromBytes(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function assertDeepEqual(actual, expected, label) {
  if (actual.length !== expected.length) {
    fail(`${label}: length mismatch.`);
  }

  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) {
      fail(`${label}: content mismatch at byte ${index}.`);
    }
  }
}

function analyzeOrThrow(rawUrl, label, key) {
  const analyzed = analyzePresignedUrl(rawUrl);
  const defects = findPresignedUrlDefects(analyzed, {
    host: "127.0.0.1:9000",
    pathname: `${SMOKE_BUCKET}/${key}`,
  });

  if (defects.length > 0) {
    fail(`${label}: ${defects.join("; ")}.`);
  }

  emit(
    `${label}: host ${analyzed.host}, signature parameters verified (URL not printed).`,
  );

  return analyzed;
}

function assertNoDefects(defects, label) {
  if (defects.length > 0) {
    fail(`${label}: ${defects.join("; ")}.`);
  }
}

try {
  assertLocalStorageEnvironment();

  const { storage, StorageError } = await loadStorageClient();
  const bytes = buildSmokeObjectBytes();
  const key = buildSmokeObjectKey();

  try {
    const put = await storage.put(key, streamFromBytes(bytes), SMOKE_CONTENT_TYPE);
    const localChecksum = createHash("sha256").update(bytes).digest("hex");

    if (put.key !== key || put.checksum !== localChecksum) {
      fail("put: stored key or checksum did not match the synthetic payload.");
    }
    emit("PASS storage:smoke:local:put (checksum verified)");

    const stat = await storage.stat(key);

    if (
      stat.sizeBytes !== bytes.byteLength ||
      stat.contentType !== SMOKE_CONTENT_TYPE
    ) {
      fail("stat: size or content type mismatch.");
    }
    emit(`PASS storage:smoke:local:stat (${stat.sizeBytes} bytes)`);

    const got = await storage.get(key);

    assertDeepEqual(await readAllBytes(got.body), bytes, "get");
    emit("PASS storage:smoke:local:get");

    const uploadUrl = (await storage.createUploadUrl(key, SMOKE_CONTENT_TYPE, 120))
      .url;
    analyzeOrThrow(uploadUrl, "PASS storage:smoke:local:upload-url", key);

    const downloadUrl = (await storage.createDownloadUrl(key, 120)).url;
    analyzeOrThrow(downloadUrl, "PASS storage:smoke:local:download-url", key);

    emit(
      `Browser-CORS check against ${SMOKE_BUCKET} from ${SMOKE_BROWSER_ORIGIN} (as the upload dialog would):`,
    );

    const preflight = await fetch(uploadUrl, {
      method: "OPTIONS",
      headers: {
        Origin: SMOKE_BROWSER_ORIGIN,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    assertNoDefects(
      findPreflightResponseDefects(
        { status: preflight.status, cors: summarizeBrowserCorsResponse(preflight.headers) },
        {
          expectedOrigin: SMOKE_BROWSER_ORIGIN,
          expectedMethod: "PUT",
          expectedHeader: "content-type",
        },
      ),
      "preflight",
    );
    emit("PASS storage:smoke:local:preflight (OPTIONS PUT allowed)");

    const browserPut = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Origin: SMOKE_BROWSER_ORIGIN,
        "Content-Type": SMOKE_CONTENT_TYPE,
      },
      body: bytes,
    });
    assertNoDefects(
      findActualResponseDefects(
        { ok: browserPut.ok, status: browserPut.status, cors: summarizeBrowserCorsResponse(browserPut.headers) },
        { expectedOrigin: SMOKE_BROWSER_ORIGIN },
      ),
      "browser put",
    );
    emit("PASS storage:smoke:local:browser-put (Origin + content-type accepted)");

    const browserGet = await fetch(downloadUrl, {
      headers: { Origin: SMOKE_BROWSER_ORIGIN },
    });
    assertNoDefects(
      findActualResponseDefects(
        { ok: browserGet.ok, status: browserGet.status, cors: summarizeBrowserCorsResponse(browserGet.headers) },
        { expectedOrigin: SMOKE_BROWSER_ORIGIN },
      ),
      "browser get",
    );
    assertDeepEqual(await readAllBytes(browserGet.body), bytes, "browser get body");
    emit("PASS storage:smoke:local:browser-get");

    await storage.delete(key);
    emit("PASS storage:smoke:local:delete");

    let statAfterDeleteFailedAsExpected = false;

    try {
      await storage.stat(key);
    } catch (error) {
      statAfterDeleteFailedAsExpected =
        error instanceof StorageError && error.code === "READ_FAILED";
    }

    if (!statAfterDeleteFailedAsExpected) {
      fail("delete: stat after delete unexpectedly succeeded or failed differently.");
    }
    emit("PASS storage:smoke:local:stat-after-delete (READ_FAILED as expected)");
  } finally {
    try {
      await storage.delete(key);
    } catch {
      // Best-effort cleanup after an earlier failure.
    }
  }

  emit("PASS storage:smoke:local");
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
