import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type CalendarTaskSyncPlugin from "../main";
import { DEFAULT_TASK_TEMPLATE } from "./defaults";
import { buildTaskPreview } from "./eventRenderer";
import type { CalendarFeedSetting } from "./types";
import { maskUrl } from "./security";

const PLUGIN_NAME = "Calendar Importer";
const SUPPORT_URL = "https://buymeacoffee.com/efficientx";

const FEED_COLOURS = [
  { name: "None", value: "" },
  { name: "Slate", value: "#64748b" },
  { name: "Red", value: "#ef4444" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Pink", value: "#ec4899" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Yellow", value: "#eab308" },
  { name: "Lime", value: "#84cc16" },
  { name: "Green", value: "#22c55e" },
  { name: "Emerald", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Purple", value: "#a855f7" },
];

export class CalendarTaskSyncSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CalendarTaskSyncPlugin) {
    super(app, plugin);
  }

  display(): void {
    this.render();
  }

  private render(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("calendar-importer-settings");

    new Setting(containerEl).setName(PLUGIN_NAME).setHeading();
    containerEl.createEl("p", {
      text: "Import iCal/ICS calendar feeds into Obsidian as task lines that work well with the Tasks plugin. Private calendar URLs expose calendar data, so treat them like passwords.",
    });
    const support = containerEl.createDiv({ cls: "calendar-importer-support" });
    support.createEl("span", { text: "Built by Efficient X Group." });
    const supportLink = support.createEl("a", { text: "Support development", href: SUPPORT_URL });
    supportLink.setAttr("target", "_blank");
    supportLink.setAttr("rel", "noopener");
    this.renderStatus(containerEl);

    this.renderQuickActions(containerEl);
    this.renderFeeds(containerEl);
    this.renderSyncSettings(containerEl);
    this.renderNoteSettings(containerEl);
    this.renderRenderingSettings(containerEl);
    this.renderSafetySettings(containerEl);
    this.renderDebugSettings(containerEl);
  }

  private renderStatus(containerEl: HTMLElement): void {
    const status = containerEl.createDiv({ cls: "calendar-importer-status" });
    status.createEl("div", {
      cls: "calendar-importer-status-title",
      text: this.plugin.settings.lastSyncResult ? "Last sync" : "Ready",
    });
    status.createEl("div", {
      cls: "calendar-importer-status-body",
      text: this.plugin.settings.lastSyncResult || "Add a calendar feed, then run a preview or sync.",
    });
    status.createEl("div", {
      cls: "calendar-importer-status-meta",
      text: this.plugin.settings.lastSyncTime || "No sync has run yet.",
    });
  }

  private renderQuickActions(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Quick actions").setHeading();

    new Setting(containerEl)
      .setName("Sync now")
      .setDesc("Runs a real sync immediately. Optional hotkey: open Obsidian Settings > Hotkeys and search for Calendar Importer: Sync now.")
      .addButton((button) => button
        .setCta()
        .setButtonText("Sync now")
        .onClick(() => this.runSafely(() => this.plugin.syncNow("settings-button"))));

    new Setting(containerEl)
      .setName("Preview next sync")
      .setDesc("Shows what the next sync would do without changing your notes.")
      .addButton((button) => button
        .setButtonText("Preview")
        .onClick(() => this.runSafely(() => this.plugin.previewNextSync())));
  }

  private renderFeeds(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Calendar feeds").setHeading();

    for (const feed of this.plugin.settings.feeds) {
      const details = containerEl.createEl("details");
      details.addClass("calendar-importer-feed");
      details.open = true;
      const summary = details.createEl("summary", { text: feed.name || "Unnamed feed" });

      new Setting(details)
        .setName("Enabled")
        .addToggle((toggle) => toggle
          .setValue(feed.enabled)
          .onChange(async (value) => {
            feed.enabled = value;
            await this.plugin.saveSettings();
          }));

      new Setting(details)
        .setName("Feed name")
        .addText((text) => {
          protectTextInput(text.inputEl);
          text
            .setPlaceholder("Work calendar")
            .setValue(feed.name)
            .onChange(async (value) => {
              feed.name = value;
              summary.setText(value.trim() || "Unnamed feed");
              await this.plugin.saveSettings();
            });
        });

      new Setting(details)
        .setName("iCal URL")
        .setDesc(feed.url ? `Stored as ${maskUrl(feed.url)}` : "Paste a private Google Calendar iCal URL.")
        .addText((text) => {
          text.inputEl.type = "password";
          protectTextInput(text.inputEl);
          text
            .setPlaceholder("https://calendar.google.com/calendar/ical/...")
            .setValue(feed.url)
            .onChange(async (value) => {
              feed.url = value.trim();
              await this.plugin.saveSettings();
            });
        });

      new Setting(details)
        .setName("Source label")
        .setDesc("Optional label available as {{source}} or {{calendarName}}.")
        .addText((text) => {
          protectTextInput(text.inputEl);
          text
            .setPlaceholder(feed.name)
            .setValue(feed.sourceLabel ?? "")
            .onChange(async (value) => {
              feed.sourceLabel = value;
              await this.plugin.saveSettings();
            });
        });

      this.addColourSetting(details, feed);

      new Setting(details)
        .setName("Feed tags")
        .setDesc("Tags added only to tasks from this feed.")
        .addText((text) => {
          protectTextInput(text.inputEl);
          text
            .setPlaceholder("#shared-calendar")
            .setValue(feed.tags ?? "")
            .onChange(async (value) => {
              feed.tags = value;
              await this.plugin.saveSettings();
            });
        });

      new Setting(details)
        .setName("Include keywords")
        .setDesc("Optional comma-separated words. If set, only matching events from this feed are included.")
        .addText((text) => {
          protectTextInput(text.inputEl);
          text
            .setPlaceholder("medical, school")
            .setValue(feed.includeKeywords ?? "")
            .onChange(async (value) => {
              feed.includeKeywords = value;
              await this.plugin.saveSettings();
            });
        });

      new Setting(details)
        .setName("Exclude keywords")
        .setDesc("Optional comma-separated words. Matching events from this feed are skipped.")
        .addText((text) => {
          protectTextInput(text.inputEl);
          text
            .setPlaceholder("cancelled, reminder")
            .setValue(feed.excludeKeywords ?? "")
            .onChange(async (value) => {
              feed.excludeKeywords = value;
              await this.plugin.saveSettings();
            });
        });

      new Setting(details)
        .setName("Remove feed")
        .addButton((button) => button
          .setDestructive()
          .setButtonText("Remove")
          .onClick(() => this.runSafely(async () => {
            this.plugin.settings.feeds = this.plugin.settings.feeds.filter((candidate) => candidate.id !== feed.id);
            await this.plugin.saveSettings();
            this.render();
          })));
    }

    new Setting(containerEl)
      .setName("Add feed")
      .addButton((button) => button
        .setCta()
        .setButtonText("Add feed")
        .onClick(() => this.runSafely(async () => {
          this.plugin.settings.feeds.push(createFeed());
          await this.plugin.saveSettings();
          this.render();
        })));
  }

  private renderSyncSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Sync").setHeading();

    new Setting(containerEl)
      .setName("Sync frequency")
      .setDesc("Minutes between scheduled syncs. Minimum 5, maximum 1440.")
      .addText((text) => text
        .setValue(String(this.plugin.settings.syncFrequencyMinutes))
        .onChange(async (value) => {
          this.plugin.settings.syncFrequencyMinutes = clampInteger(value, 60, 5, 1440);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Sync on startup")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.syncOnStartup)
        .onChange(async (value) => {
          this.plugin.settings.syncOnStartup = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Sync when settings change")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.syncOnSettingsChange)
        .onChange(async (value) => {
          this.plugin.settings.syncOnSettingsChange = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Past days")
      .addText((text) => text
        .setValue(String(this.plugin.settings.pastDays))
        .onChange(async (value) => {
          this.plugin.settings.pastDays = clampInteger(value, 0, 0, 3650);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Future days")
      .addText((text) => text
        .setValue(String(this.plugin.settings.futureDays))
        .onChange(async (value) => {
          this.plugin.settings.futureDays = clampInteger(value, 30, 0, 3650);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Timezone")
      .setDesc("Leave blank for the local Obsidian/system timezone.")
      .addText((text) => text
        .setPlaceholder("Australia/Sydney")
        .setValue(this.plugin.settings.timezone)
        .onChange(async (value) => {
          this.plugin.settings.timezone = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Include all-day events")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.includeAllDayEvents)
        .onChange(async (value) => {
          this.plugin.settings.includeAllDayEvents = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Multi-day all-day events")
      .setDesc("Choose whether all-day events spanning multiple days create one task or one task per day.")
      .addDropdown((dropdown) => dropdown
        .addOption("daily", "Task every day")
        .addOption("single", "Single task on first day")
        .setValue(this.plugin.settings.multiDayAllDayEventMode)
        .onChange(async (value) => {
          this.plugin.settings.multiDayAllDayEventMode = value === "single" ? "single" : "daily";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Ignore cancelled events")
      .setDesc("Disable this to include cancelled events if the feed contains them.")
      .addToggle((toggle) => toggle
        .setValue(!this.plugin.settings.includeCancelledEvents)
        .onChange(async (value) => {
          this.plugin.settings.includeCancelledEvents = !value;
          await this.plugin.saveSettings();
        }));
  }

  private renderNoteSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Note").setHeading();

    new Setting(containerEl)
      .setName("Calendar note path")
      .setDesc("The note where imported calendar tasks will be written. You can surface these tasks in daily notes with Tasks queries.")
      .addText((text) => text
        .setValue(this.plugin.settings.calendarNotePath)
        .onChange(async (value) => {
          this.plugin.settings.calendarNotePath = value.trim() || "Calendar/My Calendar Events.md";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Heading")
      .setDesc("The heading inside the note that this plugin manages.")
      .addText((text) => text
        .setValue(this.plugin.settings.heading)
        .onChange(async (value) => {
          this.plugin.settings.heading = value.trim() || "## My Calendar Events";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Completed tasks heading")
      .setDesc("Checked calendar tasks can be moved here on the next sync.")
      .addText((text) => {
        protectTextInput(text.inputEl);
        text
          .setValue(this.plugin.settings.completedHeading)
          .onChange(async (value) => {
            this.plugin.settings.completedHeading = value.trim() || "## Completed Calendar Tasks";
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Create note if missing")
      .setDesc("Creates the calendar note automatically if it does not exist yet.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.createNoteIfMissing)
        .onChange(async (value) => {
          this.plugin.settings.createNoteIfMissing = value;
          await this.plugin.saveSettings();
        }));
  }

  private renderRenderingSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Rendering").setHeading();
    let previewEl: HTMLElement | null = null;
    const refreshPreview = (): void => {
      previewEl?.setText(buildTaskPreview(this.plugin.settings));
    };

    new Setting(containerEl)
      .setName("Task prefix")
      .addText((text) => text
        .setValue(this.plugin.settings.taskPrefix)
        .onChange(async (value) => {
          this.plugin.settings.taskPrefix = value.trim() || "- [ ]";
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Task template")
      .setDesc("Available tokens include {{title}}, {{details}}, {{weekday}}, {{time}}, {{date}}, {{location}}, {{calendarName}}, {{uid}}, {{source}}, and {{colorSwatch}}.")
      .addTextArea((text) => {
        text.inputEl.rows = 4;
        text
          .setValue(this.plugin.settings.taskTemplate)
          .onChange(async (value) => {
            this.plugin.settings.taskTemplate = value.trim() || DEFAULT_TASK_TEMPLATE;
            await this.plugin.saveSettings();
            refreshPreview();
          });
      });

    new Setting(containerEl)
      .setName("Date format")
      .setDesc("Luxon format, for example yyyy-MM-dd.")
      .addText((text) => text
        .setValue(this.plugin.settings.dateFormat)
        .onChange(async (value) => {
          this.plugin.settings.dateFormat = value.trim() || "yyyy-MM-dd";
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Time format")
      .setDesc("Luxon format, for example HH:mm.")
      .addText((text) => text
        .setValue(this.plugin.settings.timeFormat)
        .onChange(async (value) => {
          this.plugin.settings.timeFormat = value.trim() || "HH:mm";
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Use scheduled date marker")
      .setDesc("Use Tasks scheduled-date syntax (â³) instead of due-date syntax (📅). Most users should keep the default due-date marker.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.useScheduledDate)
        .onChange(async (value) => {
          this.plugin.settings.useScheduledDate = value;
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Show colour swatches")
      .setDesc("Shows a small colour square when an event or feed colour is available.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.includeColorSwatch)
        .onChange(async (value) => {
          this.plugin.settings.includeColorSwatch = value;
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Location and description placement")
      .setDesc("Choose whether location and description appear before or after the task date.")
      .addDropdown((dropdown) => dropdown
        .addOption("before-date", "Before task date")
        .addOption("after-date", "After task date")
        .setValue(this.plugin.settings.detailPlacement)
        .onChange(async (value) => {
          this.plugin.settings.detailPlacement = value === "after-date" ? "after-date" : "before-date";
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Include descriptions")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.includeDescriptions)
        .onChange(async (value) => {
          this.plugin.settings.includeDescriptions = value;
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Description length limit")
      .setDesc("Maximum description length in characters. Use 0 for no limit.")
      .addText((text) => text
        .setValue(String(this.plugin.settings.descriptionLengthLimit))
        .onChange(async (value) => {
          this.plugin.settings.descriptionLengthLimit = clampInteger(value, 120, 0, 2000);
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Strip HTML from descriptions")
      .setDesc("Removes HTML formatting from rich calendar descriptions while keeping readable text.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.stripHtmlFromDescriptions)
        .onChange(async (value) => {
          this.plugin.settings.stripHtmlFromDescriptions = value;
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Collapse whitespace")
      .setDesc("Tidies imported text by turning extra line breaks, tabs, and repeated spaces into single spaces.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.collapseWhitespace)
        .onChange(async (value) => {
          this.plugin.settings.collapseWhitespace = value;
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Include locations")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.includeLocations)
        .onChange(async (value) => {
          this.plugin.settings.includeLocations = value;
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Include calendar names")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.includeCalendarNames)
        .onChange(async (value) => {
          this.plugin.settings.includeCalendarNames = value;
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Show event creator")
      .setDesc("Adds the organizer/creator if the iCal feed provides it.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.includeEventCreator)
        .onChange(async (value) => {
          this.plugin.settings.includeEventCreator = value;
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Show created time")
      .setDesc("Adds the event created date/time if available in iCal.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.includeEventCreated)
        .onChange(async (value) => {
          this.plugin.settings.includeEventCreated = value;
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Show last modified time")
      .setDesc("Adds the event last modified date/time if available in iCal.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.includeEventLastModified)
        .onChange(async (value) => {
          this.plugin.settings.includeEventLastModified = value;
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Create reminder tasks")
      .setDesc("Creates separate tasks from iCal alarms that fire at least the configured number of days before the event.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.includeReminderTasks)
        .onChange(async (value) => {
          this.plugin.settings.includeReminderTasks = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Minimum reminder lead days")
      .setDesc("Only alarms this many days before the event, or earlier, become reminder tasks.")
      .addText((text) => {
        protectTextInput(text.inputEl);
        text
          .setPlaceholder("1")
          .setValue(String(this.plugin.settings.minimumReminderLeadDays))
          .onChange(async (value) => {
            this.plugin.settings.minimumReminderLeadDays = clampInteger(value, 1, 1, 3650);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Global tags")
      .setDesc("Optional tags added to every imported task, for example #calendar.")
      .addText((text) => text
        .setPlaceholder("#calendar")
        .setValue(this.plugin.settings.tags)
        .onChange(async (value) => {
          this.plugin.settings.tags = value.trim();
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    new Setting(containerEl)
      .setName("Global source tag")
      .setDesc("Optional extra tag added to every imported task to make Tasks queries easier, for example #ical.")
      .addText((text) => text
        .setPlaceholder("#ical")
        .setValue(this.plugin.settings.sourceTag)
        .onChange(async (value) => {
          this.plugin.settings.sourceTag = value.trim();
          await this.plugin.saveSettings();
          refreshPreview();
        }));

    const previewSetting = new Setting(containerEl)
      .setName("Task preview")
      .setDesc("Sample output using generic event details.");
    previewEl = previewSetting.controlEl.createEl("code", { text: buildTaskPreview(this.plugin.settings) });
    previewEl.addClass("calendar-importer-preview-line");

    new Setting(containerEl)
      .setName("All-day event sort position")
      .addDropdown((dropdown) => dropdown
        .addOption("first", "First")
        .addOption("last", "Last")
        .setValue(this.plugin.settings.allDaySortPosition)
        .onChange(async (value) => {
          this.plugin.settings.allDaySortPosition = value === "last" ? "last" : "first";
          await this.plugin.saveSettings();
        }));
  }

  private renderSafetySettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Safety").setHeading();

    new Setting(containerEl)
      .setName("Preserve manually completed tasks")
      .setDesc("Keeps matching checked task text checked on the next sync.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.preserveManualCompletion)
        .onChange(async (value) => {
          this.plugin.settings.preserveManualCompletion = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Completed task behaviour")
      .setDesc("Move checked calendar tasks into the completed section, or keep them in the active list.")
      .addDropdown((dropdown) => dropdown
        .addOption("move-to-completed-section", "Move to completed section")
        .addOption("preserve-in-place", "Keep in active list")
        .setValue(this.plugin.settings.completedTaskMode)
        .onChange(async (value) => {
          this.plugin.settings.completedTaskMode = value === "preserve-in-place" ? "preserve-in-place" : "move-to-completed-section";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Completed task retention")
      .setDesc("Days to keep completed calendar tasks. Use 0 to keep them forever.")
      .addText((text) => {
        protectTextInput(text.inputEl);
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.completedRetentionDays))
          .onChange(async (value) => {
            this.plugin.settings.completedRetentionDays = clampInteger(value, 0, 0, 3650);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Backup note before sync")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.backupBeforeSync)
        .onChange(async (value) => {
          this.plugin.settings.backupBeforeSync = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Dry-run preview")
      .setDesc("The Preview command generates output without writing notes.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.dryRunPreview)
        .onChange(async (value) => {
          this.plugin.settings.dryRunPreview = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Clear sync cache")
      .addButton((button) => button
        .setDestructive()
        .setButtonText("Clear")
        .onClick(() => this.runSafely(() => this.plugin.clearSyncCache())));
  }

  private renderDebugSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Debug").setHeading();

    new Setting(containerEl)
      .setName("Debug logging")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.debugLogging)
        .onChange(async (value) => {
          this.plugin.settings.debugLogging = value;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl("p", { text: `Last sync time: ${this.plugin.settings.lastSyncTime || "Never"}` });
    containerEl.createEl("p", { text: `Last sync result: ${this.plugin.settings.lastSyncResult || "None"}` });

    if (this.plugin.settings.lastError) {
      new Setting(containerEl).setName("Last errors").setHeading();
      containerEl.createEl("pre", { text: this.plugin.settings.lastError });
    }

    if (this.plugin.settings.lastPreview) {
      new Setting(containerEl).setName("Last preview").setHeading();
      containerEl.createEl("pre", { text: this.plugin.settings.lastPreview });
    }

    new Setting(containerEl)
      .setName("Refresh status")
      .addButton((button) => button
        .setButtonText("Refresh")
        .onClick(() => {
          new Notice(`${PLUGIN_NAME} status refreshed.`);
          this.render();
        }));
  }

  private addColourSetting(containerEl: HTMLElement, feed: CalendarFeedSetting): void {
    const setting = new Setting(containerEl)
      .setName("Colour")
      .setDesc("Fallback colour used when the feed does not provide event colours.");
    const selectedSwatch = setting.controlEl.createSpan({ cls: "calendar-importer-colour-preview" });

    const updateSelectedSwatch = (value: string): void => {
      selectedSwatch.toggleClass("is-empty", !value);
      selectedSwatch.setText(value ? "" : "None");
      selectedSwatch.style.backgroundColor = value || "transparent";
    };

    setting.addDropdown((dropdown) => {
      for (const colour of FEED_COLOURS) {
        dropdown.addOption(colour.value, colour.name);
      }
      const current = normalizeFeedColour(feed.color);
      updateSelectedSwatch(current);
      dropdown
        .setValue(current)
        .onChange(async (value) => {
          feed.color = value;
          updateSelectedSwatch(value);
          await this.plugin.saveSettings();
        });
    });

    const palette = setting.descEl.createDiv({ cls: "calendar-importer-colour-palette" });
    for (const colour of FEED_COLOURS.filter((entry) => entry.value)) {
      const item = palette.createSpan({ cls: "calendar-importer-colour-chip" });
      item.createSpan({
        cls: "calendar-importer-colour-chip-swatch",
        attr: { style: `background-color:${colour.value}` },
      });
      item.createSpan({ text: colour.name });
    }
  }

  private runSafely(action: () => Promise<unknown>): void {
    void action().catch((error: unknown) => {
      new Notice(`${PLUGIN_NAME}: ${errorMessage(error)}`);
    });
  }
}

function createFeed(): CalendarFeedSetting {
  const id = `feed-${Date.now().toString(36)}`;
  return {
    id,
    name: "New calendar",
    url: "",
    enabled: true,
    color: "",
    sourceLabel: "",
  };
}

function clampInteger(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function protectTextInput(input: HTMLInputElement | HTMLTextAreaElement): void {
  input.addEventListener("keydown", (event) => event.stopPropagation());
  input.addEventListener("keyup", (event) => event.stopPropagation());
}

function normalizeFeedColour(value: string | undefined): string {
  const current = value?.trim() ?? "";
  return FEED_COLOURS.some((colour) => colour.value === current) ? current : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
