import { App, Modal, Notice } from "obsidian";
import { HabitService } from "../application/HabitService";
import { NewHabit } from "../domain/Habit";
import { WEEKDAYS } from "../domain/LocalDate";
import { ColorPicker } from "./ColorPicker";
import { colorClass } from "./colors";
import { WeekdayPicker } from "./WeekdayPicker";

export class HabitFormModal extends Modal {
	constructor(
		app: App,
		private readonly service: HabitService,
	) {
		super(app);
	}

	override onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass("th-modal-shell");
		contentEl.addClass("th-modal", "th-form", "th-habit", colorClass(undefined));
		contentEl.createDiv({ cls: "th-modal-title", text: "New habit" });
		contentEl.createDiv({ cls: "th-modal-hint", text: "Write it as a recipe: an anchor you already do, then something tiny." });

		const line = (lead: string, placeholder: string, optional = false) => {
			const row = contentEl.createDiv("th-recipe-input");
			row.createSpan({ cls: "th-recipe-lead", text: lead });
			const input = row.createEl("input", { cls: "th-input", type: "text" });
			input.placeholder = placeholder;
			if (optional) row.createSpan({ cls: "th-optional", text: "optional" });
			return input;
		};
		const anchor = line("After I", "pour my morning coffee");
		const tiny = line("I'll", "do 2 squats");
		const full = line("Aiming for", "a 15 minute workout", true);
		const celebration = line("Then I celebrate", "say “Yes!”", true);

		contentEl.createDiv({ cls: "th-field-label", text: "Name" });
		const name = contentEl.createEl("input", { cls: "th-input th-input-block", type: "text" });
		name.placeholder = "Morning workout";
		contentEl.createDiv({ cls: "th-field-label", text: "Days" });
		const days = new WeekdayPicker(contentEl, WEEKDAYS);
		contentEl.createDiv({ cls: "th-field-label", text: "Color" });
		let tint = colorClass(undefined);
		const color = new ColorPicker(contentEl, undefined, (picked) => {
			contentEl.removeClass(tint);
			tint = colorClass(picked);
			contentEl.addClass(tint);
		});

		const actions = contentEl.createDiv("th-actions-row");
		actions.createEl("button", { cls: "th-pill th-pill-habit", text: "Create habit" }).addEventListener("click", () => {
			void this.submit({
				name: name.value,
				anchor: anchor.value,
				tiny: tiny.value,
				full: full.value,
				celebration: celebration.value,
				days: days.days,
				color: color.color,
			});
		});
		window.setTimeout(() => anchor.focus(), 0);
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private async submit(input: NewHabit): Promise<void> {
		try {
			await this.service.create(input);
			this.close();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}
}
