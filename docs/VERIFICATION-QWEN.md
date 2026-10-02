# Local Qwen food parsing — 0.2.3

Verified on Windows on 2026-10-02. This change extends the existing Tauri/Rust Ollama adapter and editable draft workflow; React still calls native commands and SQLite still owns nutrition and diary storage.

## Architecture

`describe_meal` → existing readiness/cancellation/deadline → `FoodParsingService::parse_food_entry` → interchangeable `FoodParsingProvider` → Ollama `/api/chat` → validated typed foods → existing local nutrition matching/portion calculation → editable review → transactional diary save.

The schema contains foods, amounts, units, preparation, brands/restaurants, modifiers, assumptions, questions and global notes. It excludes calories and macros. The Ollama request constrains `foodId` to null and sends no nutrition catalog; native matching follows extraction. Unmatched rows have unknown nutrients until the user chooses a source or enters manual nutrition. Descriptive manual units do not imply a measured weight. Preparation/brand/restaurant mismatches and unspecified milk fat/rice variety do not silently select incompatible catalog records. The database stays schema 6; new provenance is schema 2, with historical schema-1 records still supported.

`.env.example` supplies native development defaults. Saved settings override initialization defaults. Only localhost/127.0.0.1 HTTP URLs are permitted, with proxies and redirects disabled. No application CLI spawning, model download, hosted call or paid fallback was added. The default deadline remains 90 seconds and is adjustable to 180 seconds; readiness is limited to eight seconds. Existing error/cancellation behavior preserves drafts and manual logging.

## Setup and use

The exact install, `ollama pull`, interactive `ollama run`, optional `ollama serve`, API health check, environment variables and Windows `curl.exe` instructions are in [README](../README.md#local-ollama-setup). Development starts with `npm.cmd run tauri -- dev`; the packaged app requires neither Node nor Rust.

On this device, Ollama was already installed but stopped. Setup started its local service, explicitly downloaded `qwen3.5:4b` (3,389,983,735 bytes), and updated Ollama from 0.31.1 to 0.35.0. The official installer checksum and Authenticode signature were verified. The older version ignored JSON-schema constraints with thinking disabled; Vitera rejected all those malformed replies without a diary write. [Ollama 0.31.2 documents the fix](https://github.com/ollama/ollama/releases/tag/v0.31.2). Qwen's local completion and vision capabilities were checked through API metadata.

The installed model setting was changed to `qwen3.5:4b`; the owner's existing AI-off preference was preserved. To use it, open **Settings → AI settings**, turn **Local AI** on, **Check models and readiness**, then **Save AI settings**. In **＋ Add food → Describe**, enter `I had 100 g raw banana and 100 g hard-boiled whole egg`. Review both records and 100 g amounts, confirm both rows, and save. The existing USDA records give 89 + 155 = 244 kcal. AI can be turned off again without affecting manual tracking.

## Checks and limits

- Frontend build/type check, Prettier, Rustfmt and `git diff --check` passed.
- `npm.cmd test`: 10 frontend/domain tests passed, including unknown nutrient save blocking, metadata retention and descriptive manual counts.
- `npm.cmd run test:native`: 46 tests passed. New mocked parsing tests cover all six requested descriptions, preserved metadata/quantities, strict invalid output rejection, configuration defaults, historical provenance and safe local nutrition matching. Existing tests cover HTTP errors/refused connections, response limits, unavailable/remote models, cancellation/timeouts, native calculations, migrations, atomic saves, backups and recovery.
- Normal tests do not require a running Ollama or download models. Real inference is opt-in via `npm.cmd run test:installed -- --ai-live` after building.
- Real Qwen testing through the actual native app produced 10/10 typed drafts. All six requested examples passed explicit item-count, quantity, unit, supplied preparation, restaurant and size-modifier checks. Every model nutrient field remained null. A separately visible reviewed banana/egg meal saved at 244 kcal and its schema-2 extraction metadata survived app restart.
- Initial prompt iterations exposed invented/duplicated ingredients, inappropriate catalog names, lost quantities and per-slice arithmetic errors. The final prompt removes catalog grounding and uses small synthetic extraction examples. Passing these six examples does not establish general parsing accuracy; review remains required.
- The additional whole-milk control preserved measured quantities but omitted the milk type, leaving that row unresolved under conservative matching. Counts without measured portions and unknown sandwich ingredients remained unresolved. Zero known kcal in a partial draft means unknown nutrition, not a zero-calorie meal.
- The real Qwen photo path was not benchmarked. Native mocked photo upload/preparation/review/save/retention checks were run; historical Gemma photo results remain separate in [milestone-5 verification](VERIFICATION-M5.md).
- Local Clippy could not run: Windows Application Control blocked `cargo-clippy` with error 4551. This report does not claim local Clippy or remote CI passed.

Development live evidence is in ignored `artifacts/qwen-setup/live-acceptance/`: `live-ai-evaluation.json`, `results.json`, `ai-live-review.png` and accessibility checks. The 10-case run measured approximately 14.9 seconds for the first request and 2.1–3.3 seconds for subsequent cases on this device. These are observed timings, not speed guarantees.

## Windows release and data preservation

Release installer: `src-tauri/target/release/bundle/nsis/Vitera_0.2.3_x64-setup.exe`. The per-user install path remains `%LOCALAPPDATA%\CalPal\vitera.exe`, preserving the existing program registration and `%APPDATA%\com.yoonalexander.calpal` data identity.

Before upgrading, a consistent SQLite backup of the personal database was created under ignored artifacts and passed integrity checking. All existing personal rows and settings were preserved: the normal schema-6 palette field and current-day diary record were initialized when the updated app opened. Tests use separate data directories and synthetic meals.

The final installer built successfully and installed with exit code 0. Installed code/assets match the release executable apart from the expected Tauri NSIS bundle marker. Installer SHA256: `45C5CE1FE88E372CBA15AB5B71CB43CD3B9C3C62488B9134E4FDFEACA2636CAC` (4,312,007 bytes).

The final installed executable passed the combined offline diary/nutrition/metrics/recipe/AI/photo/palette/live-Qwen/export/restart workflow in `artifacts/qwen-setup/final-installed-acceptance`. All six requested descriptions passed the semantic checks again; the 10-case run took approximately 14.1 seconds for its first request and 2.1–3.4 seconds for later cases. Accessibility checks passed with no reported violations in the tested screens, including narrow/200% text layouts. These checks exercise the actual WebView2/native storage, rather than browser storage or calculation mocks.

The complete populated backup from that final run restored successfully into a fresh isolated installation in `artifacts/qwen-setup/restore-schema2`. Every data table matched; recovery-copy restoration, disabled imported AI, schema-2 Qwen metadata, nutrition snapshots, recipes, metrics, palettes and photo retention state passed checks across restart.

The unchanged previous-release backup also restored successfully in `artifacts/qwen-setup/restore-legacy-acceptance`, preserving its original rows/settings and palettes across recovery and restart. The test harness now selects the backup's recorded diary date and permits only the independently checked normal current-day target snapshot when opening an older backup; it no longer assumes that every backup was created today.

## Changed files

- `.env.example`
- `README.md`
- `ai/food-parsing-schema.json`
- `ai/parsing-fixtures.json`
- `docs/AI.md`
- `docs/DESIGN.md`
- `docs/RELEASE.md`
- `docs/REPOSITORY.md`
- `docs/VERIFICATION-QWEN.md`
- `package.json`
- `package-lock.json`
- `scripts/ai-smoke.mjs`
- `scripts/data-smoke.mjs`
- `scripts/domain.test.mjs`
- `scripts/installed-smoke.mjs`
- `scripts/photo-smoke.mjs`
- `scripts/tauri.mjs`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/ai.rs`
- `src-tauri/src/db.rs`
- `src-tauri/src/food_parser.rs`
- `src-tauri/src/main.rs`
- `src/AIUI.tsx`
- `src/App.tsx`
- `src/ai.ts`

No dependencies were added. Generated installers, downloaded models, test databases, private backups, images and inference replies are excluded from Git.
