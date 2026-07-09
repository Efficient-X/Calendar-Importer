# Provider Setup Guide

Calendar Importer needs a calendar feed link. Most services call it an iCal, ICS, published, public, private, or subscription link. Same soup, different bowl.

Keep private calendar links private. Anyone with the link may be able to read that calendar.

## Compatibility Rule

Calendar Importer can read direct iCalendar feeds over:

- `https://`
- `http://`
- `webcal://`
- `webcals://`

The feed must return real iCalendar/ICS content, usually text containing `BEGIN:VCALENDAR`.

Calendar Importer does not sign in to calendar accounts, connect to CalDAV servers, use OAuth, keep browser cookies, import local one-off `.ics` files, or scrape HTML calendar pages. Tiny plugin, tidy job description.

## Provider Confidence

| Provider | Supported? | What you need | Caveat |
| --- | --- | --- | --- |
| Google Calendar | Yes | Secret or public iCal link | Workspace admins can hide or disable secret iCal links. |
| Outlook / Microsoft 365 | Yes | Published ICS link | Use the ICS link, not the HTML link. Some orgs disable calendar publishing. |
| iCloud Calendar | Yes | Public calendar link, often `webcal://` | Private iCloud sharing requires Apple accounts and is not a public feed. |
| Zoho Calendar | Yes | Public or private iCal URL | Use the iCal URL, not the HTML embed/link. |
| Other iCalendar feeds | Usually | Direct `.ics`, `webcal://`, or iCalendar feed URL | Must be reachable without a login page or custom API. |
| CalDAV providers | Not directly | A separately published ICS/iCal feed | CalDAV account sync is a different protocol. |

## Google Calendar

<img src="../assets/google-calendar.png" width="28" height="28" alt="Google Calendar">

Best link: private iCal link.

1. Open Google Calendar in a browser.
2. Open `Settings`.
3. Choose the calendar under `Settings for my calendars`.
4. Find `Integrate calendar`.
5. Copy `Secret address in iCal format`.
6. Paste it into Calendar Importer.

If the secret address is missing, your Google Workspace admin may have disabled it. That is annoying, but it is not Calendar Importer being dramatic.

Reference: [Google: Sync your calendar with computer programs](https://support.google.com/calendar/answer/37648?hl=en)

## Outlook And Microsoft 365

<img src="../assets/microsoft-outlook.png" width="28" height="28" alt="Microsoft Outlook">

Best link: published ICS link.

1. Open Outlook Calendar on the web.
2. Open `Settings`.
3. Go to `Calendar > Shared calendars`.
4. Under `Publish a calendar`, choose the calendar and detail level.
5. Click `Publish`.
6. Copy the `ICS` link.
7. Paste it into Calendar Importer.

Outlook published ICS calendars are read-only, which is exactly what Calendar Importer wants.

Do not use the Outlook HTML link. That opens a browser page; Calendar Importer wants the ICS link.

Reference: [Microsoft: Share your calendar in Outlook on the web](https://support.microsoft.com/en-US/Outlook/share-your-calendar-in-outlook-on-the-web)

## iCloud Calendar

<img src="../assets/apple-icloud.png" width="28" height="28" alt="Apple iCloud">

Best link: public calendar link.

1. Open iCloud Calendar.
2. Select the calendar sharing button beside the calendar.
3. Turn on `Public Calendar`.
4. Copy the link.
5. Paste it into Calendar Importer.

Apple may give you a `webcal://` link. Paste it in exactly as-is; Calendar Importer will fetch it over HTTPS behind the scenes.

Public calendar links are read-only, but public means public-ish. Do not use this for calendars you would not want exposed through a link.

Private iCloud sharing is not the same thing. If the calendar requires an Apple Account invitation, Calendar Importer cannot sign in for it.

iCloud can include very old events in the public feed, even when Calendar Importer is only syncing a small date window. Calendar Importer repairs common malformed old text lines before parsing so one ancient dodgy address does not ruin the party.

Reference: [Apple: Share a calendar on iCloud.com](https://support.apple.com/guide/icloud/share-a-calendar-mm6b1a9479/icloud)

## Zoho Calendar

<img src="../assets/zoho-calendar.png" width="28" height="28" alt="Zoho Calendar">

Best link: private iCal URL.

1. Open Zoho Calendar.
2. Go to calendar sharing or sharing permissions.
3. Find the calendar URL area.
4. Copy the private `iCal` URL.
5. Paste it into Calendar Importer.

Zoho can generate public and private iCal URLs. Use the private URL when you want the calendar to stay off the public internet.

Do not use Zoho's HTML URL. That is for viewing or embedding a calendar page, not syncing events.

Reference: [Zoho: Share calendars](https://help.zoho.com/portal/en/kb/calendar/share-calendars/articles/share-calendars)

## Other Calendars

If your calendar app gives you a link ending in `.ics`, starting with `webcal://`, or described as an iCalendar feed, try it.

If it syncs correctly, you are in business. If it does not, the feed may require a login, block outside apps, or only export a one-time file instead of a live subscription.
