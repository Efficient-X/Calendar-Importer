import type { CalendarTaskSyncSettings, SyncResult, WittyBanterMode } from "./types";

export const AUTOMATIC_BANTER_COOLDOWN_MS = 60 * 60 * 1000;

const SYNC_BANTER = [
  "I only speak fluent iCal, with a minor in existential scheduling.",
  "Your calendar has been translated from corporate into Markdown.",
  "I parse, therefore iCal.",
  "No events were harmed during this synchronization.",
  "Turning meetings into tasks, because apparently meetings weren't enough.",
  "Your time is now a queryable dataset. Congratulations?",
  "The calendar has entered the vault. Please remain calm.",
  "I found your events and gave them checkboxes. You're welcome.",
  "Less copy-paste. More second-order procrastination.",
  "Meetings: now available in a format you can ignore more efficiently.",
  "Your schedule has been safely converted into tiny commitments.",
  "This update contains fewer duplicates and more temporal integrity.",
  "The sync goblins have been given a clipboard and a purpose.",
  "Time is a construct. Your task list is now structured data.",
  "Imported fresh from the calendar dimension.",
  "Your future self left some tasks. Again.",
  "Outlook may be cloudy, but your markdown is clear.",
  "Google Calendar called. It wants its events back. Too late.",
  "Scheduled chaos, now in plain text.",
  "I turn time blocks into guilt blocks.",
  "The iCal pipe is flowing. Hydrate accordingly.",
  "Your vault now knows where you're supposed to be.",
  "A calendar event is just a task with better PR.",
  "Welcome back, chronomancer.",
  "Made with TypeScript, optimism, and suspiciously many date formats.",
  "Your week has been rendered. Try not to take it personally.",
  "I've indexed your obligations. This feels legally binding.",
  "You bring the calendar; I bring the mildly alarming automation.",
  "If it has a UID, it has a destiny.",
  "This plugin believes every event deserves a checkbox.",
  "The calendar-to-Markdown supply chain remains operational.",
  "The future is now, but it's tagged appropriately.",
  "I kept your dates ISO-ish and your ambitions unverified.",
  "Reconciliation complete. Temporal anomalies contained.",
  "Your tasks are now timestamped, attributable, and quietly judging you.",
  "I imported your plans. Execution remains a user-space concern.",
  "The timeline has been normalized. Reality is optional.",
  "Everything is under control, except the things on your calendar.",
  "A fresh batch of obligations, neatly serialized.",
  "The meetings have been contained. For now.",
  "Your calendar is no longer trapped in a proprietary rectangle.",
  "Dates were parsed. Vibes were preserved.",
  "The task graph grows ever more powerful.",
  "One small sync for a plugin, one giant leap for avoiding retyping.",
  "Freshly synchronized, lightly judged.",
  "Your next meeting has been promoted to a markdown citizen.",
  "The chronologically gifted have entered the chat.",
  "Your calendar is now compatible with elaborate Tasks queries.",
  "Sync complete. The temporal paperwork is in order.",
  "Time management, but make it plaintext.",
] as const;

export function takeSyncBanter(
  settings: CalendarTaskSyncSettings,
  mode: WittyBanterMode,
  isManual: boolean,
  result: SyncResult,
  now = new Date(),
): string | undefined {
  if (!shouldShowBanter(settings, mode, isManual, result, now)) {
    return undefined;
  }

  const available = settings.banterBag.filter((line) => SYNC_BANTER.includes(line as typeof SYNC_BANTER[number]));
  const bag = available.length > 0 ? available : shuffle([...SYNC_BANTER]);
  const line = bag.pop();
  settings.banterBag = bag;
  settings.lastBanterAt = now.toISOString();
  return line;
}

export function shouldShowBanter(
  settings: Pick<CalendarTaskSyncSettings, "lastBanterAt">,
  mode: WittyBanterMode,
  isManual: boolean,
  result: SyncResult,
  now = new Date(),
): boolean {
  if (mode === "off" || !result.success || result.errors.length > 0) {
    return false;
  }
  if (mode === "mad-max" || isManual) {
    return true;
  }
  if (!hasMeaningfulChanges(result)) {
    return false;
  }
  const lastShown = Date.parse(settings.lastBanterAt);
  return Number.isNaN(lastShown) || now.getTime() - lastShown >= AUTOMATIC_BANTER_COOLDOWN_MS;
}

function hasMeaningfulChanges(result: SyncResult): boolean {
  const summary = result.changeSummary;
  return Boolean(summary && (summary.added > 0 || summary.updated > 0 || summary.removed > 0));
}

function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}
