import { App, Modal } from "obsidian";
import { Part } from "../domain/Habit";
import { PART_LABELS } from "./format";

const PARTS: ReadonlyArray<[Part, string]> = [
	["anchor", "Pick a moment that happens every day, reliably"],
	["tiny", "Make it so small it works on your worst day"],
	["celebration", "Find a feeling that really lands"],
	["full", "Adjust what you're aiming for"],
	["schedule", "Change which days it's planned"],
];

export class PartPickerModal extends Modal {
	constructor(
		app: App,
		private readonly onPick: (part: Part) => void,
	) {
		super(app);
	}

	override onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass("th-modal-shell");
		contentEl.addClass("th-modal");
		contentEl.createDiv({ cls: "th-modal-title", text: "Redesign the recipe" });
		contentEl.createDiv({ cls: "th-modal-hint", text: "When a habit doesn't stick, change the recipe — not yourself." });
		const list = contentEl.createDiv("th-option-list");
		for (const [part, hint] of PARTS) {
			const option = list.createEl("button", { cls: "th-option" });
			option.createDiv({ cls: "th-option-title", text: PART_LABELS[part] });
			option.createDiv({ cls: "th-option-hint", text: hint });
			option.addEventListener("click", () => {
				this.close();
				this.onPick(part);
			});
		}
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
