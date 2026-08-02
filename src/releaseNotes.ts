export interface ReleaseNote {
  headline: string;
  highlights: string[];
  coffeeLine: string;
}

const RELEASE_NOTES: Record<string, ReleaseNote> = {
  "1.2.5": {
    headline: "The calendar-to-Markdown supply chain remains operational.",
    highlights: [
      "Added optional witty sync banter, with Tasteful and Mad Max modes.",
      "Added a once-per-version What's New modal.",
      "Added a quiet, optional way to support development with coffee.",
    ],
    coffeeLine: "If this saved you from a few rounds of copy-paste, the sync goblins accept coffee.",
  },
};

export function getReleaseNote(version: string): ReleaseNote {
  return RELEASE_NOTES[version] ?? {
    headline: "Fresh code, familiar calendar chaos.",
    highlights: ["Calendar Importer has been updated."],
    coffeeLine: "If Calendar Importer helps your workflow, coffee keeps the parser emotionally available.",
  };
}
