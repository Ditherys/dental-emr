# Controlled odontogram fork artifact record

- Source repository: `https://github.com/Ditherys/React-Odontogram-Modul`
- Source path: `C:\Users\Latitude 7430\Desktop\React-Odontogram-Modul`
- Fork source commit: `5e28d931feefe4c3382513dbb0f5a9db9cf9948c`
- Initial patch commit: `cb9b58f3c35b49c7b9467d01c3ef84c388dae007`
- Touch reset patch commit: `b6a99ddaf2dfb2659c747501494d7e34387ff040`
- Build date: `2026-08-30` (Asia/Manila)
- Build command: `npm run build:lib`
- Patches: `fork-patches/remove-reset-controls.patch`, `fork-patches/remove-touch-reset-controls.patch`

Artifacts copied from `dist/`:

- `index.d.ts`
- `loader-BN_gLe6T.js`
- `loader-BN_gLe6T.js.map`
- `notoArabic-En58EmGw.js`
- `notoArabic-En58EmGw.js.map`
- `notoSC-G1i3iX-D.js`
- `notoSC-G1i3iX-D.js.map`
- `odontogram.js`
- `odontogram.js.map`
- `roboto-Bywi16HJ.js`
- `roboto-Bywi16HJ.js.map`
- `style.css`

The application imports `emr-style.css`, generated from the pinned `style.css`
with `npm run odontogram:scope-css`. The generated entrypoint prefixes the
fork's demo selectors with `.dental-emr-fork` so generic rules such as
`.hidden`, `body`, and `select` cannot alter the surrounding EMR shell.
