import { App, Modal, Notice } from "obsidian";
import { HabitService } from "../application/HabitService";
import { NewHabit } from "../domain/Habit";
import { WEEKDAYS } from "../domain/LocalDate";
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
		contentEl.addClass("th-modal");
		contentEl.createEl("h3", { text: "Новая привычка" });
		const field = (label: string, placeholder = "") => {
			contentEl.createDiv({ cls: "th-label", text: label });
			const input = contentEl.createEl("input", { cls: "th-field", type: "text" });
			input.placeholder = placeholder;
			return input;
		};
		const anchor = field("После того как я…");
		const tiny = field("я сделаю (нано)");
		const full = field("а стремлюсь к (полное)", "необязательно");
		const celebration = field("и отпраздную", "необязательно");
		contentEl.createDiv({ cls: "th-label", text: "дни" });
		const days = new WeekdayPicker(contentEl, WEEKDAYS);
		const name = field("название");

		const buttons = contentEl.createDiv("th-buttons");
		buttons.createEl("button", { cls: "mod-cta", text: "Создать" }).addEventListener("click", () => {
			void this.submit({
				name: name.value,
				anchor: anchor.value,
				tiny: tiny.value,
				full: full.value,
				celebration: celebration.value,
				days: days.days,
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
