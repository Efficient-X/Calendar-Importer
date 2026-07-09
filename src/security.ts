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
  const normalized = /^webcals?:\/\//i.test(trimmed)
    ? trimmed.replace(/^webcals?:\/\//i, "https://")
    : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Enter a valid calendar feed URL starting with https://, http://, webcal://, or webcals://.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Calendar Importer supports https://, http://, webcal://, and webcals:// calendar feed links only.");
  }

  return parsed.toString();
}

export function isLikelyIcs(content: string): boolean {
  return /BEGIN:VCALENDAR/i.test(content) && /END:VCALENDAR/i.test(content);
}
