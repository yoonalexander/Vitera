# Offline food catalog v1

Six staple records retrieved directly from the public [USDA FoodData Central API](https://fdc.nal.usda.gov/api-guide/) on 2026-10-01, using its public demonstration access. The [USDA data documentation](https://fdc.nal.usda.gov/data-documentation/) identifies SR Legacy as the final April 2018 release. USDA FoodData Central data is public domain/CC0; attribution is retained in every record. No API key is required by the installed app, and it makes no food-data requests.

| FDC ID | Record |
| --- | --- |
| 173944 | Bananas, raw |
| 173424 | Egg, whole, cooked, hard-boiled |
| 168878 | Rice, white, long-grain, regular, enriched, cooked |
| 171477 | Chicken breast, meat only, cooked, roasted |
| 173904 | Regular/quick oats, not fortified, dry |
| 171265 | Whole milk, 3.25% milkfat, with added vitamin D |

The committed JSON preserves the exact source descriptions, energy (nutrient 1008), protein (1003), carbohydrate by difference (1005), total fat (1004), and positive gram-weight food portions. Values use a 100 g basis, including milk. Volume portions use USDA's food-specific gram weights; no generic cup-to-gram conversion or inferred milk density is introduced. The UI distinguishes raw, dry, cooked and as-sold foods.

This is a deliberately small starter catalog, not comprehensive branded or restaurant coverage. Users can create and edit their own label/manual foods offline. Unspecified nutrients remain `null`, including during scaling. Stated energy takes priority over macro-derived energy. Every logged source food is copied as an immutable snapshot with its version and portion.

To reproduce v1, save the six full API records as a JSON array in an ignored artifact directory, then run:

```powershell
node scripts/import-usda.mjs artifacts/usda-source.json
```

The API endpoint used was `/fdc/v1/foods` with `fdcIds=173944,173424,168878,171477,173904,171265`. `scripts/import-usda.mjs` normalizes the downloaded records without network access. Do not replace v1 in place for future source updates: create a new catalog version and IDs, so saved portions and historical records remain reproducible.
