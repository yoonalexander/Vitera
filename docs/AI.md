# Local meal descriptions and photos

Milestones 4–5 add optional description and photo drafts. Manual food entry, recipes and measurements continue to work without AI. Hosted providers are not enabled.

## Setup

1. Install and start [Ollama for Windows](https://ollama.com/download/windows) separately. Download a local text-capable model through Ollama; CalPal does not install or download models.
2. In CalPal, open **Settings → AI settings**, or **Add food → Describe → AI settings**.
3. Leave the port at `11434` for a standard installation. Choose an installed **Local model** for descriptions and structured drafts. Photos require vision capability: optionally choose a separate **Vision model**, then **Check models and readiness**, enable local AI, and **Save AI settings**. The tested pairing is `gemma4:e4b-it-q8_0` for drafts and `gemma3:4b` for vision on the development device. Leaving the vision override empty uses the Local model for both steps. Each model must already be downloaded; both choices are explicit.
4. Open **Add food → Describe**, enter the meal and choose **Create draft**. Check food identities, preparation, portions, sources and assumptions. Correct or remove rows, add missing items, select date/meal, confirm each item and **Save reviewed items**.

AI defaults to off. The default request deadline is 90 seconds, adjustable from 5 to 180 seconds, including model readiness and loading. A first request can take longer than warm inference. Exact settings and performance depend on the installed model and device. The models used in development are listed with actual results in [Milestone 4 verification](VERIFICATION-M4.md); producing valid JSON does not establish nutrition accuracy.

## Photo drafts and retention

For the tested pairing, explicit optional model downloads use Ollama's [pull command](https://github.com/ollama/ollama/blob/main/docs/quickstart.mdx):

```powershell
ollama pull gemma4:e4b-it-q8_0
ollama pull gemma3:4b
ollama list
```

The installed development copies occupy approximately 11.64 GB and 3.34 GB respectively; these are model file sizes, not a guarantee of memory requirements or speed. Check the model's current tags/license before downloading: [Gemma 4](https://ollama.com/library/gemma4) and [Gemma 3](https://ollama.com/library/gemma3). No models were downloaded by CalPal or automatically during release verification. The development machine has 32 GiB RAM and an RTX 5060; its evaluated results do not establish performance on other devices. See [release setup, costs and recovery](RELEASE.md).

Open **Add food → Photo**. Choose or drop one JPEG, PNG or WebP, optionally describe the ingredients or measured amounts, and choose **Create draft**. Limits are 20 MiB, 24 megapixels and 12,000 pixels per dimension. Convert HEIC or other unsupported formats first. The same editable item review applies to photos; every row requires confirmation. A photo cannot reliably establish weight, preparation, hidden oils or ingredients. Use measured portions and label/recipe data when available.

Native code decodes the actual file content, applies its orientation, flattens transparency onto white, resizes to at most 1,280 pixels on the longest side without enlarging small images, and writes a fresh quality-85 JPEG. Original EXIF/GPS and other metadata are excluded. Only that prepared image reaches the selected local vision model, using Ollama's [vision API](https://docs.ollama.com/capabilities/vision). A first inference observes visible foods in plain text; the configured Local model then extracts a validated draft from those uncertain observations and your optional context. Both share the configured deadline and cancellation. Both models are shown before generation and recorded in saved provenance. **What the vision model saw** lets you inspect the observations during review. The native capability check rejects a text-only vision selection before sending any photo to chat.

Original files are never copied to CalPal disk storage. Prepared images exist in bounded process memory while the composer is open, including during a retry or its settings panel. Replacement, removal, closing the draft, successful save and process exit clear their temporary handles; cancellation of inference leaves the open photo available for an explicit retry. No image is placed in browser storage or a temporary directory.

**Keep the prepared photo locally with these diary items** is unchecked by default. Opting in stores one sanitized JPEG in SQLite, atomically with the reviewed entries. Photo provenance records its ID and prepared dimensions alongside the original estimate metadata, even when retention is off. Retained photos are shared by the items, repeats and saved meal copies with that request provenance. Open **Edit food → Meal photo → Remove retained photo** to remove the attachment for all those items without changing nutrition. Removal deletes the attachment record; it is not a secure erase of SQLite pages or existing backups. Soft-deleting an entry does not remove a shared retained attachment.

The actual benchmark and its failures are documented in [Milestone 5 verification](VERIFICATION-M5.md). No model is downloaded automatically, no hosted provider is configured, and a model or network failure never triggers a paid fallback or diary write.

## Review and nutrition

The model proposes items and portions. Native code maps local candidates to snapshots and calculates their nutrition using the same food-specific portion rules as manual logging. The prompt includes at most 40 current local foods, with catalog records first; the review selector still exposes the full library. Compact prompt keys are never saved as food-database identifiers. Clearly incompatible name/key pairs leave a match unresolved.

Exact named portion labels can resolve through a food's measured portions—for example, two `large` hard-boiled eggs use that record's 50 g large-egg portion. Ambiguous or unsupported units remain unresolved. Milliliters never become grams without a food-specific density or measured named portion. Check preparation, since the model can still choose an unsuitable record or amount.

An unmatched row is labeled **AI-only / manually corrected estimate**. Its calories and optional macros represent the whole reviewed portion. Changing its amount does not automatically rescale these values; correct the totals for the new portion. Missing macros stay unknown. Local-record rows recalculate when their portion changes.

Each row requires confirmation after edits. Saving all rows is transactional. Stable item IDs and a persisted request receipt prevent a double click or retry from logging the same draft twice. Stored provenance includes provider/model, prompt/schema version, original name/portion, reviewed portion, assumptions and questions. Later source changes do not rewrite the snapshot. Diary edits, recent repeats and saved meals retain that provenance.

Drafts remain separate from diary totals. They stay in memory while the composer is open, including when opening its AI settings. Closing the composer or restarting discards an unsaved draft. Saved entries persist in SQLite.

## Connections and credentials

Only the native layer calls Ollama, at `http://127.0.0.1:<configured port>`. Redirects and HTTP proxies are disabled. Cloud-named models and models declaring remote inference are refused; text-completion capability must be declared. No hosted fallback, provider account, shared key or paid request is configured. The app does not contact a provider on startup or merely opening the diary.

Standard local Ollama requires no token. An authenticated local proxy can use **Optional local authentication**. The entered token goes to Windows Credential Manager through a native command, then the password field is cleared. Only a credential reference is stored in SQLite; the saved token is never returned to the webview or included in errors. Remove it through the same settings panel. Credentials are scoped to the data directory's generated reference; isolated tests do not share a personal installation's credential.

Readiness uses Ollama's [model list](https://docs.ollama.com/api/tags) and `/api/show` metadata. Its [chat API](https://docs.ollama.com/api/chat) supports JSON-schema output; CalPal additionally validates returned data, quantities, finite nutrients, text lengths, item count and response size. See [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs). Vision declaration is required for photo requests, in addition to text completion. Photos use prompt `photo-1`; descriptions retain `description-1`, both with draft schema 1.

## Failures and cancellation

Cancel a request, edit an existing review item, or close the composer to stop waiting for its result. Editing invalidates the request generation, so a late response cannot replace those edits. Cancellation drops the native HTTP operation; Ollama may finish inference it has already started.

Malformed or oversized output, unavailable models, connection/HTTP errors and timeouts preserve the existing review. Retry is explicit. Missing amounts, uncertain assumptions or unsupported conversions require correction before saving. The app never lets a model execute commands or write diary records on its own.
