# Local meal descriptions

Milestone 4 adds an optional description-to-draft shortcut. Manual food entry, recipes and measurements continue to work without AI. Photo input belongs to Milestone 5; hosted providers are not enabled.

## Setup

1. Install and start [Ollama for Windows](https://ollama.com/download/windows) separately. Download a local text-capable model through Ollama; CalPal does not install or download models.
2. In CalPal, open **Settings → AI settings**, or **Add food → Describe → AI settings**.
3. Leave the port at `11434` for a standard installation. Click **Check models and readiness**, choose an installed model from the suggestions, enable local descriptions, and **Save AI settings**.
4. Open **Add food → Describe**, enter the meal and choose **Create draft**. Check food identities, preparation, portions, sources and assumptions. Correct or remove rows, add missing items, select date/meal, confirm each item and **Save reviewed items**.

AI defaults to off. The default request deadline is 90 seconds, adjustable from 5 to 180 seconds, including model readiness and loading. A first request can take longer than warm inference. Exact settings and performance depend on the installed model and device. The models used in development are listed with actual results in [Milestone 4 verification](VERIFICATION-M4.md); producing valid JSON does not establish nutrition accuracy.

## Review and nutrition

The model proposes items and portions. Native code maps local candidates to snapshots and calculates their nutrition using the same food-specific portion rules as manual logging. The prompt includes at most 40 current local foods, with catalog records first; the review selector still exposes the full library. Compact prompt keys are never saved as food-database identifiers. Clearly incompatible name/key pairs leave a match unresolved.

Exact named portion labels can resolve through a food's measured portions—for example, two `large` hard-boiled eggs use that record's 50 g large-egg portion. Ambiguous or unsupported units remain unresolved. Milliliters never become grams without a food-specific density or measured named portion. Check preparation, since the model can still choose an unsuitable record or amount.

An unmatched row is labeled **AI-only / manually corrected estimate**. Its calories and optional macros represent the whole reviewed portion. Changing its amount does not automatically rescale these values; correct the totals for the new portion. Missing macros stay unknown. Local-record rows recalculate when their portion changes.

Each row requires confirmation after edits. Saving all rows is transactional. Stable item IDs and a persisted request receipt prevent a double click or retry from logging the same draft twice. Stored provenance includes provider/model, prompt/schema version, original name/portion, reviewed portion, assumptions and questions. Later source changes do not rewrite the snapshot. Diary edits, recent repeats and saved meals retain that provenance.

Drafts remain separate from diary totals. They stay in memory while the composer is open, including when opening its AI settings. Closing the composer or restarting discards an unsaved draft. Saved entries persist in SQLite.

## Connections and credentials

Only the native layer calls Ollama, at `http://127.0.0.1:<configured port>`. Redirects and HTTP proxies are disabled. Cloud-named models and models declaring remote inference are refused; text-completion capability must be declared. No hosted fallback, provider account, shared key or paid request is configured. The app does not contact a provider on startup or merely opening the diary.

Standard local Ollama requires no token. An authenticated local proxy can use **Optional local authentication**. The entered token goes to Windows Credential Manager through a native command, then the password field is cleared. Only a credential reference is stored in SQLite; the saved token is never returned to the webview or included in errors. Remove it through the same settings panel. Credentials are scoped to the data directory's generated reference; isolated tests do not share a personal installation's credential.

Readiness uses Ollama's [model list](https://docs.ollama.com/api/tags) and `/api/show` metadata. Its [chat API](https://docs.ollama.com/api/chat) supports JSON-schema output; CalPal additionally validates returned data, quantities, finite nutrients, text lengths, item count and response size. See [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs). Vision declaration is shown as model information; this milestone accepts text only.

## Failures and cancellation

Cancel a request, edit an existing review item, or close the composer to stop waiting for its result. Editing invalidates the request generation, so a late response cannot replace those edits. Cancellation drops the native HTTP operation; Ollama may finish inference it has already started.

Malformed or oversized output, unavailable models, connection/HTTP errors and timeouts preserve the existing review. Retry is explicit. Missing amounts, uncertain assumptions or unsupported conversions require correction before saving. The app never lets a model execute commands or write diary records on its own.
