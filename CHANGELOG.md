# Changelog

## 1.1.11

- Add a per-calendar `Linked note folder` setting for event title wikilinks.
- Render foldered links like `[[Calendar Events/Work/260817 - Weekly review|Weekly review]]`.
- Create configured linked-note folders during sync so users do not need to prepare folders manually.
- Normalize typed folder paths so backslashes, extra slashes, and surrounding spaces behave sensibly.
- Add regression tests for foldered wikilink rendering, settings recovery, and sync-time folder creation.

## 1.1.10

- Improve the in-app wikilink display description with direct and alias examples.
- Expand the README examples to show plain tasks, reminder tasks, direct wikilinks, dated wikilinks, and dated alias wikilinks.
- Add a clearer settings documentation section for event title links.

## 1.1.9

- Add per-calendar event title wikilinks, off by default.
- Support dated note titles with a configurable Luxon prefix, defaulting to `yyMMdd - `.
- Support direct links like `[[260717 - Code Camp]]` and prettier alias links like `[[260717 - Code Camp|Code Camp]]`.
- Sanitize generated note titles so calendar punctuation does not create awkward or invalid note links.
- Keep completed-task matching stable when wikilinks are enabled, so checked calendar events do not reappear just because the title rendering changed.

## 1.1.8

- Add a `Calendar task layout` setting with two modes: Classic and Chronological.
- Keep Classic as the default so checked tasks still move to `## Completed Calendar Tasks`.
- Add Chronological mode for one-heading calendars where events stay in date order and checked tasks can be unticked again later.
- Keep Chronological mode on the existing rolling past/future sync window; enduring history is being left for a separate, more deliberate release.
- Add regression tests for checked, unchecked, and Classic-to-Chronological migration behaviour.

## 1.1.7

- Stop completed calendar events from reappearing when the Tasks plugin moves source tags before the due-date marker on checked tasks.
- Match completed and active calendar tasks by their stable task text while ignoring source tag order, so `#Calendar 📅 2026-07-11` and `📅 2026-07-11 #Calendar` are treated as the same event.
- Add regression tests using the exact completed-task shape seen in live vault testing.

## 1.1.6

- Give Obsidian and Tasks checkbox updates a short moment to settle before Calendar Importer reads and rebuilds the calendar note.
- Save all open markdown views before syncing, so checked events updated from daily-note queries or other rendered views can reach the source note first.
- Keep the final target-note save immediately before processing as a second guard against stale editor content.

## 1.1.5

- Save the open calendar note before syncing so freshly checked tasks are moved to `## Completed Calendar Tasks` instead of being overwritten by the next feed rebuild.
- Make the sync cycle follow the four-step flow explicitly: move checked tasks, cache downloaded events, remove completed matches from that cache, then rebuild the active section.
- Add a regression test for the real Obsidian timing case where a checkbox is changed in an open note before the editor's debounced save has reached the vault file.

## 1.1.4

- Stop writing hidden calendar event markers into task lines so Obsidian no longer shows green source-code comments beside imported events.
- Clean legacy `calendar-importer:event` comments from active and completed task lines during the next sync.
- Keep completed-task protection for normal checked-task syncs through task identity and sync cache matching.

## 1.1.3

- fixed a bug where completed tasks were not moved to the completed task section while syncing.

- Move checked tasks into `## Completed Calendar Tasks` before rebuilding the active section.
- Cache the live calendar feed in memory, remove matching completed events, and rebuild `## My Calendar Events` from only the remaining entries.
- Add an invisible stable event ID to every managed task, including tasks without a colour swatch, so formatting changes cannot make completed events reappear.
- Keep compatibility with legacy task formatting while old notes transition to stable IDs.

## 1.1.1

Completed section placement fix.

- Always place `## Completed Calendar Tasks` after the active calendar section at the bottom of the managed note.
- Repair notes containing duplicate `## My Calendar Events` or completed headings during the next sync.
- Preserve tasks found under duplicate managed headings while the note is repaired.

## 1.1.0

Reliability and cross-platform hardening release.

- Stop safely before changing notes when any enabled feed fails to download or parse, and keep the last good tasks when the network is flaky.
- Update notes through Obsidian's atomic `Vault.process()` API so edits made during a sync are not silently overwritten.
- Keep daily-note sync caches isolated by note instead of replacing one note's completion history with another's.
- Preserve all-day calendar dates in every timezone, including regions west of UTC, and respect iCalendar's exclusive event end boundary.
- Handle recurring events that begin before the sync window but still overlap it.
- Deduplicate provider revisions by sequence and modification time, and generate stable fallback IDs when a malformed event omits `UID`.
- Support `RELATED=END` and repeating iCalendar alarms, legacy quoted-printable character sets, Apple calendar-level colours, alpha-suffixed Apple hex colours, and modern iCalendar extension properties.
- Redact private calendar URLs embedded inside network errors and reject feeds above a 25 MB parsing safety limit.
- Recover safely from malformed or partially corrupted `data.json` values, duplicate feed IDs, invalid timezones, and conflicting headings.
- Debounce settings-triggered syncs, serialize settings saves, defer startup sync until the workspace is ready, and avoid unnecessary or colliding backups.
- Add `Open calendar note` to the command palette and basic settings actions.
- Remove the leftover preview path and a non-functional debug toggle so retired features cannot drift back into the plugin.
- Lower the minimum compatible Obsidian version from 1.13.0 to 1.7.2 after API validation, restoring Community Plugins installs and updates on current desktop and mobile builds.
- Add strict TypeScript, official Obsidian plugin linting, release metadata validation, dependency auditing, pinned GitHub Actions, private security reporting, and 76 regression tests.
- Remove unused production and development dependencies.

## 1.0.16

Apple structured location fallback.

- Use the `X-TITLE` value from Apple `X-APPLE-STRUCTURED-LOCATION` fields when an iCloud event does not provide a plain `LOCATION`.
- Keep plain `LOCATION` as the preferred value when it exists.
- Add a regression test for iCloud-style structured location titles.

## 1.0.15

HTML invite description fallback.

- Use `X-ALT-DESC` as the event description when an Outlook, Exchange, or similar feed provides HTML notes but no plain `DESCRIPTION`.
- Keep the existing renderer cleanup path, so imported HTML-only notes become readable task text instead of raw markup.
- Add a regression test for HTML-only alternate descriptions.

## 1.0.14

Recurring exception hardening and README polish.

- Skip cancelled recurring instances even when provider cancellation exceptions omit `DTSTART` and `DTEND`.
- Add regression tests for `EXDATE`, cancelled recurring exceptions, and `RANGE=THISANDFUTURE` recurrence changes.
- Update the README to describe Calendar Importer as a lightweight background plugin.
- Remove the obsolete testing-install note from Community Plugins instructions.
- Use Community-Plugins-safe absolute documentation links in the README.

## 1.0.13

Bad-event isolation release.

- Skip individual events that fail date/time normalization instead of failing the whole feed.
- If a feed cannot be parsed as one calendar, retry by parsing each `VEVENT` inside the original calendar context.
- Report skipped events by UID and summary where available, so support conversations have something useful to point at.
- Add regression tests for one impossible-date event and one unrecoverable raw-line event among otherwise valid events.

## 1.0.12

Provider compatibility sweep.

- Use `X-WR-TIMEZONE` as the fallback timezone for floating event times, which helps Google, Zoho, and other feeds that publish calendar-level timezone metadata.
- Map common Microsoft/Windows timezone names to IANA timezones when a feed omits a usable `VTIMEZONE`.
- Repair unquoted Microsoft `TZID=tzone://Microsoft/Custom` date parameters before strict iCalendar parsing.
- Add regression tests for floating calendar timezones, Microsoft Windows timezone names, and Microsoft custom timezone URI parameters.

## 1.0.11

Multiline calendar text repair release.

- Repair malformed raw multiline `DESCRIPTION`, `LOCATION`, and similar text fields by converting stray physical lines into proper iCalendar `\n` text escapes before parsing.
- Keep colon-looking text such as `Notes: ...` or `Address: ...` inside the preceding description instead of letting it become a stray fake property.
- Decode old quoted-printable multiline descriptions from older Outlook/Exchange-style feeds.
- Preserve valid iCalendar folded lines as folded text, so standards-compliant feeds keep their existing behaviour.
- Add regression tests for iPhone/iCloud-style multiline addresses, malformed multiline descriptions, quoted-printable descriptions, and valid folded locations.

## 1.0.10

Release workflow polish.

- Carry forward the red-team hardening fixes from 1.0.8 and 1.0.9.
- Make the release verifier use an OS-neutral temp path so the GitHub Linux runner can verify release assets cleanly.

## 1.0.9

Red-team hardening follow-up.

- Carry forward the 1.0.8 hardening fixes for feed URL validation, safe calendar text rendering, old recurrence handling, and nested folder creation.
- Add retries to the release verifier so GitHub release asset propagation does not mark a healthy release as failed.

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
