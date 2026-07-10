import { DateTime } from "luxon";

export function getZone(timezone: string): string {
  const zone = timezone.trim() || "local";
  return DateTime.local().setZone(zone).isValid ? zone : "local";
}

export function toDateTime(date: Date, timezone: string, preserveCalendarDate = false): DateTime {
  if (preserveCalendarDate) {
    return DateTime.fromObject({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    }, { zone: getZone(timezone) });
  }
  return DateTime.fromJSDate(date).setZone(getZone(timezone));
}

export function startOfToday(timezone: string): DateTime {
  return DateTime.now().setZone(getZone(timezone)).startOf("day");
}

export function formatTemplatePath(template: string, date: Date, timezone: string, preserveCalendarDate = false): string {
  const dt = toDateTime(date, timezone, preserveCalendarDate);
  return template
    .replace(/YYYY/g, dt.toFormat("yyyy"))
    .replace(/YY/g, dt.toFormat("yy"))
    .replace(/MM/g, dt.toFormat("MM"))
    .replace(/DD/g, dt.toFormat("dd"));
}

export function getSyncWindow(pastDays: number, futureDays: number, timezone: string): { start: Date; end: Date } {
  const today = startOfToday(timezone);
  return {
    start: today.minus({ days: Math.max(0, pastDays) }).toJSDate(),
    end: today.plus({ days: Math.max(0, futureDays) + 1 }).toJSDate(),
  };
}

export function compareDates(a: Date, b: Date): number {
  return a.getTime() - b.getTime();
}
