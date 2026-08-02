import { Notice, Plugin, TFile, normalizePath } from "obsidian";
import { takeSyncBanter } from "./src/banter";
import { DEFAULT_SETTINGS, DEFAULT_TASK_TEMPLATE, LEGACY_TASK_TEMPLATES } from "./src/defaults";
import { ReleaseNotesModal } from "./src/releaseNotesModal";
import { CalendarTaskSyncSettingTab } from "./src/settings";
import { CalendarTaskSyncEngine } from "./src/syncEngine";
import { normalizeSettingsData } from "./src/settingsData";
import type { CalendarTaskSyncSettings, SyncResult } from "./src/types";

const PLUGIN_NAME = "Calendar Importer";
const LEGACY_PLUGIN_IDS = ["ical-events-to-tasks", "calendar-task-sync"];

export default class CalendarTaskSyncPlugin extends Plugin {
  settings: CalendarTaskSyncSettings = DEFAULT_SETTINGS;
  engine!: CalendarTaskSyncEngine;
  private syncIntervalId: number | null = null;
  private settingsSyncTimeoutId: number | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private hadStoredSettings = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.engine = new CalendarTaskSyncEngine(this.app, () => this.settings);

    this.addSettingTab(new CalendarTaskSyncSettingTab(this.app, this));
    this.addRibbonIcon("calendar-check", `${PLUGIN_NAME}: Sync now`, () => this.runSafely(() => this.syncNow()));
    this.registerCommands();
    this.scheduleSync();

    this.app.workspace.onLayoutReady(() => {
      this.runSafely(() => this.maybeShowReleaseNotes());
    });

    if (this.settings.syncOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        this.runSafely(() => this.syncNow("automatic"));
      });
    }
  }

  onunload(): void {
    this.clearScheduledSync();
    this.clearSettingsSyncTimeout();
  }

  async loadSettings(): Promise<void> {
    const loaded: unknown = await this.loadData();
    const loadedSettings = isSettingsData(loaded) ? loaded : await this.loadLegacySettings();
    this.hadStoredSettings = isSettingsData(loadedSettings) && Object.keys(loadedSettings).length > 0;
    this.settings = normalizeSettingsData(loadedSettings);
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
    await this.queueSettingsSave();
    this.rescheduleSync();
    if (this.settings.syncOnSettingsChange) {
      this.scheduleSettingsSync();
    } else {
      this.clearSettingsSyncTimeout();
    }
  }

  scheduleSync(): void {
    this.clearScheduledSync();
    const minutes = Math.max(5, Math.min(24 * 60, this.settings.syncFrequencyMinutes));
    this.syncIntervalId = window.setInterval(() => {
      this.runSafely(() => this.syncNow("automatic"));
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

  async syncNow(trigger: "manual" | "automatic" = "manual"): Promise<SyncResult | null> {
    const result = await this.engine.sync();

    if (result.skipped) {
      new Notice(`${PLUGIN_NAME}: sync already running, skipped.`);
      return result;
    }

    this.settings.lastSyncTime = new Date().toISOString();
    this.settings.lastSyncResult = result.message;
    this.settings.lastError = result.errors.length > 0 ? result.errors.join("\n") : "";
    const banter = takeSyncBanter(this.settings, this.settings.wittyBanterMode, trigger === "manual", result);
    await this.queueSettingsSave();

    if (result.success) {
      if (this.settings.errorReportingEnabled && result.reportCount > 0) {
        new Notice(`${PLUGIN_NAME}: synced ${result.eventCount} event${result.eventCount === 1 ? "" : "s"}. ${result.reportCount} item${result.reportCount === 1 ? " needs" : "s need"} attention; see Error Reporting in the calendar note.${banter ? ` “${banter}”` : ""}`);
      } else {
        new Notice(`${PLUGIN_NAME}: synced ${result.eventCount} event${result.eventCount === 1 ? "" : "s"}.${banter ? ` “${banter}”` : ""}`);
      }
    } else {
      const reason = summarizeSyncError(result.errors[0]);
      const reportHint = this.settings.errorReportingEnabled ? " See Error Reporting in the calendar note." : "";
      new Notice(`${PLUGIN_NAME}: sync failed${reason ? `: ${reason}` : "."}${reportHint}`);
    }

    return result;
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

  showReleaseNotes(): void {
    new ReleaseNotesModal(this.app, this.manifest.version).open();
  }

  async clearCompletedCalendarTasks(): Promise<void> {
    const result = await this.engine.clearCompletedCalendarTasks();
    await this.saveSettings();
    new Notice(`${PLUGIN_NAME}: cleared ${result.affectedCount} completed task${result.affectedCount === 1 ? "" : "s"}.`);
  }

  async reopenRecentCompletedCalendarTasks(): Promise<void> {
    const result = await this.engine.reopenCompletedCalendarTasks("recent");
    await this.saveSettings();
    new Notice(`${PLUGIN_NAME}: reopened ${result.affectedCount} recently completed task${result.affectedCount === 1 ? "" : "s"}.`);
  }

  async reopenAllCompletedCalendarTasks(): Promise<void> {
    const result = await this.engine.reopenCompletedCalendarTasks("all");
    await this.saveSettings();
    new Notice(`${PLUGIN_NAME}: reopened ${result.affectedCount} completed task${result.affectedCount === 1 ? "" : "s"}.`);
  }

  private registerCommands(): void {
    this.addCommand({
      id: "sync-now",
      name: "Sync now",
      callback: () => this.runSafely(() => this.syncNow()),
    });

    this.addCommand({
      id: "clear-sync-cache",
      name: "Clear sync cache",
      callback: () => this.runSafely(() => this.clearSyncCache()),
    });

    this.addCommand({
      id: "clear-completed-calendar-tasks",
      name: "Clear completed calendar tasks",
      callback: () => this.runSafely(() => this.clearCompletedCalendarTasks()),
    });

    this.addCommand({
      id: "reopen-recent-completed-calendar-tasks",
      name: "Reopen completed calendar tasks from the last 24 hours",
      callback: () => this.runSafely(() => this.reopenRecentCompletedCalendarTasks()),
    });

    this.addCommand({
      id: "reopen-all-completed-calendar-tasks",
      name: "Reopen all completed calendar tasks",
      callback: () => this.runSafely(() => this.reopenAllCompletedCalendarTasks()),
    });

    this.addCommand({
      id: "open-calendar-note",
      name: "Open calendar note",
      callback: () => this.runSafely(() => this.openCalendarNote()),
    });

    this.addCommand({
      id: "rebuild-calendar-note",
      name: "Rebuild calendar note",
      callback: () => this.runSafely(async () => {
        this.settings.syncCache = {};
        await this.saveData(this.settings);
        await this.syncNow("manual");
      }),
    });
  }

  private runSafely(action: () => Promise<unknown>): void {
    void action().catch((error: unknown) => {
      new Notice(`${PLUGIN_NAME}: ${errorMessage(error)}`);
    });
  }

  private queueSettingsSave(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.settings)) as CalendarTaskSyncSettings;
    const save = this.saveQueue
      .catch(() => undefined)
      .then(() => this.saveData(snapshot));
    this.saveQueue = save;
    return save;
  }

  private scheduleSettingsSync(): void {
    this.clearSettingsSyncTimeout();
    this.settingsSyncTimeoutId = window.setTimeout(() => {
      this.settingsSyncTimeoutId = null;
      this.runSafely(() => this.syncNow("automatic"));
    }, 1000);
  }

  private clearSettingsSyncTimeout(): void {
    if (this.settingsSyncTimeoutId !== null) {
      window.clearTimeout(this.settingsSyncTimeoutId);
      this.settingsSyncTimeoutId = null;
    }
  }

  private async maybeShowReleaseNotes(): Promise<void> {
    const version = this.manifest.version;
    if (!this.settings.lastSeenReleaseVersion) {
      this.settings.lastSeenReleaseVersion = version;
      await this.queueSettingsSave();
      if (!this.hadStoredSettings || !this.settings.showReleaseNotes) {
        return;
      }
      this.showReleaseNotes();
      return;
    }
    if (this.settings.lastSeenReleaseVersion === version || !this.settings.showReleaseNotes) {
      return;
    }
    this.settings.lastSeenReleaseVersion = version;
    await this.queueSettingsSave();
    this.showReleaseNotes();
  }
}

function isSettingsData(value: unknown): value is Partial<CalendarTaskSyncSettings> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizeSyncError(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
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
    .replace(new RegExp(calendarMojibake, "g"), String.fromCodePoint(0x1f4c5))
    .replace(new RegExp(scheduledMojibake, "g"), String.fromCodePoint(0x23f3))
    .replace(new RegExp(doneMojibake, "g"), String.fromCodePoint(0x2705))
    .replace(new RegExp(apostropheMojibake, "g"), "'");
}
