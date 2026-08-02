import { Modal } from "obsidian";
import { getReleaseNote } from "./releaseNotes";

const SUPPORT_URL = "https://buymeacoffee.com/efficientx";

export class ReleaseNotesModal extends Modal {
  constructor(app: Modal["app"], private readonly version: string) {
    super(app);
  }

  onOpen(): void {
    const note = getReleaseNote(this.version);
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("calendar-importer-release-notes");

    contentEl.createEl("h2", { text: `Calendar Importer ${this.version}` });
    contentEl.createEl("p", { cls: "calendar-importer-release-headline", text: `“${note.headline}”` });
    contentEl.createEl("h3", { text: "What's new" });
    const highlights = contentEl.createEl("ul");
    for (const highlight of note.highlights) {
      highlights.createEl("li", { text: highlight });
    }

    const coffee = contentEl.createDiv({ cls: "calendar-importer-coffee" });
    coffee.createEl("p", { text: note.coffeeLine });
    const link = coffee.createEl("a", { text: "Buy the goblins a coffee ☕", href: SUPPORT_URL });
    link.setAttr("target", "_blank");
    link.setAttr("rel", "noopener");

    const actions = contentEl.createDiv({ cls: "calendar-importer-release-actions" });
    const close = actions.createEl("button", { cls: "mod-cta", text: "Got it" });
    close.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
