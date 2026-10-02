# Local food parsing and photos

Milestones 4–5 introduced optional description and photo drafts. Version 0.2.3 extends that existing service with typed food extraction, using local `qwen3.5:4b` by default. Manual food entry, recipes and measurements continue to work without AI. Hosted providers are not enabled.

## Setup

1. Install and start [Ollama for Windows](https://ollama.com/download/windows) separately. Run `ollama pull qwen3.5:4b`, then `ollama run qwen3.5:4b` to test it interactively. See the exact commands and API check in [README](../README.md). Vitera does not install or download models.
2. In Vitera, open **Settings → AI settings**, or **Add food → Describe → AI settings**.
3. Leave the port at `11434` for a standard installation. Choose **Local model** `qwen3.5:4b` for descriptions and structured drafts. Photos require vision capability: optionally choose a separate **Vision model**, then **Check models and readiness**, enable local AI, and **Save AI settings**. Leaving the vision override empty uses the Local model for both steps. Each selected model must already be downloaded. Existing saved settings are preserved on upgrade; explicitly change a previous Gemma selection if desired.
4. Open **Add food → Describe**, enter the meal and choose **Create draft**. Check food identities, preparation, portions, sources and assumptions. Correct or remove rows, add missing items, select date/meal, confirm each item and **Save reviewed items**.

AI defaults to off. The default request deadline is 90 seconds, adjustable from 5 to 180 seconds, including model readiness and loading. A first request can take longer than warm inference. Exact settings and performance depend on the installed model and device. Current results are in [Qwen verification](VERIFICATION-QWEN.md); the historical Gemma results in [Milestone 4 verification](VERIFICATION-M4.md) describe the older nutrition-estimation contract. Producing valid JSON does not establish correct food interpretation.

## Service architecture and configuration

React calls the existing `describe_meal` native command. Existing `AiJobs` performs readiness, cancellation and the total request deadline, then calls `FoodParsingService::parse_food_entry`. Its separate `FoodParsingProvider` interface returns `ParsedFoodEntry`; the Ollama implementation reuses the existing bounded reqwest HTTP adapter. It posts to `/api/chat` with `stream:false`, `think:false`, temperature 0 and the schema in both `format` and the system prompt. No CLI process is spawned by the app. A new provider implements the parsing interface without changing review, nutrition calculations or transactional diary saving; provider-specific configuration/readiness would still need an adapter.

`ai/food-parsing-schema.json` requires `items` and nullable `notes`. Each item has `name`, nullable `foodId`, nullable `quantity`/`unit`, nullable `preparation`/`brand`/`restaurant`, and `modifiers`/`assumptions`/`questions` lists. The Ollama schema constrains `foodId` to null and sends no catalog records: this prevents catalog descriptions from overwriting the user's food identity or preparation. Native lookup follows extraction. Calories and macros are absent and rejected if returned. Unspecified amounts remain null; explicit weights stay weights, fractional counts stay counts, and toppings can become separate items. The prompt includes small synthetic examples of measured weights, fractional counts, per-slice toppings and unspecified sauces. Native validation rejects prose, unknown fields, empty lists, invalid quantities and oversized output.

The development launcher reads `.env` using Node's built-in parser; existing process variables take precedence. `OLLAMA_BASE_URL` and `OLLAMA_MODEL` initialize new native settings, with defaults `http://localhost:11434` and `qwen3.5:4b`. Saved settings take precedence thereafter. Only localhost/127.0.0.1 HTTP URLs without credentials, paths or query strings are accepted. The installed app needs no `.env`; use its settings to change model or port. A remote provider cannot be enabled by changing this URL.

## Photo drafts and retention

Earlier photo benchmarks used the following separately installed Gemma pairing, with results in the milestone-5 report. These are optional alternatives, not the current default:

```powershell
ollama pull gemma4:e4b-it-q8_0
ollama pull gemma3:4b
ollama list
```

The old development copies occupied approximately 11.64 GB and 3.34 GB respectively; these historical file sizes do not guarantee memory requirements or speed. The current Qwen model was downloaded explicitly during setup, outside Vitera. The application never downloads models. The development machine has 32 GiB RAM and an RTX 5060; its evaluated results do not establish performance on other devices. See [release setup, costs and recovery](RELEASE.md).

Open **Add food → Photo**. Choose or drop one JPEG, PNG or WebP, optionally describe the ingredients or measured amounts, and choose **Create draft**. Limits are 20 MiB, 24 megapixels and 12,000 pixels per dimension. Convert HEIC or other unsupported formats first. The same editable item review applies to photos; every row requires confirmation. A photo cannot reliably establish weight, preparation, hidden oils or ingredients. Use measured portions and label/recipe data when available.

Native code decodes the actual file content, applies its orientation, flattens transparency onto white, resizes to at most 1,280 pixels on the longest side without enlarging small images, and writes a fresh quality-85 JPEG. Original EXIF/GPS and other metadata are excluded. Only that prepared image reaches the selected local vision model, using Ollama's [vision API](https://docs.ollama.com/capabilities/vision). A first inference observes visible foods in plain text; the configured Local model then extracts a validated draft from those uncertain observations and your optional context. Both share the configured deadline and cancellation. Both models are shown before generation and recorded in saved provenance. **What the vision model saw** lets you inspect the observations during review. The native capability check rejects a text-only vision selection before sending any photo to chat.

Original files are never copied to Vitera disk storage. Prepared images exist in bounded process memory while the composer is open, including during a retry or its settings panel. Replacement, removal, closing the draft, successful save and process exit clear their temporary handles; cancellation of inference leaves the open photo available for an explicit retry. No image is placed in browser storage or a temporary directory.

**Keep the prepared photo locally with these diary items** is unchecked by default. Opting in stores one sanitized JPEG in SQLite, atomically with the reviewed entries. Photo provenance records its ID and prepared dimensions alongside the original estimate metadata, even when retention is off. Retained photos are shared by the items, repeats and saved meal copies with that request provenance. Open **Edit food → Meal photo → Remove retained photo** to remove the attachment for all those items without changing nutrition. Removal deletes the attachment record; it is not a secure erase of SQLite pages or existing backups. Soft-deleting an entry does not remove a shared retained attachment.

The actual benchmark and its failures are documented in [Milestone 5 verification](VERIFICATION-M5.md). No model is downloaded automatically, no hosted provider is configured, and a model or network failure never triggers a paid fallback or diary write.

## Review and nutrition

The model extracts items and portions without nutrient values. Native code maps a unique compatible local candidate to a snapshot and calculates nutrition using the same food-specific portion rules as manual logging. The review selector exposes the full library. Incompatible cooking methods, brands, restaurants and modifiers leave a match unresolved; unspecified milk fat or rice variety cannot silently select whole milk or white rice. Custom records require their exact name. Matching remains conservative and every source must be reviewed. The bundled USDA starter catalog has only six foods, with custom label foods added locally; there is no live nutrition API or full restaurant database.

Exact named portion labels can resolve through a food's measured portions—for example, two `large` hard-boiled eggs use that record's 50 g large-egg portion. Common unit spellings are normalized without changing the quantity. Manual nutrition can retain descriptive units such as count, slice, cup, tablespoon, bowl, can or bottle; these do not establish a weight or a nutrient conversion. Local-record rows require a compatible measured portion or unit. Milliliters never become grams without a food-specific density or measured named portion. Check preparation and amounts, since the model can still omit or misinterpret details.

An unmatched row has blank nutrient fields and cannot save until you select a usable local record or enter calories manually. It is labeled **Manual nutrition from parsed entry** after saving. These manually supplied calories and optional macros represent the whole reviewed portion. Changing its amount does not automatically rescale them; correct the totals for the new portion. Missing macros stay unknown. Local-record rows recalculate when their portion changes. Historical schema-1 entries retain their original AI-estimate provenance and label.

Each row requires confirmation after edits. Saving all rows is transactional. Stable item IDs and a persisted request receipt prevent a double click or retry from logging the same draft twice. Stored provenance includes provider/model, prompt/schema version, original name/portion, reviewed portion, preparation, brand, restaurant, modifiers, assumptions and questions. Global parsing notes are displayed during review. Later source changes do not rewrite the snapshot. Diary edits, recent repeats and saved meals retain provenance.

Drafts remain separate from diary totals. They stay in memory while the composer is open, including when opening its AI settings. Closing the composer or restarting discards an unsaved draft. Saved entries persist in SQLite.

## Connections and credentials

Only the native layer calls Ollama, at `http://127.0.0.1:<configured port>`. Redirects and HTTP proxies are disabled. Cloud-named models and models declaring remote inference are refused; text-completion capability must be declared. No hosted fallback, provider account, shared key or paid request is configured. The app does not contact a provider on startup or merely opening the diary.

Standard local Ollama requires no token. An authenticated local proxy can use **Optional local authentication**. The entered token goes to Windows Credential Manager through a native command, then the password field is cleared. Only a credential reference is stored in SQLite; the saved token is never returned to the webview or included in errors. Remove it through the same settings panel. Credentials are scoped to the data directory's generated reference; isolated tests do not share a personal installation's credential.

Readiness uses Ollama's [model list](https://docs.ollama.com/api/tags) and `/api/show` metadata with an eight-second limit. It checks reachability, installed model names, local inference and completion/vision declarations without running inference. Its [chat API](https://docs.ollama.com/api/chat) supports JSON-schema output; Vitera validates returned fields, quantities, text lengths, item count and response size. See [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs). Every parsing request requires schema-constrained output; an incompatible Ollama version returns an error rather than a prose fallback. Readiness alone does not prove schema support or parsing accuracy. Photos now use prompt `photo-2`; descriptions use `description-2`, both with schema 2. Historical schema-1 provenance remains readable.

## Failures and cancellation

Cancel a request, edit an existing review item, or close the composer to stop waiting for its result. Editing invalidates the request generation, so a late response cannot replace those edits. Cancellation drops the native HTTP operation; Ollama may finish inference it has already started.

Malformed or oversized output, unavailable models, connection/HTTP errors and timeouts preserve the existing review. Retry is explicit. Missing amounts, uncertain assumptions or unsupported conversions require correction before saving. The app never lets a model execute commands or write diary records on its own.
