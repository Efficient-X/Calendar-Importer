import { App, normalizePath, requestUrl, TFile, TFolder } from "obsidian";
import { DateTime } from "luxon";
import { formatTemplatePath, getSyncWindow } from "./dateUtils";
import { renderEventTask, resolveWikilinkFolderPath } from "./eventRenderer";
import { sortEvents } from "./eventSorter";
import { eventMatchesFeedFilters, parseIcsFeed } from "./icsParser";
import {
  buildManagedBlock,
  clearCompletedTasksFromNote,
  extractCompletedSectionTaskLines,
  extractCompletedTaskLines,
  getTaskIdentity,
  moveCompletedTasksToCompletedSection,
  reopenCompletedTasksInNote,
  removeCompletedTaskSection,
  replaceCompletedTaskSection,
  replaceManagedBlock,
} from "./noteWriter";
import { isLikelyIcs, maskUrl, normalizeFeedUrl, redactSensitiveUrls } from "./security";
import { prepareScopedSyncCache } from "./syncCache";
import type {
  CalendarTaskSyncSettings,
  CompletedTaskActionScope,
  NormalizedCalendarEvent,
  SyncCacheEntry,
  SyncChangeSummary,
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

export interface CompletedTaskActionSummary {
  affectedCount: number;
  noteCount: number;
}

const MAX_FEED_SIZE_BYTES = 25 * 1024 * 1024;
const EDITOR_SETTLE_DELAY_MS = 300;

export class CalendarTaskSyncEngine {
  private isRunning = false;

  constructor(
    private readonly app: App,
    private readonly getSettings: SettingsGetter,
  ) {}

  async sync(): Promise<SyncResult> {
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
      return await this.runSync();
    } finally {
      this.isRunning = false;
    }
  }

  async ensureCalendarNoteForToday(): Promise<TFile | null> {
    const settings = this.getSettings();
    const path = this.resolveNotePath(new Date(), settings);
    return this.ensureNote(path, settings.createNoteIfMissing);
  }

  async clearCompletedCalendarTasks(): Promise<CompletedTaskActionSummary> {
    return this.processCompletedCalendarTasks((content, settings) => clearCompletedTasksFromNote(content, settings));
  }

  async reopenCompletedCalendarTasks(scope: CompletedTaskActionScope): Promise<CompletedTaskActionSummary> {
    return this.processCompletedCalendarTasks((content, settings) => reopenCompletedTasksInNote(content, settings, scope));
  }

  private async runSync(): Promise<SyncResult> {
    const settings = this.getSettings();
    const errors: string[] = [];
    const window = getSyncWindow(settings.pastDays, settings.futureDays, settings.timezone);
    const enabledFeeds = settings.feeds.filter((feed) => feed.enabled && feed.url.trim());
    const events: NormalizedCalendarEvent[] = [];
    let filtered = 0;

    if (enabledFeeds.length === 0) {
      const message = "No enabled calendar feeds have a URL. Add or enable a feed before syncing. No notes were changed.";
      return {
        success: false,
        skipped: false,
        eventCount: 0,
        message,
        errors: [message],
      };
    }

    if (isBrowserOffline()) {
      const message = "No internet connection detected. Sync skipped and no notes were changed.";
      return {
        success: false,
        skipped: true,
        eventCount: 0,
        message,
        errors: [message],
      };
    }

    await this.settleAndSaveOpenMarkdownViews();

    for (const feed of enabledFeeds) {
      const feedResult = await this.fetchAndParseFeed(feed.id, errors, window);
      events.push(...feedResult.events);
      filtered += feedResult.filtered;
    }

    if (errors.length > 0) {
      return {
        success: false,
        skipped: false,
        eventCount: events.length,
        message: `Sync stopped safely after ${errors.length} error${errors.length === 1 ? "" : "s"}. No notes were changed.`,
        errors,
      };
    }

    await this.ensureLinkedNoteFolders(settings, errors);
    if (errors.length > 0) {
      return {
        success: false,
        skipped: false,
        eventCount: events.length,
        message: `Sync stopped safely after ${errors.length} error${errors.length === 1 ? "" : "s"}. No notes were changed.`,
        errors,
      };
    }

    const sortedEvents = sortEvents(events, settings);
    const writeResult = await this.writeEvents(sortedEvents, settings, window, errors, filtered);

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
        url: normalizeFeedUrl(feed.url),
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
      if (new TextEncoder().encode(text).byteLength > MAX_FEED_SIZE_BYTES) {
        errors.push(`${feed.name}: feed is larger than the 25 MB safety limit (${maskUrl(feed.url)}).`);
        return { events: [], filtered: 0 };
      }
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
      errors.push(`${feed.name}: could not fetch feed ${maskUrl(feed.url)}: ${redactSensitiveUrls(errorMessage(error))}`);
      return { events: [], filtered: 0 };
    }
  }

  private async writeEvents(
    events: NormalizedCalendarEvent[],
    settings: CalendarTaskSyncSettings,
    window: { start: Date; end: Date },
    errors: string[],
    filtered: number,
  ): Promise<{ notePath?: string; changeSummary: SyncChangeSummary }> {
    if (settings.useDailyNotes) {
      const summary = await this.writeDailyNotes(events, settings, window, errors, filtered);
      return { notePath: settings.dailyNoteTemplate, changeSummary: summary };
    }

    const path = this.resolveNotePath(new Date(), settings);
    const summary = await this.writeOneNote(path, events, settings, errors, filtered);
    return { notePath: path, changeSummary: summary };
  }

  private async ensureLinkedNoteFolders(settings: CalendarTaskSyncSettings, errors: string[]): Promise<void> {
    const folders = new Set(settings.feeds
      .filter((feed) => feed.enabled && feed.wikilinksEnabled)
      .map((feed) => resolveWikilinkFolderPath(feed))
      .filter(Boolean));

    for (const folder of folders) {
      try {
        await this.ensureExactFolder(folder);
      } catch (error) {
        errors.push(`${folder}: could not create linked note folder: ${errorMessage(error)}`);
      }
    }
  }

  private async ensureExactFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!normalized) {
      return;
    }

    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFolder) {
      return;
    }
    if (existing) {
      throw new Error("a file already exists at that path");
    }

    const parts = normalized.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const currentExisting = this.app.vault.getAbstractFileByPath(current);
      if (currentExisting instanceof TFolder) {
        continue;
      }
      if (currentExisting) {
        throw new Error(`a file already exists at ${current}`);
      }
      await this.app.vault.createFolder(current);
    }
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
      await this.saveOpenMarkdownViews(path);
      const file = await this.ensureNote(path, settings.createNoteIfMissing || events.length > 0);
      if (!file) {
        errors.push(`${path}: note does not exist and note creation is disabled.`);
        return emptySummary(filtered);
      }

      if (settings.backupBeforeSync) {
        const existing = await this.app.vault.read(file);
        const update = this.prepareNoteUpdate(path, events, settings, existing, filtered);
        if (update.content !== existing) {
          await this.createBackup(file, existing);
        }
      }

      const outcome: { plan?: BuildNotePlan } = {};
      await this.app.vault.process(file, (existing) => {
        const update = this.prepareNoteUpdate(path, events, settings, existing, filtered);
        outcome.plan = update.plan;
        return update.content;
      });
      if (!outcome.plan) {
        throw new Error("Could not prepare the note update.");
      }
      settings.syncCache = pruneSyncCache(outcome.plan.nextCache, settings);
      return outcome.plan.summary;
    } catch (error) {
      errors.push(`${path}: could not update note: ${errorMessage(error)}`);
      return emptySummary(filtered);
    }
  }

  private prepareNoteUpdate(
    path: string,
    events: NormalizedCalendarEvent[],
    settings: CalendarTaskSyncSettings,
    existing: string,
    filtered: number,
  ): { plan: BuildNotePlan; content: string } {
    if (settings.taskLayout === "chronological") {
      return this.prepareChronologicalNoteUpdate(path, events, settings, existing, filtered);
    }

    const completionMove = settings.completedTaskMode === "move-to-completed-section"
      ? moveCompletedTasksToCompletedSection(existing, settings)
      : undefined;
    const normalizedExisting = completionMove?.content ?? existing;
    const plan = this.buildNotePlan(path, events, settings, normalizedExisting, filtered);
    plan.summary.completedMoved += completionMove?.movedCount ?? 0;
    const activeReplacement = replaceManagedBlock(normalizedExisting, plan.activeBlock, settings);
    const completedReplacement = settings.completedTaskMode === "move-to-completed-section"
      ? replaceCompletedTaskSection(activeReplacement.content, plan.completedLines, settings)
      : activeReplacement;
    return { plan, content: completedReplacement.content };
  }

  private prepareChronologicalNoteUpdate(
    path: string,
    events: NormalizedCalendarEvent[],
    settings: CalendarTaskSyncSettings,
    existing: string,
    filtered: number,
  ): { plan: BuildNotePlan; content: string } {
    const completedLines = settings.preserveManualCompletion ? extractCompletedTaskLines(existing, settings) : {};
    const plan = this.buildChronologicalNotePlan(path, events, settings, completedLines, filtered);
    const withoutCompletedSection = removeCompletedTaskSection(existing, settings).content;
    const activeReplacement = replaceManagedBlock(withoutCompletedSection, plan.activeBlock, settings);
    return { plan, content: activeReplacement.content };
  }

  private buildChronologicalNotePlan(
    notePath: string,
    events: NormalizedCalendarEvent[],
    settings: CalendarTaskSyncSettings,
    completedLines: Record<string, string>,
    filtered: number,
  ): BuildNotePlan {
    const summary = emptySummary(filtered);
    const currentKeys = new Set(events.map((event) => event.instanceId));
    const scoped = prepareScopedSyncCache(settings.syncCache, notePath, currentKeys, settings.useDailyNotes);
    const scopedCache = scoped.current;
    const nextCache: Record<string, SyncCacheEntry> = scoped.next;
    const activeLines: { key: string; line: string }[] = [];
    const seenAt = new Date().toISOString();

    for (const event of events) {
      const uncheckedLine = renderEventTask(event, settings);
      const checkedLine = renderEventTask(event, settings, true);
      const taskIdentity = getTaskIdentity(uncheckedLine);
      const previous = scopedCache[event.instanceId];
      const previousIdentity = previous?.rendered ? getTaskIdentity(previous.rendered) : "";
      const preservedLine = settings.preserveManualCompletion
        ? completedLines[event.instanceId] ?? completedLines[taskIdentity] ?? completedLines[previousIdentity]
        : undefined;
      const completed = Boolean(preservedLine);
      const rendered = completed ? checkedLine : uncheckedLine;

      if (!previous) {
        summary.added += 1;
      } else if (getTaskIdentity(previous.rendered) !== taskIdentity || Boolean(previous.completed) !== completed) {
        summary.updated += 1;
      } else {
        summary.unchanged += 1;
      }

      if (completed) {
        summary.completedPreserved += 1;
      }

      nextCache[event.instanceId] = {
        key: event.instanceId,
        rendered,
        completed,
        lastSeen: seenAt,
        notePath,
      };
      activeLines.push({ key: event.instanceId, line: rendered });
    }

    for (const key of Object.keys(scopedCache)) {
      if (!currentKeys.has(key)) {
        summary.removed += 1;
      }
    }

    return {
      activeBlock: buildManagedBlock(activeLines, settings),
      completedLines: [],
      summary,
      nextCache,
    };
  }

  private buildNotePlan(
    notePath: string,
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
    const currentKeys = new Set(events.map((event) => event.instanceId));
    const scoped = prepareScopedSyncCache(settings.syncCache, notePath, currentKeys, settings.useDailyNotes);
    const scopedCache = scoped.current;
    const nextCache: Record<string, SyncCacheEntry> = scoped.next;
    // Step 2: render/cache every live feed event first; completed events are removed from this set below.
    const downloadedCalendar = events.map((event) => ({
      event,
      uncheckedLine: renderEventTask(event, settings),
    }));
    const downloadedCache: Record<string, SyncCacheEntry> = Object.fromEntries(downloadedCalendar.map(({ event, uncheckedLine }) => [
      event.instanceId,
      {
        key: event.instanceId,
        rendered: uncheckedLine,
        completed: false,
        lastSeen: new Date().toISOString(),
        notePath,
      },
    ]));
    const activeLines: { key: string; line: string }[] = [];
    const completedArchiveLines = [...existingCompletedSectionLines];
    const seenAt = new Date().toISOString();

    for (const { event, uncheckedLine } of downloadedCalendar) {
      const taskIdentity = getTaskIdentity(uncheckedLine);
      const previous = scopedCache[event.instanceId];
      const previousIdentity = previous?.rendered ? getTaskIdentity(previous.rendered) : "";
      const preservedLine = settings.preserveManualCompletion
        ? completedLines[event.instanceId] ?? completedLines[taskIdentity] ?? completedLines[previousIdentity]
        : undefined;
      const completed = Boolean(preservedLine);

      if (preservedLine && settings.completedTaskMode === "move-to-completed-section") {
        // Step 3: remove completed events from the freshly downloaded cache before rebuilding active tasks.
        delete downloadedCache[event.instanceId];
        completedArchiveLines.push(preservedLine);
        continue;
      }

      if (!previous) {
        summary.added += 1;
      } else if (getTaskIdentity(previous.rendered) !== taskIdentity) {
        summary.updated += 1;
      } else {
        summary.unchanged += 1;
      }

      downloadedCache[event.instanceId] = {
        key: event.instanceId,
        rendered: preservedLine ?? uncheckedLine,
        completed,
        lastSeen: seenAt,
        notePath,
      };

      if (completed) {
        summary.completedPreserved += 1;
      }

      activeLines.push({ key: event.instanceId, line: preservedLine ?? uncheckedLine });
    }

    Object.assign(nextCache, downloadedCache);

    for (const key of Object.keys(scopedCache)) {
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

  private async settleAndSaveOpenMarkdownViews(): Promise<void> {
    await delay(EDITOR_SETTLE_DELAY_MS);
    await this.saveOpenMarkdownViews();
  }

  private async saveOpenMarkdownViews(path?: string): Promise<void> {
    const normalizedPath = path ? normalizePath(path) : undefined;
    const leaves = this.app.workspace?.getLeavesOfType?.("markdown") ?? [];
    for (const leaf of leaves) {
      const view = leaf.view as unknown;
      if (isOpenTextFileView(view) && (!normalizedPath || view.file?.path === normalizedPath)) {
        await view.save();
      }
    }
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
    if (!folder) {
      return;
    }

    const parts = folder.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) {
        continue;
      }
      if (existing) {
        throw new Error(`${current} exists but is not a folder.`);
      }
      await this.app.vault.createFolder(current);
    }
  }

  private async createBackup(file: TFile, content: string): Promise<void> {
    const stamp = DateTime.now().toFormat("yyyyMMdd-HHmmss");
    const basePath = normalizePath(`${file.path}.${stamp}`);
    let backupPath = `${basePath}.bak`;
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(backupPath)) {
      backupPath = `${basePath}-${suffix}.bak`;
      suffix += 1;
    }
    await this.app.vault.create(backupPath, content);
  }

  private resolveNotePath(date: Date, settings: CalendarTaskSyncSettings): string {
    const path = settings.useDailyNotes
      ? formatTemplatePath(settings.dailyNoteTemplate, date, settings.timezone)
      : settings.calendarNotePath;
    return normalizePath(path);
  }

  private async processCompletedCalendarTasks(
    update: (content: string, settings: CalendarTaskSyncSettings) => {
      content: string;
      changed: boolean;
      affectedCount: number;
      affectedIdentities: string[];
    },
  ): Promise<CompletedTaskActionSummary> {
    const settings = this.getSettings();
    const paths = this.getManagedNotePaths(settings);
    const affectedIdentities = new Set<string>();
    let affectedCount = 0;
    let noteCount = 0;

    await this.settleAndSaveOpenMarkdownViews();

    for (const path of paths) {
      await this.saveOpenMarkdownViews(path);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        continue;
      }

      let changed = false;
      await this.app.vault.process(file, (existing) => {
        const result = update(existing, settings);
        changed = result.changed;
        affectedCount += result.affectedCount;
        for (const identity of result.affectedIdentities) {
          affectedIdentities.add(identity);
        }
        return result.content;
      });

      if (changed) {
        noteCount += 1;
      }
    }

    settings.syncCache = pruneSyncCache(removeCompletedEntriesFromCache(settings.syncCache, affectedIdentities), settings);
    return { affectedCount, noteCount };
  }

  private getManagedNotePaths(settings: CalendarTaskSyncSettings): string[] {
    if (!settings.useDailyNotes) {
      return [this.resolveNotePath(new Date(), settings)];
    }

    const window = getSyncWindow(settings.pastDays, settings.futureDays, settings.timezone);
    const paths = new Set<string>();
    let cursor = DateTime.fromJSDate(window.start).setZone(settings.timezone || "local").startOf("day");
    const end = DateTime.fromJSDate(window.end).setZone(settings.timezone || "local").startOf("day");
    while (cursor < end) {
      paths.add(this.resolveNotePath(cursor.toJSDate(), settings));
      cursor = cursor.plus({ days: 1 });
    }
    return [...paths];
  }
}

function groupEventsByPath(events: NormalizedCalendarEvent[], settings: CalendarTaskSyncSettings): Map<string, NormalizedCalendarEvent[]> {
  const grouped = new Map<string, NormalizedCalendarEvent[]>();
  for (const event of events) {
    const path = normalizePath(formatTemplatePath(settings.dailyNoteTemplate, event.start, settings.timezone, event.allDay));
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

function removeCompletedEntriesFromCache(
  cache: Record<string, SyncCacheEntry>,
  affectedIdentities: ReadonlySet<string>,
): Record<string, SyncCacheEntry> {
  if (affectedIdentities.size === 0) {
    return cache;
  }

  return Object.fromEntries(Object.entries(cache).filter(([key, entry]) => {
    if (affectedIdentities.has(key)) {
      return false;
    }
    const identity = entry.rendered ? getTaskIdentity(entry.rendered) : "";
    if (identity && affectedIdentities.has(identity)) {
      return false;
    }
    return true;
  }));
}

export function pruneSyncCache(
  cache: Record<string, SyncCacheEntry>,
  settings: CalendarTaskSyncSettings,
  now = new Date(),
): Record<string, SyncCacheEntry> {
  const retentionDays = Math.max(0, settings.syncCacheRetentionDays ?? 0);
  if (retentionDays === 0) {
    return cache;
  }

  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return Object.fromEntries(Object.entries(cache).filter(([, entry]) => {
    const lastSeen = Date.parse(entry.lastSeen);
    return Number.isNaN(lastSeen) || lastSeen >= cutoff;
  }));
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isOpenTextFileView(
  view: unknown,
): view is { file: TFile | null; save: () => Promise<void> } {
  if (!view || typeof view !== "object") {
    return false;
  }
  const candidate = view as { file?: TFile | null; save?: unknown };
  return typeof candidate.file?.path === "string" && typeof candidate.save === "function";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
