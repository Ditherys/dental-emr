# AI Handoff — Odontogram display toggles: final-review fix wave

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

## Final-review fixes on the odontogram anatomical display toggles

### Bounded slice implemented

Three findings from the whole-branch final review of the 7-task plan
`docs/superpowers/plans/2026-09-03-odontogram-anatomical-display-toggles.md`
(the feature itself is commits `4c84290..7fe6207`, already reviewed and
merged). No new product scope; no schema, migration, RLS, policy, service or
canonical-projection change.

**Finding 1 (critical) — the occlusal angle could silently delete a recorded
finding from a posterior tooth.** Task 4 gave anterior teeth (no occlusal
template at all) a front-template fallback. The 14 posterior occlusal
templates *do* exist, so that fallback never fired for them — but they
structurally carry none of the artwork for endodontics, mobility, a
periodontal alert, a retained root, an extraction wound, an implant
connector, root caries, crown-margin leakage or an orthodontic arrow.
`measuredForkLayers`'s closing
`filter((id) => availableLayerIds.has(id))` therefore dropped those ids in
silence, and the finding vanished from the chart when the clinician ticked
"Occlusal view". This is the sibling occurrence the previous handoff asked
Codex to look for, found by the final review.

Fix, in `src/components/odontogram/measured-svg-asset.tsx`: both fallback
reasons now converge on one exported pure resolver,
`resolveMeasuredToothAsset(tooth, display) -> { assetKey, view } | null`. For
an occlusal request where an occlusal template *does* exist it computes what
the tooth would activate at front (against the front template's own layer
index), subtracts the closed constant `OCCLUSAL_ABSENT_BASELINE_LAYERS`, and
falls back to the front template if anything is left that the occlusal
template's layer index does not carry.

`OCCLUSAL_ABSENT_BASELINE_LAYERS` is exactly
`tooth-healthy-pulp`, `milktooth-healthy-pulp`, `tooth-base-beauty`,
`milktooth-beauty` — baseline artwork a top-down projection legitimately does
not depict (no pulp cross-section, no lateral "beauty" shading). This list is
load-bearing in *both* directions and is the main review risk: too narrow and
a finding still leaks; too broad and, because `tooth-healthy-pulp` is
unconditional baseline artwork for nearly every natural tooth, every tooth
falls back to front and the whole toggle is silently neutered. It is not
trusted as a hand-written constant — a test recomputes it from the installed
templates.

`data-view` (`measured-tooth.tsx`) now reports the angle actually drawn
rather than the one requested, for both fallback reasons. `tooth.view` is the
canonical projection's requested-view field and is **not** mutated. The tooth
tile is on the eager side of the ~3.5 MB anatomy code-splitting boundary and
must not import `measured-assets`, so the lazy asset component reports the
drawn view back through an `onViewResolved(requested, drawn)` callback; the
tile stores the pair and discards it as soon as the chart asks for a
different angle, so the attribute can never report a stale angle.

**Finding 2 (important) — wisdom-teeth hiding, adjudicated as deliberate.**
Ruling from the plan owner: keep the behaviour, document and lock it. No
behaviour change. `isThirdMolar` in `measured-chart.tsx` now carries a
comment stating the removal is total by explicit product decision, including
for a third molar carrying a record, contrasted with the record-aware
`projectionHasPrimaryDentition` precedent nearby, and noting the canonical
record stays visible in the progress-record table. A test proves a third
molar carrying a `CARIES` finding is removed exactly like an empty one.

**Finding 3 (important) — containment guards for the two toggles that lacked
them.** `renderAngle` and `showWisdomTeeth` now have the guard the pulp and
bone/gum toggles already had.

### Important files changed

- `src/components/odontogram/measured-svg-asset.tsx` — resolver, exclusion
  constant, `onViewResolved`.
- `src/components/odontogram/measured-tooth.tsx` — `data-view` reports the
  drawn angle.
- `src/components/odontogram/measured-chart.tsx` — comments only
  (`isThirdMolar`, two prop docs). No logic change.
- `src/components/odontogram/measured-svg-asset.test.tsx`,
  `measured-chart.test.tsx` — new tests.

### Database / RLS / security

None. No migration, policy, schema, service, route or canonical projection
file was touched; `src/lib/odontogram/renderer-projection.ts` is unchanged.
No fixture, log or test carries patient-identifying data.

### Commands run and their real results

```
npx vitest run src/components/odontogram/ src/components/clinical/ \
  'src/app/(emr)/patients/'   # 61 files passed, 757 tests passed
npm run typecheck             # tsc --noEmit, exit 0
npm run lint                  # eslint, exit 0
```

TDD evidence: the three new Finding-1 tests failed first for the right
reasons — the tooth rendered `16_occl`, `data-view` read `occlusal` on a
fallen-back tooth, and `[data-layer="endo-filling"]` was absent from the DOM
entirely. Two deliberate mutations were run and reverted to prove the new
tests bite in both directions: narrowing `OCCLUSAL_ABSENT_BASELINE_LAYERS`
(dropping `tooth-healthy-pulp`) and widening it (adding `endo-filling`) each
failed 3 tests. A third mutation making the wisdom-teeth filter record-aware
failed the Finding-2 lock-in test.

### Known limitations / open items

- The previous handoff's deferred minor 2 (`data-view` reports the requested
  angle) is now closed. Minors 1, 3, 4 and 5 stand unchanged.
- The fallback is per tooth, so a chart in occlusal mode can mix occlusal and
  lateral tiles. That is the intended trade-off: showing the finding wins
  over a uniform projection, and `data-view` now says which is which.
- `resolveMeasuredToothAsset` computes `measuredForkLayers` twice for a
  posterior tooth in occlusal mode (once to test, once to render). Pure set
  work over ~30 teeth; measured as immaterial next to rendering the anatomy.
- **Out of scope, pre-existing, not fixed:** the final review reported that
  `inflammation`, `granuloma` and `fracture-vertical` are absent from
  `buildRegistry()`. That is inaccurate — `buildRegistry()` adds every
  `OTHER_CODE_LAYERS` value, and the front templates carry all three, so a
  `PERIAPICAL_LESION` / `FRACTURE` finding does render at the front angle.
  They are, however, absent from every occlusal template, which the new
  fallback handles like any other lost finding. `buildRegistry()` was not
  touched.

### Areas Codex should scrutinize

- `OCCLUSAL_ABSENT_BASELINE_LAYERS`: exactly four ids, in both directions.
  The recomputation test (`"excludes exactly the baseline artwork no occlusal
  template depicts"`) is the guard; verify it really recomputes from the
  installed templates across all four display combinations rather than
  restating the constant.
- That a tooth with no finding still renders genuine occlusal artwork
  (`data-measured-asset="16_occl"`), i.e. the fix did not neuter the feature.
- The `data-view` reporting path: no mutation of `tooth.view`, no stale
  attribute across an angle change, and no import of `measured-assets` from
  the eagerly loaded `measured-tooth.tsx` (the code-splitting boundary).
- That the Finding-2 comment matches actual behaviour and the test would fail
  if the filter were made record-aware.

### Next bounded task

None assigned. This closes the final-review fix wave for the odontogram
anatomical display toggles. Cloud TEST, hosted E2E, responsive/accessibility,
advisor and security gates remain separately authorized future work per
`CLAUDE.md` and ADR-029.
