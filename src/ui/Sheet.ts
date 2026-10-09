import { App, Modal, Notice } from "obsidian";
import { HabitColor } from "../domain/HabitColor";
import { colorClass } from "./colors";
import { iconButton } from "./components";

export abstract class Sheet extends Modal {
	private save: HTMLButtonElement | null = null;

	protected constructor(
		app: App,
		private readonly heading: string,
		private readonly tint: HabitColor | undefined,
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
		this.modalEl.addClass("th-sheet", "tiny-habits", "th-habit", colorClass(this.tint));
		const header = this.contentEl.createDiv("th-sheet-header");
		iconButton(header, { icon: "x", label: "Cancel", onClick: () => this.close() });
		header.createDiv({ cls: "th-sheet-title", text: this.heading });
		this.save = iconButton(header, { icon: "check", label: "Save", primary: true, onClick: () => void this.trySubmit() });
		this.fill(this.contentEl.createDiv("th-sheet-body"));
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
