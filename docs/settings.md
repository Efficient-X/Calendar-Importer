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
- Optional wikilinks for event titles

You can have one calendar or several. Work, family, bills, school, travel, the lot.

### Event Title Links

Turn this on for a feed when you want calendar events to become clickable Obsidian links.

Calendar Importer can keep things plain:

```markdown
- [ ] Weekly review - Friday - 16:00-16:30 📅 2026-08-07 #calendar
```

Or it can turn the event title into a note link:

```markdown
- [ ] [[Project planning]] - Wednesday - 10:00-11:00 📅 2026-08-12 #work
```

With the default date prefix, repeated event names get their own note targets:

```markdown
- [ ] [[260814 - Book club]] - Friday - 18:30-20:00 📅 2026-08-14 #personal
```

The prettiest option is the alias style:

```markdown
- [ ] [[260817 - Weekly review|Weekly review]] - Monday - 09:00-09:30 📅 2026-08-17 #calendar
```

That displays as `Weekly review`, but links to the dated note title `260817 - Weekly review`. Neat little Obsidian trick.

By default, Calendar Importer also organises linked event notes under `Calendar/Calendar Events`, with a separate folder for each calendar feed:

```markdown
- [ ] [[Calendar/Calendar Events/Work/260817 - Weekly review|Weekly review]] - Monday - 09:00-09:30 📅 2026-08-17 #calendar
```

Folder choices are per calendar:

- `Separate folder for this calendar` keeps each feed in its own folder under the base folder.
- `All events in one folder` puts every linked note from that feed directly under the base folder.
- `Custom folder` uses your own path.
- `Let Obsidian decide` removes the folder path from the wikilink, so Obsidian uses its normal new-note behaviour.

Calendar Importer creates configured folders during sync. Work can stay with work, school can stay with school, and your vault root can stop looking like a junk drawer.

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

If you tick the wrong thing, use `Reopen completed from last 24 hours` to put recent completed tasks back in the live list. `Reopen all completed` does the same for everything Calendar Importer can see in the current sync range.

`Clear completed` removes completed calendar tasks from the managed note and clears their completion memory. Use it when you want to tidy the done pile, not when you want to undo a single accidental tick.

Sync cache retention keeps old cache entries from building up forever. The default is 365 days. Set it to `0` if you want Calendar Importer to keep the full historical cache.

### Debug

Debug is for troubleshooting. Most people can leave it closed and enjoy a peaceful life.

If any feed fails to download or parse, Calendar Importer stops before changing notes. A flaky connection should be mildly annoying, not an excuse for your existing calendar tasks to vanish.
