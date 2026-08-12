# Browser Security Baseline

P1-15 establishes an enforcing browser-security baseline in `next.config.ts`.
It applies to application documents and route-handler responses; immutable
framework assets retain Next.js-managed caching.

## Enforced headers

- `Content-Security-Policy` allows application resources from `self` and
  browser connections only to `self` plus the exact configured Supabase HTTP
  and WebSocket origins. It denies objects, frames, inline event handlers, and
  unrelated framing.
- `X-Frame-Options: DENY` provides legacy clickjacking protection alongside
  CSP `frame-ancestors 'none'`.
- `X-Content-Type-Options: nosniff` disables MIME sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin` prevents cross-origin URL
  paths and query strings from being sent as referrers.
- `Permissions-Policy` disables capabilities not used in Phase 1, including
  camera, microphone, geolocation, payment, and public-key credential access.
- `Strict-Transport-Security: max-age=31536000` and CSP
  `upgrade-insecure-requests` are emitted only when the build is production and
  the validated `APP_URL` origin uses HTTPS. `includeSubDomains` and `preload`
  are intentionally omitted until all deployment hostnames and subdomains are
  confirmed HTTPS-only.

The configuration adds no permissive CORS response headers. Cross-origin API
access must be introduced per endpoint after an explicit authorization and
origin review.

## CSP compatibility boundary

The baseline is enforced rather than report-only. Production excludes
`unsafe-eval`; development includes it because the installed Next.js 16.3
debugging runtime requires it. The baseline currently allows inline framework
scripts and styles so static public rendering and existing React/Radix inline
style behavior remain functional.

Before production patient use, replace inline script allowance with a tested
nonce- or hash-based strategy. A nonce strategy makes affected routes dynamic
and must pass Next.js rendering, performance, and library compatibility tests.
Do not remove CSP or add wildcard sources to accommodate a later integration.
Add only the exact required origin after review.

## Sensitive response caching

Current authentication and private application routes receive:

```text
Cache-Control: private, no-store, max-age=0, must-revalidate
Pragma: no-cache
Expires: 0
```

Public pages do not receive these no-store headers. Every later route that can
return patient, clinical, billing, presigned-URL, invitation, MFA, or other
protected content must either be added to
`PRIVATE_NO_STORE_ROUTE_PATTERNS` or use `PRIVATE_NO_STORE_HEADERS` directly in
its route response. Tests must verify that the actual response is not publicly
cacheable.

## Change checklist

When a browser-facing integration or capability is added:

1. identify the exact origin and directive/capability it requires;
2. keep service-role keys, OAuth refresh tokens, and other secrets server-only;
3. update the centralized policy and its negative tests;
4. verify production headers on both a public and a protected response;
5. confirm no wildcard source, production `unsafe-eval`, or public caching of a
   protected response was introduced.
