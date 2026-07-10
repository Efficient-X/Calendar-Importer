# Development

This page is for maintainers.

Install dependencies and run the checks:

```bash
pnpm install
pnpm run check
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

The checks include strict TypeScript, the official Obsidian plugin lint rules, and regression tests for parsing calendar feeds, rendering tasks, sorting events, preserving completed tasks, writing notes, reminders, mobile-safe APIs, and settings recovery.
