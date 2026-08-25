# ADR-022 — Local MinIO object storage for development

**Status:** Accepted — explicitly approved by the project owner 2026-08-26

**Date:** 2026-08-26

**Decision owner:** Project owner

**Amends:** [ADR-005](ADR-005-r2-media-pipeline.md),
[ADR-020](ADR-020-local-supabase-hybrid-development.md)

**Related:** [ADR-016](ADR-016-supabase-cloud-first-development.md),
`TECHNICAL_ARCHITECTURE.md`, `SECURITY_ARCHITECTURE.md`,
`DATABASE_DESIGN.md`, `plans/004-patient-attachments.md`

## Context

ADR-005 established Cloudflare R2 as the canonical object store. ADR-020
established local Supabase as the disposable development database. Phase 4
introduces patient file attachments, which require object storage. During normal
development, Cloudflare R2 is not available, not configured, and should not be
required. Local development must work fully offline without cloud credentials.

MinIO is an S3-compatible object storage server that runs in Docker. It
implements the same presigned-URL, put/get/delete, and bucket-level API surface
that Cloudflare R2 provides. Using MinIO locally keeps the storage interface
identical between development and production while removing all cloud
dependencies from the daily development loop.

Cloudflare R2, hosted Supabase, and Vercel cloud integration testing are
deferred to the deployment-readiness gate.

## Decision

1. **Local development uses MinIO** through Docker as the S3-compatible object
   storage backend. MinIO is disposable, requires no cloud credentials, and runs
   fully offline.

2. **Cloudflare R2 remains the canonical production object store** under ADR-005.
   R2 configuration, credentials, buckets, and cloud integration testing are
   deferred until the deployment-readiness stage.

3. **The application uses a provider-neutral storage abstraction.** Domain and
   application code never couples directly to MinIO-specific or R2-specific APIs.
   The storage interface exposes `put`, `get`, `delete`, `createUploadUrl`, and
   `createDownloadUrl` operations that both MinIO and R2 satisfy through their
   S3-compatible APIs.

4. **File metadata is stored in Supabase/PostgreSQL**, not in the object store.
   The database remains authoritative for organization ownership, patient
   ownership, authorization, file metadata, audit information, and business
   state. Object storage contains the binary object only.

5. **Object keys must not contain patient-identifying information.** Use opaque
   identifiers following the pattern:
   `org/<org_uuid>/patients/<patient_uuid>/files/<file_uuid>`.

6. **Authorization checks happen before file access.** Presigned or equivalent
   controlled upload/download flows are used. The storage backend does not
   bypass application authorization.

7. **Audit logging covers sensitive file operations** where required by existing
   security doctrine.

8. **Synthetic/sample files only** during development and testing. No real
   patient files in local or test environments.

9. **No Cloudflare R2 dependency for Phase 4.** Phase 4 tests must pass entirely
   with local Supabase + MinIO. No internet access required for storage tests.

10. **No production bucket creation** as part of Phase 4.

## Environment model

```text
LOCAL DEVELOPMENT (Phase 4 onward)

Next.js application
        │
        ├── Supabase Local
        │     └── PostgreSQL / Auth / RLS / metadata
        │
        └── Storage abstraction
               │
               └── MinIO (Docker)
                    └── patient files / images / documents


PRODUCTION / DEPLOYMENT READINESS

Next.js / Vercel
        │
        ├── Hosted Supabase
        │
        └── Storage abstraction
               │
               └── Cloudflare R2
```

MinIO and Cloudflare R2 are both S3-compatible implementations behind the same
application storage interface. Switching between them requires only changing the
storage configuration/adapter, not redesigning the file system.

## Local workflow contract

1. MinIO runs as a Docker container alongside the local Supabase stack. It is
   disposable and data is not persistent across `docker compose down`.
2. Local storage commands must be explicit, PowerShell-compatible npm scripts.
3. Storage configuration uses environment variables that describe the
   S3-compatible interface, not Cloudflare-specific APIs.
4. Only synthetic fixtures are permitted. Real patient files must never be
   stored in the local MinIO instance.
5. Local storage success is Phase 4 checkpoint acceptance evidence only when
   paired with the required review and all relevant verification.

## Storage environment variables

```env
STORAGE_PROVIDER=s3
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_BUCKET=dental-emr-local
STORAGE_ACCESS_KEY=your_local_minio_access_key
STORAGE_SECRET_KEY=your_local_minio_secret_key
STORAGE_REGION=auto
```

Future production configuration points the same adapter to R2:

```env
STORAGE_PROVIDER=s3
STORAGE_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
STORAGE_BUCKET=your-production-bucket
STORAGE_ACCESS_KEY=your_r2_access_key
STORAGE_SECRET_KEY=your_r2_secret_key
STORAGE_REGION=auto
```

## Deployment-readiness sequence

```text
Local development complete
        ↓
Deployment-readiness review
        ↓
Provision hosted Supabase
        ↓
Provision private Cloudflare R2 bucket
        ↓
Configure Vercel / production-like environment
        ↓
Run cloud integration tests
        ↓
Verify CORS / presigned URLs / auth / RLS / storage permissions
        ↓
Security review
        ↓
Production deployment
```

## Consequences

### Benefits

- fully local development with no cloud dependency for storage;
- identical S3-compatible interface between MinIO and R2;
- no Cloudflare credentials required for daily development;
- tests run offline without internet access;
- storage abstraction allows clean swap to R2 at deployment readiness;
- object key design and authorization patterns are validated locally.

### Tradeoffs and risks

- MinIO does not support Cloudflare-specific features (Workers/Images bindings,
  event notifications, Bucket Locks); those are validated only at deployment
  readiness;
- local MinIO data is disposable and not representative of R2 durability/cost;
- developers must not confuse local MinIO behavior with R2 production behavior;
- Cloudflare R2 integration testing is deferred and may surface issues late.

## Revisit triggers

Revisit if MinIO and R2 S3-compatible behavior materially diverges, if local
storage testing cannot prove production equivalence, if Cloudflare-specific
features become required during development, or if the deployment-readiness gate
needs earlier storage validation.
