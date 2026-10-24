import { DayMark } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";
import { markCircle } from "./components";
import { dayTitle } from "./today";
import { WeekCell, WeekGroup } from "./week";

/** What the circles do: a click on an empty one opens the answers, on a marked one clears it; a right-click opens the answers. */
export interface WeekGridActions {
	tap(path: string, day: LocalDate, mark: DayMark | undefined): void;
	choose(path: string, day: LocalDate): void;
}

export interface WeekGridState {
	readonly today: LocalDate;
	readonly groups: readonly WeekGroup[];
	popping(path: string, day: LocalDate): boolean;
}

/** A habit's row as drawn, for the answers, a skip's reasons and the offer to shrink to go into. */
export interface WeekGridRow {
	readonly habit: Habit;
	readonly row: HTMLElement;
	/** The line with the name and the circles, which the answers slide over. */
	readonly line: HTMLElement;
}

/**
 * The last five days as Today's list: the sections and names as on Today, each name on one line with its five
 * circles to its right, drawn as Today draws them. The dates are the calendar's own, over the circles on a computer
 * and under them in the folded tray on a phone, so the grid draws none.
 */
export class WeekGrid {
	constructor(private readonly actions: WeekGridActions) {}

	render(parent: HTMLElement, state: WeekGridState): Map<string, WeekGridRow> {
		const grid = parent.createDiv("th-grid");
		const rows = new Map<string, WeekGridRow>();
		for (const group of state.groups) {
			if (group.section !== undefined) grid.createDiv({ cls: "th-group th-grid-group", text: group.section });
			for (const { path, habit, cells } of group.rows) rows.set(path, this.renderRow(grid, path, habit, cells, state));
		}
		return rows;
	}

	private renderRow(grid: HTMLElement, path: string, habit: Habit, cells: readonly WeekCell[], state: WeekGridState): WeekGridRow {
		const row = grid.createDiv("th-grid-row");
		const line = row.createDiv("th-grid-line");
		line.createDiv({ cls: "th-grid-name", text: habit.name });
		const strip = line.createDiv("th-grid-strip");
		for (const cell of cells) this.renderCell(strip, path, cell, state);
		return { habit, row, line };
	}

	private renderCell(strip: HTMLElement, path: string, cell: WeekCell, state: WeekGridState): void {
		if (cell.kind === "future") {
			strip.createDiv("th-grid-cell");
			return;
		}
		const button = strip.createEl("button", { cls: "th-grid-cell" });
		button.createSpan({ cls: "th-sr-only", text: `${dayTitle(cell.date, state.today)}: ${cell.mark ? "clear the mark" : "answer"}` });
		markCircle(button, cell.mark).toggleClass("is-popping", state.popping(path, cell.date));
		button.addEventListener("click", () => this.actions.tap(path, cell.date, cell.mark));
		button.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			this.actions.choose(path, cell.date);
		});
	}
}
