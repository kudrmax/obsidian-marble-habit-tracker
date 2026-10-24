import { App, Modal, Notice } from "obsidian";

export abstract class Sheet extends Modal {
	private save: HTMLButtonElement | null = null;

	protected constructor(
		app: App,
		private readonly heading: string,
	) {
		super(app);
	}

	protected abstract fill(body: HTMLElement): void;

	protected abstract isReady(): boolean;

	protected abstract submit(): Promise<unknown>;

	protected refreshReady(): void {
		if (this.save) this.save.disabled = !this.isReady();
	}

	override onOpen(): void {
		this.modalEl.addClass("th-sheet", "tiny-habits");
		this.setTitle(this.heading);
		this.fill(this.contentEl.createDiv("th-sheet-body"));
		const buttons = this.contentEl.createDiv("modal-button-container");
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		this.save = buttons.createEl("button", { cls: "mod-cta", text: "Save" });
		this.save.addEventListener("click", () => void this.trySubmit());
		this.refreshReady();
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private async trySubmit(): Promise<void> {
		if (!this.isReady()) return;
		try {
			await this.submit();
			this.close();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}
}
