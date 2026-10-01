# Milestone 5 verification

Verified locally on Windows x64 on 2026-10-01. Photo input is complete; hosted inference, export/restore and personal-release work remain deferred.

## Delivered behavior

- Single JPEG/PNG/WebP upload or HTML5 file drop, with optional meal context. Native decoding validates content, byte/dimension/pixel limits and orientation. A fresh JPEG, at most 1,280 pixels per side, excludes original metadata. Small images are not enlarged; transparent pixels are flattened onto white.
- Explicit local model choices: a vision model observes the photo and the configured Local model extracts a structured draft. Leaving the vision override blank uses one model. Readiness checks both selections; a completion-only vision selection is rejected before image transfer. Both model identities appear before generation and in persisted provenance.
- Editable food identity, source, portion, calories/macros, assumptions and questions. The visual observations are also inspectable. Local matches calculate from stored food records; unmatched or unresolved items require correction and confirmation. No automatic diary writes or paid fallback.
- Bounded prepared-image memory, with cleanup on replacement/removal/composer close/save/process exit. No original or temporary image file is written by CalPal. An explicit retention checkbox, off by default, saves one prepared JPEG atomically with reviewed entries. Shared attachments can be removed without changing nutrition; retries do not recreate a removed attachment.
- Schema 5 adds retention receipts and JPEG attachments. Earlier text-AI provenance/configuration remains readable; the optional vision-model override defaults to absent.

## Automated and installed checks

| Check | Result |
| --- | --- |
| TypeScript and production frontend build | Passed |
| Frontend domain tests | 6 passed |
| Native tests | 29 passed |
| Prettier, Rust formatting, Clippy with warnings denied | Passed |
| Unsigned Windows development NSIS installer | Built and installed successfully |
| Full installed Milestones 1–5 workflow | Passed |
| Photo/model settings, review and 420 px / 200% text accessibility checks | Passed; zero axe WCAG A/AA violations in tested views |
| Restart, attachment removal and reinstallation | Passed |

Native photo tests independently check EXIF orientation, resizing, absence of original EXIF/private metadata bytes, transparency, malformed/oversized input, bounded memory handles, optional retention, transaction rollback, duplicate receipts, mismatched photo handles, removal/retry behavior and database reopen. Existing arithmetic, recipe, metric, text-provider and credential tests remain passing.

Installed fixture checks use an actual local HTTP server and the actual native adapter, review UI and SQLite database. Separately configured synthetic draft/vision models verify correct routing. Cases include corrupt uploads, upload/drop equivalence, completion-only capability rejection with zero chat calls, malformed structured replies, HTTP 503, connection failure, timeout, cancellation and late responses preserving an edit. Generation does not write a diary entry. Corrected, confirmed saving occurs once even on a double click. Default-off retention, released temporary handles, retained image restart and explicit removal are verified. Milestone 4 fixtures additionally cover unavailable models, unknown units and missing portions.

The successful full installed run was `artifacts/smoke-I6O4yO`, using `artifacts/install-m5/calpal.exe`. It exercised `--nutrition --metrics-recipes --ai --photos --photos-live`. Screenshots, provider outputs, accessibility audits and isolated test records remain ignored. Reinstallation reused that populated directory with `--verify-existing` and the same feature flags; it checked saved values without another inference run.

## Real photo evaluation

The three fixed references come from [Nutrition5k, Thames et al., CVPR 2021](https://github.com/google-research-datasets/Nutrition5k), under CC BY 4.0. The dataset supplies ingredient masses and nutrition references; these are independently weighed dataset meals, not generated photos or invented serving weights. Only three overhead RGB files and their metadata were downloaded, through the explicit developer script `scripts/fetch-photo-benchmark.mjs`. No AI model was downloaded.

Ollama `0.31.1` and both models were already installed. The final pairing uses `gemma3:4b` (about 3.34 GB) for visual observations and `gemma4:e4b-it-q8_0` (about 11.64 GB) for structured drafts. The development device has 32 GiB RAM and an NVIDIA RTX 5060. Results below are the original uncorrected requests with no ingredient/weight context, through the installed native pipeline:

| Reference/photo | Known meal | Reference mass / energy | Original draft and actual limitation | Elapsed |
| --- | --- | --- | --- | --- |
| [dish_1560455030](https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery/realsense_overhead/dish_1560455030/rgb.png) | Cherry tomatoes 55 g, cucumbers 29 g, carrots 19 g | 103 g / 20.59 kcal | Visible ingredients identified; also proposed a redundant aggregate salad row. All amounts/calories unresolved. | 28.670 s |
| [dish_1556572657](https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery/realsense_overhead/dish_1556572657/rgb.png) | Olives | 36 g / 41.399998 kcal | Identified olives; proposed 9 `count`, an unsupported unit requiring correction. Calories unknown. | 27.735 s |
| [dish_1558459276](https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery/realsense_overhead/dish_1558459276/rgb.png) | Cooked white rice | 79 g / 102.699997 kcal | Correct local rice record; amount and unit unresolved, so no calculated calories. | 28.285 s |

All three requests returned valid draft structures; all three original drafts needed portion or item correction. None produced a complete numeric calorie estimate, so energy/gram error denominators for those original drafts are **0/3**, not zero error. The redundant salad row and unsupported olive unit are failures to resolve during review, even though ingredient recognition improved. These three samples do not establish general nutrition accuracy or cover complicated recipes, hidden oils, brands or restaurants.

Each photo then passed through visible upload, optional weighed ingredient context, generation, editing/confirmation and diary saving. The contextual drafts preserved all five supplied ingredient gram amounts exactly: 55/29/19, 36 and 79 g. The rice matched its local record; tomatoes, cucumber, carrots and olives stayed unmatched with calories unknown. The test manually corrected each reviewed meal to the dataset energy reference, kept unknown macros unknown, and saved 20.59, 41.399998 and 102.699997 kcal. Those values are **manual corrections**, not model accuracy results. One prepared photo was explicitly retained; two were not. Restart/reinstallation preserved the saved nutrition, both model identities and the selected retained JPEG.

Development comparisons exposed substantial failures and drove the final model split:

- Sending images directly with catalog-constrained JSON output made Gemma 3 choose bananas for vegetables/olives and interpret 158 as a named-portion count for rice: 32,453.2 kcal versus 102.699997, an absolute error of 32,350.500003 kcal. No such draft was saved automatically.
- A larger system instruction during visual observation also degraded results; a simple visual query correctly identified the visible foods. Earlier Gemma 3 extraction produced invalid assumption/question output, which native validation rejected while preserving the photo.
- Gemma 3 alone still mapped observations to incorrect food records and inferred 158 g. In that comparison, the olives yielded a banana estimate of 140.62 kcal (99.220002 kcal absolute error) and rice yielded 205.4 kcal (102.700003 kcal absolute error). The vegetable estimate remained incomplete.
- Gemma 4's visual observations were unreliable on these photos despite declaring vision capability. It is used for structured extraction in the final pairing, rather than recommended for visual recognition on this tested device.

Both installed real models currently declare vision capability. Completion-only refusal is demonstrated by the installed native fixture; it is not presented as a live text-only-model benchmark. Actual provider inference, controlled transport failures and offline manual use are separate evidence categories.

## Upgrade and installer evidence

A copy of the populated Milestone 4 database was opened with schema 5. Existing settings, 13 diary records, eight food records, goal/day history, eight metric records, recipe/saved-meal versions, AI configuration and receipts were preserved. Complete prior table contents compared unchanged; only the new photo tables were added. The original Milestone 4 artifact was preserved.

The final development installer is `src-tauri/target/debug/bundle/nsis/CalPal_0.1.0_x64-setup.exe`, SHA-256:

```text
89D47D27B76DAA1312B81C162FBF809EA5C8F2EC649AC7956E6F0209E620C2BA
```

Clean-directory installation and reinstall into `artifacts/install-m5` returned exit code 0. Testing uses isolated data directories and WebView2 profiles, never the personal diary. The installed harness keeps browser networking offline while native inference uses only loopback. No hosted adapter or fallback is configured.

This is an unsigned development installer tested on the current machine with WebView2 already present. A clean VM, missing-WebView2 installation, signing and personal-release/backup validation remain Milestone 6. Local checks do not establish the status of a remote CI run. Attachment removal is logical SQLite deletion, not secure erasure of database pages or existing backups.
