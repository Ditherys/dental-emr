# Phase 3 execution ledger

Task P3-00: complete (commits 02ac9bb..e8428a9, independent review clean).
Task P3-01: complete (commits e8428a9..1a52149, independent review clean).
Task P3-02: complete (commits 269861c..5bde9a8, independent review clean).

# Odontogram local completion ledger

Task DB-compat-audit-metadata: complete (forward migrations 20504/20506,
focused pgTAP 21/21 and migration privilege lint green, independent review
clean; Cloud TEST remains deferred under ADR-029).

# Sidebar and information alignment ledger

Task 1: complete (commit 1d9739e, review clean).
Task 2: complete (commit 157c7de, review clean).
Task 3: complete (commit 633699b, review approved; Minor noted: drawer order is covered by implementation wiring but not a dedicated real-component mobile-navigation test).
Task 4: complete (commit c050a66, review clean).
Task 5: complete (commit 55ee4aa, review clean).
Task 6: complete (commit 017468d, review clean; Cloud TEST browser gate intentionally deferred).
Review fixes: complete (commits df75b10, 289c45f, 1d7da4e; drawer close, keyboard coverage, long-name discoverability, and handoff evidence reviewed clean).

# Odontogram clinical-record revamp ledger

Execution is authorized by the project owner using the approved design and
proposed plan. Per AGENTS.md, work remains on `main` without a worktree; Cloud
TEST and production use remain blocked. Guarded forward-only migrations only.

Task 1: complete (commits e2655ca..62cfd77, review clean after authority-contract fixes).
Task 2: complete (commits caccea1..02f051c, review clean after projection-state fixes).
Task 3: complete (commits 5b1d755..4837764, review clean after RPC and guard-fixture fixes).
Task 4: complete (commits 5c82329..8641913, review clean; isolated committed-sequence verification passed with pre-existing baseline residual documented).
Task 5: complete (commits f4877dd..c5e7aab, review clean; focused relationship/perio behavior and guard coverage pass).
Task 6: complete (commits a583fe8..9595aea, review clean after legacy-grant, idempotency, charge, and implant-contract fixes).
Task 7: complete (commits 15c6a37..95bd5d1, independent review approved; forward-only installment replay/lifecycle repairs, dentist payment permission boundary, synthetic authorization/allocation coverage, and registered two-session concurrency probe pass locally; Cloud TEST and unrelated baseline full-run residual remain documented).
Task 8: complete (commits 95bd5d1..38f07fc, independent review approved; measured renderer parity, persisted DTO feature detail projection, allowlisted surface/front-occlusal overlays, valid ARIA grid semantics, and forward-only grant-safe local migration verified; responsive/axe, Cloud TEST, and final release gates remain pending).
Task 9: complete (commits 38f07fc..0c3a61c, independent review approved after patient-isolation and mobile-list fixes; current-status workspace, chronological progress records, patient-bound progress events, direct-treatment handoff, and responsive table/list composition verified; authorized follow-up case callback and later O8/O11/O14 gates remain pending).
Task 10: complete (commits 0c3a61c..c1f0514, independent review approved after immutable bridge/implant provenance, clinical detail, and planned-extraction repair waves; structured plan mode, exact finding resolution, server-derived dentist, pre-charge contract validation, idempotency, atomic charge/completion, and no-drawing/no-provider-selector UI verified; 28-assertion atomic pgTAP and focused unit/type/security checks pass; unrelated full-run treatment_plans completion-marker residual and Cloud TEST/release gates remain pending).
Task 11: complete (commits c1f0514..0256e4f plus c9facdc revert, independent review approved after canonical missing/implant save guards, valid ARIA grid ownership, and skip-disabled keyboard traversal repair; 11 focused UI/a11y tests, typecheck, ESLint, suite-registration checks, and the new periodontal pgTAP suite pass; the full local runner still stops at the pre-existing treatment_plans completion-marker residual, while Cloud TEST/axe/hosted release gates remain pending).
Task 12: complete (commits b76bc18..8ddf616, independent review approved after server-only, storage-attested derivative completion and removal of the unsafe exported wrapper; clinical-photo pgTAP 23/23, media unit 17/17, full unit 1,536/1,536, typecheck, build, migration/security checks, and local forward migration verification pass. A processing claim lease/token remains a pre-production hardening item; Cloud TEST, hosted E2E/axe, advisor/security, and release gates remain pending).
Task 13: complete locally (commits 0e010e1, d18f90a, plus archive-processing hardening; independent review finding fixed with guarded migration 20260830010623 and immutable archived-row trigger; clinical-photo pgTAP 33/33, focused gallery/action/workspace 32 tests, full unit 1,562/1,562, typecheck, build, migration/security checks, and local forward migration verification pass. Cloud TEST, hosted E2E/axe, advisor/security, and final release gates remain pending; the pre-existing treatment_plans completion-marker residual remains documented).
