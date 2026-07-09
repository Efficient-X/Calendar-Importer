# Changelog

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
