# Custom palette verification — 0.2.2

Verified locally on Windows x64 on 2026-10-01. Settings now includes a Color palette page with twelve editable colors, independent light/dark palettes, five presets, color pickers, hex inputs, sample and app previews, contrast guidance, cancel and per-mode reset. The editor keeps readable neutral controls even when custom colors have low contrast.

## Automated checks

- TypeScript and production Vite build passed.
- All 9 frontend domain tests and 39 native tests passed.
- Rust formatting, Clippy with warnings denied, Prettier and Git whitespace checks passed.
- Native coverage includes palette persistence and reset, rejection without changing settings, populated schema-5 migration, version-2 palette backup round trips, malformed backup rejection and version-1 CalPal backup compatibility.

## Installed desktop verification

Tests drove the real Tauri app through its WebView2 interface with isolated data directories. The final palette, optional AI settings, export, accessibility and restart run used the normal installed executable, `C:\Users\Admin\AppData\Local\CalPal\vitera.exe`. Screenshots in `artifacts/palettes/final-ui` were reviewed, including the palette page, custom light/dark diary and narrow layout.

Palette checks covered picker input/change events, hex normalization, all twelve saved colors in both modes, preview on/off, cancel and Escape, invalid values in either mode, low-contrast choices, reset cancellation, a saved light reset preserving dark colors, System appearance switching and restart persistence. The 420-pixel viewport and 200% text checks found no horizontal overflow and kept Save accessible. Native Windows color-picker popup interaction itself was not automated.

The full feature run in `artifacts/smoke-xqmi38` also passed manual diary, nutrition, measurements, recipes, optional AI, photos, export and restart checks. Its version-2 backup contained both custom palettes and a retained photo. Restoring that backup into the installed app passed full history, recovery/reapply and restart checks in `artifacts/palettes/restore-v2-checked`. All eleven tables other than AI configuration matched the backup. AI configuration was intentionally disabled and received a new credential reference. Imported retained photos were verified without deleting them; the smoke harness now handles both retained and removed attachment states.

Restoring the original version-1/schema-5 CalPal backup passed nutrition, measurements, recipes, AI snapshots, retained photos, recovery and restart checks in `artifacts/palettes/restore-v1`. No new model inference was needed for these restore checks.

An existing populated schema-5 installation fixture upgraded to schema 6 and passed history, export and restart checks in `artifacts/release-m6-upgrade-check`. Fingerprints confirmed all eleven non-settings tables were preserved. Before installing, a consistent copy of the personal database was saved locally. The installer left all twelve personal record tables unchanged; that database was still schema 5 because the normal personal app was not launched during testing. Its migration occurs on the next normal launch. Fingerprint results are in `artifacts/palettes/preserved.json`. Artifacts and databases are ignored by Git.

## Installer

- File: `src-tauri/target/release/bundle/nsis/Vitera_0.2.2_x64-setup.exe`
- Size: 4,307,387 bytes
- SHA-256: `14D9433505F39B33F800ABB37B544160202C4B6EF6AA805D4316E296A3233691`
- Install exited successfully with code 0; Windows registration reports Vitera 0.2.2 and `vitera.exe`.
- Existing installation and data identity remain compatible with CalPal. See [release guidance](RELEASE.md) for schema/backup compatibility and rollback requirements.

This is an unsigned development release tested on the existing Windows/WebView2 environment. These checks do not establish pristine-machine installation or remote CI success. Users can save low-contrast colors; warnings advise rather than restrict their choices.
