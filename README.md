# CalPal

A personal, minimal calorie and body-metric tracker with recipes and optional AI meal estimates from photos or descriptions.

CalPal takes inspiration from the food diary in MyFitnessPal and photo logging in Cal AI. It will have its own interface and implementation, with no account requirement, ads, subscriptions, or feature paywalls in the personal version.

## Project status

Planning repository. The product design and delivery roadmap are ready for review; application code, AI connections, and an installer have not been built yet.

Windows is the provisional first platform, pending confirmation. The proposed stack is Tauri 2, React, TypeScript, and SQLite. A phone-first choice should be resolved before scaffolding the application.

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

## Cost approach

Manual tracking and calorie calculations will not require an AI service. Local AI is the preferred route for avoiding per-request API charges, subject to hardware and model evaluation. Hosted providers are optional and may charge for usage even though CalPal itself has no paywall. No paid service has been configured.

## Repository

Connected remote: [yoonalexander/CalPal](https://github.com/yoonalexander/CalPal), verified private. Local `main` tracks `origin/main`.

No personal health records, meal photos, provider credentials, or generated installers belong in Git. See [.gitignore](.gitignore). No open-source license has been selected; public distribution and monetization are future decisions.
