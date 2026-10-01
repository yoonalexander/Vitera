# Milestone 1 verification

Verified locally on Windows x64 on 2026-09-30. This report describes the offline foundation only.

## Delivered behavior

- Today diary with named calorie entries grouped into Breakfast, Lunch, Dinner, and Snacks.
- Add/edit form with calories, meal, and explicit diary date.
- Transactional saves, duplicate prevention, optimistic revision checks, soft delete, and Undo.
- SQLite migration, durable records, and persisted system/light/dark appearance.
- Today, Recipes, and Progress navigation. Recipes and metric features are clearly marked as future milestone 3 work.
- Per-user NSIS development installer with an original app icon.

## Checks and evidence

| Check | Result |
| --- | --- |
| TypeScript and Vite production frontend build | Passed |
| Prettier formatting | Passed |
| Rust formatting and Clippy with warnings denied | Passed |
| Native SQLite tests | 4 passed, 0 failed |
| Clean install into an initially absent test directory | Installer exited successfully; executable launched |
| Installed offline diary | Added 450.5 kcal, displayed 451; edited to 650; delete reduced total to 0; Undo restored 650 |
| Date separation | Previous day had 0; returning to logged day restored 650 |
| Keyboard and modal behavior | Initial food-name focus, Tab to calories, Enter save, Escape close, opener focus restoration passed |
| Main navigation | Today / Recipes / Progress passed |
| Light and dark accessibility | Axe WCAG A/AA checks returned no violations for both diary themes and the food dialog |
| Large-text/narrow layout | 420 px viewport with 200% text; no horizontal page overflow; screenshot inspected and date clipping fixed |
| Restart persistence | Actual executable relaunched with the same test directory; 650 kcal entry and dark setting persisted |
| Reinstallation | Installed over the same program directory; existing test diary and settings persisted after restart |
| Normal data location | Verified `%APPDATA%\com.yoonalexander.calpal\calpal.sqlite3` is created on normal launch |

Native tests also cover invalid/nonfinite calories, invalid dates and names, duplicate IDs, stale revisions, multiple-entry totals, positive zero for an empty diary, settings persistence, and refusal to open a newer schema without deleting records.

Installed UI tests use the actual WebView2 window and Rust commands, with browser networking disabled. They do not substitute localStorage or mocked persistence. Synthetic diary records and browser profiles are isolated through process-local environment overrides.

Local screenshots, accessibility reports, and smoke results are in ignored `artifacts/smoke-*` directories. The final full workflow used `artifacts/smoke-5xG0S7`; reinstallation was also tested with the earlier successful diary in `artifacts/smoke-EhoXMw`. These are local evidence, not committed personal records.

## Installer

Path: `src-tauri/target/debug/bundle/nsis/CalPal_0.1.0_x64-setup.exe`.

SHA256: `7D9716485D23E006A3398C1B9C0748041381867BBC4D82B53C3E4F73B4840343`.

The development installer is about 3 MiB and is excluded from Git. It can be recreated from the committed source and lockfiles; future CI runs also upload their installer as a private workflow artifact. CI status is separate from these local checks and must be read from the actual workflow run.

## Boundaries

Clean installation means a fresh installation directory on this Windows machine. WebView2 was already installed. A separate clean virtual machine, the missing-WebView2 download path, installer trust prompts, code signing, and cross-version upgrades are not verified here. This is an unsigned development build; Windows may show a trust prompt.

Reinstallation checks preserve data across reinstalling this same version. They do not establish migration compatibility with future versions. Automated accessibility checks and screenshot review are not a full assistive-technology audit.

No live AI, recipe calculations, weight tracking, food database, calorie-target calculator, export/restore, or phone installation was implemented or tested. These remain in their own roadmap milestones.
