import type { SyncCacheEntry } from "./types";

export interface ScopedSyncCache {
  current: Record<string, SyncCacheEntry>;
  next: Record<string, SyncCacheEntry>;
}

export function prepareScopedSyncCache(
  cache: Record<string, SyncCacheEntry>,
  notePath: string,
  eventKeys: ReadonlySet<string>,
  useDailyNotes: boolean,
): ScopedSyncCache {
  if (!useDailyNotes) {
    return { current: cache, next: {} };
  }

  const current = Object.fromEntries(
    Object.entries(cache).filter(([key, entry]) => entry.notePath === notePath || eventKeys.has(key)),
  );
  const next = { ...cache };
  for (const key of Object.keys(current)) {
    delete next[key];
  }
  return { current, next };
}
