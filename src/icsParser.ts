import ICAL from "ical.js";
import { DateTime } from "luxon";
import type { CalendarFeedSetting, CalendarTaskSyncSettings, NormalizedCalendarEvent, ParsedFeedResult, ParseWindow, SyncIssue } from "./types";

const MAX_RECURRENCE_ITERATIONS = 25000;
const MAX_RECURRENCE_OCCURRENCES = 5000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface EventGroup {
  masters: ICAL.Event[];
  exceptions: ICAL.Event[];
}

export function parseIcsFeed(
  icsText: string,
  source: CalendarFeedSetting,
  settings: CalendarTaskSyncSettings,
  window: ParseWindow,
): ParsedFeedResult {
  const errors: string[] = [];
  const reports: SyncIssue[] = [];
  const events: NormalizedCalendarEvent[] = [];
  const repairedText = repairMalformedContentLines(icsText);
  const calendarColor = normalizeColor(getCalendarLevelColor(repairedText));
  const effectiveSource = calendarColor ? { ...source, color: calendarColor } : source;

  try {
    const parsed = parseCalendarComponents(repairedText);
    events.push(...normalizeCalendarComponents(parsed.vevents, parsed.calendarTimezone, effectiveSource, settings, window, errors, reports));
  } catch (error) {
    const recovered = recoverCalendarComponentsByEvent(repairedText, source, errors, error);
    events.push(...normalizeCalendarComponents(recovered.vevents, recovered.calendarTimezone, effectiveSource, settings, window, errors, reports));
  }

  for (const error of errors) {
    reports.push({
      sourceId: source.id,
      sourceName: source.name,
      title: "Calendar feed",
      reason: error,
    });
  }

  return { events, errors, reports: dedupeReports(reports) };
}

export function eventMatchesFeedFilters(event: NormalizedCalendarEvent, source: CalendarFeedSetting): boolean {
  return getEventFilterExclusionReason(event, source) === undefined;
}

export function getEventFilterExclusionReason(event: NormalizedCalendarEvent, source: CalendarFeedSetting): string | undefined {
  const haystack = `${event.title} ${event.description ?? ""} ${event.location ?? ""}`.toLocaleLowerCase();
  const includeKeywords = splitKeywords(source.includeKeywords);
  const excludeKeywords = splitKeywords(source.excludeKeywords);

  if (includeKeywords.length > 0 && !includeKeywords.some((keyword) => haystack.includes(keyword))) {
    return `it does not match this feed's include keywords (${includeKeywords.join(", ")}).`;
  }

  const excludedKeyword = excludeKeywords.find((keyword) => haystack.includes(keyword));
  return excludedKeyword ? `it matches this feed's excluded keyword "${excludedKeyword}".` : undefined;
}

export function repairMalformedContentLines(icsText: string): string {
  const lines = icsText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const repaired: string[] = [];
  let lastAppendableIndex = -1;
  let lastAppendableProperty = "";

  for (const line of lines) {
    const contentProperty = getContentLineProperty(line);
    if (contentProperty) {
      if (
        lastAppendableIndex >= 0
        && shouldTreatContentLineAsMalformedContinuation(line, contentProperty)
      ) {
        repaired[lastAppendableIndex] = appendMalformedTextLine(
          repaired[lastAppendableIndex],
          line.trim(),
          lastAppendableProperty,
        );
        continue;
      }

      repaired.push(line);
      if (canAppendMalformedLine(line)) {
        lastAppendableIndex = repaired.length - 1;
        lastAppendableProperty = contentProperty;
      } else if (isComponentBoundary(contentProperty)) {
        lastAppendableIndex = -1;
        lastAppendableProperty = "";
      } else {
        lastAppendableIndex = -1;
        lastAppendableProperty = "";
      }
      continue;
    }

    if (isContinuationLine(line)) {
      repaired.push(line);
      if (lastAppendableIndex >= 0) {
        lastAppendableIndex = repaired.length - 1;
      }
      continue;
    }

    if (line.trim() === "") {
      repaired.push(line);
      continue;
    }

    if (lastAppendableIndex < 0) {
      repaired.push(line);
      continue;
    }

    repaired[lastAppendableIndex] = appendMalformedTextLine(
      repaired[lastAppendableIndex],
      line.trim(),
      lastAppendableProperty,
    );
  }

  return decodeQuotedPrintableContentLines(repairUnquotedUriTimezoneParams(repaired)).join("\r\n");
}

function groupEventsByUid(vevents: ICAL.Component[]): Map<string, EventGroup> {
  const grouped = new Map<string, EventGroup>();

  for (const component of vevents) {
    const event = new ICAL.Event(component);
    const uid = getEventUid(event);
    const group = grouped.get(uid) ?? { masters: [], exceptions: [] };
    if (event.recurrenceId) {
      group.exceptions.push(event);
    } else {
      group.masters.push(event);
    }
    grouped.set(uid, group);
  }

  for (const [uid, group] of grouped) {
    grouped.set(uid, {
      masters: dedupeEventRevisions(group.masters, () => "master"),
      exceptions: dedupeEventRevisions(group.exceptions, (event) => icalTimeKey(event.recurrenceId)),
    });
  }

  return grouped;
}

function dedupeEventRevisions(events: ICAL.Event[], getKey: (event: ICAL.Event) => string): ICAL.Event[] {
  const latest = new Map<string, ICAL.Event>();
  for (const event of events) {
    const key = getKey(event);
    const previous = latest.get(key);
    if (!previous || compareEventRevision(event, previous) >= 0) {
      latest.set(key, event);
    }
  }
  return [...latest.values()];
}

function compareEventRevision(left: ICAL.Event, right: ICAL.Event): number {
  const sequenceDifference = getEventSequence(left) - getEventSequence(right);
  if (sequenceDifference !== 0) {
    return sequenceDifference;
  }
  return getEventRevisionTime(left) - getEventRevisionTime(right);
}

function getEventSequence(event: ICAL.Event): number {
  const value = event.component.getFirstPropertyValue("sequence");
  const sequence = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(sequence) ? sequence : 0;
}

function getEventRevisionTime(event: ICAL.Event): number {
  const value = event.component.getFirstPropertyValue("last-modified")
    ?? event.component.getFirstPropertyValue("dtstamp")
    ?? event.component.getFirstPropertyValue("created");
  return icalDateValueToDate(value)?.getTime() ?? 0;
}

function parseCalendarComponents(icsText: string): { calendarTimezone: string | undefined; vevents: ICAL.Component[] } {
  const jcal: unknown = ICAL.parse(icsText);
  if (!Array.isArray(jcal)) {
    throw new Error("Parsed calendar did not contain a valid jCal component.");
  }
  const calendar = new ICAL.Component(jcal);
  return {
    calendarTimezone: normalizeTimezoneId(stringValue(calendar.getFirstPropertyValue("x-wr-timezone"))),
    vevents: calendar.getAllSubcomponents("vevent"),
  };
}

function normalizeCalendarComponents(
  vevents: ICAL.Component[],
  calendarTimezone: string | undefined,
  source: CalendarFeedSetting,
  settings: CalendarTaskSyncSettings,
  window: ParseWindow,
  errors: string[],
  reports: SyncIssue[],
): NormalizedCalendarEvent[] {
  const events: NormalizedCalendarEvent[] = [];
  let grouped: Map<string, EventGroup>;

  try {
    grouped = groupEventsByUid(vevents);
  } catch (error) {
    errors.push(`Could not group events from ${source.name}: ${errorMessage(error)}`);
    return events;
  }

  for (const group of grouped.values()) {
    for (const master of group.masters) {
      try {
        for (const exception of group.exceptions) {
          try {
            hydrateCancelledException(exception, master);
            master.relateException(exception);
          } catch (error) {
            errors.push(`Could not relate recurrence exception for ${describeEvent(exception)} from ${source.name}: ${errorMessage(error)}`);
          }
        }

        if (master.isRecurring()) {
          events.push(...expandRecurringEvent(master, source, settings, window, errors, reports, calendarTimezone));
        } else {
          const normalized = normalizeEvent(master, master.startDate, master.endDate, source, settings, undefined, calendarTimezone);
          appendIfIncluded(events, normalized, settings, window, reports);
        }
      } catch (error) {
        errors.push(`Skipped ${describeEvent(master)} from ${source.name}: ${errorMessage(error)}`);
      }
    }

    if (group.masters.length === 0) {
      for (const orphan of group.exceptions) {
        try {
          const normalized = normalizeEvent(orphan, orphan.startDate, orphan.endDate, source, settings, undefined, calendarTimezone);
          appendIfIncluded(events, normalized, settings, window, reports);
        } catch (error) {
          errors.push(`Skipped ${describeEvent(orphan)} from ${source.name}: ${errorMessage(error)}`);
        }
      }
    }
  }

  return events;
}

function recoverCalendarComponentsByEvent(
  icsText: string,
  source: CalendarFeedSetting,
  errors: string[],
  originalError: unknown,
): { calendarTimezone: string | undefined; vevents: ICAL.Component[] } {
  const lines = icsText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const contextLines = extractCalendarContextLines(lines);
  const eventBlocks = extractVeventBlocks(lines);
  const vevents: ICAL.Component[] = [];
  let calendarTimezone = extractCalendarTimezone(contextLines);
  let skipped = 0;

  errors.push(`Could not parse ${source.name} as one calendar: ${errorMessage(originalError)}. Trying event-by-event recovery.`);

  for (const eventBlock of eventBlocks) {
    try {
      const parsed = parseCalendarComponents(buildIsolatedCalendarText(contextLines, eventBlock));
      calendarTimezone = parsed.calendarTimezone ?? calendarTimezone;
      vevents.push(...parsed.vevents);
    } catch (error) {
      skipped += 1;
      errors.push(`Skipped ${describeRawEvent(eventBlock)} from ${source.name}: ${errorMessage(error)}`);
    }
  }

  if (vevents.length > 0) {
    errors.push(`Recovered ${vevents.length} event${vevents.length === 1 ? "" : "s"} from ${source.name}; skipped ${skipped}.`);
  }

  return { calendarTimezone, vevents };
}

function extractCalendarContextLines(lines: string[]): string[] {
  const context: string[] = [];
  let inEvent = false;

  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line)) {
      inEvent = true;
      continue;
    }
    if (inEvent) {
      if (/^END:VEVENT$/i.test(line)) {
        inEvent = false;
      }
      continue;
    }
    context.push(line);
  }

  return context;
}

function extractVeventBlocks(lines: string[]): string[][] {
  const blocks: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line)) {
      current = [line];
      continue;
    }
    if (!current) {
      continue;
    }
    current.push(line);
    if (/^END:VEVENT$/i.test(line)) {
      blocks.push(current);
      current = null;
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

function buildIsolatedCalendarText(contextLines: string[], eventBlock: string[]): string {
  const output: string[] = [];
  let inserted = false;

  if (!contextLines.some((line) => /^BEGIN:VCALENDAR$/i.test(line))) {
    output.push("BEGIN:VCALENDAR");
  }
  if (!contextLines.some((line) => /^VERSION(?:;[^:]*)?:/i.test(line))) {
    output.push("VERSION:2.0");
  }

  for (const line of contextLines) {
    if (/^END:VCALENDAR$/i.test(line) && !inserted) {
      output.push(...eventBlock);
      inserted = true;
    }
    output.push(line);
  }

  if (!inserted) {
    output.push(...eventBlock);
  }
  if (!output.some((line) => /^END:VCALENDAR$/i.test(line))) {
    output.push("END:VCALENDAR");
  }

  return output.join("\r\n");
}

function extractCalendarTimezone(contextLines: string[]): string | undefined {
  const timezoneLine = contextLines.find((line) => /^X-WR-TIMEZONE(?:;[^:]*)?:/i.test(line));
  return normalizeTimezoneId(timezoneLine ? timezoneLine.slice(timezoneLine.indexOf(":") + 1) : "");
}

function hydrateCancelledException(exception: ICAL.Event, master: ICAL.Event): void {
  if (
    upper(exception.component.getFirstPropertyValue("status")) !== "CANCELLED"
    || !exception.recurrenceId
    || exception.startDate
  ) {
    return;
  }

  const start = exception.recurrenceId.clone();
  const end = start.clone();
  end.addDuration(master.duration);
  exception.startDate = start;
  exception.endDate = end;
}

function getContentLineProperty(line: string): string {
  return line.match(/^([A-Za-z0-9-]+)(?:;[^:]*)?:/)?.[1]?.toUpperCase() ?? "";
}

function isContinuationLine(line: string): boolean {
  return /^[ \t]/.test(line);
}

function canAppendMalformedLine(line: string): boolean {
  const property = getContentLineProperty(line);
  return [
    "ATTACH",
    "CATEGORIES",
    "COMMENT",
    "CONTACT",
    "DESCRIPTION",
    "LOCATION",
    "RESOURCES",
    "SUMMARY",
    "X-APPLE-STRUCTURED-LOCATION",
    "X-ALT-DESC",
  ].includes(property);
}

function shouldTreatContentLineAsMalformedContinuation(line: string, property: string): boolean {
  const originalProperty = line.match(/^([A-Za-z0-9-]+)(?:;[^:]*)?:/)?.[1] ?? "";
  return !isKnownIcalendarProperty(property)
    && !property.startsWith("X-")
    && originalProperty !== originalProperty.toUpperCase();
}

function isComponentBoundary(property: string): boolean {
  return property === "BEGIN" || property === "END";
}

function appendMalformedTextLine(previous: string, line: string, property: string): string {
  if (isQuotedPrintableLine(previous) && previous.endsWith("=")) {
    return `${previous.slice(0, -1)}${line}`;
  }
  return `${previous}\\n${escapeMalformedTextSegment(line, property)}`;
}

function escapeMalformedTextSegment(value: string, property: string): string {
  const normalized = value.replace(/\r?\n/g, "\\n");
  if (property === "ATTACH") {
    return normalized;
  }
  return normalized.replace(/\\/g, "\\\\");
}

function isQuotedPrintableLine(line: string): boolean {
  const colonIndex = line.indexOf(":");
  const propertyAndParams = colonIndex >= 0 ? line.slice(0, colonIndex) : line;
  return /(?:^|;)ENCODING="?QUOTED-PRINTABLE"?(?:;|$)/i.test(propertyAndParams);
}

function decodeQuotedPrintableContentLines(lines: string[]): string[] {
  const decoded: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!isQuotedPrintableLine(line)) {
      decoded.push(line);
      continue;
    }

    let unfolded = line;
    while (index + 1 < lines.length && isContinuationLine(lines[index + 1])) {
      const continuation = lines[index + 1].slice(1);
      unfolded = unfolded.endsWith("=")
        ? `${unfolded.slice(0, -1)}${continuation}`
        : `${unfolded}${continuation}`;
      index += 1;
    }

    decoded.push(decodeQuotedPrintableContentLine(unfolded));
  }

  return decoded;
}

function decodeQuotedPrintableContentLine(line: string): string {
  const colonIndex = line.indexOf(":");
  if (colonIndex < 0) {
    return line;
  }

  const rawPropertyAndParams = line.slice(0, colonIndex);
  const charset = rawPropertyAndParams.match(/(?:^|;)CHARSET="?([^";]+)"?/i)?.[1] ?? "utf-8";
  const propertyAndParams = rawPropertyAndParams
    .replace(/;ENCODING="?QUOTED-PRINTABLE"?/ig, "");
  const value = line.slice(colonIndex + 1);
  return `${propertyAndParams}:${escapeIcalendarTextValue(decodeQuotedPrintableValue(value, charset))}`;
}

function repairUnquotedUriTimezoneParams(lines: string[]): string[] {
  return lines.map((line) => {
    const colonIndex = findContentSeparatorIndex(line);
    if (colonIndex < 0) {
      return line;
    }

    const propertyAndParams = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1);
    const repaired = propertyAndParams.replace(
      /TZID=([^";:]+:\/\/[^";:]*)/i,
      (_match, timezoneId: string) => `TZID="${timezoneId}"`,
    );
    return `${repaired}:${value}`;
  });
}

function findContentSeparatorIndex(line: string): number {
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === ":" && !quoted && /^\d{8}(?:T\d{6}Z?)?$/.test(line.slice(index + 1))) {
      return index;
    }
  }
  return line.indexOf(":");
}

function decodeQuotedPrintableValue(value: string, charset: string): string {
  const bytes: number[] = [];
  let output = "";

  const flush = (): void => {
    if (bytes.length === 0) {
      return;
    }
    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder(charset, { fatal: false });
    } catch {
      decoder = new TextDecoder("utf-8", { fatal: false });
    }
    output += decoder.decode(new Uint8Array(bytes));
    bytes.length = 0;
  };

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "=" && /^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }

    flush();
    output += char;
  }

  flush();
  return output;
}

function escapeIcalendarTextValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/([,;])/g, "\\$1")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function isKnownIcalendarProperty(property: string): boolean {
  return [
    "ACTION",
    "ACKNOWLEDGED",
    "ATTACH",
    "ATTENDEE",
    "BEGIN",
    "CALSCALE",
    "CATEGORIES",
    "CLASS",
    "COLOR",
    "COMMENT",
    "COMPLETED",
    "CONFERENCE",
    "CONTACT",
    "CREATED",
    "DESCRIPTION",
    "DTEND",
    "DTSTAMP",
    "DTSTART",
    "DUE",
    "DURATION",
    "END",
    "EXDATE",
    "EXRULE",
    "FREEBUSY",
    "GEO",
    "LAST-MODIFIED",
    "IMAGE",
    "LOCATION",
    "METHOD",
    "NAME",
    "ORGANIZER",
    "PERCENT-COMPLETE",
    "PRIORITY",
    "PRODID",
    "PROXIMITY",
    "RDATE",
    "RECURRENCE-ID",
    "RELATED-TO",
    "REPEAT",
    "REQUEST-STATUS",
    "REFRESH-INTERVAL",
    "RESOURCES",
    "RRULE",
    "SEQUENCE",
    "SOURCE",
    "STATUS",
    "SUMMARY",
    "TRANSP",
    "TRIGGER",
    "TZID",
    "TZNAME",
    "TZOFFSETFROM",
    "TZOFFSETTO",
    "TZURL",
    "UID",
    "URL",
    "VERSION",
  ].includes(property);
}

function expandRecurringEvent(
  event: ICAL.Event,
  source: CalendarFeedSetting,
  settings: CalendarTaskSyncSettings,
  window: ParseWindow,
  errors: string[],
  reports: SyncIssue[],
  calendarTimezone: string | undefined,
): NormalizedCalendarEvent[] {
  const occurrences: NormalizedCalendarEvent[] = [];

  try {
    const iterator = event.iterator();
    const masterDurationMs = Math.max(0, event.duration.toSeconds() * 1000);
    let next: ICAL.Time | null;
    let inspected = 0;
    let included = 0;

    while ((next = iterator.next())) {
      if (inspected++ > MAX_RECURRENCE_ITERATIONS) {
        errors.push(`Stopped expanding ${event.summary || event.uid}; recurrence history is too large for the configured sync window.`);
        break;
      }

      const nextStart = icalTimeToDate(next, calendarTimezone);
      if (nextStart >= window.end) {
        break;
      }
      if (nextStart < window.start && nextStart.getTime() + masterDurationMs <= window.start.getTime()) {
        continue;
      }
      if (included++ >= MAX_RECURRENCE_OCCURRENCES) {
        errors.push(`Stopped expanding ${event.summary || event.uid}; too many recurrence instances inside the sync window.`);
        break;
      }

      const details = event.getOccurrenceDetails(next);
      const occurrenceStart = details.startDate;
      const occurrenceEnd = details.endDate;
      const normalized = normalizeEvent(details.item, occurrenceStart, occurrenceEnd, source, settings, next, calendarTimezone);
      appendIfIncluded(occurrences, normalized, settings, window, reports);
    }
  } catch (error) {
    errors.push(`Could not expand recurrence for ${event.summary || event.uid}: ${errorMessage(error)}`);
  }

  return occurrences;
}

function expandMultiDayAllDayEvent(
  event: NormalizedCalendarEvent,
  settings: CalendarTaskSyncSettings,
  window: ParseWindow,
): NormalizedCalendarEvent[] {
  if (!event.allDay || settings.multiDayAllDayEventMode === "single" || !event.end) {
    return [event];
  }

  const startDay = startOfUtcDay(event.start);
  const exclusiveEndDay = startOfUtcDay(event.end);
  const dayCount = Math.max(1, Math.round((exclusiveEndDay.getTime() - startDay.getTime()) / MS_PER_DAY));
  if (dayCount <= 1) {
    return [event];
  }

  const expanded: NormalizedCalendarEvent[] = [];
  for (let index = 0; index < dayCount; index += 1) {
    const dayStart = new Date(startDay.getTime() + index * MS_PER_DAY);
    const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);
    const instance = {
      ...event,
      start: dayStart,
      end: dayEnd,
      instanceId: `${event.instanceId}:day-${formatUtcDate(dayStart)}`,
    };
    if (shouldIncludeEvent(instance, settings, window)) {
      expanded.push(instance);
    }
  }

  return expanded;
}

function expandEventAndReminders(
  event: NormalizedCalendarEvent,
  settings: CalendarTaskSyncSettings,
  window: ParseWindow,
): NormalizedCalendarEvent[] {
  return [
    ...expandMultiDayAllDayEvent(event, settings, window),
    ...buildReminderEvents(event, settings, window),
  ];
}

function normalizeEvent(
  event: ICAL.Event,
  startTime: ICAL.Time,
  endTime: ICAL.Time | null,
  source: CalendarFeedSetting,
  settings: CalendarTaskSyncSettings,
  recurrenceStart?: ICAL.Time,
  calendarTimezone?: string,
): NormalizedCalendarEvent | null {
  if (!startTime) {
    return null;
  }

  const allDay = Boolean(startTime.isDate);
  const status = upper(event.component.getFirstPropertyValue("status"));

  const startTimezone = getPropertyTimezone(event.component, "dtstart") || calendarTimezone;
  const endTimezone = getPropertyTimezone(event.component, "dtend") || startTimezone;
  const start = icalTimeToDate(startTime, startTimezone);
  const end = endTime ? icalTimeToDate(endTime, endTimezone) : undefined;
  const instanceTime = recurrenceStart ?? event.recurrenceId ?? startTime;
  const uid = getEventUid(event);
  const instanceId = `${source.id}:${uid}:${icalTimeKey(instanceTime)}`;
  const created = icalDateValueToDate(event.component.getFirstPropertyValue("created"));
  const lastModified = icalDateValueToDate(event.component.getFirstPropertyValue("last-modified"));
  const sequence = event.component.getFirstPropertyValue("sequence");
  const createdBy = getOrganizer(event.component);
  const reminderStarts = getReminderStarts(event.component, start, end, settings);
  const color = normalizeColor(
    stringValue(event.component.getFirstPropertyValue("color"))
    || stringValue(event.component.getFirstPropertyValue("x-apple-calendar-color"))
    || stringValue(event.component.getFirstPropertyValue("x-google-calendar-color"))
    || source.color
    || "",
  );

  return {
    sourceId: source.id,
    sourceName: source.name,
    calendarName: source.sourceLabel || source.name,
    uid,
    instanceId,
    title: event.summary || "(Untitled event)",
    description: getEventDescription(event) || undefined,
    location: getEventLocation(event) || undefined,
    start,
    end,
    allDay,
    status,
    createdBy,
    created,
    lastModified,
    sequence: typeof sequence === "number" ? sequence : Number(sequence || 0) || undefined,
    recurrenceId: event.recurrenceId ? icalTimeKey(event.recurrenceId) : undefined,
    color,
    tags: source.tags,
    reminderStarts,
  };
}

function buildReminderEvents(
  event: NormalizedCalendarEvent,
  settings: CalendarTaskSyncSettings,
  window: ParseWindow,
): NormalizedCalendarEvent[] {
  if (!settings.includeReminderTasks || !event.reminderStarts || event.reminderStarts.length === 0) {
    return [];
  }

  return event.reminderStarts
    .map((start, index) => ({
      ...event,
      instanceId: `${event.instanceId}:reminder-${index}-${formatDateTimeKey(start)}`,
      title: `Reminder: ${event.title}`,
      start,
      end: undefined,
      allDay: event.allDay,
      isReminder: true,
      reminderForInstanceId: event.instanceId,
      reminderStarts: undefined,
    }))
    .filter((reminder) => shouldIncludeEvent(reminder, settings, window));
}

function splitKeywords(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((keyword) => keyword.trim().toLocaleLowerCase())
    .filter(Boolean);
}

function normalizeColor(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const named: Record<string, string> = {
    lavender: "#7986cb",
    sage: "#33b679",
    grape: "#8e24aa",
    flamingo: "#e67c73",
    banana: "#f6c026",
    tangerine: "#f4511e",
    peacock: "#039be5",
    graphite: "#616161",
    blueberry: "#3f51b5",
    basil: "#0b8043",
    tomato: "#d50000",
    turquoise: "#40e0d0",
  };
  const lower = trimmed.toLocaleLowerCase();
  if (named[lower]) {
    return named[lower];
  }

  if (/^[a-z]+$/i.test(trimmed) && typeof CSS !== "undefined" && CSS.supports("color", lower)) {
    return lower;
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${[...trimmed.slice(1)].map((character) => character.repeat(2)).join("")}`;
  }

  if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(trimmed)) {
    return trimmed.slice(0, 7);
  }

  if (/^[0-9a-f]{6}$/i.test(trimmed)) {
    return `#${trimmed}`;
  }

  return undefined;
}

function getCalendarLevelColor(icsText: string): string {
  const lines = icsText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let depth = 0;
  let fallback = "";

  for (const line of lines) {
    if (/^BEGIN:/i.test(line)) {
      depth += 1;
      continue;
    }
    if (/^END:/i.test(line)) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 1) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }
    const property = line.slice(0, separator).split(";", 1)[0].toUpperCase();
    const value = line.slice(separator + 1).trim();
    if (property === "X-APPLE-CALENDAR-COLOR") {
      return value;
    }
    if (property === "COLOR") {
      fallback = value;
    }
  }

  return fallback;
}

function getOrganizer(component: ICAL.Component): string | undefined {
  const organizer = component.getFirstProperty("organizer");
  if (!organizer) {
    return undefined;
  }

  const commonName = stringValue(organizer.getParameter("cn")).trim();
  if (commonName) {
    return commonName;
  }

  return cleanOrganizerValue(stringValue(organizer.getFirstValue()));
}

function getEventDescription(event: ICAL.Event): string {
  const plain = stringValue(event.description).trim();
  if (plain) {
    return plain;
  }

  return stringValue(event.component.getFirstPropertyValue("x-alt-desc")).trim();
}

function getEventLocation(event: ICAL.Event): string {
  const plain = stringValue(event.location).trim();
  if (plain) {
    return plain;
  }

  const structuredLocation = event.component.getFirstProperty("x-apple-structured-location");
  return stringValue(structuredLocation?.getParameter("x-title")).trim();
}

function cleanOrganizerValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^mailto:/i, "");
}

function getReminderStarts(
  component: ICAL.Component,
  eventStart: Date,
  eventEnd: Date | undefined,
  settings: CalendarTaskSyncSettings,
): Date[] {
  if (!settings.includeReminderTasks) {
    return [];
  }

  const minimumLeadMs = Math.max(1, settings.minimumReminderLeadDays ?? 1) * MS_PER_DAY;
  const reminders: Date[] = [];

  for (const alarm of component.getAllSubcomponents("valarm")) {
    const triggerProperty = alarm.getFirstProperty("trigger");
    const trigger = triggerProperty?.getFirstValue();
    const related = stringValue(triggerProperty?.getParameter("related")).toUpperCase();
    const anchor = related === "END" && eventEnd ? eventEnd : eventStart;
    const reminderStart = getReminderStart(trigger, anchor);
    if (!reminderStart) {
      continue;
    }

    const repeatValue = Number(alarm.getFirstPropertyValue("repeat") ?? 0);
    const repeatCount = Number.isFinite(repeatValue) ? Math.max(0, Math.min(100, Math.trunc(repeatValue))) : 0;
    const repeatDuration = alarm.getFirstPropertyValue("duration") as { toSeconds?: () => number } | null;
    const repeatMs = typeof repeatDuration?.toSeconds === "function" ? repeatDuration.toSeconds() * 1000 : 0;
    for (let repeatIndex = 0; repeatIndex <= repeatCount; repeatIndex += 1) {
      const repeatedStart = new Date(reminderStart.getTime() + repeatIndex * repeatMs);
      const leadMs = eventStart.getTime() - repeatedStart.getTime();
      if (leadMs >= minimumLeadMs) {
        reminders.push(repeatedStart);
      }
      if (repeatIndex > 0 && repeatMs === 0) {
        break;
      }
    }
  }

  return dedupeDates(reminders);
}

function getReminderStart(trigger: unknown, eventStart: Date): Date | null {
  const duration = trigger as { toSeconds?: () => number };
  if (typeof duration?.toSeconds === "function") {
    return new Date(eventStart.getTime() + duration.toSeconds() * 1000);
  }
  return icalDateValueToDate(trigger) ?? null;
}

function icalDateValueToDate(value: unknown): Date | undefined {
  if (!value) {
    return undefined;
  }
  if (value instanceof ICAL.Time) {
    return icalTimeToDate(value);
  }
  if (value instanceof Date) {
    return value;
  }
  const text = stringValue(value);
  if (!text) {
    return undefined;
  }
  try {
    if (/^\d{8}T\d{6}Z?$/.test(text)) {
      return icalTimeToDate(ICAL.Time.fromDateTimeString(text));
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(text) || /^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const parsed = new Date(text);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function dedupeDates(dates: Date[]): Date[] {
  const seen = new Set<number>();
  const result: Date[] = [];
  for (const date of dates) {
    const time = date.getTime();
    if (seen.has(time)) {
      continue;
    }
    seen.add(time);
    result.push(date);
  }
  return result;
}

function appendIfIncluded(
  target: NormalizedCalendarEvent[],
  event: NormalizedCalendarEvent | null,
  settings: CalendarTaskSyncSettings,
  window: ParseWindow,
  reports: SyncIssue[],
): void {
  if (!event) {
    return;
  }

  const exclusionReason = getEventExclusionReason(event, settings, window);
  if (exclusionReason) {
    if (isNearSyncWindow(event, window)) {
      reports.push(toSyncIssue(event, exclusionReason));
    }
    return;
  }

  target.push(...expandEventAndReminders(event, settings, window));
}

export function getEventExclusionReason(
  event: NormalizedCalendarEvent,
  settings: CalendarTaskSyncSettings,
  window: ParseWindow,
): string | undefined {
  if (event.allDay && !settings.includeAllDayEvents) {
    return "all-day events are turned off in Settings.";
  }
  if (event.status === "CANCELLED" && !settings.includeCancelledEvents) {
    return "it is marked as cancelled and cancelled events are turned off in Settings.";
  }
  if (event.start >= window.end) {
    return `it starts after the current sync window, which ends ${formatWindowDate(window.end)}.`;
  }
  if (!event.end || event.end.getTime() <= event.start.getTime()) {
    return event.start < window.start
      ? `it is before the current sync window, which starts ${formatWindowDate(window.start)}.`
      : undefined;
  }
  return event.end <= window.start
    ? `it ended before the current sync window, which starts ${formatWindowDate(window.start)}.`
    : undefined;
}

function shouldIncludeEvent(event: NormalizedCalendarEvent, settings: CalendarTaskSyncSettings, window: ParseWindow): boolean {
  return getEventExclusionReason(event, settings, window) === undefined;
}

function isNearSyncWindow(event: NormalizedCalendarEvent, window: ParseWindow): boolean {
  const reportMarginMs = 7 * MS_PER_DAY;
  const reportStart = window.start.getTime() - reportMarginMs;
  const reportEnd = window.end.getTime() + reportMarginMs;
  const end = event.end && event.end.getTime() > event.start.getTime() ? event.end.getTime() : event.start.getTime();
  return end >= reportStart && event.start.getTime() <= reportEnd;
}

function toSyncIssue(event: NormalizedCalendarEvent, reason: string): SyncIssue {
  return {
    sourceId: event.sourceId,
    sourceName: event.sourceName,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    reason,
  };
}

function formatWindowDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dedupeReports(reports: SyncIssue[]): SyncIssue[] {
  const seen = new Set<string>();
  return reports.filter((report) => {
    const key = [
      report.sourceId,
      report.title,
      report.start?.toISOString() ?? "",
      report.end?.toISOString() ?? "",
      report.reason,
    ].join("\u0000");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function icalTimeKey(time: ICAL.Time): string {
  return time.toString();
}

function getPropertyTimezone(component: ICAL.Component, propertyName: string): string | undefined {
  const property = component.getFirstProperty(propertyName);
  return normalizeTimezoneId(stringValue(property?.getParameter("tzid")));
}

function normalizeTimezoneId(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const windowsTimezones: Record<string, string> = {
    "aus eastern standard time": "Australia/Sydney",
    "e. australia standard time": "Australia/Brisbane",
    "cen. australia standard time": "Australia/Adelaide",
    "w. australia standard time": "Australia/Perth",
    "tasmania standard time": "Australia/Hobart",
    "new zealand standard time": "Pacific/Auckland",
    "gmt standard time": "Europe/London",
    "greenwich standard time": "Etc/GMT",
    "w. europe standard time": "Europe/Berlin",
    "central european standard time": "Europe/Warsaw",
    "romance standard time": "Europe/Paris",
    "eastern standard time": "America/New_York",
    "central standard time": "America/Chicago",
    "mountain standard time": "America/Denver",
    "pacific standard time": "America/Los_Angeles",
  };
  const mapped = windowsTimezones[trimmed.toLocaleLowerCase()] ?? trimmed;
  return DateTime.local().setZone(mapped).isValid ? mapped : undefined;
}

function icalTimeToDate(time: ICAL.Time, timezone?: string): Date {
  if (time.isDate) {
    return new Date(Date.UTC(time.year, time.month - 1, time.day));
  }
  if (timezone && time.zone.tzid === "floating") {
    const zoned = DateTime.fromObject({
      year: time.year,
      month: time.month,
      day: time.day,
      hour: time.hour,
      minute: time.minute,
      second: time.second,
    }, { zone: timezone });
    if (zoned.isValid) {
      return zoned.toJSDate();
    }
  }
  return time.toJSDate();
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function formatDateTimeKey(date: Date): string {
  return `${formatUtcDate(date)}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function upper(value: unknown): string | undefined {
  return typeof value === "string" ? value.toUpperCase() : undefined;
}

function describeEvent(event: ICAL.Event): string {
  const uid = stringValue(event.uid || event.component.getFirstPropertyValue("uid")).trim();
  const summary = stringValue(event.summary || event.component.getFirstPropertyValue("summary")).trim();
  if (uid && summary) {
    return `${uid} (${summary})`;
  }
  return uid || summary || "one event";
}

function describeRawEvent(lines: string[]): string {
  const uid = getRawContentLineValue(lines, "UID");
  const summary = getRawContentLineValue(lines, "SUMMARY");
  if (uid && summary) {
    return `${uid} (${summary})`;
  }
  return uid || summary || "one event";
}

function getRawContentLineValue(lines: string[], propertyName: string): string {
  const match = lines.find((line) => line.toUpperCase().startsWith(`${propertyName}:`));
  return match ? match.slice(match.indexOf(":") + 1).trim() : "";
}

function stringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return `${value}`;
  }
  if (
    value instanceof ICAL.Time
    || value instanceof ICAL.Duration
    || value instanceof ICAL.Period
    || value instanceof ICAL.UtcOffset
  ) {
    return value.toString();
  }
  return "";
}

function getEventUid(event: ICAL.Event): string {
  const uid = stringValue(event.uid || event.component.getFirstPropertyValue("uid")).trim();
  return uid || `missing-uid-${stableHash(event.component.toString())}`;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
