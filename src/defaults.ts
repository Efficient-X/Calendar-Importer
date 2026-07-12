import type { CalendarTaskSyncSettings } from "./types";

export const DEFAULT_TASK_TEMPLATE = "{{title}} - {{weekday}} - {{time}}{{preDateDetails}} {{dateMarker}} {{date}}{{postDateDetails}}";
export const DEFAULT_WIKILINK_PREFIX_FORMAT = "yyMMdd - ";
export const DEFAULT_WIKILINK_BASE_FOLDER = "Calendar/Calendar Events";

const LEGACY_CALENDAR_MARKER_MOJIBAKE = String.fromCodePoint(
  0x00c3, 0x0192, 0x00c2, 0x00b0, 0x00c3, 0x2026, 0x00c2, 0x00b8,
  0x00c3, 0x00a2, 0x00e2, 0x201a, 0x00ac, 0x00c5, 0x201c,
  0x00c3, 0x00a2, 0x00e2, 0x201a, 0x00ac, 0x00c2, 0x00a6,
);

export const LEGACY_TASK_TEMPLATES = [
  `{{title}}{{detailsSeparator}}{{details}} - {{weekday}} - {{time}} ${String.fromCodePoint(0x1f4c5)} {{date}}`,
  `{{title}}{{detailsSeparator}}{{details}} - {{weekday}} - {{time}} ${LEGACY_CALENDAR_MARKER_MOJIBAKE} {{date}}`,
];

export const DEFAULT_SETTINGS: CalendarTaskSyncSettings = {
  feeds: [],
  syncFrequencyMinutes: 60,
  syncOnStartup: false,
  syncOnSettingsChange: false,
  pastDays: 0,
  futureDays: 30,
  includeAllDayEvents: true,
  multiDayAllDayEventMode: "daily",
  includeCancelledEvents: false,
  timezone: "",
  calendarNotePath: "Calendar/My Calendar Events.md",
  useDailyNotes: false,
  dailyNoteTemplate: "Calendar/YYYY-MM-DD.md",
  heading: "## My Calendar Events",
  startMarker: "<!-- calendar-importer:start -->",
  endMarker: "<!-- calendar-importer:end -->",
  createNoteIfMissing: true,
  allDaySortPosition: "first",
  taskPrefix: "- [ ]",
  taskTemplate: DEFAULT_TASK_TEMPLATE,
  detailPlacement: "before-date",
  showManagedBlockMarkers: false,
  taskLayout: "classic",
  completedTaskMode: "move-to-completed-section",
  completedHeading: "## Completed Calendar Tasks",
  completedRetentionDays: 0,
  syncCacheRetentionDays: 365,
  includeColorSwatch: true,
  dateFormat: "yyyy-MM-dd",
  timeFormat: "HH:mm",
  useScheduledDate: false,
  includeDescriptions: true,
  descriptionLengthLimit: 120,
  stripHtmlFromDescriptions: true,
  collapseWhitespace: true,
  includeLocations: false,
  includeCalendarNames: false,
  includeEventCreator: false,
  includeEventCreated: false,
  includeEventLastModified: false,
  includeReminderTasks: false,
  minimumReminderLeadDays: 1,
  tags: "",
  sourceTag: "",
  preserveManualCompletion: true,
  backupBeforeSync: false,
  lastSyncTime: "",
  lastSyncResult: "",
  lastError: "",
  syncCache: {},
};
