# Changelog

## 1.0.8

Red-team hardening release.

- Reject unsupported feed URL schemes before Obsidian's network layer sees them, with friendlier errors for `file://`, `ftp://`, malformed links, and other non-calendar feed URLs.
- Escape imported calendar text before rendering task lines so event titles, locations, UIDs, and source names cannot become live HTML in notes.
- Let old daily recurring calendars reach the active sync window before hitting the recurrence safety cap.
- Create nested destination folders through Obsidian's Vault API instead of the lower-level adapter.
- Verify release assets automatically after GitHub publishes a release.
- Update vulnerable development/test tooling.

## 1.0.7

iCloud legacy event repair release.

- Repair malformed Apple/iCloud text lines where an address or description line appears without the required iCalendar token separator.
- Prevent one old malformed event, including events outside the configured date window, from blocking the whole feed parse.
- Add regression tests for a 2016 iCloud address line breaking an otherwise valid current sync.
- Populate future GitHub release descriptions automatically from the matching changelog section.

## 1.0.6

Apple webcal compatibility release.

- Accept `webcal://` and `webcals://` calendar feed links by fetching them over HTTPS.
- Update the feed URL placeholder and provider docs so iCloud users can paste Apple subscription links directly.
- Add tests for webcal feed URL handling.

## 1.0.5

Settings simplification release.

- Remove the Preview next sync button and command.
- Remove Preview from the first-run checklist and user docs.
- Replace fragile emoji text in the scheduled-date setting with plain wording.
- Repair legacy symbol cleanup with Unicode code points so source encoding cannot mangle the markers.

## 1.0.4

Onboarding and reach release.

- Add a first-run checklist to the settings page.
- Keep everyday controls visible and move advanced sync, rendering, safety, and debug controls behind an Advanced fold-out.
- Replace the colour dropdown with clickable colour chips.
- Add provider setup documentation for Google Calendar, Outlook/Microsoft 365, iCloud, Zoho, and other iCal/ICS feeds.
- Add daily note recipe documentation with ready-to-paste Tasks queries.
- Link the new guides from the README and installation docs.

## 1.0.3

Settings compatibility release.

- Keep destructive button styling compatible with older Obsidian installs so the full settings page can render.

## 1.0.2

Review cleanup release.

- Use Obsidian's configured vault config folder when checking for legacy local settings.
- Remove the square prefix from colour dropdown options while keeping the visual colour palette.
- Align README and metadata copy with the Community Plugins submission wording.

## 1.0.1

Copy polish release.

- Make the README and user documentation simpler, warmer, and easier to follow.
- Update the plugin description to be clearer for the Community Plugins listing.

## 1.0.0

Initial Calendar Importer community release.

- Import one or more iCal/ICS calendar feeds into Obsidian.
- Render calendar events as Tasks-compatible markdown tasks.
- Add friendlier README and documentation for first-time users.
- Support Google Calendar, Outlook/Microsoft 365, iCloud, Zoho, and other standard iCal/ICS feeds where readable feed URLs are available.
- Add feed colours, feed tags, source labels, and keyword filters.
- Support rolling sync windows with configurable past and future days.
- Expand recurring events and multi-day all-day events.
- Optionally create reminder tasks from iCal alarms.
- Include locations, descriptions, organizer, created time, and last modified time when feeds provide them.
- Preserve manually completed tasks and move completed calendar tasks into a completed section.
- Mask private feed URLs in status and error messages.
- Include a migration path from earlier local testing builds where settings are still present.
