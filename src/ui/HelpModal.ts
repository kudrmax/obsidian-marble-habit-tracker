import { App, Modal } from "obsidian";
import { HelpRow } from "./help";

export class HelpModal extends Modal {
	constructor(
		app: App,
		private readonly rows: readonly HelpRow[],
	) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass("tiny-habits");
		this.setTitle("How it works");
		const guide = this.contentEl.createDiv("th-guide");
		for (const { action, result } of this.rows) {
			guide.createDiv({ cls: "th-guide-name", text: action });
			guide.createDiv({ cls: "th-guide-text", text: result });
		}
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
