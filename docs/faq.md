# FAQ

## Can Calendar Importer upload tasks from Obsidian to my calendar?

No. Calendar Importer is intentionally one-way: calendar to Obsidian.

The reliable workflow is:

1. Add or edit the event in Google Calendar, Outlook, iCloud, Zoho, or your calendar app of choice.
2. Sync Calendar Importer.
3. See that event appear in Obsidian as a task.

That gives you the same practical outcome as adding the event in Obsidian first, but avoids a much messier problem.

## Why not sync from Obsidian back to the calendar?

Because Obsidian notes are wonderfully flexible, and calendars are wonderfully strict.

People write tasks in wildly different ways:

- `Dentist Tuesday`
- `Call Sam after school pickup`
- `Flight 8pm maybe check bags`
- `Dad appointment? ask Mum`
- `Pay rego before Friday`

A calendar app needs clean structured data: exact start time, end time, timezone, recurrence rules, reminders, location, title, description, and sometimes attendee details. Guessing all of that from free-form notes would either require a lot of brittle parsing, a lot of AI interpretation, or a lot of confirmation prompts. That is a big pile of complexity for something that is usually easier to do directly in the calendar.

The design choice here is simple: let calendar apps do calendar things, then let Obsidian become the place where those commitments are visible while you plan your day.

## What about shared calendars?

This is where the one-way approach shines.

If you share a calendar with someone who has not yet found the warm glow of Obsidian, they can keep using their normal calendar app. When they add or move an event, Calendar Importer can bring that change into your vault on the next sync.

No training session. No new workflow for them. No awkward family meeting about markdown.

## What about calendar colours?

Calendar apps can show events in lovely colours, but those colours are not always exported through iCal/ICS feeds. Some providers include useful colour data. Others do not.

Calendar Importer gives you fallback feed colours in the plugin settings, so your imported tasks can still have a visual cue in Obsidian.

If Obsidian-to-calendar sync existed, many calendar apps would still receive bland events unless their own APIs were handled one by one. That is another reason Calendar Importer keeps the job focused and reliable.

## So what is the recommended workflow?

Use your calendar app as the source of truth for calendar events.

Use Obsidian as the place where those events become visible beside your notes, tasks, daily plans, dashboards, and reviews.

Calendar first. Obsidian everywhere after that. Nice and calm.

## Does Calendar Importer sync while Obsidian is closed?

No. It works quietly in the background while Obsidian is open, including on mobile when the app is active. iOS and Android can suspend apps in the background, so they do not promise desktop-style clockwork after Obsidian has been closed or parked for a while.

Turn on `Sync on startup` if you want a fresh calendar whenever you open Obsidian. You can also use `Sync now` when you want certainty immediately.

## What happens if one calendar feed is temporarily broken?

Calendar Importer leaves your active calendar tasks exactly as they were. When Error Reporting is enabled, it adds a short report to the bottom of the calendar note as well as showing an Obsidian notice with the first safe error message.

For a malformed individual event, Calendar Importer keeps importing the other valid events and lists the troublesome one in Error Reporting. That way one odd calendar entry does not hold the whole party hostage.

Fix the link, connection, or setting behind the report, run `Sync now`, and off you go.
