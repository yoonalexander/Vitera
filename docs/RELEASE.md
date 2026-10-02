# Vitera personal release

Version 0.2.3 is an unsigned, per-user Windows x64 release. Manual food logging, local foods, recipes, targets and measurements work without an account, subscription, AI model or cloud key. See [Qwen parsing verification](VERIFICATION-QWEN.md) for current checks, [palette release verification](VERIFICATION-PALETTES.md) for the previous release and [original release verification](VERIFICATION-M6.md) for milestone-6 limits.

## Install and upgrade

Run `Vitera_0.2.3_x64-setup.exe` and launch Vitera from its installed shortcut. Windows may show a trust warning because this personal build is unsigned. No Node.js, Rust or Ollama installation is required for manual tracking in the packaged app.

Microsoft WebView2 Runtime is required. When it is absent, the installer downloads its bootstrapper and needs internet. For an offline machine, install Microsoft's x64 Evergreen Standalone Runtime first; Microsoft documents the [offline distribution option](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution). The app itself works offline after installation. Installing on a pristine VM without WebView2 has not been tested here.

Before upgrading, save a complete backup. Close Vitera, run the newer installer into the same program folder, and launch it again. Data lives separately under `%APPDATA%\com.yoonalexander.calpal\calpal.sqlite3`; upgrading the program preserves it. Unsupported newer database schemas are refused without resetting records. Keep a copy of the older installer and your backup when trying a new release.

Version 0.2.1 renames CalPal to Vitera. The installer retains the original Windows registration and data identity, updates its display name and replaces matching old shortcuts. Install into the existing program folder; its folder name may still be CalPal. Existing local records and optional OS credentials use the same storage. Historical verification reports retain their original build names and hashes. See [rename details](BRANDING.md).

Version 0.2.2 adds **Settings → Color palette** and migrates settings to database schema 6. Existing records and appearance are preserved; default palettes are used until you customize them. Keep an older schema-5 backup before upgrading if you need to return to an earlier app build.

Version 0.2.3 adds local typed food parsing with `qwen3.5:4b` as the default for new AI settings. Existing saved model selections remain unchanged. New drafts never accept model-supplied calories or macros; unmatched rows require a local record or manual nutrition. The database remains schema 6 and complete backups remain version 2. Historical schema-1 AI provenance remains readable, but earlier app versions cannot read the new schema-2 provenance; keep a pre-upgrade backup if downgrading. See [setup commands and configuration](../README.md#local-ollama-setup).

For development, follow [repository setup](REPOSITORY.md). Build the personal-release installer with:

```powershell
npm.cmd ci
npm.cmd run tauri -- build
```

Output: `src-tauri/target/release/bundle/nsis/Vitera_0.2.3_x64-setup.exe`. Generated installers stay outside Git. CI packages the release installer as a private workflow artifact; local checks do not confirm that a remote CI run passed.

## Export and complete backups

Open **Settings → Export & backup**. **Export diary CSV** and **Export metrics CSV** save all active records, with original dates/units, unrounded values and source information. Deleted records are excluded from CSV. Unknown nutrients remain blank; known zero remains zero. Diary CSV includes macro coverage, source snapshots and AI provenance as JSON columns. Metrics include original and canonical values; canonical units are kg, cm, %, and ml for weight, measurements, body fat, and water respectively.

CSV uses UTF-8 with a byte-order mark, quoted fields and CRLF record endings. Quotes, commas and embedded newlines are escaped. Text beginning with a spreadsheet formula marker, including after whitespace, receives a leading apostrophe to prevent evaluation. CSV is for analysis and cannot restore Vitera; it does not contain photo bytes or recipe history.

**Save complete backup** creates a versioned `.vitera` JSON file. It includes appearance, all diary records including soft deletes, logged nutrient/source/AI snapshots, custom/catalog foods and favorites, target versions and estimate inputs, diary completion, all measurement records, recipe and saved-meal versions, AI save receipts, photo retention receipts and every retained JPEG. Temporary drafts, original photos, model weights and WebView2 browser caches are excluded.

Vitera also restores compatible legacy `.calpal` backups. Keep an older backup if you need to return to CalPal: old releases do not recognize the new Vitera format label.

Non-secret AI configuration travels with the backup. Secret values and credential references are excluded; Windows Credential Manager is never exported. Restore disables AI and generates a new credential reference so an imported configuration cannot reuse this installation's old authentication. If you no longer want the current optional token stored in Windows, remove it through AI settings before replacing the database. Restore does not delete old OS credentials automatically.

Keep a copy somewhere separate from this device, especially before upgrades. Backups contain personal records and are not encrypted. Removing a retained photo later does not remove its bytes from earlier backups. New version 2 backups support schema 6 and include both custom palettes; version 1/schema 5 backups remain readable. Both use limits of 64 MiB and 100,000 total rows. If export exceeds a limit, no backup file is written and records remain intact; do not treat CSV as a complete substitute.

## Restore and recovery

1. Open **Settings → Export & backup → Choose Vitera backup** and select the `.vitera` file.
2. Review its creation time and the current/incoming record counts. Recipe and saved-meal counts are version counts. Restore replaces records rather than merging them.
3. Check **I understand this replaces all current records**, then choose **Replace records from backup**.
4. Wait for **Restore complete**. The message shows the recovery-copy path. Check your diary, recipes and measurements; enable AI and set up optional authentication again only when wanted.

The native layer validates format/version, table/column types, dates, ranges, snapshots, identifiers, receipts, JPEG dimensions and database constraints before replacement. Unknown fields, duplicates, invalid records or unsupported formats are rejected without changing the current database. No SQL or database schema is taken from the file.

Before replacement, Vitera writes and flushes a complete recovery backup into `%APPDATA%\com.yoonalexander.calpal\recovery\before-restore-<id>.vitera`. If this write fails, restore stops. Backup capture uses a consistent read transaction. Record replacement holds an immediate SQLite transaction from recovery capture through commit, excluding intervening writes from other app instances; a failure rolls it back. Exports also use a flushed temporary file and atomic replacement, leaving a previous destination intact if saving fails.

To undo a completed restore, choose that recovery file through the same restore screen. Review the counts before applying it; another recovery copy is made first. Recovery files remain in the data folder until you manage them yourself, so keep independent backups too. If storage will not open, preserve the app-data folder and recovery files rather than resetting or deleting the database. Logical deletion is not secure erasure of SQLite pages or existing backups.

## Optional AI and costs

AI is off by default and is unnecessary for the core app. Follow [local AI setup](AI.md) to install models separately and review every estimate before saving. Vitera supports native loopback Ollama only; it makes no hosted inference request or paid fallback.

There is no Vitera subscription, mandatory hosting bill or per-request API fee for this local implementation. Optional inference uses your disk, CPU/GPU, RAM and electricity. Model downloads require internet and can be large; use model-specific licenses and hardware requirements when selecting them. No hosted provider or provider pricing is configured in this release. Signing, public distribution, syncing and paid services remain separate future decisions.
