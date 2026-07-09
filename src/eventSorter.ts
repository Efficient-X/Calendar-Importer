import { compareDates, toDateTime } from "./dateUtils";
import type { CalendarTaskSyncSettings, NormalizedCalendarEvent } from "./types";

export function sortEvents(events: NormalizedCalendarEvent[], settings: CalendarTaskSyncSettings): NormalizedCalendarEvent[] {
  return [...events].sort((a, b) => {
    const dateCompare = compareDateOnly(a.start, b.start, settings);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    if (a.allDay !== b.allDay) {
      const allDayFirst = settings.allDaySortPosition === "first";
      return a.allDay ? (allDayFirst ? -1 : 1) : allDayFirst ? 1 : -1;
    }

    if (!a.allDay && !b.allDay) {
      const timeCompare = compareDates(a.start, b.start);
      if (timeCompare !== 0) {
        return timeCompare;
      }
    }

    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

function compareDateOnly(a: Date, b: Date, settings: CalendarTaskSyncSettings): number {
  const left = toDateTime(a, settings.timezone).startOf("day").toMillis();
  const right = toDateTime(b, settings.timezone).startOf("day").toMillis();
  return left - right;
}
