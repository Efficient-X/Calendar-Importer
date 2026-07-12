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

Calendar Importer is a lightweight background plugin that turns Google Calendar, Outlook, iCloud, Zoho, and other iCal/ICS calendar feeds into clean markdown tasks.

Using a shared calendar with someone who has not yet found the warm glow of Obsidian? Let them keep adding events in their calendar app while Calendar Importer quietly brings those dates into your vault. Boom!

Less double entry, and more Obsidian time for you. How good!

Your calendar events can be turned into basic text tasks or wikilinked notes. Your call. Tiny switch, big "oh that's handy" energy.

```markdown
- [ ] Weekly review - Friday - 16:00-16:30 📅 2026-08-07 #calendar
- [ ] Reminder: Dentist - Tuesday - 09:00 📅 2026-08-11 #health
- [ ] [[Project planning]] - Wednesday - 10:00-11:00 📅 2026-08-12 #work
- [ ] [[Calendar/Calendar Events/Personal/260814 - Book club]] - Friday - 18:30-20:00 📅 2026-08-14 #personal
- [ ] [[Calendar/Calendar Events/Work/260817 - Weekly review|Weekly review]] - Monday - 09:00-09:30 📅 2026-08-17 #calendar
```

## Installation

In Obsidian:

1. Search for `Calendar Importer`.
2. Install it.
3. Enable it.
4. Open `Settings > Calendar Importer`.
5. Paste a calendar feed link.
6. Click `Sync now`.

That's the whole dance.

## Getting Started

### Add a calendar

Open the plugin settings, add a feed, and paste a private or published calendar link.

Common sources include:

- <img src="assets/google-calendar.png" width="18" height="18" alt="Google Calendar"> Google Calendar private iCal links
- <img src="assets/microsoft-outlook.png" width="18" height="18" alt="Microsoft Outlook"> Microsoft Outlook and Microsoft 365 published ICS links
- <img src="assets/apple-icloud.png" width="18" height="18" alt="Apple iCloud"> Apple iCloud public calendar links
- <img src="assets/zoho-calendar.png" width="18" height="18" alt="Zoho Calendar"> Zoho Calendar public or private iCal URLs
- Other calendars that publish direct `.ics`, `webcal://`, or iCalendar feed URLs

Private calendar links can expose your calendar, so treat them like passwords.

Apple `webcal://` links are fine. Paste them in and Calendar Importer will do the boring protocol translation for you.

The tiny compatibility rule: if the link opens to real iCalendar text, Calendar Importer can work with it. If the link needs a login page, OAuth, CalDAV account setup, cookies, or an HTML calendar page, that is a different animal.

Need the link? The [provider setup guide](https://github.com/Efficient-X/Calendar-Importer/blob/main/docs/provider-guides.md) walks through Google Calendar, Outlook, iCloud, and Zoho without making you feel like you accidentally joined a networking course.

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
happens on today
path includes Calendar/My Calendar Events
sort by happens
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

Want more ready-to-paste snippets? See [daily note recipes](https://github.com/Efficient-X/Calendar-Importer/blob/main/docs/daily-note-recipes.md).

````markdown
> [!caution]- Tasks due within 3 days
> ```tasks
> not done
> (due next 3 days AND due - 3 days) OR (scheduled tomorrow)
> description regex does not match /^$/
> ```
````

## What It Does

- Imports one or more calendar feeds into Obsidian.
- Writes events as markdown tasks.
- Keeps completed imported tasks completed.
- Moves completed calendar tasks into a completed section if you want.
- Can turn event titles into wikilinks, including links to per-calendar note folders.
- Handles recurring events, all-day events, and multi-day events.
- Can add colours, tags, source labels, locations, descriptions, and reminders.
- Hides private feed URLs from ordinary status and error messages.

Supported feed types: `https://`, `http://`, `webcal://`, and `webcals://` links that return iCalendar/ICS content.

## What It Does Not Do

Calendar Importer does not upload tasks from Obsidian back into Google Calendar, Outlook, iCloud, or other calendar apps.

It also does not sign in to calendar accounts, connect to CalDAV servers, or scrape calendar web pages. It wants the feed link. Give it the feed link and it is happy.

That is deliberate. Turning free-form notes into calendar events gets messy fast: everyone writes dates, times, titles, locations, repeats, reminders, and half-ideas differently. Calendar apps expect a strict format, and getting that wrong creates calendar chaos. The simpler, sturdier workflow is to add events to your calendar first, then let Calendar Importer bring them into Obsidian.

Same effort, less drama.

It also works better for shared calendars. If someone else adds, moves, or cancels an event, your vault can pick it up on the next sync even if they have never opened Obsidian in their life.

## Why People Use It

Calendar Importer helps with calendar sync, Google Calendar to Obsidian workflows, Outlook calendar import, iCloud calendar import, ICS to markdown, daily notes, dashboards, school calendars, family calendars, bills, appointments, travel dates, and recurring reminders.

Or, when said less like a search engine: it gets your calendar commitments into the place you actually plan your day.

## Documentation

- [Installation and testing](https://github.com/Efficient-X/Calendar-Importer/blob/main/docs/installation.md)
- [Provider setup guide](https://github.com/Efficient-X/Calendar-Importer/blob/main/docs/provider-guides.md)
- [Daily note recipes](https://github.com/Efficient-X/Calendar-Importer/blob/main/docs/daily-note-recipes.md)
- [Settings overview](https://github.com/Efficient-X/Calendar-Importer/blob/main/docs/settings.md)
- [Commands](https://github.com/Efficient-X/Calendar-Importer/blob/main/docs/commands.md)
- [FAQ](https://github.com/Efficient-X/Calendar-Importer/blob/main/docs/faq.md)
- [Privacy and feed URL safety](https://github.com/Efficient-X/Calendar-Importer/blob/main/docs/privacy.md)
- [Security reporting](https://github.com/Efficient-X/Calendar-Importer/blob/main/SECURITY.md)
- [Tester checklist](https://github.com/Efficient-X/Calendar-Importer/blob/main/docs/testing.md)
- [Development](https://github.com/Efficient-X/Calendar-Importer/blob/main/docs/development.md)
- [Release notes for maintainers](https://github.com/Efficient-X/Calendar-Importer/blob/main/docs/release.md)

## Support

If Calendar Importer saves you a few clicks, a coffee is always appreciated:

- [Buy Me a Coffee: Efficient X](https://buymeacoffee.com/efficientx)
- [Support this plugin directly](https://buymeacoffee.com/efficientx/e/555301)

Built by Efficient X Group.

<p align="right" style="margin: 0 0 8px 0;">
  <img src="assets/efx-logo.png" alt="Efficient X Group" width="96">
</p>

## License

MIT
