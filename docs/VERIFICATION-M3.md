# Milestone 3 verification

Verified locally on Windows x64 on 2026-10-01. This milestone adds metrics, recipes and saved meals; it stops before AI, export/restore and personal release work.

## Delivered behavior

- Weight (kg/lb), named body measurements (cm/in), manually entered body-fat percentage and water (ml/l/US fluid ounce). Each record keeps its raw amount/unit, canonical value, explicit local diary date, UTC timestamp, timezone and optional note. Multiple daily records can be edited or deleted with revision checks.
- Today has water/weight shortcuts and a selected-day water total. Progress filters by metric/name, 7/30/90/365-day period, end date and display unit. Display conversion does not rewrite stored values.
- Daily weight/body-metric trends use the last measurement by timestamp, including when records are inserted out of order. Water adds all recorded drinks. Charts show observed daily points and connect adjacent recorded days only; missing days have no point or bridging line.
- Numerical history, first-to-last change, individual records and seven-day means with available-day coverage. Missing days stay unknown; no interpolated measurement or zero-water day is invented. The mean can use up to six preceding days outside the selected display interval, and its sample count is shown.
- Recipes contain optional instructions, food snapshot ingredients, a positive serving count and/or measured finished weight. Named food portions, mixed mass/volume units and explicit densities reuse native nutrition conversion. Unresolved ingredients and invalid yields prevent saving/logging. Raw ingredient weight never substitutes for cooked yield.
- Recipe editing appends immutable versions, with accessible history. Source-food changes do not alter stored recipe ingredients; a separate explicit “Use latest ingredient data” action adopts a changed source for a new recipe version.
- Recipe portions retain the complete original recipe/ingredient snapshots. Editing a logged portion continues to calculate against its stored version. Partially known macros retain per-ingredient coverage in recipe reviews and daily totals.
- Saved meals contain selected diary-entry snapshots, including recipes. Edits create a new saved-meal version; earlier diary copies stay independent. Logging writes every item together with stable request IDs, an explicit date and optional meal-group override. Failure rolls back all items; retrying the same request does not duplicate entries.

## Automated checks

| Check | Actual result |
| --- | --- |
| TypeScript and Vite production build | Passed |
| Prettier and Rust formatting | Passed |
| Clippy with warnings denied | Passed |
| Native domain/SQLite tests | 18 passed, 0 failed |
| Frontend date/display tests | 5 passed, 0 failed |
| Recipe example, independently specified expected values | 1,600 kcal / 4 servings → 400 kcal; 150 g of measured 800 g yield → 300 kcal; 0.15 kg also → 300 kcal |
| Recipe mixed mass units | 1 oz → 56.69904625 kcal; 1 lb → 907.18474 kcal for the same 1,600 kcal/800 g recipe; ingredient 0.8 kg matched 800 g |
| Yield/ingredient validation | Missing finished yield refused weighed logging; zero yield/ingredient amount refused; serving-only recipes remain loggable by servings |
| Recipe macro coverage | A mixed known/unknown ingredient recipe preserved partial protein/carbohydrate totals in the diary even when the entry itself contributed a known subtotal |
| Versioning and snapshots | Edits appended v2; retry did not append v3; stale changed edits refused; history and logged v1 snapshots survived database reopen |
| Saved meal transactions | Two-item copy saved once; retry left two entries; invalid second identifier rolled back the first write; later saved-meal edit left diary totals unchanged |
| Metric conversions | 200 lb → 90.718474 kg; 32 in → 81.28 cm; 0.5 l → 500 ml; 8 US fluid ounces → 236.5882365 ml; invalid/nonfinite values and incompatible units refused |
| Multiple daily records and means | Earlier measurement inserted last did not replace later daily weight; 80 kg and 82 kg on two recorded days averaged 81 kg with 2-day coverage; the missing day remained absent |
| Water sums | 0.5 l plus 8 US fluid ounces → 736.5882365 ml; missing days remained absent |
| Metric revisions/date metadata | Stale edit/delete refused; raw value/unit and UTC timestamp persisted on reopen; metadata timezone changes left the explicit diary date unchanged |
| Migration | Schema 1 → 3 and 2 → 3 preserved legacy diary data; unsupported newer schemas remain refused without deleting records |
| Frontend presentation | Canonical display conversions matched independent values; recipe ingredient coverage stayed visibly partial even with all diary entries contributing |

## Installed offline workflow

The harness ran `npm.cmd run test:installed -- --nutrition --metrics-recipes` against the actual executable installed under ignored `artifacts/install-m3`, with an isolated SQLite directory and WebView2 profile. Browser networking was disabled; persistence and arithmetic used native commands rather than mocks.

The final full workflow used `artifacts/smoke-KmWYZY`. It passed the earlier diary/nutrition/target/midnight checks and added:

- Created a synthetic 200 kcal/100 g ingredient, used 0.8 kg in a 4-serving recipe with measured 800 g finished yield, and verified 1,600 kcal whole recipe, 400 kcal serving and 300 kcal weighed portion in the actual UI.
- Saved a 650 kcal manual entry plus the 400 kcal recipe serving as a meal and copied both to another date at 1,050 kcal. Removing the manual item from the saved meal created v2 at 400 kcal without changing the earlier 1,050 kcal diary copy.
- Edited the ingredient to 300 kcal/100 g; earlier logged portions stayed unchanged. Explicitly adopted the new source in recipe v2, producing 2,400 kcal whole recipe and 600 kcal per serving. Both recipe versions were readable in history; the saved diary copy still referenced v1.
- Recorded same-day weights at 08:00 and 18:00, plus a measurement two days earlier. The chart used the later 82 kg weight; after editing the morning record to 81 kg it still used 82 kg. Chart values were asserted against 78 and 82 kg, with exactly two points and zero connecting lines across the missing day. Unit conversion displayed the independently expected pound value.
- Checked the daily table's 80 kg seven-day mean with 2/7-day coverage, individual raw records, 32 in → 81.28 cm body measurement, body-fat entry and 736.5882365 ml water sum. Added/deleted a separate water record and restored the correct total.
- Axe WCAG A/AA audits found no violations for recipe creation, portion review, version history, saved-meal creation, all four metric forms and measurement history. Existing light/dark diary and food-dialog audits also passed, along with keyboard submission, Escape and focus restoration.
- 420 px viewport with 200% text had no horizontal page overflow in measurement history. Tables have their own scrolling container. Desktop recipe/history and narrow screenshots were inspected; chart gaps and numerical records matched.
- Restart preserved measurements, water, both recipe versions, original ingredient/recipe snapshots, saved-meal versions/copies, earlier targets and appearance.

A separate run with `--verify-existing --nutrition` opened the populated Milestone 2 `artifacts/smoke-8thJA8` data directory using the Milestone 3 executable. Native migration completed and its diary, target history, favorite/custom-food versions, original nutrition snapshots, completion coverage and appearance all remained intact.

Reinstalled the Milestone 3 package over the same program directory (installer exited 0), then ran `--verify-existing --nutrition --metrics-recipes` with `artifacts/smoke-KmWYZY`. It passed the preservation assertions again. Synthetic fixtures, databases, screenshots and installers remain ignored and uncommitted.

## Installer and limits

Unsigned per-user development installer: `src-tauri/target/debug/bundle/nsis/CalPal_0.1.0_x64-setup.exe`, approximately 3.14 MiB.

SHA256: `96CE338A81D6889172E3C9776AC370475E6235FDA72444CB2CB971154A8B64F8`.

Fresh installation used an initially absent test directory on this Windows machine, with WebView2 already present. A separate clean virtual machine, missing-WebView2 path, code signing/trust prompts, clinical measurement accuracy and a full assistive-technology audit are unverified. Installer version remains development 0.1.0; export/restore, signed release and automatic updates belong to later work. Installed checks run locally; CI results must be read independently from the actual workflow.
