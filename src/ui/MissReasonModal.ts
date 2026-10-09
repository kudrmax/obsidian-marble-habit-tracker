import { App, Modal } from "obsidian";
import { HabitColor } from "../domain/HabitColor";
import { LocalDate } from "../domain/LocalDate";
import { colorClass } from "./colors";
import { longDate } from "./format";

export interface MissReasonInput {
	readonly habitName: string;
	readonly color?: HabitColor;
	readonly date: LocalDate;
	readonly anchor: string;
	readonly reason?: string;
	onSave(reason: string): void;
	onDone(kind: "tiny" | "full"): void;
	onClear(): void;
}

export class MissReasonModal extends Modal {
	constructor(
		app: App,
		private readonly input: MissReasonInput,
	) {
		super(app);
	}

	override onOpen(): void {
		const { contentEl, input } = this;
		this.modalEl.addClass("th-modal-shell");
		contentEl.addClass("th-modal", "th-habit", colorClass(input.color));
		contentEl.createDiv({ cls: "th-modal-eyebrow", text: `${input.habitName} · ${longDate(input.date)}` });
		contentEl.createDiv({ cls: "th-modal-title", text: "What got in the way?" });
		if (input.anchor) contentEl.createDiv({ cls: "th-modal-hint", text: `After I ${input.anchor}` });
		const field = contentEl.createEl("input", { cls: "th-input th-input-hero", type: "text" });
		field.placeholder = "Write the reason";
		field.value = input.reason ?? "";

		const actions = contentEl.createDiv("th-actions-row");
		actions.createEl("button", { cls: "th-pill", text: "Cancel" }).addEventListener("click", () => this.close());
		const save = actions.createEl("button", { cls: "th-pill th-pill-habit", text: "Save" });
		const sync = () => {
			save.disabled = field.value.trim() === "";
		};
		const submit = () => {
			const reason = field.value.trim();
			if (!reason) return;
			this.close();
			input.onSave(reason);
		};
		save.addEventListener("click", submit);
		field.addEventListener("input", sync);
		field.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			submit();
		});

		if (input.reason !== undefined) {
			contentEl.createDiv({ cls: "th-modal-divider-label", text: "Actually did it?" });
			const fixes = contentEl.createDiv("th-actions-row");
			const fix = (text: string, action: () => void, cls = "th-pill") =>
				fixes.createEl("button", { cls, text }).addEventListener("click", () => {
					this.close();
					action();
				});
			fix("Tiny", () => input.onDone("tiny"), "th-pill th-pill-habit");
			fix("Full ✦", () => input.onDone("full"), "th-pill th-pill-habit");
			fix("Clear day", () => input.onClear());
		}
		sync();
		window.setTimeout(() => field.focus(), 0);
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
