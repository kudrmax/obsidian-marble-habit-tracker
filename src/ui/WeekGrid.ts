import { LocalDate } from "../domain/LocalDate";
import { markCircle } from "./components";
import { PressHold } from "./PressHold";
import { dayTitle } from "./today";
import { WeekCell } from "./week";

/** What the circles do: a click on an empty one opens the answers, a hold on a marked one clears it; a right-click opens the answers. */
export interface WeekGridActions {
	choose(path: string, day: LocalDate): void;
	clear(path: string, day: LocalDate): void;
}

export interface WeekGridState {
	readonly today: LocalDate;
	popping(day: LocalDate): boolean;
}

/**
 * A habit's circles on the grid, one a day, drawn as Today draws its circle, after the name in the habit's own row on
 * Today. The dates are the calendar's own, over the circles on a computer and under them in the folded tray on a
 * phone, so the grid draws none.
 */
export class WeekGrid {
	constructor(
		private readonly actions: WeekGridActions,
		private readonly hold: PressHold,
	) {}

	render(parent: HTMLElement, path: string, cells: readonly WeekCell[], state: WeekGridState): void {
		const strip = parent.createDiv("th-grid-strip");
		for (const cell of cells) this.renderCell(strip, path, cell, state);
	}

	private renderCell(strip: HTMLElement, path: string, cell: WeekCell, state: WeekGridState): void {
		if (cell.kind === "future") {
			strip.createDiv("th-grid-cell");
			return;
		}
		const button = strip.createEl("button", { cls: "th-grid-cell" });
		button.createSpan({ cls: "th-sr-only", text: `${dayTitle(cell.date, state.today)}: ${cell.mark ? "hold to clear the mark" : "answer"}` });
		markCircle(button, cell.mark).toggleClass("is-popping", state.popping(cell.date));
		if (cell.mark) this.hold.attach(button, () => this.actions.clear(path, cell.date));
		else button.addEventListener("click", () => this.actions.choose(path, cell.date));
		button.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			this.actions.choose(path, cell.date);
		});
	}
}
