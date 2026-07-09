# Provider Setup Guide

Calendar Importer needs a calendar feed link. Most services call it an iCal, ICS, published, public, private, or subscription link. Same soup, different bowl.

Keep private calendar links private. Anyone with the link may be able to read that calendar.

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

Reference: [Google Calendar community guidance](https://support.google.com/calendar/thread/2408874/can-t-find-a-private-address-of-my-google-calendar-to-subscribe-it-to-outlook?hl=en)

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

Reference: [Microsoft: Share your calendar in Outlook on the web](https://support.microsoft.com/en-US/Outlook/share-your-calendar-in-outlook-on-the-web)

## iCloud Calendar

<img src="../assets/apple-icloud.png" width="28" height="28" alt="Apple iCloud">

Best link: public calendar link.

1. Open iCloud Calendar.
2. Select the calendar sharing button beside the calendar.
3. Turn on `Public Calendar`.
4. Copy the link.
5. Paste it into Calendar Importer.

Public calendar links are read-only, but public means public-ish. Do not use this for calendars you would not want exposed through a link.

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

Reference: [Zoho: Share calendars](https://help.zoho.com/portal/en/kb/calendar/share-calendars/articles/share-calendars)

## Other Calendars

If your calendar app gives you a link ending in `.ics`, starting with `webcal://`, or described as an iCalendar feed, try it.

If it syncs correctly, you are in business. If it does not, the feed may require a login, block outside apps, or only export a one-time file instead of a live subscription.
