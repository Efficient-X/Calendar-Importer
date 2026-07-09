# Installation And Testing

## Community Plugins

Once Calendar Importer is available in Obsidian's Community Plugins:

1. Open Obsidian.
2. Go to `Settings > Community plugins`.
3. Search for `Calendar Importer`.
4. Install it.
5. Enable it.
6. Open `Settings > Calendar Importer`.
7. Add a calendar feed.
8. Click `Sync now`.

That is the easy path. Calendar in, tasks out.

If you need help finding your calendar link, use the [provider setup guide](provider-guides.md).

If you want daily note views, grab a snippet from [daily note recipes](daily-note-recipes.md).

## Manual Release Install

Use this while the plugin is still being tested.

1. Download these release files:
   - `manifest.json`
   - `main.js`
   - `styles.css`
2. Create this folder in your vault:

```text
<your-vault>/.obsidian/plugins/calendar-importer/
```

3. Copy the three files into that folder.
4. Restart Obsidian, or reload community plugins.
5. Open `Settings > Community plugins`.
6. Enable `Calendar Importer`.

## Local Development Install

This section is for maintainers and testers working from the repository.

```bash
pnpm install
pnpm run test
pnpm run build
```

Then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\install-calendar-importer.ps1"
```

The installer asks for your vault path, copies the plugin files into the vault, and preserves existing settings where possible.

The plugin ID and install folder are `calendar-importer`.
