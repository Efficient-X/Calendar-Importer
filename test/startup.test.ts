import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App, PluginManifest } from "obsidian";
import CalendarTaskSyncPlugin from "../main.ts";
import { DEFAULT_SETTINGS } from "../src/defaults";

const mocks = vi.hoisted(() => ({ loadData: vi.fn(), saveData: vi.fn(), notice: vi.fn(), sync: vi.fn() }));
vi.mock("obsidian", () => ({
  Plugin: class {
    constructor(public app: App, public manifest: PluginManifest) {}
    loadData = mocks.loadData;
    saveData = mocks.saveData;
    addSettingTab = vi.fn();
    addRibbonIcon = vi.fn();
    addCommand = vi.fn();
    registerInterval = vi.fn();
  },
  Notice: class { constructor(message: string) { mocks.notice(message); } },
  TFile: class {},
  normalizePath: (path: string) => path,
}));
vi.mock("../src/settings", () => ({ CalendarTaskSyncSettingTab: class {} }));
vi.mock("../src/releaseNotesModal", () => ({ ReleaseNotesModal: class {} }));
vi.mock("../src/syncEngine", () => ({ CalendarTaskSyncEngine: class { sync = mocks.sync; } }));

describe("startup sync notices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { setInterval: vi.fn(() => 1), clearInterval: vi.fn(), clearTimeout: vi.fn() });
    mocks.saveData.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["tasteful", "off"] as const)("handles an unchanged startup sync in %s mode", async (mode) => {
    mocks.loadData.mockResolvedValue({ ...DEFAULT_SETTINGS, syncOnStartup: true, wittyBanterMode: mode,
      lastSeenReleaseVersion: "1.3.0", lastBanterAt: new Date().toISOString(), banterBag: ["I parse, therefore iCal."] });
    mocks.sync.mockResolvedValue({ success: true, skipped: false, eventCount: 1, message: "Synced.", errors: [], reportCount: 0,
      changeSummary: { added: 0, updated: 0, removed: 0, unchanged: 1, completedMoved: 0, completedPreserved: 0, filtered: 0 } });
    const ready: (() => void)[] = [];
    const app = { workspace: { onLayoutReady: (callback: () => void) => ready.push(callback) } } as unknown as App;
    const plugin = new CalendarTaskSyncPlugin(app, { version: "1.3.0" } as PluginManifest);
    await plugin.onload();
    expect(mocks.sync).not.toHaveBeenCalled();
    for (const callback of ready) callback();
    await vi.waitFor(() => expect(mocks.notice).toHaveBeenCalledOnce());
    const message = String(mocks.notice.mock.calls[0][0]);
    expect(message).toContain("synced 1 event");
    expect(message.includes("I parse, therefore iCal.")).toBe(mode === "tasteful");
    plugin.onunload();
  });
});
