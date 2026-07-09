import ICAL from "ical.js";
import type { CalendarFeedSetting, CalendarTaskSyncSettings, NormalizedCalendarEvent, ParsedFeedResult, ParseWindow } from "./types";

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
    const jcal: unknown = ICAL.parse(icsText);
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
    let count = 0;

    while ((next = iterator.next())) {
      if (count++ > MAX_RECURRENCE_OCCURRENCES) {
        errors.push(`Stopped expanding ${event.summary || event.uid}; too many recurrence instances.`);
        break;
      }

      const nextStart = next.toJSDate();
      if (nextStart >= window.end) {
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
