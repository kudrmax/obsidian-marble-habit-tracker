import { App, Modal } from "obsidian";

/** Asks for the name of a new section; `onName` isn't called when the reader cancels. */
export class SectionNameModal extends Modal {
	private named = false;

	constructor(
		app: App,
		private readonly onName: (name: string) => void,
		private readonly onCancel: () => void,
	) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass("tiny-habits");
		this.setTitle("New section");
		const input = this.contentEl.createEl("input", { type: "text", attr: { placeholder: "Morning, During the day, Evening…" } });
		input.addClass("th-section-name");
		const buttons = this.contentEl.createDiv("modal-button-container");
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		const create = buttons.createEl("button", { cls: "mod-cta", text: "Create" });
		const submit = () => {
			const name = input.value.trim();
			if (!name) return input.focus();
			this.named = true;
			this.close();
			this.onName(name);
		};
		create.addEventListener("click", submit);
		input.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || event.isComposing) return;
			event.preventDefault();
			submit();
		});
		window.setTimeout(() => input.focus(), 0);
	}

	override onClose(): void {
		this.contentEl.empty();
		if (!this.named) this.onCancel();
	}
}
