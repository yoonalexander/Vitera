# Milestone 4 verification

Verified locally on Windows x64 on 2026-10-01. This milestone adds optional local AI descriptions and stops before photo input, hosted providers, export/restore and personal release work.

## Delivered behavior

- Provider-neutral text input, candidate/draft schema and reviewed provenance, with a native Ollama loopback adapter. AI defaults to off. No provider call occurs on ordinary app startup or diary use, and no models are downloaded by CalPal.
- Model list/readiness, declared text/vision capability checks and refusal of remote/cloud or incompatible models. Photos remain unavailable. JSON-schema generation is followed by native shape/value validation.
- Optional local-proxy authentication through Windows Credential Manager. SQLite contains a generated reference only; saved tokens are not returned to the webview. The password field clears on submission. HTTP redirects/proxies are disabled and provider error bodies are not exposed.
- Editable item names, local-record selection, portions, AI-only calorie/macronutrient totals, date/meal selection, add/remove items and per-item review confirmation. The draft shows item calorie coverage. Missing macros stay unknown; AI-only values are explicitly for the whole portion and do not rescale silently when its amount changes.
- Catalog-first prompts with compact local keys, compatible-name checks and actual snapshot mapping. Exact named-portion labels resolve through measured food portions. Unsupported/ambiguous units, missing amounts and invalid conversions block logging until corrected. Source and portion choices still require review.
- Stable item identifiers and a persisted request receipt; reviewed multi-item saves are atomic and idempotent. Provenance retains original/reviewed names and portions, provider/model, generation timestamp, prompt/schema version, assumptions and questions. Ordinary diary edits, repeats and saved-meal snapshots retain it.
- Explicit retries, 5–180 second request deadlines, cancellation and generation checks. Failures preserve existing review rows; editing while a request runs cancels and invalidates its response. Opening AI settings preserves the composer text and edited draft. Unsaved drafts are in memory only; closing/restarting discards them.

## Automated checks

| Check | Actual result |
| --- | --- |
| TypeScript/Vite production build | Passed |
| Prettier, including the AI schema and harness | Passed |
| Rust formatting and Clippy with warnings denied | Passed |
| Native domain/storage/HTTP tests | 26 passed, 0 failed |
| Frontend date/display/review tests | 6 passed, 0 failed |
| Local matching | An independently specified 100 g banana uses 89 kcal from its actual record, ignoring a fixture's 999 kcal; unknown IDs are never turned into database records; incompatible banana/milk name/key pairs are refused |
| Named portion | Two `large` hard-boiled eggs resolve to the record's `portion:2`, 50 g each, totaling 155 kcal; raw model unit is retained separately |
| Reply validation | Malformed JSON, extra command fields, invalid nutrients/amounts, over 20 items and oversized HTTP replies refused; unsupported units and missing portions remain reviewable but unresolved |
| Capability/configuration | Local endpoint construction, missing model, incompatible text capability, remote/cloud model metadata and incomplete/truncated replies checked |
| Saving | Two-item 700 kcal batch saved once on exact retry; invalid second identifier rolled back the first; a changed request/new identifiers could not reuse an existing receipt; unreviewed input refused |
| Persistence | AI origin, unknown macros, settings reference and logged values survived SQLite reopen; isolated databases generated different credential references |
| HTTP failures/cancellation | Actual loopback fixture transport exercised success, malformed/oversized output, HTTP 500 redaction, cancellation before/during a request and deadline cleanup |
| Native credentials | A unique synthetic Windows credential was written, read and deleted successfully; no personal credential was used |
| Frontend review | Missing amount, unsupported unit, unconfirmed edits and invalid AI-only nutrient values block saving; stable row identifiers survive edits |

## Installed fixture workflow

The full installed workflow ran `npm.cmd run test:installed -- --nutrition --metrics-recipes --ai --ai-live` against the executable installed in ignored `artifacts/install-m4`. WebView2 browser networking was disabled. The fixture provider ran on an ephemeral loopback port; the native adapter, food calculations, transaction storage and visible review were real, not browser mocks. The final complete run used `artifacts/smoke-H9Ckn1`.

- Configured the local model/port in the actual settings, checked readiness and returned to the same description text. Opening settings again retained an edited review.
- Reviewed a banana and an AI-only sandwich. Corrected the banana from 100 g/89 kcal to 150 g/133.5 kcal, corrected the sandwich from 350 to 400 kcal and its name, and saved both once at 533.5 kcal despite two clicks in the same event turn. The UI displayed 534 after rounding. Both original provenance and final source snapshots persisted.
- Injected malformed structured content, HTTP 429, an unavailable model, a delayed response and a six-second response beyond a five-second deadline. Existing 150 g and 400 kcal corrections remained intact. Editing a name cancelled the delayed operation; its eventual reply did not replace that name or calories.
- Returned a missing banana amount/unit and unsupported `bucket` unit for the sandwich. Save stayed disabled until portions were corrected and both rows confirmed.
- Logged and deleted a manual 42 kcal entry while AI was enabled with an unavailable model. The diary returned to its original 650 kcal baseline, independent of AI readiness.
- Axe WCAG A/AA audits found no violations for AI settings, fixture review and real-model review, alongside earlier light/dark diary and food-dialog audits. A 420 px viewport with 200% text had no horizontal dialog overflow. Desktop/narrow screenshots were inspected. Keyboard form submission, Escape and focus restoration remained functional.
- Restart preserved the earlier target/food/recipe/metric records and AI-only/local-record provenance, assumptions, original/reviewed portions and two-item total. No test meals, outputs, databases, credentials or screenshots are tracked in Git.

## Actual local-model evaluation

Ollama `0.31.1` was already installed. No model was downloaded. Both existing `gemma3:4b` and `gemma4:e4b-it-q8_0` were exercised during development, separately from fixture checks. Early iterations produced incorrect matches and portions; the final implementation uses catalog-first compact keys, compatible-name checks and explicit measured portion keys. The final matrix below uses **gemma4:e4b-it-q8_0**, prompt `description-1`, schema 1, and the actual installed native path.

| Synthetic meal description | Independent reference | Final draft result | Observed request time |
| --- | --- | --- | --- |
| 100 g raw banana and 100 g hard-boiled whole egg | 89 + 155 = 244 kcal | 2/2 local matches; 244 kcal; absolute energy difference 0 kcal | 18.844 s |
| 40 g dry oats and 200 g whole milk (3.25% fat) | 0.4 × 379 + 2 × 61 = 273.6 kcal | 2/2 local matches; 273.6 kcal; absolute difference 0 kcal | 3.880 s |
| Two hard-boiled eggs and one medium raw banana | Reference assumes two large 50 g eggs and the catalog's 118 g medium banana: 155 + 105.02 = 260.02 kcal | 2/2 local matches; 260.02 kcal; absolute difference 0 kcal; portion assumptions still require review | 3.844 s |
| One sandwich with toast, butter and cheese, amounts unknown | No known portion/reference total | 1 unresolved sandwich; no local match, calories or portion invented; amount questions surfaced; save blocked | 2.135 s |

All four replies produced structured drafts; three known-portion examples matched the stated reference arithmetic. The fourth deliberately required clarification/manual correction. These are four small synthetic descriptions, not a general nutrition accuracy estimate. They do not test brands, restaurant meals, complicated recipes or photos. Models can still return redundant questions or unsuitable assumptions. Earlier smaller-model and prompt runs are not treated as passing accuracy evidence.

A separate visible real-model composer run generated the banana/egg draft, explicitly selected/corrected both rows, confirmed them and saved 244 kcal as two entries. Stored provenance identified the actual model. Raw evaluation replies and timings remain in ignored `artifacts/smoke-H9Ckn1/live-ai-evaluation.json`; the fixture workflow is reported separately above.

## Upgrade, installer and limits

Opened the populated Milestone 3 `artifacts/smoke-KmWYZY` directory with the new installed executable using `--verify-existing --nutrition --metrics-recipes`. Schema 3 → 4 migration preserved the diary, goals, custom/favorite foods, original nutrition/recipe snapshots, saved-meal versions, metrics, water and appearance. Native tests also cover older migrations and refusal of newer unsupported schemas.

Reinstalled the Milestone 4 package over its existing test program directory (installer exited 0), then ran `--verify-existing --nutrition --metrics-recipes --ai` on `artifacts/smoke-H9Ckn1`. Earlier records and reviewed AI entries survived reinstallation and another app restart. The final display polish distinguishes original AI portions from reviewed portions; preservation checks were rerun against that final package.

Unsigned per-user development installer: `src-tauri/target/debug/bundle/nsis/CalPal_0.1.0_x64-setup.exe`, approximately 4.39 MiB. Version remains development 0.1.0. SHA256: `607D78A91604225B37815422292819D1ABAF7B48337045B8218DF192CFD8A887`.

Fresh installation used an initially absent test directory on this Windows machine, with WebView2 present. A clean virtual machine, missing-WebView2 installation, code signing/trust prompts, a full assistive-technology audit, clinical measurement accuracy, cloud providers and image input remain unverified. Local inference performance varies with hardware/model and may outlast a configured deadline. Cancellation stops CalPal waiting but cannot guarantee the daemon immediately stops GPU work. Windows credential handling was tested with synthetic values; third-party authenticated proxy compatibility was not tested. CI results are separate from these local checks. See [AI setup and behavior](AI.md).
