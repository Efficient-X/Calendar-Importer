import ICAL from "ical.js";
import type { CalendarFeedSetting, CalendarTaskSyncSettings, NormalizedCalendarEvent, ParsedFeedResult, ParseWindow } from "./types";

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
  const events: NormalizedCalendarEvent[] = [];

  try {
    const jcal: unknown = ICAL.parse(repairMalformedContentLines(icsText));
    if (!Array.isArray(jcal)) {
      throw new Error("Parsed calendar did not contain a valid jCal component.");
    }
    const calendar = new ICAL.Component(jcal);
    const vevents = calendar.getAllSubcomponents("vevent");
    const grouped = groupEventsByUid(vevents);

    for (const group of grouped.values()) {
      for (const master of group.masters) {
        for (const exception of group.exceptions) {
          try {
            master.relateException(exception);
          } catch (error) {
            errors.push(`Could not relate recurrence exception for ${source.name}: ${errorMessage(error)}`);
          }
        }

        if (master.isRecurring()) {
          events.push(...expandRecurringEvent(master, source, settings, window, errors));
        } else {
          const normalized = normalizeEvent(master, master.startDate, master.endDate, source, settings);
          if (normalized && shouldIncludeEvent(normalized, settings, window)) {
            events.push(...expandEventAndReminders(normalized, settings, window));
          }
        }
      }

      if (group.masters.length === 0) {
        for (const orphan of group.exceptions) {
          const normalized = normalizeEvent(orphan, orphan.startDate, orphan.endDate, source, settings);
          if (normalized && shouldIncludeEvent(normalized, settings, window)) {
            events.push(...expandEventAndReminders(normalized, settings, window));
          }
        }
      }
    }
  } catch (error) {
    errors.push(`Could not parse ${source.name}: ${errorMessage(error)}`);
  }

  return { events, errors };
}

export function eventMatchesFeedFilters(event: NormalizedCalendarEvent, source: CalendarFeedSetting): boolean {
  const haystack = `${event.title} ${event.description ?? ""} ${event.location ?? ""}`.toLocaleLowerCase();
  const includeKeywords = splitKeywords(source.includeKeywords);
  const excludeKeywords = splitKeywords(source.excludeKeywords);

  if (includeKeywords.length > 0 && !includeKeywords.some((keyword) => haystack.includes(keyword))) {
    return false;
  }

  return !excludeKeywords.some((keyword) => haystack.includes(keyword));
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
        && shouldTreatContentLineAsMalformedContinuation(contentProperty)
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

  return decodeQuotedPrintableContentLines(repaired).join("\r\n");
}

function groupEventsByUid(vevents: ICAL.Component[]): Map<string, EventGroup> {
  const grouped = new Map<string, EventGroup>();

  for (const component of vevents) {
    const event = new ICAL.Event(component);
    const uid = stringValue(event.uid || component.getFirstPropertyValue("uid")) || cryptoSafeId();
    const group = grouped.get(uid) ?? { masters: [], exceptions: [] };
    if (event.recurrenceId) {
      group.exceptions.push(event);
    } else {
      group.masters.push(event);
    }
    grouped.set(uid, group);
  }

  return grouped;
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

function shouldTreatContentLineAsMalformedContinuation(property: string): boolean {
  return !isKnownIcalendarProperty(property) && !property.startsWith("X-");
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

  const propertyAndParams = line.slice(0, colonIndex)
    .replace(/;ENCODING="?QUOTED-PRINTABLE"?/ig, "");
  const value = line.slice(colonIndex + 1);
  return `${propertyAndParams}:${escapeIcalendarTextValue(decodeQuotedPrintableValue(value))}`;
}

function decodeQuotedPrintableValue(value: string): string {
  const bytes: number[] = [];
  let output = "";

  const flush = (): void => {
    if (bytes.length === 0) {
      return;
    }
    output += new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
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
    .replace(/\r\n|\r|\n/g, "\\n");
}

function isKnownIcalendarProperty(property: string): boolean {
  return [
    "ACTION",
    "ATTACH",
    "ATTENDEE",
    "BEGIN",
    "CALSCALE",
    "CATEGORIES",
    "CLASS",
    "COLOR",
    "COMMENT",
    "COMPLETED",
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
    "LOCATION",
    "METHOD",
    "ORGANIZER",
    "PERCENT-COMPLETE",
    "PRIORITY",
    "PRODID",
    "RDATE",
    "RECURRENCE-ID",
    "RELATED-TO",
    "REPEAT",
    "REQUEST-STATUS",
    "RESOURCES",
    "RRULE",
    "SEQUENCE",
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
): NormalizedCalendarEvent[] {
  const occurrences: NormalizedCalendarEvent[] = [];

  try {
    const iterator = event.iterator();
    let next: ICAL.Time | null;
    let inspected = 0;
    let included = 0;

    while ((next = iterator.next())) {
      if (inspected++ > MAX_RECURRENCE_ITERATIONS) {
        errors.push(`Stopped expanding ${event.summary || event.uid}; recurrence history is too large for the configured sync window.`);
        break;
      }

      const nextStart = next.toJSDate();
      if (nextStart >= window.end) {
        break;
      }
      if (nextStart < window.start) {
        continue;
      }
      if (included++ >= MAX_RECURRENCE_OCCURRENCES) {
        errors.push(`Stopped expanding ${event.summary || event.uid}; too many recurrence instances inside the sync window.`);
        break;
      }

      const details = event.getOccurrenceDetails(next);
      const occurrenceStart = details.startDate;
      const occurrenceEnd = details.endDate;
      const normalized = normalizeEvent(details.item, occurrenceStart, occurrenceEnd, source, settings, next);
      if (normalized && shouldIncludeEvent(normalized, settings, window)) {
        occurrences.push(...expandEventAndReminders(normalized, settings, window));
      }
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
): NormalizedCalendarEvent | null {
  if (!startTime) {
    return null;
  }

  const allDay = Boolean(startTime.isDate);
  if (allDay && !settings.includeAllDayEvents) {
    return null;
  }

  const status = upper(event.component.getFirstPropertyValue("status"));
  if (status === "CANCELLED" && !settings.includeCancelledEvents) {
    return null;
  }

  const start = icalTimeToDate(startTime);
  const end = endTime ? icalTimeToDate(endTime) : undefined;
  const instanceTime = recurrenceStart ?? event.recurrenceId ?? startTime;
  const instanceId = `${source.id}:${event.uid}:${icalTimeKey(instanceTime)}`;
  const created = icalDateValueToDate(event.component.getFirstPropertyValue("created"));
  const lastModified = icalDateValueToDate(event.component.getFirstPropertyValue("last-modified"));
  const sequence = event.component.getFirstPropertyValue("sequence");
  const createdBy = getOrganizer(event.component);
  const reminderStarts = getReminderStarts(event.component, start, settings);
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
    uid: stringValue(event.uid) || "(missing uid)",
    instanceId,
    title: event.summary || "(Untitled event)",
    description: event.description || undefined,
    location: event.location || undefined,
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
  };
  const lower = trimmed.toLocaleLowerCase();
  if (named[lower]) {
    return named[lower];
  }

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }

  if (/^[0-9a-f]{6}$/i.test(trimmed)) {
    return `#${trimmed}`;
  }

  return undefined;
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

function cleanOrganizerValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^mailto:/i, "");
}

function getReminderStarts(component: ICAL.Component, eventStart: Date, settings: CalendarTaskSyncSettings): Date[] {
  if (!settings.includeReminderTasks) {
    return [];
  }

  const minimumLeadMs = Math.max(1, settings.minimumReminderLeadDays ?? 1) * MS_PER_DAY;
  const reminders: Date[] = [];

  for (const alarm of component.getAllSubcomponents("valarm")) {
    const trigger = alarm.getFirstPropertyValue("trigger");
    const reminderStart = getReminderStart(trigger, eventStart);
    if (!reminderStart) {
      continue;
    }
    const leadMs = eventStart.getTime() - reminderStart.getTime();
    if (leadMs >= minimumLeadMs) {
      reminders.push(reminderStart);
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

function shouldIncludeEvent(event: NormalizedCalendarEvent, settings: CalendarTaskSyncSettings, window: ParseWindow): boolean {
  if (event.status === "CANCELLED" && !settings.includeCancelledEvents) {
    return false;
  }

  const end = event.end ?? event.start;
  return end >= window.start && event.start < window.end;
}

function icalTimeKey(time: ICAL.Time): string {
  return time.toString();
}

function icalTimeToDate(time: ICAL.Time): Date {
  if (time.isDate) {
    return new Date(Date.UTC(time.year, time.month - 1, time.day));
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function cryptoSafeId(): string {
  return `missing-uid-${Math.random().toString(36).slice(2)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
