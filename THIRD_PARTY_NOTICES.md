# Third-Party Notices

This document records third-party software, fonts, and assets used in the
Dental EMR & Practice Management Platform, with their licenses, source
provenance, and any version pins required for reproducible builds.

The MIT and other permissive notices below are reproduced verbatim from the
upstream source as of the recorded commit. This document is the canonical
reference for license and source questions inside this repository.

## React-Odontogram-Modul (Ditherys fork)

**Used for:** measured tooth rendering, overlay registry, six-site
periodontal measurement semantics, and bridge/implant data model reference
in the EMR's odontogram domain. Implemented as TypeScript modules under
`src/lib/odontogram/` and React components under `src/components/odontogram/`;
no fork code is consumed as a published npm package at runtime.

**License:** MIT (see text below).

**Controlled source:**
`https://github.com/Ditherys/React-Odontogram-Modul`

**Pinned commit:** `5e28d931feefe4c3382513dbb0f5a9db9cf9948c` (short
`5e28d93`).

**Upstream of record:**
`https://github.com/ZoliQua/React-Odontogram-Modul` (MIT, copyright Zoltán
Dul 2026).

**Excluded from EMR use:** the fork's demo application, Classic renderer,
localStorage persistence, FHIR R4 export/import, PDF export, tour,
theme/language controls, demo build/deployment infrastructure, and the
runtime npm dependencies `dompurify` and `jspdf`. The fork's own lockfile,
`vite`/`tsc` library build, and `gh-pages` deployment are not used; the
Next.js App Router owns the target build.

**Review record:** see `docs/decisions/ADR-028-odontogram-renderer-domain-boundary.md`
and the O0 acceptance record `docs/ODONTOGRAM_O0_ACCEPTANCE.md`.

**O6 measured asset transplant (2026-08-28):** 21 measured tooth-template SVGs
copied verbatim from the pinned fork into
`src/components/odontogram/assets/measured/*.svg` (11–18, 31–38, 14_occl,
15_occl, 16_occl, 17_occl, 18_occl). Rendering uses only those measured assets
as static imports rendered as React nodes; no
`dangerouslySetInnerHTML`, `dompurify`, `jspdf`, or Classic assets are
introduced. Anatomy refinements remain tracked against the fork source above.

### MIT notice (verbatim, copyright 2026 Zoltán Dul)

```
MIT License

Copyright (c) 2026 Zoltán Dul

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
