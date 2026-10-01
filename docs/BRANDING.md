# Vitera

Vitera is a personal life-tracking app with a cute monster companion. The name combines `vita`, Latin for life, with a monster-inspired `tera`. Nutrition, water, measurements, recipes and progress are the current foundation; the name leaves room for wider life tracking.

The mascot is the user's pal: warm, curious and encouraging. It should welcome imperfect days and celebrate small actions without guilt, punishment or pressure. The initial mark is a mint-green monster with soft golden horns, blush cheeks and a small smile. It appears in the header, browser icon and Windows app icons. This establishes a visual identity; an interactive pet or progression system is a future feature.

The palette keeps the app's existing forest green (`#35685f`) and off-white (`#f6f8f7`), adding mint (`#b6e5ca`), golden horns (`#f8d99a`), blush (`#efa99a`) and dark facial details (`#244b44`). Existing typography and screen layouts remain in place.

## Rename compatibility

- Product/window name: **Vitera**. Package and executable: `vitera` / `vitera.exe`. The first renamed build is **0.2.1**.
- The Tauri identifier remains `com.yoonalexander.calpal` and the database remains `calpal.sqlite3`. Keeping this internal identity preserves existing diaries, WebView profiles and OS credential references. It is not user-facing branding.
- The Windows installer retains the original registry identity while displaying Vitera. The pinned upstream NSIS template changes only the registration identity. Rename hooks check shortcut targets before replacing old CalPal shortcuts, check the old executable before installation and remove the previous executable after the new one is installed.
- New complete backups and recovery copies use `.vitera` and the `Vitera backup` format label. Restore also accepts schema-compatible `.calpal` files with the original `CalPal backup` label. Old releases cannot read new Vitera backups.
- Developer overrides use `VITERA_*`; existing `CALPAL_*` variables remain aliases. The new name takes precedence when both are set.
- Historical verification reports retain their original names, artifact paths and hashes. Those reports describe the builds actually tested at the time.
- The active checkout folder may retain its old name while Codex is using it. Folder names do not determine the installed app name.

The Windows template is adapted from the [Tauri CLI 2.12.1 template](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.1/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi), used under its [MIT license](../src-tauri/windows/LICENSE-MIT). When upgrading Tauri, review the template against that release before replacing it, preserving `INSTALLIDENTITY`.
