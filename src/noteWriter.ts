import type { CalendarTaskSyncSettings, SyncCacheEntry } from "./types";

export interface ManagedTaskLine {
  key: string;
  line: string;
}

export interface ReplaceResult {
  content: string;
  changed: boolean;
}

export interface CompletedNormalizationResult {
  content: string;
  completedLines: string[];
  changed: boolean;
  movedCount: number;
}

interface HeadingRange {
  headingStart: number;
  headingEnd: number;
  bodyStart: number;
  sectionEnd: number;
}

export function buildManagedBlock(items: ManagedTaskLine[], settings: CalendarTaskSyncSettings): string {
  const taskLines = items.map((item) => removeCalendarImporterEventMarkers(item.line));
  const lines = settings.showManagedBlockMarkers
    ? [settings.startMarker, ...taskLines, settings.endMarker]
    : taskLines;
  return lines.join("\n");
}

export function replaceManagedBlock(noteContent: string, blockContent: string, settings: CalendarTaskSyncSettings): ReplaceResult {
  const newline = noteContent.includes("\r\n") ? "\r\n" : "\n";
  const normalizedBlock = blockContent.replace(/\r?\n/g, newline);
  const startIndex = noteContent.indexOf(settings.startMarker);
  const endIndex = noteContent.indexOf(settings.endMarker);

  if (startIndex >= 0 && endIndex > startIndex) {
    const endMarkerEnd = endIndex + settings.endMarker.length;
    const content = `${noteContent.slice(0, startIndex)}${normalizedBlock}${noteContent.slice(endMarkerEnd)}`;
    return { content, changed: content !== noteContent };
  }

  const headingRanges = findHeadingRanges(noteContent, settings.heading);
  if (headingRanges.length > 0) {
    const deduplicatedContent = removeHeadingRanges(noteContent, headingRanges.slice(1));
    const headingRange = findHeadingRange(deduplicatedContent, settings.heading);
    if (!headingRange) {
      throw new Error("Could not locate the calendar heading after removing duplicates.");
    }
    const suffix = deduplicatedContent.slice(headingRange.sectionEnd).replace(/^\r?\n/, "");
    const content = `${deduplicatedContent.slice(0, headingRange.bodyStart)}${normalizedBlock}${normalizedBlock ? newline : ""}${suffix}`;
    return { content, changed: content !== noteContent };
  }

  const trimmed = noteContent.trimEnd();
  const heading = settings.heading.trim();
  const content = `${trimmed}${trimmed ? `${newline}${newline}` : ""}${heading}${newline}${normalizedBlock}${normalizedBlock ? newline : ""}`;
  return { content, changed: content !== noteContent };
}

export function extractManagedBlock(noteContent: string, settings: CalendarTaskSyncSettings): string {
  const startIndex = noteContent.indexOf(settings.startMarker);
  const endIndex = noteContent.indexOf(settings.endMarker);
  if (startIndex < 0 || endIndex <= startIndex) {
    return extractSectionBodies(noteContent, settings.heading).join("\n");
  }
  return noteContent.slice(startIndex, endIndex + settings.endMarker.length);
}

export function extractCompletionStates(noteContent: string, settings: CalendarTaskSyncSettings): Record<string, boolean> {
  const lines = extractCompletedTaskLines(noteContent, settings);
  return Object.fromEntries(Object.keys(lines).map((key) => [key, true]));
}

export function extractCompletedTaskLines(noteContent: string, settings: CalendarTaskSyncSettings): Record<string, string> {
  const block = extractManagedBlock(noteContent, settings);
  const completedSection = extractSectionBodies(noteContent, settings.completedHeading).join("\n");
  return {
    ...extractCompletedTaskLinesFromText(block),
    ...extractCompletedTaskLinesFromText(completedSection),
  };
}

export function extractCompletedSectionTaskLines(noteContent: string, settings: CalendarTaskSyncSettings): string[] {
  return extractSectionBodies(noteContent, settings.completedHeading)
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(isCompletedTaskLine);
}

export function moveCompletedTasksToCompletedSection(noteContent: string, settings: CalendarTaskSyncSettings): CompletedNormalizationResult {
  const activeBody = extractManagedBlock(noteContent, settings);
  const activeLines = activeBody.split(/\r?\n/).map((line) => line.trimEnd());
  const activeIncompleteLines: ManagedTaskLine[] = [];
  const completedLines = extractCompletedSectionTaskLines(noteContent, settings);
  let movedCount = 0;

  for (const line of activeLines) {
    if (!line.trim()) {
      continue;
    }

    if (isCompletedTaskLine(line)) {
      completedLines.push(normalizeTaskSymbols(line));
      movedCount += 1;
    } else {
      activeIncompleteLines.push({ key: getTaskIdentity(line), line: normalizeTaskSymbols(line) });
    }
  }

  const activeReplacement = replaceManagedBlock(noteContent, buildManagedBlock(activeIncompleteLines, settings), settings);
  const completedReplacement = replaceCompletedTaskSection(activeReplacement.content, completedLines, settings);

  return {
    content: completedReplacement.content,
    completedLines: extractCompletedSectionTaskLines(completedReplacement.content, settings),
    changed: activeReplacement.changed || completedReplacement.changed,
    movedCount,
  };
}

export function replaceCompletedTaskSection(noteContent: string, completedLines: string[], settings: CalendarTaskSyncSettings): ReplaceResult {
  const uniqueLines = prepareCompletedTaskLines(completedLines, settings);
  const newline = noteContent.includes("\r\n") ? "\r\n" : "\n";
  const section = `${settings.completedHeading.trim()}${newline}${uniqueLines.length > 0 ? `${uniqueLines.join(newline)}${newline}` : ""}`;
  const completedRanges = findHeadingRanges(noteContent, settings.completedHeading);
  const withoutCompletedSections = removeHeadingRanges(noteContent, completedRanges);
  const trimmed = withoutCompletedSections.trimEnd();
  const content = `${trimmed}${trimmed ? `${newline}${newline}` : ""}${section}`;
  return { content, changed: content !== noteContent };
}

export function prepareCompletedTaskLines(
  completedLines: string[],
  settings: CalendarTaskSyncSettings,
  now = new Date(),
): string[] {
  const retentionDays = Math.max(0, settings.completedRetentionDays ?? 0);
  const cutoff = retentionDays > 0
    ? startOfUtcDay(new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000))
    : null;

  return dedupeLines(completedLines.filter((line) => line.trim()).map(normalizeTaskSymbols))
    .map(removeCalendarImporterEventMarkers)
    .filter((line) => {
      if (!cutoff) {
        return true;
      }
      const retentionDate = getCompletedRetentionDate(line);
      return !retentionDate || retentionDate >= cutoff;
    })
    .sort(compareCompletedTaskLines);
}

function extractCompletedTaskLinesFromText(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = block.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const taskLine = lines[index];
    if (!isCompletedTaskLine(taskLine)) {
      continue;
    }

    const taskIdentity = getTaskIdentity(taskLine);
    if (taskIdentity) {
      result[taskIdentity] = normalizeTaskSymbols(taskLine);
    }

    const stableEventId = parseStableEventId(taskLine);
    if (stableEventId) {
      result[stableEventId] = normalizeTaskSymbols(taskLine);
    }

    const nextLine = lines[index + 1];
    const eventKey = parseEventMarker(taskLine) ?? (nextLine ? parseEventMarker(nextLine) : null);
    if (eventKey) {
      result[eventKey] = normalizeTaskSymbols(taskLine);
    }
  }

  return result;
}

export function getTaskIdentity(taskLine: string): string {
  return normalizeTaskSymbols(taskLine)
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/, "")
    .replace(calendarImporterEventMarkerPattern(), "")
    .replace(/<span\b[^>]*(?:calendar-importer-swatch|calendar-task-sync-swatch)[^>]*>.*?<\/span>\s*/gi, "")
    .replace(/\s+\u2705\s+\d{4}-\d{2}-\d{2}(?=\s|$)/gu, "")
    .replace(/\s+\|\s+(?:Created by|Created|Modified)\b.*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTaskSymbols(value: string): string {
  const calendarMarker = String.fromCodePoint(0x1f4c5);
  const scheduledMarker = String.fromCodePoint(0x23f3);
  const doneMarker = String.fromCodePoint(0x2705);
  return replaceAliases(
    replaceAliases(
      replaceAliases(
        replaceAliases(value, [
          String.fromCodePoint(0x00f0, 0x0178, 0x201c, 0x2026),
          String.fromCodePoint(0x00c3, 0x00b0, 0x00c5, 0x00b8, 0x00e2, 0x20ac, 0x0153, 0x00e2, 0x20ac, 0x00a6),
        ], calendarMarker),
        [
          String.fromCodePoint(0x00e2, 0x008f, 0x00b3),
          String.fromCodePoint(0x00c3, 0x00a2, 0x00c2, 0x008f, 0x00c2, 0x00b3),
        ],
        scheduledMarker,
      ),
      [
        String.fromCodePoint(0x00e2, 0x0153, 0x2026),
        String.fromCodePoint(0x00c3, 0x00a2, 0x00c5, 0x201c, 0x00e2, 0x20ac, 0x00a6),
      ],
      doneMarker,
    ),
    [
      String.fromCodePoint(0x00e2, 0x2013, 0x00a0),
      String.fromCodePoint(0x00c3, 0x00a2, 0x00e2, 0x20ac, 0x201c, 0x00c2, 0x00a0),
    ],
    String.fromCodePoint(0x25a0),
  ).replace(new RegExp(String.fromCodePoint(0x00e2, 0x20ac, 0x2122), "g"), String.fromCodePoint(0x27));
}

function replaceAliases(value: string, aliases: string[], replacement: string): string {
  return aliases.reduce((next, alias) => next.split(alias).join(replacement), value);
}
export function updateSyncCacheFromBlock(
  cache: Record<string, SyncCacheEntry>,
  noteContent: string,
  settings: CalendarTaskSyncSettings,
): Record<string, SyncCacheEntry> {
  const completions = extractCompletionStates(noteContent, settings);
  const nextCache = { ...cache };
  const seenAt = new Date().toISOString();
  for (const [key, completed] of Object.entries(completions)) {
    nextCache[key] = {
      key,
      rendered: nextCache[key]?.rendered ?? "",
      completed,
      lastSeen: seenAt,
    };
  }
  return nextCache;
}

function parseEventMarker(line: string): string | null {
  const match = line.match(/<!-- calendar-importer:event\s+([^\s]+)\s*-->/iu);
  if (!match?.[1]) {
    return null;
  }
  const encoded = match[1];
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function isCompletedTaskLine(line: string): boolean {
  return /^\s*[-*+]\s+\[[xX]\]\s+/.test(line);
}

function extractSectionBodies(content: string, heading: string): string[] {
  return findHeadingRanges(content, heading)
    .map((range) => content.slice(range.bodyStart, range.sectionEnd).trim())
    .filter(Boolean);
}

function removeCalendarImporterEventMarkers(value: string): string {
  return value.replace(calendarImporterEventMarkerPattern(), "").trimEnd();
}

function calendarImporterEventMarkerPattern(): RegExp {
  return /\s*<!-- calendar-importer:event\s+[^\s]+\s*-->/giu;
}

function parseStableEventId(line: string): string | null {
  const match = line.match(/\bdata-calendar-importer-id=(['"])(.*?)\1/i);
  if (!match?.[2]) {
    return null;
  }
  try {
    return decodeURIComponent(match[2]);
  } catch {
    return match[2];
  }
}

function findHeadingRange(content: string, heading: string): HeadingRange | null {
  return findHeadingRanges(content, heading)[0] ?? null;
}

function findHeadingRanges(content: string, heading: string): HeadingRange[] {
  const escaped = escapeRegExp(heading.trim());
  const expression = new RegExp(`(^|\\r?\\n)${escaped}[^\\S\\r\\n]*(?=\\r?\\n|$)`, "g");
  const ranges: HeadingRange[] = [];
  let match: RegExpExecArray | null;

  while ((match = expression.exec(content)) !== null) {
    const headingStart = match.index + (match[1]?.length ?? 0);
    const headingEnd = endOfLineIndex(content, headingStart);
    const rest = content.slice(headingEnd);
    const nextHeading = rest.match(/(^|\r?\n)#{1,6}\s+\S/);
    const sectionEnd = nextHeading?.index !== undefined ? headingEnd + nextHeading.index : content.length;
    ranges.push({ headingStart, headingEnd, bodyStart: headingEnd, sectionEnd });
  }

  return ranges;
}

function removeHeadingRanges(content: string, ranges: HeadingRange[]): string {
  let result = content;
  for (const range of [...ranges].sort((left, right) => right.headingStart - left.headingStart)) {
    result = `${result.slice(0, range.headingStart)}${result.slice(range.sectionEnd)}`;
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function endOfLineIndex(content: string, fromIndex: number): number {
  const newlineIndex = content.indexOf("\n", fromIndex);
  return newlineIndex >= 0 ? newlineIndex + 1 : content.length;
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of lines) {
    const identity = getTaskIdentity(line);
    if (!identity || seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    deduped.push(line);
  }
  return deduped;
}

function compareCompletedTaskLines(left: string, right: string): number {
  const leftTime = getCompletedSortDate(left)?.getTime() ?? 0;
  const rightTime = getCompletedSortDate(right)?.getTime() ?? 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return getTaskIdentity(left).localeCompare(getTaskIdentity(right));
}

function getCompletedSortDate(line: string): Date | null {
  return getTaskEventDate(line) ?? getTaskCompletionDate(line);
}

function getCompletedRetentionDate(line: string): Date | null {
  return getTaskCompletionDate(line) ?? getTaskEventDate(line);
}

function getTaskCompletionDate(line: string): Date | null {
  const doneMarker = String.fromCodePoint(0x2705);
  const match = normalizeTaskSymbols(line).match(new RegExp(`${doneMarker}\\s+(\\d{4}-\\d{2}-\\d{2})`, "u"));
  return match ? parseUtcDate(match[1]) : null;
}

function getTaskEventDate(line: string): Date | null {
  const doneMarker = String.fromCodePoint(0x2705);
  const calendarMarker = String.fromCodePoint(0x1f4c5);
  const scheduledMarker = String.fromCodePoint(0x23f3);
  const startMarker = String.fromCodePoint(0x1f6eb);
  const beforeCompletion = normalizeTaskSymbols(line).split(doneMarker)[0];
  const markedDate = beforeCompletion.match(
    new RegExp(`(?:${calendarMarker}|${scheduledMarker}|${startMarker})\\s+(\\d{4}-\\d{2}-\\d{2})`, "u"),
  );
  const match = markedDate ?? beforeCompletion.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return match ? parseUtcDate(match[1]) : null;
}

function parseUtcDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
