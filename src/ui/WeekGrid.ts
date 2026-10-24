import { DayMark } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate, WEEKDAYS } from "../domain/LocalDate";
import { markCircle } from "./components";
import { dayTitle } from "./today";
import { WeekCell, WeekGroup } from "./week";

/** What the circles do: a click on an empty one opens the answers, on a marked one clears it; a right-click opens the answers. */
export interface WeekGridActions {
	tap(path: string, day: LocalDate, mark: DayMark | undefined): void;
	choose(path: string, day: LocalDate): void;
}

/** The habit and the day being answered; its row says which day. */
export interface WeekFocus {
	readonly path: string;
	readonly day: LocalDate;
}

export interface WeekGridState {
	readonly today: LocalDate;
	readonly groups: readonly WeekGroup[];
	readonly focus: WeekFocus | null;
	popping(path: string, day: LocalDate): boolean;
}

/** A habit's row as drawn, for the answers, a skip's reasons and the offer to shrink to go into. */
export interface WeekGridRow {
	readonly habit: Habit;
	readonly row: HTMLElement;
	/** The seven circles, which the answers slide over. */
	readonly strip: HTMLElement;
}

/**
 * The week as Today's list with seven circles a habit: the sections and names as on Today, the circles as Today draws
 * them. The days are the calendar's own, so the grid draws none: on a phone the circles stand over the tray's dates,
 * the name over its circles; on a computer they stand under the week over the list, the name to their left, and
 * today's column is a capsule down from today's date.
 */
export class WeekGrid {
	constructor(
		private readonly wide: boolean,
		private readonly actions: WeekGridActions,
	) {}

	render(parent: HTMLElement, state: WeekGridState): Map<string, WeekGridRow> {
		const grid = parent.createDiv("th-grid");
		const rows = new Map<string, WeekGridRow>();
		let todayColumn = -1;
		for (const group of state.groups) {
			if (group.section !== undefined) grid.createDiv({ cls: "th-group th-grid-group", text: group.section });
			for (const { path, habit, cells } of group.rows) {
				rows.set(path, this.renderRow(grid, path, habit, cells, state));
				todayColumn = cells.findIndex((cell) => cell.date.equals(state.today));
			}
		}
		if (this.wide && todayColumn >= 0) grid.createDiv("th-grid-today").style.setProperty("--th-grid-later", String(WEEKDAYS.length - 1 - todayColumn));
		return rows;
	}

	private renderRow(grid: HTMLElement, path: string, habit: Habit, cells: readonly WeekCell[], state: WeekGridState): WeekGridRow {
		const row = grid.createDiv("th-grid-row");
		const line = row.createDiv("th-grid-line");
		const name = line.createDiv("th-grid-name");
		name.createSpan({ cls: "th-grid-title", text: habit.name });
		if (state.focus?.path === path) name.createSpan({ cls: "th-grid-when", text: dayTitle(state.focus.day, state.today) });
		const strip = line.createDiv("th-grid-strip");
		for (const cell of cells) this.renderCell(strip, path, cell, state);
		return { habit, row, strip };
	}

	/** A day up to today is a circle to click; a day to come keeps its place, empty. */
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
