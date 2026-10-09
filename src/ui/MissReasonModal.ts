import { App, Modal } from "obsidian";
import { LocalDate } from "../domain/LocalDate";
import { longDate } from "./format";

export interface MissReasonInput {
	readonly habitName: string;
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
		contentEl.addClass("th-modal");
		contentEl.createEl("h3", { text: "Почему не получилось?" });
		contentEl.createDiv({ cls: "th-muted", text: `${input.habitName} · ${longDate(input.date)}` });
		if (input.anchor) {
			contentEl.createDiv({ cls: "th-label", text: "якорь" });
			contentEl.createDiv({ cls: "th-anchor", text: input.anchor });
		}
		const field = contentEl.createEl("input", { cls: "th-field", type: "text" });
		field.placeholder = "Что помешало?";
		field.value = input.reason ?? "";

		const buttons = contentEl.createDiv("th-buttons");
		buttons.createEl("button", { text: "Отмена" }).addEventListener("click", () => this.close());
		const save = buttons.createEl("button", { cls: "mod-cta", text: "Сохранить" });
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
			const fixes = contentEl.createDiv("th-buttons th-fixes");
			const fix = (text: string, action: () => void) =>
				fixes.createEl("button", { text }).addEventListener("click", () => {
					this.close();
					action();
				});
			fix("Сделал нано", () => input.onDone("tiny"));
			fix("Сделал полное", () => input.onDone("full"));
			fix("Очистить", () => input.onClear());
		}
		sync();
		window.setTimeout(() => field.focus(), 0);
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
