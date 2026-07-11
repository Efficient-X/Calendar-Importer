import { DateTime } from "luxon";
import { DEFAULT_SETTINGS } from "./defaults";
import type { CalendarFeedSetting, CalendarTaskSyncSettings, SyncCacheEntry } from "./types";

type SettingsKey = keyof CalendarTaskSyncSettings;

export function normalizeSettingsData(value: unknown): CalendarTaskSyncSettings {
  const raw = isRecord(value) ? value : {};
  const normalized: CalendarTaskSyncSettings = { ...DEFAULT_SETTINGS };
  const target = normalized as unknown as Record<string, unknown>;

  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingsKey[]) {
    if (key === "feeds" || key === "syncCache") {
      continue;
    }
    const fallback = DEFAULT_SETTINGS[key];
    const candidate = raw[key];
    if (typeof candidate === typeof fallback) {
      target[key] = candidate;
    }
  }

  normalized.feeds = normalizeFeedSettings(raw.feeds);
  normalized.syncCache = normalizeSyncCache(raw.syncCache);
  normalized.syncFrequencyMinutes = clampNumber(normalized.syncFrequencyMinutes, 5, 1440, 60);
  normalized.pastDays = clampNumber(normalized.pastDays, 0, 3650, 0);
  normalized.futureDays = clampNumber(normalized.futureDays, 0, 3650, 30);
  normalized.completedRetentionDays = clampNumber(normalized.completedRetentionDays, 0, 3650, 0);
  normalized.descriptionLengthLimit = clampNumber(normalized.descriptionLengthLimit, 0, 2000, 120);
  normalized.minimumReminderLeadDays = clampNumber(normalized.minimumReminderLeadDays, 1, 3650, 1);

  normalized.multiDayAllDayEventMode = normalized.multiDayAllDayEventMode === "single" ? "single" : "daily";
  normalized.allDaySortPosition = normalized.allDaySortPosition === "last" ? "last" : "first";
  normalized.detailPlacement = normalized.detailPlacement === "after-date" ? "after-date" : "before-date";
  normalized.taskLayout = normalized.taskLayout === "chronological" ? "chronological" : "classic";
  normalized.completedTaskMode = normalized.completedTaskMode === "preserve-in-place"
    ? "preserve-in-place"
    : "move-to-completed-section";

  normalized.timezone = normalizeTimezone(normalized.timezone);
  normalized.calendarNotePath = requiredString(normalized.calendarNotePath, DEFAULT_SETTINGS.calendarNotePath);
  normalized.dailyNoteTemplate = requiredString(normalized.dailyNoteTemplate, DEFAULT_SETTINGS.dailyNoteTemplate);
  normalized.heading = normalizeHeading(normalized.heading, DEFAULT_SETTINGS.heading);
  normalized.completedHeading = normalizeHeading(normalized.completedHeading, DEFAULT_SETTINGS.completedHeading);
  if (normalized.completedHeading === normalized.heading) {
    normalized.completedHeading = DEFAULT_SETTINGS.completedHeading;
  }
  normalized.startMarker = requiredString(normalized.startMarker, DEFAULT_SETTINGS.startMarker);
  normalized.endMarker = requiredString(normalized.endMarker, DEFAULT_SETTINGS.endMarker);
  if (normalized.endMarker === normalized.startMarker) {
    normalized.endMarker = DEFAULT_SETTINGS.endMarker;
  }
  normalized.taskPrefix = requiredString(normalized.taskPrefix, DEFAULT_SETTINGS.taskPrefix);
  normalized.taskTemplate = requiredString(normalized.taskTemplate, DEFAULT_SETTINGS.taskTemplate);
  normalized.dateFormat = requiredString(normalized.dateFormat, DEFAULT_SETTINGS.dateFormat);
  normalized.timeFormat = requiredString(normalized.timeFormat, DEFAULT_SETTINGS.timeFormat);
  normalized.completedHeading = requiredString(normalized.completedHeading, DEFAULT_SETTINGS.completedHeading);

  return normalized;
}

export function normalizeFeedSettings(value: unknown): CalendarFeedSetting[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedIds = new Set<string>();
  return value.filter(isRecord).map((feed, index) => {
    const baseId = requiredString(stringField(feed.id), `feed-${index + 1}`);
    const id = makeUniqueId(baseId, usedIds);
    return {
      id,
      name: requiredString(stringField(feed.name), "New calendar"),
      url: stringField(feed.url),
      color: stringField(feed.color),
      sourceLabel: stringField(feed.sourceLabel),
      tags: stringField(feed.tags),
      includeKeywords: stringField(feed.includeKeywords),
      excludeKeywords: stringField(feed.excludeKeywords),
      enabled: typeof feed.enabled === "boolean" ? feed.enabled : true,
    };
  });
}

function normalizeSyncCache(value: unknown): Record<string, SyncCacheEntry> {
  if (!isRecord(value)) {
    return {};
  }

  const cache: Record<string, SyncCacheEntry> = {};
  for (const [storedKey, candidate] of Object.entries(value)) {
    if (!isRecord(candidate) || typeof candidate.rendered !== "string") {
      continue;
    }
    const key = requiredString(stringField(candidate.key), storedKey);
    cache[key] = {
      key,
      rendered: candidate.rendered,
      completed: typeof candidate.completed === "boolean" ? candidate.completed : undefined,
      lastSeen: stringField(candidate.lastSeen),
      notePath: typeof candidate.notePath === "string" ? candidate.notePath : undefined,
    };
  }
  return cache;
}

function normalizeTimezone(value: string): string {
  const timezone = value.trim();
  return !timezone || DateTime.local().setZone(timezone).isValid ? timezone : "";
}

function normalizeHeading(value: string, fallback: string): string {
  const heading = requiredString(value, fallback);
  return /^#{1,6}\s+\S/.test(heading) ? heading : fallback;
}

function makeUniqueId(baseId: string, usedIds: Set<string>): string {
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function requiredString(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
