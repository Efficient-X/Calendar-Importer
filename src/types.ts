export interface CalendarFeedSetting {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  color?: string;
  sourceLabel?: string;
  tags?: string;
  includeKeywords?: string;
  excludeKeywords?: string;
}

export interface CalendarTaskSyncSettings {
  feeds: CalendarFeedSetting[];
  syncFrequencyMinutes: number;
  syncOnStartup: boolean;
  syncOnSettingsChange: boolean;
  pastDays: number;
  futureDays: number;
  includeAllDayEvents: boolean;
  multiDayAllDayEventMode: "daily" | "single";
  includeCancelledEvents: boolean;
  timezone: string;
  calendarNotePath: string;
  useDailyNotes: boolean;
  dailyNoteTemplate: string;
  heading: string;
  startMarker: string;
  endMarker: string;
  createNoteIfMissing: boolean;
  allDaySortPosition: "first" | "last";
  taskPrefix: string;
  taskTemplate: string;
  detailPlacement: "before-date" | "after-date";
  showManagedBlockMarkers: boolean;
  taskLayout: "classic" | "chronological";
  completedTaskMode: "preserve-in-place" | "move-to-completed-section";
  completedHeading: string;
  completedRetentionDays: number;
  includeColorSwatch: boolean;
  dateFormat: string;
  timeFormat: string;
  useScheduledDate: boolean;
  includeDescriptions: boolean;
  descriptionLengthLimit: number;
  stripHtmlFromDescriptions: boolean;
  collapseWhitespace: boolean;
  includeLocations: boolean;
  includeCalendarNames: boolean;
  includeEventCreator: boolean;
  includeEventCreated: boolean;
  includeEventLastModified: boolean;
  includeReminderTasks: boolean;
  minimumReminderLeadDays: number;
  tags: string;
  sourceTag: string;
  preserveManualCompletion: boolean;
  backupBeforeSync: boolean;
  lastSyncTime: string;
  lastSyncResult: string;
  lastError: string;
  syncCache: Record<string, SyncCacheEntry>;
}

export interface SyncCacheEntry {
  key: string;
  rendered: string;
  completed?: boolean;
  lastSeen: string;
  notePath?: string;
}

export interface NormalizedCalendarEvent {
  sourceId: string;
  sourceName: string;
  uid: string;
  instanceId: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end?: Date;
  allDay: boolean;
  status?: string;
  sequence?: number;
  recurrenceId?: string;
  calendarName?: string;
  color?: string;
  tags?: string;
  createdBy?: string;
  created?: Date;
  lastModified?: Date;
  isReminder?: boolean;
  reminderForInstanceId?: string;
  reminderStarts?: Date[];
}

export interface SyncChangeSummary {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  completedMoved: number;
  completedPreserved: number;
  filtered: number;
}

export interface ParseWindow {
  start: Date;
  end: Date;
}

export interface SyncResult {
  success: boolean;
  skipped: boolean;
  eventCount: number;
  notePath?: string;
  message: string;
  errors: string[];
  changeSummary?: SyncChangeSummary;
}

export interface RenderContext {
  event: NormalizedCalendarEvent;
  settings: CalendarTaskSyncSettings;
}

export interface ParsedFeedResult {
  events: NormalizedCalendarEvent[];
  errors: string[];
}
