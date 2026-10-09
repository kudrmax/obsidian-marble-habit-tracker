import { HABIT_COLORS, HabitColor } from "../domain/HabitColor";
import { colorClass } from "./colors";

const OPTIONS: ReadonlyArray<HabitColor | undefined> = [undefined, ...HABIT_COLORS];

export class ColorPicker {
	private selected: HabitColor | undefined;

	constructor(parent: HTMLElement, initial: HabitColor | undefined, onChange?: (color: HabitColor | undefined) => void) {
		this.selected = initial;
		const row = parent.createDiv("th-swatches");
		const swatches = OPTIONS.map((color) => {
			const swatch = row.createEl("button", { cls: ["th-swatch", "th-habit", colorClass(color)], attr: { "aria-label": color ?? "accent" } });
			swatch.addEventListener("click", (event) => {
				event.preventDefault();
				this.selected = color;
				swatches.forEach((other, index) => other.toggleClass("is-selected", OPTIONS[index] === color));
				onChange?.(color);
			});
			swatch.toggleClass("is-selected", color === initial);
			return swatch;
		});
	}

	get color(): HabitColor | undefined {
		return this.selected;
	}
}
