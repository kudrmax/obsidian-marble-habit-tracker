import { App, Modal } from "obsidian";
import { Part, TEXT_PARTS } from "../domain/Habit";
import { PART_LABELS } from "./format";

const PARTS: readonly Part[] = [...TEXT_PARTS, "schedule"];

export class PartPickerModal extends Modal {
	constructor(
		app: App,
		private readonly onPick: (part: Part) => void,
	) {
		super(app);
	}

	override onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("th-modal");
		contentEl.createEl("h3", { text: "Что поменять?" });
		const list = contentEl.createDiv("th-buttons th-vertical");
		for (const part of PARTS) {
			list.createEl("button", { text: PART_LABELS[part] }).addEventListener("click", () => {
				this.close();
				this.onPick(part);
			});
		}
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
