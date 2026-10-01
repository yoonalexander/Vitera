# Custom color palettes

Open **Settings → Color palette** to customize Vitera. Light and dark appearance have independent palettes. **Appearance** still chooses Light, Dark or System; System follows Windows and switches to the corresponding saved colors when the system appearance changes.

Start with Forest, Ocean, Plum, Ember or Slate, or edit any of the twelve colors using its picker or hex input. You can customize backgrounds, cards/dialogs, the header, highlights, borders, main/secondary/header text, accent/buttons, button text and error text/background. Hex inputs accept three or six RGB digits, with or without `#`, and normalize to `#RRGGBB` when you leave the field or save.

The sample preview updates immediately. **Preview across app** temporarily applies the palette being edited to the app behind the page. **Save palette** saves both palettes locally and returns to your normal Appearance setting. Cancel, Escape or the close button discards changes and restores the saved appearance. **Reset light colors** or **Reset dark colors** resets only the palette being edited; save to keep the reset, or cancel to undo it.

Text contrast checks use sRGB relative luminance and show a 4.5:1 target for normal text. Low contrast is a warning, not a restriction: you can save any valid RGB colors. The palette editor keeps its own neutral colors, so white-on-white or other hard-to-read choices cannot hide its controls. All starter palettes pass the listed text contrast checks; customized palettes may not.

Palettes persist in SQLite across restarts and upgrades and are included in complete backups. No network request or account is involved. Version 0.2.2 upgrades the database to schema 6 and writes version 2 backups. Original version 1/schema 5 Vitera and CalPal backups remain restorable and use default palettes after import. Earlier app builds cannot open schema 6 or restore version 2 backups; keep an older complete backup if you need to return to an earlier build.
