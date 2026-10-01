# Vitera roadmap

Renamed from CalPal on 2026-10-01. Vitera is a life tracker with a cute monster companion; milestones 0–6 establish its nutrition and body-metric foundation. See [branding](BRANDING.md). Historical completion notes retain the names used by their tested builds.

Status: milestones 0–6 completed. The personal Windows release is version 0.2.0; verification limits are recorded below.

Complete and verify one requested milestone at a time. Record actual results below the milestone when implemented; a proposed acceptance criterion is not a passed test.

## Milestone 0 — Repository and design

Completed on 2026-09-30. Created the private `yoonalexander/CalPal` repository, connected `origin`, and pushed `main` with upstream tracking. Verified private visibility through the GitHub API and matching local/remote commit IDs. Checked local document links, expected ignore rules, staged contents, and Git whitespace validation. Windows is explicitly provisional. No runtime, AI, or installer checks apply yet.

- Establish local Git on `main`, safe ignore rules, consistent text formatting, and repository documentation.
- Write the product design, proposed architecture, AI cost strategy, and implementation milestones.
- Create and connect a private GitHub repository if existing access permits.
- Resolve or explicitly record the first-platform assumption.

Acceptance: documents are linked and readable, no credentials or personal records are tracked, and remote creation/push is verified or any limitation is reported honestly. No application features or installer are built in this milestone.

## Milestone 1 — Installable offline foundation

Completed on 2026-09-30 after the owner confirmed Windows desktop. Implemented the Tauri/React shell, Today/Recipes/Progress navigation, manual calorie composer, diary edit/delete/undo, date navigation, SQLite migration and durable storage, and system/light/dark appearance settings. Generated an unsigned per-user Windows development installer.

Verification: frontend build/type checking, formatting, four native storage tests, Rust linting, clean-directory installation, installed offline diary workflow, keyboard and dialog focus, light/dark accessibility checks, narrow layout at 200% text size, application restart persistence, and preservation across installer reinstallation all passed locally. Default app-data storage was also verified. See [verification details and limits](VERIFICATION.md). Recipe creation, metric tracking, AI, food search, and target calculations remain later milestones.

- Confirm the first platform before scaffolding its app shell.
- Implement Today, Recipes, and Progress navigation with the Add food composer.
- Establish local SQLite schema, migrations, settings, and durable storage.
- Implement calorie-only quick entries and diary edit/delete/undo.
- Produce a development installer for the selected platform.

Acceptance: install, launch, log/edit/delete an entry offline, restart, and verify the record and daily total persist. Verify keyboard access and a clean install. Record any platform prerequisite or signing limitation.

## Milestone 2 — Nutrition and calorie targets

Completed on 2026-10-01. Implemented a versioned offline catalog of six attributable USDA staples, editable custom label/manual foods, measured/named portions, favorites and one-click recent entries. Added optional macros with unknown/partial coverage, manual targets and explicitly previewed adult Mifflin–St Jeor estimates, preserved target/source snapshots, diary completion and seven-day summaries.

Verification: 11 native tests and 3 frontend domain tests, TypeScript/production build, formatting and Rust linting passed. Installed offline checks verified independent estimate examples, partial nutrient totals, source edits preserving logged values, one-action repeats, target history, completion coverage, keyboard access, accessibility and restart persistence. See [Milestone 2 verification details](VERIFICATION-M2.md) for installer/reinstallation evidence, date-boundary checks and limits.

- Add versioned local food data, custom foods, portions, favorites, and recent entries.
- Add optional macros and preserve unknown nutrients.
- Implement manual targets and the proposed adult resting/maintenance estimate.
- Preserve daily target history and add date navigation, diary completion, and weekly summaries.

Acceptance: independently verify known calculation examples, serving/unit conversions, partial nutrient totals, local midnight/timezone behavior, and goal changes that leave historical days unchanged. Common repeat entries meet the friction target.

## Milestone 3 — Metrics and recipes

Completed on 2026-10-01. Added weight, named body measurements, manually entered body-fat percentage and water records with editable timestamps, units, notes and multiple daily entries. Progress now includes period/unit selection, daily values, seven-day means with sample coverage, numerical history and charts that leave gaps for missing days. Added versioned recipes with ingredient snapshots, serving/measured-yield calculations and atomic saved-meal copies. Source and recipe edits preserve earlier logged nutrition.

Verification: 18 native tests and 5 frontend domain tests passed, as did build/type checking, formatting and Rust linting. The installed offline workflow verified the independent 1,600 kcal / 4 servings / 800 g yield examples, mixed units, last daily measurement, honest chart gaps, recipe version history, saved-meal edits, accessibility, narrow/200% text layout, restart and reinstallation persistence. Opening the populated Milestone 2 database with the new executable preserved its records. See [Milestone 3 verification details](VERIFICATION-M3.md). AI and release/export work remain later milestones.

- Add weight, body measurements, body-fat entries, and water tracking.
- Add accessible history and trend summaries with missing-day coverage.
- Implement recipes, finished yield, serving calculations, and saved meals.
- Preserve original logged values when recipes or source foods are edited.

Acceptance: verify serving and weighed-portion calculations, mixed units, multiple daily measurements, recipe-version history, and persistence after restart. Charts match stored values and show gaps honestly.

## Milestone 4 — AI descriptions

Completed on 2026-10-01. Implemented provider-neutral text/draft contracts and an optional native Ollama loopback adapter, model/capability checks, Windows Credential Manager authentication, bounded structured parsing, local nutrition matching and editable AI-only estimates. The review retains assumptions and original portions, resolves exact named portions through measured records, blocks unresolved rows, and saves reviewed items atomically with persistent duplicate receipts. Cancellation, errors and late replies preserve edits; manual logging remains available without AI.

Verification: 26 native tests and 6 frontend domain tests, build/type checking, formatting and Rust linting passed. Installed fixtures verified corrected multi-item saving once, malformed replies, HTTP failures, unavailable models, unknown units, missing portions, cancellation, late responses, timeouts, accessibility and narrow text layout. Separately evaluated actual local meal descriptions and the visible real-model review/save workflow; recorded model errors as well as successful drafts. Migration, restart and reinstallation checks preserved earlier diary/nutrition/recipe/metric records and AI provenance. See [Milestone 4 verification details and model limits](VERIFICATION-M4.md) and [local AI setup](AI.md). Photos and hosted providers remain later work.

- Establish provider-neutral input/output contracts and native credential handling.
- Implement an optional local text-capable provider, capability/readiness checks, and structured draft parsing.
- Map food candidates to nutrition records, show assumptions, and support AI-only drafts where needed.
- Add review/save, cancellation, timeout, validation, and duplicate prevention.

Acceptance: correct a multi-item meal draft and save it once. Verify malformed replies, unavailable models, unknown units, missing portions, and late responses preserve edits. Evaluate actual meal descriptions separately from mocked provider tests. Manual logging still works without AI.

## Milestone 5 — AI photos

Completed on 2026-10-01. Added single-photo upload and drag-and-drop, optional meal context, bounded native decoding, orientation correction and metadata-free resized JPEG preparation. Photo observations and structured extraction can use separately configured local models; both are checked, displayed and preserved in provenance. The editable review preserves uncertainty, local-source calculations and explicit confirmation. Temporary images stay in process memory; optional retained JPEGs save atomically with entries and can be removed without changing nutrition. No hosted provider or paid fallback is configured.

Verification: 29 native tests and 6 frontend domain tests, build/type checking, formatting and Rust linting passed. Installed checks cover upload/drop, text-only capability rejection before image transfer, malformed/HTTP/model/network failures, timeout/cancellation, edit preservation, review/save once, retention off by default, cleanup, accessibility, narrow text layout, restart and attachment removal. Real weighed Nutrition5k meals were benchmarked separately and corrected through the visible photo-to-diary flow; actual model errors and unresolved portions are recorded. Schema 4 → 5 preserves earlier records and reinstallation preserves photo provenance and retained attachments. See [Milestone 5 verification and model limits](VERIFICATION-M5.md) and [local AI setup](AI.md). Milestone 6 release and recovery work is recorded below.

- Add photo upload/drag-and-drop and optional description context.
- Prepare resized images and strip metadata.
- Enable a benchmarked local vision model; add an explicitly configured hosted provider only if chosen.
- Present editable item portions, estimate provenance, and important assumptions.
- Implement temporary-image cleanup and optional local attachment retention.

Acceptance: exercise the full real photo-to-diary flow on known meals. Record actual errors and failures, confirm text-only models cannot accept photos, test network/model failure recovery, and verify no silent paid fallback or automatic diary writes.

## Milestone 6 — Personal release

Completed on 2026-10-01. Added diary/metric CSV exports, complete versioned backups, validated replacement previews, durable automatic recovery copies and atomic restores. Secrets and credential references are excluded; restored AI configuration stays off. Polished nested-dialog focus and backup text/error states, synchronized version 0.2.0 and built the optimized unsigned Windows release installer.

Verification: 35 native tests, six frontend domain tests, production build/type checking, formatting and Rust linting passed. The installed offline release verified invalid-file protection, keyboard/accessibility and large text, complete restore/recovery into fresh app data, and persistence of recipes, measurements, diary totals and retained JPEGs. Upgrading a populated 0.1.0 installation to 0.2.0 preserved all 12 table fingerprints. Setup, model downloads, costs and recovery are documented. Tests use this host with WebView2 present; pristine-VM/missing-runtime installation, signing and interactive native file-picker checks remain unverified. Computer Use window access was rejected; installed screenshots were reviewed instead. See [Milestone 6 verification and limits](VERIFICATION-M6.md) and [personal-release guide](RELEASE.md).

- Implement CSV export, complete backup, and validated atomic restore.
- Polish keyboard use, text scaling, light/dark presentation, empty states, and error copy.
- Verify a release installer, app upgrade, data preservation, and offline operation.
- Document setup, optional model installation, provider costs, backup, and recovery.

Acceptance: install on a clean environment, upgrade a populated installation, restore into a fresh installation, and confirm diary totals, recipes, metrics, and attachments survive. Ensure backups exclude secrets. Record the scope of live AI and installer validation. The app is useful with no account, subscription, or cloud AI key.

## Deferred work

Barcode scanning, nutrition-label OCR, phone expansion, device sync, health-platform connections, automatic target adaptation, public hosting, app-store launch, and paywalls require separate requests and designs.
