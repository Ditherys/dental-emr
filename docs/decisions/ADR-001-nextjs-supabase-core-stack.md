# ADR-001 — Next.js + Supabase Core Stack

**Status:** Accepted
**Date:** 2026-08-12
**Scope:** Application framework, identity provider, structured data store
**Related:** `MASTER_PRODUCT_PLAN.md`, `TECHNICAL_ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `plans/001-foundation.md`, ADR-016

## Context

The platform needs one primary application framework and one primary backend/identity platform for the private EMR and the public marketing site, reproducible from a Windows + PowerShell developer workstation without a local database runtime.

This ADR records the stack already scaffolded and in active use as of Phase 1 Foundation (commits `e110ea9`, `c292fed`, `f68011b`, `d2b8edb`, `60873bc`, `e085ccf`); it documents an already-approved and already-implemented decision rather than introducing a new one.

## Decision

1. **Next.js App Router** is the application framework, with **React** and **TypeScript in strict mode**. No Pages Router structure is used.
2. **npm** is the package manager; `package-lock.json` is committed and authoritative. No mixed lockfiles.
3. **No ORM.** Data access uses committed PostgreSQL migrations (`supabase/migrations/`) plus Supabase-generated TypeScript types (`src/types/database.generated.ts`) and server-side Supabase clients (`src/lib/supabase/client.ts`, `server.ts`, `proxy.ts`, `admin.ts`).
4. **Supabase Auth** is the identity/session provider, integrated using the current Supabase SSR pattern (`src/proxy.ts`, `src/lib/supabase/proxy.ts`) rather than trusting an unverified session object.
5. **PostgreSQL + Row Level Security (RLS)** is the structured system of record, hosted on Supabase Cloud. RLS is a backstop alongside application authorization, not a replacement for it (see ADR-003).
6. **Tailwind CSS + shadcn/ui + Geist (`next/font`)** form the UI/design-token layer; React Hook Form + Zod is the form/validation pattern; TanStack Query is used selectively rather than globally.
7. Framework/library versions are pinned through the committed lockfile rather than hard-coded into planning documents; current stable compatible releases were used at scaffold time and are expected to be upgraded deliberately, not silently.

## Consequences

- All later domains build on this same App Router + Supabase pairing; introducing a second framework or a second primary database requires a new ADR.
- Because there is no ORM, schema drift is caught by regenerating types from the linked Supabase project (`npm run db:types`, `npm run db:types:check`), not by an ORM migration diff tool.
- Supabase secret/service-role keys remain server-only (`src/lib/supabase/admin.ts` is never imported by Client Components); only the publishable key and project URL are exposed to the browser.
- Cloud-hosting specifics (no local Supabase runtime, linked-project workflow) are governed separately by ADR-016 and are not duplicated here.

## Revisit triggers

Revisit only if a concrete, validated requirement shows Next.js, React, or Supabase is materially blocking the product (not personal preference). Any replacement of the framework, identity provider, or primary database requires an ADR and explicit human approval, per `CLAUDE.md`/`AGENTS.md`.
