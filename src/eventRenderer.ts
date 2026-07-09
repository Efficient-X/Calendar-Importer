import { DateTime } from "luxon";
import { toDateTime } from "./dateUtils";
import type { CalendarTaskSyncSettings, NormalizedCalendarEvent } from "./types";

interface RenderTokens {
  colorSwatch: string;
  title: string;
  details: string;
  detailsSeparator: string;
  preDateDetails: string;
  postDateDetails: string;
  weekday: string;
  weekdayShort: string;
  date: string;
  time: string;
  startTime: string;
  endTime: string;
  location: string;
  calendarName: string;
  uid: string;
  source: string;
  dateMarker: string;
  creator: string;
  created: string;
  lastModified: string;
  metadataSuffix: string;
}

const CALENDAR_MARKER = String.fromCodePoint(0x1f4c5);
const SCHEDULED_MARKER = String.fromCodePoint(0x23f3);
const COLOR_SWATCH = String.fromCodePoint(0x25a0);

export function renderEvents(events: NormalizedCalendarEvent[], settings: CalendarTaskSyncSettings): string[] {
  return events.map((event) => renderEventTask(event, settings));
}

export function renderEventTask(event: NormalizedCalendarEvent, settings: CalendarTaskSyncSettings, completed = false): string {
  const prefix = completed ? settings.taskPrefix.replace("[ ]", "[x]") : settings.taskPrefix;
  const body = renderTemplate(event, settings);
  const swatch = settings.includeColorSwatch ? buildColorSwatch(event.color) : "";
  const tags = [settings.tags, settings.sourceTag, event.tags].map((tag) => tag?.trim() ?? "").filter(Boolean).join(" ");
  const line = `${prefix} ${body}${tags ? ` ${tags}` : ""}${buildMetadataSuffix(event, settings)}`;
  const withSwatch = swatch && !body.includes(swatch) ? line.replace(`${prefix} `, `${prefix} ${swatch} `) : line;
  return normalizeTaskLine(settings.useScheduledDate ? withSwatch.replace(CALENDAR_MARKER, SCHEDULED_MARKER) : withSwatch);
}

export function renderTemplate(event: NormalizedCalendarEvent, settings: CalendarTaskSyncSettings): string {
  const tokens = buildTokens(event, settings);
  return settings.taskTemplate.replace(/\{\{(\w+)\}\}/g, (_match, key: keyof RenderTokens) => tokens[key] ?? "");
}

export function buildTokens(event: NormalizedCalendarEvent, settings: CalendarTaskSyncSettings): RenderTokens {
  const start = toDateTime(event.start, settings.timezone);
  const end = event.end ? toDateTime(event.end, settings.timezone) : undefined;
  const details = settings.includeDescriptions ? cleanDescription(event.description ?? "", settings) : "";
  const location = settings.includeLocations ? cleanInline(event.location ?? "", settings) : "";
  const calendarName = settings.includeCalendarNames ? cleanInline(event.calendarName ?? event.sourceName, settings) : "";
  const extraDetails = [location, details].filter(Boolean).join(" - ");
  const detailSuffix = extraDetails ? ` - ${extraDetails}` : "";
  const creator = settings.includeEventCreator ? cleanInline(event.createdBy ?? "", settings) : "";
  const created = settings.includeEventCreated && event.created ? formatMetadataDate(event.created, settings) : "";
  const lastModified = settings.includeEventLastModified && event.lastModified ? formatMetadataDate(event.lastModified, settings) : "";

  return {
    colorSwatch: settings.includeColorSwatch ? buildColorSwatch(event.color) : "",
    title: cleanInline(event.title, settings),
    details,
    detailsSeparator: details ? " - " : "",
    preDateDetails: settings.detailPlacement === "before-date" ? detailSuffix : "",
    postDateDetails: settings.detailPlacement === "after-date" ? detailSuffix : "",
    weekday: start.toFormat("cccc"),
    weekdayShort: start.toFormat("ccc"),
    date: start.toFormat(settings.dateFormat || "yyyy-MM-dd"),
    time: formatEventTime(event, start, end, settings),
    startTime: event.allDay ? "" : start.toFormat(settings.timeFormat || "HH:mm"),
    endTime: !event.allDay && end && hasUsefulEnd(event, start, end) ? end.toFormat(settings.timeFormat || "HH:mm") : "",
    location,
    calendarName,
    uid: event.uid,
    source: event.sourceName,
    dateMarker: settings.useScheduledDate ? SCHEDULED_MARKER : CALENDAR_MARKER,
    creator,
    created,
    lastModified,
    metadataSuffix: buildMetadataSuffix(event, settings),
  };
}

export function buildTaskPreview(settings: CalendarTaskSyncSettings): string {
  return renderEventTask({
    sourceId: "sample",
    sourceName: "Sample calendar",
    uid: "sample-event",
    instanceId: "sample:sample-event:20260807T060000Z",
    title: "Haircut",
    description: "Remember to wash hair the night before.",
    location: "Sydney Mall level 2 shop 128",
    start: new Date("2026-08-07T06:00:00Z"),
    end: new Date("2026-08-07T06:30:00Z"),
    allDay: false,
    calendarName: "Sample calendar",
    tags: "#SampleCalendar",
    createdBy: "Sample Organizer",
    created: new Date("2026-07-20T01:15:00Z"),
    lastModified: new Date("2026-07-25T05:45:00Z"),
  }, {
    ...settings,
    tags: "",
    sourceTag: "",
    includeColorSwatch: false,
  });
}

function buildColorSwatch(color: string | undefined): string {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) {
    return "";
  }
  return `<span class="calendar-importer-swatch" style="color:${color}">${COLOR_SWATCH}</span>`;
}

function buildMetadataSuffix(event: NormalizedCalendarEvent, settings: CalendarTaskSyncSettings): string {
  const parts: string[] = [];
  if (settings.includeEventCreator && event.createdBy) {
    parts.push(`Created by ${cleanInline(event.createdBy, settings)}`);
  }
  if (settings.includeEventCreated && event.created) {
    parts.push(`Created ${formatMetadataDate(event.created, settings)}`);
  }
  if (settings.includeEventLastModified && event.lastModified) {
    parts.push(`Modified ${formatMetadataDate(event.lastModified, settings)}`);
  }
  return parts.length > 0 ? ` | ${parts.join("; ")}` : "";
}

export function cleanDescription(description: string, settings: CalendarTaskSyncSettings): string {
  let value = description;
  if (settings.stripHtmlFromDescriptions) {
    value = stripHtml(value);
  }
  value = cleanInline(value, settings);
  const limit = Math.max(0, settings.descriptionLengthLimit);
  if (limit > 0 && value.length > limit) {
    return `${value.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
  }
  return value;
}

export function cleanInline(value: string, settings: Pick<CalendarTaskSyncSettings, "collapseWhitespace">): string {
  const cleaned = decodeEntities(value).replace(/\r?\n/g, " ");
  return settings.collapseWhitespace ? cleaned.replace(/\s+/g, " ").trim() : cleaned.trim();
}

function formatMetadataDate(date: Date, settings: CalendarTaskSyncSettings): string {
  const value = toDateTime(date, settings.timezone);
  return value.toFormat(`${settings.dateFormat || "yyyy-MM-dd"} ${settings.timeFormat || "HH:mm"}`);
}

function formatEventTime(
  event: NormalizedCalendarEvent,
  start: DateTime,
  end: DateTime | undefined,
  settings: CalendarTaskSyncSettings,
): string {
  if (event.allDay) {
    return "All day";
  }

  const startText = start.toFormat(settings.timeFormat || "HH:mm");
  if (!end || !hasUsefulEnd(event, start, end)) {
    return startText;
  }

  return `${startText}-${end.toFormat(settings.timeFormat || "HH:mm")}`;
}

function hasUsefulEnd(event: NormalizedCalendarEvent, start: DateTime, end: DateTime): boolean {
  return !event.allDay && end.toMillis() > start.toMillis();
}

function stripHtml(value: string): string {
  return value.replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function normalizeTaskLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
