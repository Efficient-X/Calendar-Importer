# Calendar Importer

<p align="center">
  <img src="assets/calendar-importer.png" alt="Calendar Importer" width="760">
</p>

<p align="center">
  <a href="https://buymeacoffee.com/efficientx">
    <img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-efficientx-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000000" alt="Buy me a coffee">
  </a>
</p>

<p align="center">
  <a href="https://buymeacoffee.com/efficientx">Support Efficient X</a>
  &middot;
  <a href="https://buymeacoffee.com/efficientx/e/555301">Support this plugin directly</a>
</p>

Import iCal/ICS calendar feeds into [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks)-compatible Obsidian tasks.

Calendar Importer reads calendar events from iCal feeds, writes them into an Obsidian note, and keeps that note updated when you sync. It is for people who want appointments, school events, shared calendars, reminders, bills, travel dates, and other scheduled commitments visible inside Obsidian without retyping them by hand.

```markdown
- [ ] Haircut - Friday - 16:00-16:30 📅 2026-08-07 #calendar
- [ ] Rent due - Monday - All day 📅 2026-08-10 #home
- [ ] Reminder: Dentist - Tuesday - 09:00 📅 2026-08-11 #health
```

## Installation

Follow the steps below to install Calendar Importer from Obsidian's community plugins browser.

1. Search for `Calendar Importer` in Obsidian's community plugins browser.
2. Install the plugin.
3. Enable the plugin in Obsidian settings under `Community plugins`.
4. Open `Settings > Calendar Importer`.
5. Add an iCal/ICS calendar feed URL.
6. Click `Preview` to check the imported task output.
7. Click `Sync now`.

If the plugin is not yet visible in Community Plugins, see [manual installation and testing](docs/installation.md).

## Getting Started

### Add a calendar feed

Open the plugin settings, add a feed, and paste a private or published iCal/ICS URL from your calendar provider.

Common sources include:

- <img src="assets/google-calendar.png" width="18" height="18" alt="Google Calendar"> Google Calendar private iCal links
- <img src="assets/microsoft-outlook.png" width="18" height="18" alt="Microsoft Outlook"> Microsoft Outlook and Microsoft 365 published ICS links
- <img src="assets/apple-icloud.png" width="18" height="18" alt="Apple iCloud"> Apple iCloud public calendar links
- <img src="assets/zoho-calendar.png" width="18" height="18" alt="Zoho Calendar"> Zoho Calendar public or private iCal URLs
- Other calendars that publish standard `.ics`, `webcal://`, or iCalendar feed URLs

Private calendar feed URLs should be treated like passwords. Anyone with the URL may be able to read that calendar feed.

### Sync into an Obsidian note

By default, Calendar Importer writes to:

```text
Calendar/My Calendar Events.md
```

The plugin manages only its configured calendar section and preserves content outside that section.

### Show calendar tasks in daily notes

Calendar Importer works especially well with the [Obsidian Tasks plugin](https://github.com/obsidian-tasks-group/obsidian-tasks). Keep imported events in one calendar note, then query them from daily notes, dashboards, weekly reviews, or project notes.

```tasks
not done
due today
path includes Calendar/My Calendar Events
```

For a more focused daily note dashboard:

````markdown
> [!danger]+ Tasks due today
> ```tasks
> not done
> (due today) OR (scheduled today)
> description regex does not match /^$/
> ```
````

````markdown
> [!caution]- Tasks due within 3 days
> ```tasks
> not done
> (due next 3 days AND due - 3 days) OR (scheduled tomorrow)
> description regex does not match /^$/
> ```
````

## Features

- Sync one or more iCal/ICS calendar feeds.
- Render calendar events as Tasks-compatible markdown tasks.
- Preview sync output before writing notes.
- Preserve manually completed tasks.
- Move completed calendar tasks into a completed section.
- Expand recurring events inside a rolling sync window.
- Expand multi-day all-day events into one task per day, or keep them as one task.
- Optionally create reminder tasks from iCal alarms.
- Include locations, descriptions, calendar names, organizers, created dates, and modified dates when feeds provide them.
- Use per-feed colours, tags, source labels, and keyword filters.
- Mask private feed URLs in status and error messages.

## Use Cases

Calendar Importer helps with Obsidian calendar sync, Google Calendar to Obsidian workflows, Outlook calendar import, iCloud calendar import, ICS to markdown, and calendar events as Obsidian Tasks. It is useful for daily notes, dashboards, task planning, family calendars, school calendars, bills, appointments, travel dates, and recurring reminders.

## Documentation

- [Installation and testing](docs/installation.md)
- [Settings overview](docs/settings.md)
- [Commands](docs/commands.md)
- [Privacy and feed URL safety](docs/privacy.md)
- [Tester checklist](docs/testing.md)
- [Development](docs/development.md)
- [Release notes for maintainers](docs/release.md)

## Support

If this plugin saves you time, you can support development through Buy Me a Coffee:

- [Buy Me a Coffee: Efficient X](https://buymeacoffee.com/efficientx)
- [Support this plugin directly](https://buymeacoffee.com/efficientx/e/555301)

<p>
  <img src="assets/efx-logo.png" alt="Efficient X Group" width="96" align="right">
</p>

Built by Efficient X Group.

## License

MIT
