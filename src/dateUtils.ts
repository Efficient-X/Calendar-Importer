import { DateTime } from "luxon";

export function getZone(timezone: string): string {
  return timezone.trim() || "local";
}

export function toDateTime(date: Date, timezone: string): DateTime {
  return DateTime.fromJSDate(date).setZone(getZone(timezone));
}

export function startOfToday(timezone: string): DateTime {
  return DateTime.now().setZone(getZone(timezone)).startOf("day");
}

export function formatTemplatePath(template: string, date: Date, timezone: string): string {
  const dt = toDateTime(date, timezone);
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
