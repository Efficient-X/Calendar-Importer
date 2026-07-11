import { beforeEach, describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";
import { DEFAULT_SETTINGS } from "../src/defaults";
import { CalendarTaskSyncEngine } from "../src/syncEngine";
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
      `- [x] Safe update <!-- calendar-importer:event ${encodeURIComponent(eventId)} -->`,
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
    expect(content).toContain("## Completed Calendar Tasks\n- [x] Safe update");
    expect(content).not.toContain("- [ ] Safe update");
    expect(content).toContain("## My Calendar Events\n- [ ] Still active");
    expect(Object.values(settings.syncCache)).toHaveLength(1);
    expect(Object.values(settings.syncCache)[0].rendered).toContain("Still active");
  });
});
