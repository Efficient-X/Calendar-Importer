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

Bring external calendar events into your task notes without retyping them.

Calendar Importer turns Google Calendar, Outlook, iCloud, Zoho, and other iCal/ICS calendar feeds into clean markdown tasks.

Using a shared calendar with someone who has not yet found the warm glow of Obsidian? Let them keep adding events in their calendar app while Calendar Importer quietly brings those dates into your vault. Boom!

Less double entry, and more Obsidian time for you. How good!

```markdown
- [ ] Haircut - Friday - 16:00-16:30 2026-08-07 #calendar
- [ ] Rent due - Monday - All day 2026-08-10 #home
- [ ] Reminder: Dentist - Tuesday - 09:00 2026-08-11 #health
```

## Installation

Once Calendar Importer is available in Community Plugins:

1. Search for `Calendar Importer`.
2. Install it.
3. Enable it.
4. Open `Settings > Calendar Importer`.
5. Paste a calendar feed link.
6. Click `Preview`.
7. Click `Sync now`.

That is the whole dance.

If the plugin is not yet visible in Community Plugins, see [installation and testing](docs/installation.md).

## Getting Started

### Add a calendar

Open the plugin settings, add a feed, and paste a private or published calendar link.

Common sources include:

- <img src="assets/google-calendar.png" width="18" height="18" alt="Google Calendar"> Google Calendar private iCal links
- <img src="assets/microsoft-outlook.png" width="18" height="18" alt="Microsoft Outlook"> Microsoft Outlook and Microsoft 365 published ICS links
- <img src="assets/apple-icloud.png" width="18" height="18" alt="Apple iCloud"> Apple iCloud public calendar links
- <img src="assets/zoho-calendar.png" width="18" height="18" alt="Zoho Calendar"> Zoho Calendar public or private iCal URLs
- Other calendars that publish `.ics`, `webcal://`, or iCalendar feed URLs

Private calendar links can expose your calendar, so treat them like passwords.

### Choose where tasks go

By default, Calendar Importer writes to:

```text
Calendar/My Calendar Events.md
```

The plugin only manages its own calendar section. Your notes outside that section are left alone.

### Use daily notes

Calendar Importer pairs beautifully with the [Tasks plugin](https://github.com/obsidian-tasks-group/obsidian-tasks). Keep all imported events in one calendar note, then pull today, tomorrow, or this week into your daily notes.

```tasks
not done
due today
path includes Calendar/My Calendar Events
```

A more focused daily note setup:

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

## What It Does

- Imports one or more calendar feeds.
- Writes events as markdown tasks.
- Lets you preview before changing notes.
- Keeps completed imported tasks completed.
- Moves completed calendar tasks into a completed section if you want.
- Handles recurring events, all-day events, and multi-day events.
- Can add colours, tags, source labels, locations, descriptions, and reminders.
- Hides private feed URLs from ordinary status and error messages.

## Why People Use It

Calendar Importer helps with calendar sync, Google Calendar to Obsidian workflows, Outlook calendar import, iCloud calendar import, ICS to markdown, daily notes, dashboards, school calendars, family calendars, bills, appointments, travel dates, and recurring reminders.

Or, said less like a search engine: it gets your calendar commitments into the place you actually plan your day.

## Documentation

- [Installation and testing](docs/installation.md)
- [Settings overview](docs/settings.md)
- [Commands](docs/commands.md)
- [Privacy and feed URL safety](docs/privacy.md)
- [Tester checklist](docs/testing.md)
- [Development](docs/development.md)
- [Release notes for maintainers](docs/release.md)

## Support

If Calendar Importer saves you a few clicks, a coffee is always appreciated:

- [Buy Me a Coffee: Efficient X](https://buymeacoffee.com/efficientx)
- [Support this plugin directly](https://buymeacoffee.com/efficientx/e/555301)

<p>
  <img src="assets/efx-logo.png" alt="Efficient X Group" width="96" align="right">
</p>

Built by Efficient X Group.

## License

MIT
