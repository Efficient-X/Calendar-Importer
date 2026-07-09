# Development

Clone the repository, install dependencies, and run the build or test commands.

```bash
pnpm install
pnpm run test
pnpm run build
```

For watch mode during plugin development:

```bash
pnpm run dev
```

The parser, renderer, sorter, settings-sensitive task formatting, reminder generation, completion handling, and note writer are covered by unit tests.

For local Obsidian testing, build the plugin and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\install-calendar-importer.ps1"
```
