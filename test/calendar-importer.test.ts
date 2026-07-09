import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/defaults";
import { eventMatchesFeedFilters, parseIcsFeed } from "../src/icsParser";
import { renderEventTask } from "../src/eventRenderer";
import { sortEvents } from "../src/eventSorter";
import { normalizeFeedUrl } from "../src/security";
import {
  buildManagedBlock,
  extractCompletedSectionTaskLines,
  extractCompletedTaskLines,
  extractCompletionStates,
  getTaskIdentity,
  moveCompletedTasksToCompletedSection,
  prepareCompletedTaskLines,
  replaceCompletedTaskSection,
  replaceManagedBlock,
} from "../src/noteWriter";
import type { CalendarFeedSetting, CalendarTaskSyncSettings, NormalizedCalendarEvent } from "../src/types";

const settings: CalendarTaskSyncSettings = {
  ...DEFAULT_SETTINGS,
  timezone: "UTC",
  pastDays: 0,
  futureDays: 30,
};

const feed: CalendarFeedSetting = {
  id: "primary",
  name: "Primary",
  url: "https://example.test/calendar.ics",
  enabled: true,
};

const window = {
  start: new Date("2026-07-01T00:00:00Z"),
  end: new Date("2026-08-01T00:00:00Z"),
};
const calendarMarker = String.fromCodePoint(0x1f4c5);

describe("ICS parsing", () => {
  it("parses timed events with an end time", () => {
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:timed-1
SUMMARY:Flying medical
DESCRIPTION:
DTSTART:20260716T090000Z
DTEND:20260716T103000Z
END:VEVENT
`), feed, settings, window);

    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      uid: "timed-1",
      title: "Flying medical",
      allDay: false,
    });
    expect(renderEventTask(result.events[0], settings)).toBe("- [ ] Flying medical - Thursday - 09:00-10:30 📅 2026-07-16");
  });

  it("parses timed events without an end time", () => {
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:no-end-1
SUMMARY:Dinner with Jordan
DESCRIPTION:need to pick a place
DTSTART:20260716T190000Z
END:VEVENT
`), feed, settings, window);

    expect(result.events).toHaveLength(1);
    expect(renderEventTask(result.events[0], settings)).toBe(`- [ ] Dinner with Jordan - Thursday - 19:00 - need to pick a place ${calendarMarker} 2026-07-16`);
  });

  it("parses all-day events", () => {
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:all-day-1
SUMMARY:School pupil-free day
DTSTART;VALUE=DATE:20260716
DTEND;VALUE=DATE:20260717
END:VEVENT
`), feed, settings, window);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].allDay).toBe(true);
    expect(renderEventTask(result.events[0], settings)).toBe("- [ ] School pupil-free day - Thursday - All day 📅 2026-07-16");
  });

  it("expands multi-day all-day events into one task per day by default", () => {
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:solar-1
SUMMARY:Solar install
DTSTART;VALUE=DATE:20260805
DTEND;VALUE=DATE:20260808
END:VEVENT
`), feed, settings, {
      start: new Date("2026-08-01T00:00:00Z"),
      end: new Date("2026-08-31T00:00:00Z"),
    });

    expect(result.events.map((event) => event.start.toISOString())).toEqual([
      "2026-08-05T00:00:00.000Z",
      "2026-08-06T00:00:00.000Z",
      "2026-08-07T00:00:00.000Z",
    ]);
    expect(result.events.map((event) => renderEventTask(event, settings))).toEqual([
      "- [ ] Solar install - Wednesday - All day 📅 2026-08-05",
      "- [ ] Solar install - Thursday - All day 📅 2026-08-06",
      "- [ ] Solar install - Friday - All day 📅 2026-08-07",
    ]);
  });

  it("can keep multi-day all-day events as a single start-day task", () => {
    const singleSettings = { ...settings, multiDayAllDayEventMode: "single" as const };
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:solar-1
SUMMARY:Solar install
DTSTART;VALUE=DATE:20260805
DTEND;VALUE=DATE:20260808
END:VEVENT
`), feed, singleSettings, {
      start: new Date("2026-08-01T00:00:00Z"),
      end: new Date("2026-08-31T00:00:00Z"),
    });

    expect(result.events).toHaveLength(1);
    expect(renderEventTask(result.events[0], singleSettings)).toBe("- [ ] Solar install - Wednesday - All day 📅 2026-08-05");
  });

  it("expands recurring events inside the configured window", () => {
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:recur-1
SUMMARY:Standup
DTSTART:20260716T090000Z
DTEND:20260716T091500Z
RRULE:FREQ=DAILY;COUNT=3
END:VEVENT
`), feed, settings, window);

    expect(result.errors).toEqual([]);
    expect(result.events.map((event) => event.start.toISOString())).toEqual([
      "2026-07-16T09:00:00.000Z",
      "2026-07-17T09:00:00.000Z",
      "2026-07-18T09:00:00.000Z",
    ]);
  });

  it("does not let old daily recurrences burn through the expansion cap before the current window", () => {
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:old-daily-recur
SUMMARY:Daily shared calendar thing
DTSTART:20100101T090000Z
DTEND:20100101T091500Z
RRULE:FREQ=DAILY
END:VEVENT
`), feed, settings, window);

    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(31);
    expect(result.events[0].start.toISOString()).toBe("2026-07-01T09:00:00.000Z");
  });

  it("filters cancelled events by default", () => {
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:cancelled-1
SUMMARY:Cancelled thing
STATUS:CANCELLED
DTSTART:20260716T090000Z
DTEND:20260716T100000Z
END:VEVENT
`), feed, settings, window);

    expect(result.events).toHaveLength(0);
  });

  it("keeps events from multiple feeds with stable source-prefixed keys", () => {
    const otherFeed = { ...feed, id: "work", name: "Work" };
    const first = parseIcsFeed(simpleEvent("shared", "Primary event"), feed, settings, window);
    const second = parseIcsFeed(simpleEvent("shared", "Work event"), otherFeed, settings, window);

    expect(first.events[0].instanceId).toContain("primary:shared");
    expect(second.events[0].instanceId).toContain("work:shared");
  });

  it("captures event colour and applies feed keyword filters", () => {
    const colouredFeed = { ...feed, color: "tangerine", includeKeywords: "dentist", excludeKeywords: "cancelled" };
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:colour-1
SUMMARY:Dentist appointment
COLOR:#7986cb
DTSTART:20260716T090000Z
DTEND:20260716T100000Z
END:VEVENT
`), colouredFeed, settings, window);

    expect(result.events[0].color).toBe("#7986cb");
    expect(eventMatchesFeedFilters(result.events[0], colouredFeed)).toBe(true);
    expect(eventMatchesFeedFilters({ ...result.events[0], title: "Cancelled dentist" }, colouredFeed)).toBe(false);
  });

  it("captures organizer, created, and last modified metadata when iCal provides it", () => {
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:metadata-1
SUMMARY:Metadata event
ORGANIZER;CN=Alex Example:mailto:alex@example.test
CREATED:20260701T010000Z
LAST-MODIFIED:20260702T020000Z
DTSTART:20260716T090000Z
DTEND:20260716T100000Z
END:VEVENT
`), feed, settings, window);

    expect(result.events[0].createdBy).toBe("Alex Example");
    expect(result.events[0].created?.toISOString()).toBe("2026-07-01T01:00:00.000Z");
    expect(result.events[0].lastModified?.toISOString()).toBe("2026-07-02T02:00:00.000Z");
  });

  it("creates reminder tasks only for alarms at least the configured lead time before the event", () => {
    const reminderSettings = { ...settings, includeReminderTasks: true, minimumReminderLeadDays: 1 };
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:alarm-1
SUMMARY:Haircut
DESCRIPTION:Wash hair the night before.
LOCATION:Sydney Mall level 2 shop 128
DTSTART:20260716T090000Z
DTEND:20260716T093000Z
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Reminder
TRIGGER:-P1D
END:VALARM
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Short reminder
TRIGGER:-PT12H
END:VALARM
END:VEVENT
`), feed, reminderSettings, window);

    expect(result.events.map((event) => event.title)).toEqual(["Haircut", "Reminder: Haircut"]);
    expect(result.events[1]).toMatchObject({
      isReminder: true,
      reminderForInstanceId: result.events[0].instanceId,
    });
    expect(result.events[1].start.toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });

  it("repairs malformed Apple address lines before applying the date window", () => {
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:old-icloud-address
SUMMARY:Old appointment
LOCATION:Shop 1
Willoughby NSW 2068
DTSTART:20160101T090000Z
DTEND:20160101T093000Z
END:VEVENT
BEGIN:VEVENT
UID:current-event
SUMMARY:Current appointment
DTSTART:20260716T090000Z
DTEND:20260716T093000Z
END:VEVENT
`), { ...feed, name: "Stephanie - iPhone" }, settings, window);

    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].uid).toBe("current-event");
  });

  it("keeps repaired malformed Apple address text on in-window events", () => {
    const locationSettings = { ...settings, includeLocations: true };
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:icloud-address
SUMMARY:Appointment
LOCATION:Shop 1
Willoughby NSW 2068
DTSTART:20260716T090000Z
DTEND:20260716T093000Z
END:VEVENT
`), { ...feed, name: "Stephanie - iPhone" }, locationSettings, window);

    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].location).toBe("Shop 1\nWilloughby NSW 2068");
    expect(renderEventTask(result.events[0], locationSettings)).toContain("Shop 1 Willoughby NSW 2068");
  });

  it("repairs raw multiline descriptions that are not valid folded iCalendar", () => {
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:raw-description-lines
SUMMARY:Planning visit
DESCRIPTION:Bring forms
Park near the side entrance
Ask for Stephanie
DTSTART:20260716T090000Z
DTEND:20260716T093000Z
END:VEVENT
`), feed, settings, window);

    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].description).toBe("Bring forms\nPark near the side entrance\nAsk for Stephanie");
    expect(renderEventTask(result.events[0], settings)).toContain("Bring forms Park near the side entrance Ask for Stephanie");
  });

  it("keeps colon-looking raw description lines inside the description", () => {
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:raw-description-colon-lines
SUMMARY:Visit with notes
DESCRIPTION:First line
Notes: bring the blue folder
Address: Willoughby NSW 2068
DTSTART:20260716T090000Z
DTEND:20260716T093000Z
END:VEVENT
`), feed, settings, window);

    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].description).toBe("First line\nNotes: bring the blue folder\nAddress: Willoughby NSW 2068");
  });

  it("does not swallow valid calendar fields after a repaired multiline description", () => {
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:raw-description-before-date
SUMMARY:Still dated correctly
DESCRIPTION:First line
Second line
DTSTART:20260716T090000Z
DTEND:20260716T093000Z
END:VEVENT
`), feed, settings, window);

    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].start.toISOString()).toBe("2026-07-16T09:00:00.000Z");
    expect(result.events[0].description).toBe("First line\nSecond line");
  });

  it("decodes old quoted-printable multiline descriptions before parsing", () => {
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:quoted-printable-description
SUMMARY:Old Exchange appointment
DESCRIPTION;ENCODING=QUOTED-PRINTABLE:Line one=0D=0A=
Line two=0D=0A=
Line three with tick =E2=9C=85
DTSTART:20260716T090000Z
DTEND:20260716T093000Z
END:VEVENT
`), feed, settings, window);

    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].description).toBe("Line one\nLine two\nLine three with tick ✅");
  });

  it("preserves valid folded iCalendar text without treating it as semantic new lines", () => {
    const locationSettings = { ...settings, includeLocations: true };
    const result = parseIcsFeed(ics(`
BEGIN:VEVENT
UID:folded-location
SUMMARY:Folded appointment
LOCATION:123 Main Street
 Anytown
 CA 90210
DTSTART:20260716T090000Z
DTEND:20260716T093000Z
END:VEVENT
`), feed, locationSettings, window);

    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].location).toBe("123 Main StreetAnytownCA 90210");
  });

});

describe("feed URL handling", () => {
  it("converts webcal links to https links for fetching", () => {
    expect(normalizeFeedUrl("webcal://p123-caldav.icloud.com/published/2/example?token=abc"))
      .toBe("https://p123-caldav.icloud.com/published/2/example?token=abc");
  });

  it("converts secure webcal links to https links for fetching", () => {
    expect(normalizeFeedUrl("webcals://example.com/calendar.ics")).toBe("https://example.com/calendar.ics");
  });

  it("leaves ordinary web links alone", () => {
    expect(normalizeFeedUrl(" https://example.com/calendar.ics ")).toBe("https://example.com/calendar.ics");
  });

  it("rejects unsupported URL schemes before requestUrl sees them", () => {
    expect(() => normalizeFeedUrl("file:///Users/brendon/calendar.ics")).toThrow(/supports/);
    expect(() => normalizeFeedUrl("ftp://example.com/calendar.ics")).toThrow(/supports/);
  });

  it("rejects malformed feed URLs with a friendly message", () => {
    expect(() => normalizeFeedUrl("not a url")).toThrow(/valid calendar feed URL/);
  });
});

describe("rendering and sorting", () => {
  it("renders a configurable template", () => {
    const event = makeEvent({ title: "Dentist", location: "Clinic" });
    const custom = {
      ...settings,
      includeLocations: true,
      taskTemplate: "{{weekdayShort}} {{startTime}} {{title}} @ {{location}} 📅 {{date}}",
      tags: "#calendar",
      sourceTag: "#gcal",
    };

    expect(renderEventTask(event, custom)).toBe("- [ ] Thu 09:00 Dentist @ Clinic 📅 2026-07-16 #calendar #gcal");
  });

  it("renders a compact colour swatch when event colour is available", () => {
    const event = makeEvent({ title: "Coloured", color: "#f4511e" });

    expect(renderEventTask(event, settings)).toContain("<span class=\"calendar-importer-swatch\" style=\"color:#f4511e\">■</span>");
  });

  it("sorts by date, all-day position, time, then title", () => {
    const sorted = sortEvents([
      makeEvent({ title: "B timed", start: "2026-07-16T10:00:00Z" }),
      makeEvent({ title: "All day", start: "2026-07-16T00:00:00Z", allDay: true }),
      makeEvent({ title: "A timed", start: "2026-07-16T10:00:00Z" }),
      makeEvent({ title: "Earlier", start: "2026-07-15T23:00:00Z" }),
    ], settings);

    expect(sorted.map((event) => event.title)).toEqual(["Earlier", "All day", "A timed", "B timed"]);
  });

  it("formats dates in the configured timezone", () => {
    const event = makeEvent({ title: "Sydney morning", start: "2026-07-15T23:30:00Z" });
    const sydney = { ...settings, timezone: "Australia/Sydney" };

    expect(renderEventTask(event, sydney)).toContain("Thursday - 09:30-10:30 📅 2026-07-16");
  });

  it("can place location and description before or after the task date", () => {
    const event = makeEvent({
      title: "Haircut",
      location: "Sydney Mall level 2 shop 128",
      description: "Remember to wash hair the night before.",
    });
    const withDetails = { ...settings, includeLocations: true, includeDescriptions: true };

    expect(renderEventTask(event, { ...withDetails, detailPlacement: "before-date" })).toContain(
      `Thursday - 09:00-10:00 - Sydney Mall level 2 shop 128 - Remember to wash hair the night before. ${calendarMarker} 2026-07-16`,
    );
    expect(renderEventTask(event, { ...withDetails, detailPlacement: "after-date" })).toContain(
      `${calendarMarker} 2026-07-16 - Sydney Mall level 2 shop 128 - Remember to wash hair the night before.`,
    );
  });

  it("renders available iCal metadata as an end-of-task suffix", () => {
    const event = makeEvent({
      title: "Metadata event",
      createdBy: "Alex Example",
      created: new Date("2026-07-01T01:00:00Z"),
      lastModified: new Date("2026-07-02T02:00:00Z"),
    });

    expect(renderEventTask(event, {
      ...settings,
      includeEventCreator: true,
      includeEventCreated: true,
      includeEventLastModified: true,
    })).toContain(" | Created by Alex Example; Created 2026-07-01 01:00; Modified 2026-07-02 02:00");
  });

  it("renders untrusted calendar text as text instead of live HTML", () => {
    const event = makeEvent({
      title: "<img src=x onerror=alert(1)> Checkup",
      description: "<script>alert(1)</script><b>Bring &amp; review</b>",
      location: "<b>Clinic</b>",
      uid: "<uid>",
      sourceName: "<Shared calendar>",
    });
    const rendered = renderEventTask(event, {
      ...settings,
      includeDescriptions: true,
      includeLocations: true,
      taskTemplate: "{{title}} {{location}} {{details}} {{uid}} {{source}} {{dateMarker}} {{date}}",
    });

    expect(rendered).not.toContain("<img");
    expect(rendered).not.toContain("<script");
    expect(rendered).not.toContain("<b>");
    expect(rendered).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(rendered).toContain("&lt;uid&gt;");
    expect(rendered).toContain("&lt;Shared calendar&gt;");
    expect(rendered).toContain("Bring &amp; review");
  });
});

describe("note block management", () => {
  it("replaces only the managed block", () => {
    const original = [
      "# Note",
      "",
      "Keep this.",
      "",
      "## My Calendar Events",
      "",
      "<!-- calendar-importer:start -->",
      "- [ ] Old task",
      "<!-- calendar-importer:end -->",
      "",
      "Also keep this.",
    ].join("\n");

    const block = buildManagedBlock([{ key: "primary:new", line: "- [ ] New task 📅 2026-07-16" }], settings);
    const replaced = replaceManagedBlock(original, block, settings).content;

    expect(replaced).toContain("Keep this.");
    expect(replaced).toContain("Also keep this.");
    expect(replaced).not.toContain("Old task");
    expect(replaced).toContain("New task");
  });

  it("adds heading and clean marker-free content when missing", () => {
    const block = buildManagedBlock([{ key: "primary:new", line: "- [ ] New task 📅 2026-07-16" }], settings);
    const replaced = replaceManagedBlock("# Note\n\nBody", block, settings).content;

    expect(replaced).toContain("## My Calendar Events");
    expect(replaced).not.toContain("<!-- calendar-importer:start -->");
    expect(replaced).toContain("## My Calendar Events\n- [ ] New task");
    expect(replaced).toContain("Body");
  });

  it("does not render per-event feed markers", () => {
    const note = buildManagedBlock([
      { key: "primary:uid:20260716T090000Z", line: "- [ ] Task 📅 2026-07-16" },
    ], settings);

    expect(note).not.toContain("calendar-importer:event");
    expect(note).toBe("- [ ] Task 📅 2026-07-16");
  });

  it("preserves completion states by matching checked task text", () => {
    const block = buildManagedBlock([
      { key: "primary:uid:20260716T090000Z", line: "- [x] Done task 📅 2026-07-16" },
    ], settings);
    const note = `## My Calendar Events\n\n${block}`;

    const identity = getTaskIdentity("- [ ] Done task 📅 2026-07-16");
    expect(extractCompletionStates(note, settings)).toEqual({
      [identity]: true,
    });
    expect(extractCompletedTaskLines(note, settings)).toEqual({
      [identity]: "- [x] Done task 📅 2026-07-16",
    });
  });

  it("matches checked task text even when Tasks adds a completion date", () => {
    const checked = "- [x] Done task 📅 2026-07-16 ✅ 2026-07-18";
    const unchecked = "- [ ] Done task 📅 2026-07-16";

    expect(getTaskIdentity(checked)).toBe(getTaskIdentity(unchecked));
  });

  it("matches checked task text when completion date appears before a tag", () => {
    const checked = "- [x] Done task 📅 2026-07-16 ✅ 2026-07-18 #ExampleCalendar";
    const unchecked = "- [ ] Done task 📅 2026-07-16 #ExampleCalendar";

    expect(getTaskIdentity(checked)).toBe(getTaskIdentity(unchecked));
  });

  it("normalizes legacy broken symbols before comparing task text", () => {
    const broken = "- [x] Done task Ã°Å¸â€œâ€¦ 2026-07-16 Ã¢Å“â€¦ 2026-07-18 #ExampleCalendar";
    const fixed = "- [ ] Done task 📅 2026-07-16 #ExampleCalendar";

    expect(getTaskIdentity(broken)).toBe(getTaskIdentity(fixed));
  });

  it("can still read legacy hidden marker completion states", () => {
    const note = [
      "<!-- calendar-importer:start -->",
      "- [x] Legacy task 📅 2026-07-16",
      "<!-- calendar-importer:event primary%3Auid%3A20260716T090000Z -->",
      "<!-- calendar-importer:end -->",
    ].join("\n");

    expect(extractCompletionStates(note, settings)).toMatchObject({
      "primary:uid:20260716T090000Z": true,
    });
  });

  it("removes disappeared events through full block re-render", () => {
    const originalBlock = buildManagedBlock([
      { key: "primary:one", line: "- [ ] One 📅 2026-07-16" },
      { key: "primary:two", line: "- [ ] Two 📅 2026-07-17" },
    ], settings);
    const nextBlock = buildManagedBlock([
      { key: "primary:one", line: "- [ ] One updated 📅 2026-07-16" },
    ], settings);
    const replaced = replaceManagedBlock(`## My Calendar Events\n\n${originalBlock}`, nextBlock, settings).content;

    expect(replaced).toContain("One updated");
    expect(replaced).not.toContain("Two");
  });

  it("writes completed tasks to a completed heading section", () => {
    const note = "## My Calendar Events\n\n- [ ] Active 📅 2026-07-16\n";
    const replaced = replaceCompletedTaskSection(note, [
      "- [x] Done task 📅 2026-07-16",
      "- [x] Done task 📅 2026-07-16",
    ], settings).content;

    expect(replaced).toContain("## Completed Calendar Tasks");
    expect(replaced).toContain("Active 📅 2026-07-16\n\n\n## Completed Calendar Tasks\n- [x]");
    expect((replaced.match(/Done task/g) ?? [])).toHaveLength(1);
  });

  it("keeps the completed heading even when there are no completed tasks", () => {
    const note = "## My Calendar Events\n- [ ] Active 📅 2026-07-16\n";
    const replaced = replaceCompletedTaskSection(note, [], settings).content;

    expect(replaced).toContain("## My Calendar Events\n- [ ] Active");
    expect(replaced).toContain("\n\n\n## Completed Calendar Tasks\n");
  });

  it("finds completed tasks from both active and completed sections", () => {
    const activeCompleted = "- [x] Active done 📅 2026-07-16 ✅ 2026-07-16";
    const archivedCompleted = "- [x] Archived done 📅 2026-07-17 ✅ 2026-07-17";
    const note = `## My Calendar Events\n${activeCompleted}\n\n\n## Completed Calendar Tasks\n${archivedCompleted}\n`;

    const completed = extractCompletedTaskLines(note, settings);

    expect(completed[getTaskIdentity("- [ ] Active done 📅 2026-07-16")]).toBe(activeCompleted);
    expect(completed[getTaskIdentity("- [ ] Archived done 📅 2026-07-17")]).toBe(archivedCompleted);
  });
  it("moves checked active tasks into the completed section before rebuilding active tasks", () => {
    const note = [
      "# Calendar Tasks",
      "",
      "## My Calendar Events",
      "- [x] Done task - Thursday - All day #ExampleCalendar",
      "- [ ] Active task - Friday - All day #ExampleCalendar",
      "",
      "",
      "## Completed Calendar Tasks",
      "",
    ].join("\n");

    const normalized = moveCompletedTasksToCompletedSection(note, settings).content;

    expect(normalized).toContain("## My Calendar Events\n- [ ] Active task");
    expect(normalized).not.toContain("## My Calendar Events\n- [x] Done task");
    expect(normalized).toContain("## Completed Calendar Tasks\n- [x] Done task");
    expect(extractCompletedSectionTaskLines(normalized, settings)).toEqual([
      "- [x] Done task - Thursday - All day #ExampleCalendar",
    ]);
  });

  it("uses completed-section task identity to suppress the matching active event", () => {
    const completedLine = "- [x] Done task - Thursday - All day #ExampleCalendar";
    const eventLine = "- [ ] Done task - Thursday - All day #ExampleCalendar";
    const note = `## My Calendar Events\n\n\n## Completed Calendar Tasks\n${completedLine}\n`;
    const completed = extractCompletedTaskLines(note, settings);

    expect(completed[getTaskIdentity(eventLine)]).toBe(completedLine);
  });

  it("matches task identity regardless of rendered colour swatches", () => {
    const checked = "- [x] <span class=\"calendar-importer-swatch\" style=\"color:#f4511e\">x</span> Solar install - Wednesday - All day #ExampleCalendar";
    const unchecked = "- [ ] Solar install - Wednesday - All day #ExampleCalendar";

    expect(getTaskIdentity(checked)).toBe(getTaskIdentity(unchecked));
  });

  it("sorts completed tasks with the most recent calendar date first", () => {
    const sorted = prepareCompletedTaskLines([
      "- [x] Old task - Friday - All day Ã°Å¸â€œâ€¦ 2026-07-10 Ã¢Å“â€¦ 2026-07-12",
      "- [x] New task - Sunday - All day Ã°Å¸â€œâ€¦ 2026-07-26 Ã¢Å“â€¦ 2026-07-27",
      "- [x] Middle task - Monday - All day Ã°Å¸â€œâ€¦ 2026-07-20 Ã¢Å“â€¦ 2026-07-21",
    ], settings);

    expect(sorted.map((line) => line.match(/- \[x\] ([^-]+)/)?.[1].trim())).toEqual([
      "New task",
      "Middle task",
      "Old task",
    ]);
  });

  it("can trim completed tasks by retention days using completion date first", () => {
    const retentionSettings = { ...settings, completedRetentionDays: 7 };
    const calendarMarker = String.fromCodePoint(0x1f4c5);
    const doneMarker = String.fromCodePoint(0x2705);
    const kept = prepareCompletedTaskLines([
      "- [x] Recently completed old event - Friday - All day Ã°Å¸â€œâ€¦ 2026-06-01 Ã¢Å“â€¦ 2026-07-08",
      "- [x] Too old - Friday - All day Ã°Å¸â€œâ€¦ 2026-06-01 Ã¢Å“â€¦ 2026-06-20",
    ], retentionSettings, new Date("2026-07-09T12:00:00Z"));

    expect(kept).toEqual([
      `- [x] Recently completed old event - Friday - All day ${calendarMarker} 2026-06-01 ${doneMarker} 2026-07-08`,
    ]);
  });
});

function ics(body: string): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calendar Importer//Tests//EN",
    body.trim(),
    "END:VCALENDAR",
  ].join("\r\n");
}

function simpleEvent(uid: string, summary: string): string {
  return ics(`
BEGIN:VEVENT
UID:${uid}
SUMMARY:${summary}
DTSTART:20260716T090000Z
DTEND:20260716T100000Z
END:VEVENT
`);
}

function makeEvent(overrides: Omit<Partial<NormalizedCalendarEvent>, "start" | "end"> & { start?: string; end?: string } = {}): NormalizedCalendarEvent {
  const { start: startOverride, end: endOverride, ...eventOverrides } = overrides;
  const start = new Date(startOverride ?? "2026-07-16T09:00:00Z");
  const end = endOverride ? new Date(endOverride) : new Date(start.getTime() + 60 * 60 * 1000);

  return {
    sourceId: "primary",
    sourceName: "Primary",
    uid: "uid",
    instanceId: "primary:uid:20260716T090000Z",
    title: "Event",
    start,
    end,
    allDay: false,
    ...eventOverrides,
  };
}
