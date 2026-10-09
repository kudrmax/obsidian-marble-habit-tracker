import { App, Modal, Notice } from "obsidian";
import { TextPart } from "../domain/Habit";
import { Weekday } from "../domain/LocalDate";
import { Schedule } from "../domain/Schedule";
import { PART_LABELS } from "./format";
import { WeekdayPicker } from "./WeekdayPicker";

export interface ComponentActions<T> {
	replace(value: T, because: string): Promise<unknown>;
	correct(value: T): Promise<unknown>;
}

abstract class ComponentModal<T> extends Modal {
	protected constructor(
		app: App,
		private readonly title: string,
		private readonly hasCurrent: boolean,
		private readonly actions: ComponentActions<T>,
	) {
		super(app);
	}

	protected abstract renderValue(parent: HTMLElement): () => T;

	override onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("th-modal");
		contentEl.createEl("h3", { text: this.title });
		const value = this.renderValue(contentEl);
		if (!this.hasCurrent) {
			const buttons = contentEl.createDiv("th-buttons");
			buttons.createEl("button", { cls: "mod-cta", text: "Добавить" }).addEventListener("click", () => {
				void this.apply(() => this.actions.replace(value(), ""));
			});
			return;
		}
		contentEl.createDiv({ cls: "th-label", text: "Почему старое не подошло?" });
		const because = contentEl.createEl("input", { cls: "th-field", type: "text" });
		because.placeholder = "можно пропустить";
		const buttons = contentEl.createDiv("th-buttons");
		buttons.createEl("button", { text: "Исправить" }).addEventListener("click", () => {
			void this.apply(() => this.actions.correct(value()));
		});
		buttons.createEl("button", { cls: "mod-cta", text: "Заменить" }).addEventListener("click", () => {
			void this.apply(() => this.actions.replace(value(), because.value));
		});
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private async apply(action: () => Promise<unknown>): Promise<void> {
		try {
			await action();
			this.close();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}
}

export class TextComponentModal extends ComponentModal<string> {
	constructor(
		app: App,
		part: TextPart,
		private readonly current: string | undefined,
		actions: ComponentActions<string>,
	) {
		super(app, PART_LABELS[part], current !== undefined, actions);
	}

	protected override renderValue(parent: HTMLElement): () => string {
		const input = parent.createEl("input", { cls: "th-field", type: "text" });
		input.value = this.current ?? "";
		window.setTimeout(() => input.focus(), 0);
		return () => input.value;
	}
}

export class ScheduleModal extends ComponentModal<Weekday[]> {
	constructor(
		app: App,
		private readonly current: Schedule,
		actions: ComponentActions<Weekday[]>,
	) {
		super(app, PART_LABELS.schedule, true, actions);
	}

	protected override renderValue(parent: HTMLElement): () => Weekday[] {
		const picker = new WeekdayPicker(parent, this.current.weekdays);
		return () => picker.days;
	}
}
