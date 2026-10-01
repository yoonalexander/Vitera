# Milestone 6 verification

Implemented and verified locally on 2026-10-01. Personal-release version: 0.2.0. Database schema remains 5; portable backup format is version 1. See [release setup and recovery](RELEASE.md) for operation and limits.

## Delivered behavior

Settings now offers separate diary/metrics CSV exports and a complete `.calpal` backup. Restore validates the entire file, previews current/incoming counts, requires explicit replacement confirmation, writes a durable recovery copy first and replaces known table contents in one immediate SQLite transaction, holding the writer lock from recovery capture through replacement. Backups use a consistent read transaction, including when another CalPal process is writing. It preserves records, source/target snapshots, soft deletes, recipe/saved-meal history, measurement units, AI receipts/provenance and retained JPEG bytes. AI configuration is disabled after restore and assigned a fresh credential reference. No OS credential value or reference is exported.

The shared dialog remembers its previous focus when suspended for another settings panel. Backup preview receives focus after its committed render, avoiding a timing-dependent focus failure found in installed testing. Light/dark styles, file-path wrapping, large text, empty export behavior and actionable storage errors use the existing interface. Installer and package versions are synchronized; CI now builds the optimized release bundle.

## Deterministic checks

- TypeScript checking and Vite production build passed.
- Six frontend domain tests passed.
- 35 native tests passed, including six new backup/export cases: roundtrip/recovery and credential exclusion; invalid/incompatible/duplicate records and failed recovery writes; rollback of every table after a simulated insertion failure; atomic destination replacement and temporary-file cleanup; CSV quoting, Unicode, blank unknown nutrients and formula protection; and coherent backup snapshots during concurrent commits from a second SQLite connection.
- Rust formatting, Clippy with warnings denied, Prettier and Git whitespace validation passed.
- Local document links and ignore rules were checked before committing. Generated installers, records, CSVs, `.calpal` backups, photos and test outputs remain untracked.

The credential test places a synthetic marker in Windows Credential Manager under an isolated generated reference, checks backup/CSV exclusion, then deletes that marker. It never reads a personal credential.

## Installed export, restore and offline evidence

The actual installed Tauri/WebView2 release executable was exercised with native SQLite storage and browser networking offline. Export commands write real files into a process-configured isolated test folder; web content cannot choose a path or enable this override. Normal launches use the Windows save dialog.

The populated Milestone 5 installation exports 16 diary records, eight foods, two goal versions, 18 diary days, eight measurement records, two recipe versions, two saved-meal versions, six AI receipts, five photo receipts and one retained JPEG, plus appearance and non-secret AI configuration. CSV headers/encoding and diary values were checked. Valid backups show counts and keep replacement disabled until confirmed. Truncated JSON, a future version, an unknown secret-like field, duplicate rows, negative calories and invalid JPEG bytes are rejected; subsequent export confirms every table stayed unchanged. Closing a preview with Escape performs no restore and returns focus to the initiating Settings button.

An installation with fresh app data and a fresh WebView2 profile starts empty and works offline without AI. After logging one synthetic entry to test replacement, the populated backup was restored through keyboard confirmation. All 11 data-table exports matched the source exactly; the remaining AI-config table differs intentionally because AI is disabled. The recovery copy contained the prior installation's entry, was restored successfully through the same UI, and the populated backup was then restored again. Restart checks verified diary totals, targets, source snapshots, recipes, saved meals, measurements, provenance and the retained photo. Evidence is under ignored `artifacts/release-m6-restore`, `artifacts/release-m6-final-restore` and the final immediate-transaction run in `artifacts/release-m6-atomic-restore`.

Light/dark backup panels, the preview and error states passed automated WCAG A/AA accessibility checks. The 420 px viewport at 200% text size has no horizontal overflow; the replacement confirmation remains reachable by scrolling. Actual installed light/dark diary and backup screenshots were inspected visually. Existing diary, recipe, metric and AI fixture workflows were also exercised on the final release build. Evidence is under `artifacts/release-m6-final` and `artifacts/release-m6-upgrade-check`.

## Installer and populated upgrade

The optimized unsigned x64 installer is `src-tauri/target/release/bundle/nsis/CalPal_0.2.0_x64-setup.exe`, 4,274,305 bytes, SHA-256:

```text
092F8DC01452D2B9B5AFFCCAEDC617D037DEA363176D40B0327422463A593ADA
```

The Milestone 5 / 0.1.0 installer was installed into an isolated program folder and its populated synthetic data was exercised with the old executable. With that database already present, the 0.2.0 installer upgraded the same program folder; both installers returned exit code 0. The new executable passed all prior persistence checks. Before/after SHA-256 fingerprints matched for all 12 complete tables, including the retained JPEG blob. The schema stayed at 5. The original Milestone 5 test data was preserved separately.

The final release was also installed into a fresh program folder and exercised with a fresh app-data/browser profile. Final-installer reinstallation checks preserve all 12 table fingerprints, including the newly generated credential reference and retained JPEG. Install directories and data directories are separate in every test; the personal diary was not used.

## Scope and remaining verification limits

This is a personal Windows release tested on the current Windows 11 host with WebView2 already installed. Fresh-directory/profile tests are not a pristine VM test. Installation without WebView2, another computer, certificate signing, SmartScreen reputation and public distribution have not been validated. The runtime bootstrapper needs internet if WebView2 is missing; [Microsoft's standalone runtime](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution) supports a separately prepared offline installation.

Computer Use initialization succeeded, but automatic approval review rejected access to the CalPal window with “Computer Use was not approved to use calpal.” Native interactive visual/file-picker review therefore did not proceed. A separate UIAutomation test helper was also refused by the machine's script policy and was removed. No policy was bypassed or changed. Windows save-dialog code compiles against native COM APIs, and the export command/file writing is tested with the isolated destination override; actual interactive save/cancel/overwrite dialogs remain unverified. Screenshot-based visual review and installed keyboard/accessibility checks are separate completed evidence.

No new model or hosted service was installed/configured for this milestone. Controlled AI/photo fixtures were run on the release executable; actual model evaluation remains the separately recorded [Milestone 4 description evaluation](VERIFICATION-M4.md) and [Milestone 5 Nutrition5k photo evaluation](VERIFICATION-M5.md). This milestone verifies those saved real-model records and attachments survive upgrade/restore rather than claiming a new accuracy benchmark. Unresolved portions, incorrect food matches and model failures from those evaluations remain documented. No automatic or paid fallback exists.

Local success does not establish the result of a remote CI run. Backups/local SQLite are not encrypted, and attachment deletion is not secure erasure. Backup size/row bounds are documented; a file exceeding them is refused without modifying existing records.
