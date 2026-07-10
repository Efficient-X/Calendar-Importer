# Settings Overview

Most people only need the Basic area:

1. Add a calendar feed.
2. Choose the note where imported tasks should live.
3. Click `Sync now`.

Advanced controls are folded away until you want more control. They are there for people who enjoy knobs, dials, and reading the manual on purpose.

## First Run Checklist

The settings page shows a quick checklist:

1. Add a calendar feed link.
2. Run `Sync now`.
3. Open your calendar note.

Once all three are done, you are basically operating a tiny calendar conveyor belt. Nice.

## Quick Actions

`Sync now` updates your calendar note immediately.

`Open calendar note` takes you straight to the destination note without making you hunt through folders.

Handy tip: bind `Calendar Importer: Sync now` to a hotkey if you use it often.

## Calendar Feeds

Each calendar feed can have:

- A friendly name
- A calendar URL
- A colour
- A source label
- Optional tags
- Optional include or exclude keywords

You can have one calendar or several. Work, family, bills, school, travel, the lot.

## Destination Note

Choose the note and heading Calendar Importer manages.

Content outside that calendar section is preserved, so you can keep your own notes around it.

## Advanced Controls

Open this when you want to tune the machinery.

### Sync

Choose how far back and forward Calendar Importer should look.

Default:

- Past days: `0`
- Future days: `30`

That keeps your notes focused on what is coming up.

### Rendering

Choose how imported tasks look:

- Due dates or scheduled dates
- Locations and descriptions
- Calendar names
- Reminder tasks
- Global tags
- Colour swatches

If you are not sure, leave the defaults alone. They are designed to be tidy out of the box.

### Safety

Calendar Importer can preserve completed imported tasks and move them into:

```markdown
## Completed Calendar Tasks
```

You can keep completed tasks forever or trim them after a set number of days.

### Debug

Debug is for troubleshooting. Most people can leave it closed and enjoy a peaceful life.

If any feed fails to download or parse, Calendar Importer stops before changing notes. A flaky connection should be mildly annoying, not an excuse for your existing calendar tasks to vanish.
