# Settings Overview

## Quick Actions

`Sync now` runs a real sync immediately.

`Preview next sync` shows what would be written without changing notes.

You can assign a hotkey in Obsidian:

```text
Settings > Hotkeys > Calendar Importer: Sync now
```

## Calendar Feeds

Each feed has:

- Feed name
- iCal URL
- Optional source label
- Colour
- Feed-specific tags
- Include keyword filter
- Exclude keyword filter

## Sync Settings

Choose how far back and forward the plugin imports events.

Default window:

- Past days: `0`
- Future days: `30`

## Note Settings

Choose the note path and heading the plugin manages.

Content outside the configured calendar section is preserved.

## Rendering Settings

Choose how task lines look:

- Due date marker `📅` or scheduled marker `â³`
- Location and description before or after the task date
- Description length limit
- Event creator, created time, and modified time suffixes
- Reminder task creation from iCal alarms
- Global tags for every imported task

## Safety Settings

The plugin can preserve completed tasks and move them into:

```markdown
## Completed Calendar Tasks
```

Completed tasks are sorted newest first. You can keep them forever or trim them after a set number of days.
