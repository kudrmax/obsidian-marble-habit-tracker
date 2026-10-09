import { App, Modal, Notice } from "obsidian";
import { TextPart } from "../domain/Habit";
import { HabitColor } from "../domain/HabitColor";
import { Weekday } from "../domain/LocalDate";
import { Schedule } from "../domain/Schedule";
import { colorClass } from "./colors";
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
		private readonly color: HabitColor | undefined,
	) {
		super(app);
	}

	protected abstract renderValue(parent: HTMLElement): () => T;

	override onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass("th-modal-shell");
		contentEl.addClass("th-modal", "th-habit", colorClass(this.color));
		contentEl.createDiv({ cls: "th-modal-title", text: this.title });
		const value = this.renderValue(contentEl);
		const actions = contentEl.createDiv("th-actions-row");
		if (!this.hasCurrent) {
			actions.createEl("button", { cls: "th-pill th-pill-habit", text: "Add" }).addEventListener("click", () => {
				void this.apply(() => this.actions.replace(value(), ""));
			});
			return;
		}
		contentEl.insertBefore(createDiv({ cls: "th-field-label", text: "Why didn't the old one work?" }), actions);
		const because = createEl("input", { cls: "th-input th-input-block", type: "text" });
		because.placeholder = "Optional — helps you later";
		contentEl.insertBefore(because, actions);
		contentEl.insertBefore(createDiv({ cls: "th-modal-hint", text: "Replace starts a new version from today. Fix just corrects a typo." }), actions);
		actions.createEl("button", { cls: "th-pill", text: "Fix typo" }).addEventListener("click", () => {
			void this.apply(() => this.actions.correct(value()));
		});
		actions.createEl("button", { cls: "th-pill th-pill-habit", text: "Replace" }).addEventListener("click", () => {
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
		color: HabitColor | undefined,
	) {
		super(app, PART_LABELS[part], current !== undefined, actions, color);
	}

	protected override renderValue(parent: HTMLElement): () => string {
		const input = parent.createEl("input", { cls: "th-input th-input-hero", type: "text" });
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
		color: HabitColor | undefined,
	) {
		super(app, PART_LABELS.schedule, true, actions, color);
	}

	protected override renderValue(parent: HTMLElement): () => Weekday[] {
		const picker = new WeekdayPicker(parent, this.current.weekdays);
		return () => picker.days;
	}
}
