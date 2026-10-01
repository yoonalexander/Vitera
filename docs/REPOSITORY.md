# Repository setup

## Scope and state

This repository begins with documentation and Git configuration. No application scaffold, package dependencies, paid services, AI credentials, or installer are included.

The first application milestone chooses the platform before adding runtime files. Proposed Windows stack: Tauri 2, React, TypeScript, and SQLite. Toolchain versions and compatible plugins must be checked during scaffolding.

## Git conventions

- Default branch: `main`.
- Connected origin: `https://github.com/yoonalexander/CalPal.git`.
- Verified visibility: private, appropriate for the initial personal project.
- Use focused commits. Do not rewrite or discard intentional local work.
- Commit code, documentation, and reproducible dependency locks; exclude generated output and personal records.

Check the live connection with:

```powershell
git status --short --branch
git remote -v
git log -1 --oneline
```

GitHub creation and the initial push were verified on 2026-09-30. Local `main` tracks `origin/main`; the initial local commit matched the remote branch. Recheck live state with Git when continuing work.

## Future layout

The following is a proposed structure, not directories or modules already implemented:

```text
src/
  features/       # diary, recipes, metrics, settings
  domain/         # portable nutrition and target calculations
  components/     # shared UI
src-tauri/
  src/            # storage, file handling, secrets, provider requests
  migrations/     # ordered SQLite schema migrations
tests/            # meaningful calculation and integration coverage
docs/             # product design, roadmap, setup notes
```

Food catalogs and test fixtures must carry provenance and use synthetic or permitted sample records. Store application data in the platform app-data directory, separate from the source checkout.

## Development and verification

Before implementation, read [DESIGN.md](DESIGN.md) and the requested milestone in [ROADMAP.md](ROADMAP.md). Keep product defaults free, offline-capable, and independent of AI setup.

On Windows, use `npm.cmd` for future Node scripts. Do not invent runnable commands before their scripts exist. The Tauri route will require the platform prerequisites described in the [official prerequisites guide](https://v2.tauri.app/start/prerequisites/), including Rust and Windows build tooling.

Add appropriate formatting, type checking, unit tests for calculations, integration tests for storage, and CI after the runtime stack exists. A documentation-only repository does not need pretend build workflows or application tests.

Report checks distinctly: document verification, unit/integration checks, live-provider evaluation, runtime use, and installer testing. Passing one does not establish the others.

## Secrets and personal data

Never commit real profile values, diaries, metric records, photos, exports, backups, API keys, signing keys, or model weights. `.gitignore` covers common paths and formats, but review staged files because ignore rules do not classify every possible personal file.

Provider keys will use native OS credential storage. Any future `.env.example` must contain placeholders only, with each field documented; the packaged frontend must never receive a secret through a public build variable.

No public/open-source license is selected. Revisit licensing if the owner decides to publish or distribute the project beyond personal use.
