# Vitera rename verification

Date: 2026-10-01. Version: 0.2.1. This report covers the rebrand from CalPal; earlier milestone reports retain their original build names and hashes.

## Delivered

- Vitera product name, window title, header, browser icon, Windows executable/installer, package names, active documentation and CI artifact name.
- Initial mint-green monster mascot, with a reproducible SVG source and generated Windows icons. Interactive pet behavior remains future work.
- Stable SQLite/Tauri/credential identity and Windows installer registration. Target-checked shortcut migration, removal of the previous executable after installation and new `VITERA_*` development variables with legacy aliases.
- New `.vitera` backup/recovery files, with support for the original `.calpal` format. The old format is accepted through the same native validation and transactional restore.
- Private GitHub repository renamed to `yoonalexander/Vitera`; its repository ID and visibility are unchanged. The Git remote uses the new URL. The active checkout remains in the existing CalPal folder.

## Checks

TypeScript/Vite production build, six frontend tests, 36 native tests, Prettier, Rust formatting, Clippy with warnings denied and Git whitespace checks passed. The native suite includes restoring an original CalPal backup into Vitera, comparing all restored tables and refusing an unrelated format label.

The actual installed WebView2 smoke harness verifies the Vitera document title, accessible home link and loaded mascot image. Offline restart checks passed for diary entries, food/goal snapshots, favorites, completion, metrics, recipe versions, saved meals, AI provenance and retained photos. No new live model inference or model download was needed for this rename.

The populated Milestone 6 fixture was opened by the renamed installed application using `--verify-existing --nutrition --metrics-recipes --ai --photos --photos-live --data-export`. New `.vitera` exports, legacy CalPal backup preview, malformed/unsupported imports, cancellation, keyboard focus, narrow text layout and accessibility passed. Every user-table fingerprint was identical before and after; the ordinary personal database also remained unchanged. Evidence is ignored under `artifacts/vitera-rename` and `artifacts/release-m6-upgrade-check`.

A separate isolated directory, `artifacts/vitera-rename/legacy-restore`, restored a populated original `.calpal` backup using `--data-import --nutrition --metrics-recipes --ai --photos --photos-live`. Record tables matched the source; AI was disabled after import as designed. Restoring the automatic recovery copy, reapplying the populated backup and restarting all passed.

## Installer and visuals

The final unsigned optimized x64 installer is `src-tauri/target/release/bundle/nsis/Vitera_0.2.1_x64-setup.exe`, 4,277,446 bytes. SHA-256:

```text
689FE1E40FEB4255A9A9E31141B5555D849666C80E09C7A160CFD238FB133E94
```

Silent per-user upgrade/reinstallation returned exit 0. Windows has one registration under the stable original key, displaying Vitera 0.2.1. The ordinary installation is `%LOCALAPPDATA%\CalPal\vitera.exe`; keeping the existing install directory is intentional. Start menu and desktop Vitera shortcuts point to this executable, matching old shortcuts were removed and the previous executable was removed. The renamed executable was also installed into the existing isolated release-upgrade folder and used for populated-data checks.

Actual installed screenshots were reviewed in light and dark themes, and the generated mascot icon was inspected. Existing layouts and accessibility checks passed. Interactive native file-picker review, a pristine Windows VM, missing-WebView2 installation and signing remain outside this rename verification; earlier milestone verification limits still apply.
