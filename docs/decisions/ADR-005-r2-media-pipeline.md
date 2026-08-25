# ADR-005 — Cloudflare R2 Canonical Storage + Workers/Images Media Pipeline

**Status:** Accepted, amended 2026-08-26 (ADR-022 adds local MinIO)

**Date:** 2026-08-12  
**Scope:** Clinical files, image optimization, public project media

## Context

The application needs durable private storage for sensitive patient files and efficient image delivery for patient photos, exported X-rays, and website media. Cloudflare R2 provides object storage but does not by itself behave like a Cloudinary-style automatic image optimization service. The project should avoid splitting file ownership across multiple media vendors unless necessary.

Cloudflare provides an Images binding for Workers that can transform image streams/bytes, including data read from private R2 objects, and R2 event notifications can send object-create events to Cloudflare Queues for asynchronous processing.

**Local development uses MinIO** (S3-compatible Docker object storage) under
[ADR-022](ADR-022-local-minio-object-storage.md). MinIO satisfies the same
S3-compatible API surface (put/get/delete/presigned URLs) without requiring
Cloudflare credentials or internet access. The application storage abstraction
is provider-neutral; switching from MinIO to R2 requires only configuration
changes, not code changes.

## Decision

1. **Cloudflare R2 is the canonical object store.**
2. **Cloudflare Workers + Cloudflare Images are the default image-processing/optimization layer.**
3. **Cloudinary is not a default dependency.** Adding it later requires a new/updated ADR based on a validated requirement.
4. For clinical images, preserve the original upload unchanged as the authoritative source object.
5. Generate only bounded semantic derivatives such as:
   - `thumbnail`;
   - `preview`;
   - `display`.
6. Lossy or resized derivatives must never become the sole clinical/X-ray copy.
7. X-ray source files remain unchanged; any optimized browser representation is a derivative.
8. Private image transformation/delivery remains behind normal application authorization. Private R2 objects are never made public merely to enable transformations.
9. The application layer uses semantic media variants and must not couple clinical-domain records to Cloudflare transformation parameter syntax.
10. Cache transformed results and/or persist reusable derivatives to R2 so repeated views do not repeatedly decode/re-encode the same source.
11. When asynchronous processing is justified, use:

```text
R2 original upload
  → R2 object-create notification
  → Cloudflare Queue
  → consumer Worker
  → Cloudflare Images binding
  → derivative objects in R2
  → PostgreSQL processing/derivative metadata
```

12. Asynchronous processing must be idempotent and avoid recursive events on derivative prefixes.
13. Full DICOM/CBCT storage/viewing remains a separate later imaging architecture and is not solved by generic WebP/AVIF/JPEG derivative generation.
14. Keep Cloudflare-specific transformation calls behind a media-processing adapter. If Images pricing/limits later become unsuitable, a reviewed ADR may swap the processor (for example to a controlled Sharp-based service) without moving canonical storage away from R2 or changing semantic variants.
15. Re-check Cloudflare Images plan/pricing at implementation time; current official optimization guidance uses an Images Paid subscription.

## Security consequences

- Derivatives inherit the source object's tenant/sensitivity boundary unless deliberately public.
- Authorization must resolve the file/domain record before R2 access.
- Arbitrary object keys and arbitrary transformation parameters are not accepted as access proof.
- Private cache keys/routes must prevent cross-tenant mixing.
- Original checksums/metadata remain independently verifiable.

## Data-model consequences

- `file_objects` represents canonical/source objects.
- `file_derivatives` represents regenerable optimized variants.
- Clinical relationships reference source `file_objects`, not derivatives.
- Processing state is recorded explicitly and failure is recoverable.

## Frontend consequences

- Lists/grids use `thumbnail`.
- Normal viewing prefers `preview`/`display`.
- “View original” is an explicit authorized action when needed.
- UI handles processing/failure/fallback states.

## Operational consequences

- Cloudflare Images usage/cost must be monitored when the feature is activated.
- Workers Cache or persisted R2 derivatives should be used to avoid repeated transformation overhead.
- Queue dead-letter/retry behavior and derivative lifecycle must be defined in the implementation phase.

## References

- Cloudflare Images — Images binding / optimize with Workers
- Cloudflare Images — transform user-uploaded images before storing in R2
- Cloudflare R2 — event notifications and Queues
