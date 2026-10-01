# CalPal roadmap

Status: milestones 0 and 1 completed. Milestones 2–6 remain proposed and unimplemented.

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

- Add versioned local food data, custom foods, portions, favorites, and recent entries.
- Add optional macros and preserve unknown nutrients.
- Implement manual targets and the proposed adult resting/maintenance estimate.
- Preserve daily target history and add date navigation, diary completion, and weekly summaries.

Acceptance: independently verify known calculation examples, serving/unit conversions, partial nutrient totals, local midnight/timezone behavior, and goal changes that leave historical days unchanged. Common repeat entries meet the friction target.

## Milestone 3 — Metrics and recipes

- Add weight, body measurements, body-fat entries, and water tracking.
- Add accessible history and trend summaries with missing-day coverage.
- Implement recipes, finished yield, serving calculations, and saved meals.
- Preserve original logged values when recipes or source foods are edited.

Acceptance: verify serving and weighed-portion calculations, mixed units, multiple daily measurements, recipe-version history, and persistence after restart. Charts match stored values and show gaps honestly.

## Milestone 4 — AI descriptions

- Establish provider-neutral input/output contracts and native credential handling.
- Implement an optional local text-capable provider, capability/readiness checks, and structured draft parsing.
- Map food candidates to nutrition records, show assumptions, and support AI-only drafts where needed.
- Add review/save, cancellation, timeout, validation, and duplicate prevention.

Acceptance: correct a multi-item meal draft and save it once. Verify malformed replies, unavailable models, unknown units, missing portions, and late responses preserve edits. Evaluate actual meal descriptions separately from mocked provider tests. Manual logging still works without AI.

## Milestone 5 — AI photos

- Add photo upload/drag-and-drop and optional description context.
- Prepare resized images and strip metadata.
- Enable a benchmarked local vision model; add an explicitly configured hosted provider only if chosen.
- Present editable item portions, estimate provenance, and important assumptions.
- Implement temporary-image cleanup and optional local attachment retention.

Acceptance: exercise the full real photo-to-diary flow on known meals. Record actual errors and failures, confirm text-only models cannot accept photos, test network/model failure recovery, and verify no silent paid fallback or automatic diary writes.

## Milestone 6 — Personal release

- Implement CSV export, complete backup, and validated atomic restore.
- Polish keyboard use, text scaling, light/dark presentation, empty states, and error copy.
- Verify a release installer, app upgrade, data preservation, and offline operation.
- Document setup, optional model installation, provider costs, backup, and recovery.

Acceptance: install on a clean environment, upgrade a populated installation, restore into a fresh installation, and confirm diary totals, recipes, metrics, and attachments survive. Ensure backups exclude secrets. Record the scope of live AI and installer validation. The app is useful with no account, subscription, or cloud AI key.

## Deferred work

Barcode scanning, nutrition-label OCR, phone expansion, device sync, health-platform connections, automatic target adaptation, public hosting, app-store launch, and paywalls require separate requests and designs.
