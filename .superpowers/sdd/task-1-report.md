# Task 1 report: vendor and pin controlled odontogram fork

## Status

Complete locally. The controlled fork is vendored at `vendor/react-advanced-odontogram`, with the reset-control patch applied before the library build. The package is pinned through a local `file:` dependency; no upstream package or moving branch is consumed.

## Commits

- Fork source patch commit: `cb9b58f3c35b49c7b9467d01c3ef84c388dae007` (`fix: remove destructive reset controls`) in `C:\Users\Latitude 7430\Desktop\React-Odontogram-Modul`.
- Dental EMR Task 1 commit: this report is included in the `build: vendor controlled odontogram fork` commit.

## Tests and verification

- RED: `npx vitest run src/components/odontogram/fork-package.test.ts --no-file-parallelism --maxWorkers=1` — failed as expected with `Cannot find package 'react-advanced-odontogram'`.
- Fork build: `npm run build:lib` — passed; emitted `dist/style.css`, `dist/odontogram.js`, declaration output, and relative loader/font chunks.
- GREEN: same Vitest command — `1 file passed; 1 test passed`.
- `npm install --package-lock-only` — passed (`up to date`, 0 vulnerabilities).
- `npm run typecheck` — passed.
- `npm run lint` — passed with four pre-existing warnings and no errors after excluding vendored third-party artifacts.
- `git diff --check` — no whitespace errors.
- License SHA-256 matches the controlled fork license: `1143189407DAB41AEB981AF61D0C2CA1729E7AD1854698D916C369A2CBD6FAF5`.

## Concerns

- The generated declaration file retains upstream reset-function documentation comments, but the built runtime contains no `btnResetAll` or `btnResetTooth` controls; the public reset APIs remain available for compatibility.
- Full Cloud TEST, E2E, responsive/accessibility, advisor, and security gates remain deferred as required by the current phase authorization.
- Existing unrelated modifications to `.superpowers/sdd/progress.md` were left untouched.

## Review follow-up

- Added a jsdom Testing Library composition regression test that mounts the vendored `OdontogramProvider`, `OdontogramChartSurface`, and `ToothControlsSurface`, then asserts both reset buttons are absent.
- `npx vitest run src/components/odontogram/fork-package.test.ts --no-file-parallelism --maxWorkers=1` — `1 file passed; 2 tests passed`.
