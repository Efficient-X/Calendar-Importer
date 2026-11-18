export interface ReleaseNote {
  headline: string;
  highlights: string[];
  coffeeLine: string;
  kind?: "features" | "fixes";
}

const RELEASE_NOTES: Record<string, ReleaseNote> = {
  "1.3.1": {
    headline: "The heading goblin has been separated from its task list.",
    highlights: [
      "Repair duplicate tasks beneath recognizable damaged calendar headings, backing up the original note first and keeping checked tasks. Review other malformed sections manually.",
      "Keep repeated imports stable and respect disabled note creation and the device's read-only setting during delayed writes.",
      "Find clearer setup, shared-vault and troubleshooting instructions, including safe duplicate cleanup.",
      "Enjoy four new quotes and a Tasteful quote after a successful startup sync, even when nothing changed. Off, failed and skipped imports stay quiet.",
      "After updating, leave one device writing calendar notes, run Sync now, and keep the .bak file until you have checked any repair.",
    ],
    coffeeLine: "If this untangled your calendar breadcrumbs, the heading goblin owes you a coffee.",
    kind: "fixes",
  },
  "1.3.0": {
    headline: "Two devices, one calendar writer. The timeline thanks you.",
    highlights: [
      "Choose one device to write calendar notes in a shared vault; other devices can still view and tick the synced tasks.",
      "Repair repeated calendar sections after a sync conflict, keeping checked events and backing up the note first.",
      "Find Calendar Importer in Obsidian's settings search, plus twenty fresh sync one-liners.",
    ],
    coffeeLine: "If this helped untangle a temporal knot, the sync goblins accept coffee.",
  },
  "1.2.5": {
    headline: "The calendar-to-Markdown supply chain remains operational.",
    highlights: [
      "Added optional witty sync banter, with Tasteful and Mad Max modes.",
      "Added a once-per-version What's New modal.",
      "Added a quiet, optional way to support development with coffee.",
    ],
    coffeeLine: "If this saved you from a few rounds of copy-paste, the sync goblins accept coffee.",
  },
  "1.2.6": {
    headline: "Damn 1s and 0s.",
    highlights: [
      "Tracked down a settings-page layout regression introduced while adding Settings search support.",
      "Reworked the settings renderer so your controls remain readable instead of performing interpretive typography.",
    ],
    coffeeLine: "If this release saved your settings from becoming modern art, the goblins accept coffee.",
    kind: "fixes",
  },
  "1.2.7": {
    headline: "Damn 1s and 0s. The layout goblin has been escorted from the premises.",
    highlights: [
      "Restored the proven responsive settings renderer from Calendar Importer 1.2.3.",
      "Fixed settings controls collapsing or wrapping differently when the Obsidian window changed size.",
      "Kept the witty-banter and update-popup controls from 1.2.5 intact.",
    ],
    coffeeLine: "If the settings page is behaving itself again, the goblins accept coffee.",
    kind: "fixes",
  },
  "1.2.8": {
    headline: "Damn 1s and 0s. At least the release notes now explain the crime scene.",
    highlights: [
      "Expanded maintenance-release popups so they clearly explain what was repaired.",
      "Bug-fix releases now use a dedicated “What we fixed” section instead of pretending every patch is a shiny new feature.",
    ],
    coffeeLine: "If clear release notes spared you a debugging expedition, the goblins accept coffee.",
    kind: "fixes",
  },
};

export function getReleaseNote(version: string): ReleaseNote {
  return RELEASE_NOTES[version] ?? {
    headline: "Fresh code, familiar calendar chaos.",
    highlights: ["Calendar Importer has been updated."],
    coffeeLine: "If Calendar Importer helps your workflow, coffee keeps the parser emotionally available.",
  };
}
