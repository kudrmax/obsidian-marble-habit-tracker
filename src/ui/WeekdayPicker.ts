import { WEEKDAYS, Weekday } from "../domain/LocalDate";
import { weekdayShort } from "./format";

export class WeekdayPicker {
	private readonly selected: Set<Weekday>;

	constructor(parent: HTMLElement, initial: readonly Weekday[]) {
		this.selected = new Set(initial);
		const row = parent.createDiv("th-weekdays");
		for (const day of WEEKDAYS) {
			const chip = row.createEl("button", { cls: "th-chip", text: weekdayShort(day) });
			chip.toggleClass("is-on", this.selected.has(day));
			chip.addEventListener("click", (event) => {
				event.preventDefault();
				if (this.selected.has(day)) this.selected.delete(day);
				else this.selected.add(day);
				chip.toggleClass("is-on", this.selected.has(day));
			});
		}
	}

	get days(): Weekday[] {
		return WEEKDAYS.filter((day) => this.selected.has(day));
	}
}
