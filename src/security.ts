export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.length > 12 ? `${parsed.pathname.slice(0, 8)}...` : parsed.pathname;
    return `${parsed.protocol}//${parsed.host}${path}`;
  } catch {
    return url.length > 12 ? `${url.slice(0, 8)}...` : "<invalid url>";
  }
}

export function normalizeFeedUrl(url: string): string {
  const trimmed = url.trim();
  if (/^webcals?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^webcals?:\/\//i, "https://");
  }
  return trimmed;
}

export function isLikelyIcs(content: string): boolean {
  return /BEGIN:VCALENDAR/i.test(content) && /END:VCALENDAR/i.test(content);
}
