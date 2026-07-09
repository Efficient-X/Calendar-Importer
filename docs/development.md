# Development

This page is for maintainers.

Install dependencies and run the checks:

```bash
pnpm install
pnpm run test
pnpm run build
```

Watch mode while developing:

```bash
pnpm run dev
```

Local vault install:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\install-calendar-importer.ps1"
```

The core behaviour is covered by unit tests: parsing calendar feeds, rendering tasks, sorting events, preserving completed tasks, writing notes, reminders, and settings-driven formatting.
