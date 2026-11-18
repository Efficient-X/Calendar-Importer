# Installation And Testing

## Community Plugins

Calendar Importer is available in Obsidian's Community Plugins:

1. Open Obsidian.
2. Go to `Settings > Community plugins`.
3. Search for `Calendar Importer`.
4. Install it.
5. Enable it.
6. Open `Settings > Calendar Importer`.
7. Add a calendar feed.
8. Click `Sync now`.

That is the easy path. Calendar in, tasks out.

The same install path is used on Windows, macOS, Linux, iPhone, iPad, and Android. Plugin updates replace the release files and leave your local `data.json` alone, so feed links and preferences survive normal updates.

If you need help finding your calendar link, use the [provider setup guide](provider-guides.md).

If you want daily note views, grab a snippet from [daily note recipes](daily-note-recipes.md).

## Manual Release Install

Use the assets from the [latest release](https://github.com/Efficient-X/Calendar-Importer/releases/latest), rather than GitHub's source-code ZIP.

1. Download these three assets from the same release:
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

Keep existing `data.json` when updating: it contains your feed links and preferences. Do not copy someone else's settings file. Close Obsidian before replacing plugin files, and back up a test vault before trying an unreleased build.

## Local Development Install

This section is for maintainers and testers working from the repository.

Install Node.js 24 LTS and the package-manager version pinned in `package.json` (`pnpm@11.7.0`). Clone the repository, open a terminal in its root, then run:

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
```

Then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\install-calendar-importer.ps1"
```

The installer asks for your vault path, copies the plugin files into the vault, and preserves existing settings where possible. Use a disposable test vault first. You can pass its path explicitly with `-VaultPath "C:\path\to\test-vault"`.

If the installer reports a missing `main.js`, run the build successfully first. The script requires Windows PowerShell; other platforms can copy the three built plugin files into the folder shown above.

The plugin ID and install folder are `calendar-importer`.
