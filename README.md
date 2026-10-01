# Vitera

A personal life tracker with a cute monster companion, starting with nutrition, body metrics, recipes and optional AI meal estimates from photos or descriptions.

The monster is your pal: a friendly companion for everyday progress. See [the Vitera identity and rename compatibility](docs/BRANDING.md). Interactive mascot behavior is planned separately from this initial branding.

Vitera takes inspiration from the food diary in MyFitnessPal and photo logging in Cal AI. It will have its own interface and implementation, with no account requirement, ads, subscriptions, or feature paywalls in the personal version.

## Project status

Milestones 0–6 are complete. Vitera has an offline calorie/macro diary, local/custom foods and portions, favorites and recent entries, calorie targets with history, diary completion, weekly summaries, weight/body measurements/body-fat and water records, metric trends, versioned recipes and reusable saved meals. Optional local Ollama descriptions and photos produce editable drafts with assumptions, nutrition-source snapshots and reviewed transactional saving. Photos are resized and stripped of metadata, with local attachment retention off by default. Records persist in local SQLite. Diary/metric CSV exports, complete backups and validated replacement restores are available from Settings.

The first platform is Windows desktop, confirmed by the owner. Built with Tauri 2, React, TypeScript, and bundled SQLite. Today logs foods and water, Recipes manages versioned recipes and saved meals, and Progress shows diary coverage and measurement history. AI defaults to off; see [local AI setup](docs/AI.md). Hosted AI is not configured. Version 0.2.1 is the personal release; see [installation, backup and recovery](docs/RELEASE.md).

## Run and build

Install Node.js 24, Rust stable (MSVC), Windows C++ build tools, and WebView2. Then:

```powershell
npm.cmd ci
npm.cmd run tauri -- dev
```

Create the release installer with `npm.cmd run tauri -- build`. Output: `src-tauri/target/release/bundle/nsis/Vitera_0.2.1_x64-setup.exe`. It is unsigned; Windows may show a trust prompt. WebView2 must be present for offline installation, or the installer will need internet to obtain it.

See [development and verification instructions](docs/REPOSITORY.md) for checks and isolated installed-app testing.

## Features

- Daily food diary, calorie totals, and optional protein, carbohydrate, and fat tracking.
- Estimated maintenance calories and an editable daily target.
- Weight, body measurements, water, and progress history.
- Custom foods, reusable meals, and recipes with portion calculations.
- Photo and text meal estimates through a replaceable AI provider.
- Offline manual tracking, local storage, and export/restore.
- An installable personal app with every core feature available for free.

## Documents

- [Vitera branding and rename compatibility](docs/BRANDING.md)
- [Vitera rename verification](docs/VERIFICATION-RENAME.md)
- [Product and technical design](docs/DESIGN.md)
- [Milestones and acceptance criteria](docs/ROADMAP.md)
- [Repository setup and development conventions](docs/REPOSITORY.md)
- [Milestone 1 verification](docs/VERIFICATION.md)
- [Milestone 2 verification](docs/VERIFICATION-M2.md)
- [Milestone 3 verification](docs/VERIFICATION-M3.md)
- [Local AI setup and review](docs/AI.md)
- [Milestone 4 verification](docs/VERIFICATION-M4.md)
- [Milestone 5 verification](docs/VERIFICATION-M5.md)
- [Personal release, backup and recovery](docs/RELEASE.md)
- [Milestone 6 verification](docs/VERIFICATION-M6.md)
- [Offline food catalog sources](catalog/README.md)

## Cost approach

Manual tracking and calorie calculations will not require an AI service. Local AI is the preferred route for avoiding per-request API charges, subject to hardware and model evaluation. Hosted providers are optional and may charge for usage even though Vitera itself has no paywall. No paid service has been configured.

## Repository

Connected remote: [yoonalexander/Vitera](https://github.com/yoonalexander/Vitera), verified private. Local `main` tracks `origin/main`.

No personal health records, meal photos, provider credentials, or generated installers belong in Git. See [.gitignore](.gitignore). No open-source license has been selected; public distribution and monetization are future decisions.
