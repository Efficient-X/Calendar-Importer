import { App, normalizePath, requestUrl, TFile } from "obsidian";
import { DateTime } from "luxon";
import { formatTemplatePath, getSyncWindow } from "./dateUtils";
import { renderEventTask } from "./eventRenderer";
import { sortEvents } from "./eventSorter";
import { eventMatchesFeedFilters, parseIcsFeed } from "./icsParser";
import {
  buildManagedBlock,
  extractCompletedSectionTaskLines,
  extractCompletedTaskLines,
  getTaskIdentity,
  moveCompletedTasksToCompletedSection,
  normalizeTaskSymbols,
  replaceCompletedTaskSection,
  replaceManagedBlock,
} from "./noteWriter";
import { isLikelyIcs, maskUrl } from "./security";
import type {
  CalendarTaskSyncSettings,
  NormalizedCalendarEvent,
  SyncCacheEntry,
  SyncChangeSummary,
  SyncOptions,
  SyncResult,
} from "./types";

type SettingsGetter = () => CalendarTaskSyncSettings;

interface FeedEventsResult {
  events: NormalizedCalendarEvent[];
  filtered: number;
}

interface BuildNotePlan {
  activeBlock: string;
  completedLines: string[];
  summary: SyncChangeSummary;
  nextCache: Record<string, SyncCacheEntry>;
}

export class CalendarTaskSyncEngine {
  private isRunning = false;

  constructor(
    private readonly app: App,
    private readonly getSettings: SettingsGetter,
  ) {}

  async sync(options: SyncOptions): Promise<SyncResult> {
    if (this.isRunning) {
      return {
        success: true,
        skipped: true,
        eventCount: 0,
        message: "A sync is already running; skipped this request.",
        errors: [],
      };
    }

    this.isRunning = true;
    try {
      return await this.runSync(options);
    } finally {
      this.isRunning = false;
    }
  }

  async ensureCalendarNoteForToday(): Promise<TFile | null> {
    const settings = this.getSettings();
    const path = this.resolveNotePath(new Date(), settings);
    return this.ensureNote(path, settings.createNoteIfMissing);
  }

  private async runSync(options: SyncOptions): Promise<SyncResult> {
    const settings = this.getSettings();
    const errors: string[] = [];
    const window = getSyncWindow(settings.pastDays, settings.futureDays, settings.timezone);
    const enabledFeeds = settings.feeds.filter((feed) => feed.enabled && feed.url.trim());
    const events: NormalizedCalendarEvent[] = [];
    let filtered = 0;

    for (const feed of enabledFeeds) {
      const feedResult = await this.fetchAndParseFeed(feed.id, errors, window);
      events.push(...feedResult.events);
      filtered += feedResult.filtered;
    }

    const sortedEvents = sortEvents(events, settings);
    const writeResult = options.dryRun
      ? await this.preview(sortedEvents, settings, filtered)
      : await this.writeEvents(sortedEvents, settings, window, errors, filtered);

    const success = errors.length === 0;
    const summaryText = formatChangeSummary(writeResult.changeSummary);
    const message = success
      ? `Synced ${sortedEvents.length} event${sortedEvents.length === 1 ? "" : "s"}. ${summaryText}`
      : `Synced with ${errors.length} error${errors.length === 1 ? "" : "s"}. ${summaryText}`;

    return {
      success,
      skipped: false,
      eventCount: sortedEvents.length,
      notePath: writeResult.notePath,
      message,
      errors,
      preview: writeResult.preview,
      changeSummary: writeResult.changeSummary,
    };
  }

  private async fetchAndParseFeed(feedId: string, errors: string[], window: { start: Date; end: Date }): Promise<FeedEventsResult> {
    const settings = this.getSettings();
    const feed = settings.feeds.find((candidate) => candidate.id === feedId);
    if (!feed) {
      return { events: [], filtered: 0 };
    }

    try {
      const response = await requestUrl({
        url: feed.url,
        method: "GET",
        headers: {
          Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1",
        },
      });

      if (response.status < 200 || response.status >= 300) {
        errors.push(`${feed.name}: feed returned HTTP ${response.status} (${maskUrl(feed.url)}).`);
        return { events: [], filtered: 0 };
      }

      const text = response.text;
      if (!isLikelyIcs(text)) {
        errors.push(`${feed.name}: response did not look like an iCalendar feed (${maskUrl(feed.url)}).`);
        return { events: [], filtered: 0 };
      }

      const parsed = parseIcsFeed(text, feed, settings, window);
      errors.push(...parsed.errors);
      const filteredEvents = parsed.events.filter((event) => eventMatchesFeedFilters(event, feed));
      return {
        events: filteredEvents,
        filtered: parsed.events.length - filteredEvents.length,
      };
    } catch (error) {
      errors.push(`${feed.name}: could not fetch feed ${maskUrl(feed.url)}: ${errorMessage(error)}`);
      return { events: [], filtered: 0 };
    }
  }

  private async preview(
    events: NormalizedCalendarEvent[],
    settings: CalendarTaskSyncSettings,
    filtered: number,
  ): Promise<{ preview: string; notePath?: string; changeSummary: SyncChangeSummary }> {
    if (settings.useDailyNotes) {
      const grouped = groupEventsByPath(events, settings);
      const totalSummary = emptySummary(filtered);
      const previews: string[] = [];

      for (const [path, pathEvents] of grouped.entries()) {
        const existing = await this.readNoteIfExists(path);
        const plan = this.buildNotePlan(pathEvents, settings, existing, 0);
        addSummary(totalSummary, plan.summary);
        previews.push(`# ${path}\n${formatChangeSummary(plan.summary)}\n\n${plan.activeBlock}`);
      }

      return {
        preview: previews.join("\n\n"),
        changeSummary: totalSummary,
      };
    }

    const notePath = this.resolveNotePath(new Date(), settings);
    const existing = await this.readNoteIfExists(notePath);
    const plan = this.buildNotePlan(events, settings, existing, filtered);
    const completedPreview = settings.completedTaskMode === "move-to-completed-section" && plan.completedLines.length > 0
      ? `\n\n${settings.completedHeading}\n\n${plan.completedLines.join("\n")}`
      : "";

    return {
      preview: `${formatChangeSummary(plan.summary)}\n\n${plan.activeBlock}${completedPreview}`,
      notePath,
      changeSummary: plan.summary,
    };
  }

  private async writeEvents(
    events: NormalizedCalendarEvent[],
    settings: CalendarTaskSyncSettings,
    window: { start: Date; end: Date },
    errors: string[],
    filtered: number,
  ): Promise<{ preview?: string; notePath?: string; changeSummary: SyncChangeSummary }> {
    if (settings.useDailyNotes) {
      const summary = await this.writeDailyNotes(events, settings, window, errors, filtered);
      return { notePath: settings.dailyNoteTemplate, changeSummary: summary };
    }

    const path = this.resolveNotePath(new Date(), settings);
    const summary = await this.writeOneNote(path, events, settings, errors, filtered);
    return { notePath: path, changeSummary: summary };
  }

  private async writeDailyNotes(
    events: NormalizedCalendarEvent[],
    settings: CalendarTaskSyncSettings,
    window: { start: Date; end: Date },
    errors: string[],
    filtered: number,
  ): Promise<SyncChangeSummary> {
    const eventsByPath = groupEventsByPath(events, settings);
    const allPaths = new Set(eventsByPath.keys());
    const summary = emptySummary(filtered);

    let cursor = DateTime.fromJSDate(window.start).setZone(settings.timezone || "local").startOf("day");
    const end = DateTime.fromJSDate(window.end).setZone(settings.timezone || "local").startOf("day");
    while (cursor < end) {
      const path = this.resolveNotePath(cursor.toJSDate(), settings);
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) {
        allPaths.add(path);
      }
      cursor = cursor.plus({ days: 1 });
    }

    for (const path of allPaths) {
      addSummary(summary, await this.writeOneNote(path, eventsByPath.get(path) ?? [], settings, errors, 0));
    }

    return summary;
  }

  private async writeOneNote(
    path: string,
    events: NormalizedCalendarEvent[],
    settings: CalendarTaskSyncSettings,
    errors: string[],
    filtered: number,
  ): Promise<SyncChangeSummary> {
    try {
      const file = await this.ensureNote(path, settings.createNoteIfMissing || events.length > 0);
      if (!file) {
        errors.push(`${path}: note does not exist and note creation is disabled.`);
        return emptySummary(filtered);
      }

      const existing = await this.app.vault.read(file);
      const normalizedExisting = settings.completedTaskMode === "move-to-completed-section"
        ? moveCompletedTasksToCompletedSection(existing, settings).content
        : existing;
      const plan = this.buildNotePlan(events, settings, normalizedExisting, filtered);
      const activeReplacement = replaceManagedBlock(normalizedExisting, plan.activeBlock, settings);
      const completedReplacement = settings.completedTaskMode === "move-to-completed-section"
        ? replaceCompletedTaskSection(activeReplacement.content, plan.completedLines, settings)
        : activeReplacement;

      settings.syncCache = plan.nextCache;

      if (!completedReplacement.changed) {
        return plan.summary;
      }

      if (settings.backupBeforeSync) {
        await this.createBackup(file, existing);
      }

      await this.app.vault.modify(file, completedReplacement.content);
      return plan.summary;
    } catch (error) {
      errors.push(`${path}: could not update note: ${errorMessage(error)}`);
      return emptySummary(filtered);
    }
  }

  private buildNotePlan(
    events: NormalizedCalendarEvent[],
    settings: CalendarTaskSyncSettings,
    existingContent: string,
    filtered: number,
  ): BuildNotePlan {
    const completedLines = settings.preserveManualCompletion ? extractCompletedTaskLines(existingContent, settings) : {};
    const existingCompletedSectionLines = settings.completedTaskMode === "move-to-completed-section"
      ? extractCompletedSectionTaskLines(existingContent, settings)
      : [];
    const summary = emptySummary(filtered);
    const currentKeys = new Set<string>();
    const nextCache: Record<string, SyncCacheEntry> = {};
    const activeLines: { key: string; line: string }[] = [];
    const completedArchiveLines = [...existingCompletedSectionLines];
    const seenAt = new Date().toISOString();

    for (const event of events) {
      const uncheckedLine = renderEventTask(event, settings, false);
      const taskIdentity = getTaskIdentity(uncheckedLine);
      const previous = settings.syncCache[event.instanceId];
      const previousIdentity = previous?.rendered ? getTaskIdentity(previous.rendered) : "";
      const previousCompletedLine = previous?.completed && previous.rendered ? normalizeTaskSymbols(previous.rendered) : undefined;
      const preservedLine = settings.preserveManualCompletion
        ? completedLines[event.instanceId] ?? completedLines[taskIdentity] ?? completedLines[previousIdentity] ?? previousCompletedLine
        : undefined;
      const completed = Boolean(preservedLine);
      currentKeys.add(event.instanceId);

      if (!previous) {
        summary.added += 1;
      } else if (getTaskIdentity(previous.rendered) !== taskIdentity) {
        summary.updated += 1;
      } else {
        summary.unchanged += 1;
      }

      nextCache[event.instanceId] = {
        key: event.instanceId,
        rendered: preservedLine ?? uncheckedLine,
        completed,
        lastSeen: seenAt,
      };

      if (preservedLine && settings.completedTaskMode === "move-to-completed-section") {
        completedArchiveLines.push(preservedLine);
        summary.completedMoved += 1;
        continue;
      }

      if (completed) {
        summary.completedPreserved += 1;
      }

      activeLines.push({ key: event.instanceId, line: preservedLine ?? uncheckedLine });
    }

    for (const key of Object.keys(settings.syncCache)) {
      if (!currentKeys.has(key)) {
        summary.removed += 1;
      }
    }

    return {
      activeBlock: buildManagedBlock(activeLines, settings),
      completedLines: completedArchiveLines,
      summary,
      nextCache,
    };
  }

  private async readNoteIfExists(path: string): Promise<string> {
    const existing = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (existing instanceof TFile) {
      return this.app.vault.read(existing);
    }
    return "";
  }

  private async ensureNote(path: string, createIfMissing: boolean): Promise<TFile | null> {
    const normalizedPath = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing instanceof TFile) {
      return existing;
    }
    if (existing) {
      throw new Error(`${normalizedPath} exists but is not a file.`);
    }
    if (!createIfMissing) {
      return null;
    }

    await this.ensureFolder(normalizedPath);
    return this.app.vault.create(normalizedPath, "");
  }

  private async ensureFolder(path: string): Promise<void> {
    const folder = path.split("/").slice(0, -1).join("/");
    if (!folder || await this.app.vault.adapter.exists(folder)) {
      return;
    }
    await this.app.vault.adapter.mkdir(folder);
  }

  private async createBackup(file: TFile, content: string): Promise<void> {
    const stamp = DateTime.now().toFormat("yyyyMMdd-HHmmss");
    const backupPath = normalizePath(`${file.path}.${stamp}.bak`);
    await this.app.vault.create(backupPath, content);
  }

  private resolveNotePath(date: Date, settings: CalendarTaskSyncSettings): string {
    const path = settings.useDailyNotes
      ? formatTemplatePath(settings.dailyNoteTemplate, date, settings.timezone)
      : settings.calendarNotePath;
    return normalizePath(path);
  }
}

function groupEventsByPath(events: NormalizedCalendarEvent[], settings: CalendarTaskSyncSettings): Map<string, NormalizedCalendarEvent[]> {
  const grouped = new Map<string, NormalizedCalendarEvent[]>();
  for (const event of events) {
    const path = normalizePath(formatTemplatePath(settings.dailyNoteTemplate, event.start, settings.timezone));
    const bucket = grouped.get(path) ?? [];
    bucket.push(event);
    grouped.set(path, bucket);
  }
  return grouped;
}

function emptySummary(filtered = 0): SyncChangeSummary {
  return {
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    completedMoved: 0,
    completedPreserved: 0,
    filtered,
  };
}

function addSummary(target: SyncChangeSummary, source: SyncChangeSummary): void {
  target.added += source.added;
  target.updated += source.updated;
  target.removed += source.removed;
  target.unchanged += source.unchanged;
  target.completedMoved += source.completedMoved;
  target.completedPreserved += source.completedPreserved;
  target.filtered += source.filtered;
}

function formatChangeSummary(summary: SyncChangeSummary | undefined): string {
  if (!summary) {
    return "";
  }
  return [
    `${summary.added} added`,
    `${summary.updated} updated`,
    `${summary.removed} removed`,
    `${summary.unchanged} unchanged`,
    `${summary.completedMoved} moved to completed`,
    `${summary.completedPreserved} completed preserved`,
    `${summary.filtered} filtered`,
  ].join(", ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
