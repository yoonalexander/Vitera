# Milestone 2 verification

Verified locally on Windows x64 on 2026-10-01. Milestone 2 stops at offline nutrition and calorie targets; no recipes, body metrics, AI or export/restore was added.

## Delivered behavior

- Six immutable, attributed USDA SR Legacy foods with known gram-weight portions, plus editable custom label/manual foods, optional density and named portions. [Catalog provenance and reproduction](../catalog/README.md).
- Local search, favorites, and up to eight distinct recent entries. A recent entry logs its saved portion and meal to the selected diary date in **one action from Today**, meeting the at-most-three-action target. Favorites log one first listed portion (or nutrition basis) to Lunch with that behavior labeled.
- Optional protein/carbohydrate/fat. Unknown values remain absent; totals sum known values and show per-nutrient coverage, including known zero versus unknown. Source energy is preserved. Custom foods with absent energy derive an explicitly labeled 4/4/9 approximation only when every macro is known.
- Native calculation of g/kg/oz/lb, ml/l/US fluid ounce, food-specific named portions and servings. Mass/volume conversion requires explicit food-specific density. Full precision is stored; only presentation is rounded.
- Manual calorie targets without demographics, or adult Mifflin–St Jeor resting/maintenance/adjusted estimates. The equation variant starts unselected, activity assumptions are described and editable, and adjustment defaults to zero. Inputs must be previewed and explicitly applied; edited inputs invalidate the preview. [Original equation source](https://pubmed.ncbi.nlm.nih.gov/2305711/).
- Dated goal versions with input history and daily target snapshots. Accepted goal changes apply today or later, through the next scheduled goal. Past dates, including days without a target, remain unchanged.
- Day completion and seven-day numerical summaries in Progress. Complete days alone enter the average; intentionally complete empty days contribute zero. Partial/missing days are excluded and coverage is shown. Entry changes reopen affected days; an idempotent duplicate save does not.
- Explicit local diary dates, UTC record timestamps and separately saved timezone metadata. Prior records and open drafts retain their selected dates across midnight/timezone changes.

## Automated checks

| Check | Actual result |
| --- | --- |
| TypeScript and Vite production build | Passed |
| Prettier, Rust formatting, Clippy with warnings denied | Passed |
| Native SQLite/domain suite | 11 tests passed, 0 failed |
| Frontend date/presentation suite | 3 tests passed, 0 failed |
| Native schema 1 → 2 migration | Preserved legacy calorie entry and timestamps; added nutrients remain unknown; repeated open did not duplicate catalog |
| Independent male equation example | 80 kg, 180 cm, age 30, +5 → 1,780 resting; ×1.55 → 2,759 maintenance; −300 → 2,459 target |
| Independent female equation example | 60 kg, 165 cm, age 40, −161 → 1,270.25 resting; ×1.2 → 1,524.3 maintenance |
| Conversion examples | 150 g and 0.15 kg at 200 kcal/100 g → 300 kcal; 1 oz → 56.69904625; 1 lb → 907.18474; 2.5 × 30 g scoop → 150 kcal |
| Density and volume | 250 ml at 1.04 g/ml and 200 kcal/100 g → 520 kcal; ml/l/US fluid ounce and reverse density conversion passed; missing density, unknown units, missing portions and zero quantities rejected |
| Partial nutrition and derived energy | Missing macros stayed unknown; known zero remained zero; 10 g protein + 20 g carbohydrate + 5 g fat → 165 derived kcal; stated 123 kcal took priority |
| Goal history and scheduling | Past snapshots unchanged, future interval boundaries respected, historical unviewed days resolved from dated versions |
| Timezone/midnight/DST | Toronto 03:59:59Z/04:00:00Z mapped to adjacent local dates; Tokyo boundary, DST navigation, leap day and year boundary passed; stored timezone changes did not move prior entries |
| Revision/idempotency/completion | Duplicate saves, stale edits, delete/undo, moved-entry completion reset for both dates and retry preservation passed |
| Source version persistence | Food edit advanced version; stale edits rejected; prior nutrition and favorite state survived database reopen |
| Weekly arithmetic | 600 kcal complete day plus complete empty day averaged 300 kcal; 900 kcal partial day excluded; zero complete days produced no average |

The two equation examples were worked out independently against the published formula and asserted as fixed expected numbers. The activity values and adjustment are app assumptions, not results from the original study. No measurement of an individual's expenditure or clinical validation is claimed.

## Installed offline workflow

`npm.cmd run test:installed -- --nutrition` launched the actual installed executable in `artifacts/install-m2`, using an isolated SQLite directory and WebView2 profile. Browser networking was disabled; storage and calculations used real Tauri/Rust commands.

The successful final workflow used ignored `artifacts/smoke-8thJA8`. It verified:

- Existing offline add/edit/delete/undo, keyboard Enter submission, separate dates and navigation.
- Manual 2,000 kcal target followed by the independently expected 2,459 kcal adult estimate, with the previous day still having no target.
- A custom 200 kcal/100 g food, 150 g named bowl and 1.25 bowls produced 375 kcal and 18.75 g protein, with carbohydrate unknown and fat known zero. With the original calorie-only entry, protein displayed partial coverage.
- Editing the custom food to 300 kcal/100 g left the original logged portion at 375 kcal. One-click recent repeated 375 kcal; a favorite used the new version and produced 450 kcal.
- 1,850 kcal on a complete day plus a complete empty previous day produced a 925 kcal average with 2/7 complete and 1/7 logged coverage.
- A retained original v1 portion on the previous day survived restart at 375 kcal after its source became v2. Goals, favorites, the custom food, completion and weekly coverage persisted. The remaining current-day foundation entry stayed 650 kcal.
- Simulated local midnight in the running WebView advanced Today to the next date while an already-open food draft retained its original explicit date. Returning the test clock to real time restored Today without moving stored records.
- Axe WCAG A/AA checks found no violations for the estimate form, custom-food form, portion review, weekly summary, food dialog, and diary in light/dark themes. Escape and opener focus restoration passed. The test caught and fixed a food-name autofocus regression from the search control.
- Narrow 420 px layout with 200% text had no horizontal page overflow. Desktop diary, numerical summary and narrow screenshots were inspected.

The installed harness is reproducible and keeps all synthetic health inputs, screenshots and local databases out of Git. CI adds frontend domain tests to the existing formatting/build/native-test/lint/installer checks; local installed checks are separate from CI status.

## Installer and limits

Unsigned per-user development installer: `src-tauri/target/debug/bundle/nsis/CalPal_0.1.0_x64-setup.exe`, approximately 3.05 MiB.

SHA256: `D1D030811A7386F87F19565285A96985FA42C79C94D5D3E00E08F2BE1604C0B5`.

Fresh installation into the initially absent `artifacts/install-m2` directory exited 0 and launched successfully. WebView2 was already present. Reinstallation checks use the same isolated app/data directories and final package; schema 1 → 2 migration is tested independently against a populated foundation database.

Reinstalled the final package into the same program directory (installer exited 0), then ran `npm.cmd run test:installed -- --verify-existing --nutrition` with `artifacts/smoke-8thJA8`. It passed, preserving the 650 kcal current-day entry, 375 kcal original v1 portion on the complete previous day, 2,459 kcal current target, no past target, favorite/custom-food state and dark appearance.

A separate clean virtual machine, missing-WebView2 installation, code signing/trust prompts, clinical accuracy, comprehensive food coverage and a full assistive-technology audit remain unverified. The installer retains development version 0.1.0; this is no claim of a signed release or automatic update support.
