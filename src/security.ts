export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.length > 12 ? `${parsed.pathname.slice(0, 8)}...` : parsed.pathname;
    return `${parsed.protocol}//${parsed.host}${path}`;
  } catch {
    return url.length > 12 ? `${url.slice(0, 8)}...` : "<invalid url>";
  }
}

export function isLikelyIcs(content: string): boolean {
  return /BEGIN:VCALENDAR/i.test(content) && /END:VCALENDAR/i.test(content);
}
