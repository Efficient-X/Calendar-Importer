# Installation And Testing

## Community Plugins

Once Calendar Importer is accepted into the Obsidian Community Plugins directory:

1. Open Obsidian.
2. Go to `Settings > Community plugins`.
3. Search for `Calendar Importer`.
4. Install the plugin.
5. Enable the plugin.
6. Open `Settings > Calendar Importer`.
7. Add an iCal/ICS feed and run `Preview`.

## Manual Release Install

If you are testing before community approval:

1. Download the release assets:
   - `manifest.json`
   - `main.js`
   - `styles.css`
2. Create this folder in your vault:

```text
<your-vault>/.obsidian/plugins/calendar-importer/
```

3. Copy the three release files into that folder.
4. Restart Obsidian, or reload plugins.
5. Open `Settings > Community plugins`.
6. Enable `Calendar Importer`.

## Local Development Install

Requirements:

- Node.js
- pnpm
- Obsidian desktop

Build and test:

```bash
pnpm install
pnpm run test
pnpm run build
```

Then run the local installer:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\install-calendar-importer.ps1"
```

The installer asks for your Obsidian vault path, copies the built plugin into the vault, and preserves existing plugin settings where possible.

The plugin ID and install folder are `calendar-importer`.
