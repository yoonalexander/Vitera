# CalPal

A personal, minimal calorie and body-metric tracker with recipes and optional AI meal estimates from photos or descriptions.

CalPal takes inspiration from the food diary in MyFitnessPal and photo logging in Cal AI. It will have its own interface and implementation, with no account requirement, ads, subscriptions, or feature paywalls in the personal version.

## Project status

Milestones 0–2: repository/design, the Windows offline foundation, and nutrition/targets. CalPal has a daily diary with optional macros, a small versioned USDA catalog, custom foods and portions, favorites and recent entries, manual/adult estimated targets with history, diary completion and weekly summaries. Records persist in local SQLite and work offline.

The first platform is Windows desktop, confirmed by the owner. Built with Tauri 2, React, TypeScript, and bundled SQLite. Progress shows weekly diary coverage; recipes and body metrics remain milestone 3. AI and export/restore remain later milestones.

## Run and build

Install Node.js 24, Rust stable (MSVC), Windows C++ build tools, and WebView2. Then:

```powershell
npm.cmd ci
npm.cmd run tauri -- dev
```

Create the development installer with `npm.cmd run tauri -- build --debug`. Output: `src-tauri/target/debug/bundle/nsis/CalPal_0.1.0_x64-setup.exe`. It is unsigned; Windows may show a trust prompt. WebView2 must be present for offline installation, or the installer will need internet to obtain it.

See [development and verification instructions](docs/REPOSITORY.md) for checks and isolated installed-app testing.

## Planned features

- Daily food diary, calorie totals, and optional protein, carbohydrate, and fat tracking.
- Estimated maintenance calories and an editable daily target.
- Weight, body measurements, water, and progress history.
- Custom foods, reusable meals, and recipes with portion calculations.
- Photo and text meal estimates through a replaceable AI provider.
- Offline manual tracking, local storage, and export/restore.
- An installable personal app with every core feature available for free.

## Documents

- [Product and technical design](docs/DESIGN.md)
- [Milestones and acceptance criteria](docs/ROADMAP.md)
- [Repository setup and development conventions](docs/REPOSITORY.md)
- [Milestone 1 verification](docs/VERIFICATION.md)
- [Milestone 2 verification](docs/VERIFICATION-M2.md)
- [Offline food catalog sources](catalog/README.md)

## Cost approach

Manual tracking and calorie calculations will not require an AI service. Local AI is the preferred route for avoiding per-request API charges, subject to hardware and model evaluation. Hosted providers are optional and may charge for usage even though CalPal itself has no paywall. No paid service has been configured.

## Repository

Connected remote: [yoonalexander/CalPal](https://github.com/yoonalexander/CalPal), verified private. Local `main` tracks `origin/main`.

No personal health records, meal photos, provider credentials, or generated installers belong in Git. See [.gitignore](.gitignore). No open-source license has been selected; public distribution and monetization are future decisions.
