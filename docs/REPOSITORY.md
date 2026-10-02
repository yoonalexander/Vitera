# Repository setup

## Scope and state

Milestones 1–6 implement the Windows offline diary, nutrition, calorie targets, metrics, recipes and optional local AI descriptions/photos, CSV exports and complete backup/restore. The runtime, food catalog and lockfiles are included; generated installers, test records, model outputs and screenshots remain local and ignored. No paid services or shared AI credentials are configured.

The owner confirmed Windows desktop. The stack is Tauri 2, React, TypeScript, Vite, and SQLite bundled through rusqlite. Exact resolved dependencies are in `package-lock.json` and `src-tauri/Cargo.lock`.

The product is now Vitera. The database, Tauri identifier and Windows registration retain their original internal identity for upgrades. Use `VITERA_*` development overrides; `CALPAL_*` remains supported as a fallback. See [rename compatibility](BRANDING.md) before changing identifiers or the pinned NSIS template.

## Git conventions

- Default branch: `main`.
- Connected origin: `https://github.com/yoonalexander/Vitera.git`.
- Verified visibility: private, appropriate for the initial personal project.
- Use focused commits. Do not rewrite or discard intentional local work.
- Commit code, documentation, and reproducible dependency locks; exclude generated output and personal records.

Check the live connection with:

```powershell
git status --short --branch
git remote -v
git log -1 --oneline
```

GitHub creation and the initial push were verified on 2026-09-30. Local `main` tracks `origin/main`; the initial local commit matched the remote branch. Recheck live state with Git when continuing work.

## Application layout

Current implementation:

```text
src/
  App.tsx         # diary, repeats, settings, navigation
  NutritionUI.tsx # food/custom-food forms, targets, weekly summaries
  MetricsUI.tsx   # measurements, water, accessible trends and history
  RecipesUI.tsx   # recipe versions/portions and reusable meals
  AIUI.tsx        # local AI setup, cancellation and editable item review
  DataUI.tsx      # CSV export, backup preview and replacement/recovery
  PhotoUI.tsx     # retained local photo viewing/removal
  ai.ts           # typed text/photo interface and review validation
  Modal.tsx       # shared keyboard-accessible native dialog
  storage.ts      # typed native command interface and date/display helpers
  styles.css      # responsive light/dark interface
src-tauri/
  src/            # native commands, SQLite, nutrition/metric/recipe domains and tests
  migrations/     # ordered SQLite schema migrations
scripts/          # build launcher and installed-app smoke checks
catalog/          # immutable, attributed offline food-data versions
ai/               # versioned provider-neutral structured draft schema
.github/workflows/ # Windows build/test and installer artifact workflow
docs/             # product design, roadmap, setup notes
```

Food catalogs and test fixtures must carry provenance and use synthetic or permitted sample records. Store application data in the platform app-data directory, separate from the source checkout.

Food extraction uses `src-tauri/src/food_parser.rs` for the typed provider/service contract, and the existing `ai.rs` Ollama adapter and draft pipeline. `ai/food-parsing-schema.json` is the active schema; the older description schema documents historical version-1 drafts. Normal native tests mock the provider and loopback transport and cover the six examples in `ai/parsing-fixtures.json`, invalid output, unavailable models, HTTP errors, cancellation and timeouts. `--ai-live` explicitly opts into real inference for those examples and measured/ambiguous controls, verifies that the model supplies no nutrients, saves a reviewed 244 kcal meal and checks metadata after restart.

The Node launcher loads optional `.env` configuration only into its child process. `OLLAMA_BASE_URL=http://localhost:11434` and `OLLAMA_MODEL=qwen3.5:4b` initialize new AI settings; saved settings win thereafter. See [.env.example](../.env.example) and [README setup](../README.md#local-ollama-setup). Ollama 0.31.2 or newer is required for reliable Qwen schema enforcement with thinking disabled.

## Development and verification

Before implementation, read [DESIGN.md](DESIGN.md) and the requested milestone in [ROADMAP.md](ROADMAP.md). Keep product defaults free, offline-capable, and independent of AI setup.

Use Node.js 24, Rust stable with the MSVC toolchain, Windows C++ build tools, and WebView2. See the [official prerequisites guide](https://v2.tauri.app/start/prerequisites/). The Node build launcher adds the usual per-user Rust directory to its child process PATH without changing global settings.

```powershell
npm.cmd ci
npm.cmd run tauri -- dev
npm.cmd run format:check
npm.cmd run build
npm.cmd test
npm.cmd run test:native
& "$env:USERPROFILE\.cargo\bin\cargo.exe" fmt --manifest-path src-tauri/Cargo.toml -- --check
& "$env:USERPROFILE\.cargo\bin\cargo.exe" clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npm.cmd run tauri -- build
```

Install Rust formatting/lint components once with `rustup component add rustfmt clippy` if needed. The installer is generated at `src-tauri/target/release/bundle/nsis/Vitera_0.2.3_x64-setup.exe`. It is an optimized personal-release build, unsigned, and installs per user. WebView2 is required; the installer downloads its bootstrapper if it is absent. The application itself needs no network connection.

Ordinary app data resides under `%APPDATA%\com.yoonalexander.calpal\calpal.sqlite3`, separate from the install directory. Migrations run transactionally; unsupported newer schemas are refused without resetting records. Deletes are soft deletes, with Undo for the most recent deletion. See [release, backup and recovery](RELEASE.md) for complete export/restore.

### Installed-app checks

Install into a fresh test directory and set the executable path, then run:

```powershell
$env:VITERA_EXE = 'C:\path\to\test-install\vitera.exe'
npm.cmd run test:installed
```

Add `-- --nutrition` to run the Milestone 2 installed workflow, including source snapshots, target history, completion, and simulated local midnight with an open draft. Reinstallation verification for its successful isolated directory uses `npm.cmd run test:installed -- --verify-existing --nutrition`. These checks require the actual built/installed Windows executable, not a browser mock.

For the complete Milestone 1–3 workflow, run `npm.cmd run test:installed -- --nutrition --metrics-recipes`. This checks actual recipe serving/weighed portions, ingredient and recipe version history, saved-meal copies, measurement units, multiple daily records, chart gaps and rolling-mean coverage. Reinstallation checks on its populated smoke directory use `-- --verify-existing --nutrition --metrics-recipes`. Migrations support the earlier schema versions without resetting records.

Add `--ai` to include the installed Milestone 4 fixture workflow. It serves synthetic Ollama replies on an ephemeral loopback port and calls the actual native adapter, review UI and SQLite storage; it does not substitute browser calculation/storage mocks. Add `--ai-live` to separately evaluate a running real local Ollama model and its visible review/save flow. `VITERA_OLLAMA_MODEL` selects the installed model (default `qwen3.5:4b`); the live run never pulls a model. Example: `npm.cmd run test:installed -- --nutrition --metrics-recipes --ai --ai-live`. The live evaluation writes raw synthetic-meal results into ignored artifacts; valid drafts and measured errors are reported separately.

Reinstallation checks use `-- --verify-existing --nutrition --metrics-recipes --ai`. For a deliberate additional real-model text comparison on that isolated directory, also add `--ai-live --evaluate-live`; only its specifically named synthetic live-review entries are replaced. See [AI setup](AI.md) and [Milestone 4 verification](VERIFICATION-M4.md).

Add `--photos` for the native photo fixture workflow: upload/drop, metadata-free preparation, completion-only capability rejection, model/HTTP failures, cancellation, review, optional retention, restart and removal. For separately measured real local vision inference, explicitly download the three public, attributed [Nutrition5k](https://github.com/google-research-datasets/Nutrition5k) fixtures and run:

```powershell
node scripts/fetch-photo-benchmark.mjs
npm.cmd run test:installed -- --nutrition --metrics-recipes --ai --photos --photos-live
```

The downloader is a developer script, never invoked by the application. It saves dataset photos and reference portions/calories under ignored `artifacts/photo-benchmark`. The live test defaults to the already installed `gemma3:4b` for vision and `gemma4:e4b-it-q8_0` for structured drafts; `VITERA_VISION_MODEL` and `VITERA_DRAFT_MODEL` select other installed models. It records uncorrected drafts and actual errors separately from manually corrected diary saves. It never downloads an AI model. Reinstall checks on a successful full smoke directory use `-- --verify-existing --nutrition --metrics-recipes --ai --photos --photos-live`; this validates stored values and retained images without repeating inference. Additional live photo runs should use a fresh smoke directory to avoid adding repeated evaluation entries.

Milestone 6 checks add `--data-export` to an existing populated smoke directory to verify CSV/backup files, invalid imports, preview cancellation and accessibility. The child process alone receives `VITERA_EXPORT_DIR` alongside its isolated `VITERA_DATA_DIR`; production launches use the Windows save dialog. For restore, set `VITERA_IMPORT_BACKUP` to a previously exported populated `.vitera` file and run a fresh smoke directory with `--data-import --nutrition --metrics-recipes --ai --photos --photos-live`. That mode initializes a synthetic replacement record, restores/re-recovers the backup, compares all data tables and checks existing records after restart; it does not rerun model inference. See [Milestone 6 results and limits](VERIFICATION-M6.md).

The native schema is version 6, adding custom palette settings to the photo retention receipts and JPEG attachments introduced in version 5. Originals and prepared temporary images are never written to a file; retained attachments are transactional SQLite blobs. See [Milestone 5 verification](VERIFICATION-M5.md) for source references, inference limitations and installer evidence.

The harness launches the actual executable, attaches Playwright to its WebView2 instance, simulates offline operation, and uses the real native SQLite commands. It creates isolated synthetic records, a separate WebView2 profile, screenshots, and results under ignored `artifacts/smoke-*`. It verifies add/edit/delete/undo, date separation, keyboard form submission, dialog focus, navigation, appearance persistence, accessibility in both themes, narrow/200% text layout, and restart persistence. Its temporary remote-debugging port is enabled only in the test child process; normal app launch does not enable it.

Add `--palette` on a fresh smoke directory to check custom light/dark colors, presets, hex/picker events, temporary preview, low-contrast guidance, invalid colors, cancel/reset, system appearance changes, narrow/200% text layout and persistence. Combine it with `--data-export` to verify palette backup data; reinstall checks reuse that directory with `--verify-existing --palette --data-export`. A version 2 backup from this run can be restored into a fresh isolated directory with `--data-import --palette` to check every saved color after restore and restart. The palette editor uses its own neutral colors during custom preview. See [palette behavior](PALETTES.md).

To test preservation across a reinstall, reuse the successful smoke directory after reinstalling into the same program directory:

```powershell
$env:VITERA_SMOKE_DIR = 'C:\path\to\Vitera\artifacts\smoke-example'
npm.cmd run test:installed -- --verify-existing
```

The `VITERA_DATA_DIR` environment override is intended for isolated development/testing. It changes the native data directory for that process only; the harness never writes test meals into the normal personal diary. CI performs formatting, build, native tests, Rust linting, and installer packaging, then uploads the installer as a private workflow artifact. Installed UI checks run locally, separately from CI.

Report checks distinctly: document verification, unit/integration checks, live-provider evaluation, runtime use, and installer testing. Passing one does not establish the others.

## Secrets and personal data

Never commit real profile values, diaries, metric records, photos, exports, backups, API keys, signing keys, or model weights. `.gitignore` covers common paths and formats, but review staged files because ignore rules do not classify every possible personal file.

Optional local-provider tokens use native Windows Credential Manager. SQLite stores a generated reference only. The frontend can submit a newly entered token through a native command but cannot retrieve the saved value. Any future `.env.example` must contain placeholders only, with each field documented; the packaged frontend must never receive a secret through a public build variable. No hosted-provider adapter is enabled.

No public/open-source license is selected. Revisit licensing if the owner decides to publish or distribute the project beyond personal use.
