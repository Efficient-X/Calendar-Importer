import { Notice, Plugin, TFile, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, DEFAULT_TASK_TEMPLATE, LEGACY_TASK_TEMPLATES } from "./src/defaults";
import { CalendarTaskSyncSettingTab } from "./src/settings";
import { CalendarTaskSyncEngine } from "./src/syncEngine";
import type { CalendarFeedSetting, CalendarTaskSyncSettings, SyncResult } from "./src/types";

const PLUGIN_NAME = "Calendar Importer";
const LEGACY_PLUGIN_IDS = ["ical-events-to-tasks", "calendar-task-sync"];

export default class CalendarTaskSyncPlugin extends Plugin {
  settings: CalendarTaskSyncSettings = DEFAULT_SETTINGS;
  engine!: CalendarTaskSyncEngine;
  private syncIntervalId: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.engine = new CalendarTaskSyncEngine(this.app, () => this.settings);

    this.addSettingTab(new CalendarTaskSyncSettingTab(this.app, this));
    this.addRibbonIcon("calendar-check", `${PLUGIN_NAME}: Sync now`, () => this.runSafely(() => this.syncNow("ribbon")));
    this.registerCommands();
    this.scheduleSync();

    if (this.settings.syncOnStartup) {
      this.runSafely(() => this.syncNow("startup"));
    }
  }

  onunload(): void {
    this.clearScheduledSync();
  }

  async loadSettings(): Promise<void> {
    const loaded: unknown = await this.loadData();
    const loadedSettings = isSettingsData(loaded) ? loaded : await this.loadLegacySettings();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loadedSettings,
      feeds: normalizeFeedSettings(loadedSettings.feeds),
    };
    this.settings.taskTemplate = migrateTaskTemplate(repairSymbols(this.settings.taskTemplate));
    for (const entry of Object.values(this.settings.syncCache ?? {})) {
      entry.rendered = repairSymbols(entry.rendered);
    }
  }

  private async loadLegacySettings(): Promise<Partial<CalendarTaskSyncSettings>> {
    for (const legacyPath of this.getLegacyDataPaths()) {
      try {
        const path = normalizePath(legacyPath);
        if (!(await this.app.vault.adapter.exists(path))) {
          continue;
        }

        const raw = await this.app.vault.adapter.read(path);
        const parsed: unknown = JSON.parse(raw);
        if (isSettingsData(parsed)) {
          await this.saveData(parsed);
          return parsed;
        }
      } catch {
        // Ignore legacy migration failures and fall back to fresh defaults.
      }
    }

    return {};
  }

  private getLegacyDataPaths(): string[] {
    return LEGACY_PLUGIN_IDS.flatMap((legacyPluginId) => [
      `${this.app.vault.configDir}/plugins/${legacyPluginId}/data.json`,
      `${this.app.vault.configDir}/${legacyPluginId}.settings-memory.json`,
    ]);
  }

  async saveSettings(settings: CalendarTaskSyncSettings = this.settings): Promise<void> {
    this.settings = settings;
    await this.saveData(this.settings);
    this.rescheduleSync();
    if (this.settings.syncOnSettingsChange) {
      this.runSafely(() => this.syncNow("settings"));
    }
  }

  scheduleSync(): void {
    this.clearScheduledSync();
    const minutes = Math.max(5, Math.min(24 * 60, this.settings.syncFrequencyMinutes));
    this.syncIntervalId = window.setInterval(() => {
      this.runSafely(() => this.syncNow("scheduled"));
    }, minutes * 60 * 1000);
    this.registerInterval(this.syncIntervalId);
  }

  rescheduleSync(): void {
    this.scheduleSync();
  }

  clearScheduledSync(): void {
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  async syncNow(trigger: string): Promise<SyncResult | null> {
    const result = await this.engine.sync({ dryRun: false, trigger });
    this.settings.lastSyncTime = new Date().toISOString();
    this.settings.lastSyncResult = result.message;
    this.settings.lastError = result.errors.length > 0 ? result.errors.join("\n") : "";
    await this.saveData(this.settings);

    if (result.skipped) {
      new Notice(`${PLUGIN_NAME}: sync already running, skipped.`);
      return result;
    }

    if (result.success) {
      new Notice(`${PLUGIN_NAME}: synced ${result.eventCount} event${result.eventCount === 1 ? "" : "s"}.`);
    } else {
      new Notice(`${PLUGIN_NAME}: sync failed. Check settings for details.`);
    }

    return result;
  }

  async previewNextSync(): Promise<void> {
    const result = await this.engine.sync({ dryRun: true, trigger: "preview" });
    this.settings.lastSyncTime = new Date().toISOString();
    this.settings.lastSyncResult = result.message;
    this.settings.lastPreview = result.preview ?? "";
    this.settings.lastError = result.errors.join("\n");
    await this.saveData(this.settings);
    new Notice(result.success ? `${PLUGIN_NAME}: preview generated in settings.` : `${PLUGIN_NAME}: preview failed.`);
  }

  async openCalendarNote(): Promise<void> {
    const file = await this.engine.ensureCalendarNoteForToday();
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }

  async clearSyncCache(): Promise<void> {
    this.settings.syncCache = {};
    await this.saveSettings();
    new Notice(`${PLUGIN_NAME}: sync cache cleared.`);
  }

  private registerCommands(): void {
    this.addCommand({
      id: "sync-now",
      name: "Sync now",
      callback: () => this.runSafely(() => this.syncNow("manual")),
    });

    this.addCommand({
      id: "preview-next-sync",
      name: "Preview next sync",
      callback: () => this.runSafely(() => this.previewNextSync()),
    });

    this.addCommand({
      id: "clear-sync-cache",
      name: "Clear sync cache",
      callback: () => this.runSafely(() => this.clearSyncCache()),
    });

    this.addCommand({
      id: "rebuild-calendar-note",
      name: "Rebuild calendar note",
      callback: () => this.runSafely(async () => {
        this.settings.syncCache = {};
        await this.saveData(this.settings);
        await this.syncNow("rebuild");
      }),
    });
  }

  private runSafely(action: () => Promise<unknown>): void {
    void action().catch((error: unknown) => {
      new Notice(`${PLUGIN_NAME}: ${errorMessage(error)}`);
    });
  }
}

function isSettingsData(value: unknown): value is Partial<CalendarTaskSyncSettings> {
  return typeof value === "object" && value !== null;
}

function normalizeFeedSettings(value: unknown): CalendarFeedSetting[] {
  const feeds = Array.isArray(value) ? value : DEFAULT_SETTINGS.feeds;
  return feeds.filter(isRecord).map((feed, index) => {
    const enabledValue = feed.enabled;
    return {
      id: typeof feed.id === "string" ? feed.id : `feed-${index}`,
      name: typeof feed.name === "string" ? feed.name : "New calendar",
      url: typeof feed.url === "string" ? feed.url : "",
      color: typeof feed.color === "string" ? feed.color : "",
      sourceLabel: typeof feed.sourceLabel === "string" ? feed.sourceLabel : "",
      tags: typeof feed.tags === "string" ? feed.tags : "",
      includeKeywords: typeof feed.includeKeywords === "string" ? feed.includeKeywords : "",
      excludeKeywords: typeof feed.excludeKeywords === "string" ? feed.excludeKeywords : "",
      enabled: typeof enabledValue === "boolean" ? enabledValue : true,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function migrateTaskTemplate(value: string): string {
  const normalized = value.trim();
  if (LEGACY_TASK_TEMPLATES.map(repairSymbols).includes(normalized)) {
    return DEFAULT_TASK_TEMPLATE;
  }
  return value;
}

function repairSymbols(value: string): string {
  const calendarMojibake = String.fromCodePoint(0x00f0, 0x0178, 0x201c, 0x2026);
  const scheduledMojibake = String.fromCodePoint(0x00e2, 0x008f, 0x00b3);
  const doneMojibake = String.fromCodePoint(0x00e2, 0x0153, 0x2026);
  const apostropheMojibake = String.fromCodePoint(0x00e2, 0x20ac, 0x2122);
  return value
    .replace(new RegExp(calendarMojibake, "g"), "📅")
    .replace(new RegExp(scheduledMojibake, "g"), "â³")
    .replace(new RegExp(doneMojibake, "g"), "âœ…")
    .replace(new RegExp(apostropheMojibake, "g"), "'");
}
