# Phase 4 — Patient File Attachment Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Executed 2026-08-26 under explicit project-owner authorization (one-pass SDD directive). Phase review completed with recorded deferred dispositions (see docs/AI_HANDOFF.md).

**Goal:** Establish the object-storage foundation and patient file attachment
schema so later phases can upload, retrieve, authorize, and audit patient files.

**Architecture:** File metadata is stored in PostgreSQL. Binary objects are
stored in S3-compatible object storage (MinIO locally, Cloudflare R2 in
production) under ADR-022. The application uses a provider-neutral storage
abstraction; domain code never couples directly to MinIO or R2 APIs. File
access is permission-checked and tenant-isolated.

**Tech Stack:** Next.js App Router, React, TypeScript strict, Zod, React Hook
Form, Tailwind CSS, shadcn/ui, Lucide, Supabase/PostgreSQL, pgTAP, Vitest,
Testing Library, MinIO (local Docker), S3-compatible storage abstraction.

## Global Constraints

- Organization is the tenant boundary; branch is operational context only.
- Do not trust browser-supplied organization, actor, role, permission, audit,
  or authorization data.
- All exposed tenant tables require RLS. Base-table DML is never granted to
  browser roles; new `SECURITY DEFINER` functions begin with default execution
  revoked and end with exact registered grants only.
- File metadata lives in PostgreSQL; binary objects live in object storage.
  Neither substitutable for the other.
- Object keys must not contain patient-identifying information. Use opaque
  identifiers: `org/<org_uuid>/patients/<patient_uuid>/files/<file_uuid>`.
- Use deterministic synthetic fixtures only. No real patient files in
  development or testing.
- Work in the current checkout on `main`. Do not create a worktree or branch.
- Every database checkpoint runs the local guarded reconstruction path from
  ADR-020/ADR-022. Cloud TEST remains mandatory before production.
- Phase 4 tests must pass entirely with local Supabase + MinIO. No internet
  access required for storage tests.
- No Cloudflare R2 dependency. R2 is deferred to deployment readiness.

## Storage Abstraction

The storage interface must support:

```ts
put(key: string, body: ReadableStream, contentType: string): Promise<{ key: string; checksum: string }>
get(key: string): Promise<{ body: ReadableStream; contentType: string }>
delete(key: string): Promise<void>
createUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<{ url: string; expiresAt: Date }>
createDownloadUrl(key: string, expiresIn?: number): Promise<{ url: string; expiresAt: Date }>
```

Both MinIO and Cloudflare R2 satisfy this interface through their S3-compatible
APIs. The implementation is selected by configuration, not by code branching.

## Environment Variables

```env
STORAGE_PROVIDER=s3
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_BUCKET=dental-emr-local
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_REGION=auto
```

## Tasks

- [x] **P4-01: Storage abstraction layer**
  - Create `src/lib/storage/` with S3-compatible storage adapter
  - Implement `put`, `get`, `delete`, `createUploadUrl`, `createDownloadUrl`
  - Zod-validated configuration from environment variables
  - Unit tests for the adapter interface

- [x] **P4-02: MinIO Docker configuration**
  - Add MinIO to local Docker infrastructure (Docker Compose or Supabase extension)
  - Document local MinIO setup and lifecycle
  - Verify MinIO runs alongside local Supabase

- [x] **P4-03: File metadata schema**
  - Migration: `file_objects` table (org FK, patient FK, file UUID, object key, MIME type, size, checksum, uploader, timestamps, status)
  - RLS policies: org-scoped, patient-scoped
  - pgTAP tests for tenant isolation and FK constraints

- [x] **P4-04: File upload RPCs**
  - `create_file_upload`: generates presigned URL, returns file metadata
  - `confirm_file_upload`: confirms upload, updates status, writes audit event
  - Both require `provider.manage` or `demographics_write` permission
  - pgTAP tests for authorization and audit

- [x] **P4-05: File access RPCs**
  - `get_file_download_url`: generates presigned GET URL after authorization check
  - `list_patient_files`: returns file metadata for a patient (org-scoped)
  - Both require appropriate read permission
  - pgTAP tests for tenant isolation and authorization

- [x] **P4-06: File deletion/archive**
  - `archive_file`: soft-delete file metadata, optionally delete from object storage
  - Requires AAL2
  - pgTAP tests for lifecycle and authorization

- [x] **P4-07: Server-only file services**
  - File service layer with Zod validation
  - Server-only adapters for upload, access, and deletion flows
  - Unit tests for service layer

- [x] **P4-08: File attachment UI foundation**
  - File upload component for patient workspace
  - File list component showing metadata
  - File download action with presigned URL
  - Mobile/desktop responsive

- [x] **P4-09: Integration verification**
  - Local reconstruction with MinIO
  - pgTAP tests pass
  - Unit tests pass
  - Lint, typecheck, build pass
  - Upload/download/archive flows work locally

## Deferred to Deployment Readiness

- Cloudflare R2 bucket provisioning and configuration
- Cloudflare Workers/Images for derivative generation
- Presigned URL CORS configuration for R2
- R2 bucket-lock retention rules
- R2 backup replication
- Cloud integration tests against R2
- Production storage credential management

## Acceptance Criteria

- File metadata stored in PostgreSQL with org/patient FK constraints
- Binary objects stored in S3-compatible object storage
- Authorization checks before every file access
- Audit logging for upload, download, and deletion
- Presigned upload/download flows
- Synthetic files only in development/testing
- No dependency on Cloudflare R2
- No internet access required for storage tests
- All tests pass locally with MinIO
