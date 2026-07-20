import { beforeEach, describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";
import { DEFAULT_SETTINGS } from "../src/defaults";
import { CalendarTaskSyncEngine, pruneSyncCache } from "../src/syncEngine";
import type { CalendarTaskSyncSettings } from "../src/types";

const mocks = vi.hoisted(() => ({
  requestUrl: vi.fn(),
}));

vi.mock("obsidian", () => ({
  normalizePath: (value: string) => value.replace(/\\/g, "/"),
  requestUrl: mocks.requestUrl,
  TFile: class TFile {},
  TFolder: class TFolder {},
}));

describe("sync write safety", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-07-15T00:00:00Z").getTime());
    vi.stubGlobal("window", { setTimeout });
    vi.stubGlobal("navigator", { onLine: true });
    mocks.requestUrl.mockReset();
  });

  it("does not touch notes when a feed request fails", async () => {
    const process = vi.fn();
    const app = {
      vault: {
        process,
      },
    } as unknown as App;
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      feeds: [{
        id: "private-feed",
        name: "Private calendar",
        url: "https://calendar.example/private/secret-token/basic.ics",
        enabled: true,
      }],
    };
    mocks.requestUrl.mockRejectedValue(new Error(`Failed ${settings.feeds[0].url}`));

    const result = await new CalendarTaskSyncEngine(app, () => settings).sync();

    expect(result.success).toBe(false);
    expect(result.message).toContain("No notes were changed");
    expect(result.errors.join("\n")).not.toContain("secret-token");
    expect(process).not.toHaveBeenCalled();
  });

  it("does not clear notes when no enabled feed has a URL", async () => {
    const process = vi.fn();
    const app = { vault: { process } } as unknown as App;
    const settings: CalendarTaskSyncSettings = { ...DEFAULT_SETTINGS, feeds: [] };

    const result = await new CalendarTaskSyncEngine(app, () => settings).sync();

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("No enabled calendar feeds");
    expect(process).not.toHaveBeenCalled();
  });

  it("records a failed feed in Error Reporting without replacing calendar tasks", async () => {
    let content = "## My Calendar Events\n- [ ] Keep this task\n";
    const file = new TFile();
    Object.assign(file, { path: "Calendar/My Calendar Events.md" });
    const app = {
      workspace: { getLeavesOfType: vi.fn(() => []) },
      vault: {
        getAbstractFileByPath: vi.fn(() => file),
        process: vi.fn(async (_file: TFile, update: (value: string) => string) => {
          content = update(content);
          return content;
        }),
      },
    } as unknown as App;
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      feeds: [{
        id: "private-feed",
        name: "Private calendar",
        url: "https://calendar.example/private/secret-token/basic.ics",
        enabled: true,
      }],
    };
    mocks.requestUrl.mockRejectedValue(new Error(`Failed ${settings.feeds[0].url}`));

    const result = await new CalendarTaskSyncEngine(app, () => settings).sync();

    expect(result.success).toBe(false);
    expect(result.notePath).toBe("Calendar/My Calendar Events.md");
    expect(content).toContain("- [ ] Keep this task");
    expect(content).toContain("## Error Reporting");
    expect(content).toContain("Calendar feed needs attention");
    expect(content).not.toContain("secret-token");
  });

  it("skips sync before fetching or writing when the device is offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const process = vi.fn();
    const getLeavesOfType = vi.fn(() => []);
    const app = {
      workspace: { getLeavesOfType },
      vault: { process },
    } as unknown as App;
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      feeds: [{
        id: "work",
        name: "Work",
        url: "https://calendar.example/work.ics",
        enabled: true,
      }],
    };

    const result = await new CalendarTaskSyncEngine(app, () => settings).sync();

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.errors[0]).toContain("No internet connection detected");
    expect(mocks.requestUrl).not.toHaveBeenCalled();
    expect(getLeavesOfType).not.toHaveBeenCalled();
    expect(process).not.toHaveBeenCalled();
  });

  it("updates notes through Vault.process and records their cache path", async () => {
    let content = "# Calendar\n";
    const file = new TFile();
    Object.assign(file, { path: "Calendar/My Calendar Events.md" });
    const process = vi.fn(async (_file: TFile, update: (value: string) => string) => {
      content = update(content);
      return content;
    });
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => file),
        process,
      },
    } as unknown as App;
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      timezone: "UTC",
      feeds: [{
        id: "work",
        name: "Work",
        url: "https://calendar.example/work.ics",
        enabled: true,
      }],
    };
    mocks.requestUrl.mockResolvedValue({
      status: 200,
      text: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:sync-test",
        "SUMMARY:Safe update",
        "DTSTART:20260716T090000Z",
        "DTEND:20260716T100000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    });

    const result = await new CalendarTaskSyncEngine(app, () => settings).sync();

    expect(result.success).toBe(true);
    expect(process).toHaveBeenCalledOnce();
    expect(content).toContain("Safe update");
    expect(Object.values(settings.syncCache)[0].notePath).toBe("Calendar/My Calendar Events.md");
  });

  it("moves checked tasks first, filters them from the cache, and rebuilds only active tasks", async () => {
    const eventId = "work:sync-test:2026-07-16T09:00:00Z";
    let content = [
      "## My Calendar Events",
      `- [x] Safe update - Thursday - 09:00-10:00 📅 2026-07-16 <!-- calendar-importer:event ${encodeURIComponent(eventId)} -->`,
      "",
      "## Completed Calendar Tasks",
      "",
    ].join("\n");
    const file = new TFile();
    Object.assign(file, { path: "Calendar/My Calendar Events.md" });
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => file),
        process: vi.fn(async (_file: TFile, update: (value: string) => string) => {
          content = update(content);
          return content;
        }),
      },
    } as unknown as App;
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      timezone: "UTC",
      feeds: [{ id: "work", name: "Work", url: "https://calendar.example/work.ics", enabled: true }],
    };
    mocks.requestUrl.mockResolvedValue({
      status: 200,
      text: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:sync-test",
        "SUMMARY:Safe update",
        "DTSTART:20260716T090000Z",
        "DTEND:20260716T100000Z",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:still-active",
        "SUMMARY:Still active",
        "DTSTART:20260717T090000Z",
        "DTEND:20260717T100000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    });

    const result = await new CalendarTaskSyncEngine(app, () => settings).sync();

    expect(result.success).toBe(true);
    expect(result.changeSummary?.completedMoved).toBe(1);
    expect(content).toContain("## Completed Calendar Tasks\n- [x] Safe update - Thursday - 09:00-10:00 📅 2026-07-16");
    expect(content).not.toContain("- [ ] Safe update - Thursday - 09:00-10:00 📅 2026-07-16");
    expect(content).toContain("## My Calendar Events\n- [ ] Still active");
    expect(content).not.toContain("calendar-importer:event");
    expect(Object.values(settings.syncCache)).toHaveLength(1);
    expect(Object.values(settings.syncCache)[0].rendered).toContain("Still active");
    expect(Object.values(settings.syncCache)[0].rendered).not.toContain("calendar-importer:event");
  });

  it("saves an open calendar note before moving checked tasks", async () => {
    let content = [
      "## My Calendar Events",
      "- [ ] Safe update - Thursday - 09:00-10:00 ðŸ“… 2026-07-16",
      "",
      "## Completed Calendar Tasks",
      "",
    ].join("\n");
    const editorContent = content.replace("- [ ] Safe update", "- [x] Safe update");
    const file = new TFile();
    Object.assign(file, { path: "Calendar/My Calendar Events.md" });
    const save = vi.fn(async () => {
      content = editorContent;
    });
    const process = vi.fn(async (_file: TFile, update: (value: string) => string) => {
      content = update(content);
      return content;
    });
    const app = {
      workspace: {
        getLeavesOfType: vi.fn(() => [{
          view: {
            file,
            save,
          },
        }]),
      },
      vault: {
        getAbstractFileByPath: vi.fn(() => file),
        process,
      },
    } as unknown as App;
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      syncCache: {},
      timezone: "UTC",
      feeds: [{ id: "work", name: "Work", url: "https://calendar.example/work.ics", enabled: true }],
    };
    mocks.requestUrl.mockResolvedValue({
      status: 200,
      text: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:sync-test",
        "SUMMARY:Safe update",
        "DTSTART:20260716T090000Z",
        "DTEND:20260716T100000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    });

    const result = await new CalendarTaskSyncEngine(app, () => settings).sync();

    expect(result.success).toBe(true);
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(process.mock.invocationCallOrder[0]);
    expect(result.changeSummary?.completedMoved).toBe(1);
    expect(content).toContain("## My Calendar Events\n\n## Completed Calendar Tasks");
    expect(content).toContain("## Completed Calendar Tasks\n- [x] Safe update - Thursday - 09:00-10:00 📅 2026-07-16");
    expect(content).not.toContain("- [ ] Safe update - Thursday - 09:00-10:00 📅 2026-07-16");
    expect(Object.values(settings.syncCache)).toHaveLength(0);
  });

  it("lets other open markdown views settle before reading the calendar note", async () => {
    let content = [
      "## My Calendar Events",
      "- [ ] Safe update - Thursday - 09:00-10:00 ðŸ“… 2026-07-16",
      "",
      "## Completed Calendar Tasks",
      "",
    ].join("\n");
    const file = new TFile();
    Object.assign(file, { path: "Calendar/My Calendar Events.md" });
    const dailyFile = new TFile();
    Object.assign(dailyFile, { path: "Daily/2026-07-16.md" });
    const dailySave = vi.fn(async () => {
      content = content.replace("- [ ] Safe update", "- [x] Safe update");
    });
    const process = vi.fn(async (_file: TFile, update: (value: string) => string) => {
      content = update(content);
      return content;
    });
    const app = {
      workspace: {
        getLeavesOfType: vi.fn(() => [{
          view: {
            file: dailyFile,
            save: dailySave,
          },
        }]),
      },
      vault: {
        getAbstractFileByPath: vi.fn(() => file),
        process,
      },
    } as unknown as App;
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      syncCache: {},
      timezone: "UTC",
      feeds: [{ id: "work", name: "Work", url: "https://calendar.example/work.ics", enabled: true }],
    };
    mocks.requestUrl.mockResolvedValue({
      status: 200,
      text: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:sync-test",
        "SUMMARY:Safe update",
        "DTSTART:20260716T090000Z",
        "DTEND:20260716T100000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    });

    const result = await new CalendarTaskSyncEngine(app, () => settings).sync();

    expect(result.success).toBe(true);
    expect(dailySave.mock.invocationCallOrder[0]).toBeLessThan(mocks.requestUrl.mock.invocationCallOrder[0]);
    expect(result.changeSummary?.completedMoved).toBe(1);
    expect(content).toContain("## Completed Calendar Tasks\n- [x] Safe update - Thursday - 09:00-10:00 📅 2026-07-16");
    expect(content).not.toContain("- [ ] Safe update - Thursday - 09:00-10:00 📅 2026-07-16");
    expect(Object.values(settings.syncCache)).toHaveLength(0);
  });

  it("does not rebuild completed events when Tasks moves tags before the due date", async () => {
    let content = [
      "## My Calendar Events",
      "",
      "## Completed Calendar Tasks",
      "- [x] Safe update - Thursday - 09:00-10:00 #Work 📅 2026-07-16 ✅ 2026-07-17",
      "",
    ].join("\n");
    const file = new TFile();
    Object.assign(file, { path: "Calendar/My Calendar Events.md" });
    const app = {
      workspace: {
        getLeavesOfType: vi.fn(() => []),
      },
      vault: {
        getAbstractFileByPath: vi.fn(() => file),
        process: vi.fn(async (_file: TFile, update: (value: string) => string) => {
          content = update(content);
          return content;
        }),
      },
    } as unknown as App;
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      syncCache: {},
      timezone: "UTC",
      feeds: [{ id: "work", name: "Work", url: "https://calendar.example/work.ics", enabled: true, tags: "#Work" }],
    };
    mocks.requestUrl.mockResolvedValue({
      status: 200,
      text: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:sync-test",
        "SUMMARY:Safe update",
        "DTSTART:20260716T090000Z",
        "DTEND:20260716T100000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    });

    const result = await new CalendarTaskSyncEngine(app, () => settings).sync();

    expect(result.success).toBe(true);
    expect(content).toContain("## Completed Calendar Tasks\n- [x] Safe update - Thursday - 09:00-10:00 #Work 📅 2026-07-16 ✅ 2026-07-17");
    expect(content).not.toContain("- [ ] Safe update - Thursday - 09:00-10:00 📅 2026-07-16 #Work");
    expect(Object.values(settings.syncCache)).toHaveLength(0);
  });

  it("keeps completed tasks checked in chronological layout", async () => {
    let content = [
      "## My Calendar Events",
      "- [x] Safe update - Thursday - 09:00-10:00 #Work ðŸ“… 2026-07-16 âœ… 2026-07-17",
      "- [ ] Still active - Friday - 09:00-10:00 ðŸ“… 2026-07-17 #Work",
      "",
      "## Completed Calendar Tasks",
      "- [x] Old classic item - Wednesday - All day #Work ðŸ“… 2026-07-15 âœ… 2026-07-15",
      "",
    ].join("\n");
    const file = new TFile();
    Object.assign(file, { path: "Calendar/My Calendar Events.md" });
    const app = {
      workspace: { getLeavesOfType: vi.fn(() => []) },
      vault: {
        getAbstractFileByPath: vi.fn(() => file),
        process: vi.fn(async (_file: TFile, update: (value: string) => string) => {
          content = update(content);
          return content;
        }),
      },
    } as unknown as App;
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      taskLayout: "chronological",
      syncCache: {},
      timezone: "UTC",
      feeds: [{ id: "work", name: "Work", url: "https://calendar.example/work.ics", enabled: true, tags: "#Work" }],
    };
    mocks.requestUrl.mockResolvedValue({
      status: 200,
      text: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:sync-test",
        "SUMMARY:Safe update",
        "DTSTART:20260716T090000Z",
        "DTEND:20260716T100000Z",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:still-active",
        "SUMMARY:Still active",
        "DTSTART:20260717T090000Z",
        "DTEND:20260717T100000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    });

    const result = await new CalendarTaskSyncEngine(app, () => settings).sync();

    expect(result.success).toBe(true);
    expect(content).toContain("## My Calendar Events\n- [x] Safe update - Thursday - 09:00-10:00");
    expect(content).toContain("- [ ] Still active - Friday - 09:00-10:00");
    expect(content).not.toContain("## Completed Calendar Tasks");
    expect(content).not.toContain("Old classic item");
    expect(Object.values(settings.syncCache)).toHaveLength(2);
    expect(settings.syncCache["work:sync-test:2026-07-16T09:00:00Z"]?.completed).toBe(true);
  });

  it("allows tasks to be unchecked again in chronological layout", async () => {
    let content = [
      "## My Calendar Events",
      "- [ ] Safe update - Thursday - 09:00-10:00 ðŸ“… 2026-07-16 #Work",
      "",
    ].join("\n");
    const file = new TFile();
    Object.assign(file, { path: "Calendar/My Calendar Events.md" });
    const app = {
      workspace: { getLeavesOfType: vi.fn(() => []) },
      vault: {
        getAbstractFileByPath: vi.fn(() => file),
        process: vi.fn(async (_file: TFile, update: (value: string) => string) => {
          content = update(content);
          return content;
        }),
      },
    } as unknown as App;
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      taskLayout: "chronological",
      syncCache: {
        "work:sync-test:2026-07-16T09:00:00Z": {
          key: "work:sync-test:2026-07-16T09:00:00Z",
          rendered: "- [x] Safe update - Thursday - 09:00-10:00 ðŸ“… 2026-07-16 #Work",
          completed: true,
          lastSeen: "2026-07-17T00:00:00.000Z",
          notePath: "Calendar/My Calendar Events.md",
        },
      },
      timezone: "UTC",
      feeds: [{ id: "work", name: "Work", url: "https://calendar.example/work.ics", enabled: true, tags: "#Work" }],
    };
    mocks.requestUrl.mockResolvedValue({
      status: 200,
      text: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:sync-test",
        "SUMMARY:Safe update",
        "DTSTART:20260716T090000Z",
        "DTEND:20260716T100000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    });

    const result = await new CalendarTaskSyncEngine(app, () => settings).sync();

    expect(result.success).toBe(true);
    expect(content).toContain("## My Calendar Events\n- [ ] Safe update - Thursday - 09:00-10:00");
    expect(content).not.toContain("- [x] Safe update");
    expect(settings.syncCache["work:sync-test:2026-07-16T09:00:00Z"]?.completed).toBe(false);
  });

  it("migrates completed classic tasks into the one chronological list", async () => {
    let content = [
      "## My Calendar Events",
      "",
      "## Completed Calendar Tasks",
      "- [x] Safe update - Thursday - 09:00-10:00 #Work ðŸ“… 2026-07-16 âœ… 2026-07-17",
      "",
    ].join("\n");
    const file = new TFile();
    Object.assign(file, { path: "Calendar/My Calendar Events.md" });
    const app = {
      workspace: { getLeavesOfType: vi.fn(() => []) },
      vault: {
        getAbstractFileByPath: vi.fn(() => file),
        process: vi.fn(async (_file: TFile, update: (value: string) => string) => {
          content = update(content);
          return content;
        }),
      },
    } as unknown as App;
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      taskLayout: "chronological",
      syncCache: {},
      timezone: "UTC",
      feeds: [{ id: "work", name: "Work", url: "https://calendar.example/work.ics", enabled: true, tags: "#Work" }],
    };
    mocks.requestUrl.mockResolvedValue({
      status: 200,
      text: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:sync-test",
        "SUMMARY:Safe update",
        "DTSTART:20260716T090000Z",
        "DTEND:20260716T100000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    });

    const result = await new CalendarTaskSyncEngine(app, () => settings).sync();

    expect(result.success).toBe(true);
    expect(content).toContain("## My Calendar Events\n- [x] Safe update - Thursday - 09:00-10:00");
    expect(content).not.toContain("## Completed Calendar Tasks");
    expect(Object.values(settings.syncCache)).toHaveLength(1);
    expect(settings.syncCache["work:sync-test:2026-07-16T09:00:00Z"]?.completed).toBe(true);
  });

  it("reopens completed tasks through the engine action", async () => {
    const calendarMarker = String.fromCodePoint(0x1f4c5);
    const doneMarker = String.fromCodePoint(0x2705);
    let content = [
      "## My Calendar Events",
      "",
      "## Completed Calendar Tasks",
      `- [x] Accidental tick - Sunday - 09:00-10:00 ${calendarMarker} 2026-07-12 ${doneMarker} 2026-07-12`,
      `- [x] Properly done - Monday - 09:00-10:00 ${calendarMarker} 2026-07-13 ${doneMarker} 2026-07-01`,
      "",
    ].join("\n");
    const file = new TFile();
    Object.assign(file, { path: "Calendar/My Calendar Events.md" });
    const app = {
      workspace: { getLeavesOfType: vi.fn(() => []) },
      vault: {
        getAbstractFileByPath: vi.fn(() => file),
        process: vi.fn(async (_file: TFile, update: (value: string) => string) => {
          content = update(content);
          return content;
        }),
      },
    } as unknown as App;
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      timezone: "UTC",
      feeds: [{ id: "work", name: "Work", url: "https://calendar.example/work.ics", enabled: true }],
      syncCache: {
        accidental: {
          key: "accidental",
          rendered: `- [x] Accidental tick - Sunday - 09:00-10:00 ${calendarMarker} 2026-07-12 ${doneMarker} 2026-07-12`,
          completed: true,
          lastSeen: "2026-07-12T00:00:00.000Z",
          notePath: "Calendar/My Calendar Events.md",
        },
        done: {
          key: "done",
          rendered: `- [x] Properly done - Monday - 09:00-10:00 ${calendarMarker} 2026-07-13 ${doneMarker} 2026-07-01`,
          completed: true,
          lastSeen: "2026-07-12T00:00:00.000Z",
          notePath: "Calendar/My Calendar Events.md",
        },
      },
    };

    const result = await new CalendarTaskSyncEngine(app, () => settings).reopenCompletedCalendarTasks("all");

    expect(result.affectedCount).toBe(2);
    expect(content).toContain(`## My Calendar Events\n- [ ] Accidental tick - Sunday - 09:00-10:00 ${calendarMarker} 2026-07-12`);
    expect(content).toContain("## Completed Calendar Tasks\n");
    expect(settings.syncCache.accidental).toBeUndefined();
    expect(settings.syncCache.done).toBeUndefined();
  });

  it("prunes old sync cache entries unless retention is set to keep history", () => {
    const cache = {
      old: {
        key: "old",
        rendered: "- [ ] Old",
        lastSeen: "2020-01-01T00:00:00.000Z",
      },
      fresh: {
        key: "fresh",
        rendered: "- [ ] Fresh",
        lastSeen: "2026-07-12T00:00:00.000Z",
      },
    };
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      syncCacheRetentionDays: 365,
    };

    expect(pruneSyncCache(cache, settings, new Date("2026-07-12T12:00:00.000Z"))).toEqual({
      fresh: cache.fresh,
    });
    expect(pruneSyncCache(cache, { ...settings, syncCacheRetentionDays: 0 }, new Date("2026-07-12T12:00:00.000Z"))).toEqual(cache);
  });

  it("creates configured wikilink folders before writing linked event tasks", async () => {
    let content = "## My Calendar Events\n";
    const file = new TFile();
    Object.assign(file, { path: "Calendar/My Calendar Events.md" });
    const createFolder = vi.fn(async () => undefined);
    const app = {
      workspace: { getLeavesOfType: vi.fn(() => []) },
      vault: {
        getAbstractFileByPath: vi.fn((path: string) => path === "Calendar/My Calendar Events.md" ? file : null),
        createFolder,
        process: vi.fn(async (_file: TFile, update: (value: string) => string) => {
          content = update(content);
          return content;
        }),
      },
    } as unknown as App;
    const settings: CalendarTaskSyncSettings = {
      ...DEFAULT_SETTINGS,
      syncCache: {},
      timezone: "UTC",
      feeds: [{
        id: "work",
        name: "Work",
        url: "https://calendar.example/work.ics",
        enabled: true,
        wikilinksEnabled: true,
        wikilinkDisplayMode: "alias",
        wikilinkPrefixFormat: "yyMMdd - ",
        wikilinkFolder: "Calendar Events/Work",
      }],
    };
    mocks.requestUrl.mockResolvedValue({
      status: 200,
      text: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:sync-test",
        "SUMMARY:Safe update",
        "DTSTART:20260716T090000Z",
        "DTEND:20260716T100000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    });

    const result = await new CalendarTaskSyncEngine(app, () => settings).sync();

    expect(result.success).toBe(true);
    expect(createFolder).toHaveBeenCalledWith("Calendar Events");
    expect(createFolder).toHaveBeenCalledWith("Calendar Events/Work");
    expect(content).toContain("[[Calendar Events/Work/260716 - Safe update|Safe update]]");
  });
});
