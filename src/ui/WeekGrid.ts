import { DayMark } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate, WEEKDAYS, Weekday } from "../domain/LocalDate";
import { dayRing, markCircle } from "./components";
import { CalendarDay, dayTitle, donePercent } from "./today";
import { WeekCell, WeekGroup } from "./week";

const WEEKDAY_CAPS: Record<Weekday, string> = { mon: "Mo", tue: "Tu", wed: "We", thu: "Th", fri: "Fr", sat: "Sa", sun: "Su" };

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
	/** Over the weekdays, standing with them: the chip that names a week that isn't this one. */
	readonly above?: HTMLElement;
	/** The week's days, Monday to Sunday, with how much of each was done. */
	readonly days: readonly CalendarDay[];
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
 * The week as a grid: the weekdays and dates over seven columns, then every habit by section with a circle for each of
 * its days, drawn as Today draws them. On a phone a habit's name stands over its circles, in the tray's columns; on a
 * computer it stands to their left, each date is in a ring of how much of the day was done, and today's column is a
 * capsule from its date down to the last habit.
 */
export class WeekGrid {
	constructor(
		private readonly wide: boolean,
		private readonly actions: WeekGridActions,
	) {}

	render(parent: HTMLElement, state: WeekGridState): Map<string, WeekGridRow> {
		const grid = parent.createDiv("th-grid");
		const todayIndex = state.days.findIndex((day) => day.date.equals(state.today));
		if (this.wide && todayIndex >= 0) grid.createDiv("th-grid-today").style.setProperty("--th-grid-later", String(WEEKDAYS.length - 1 - todayIndex));
		this.renderHead(grid, state);
		const rows = new Map<string, WeekGridRow>();
		for (const group of state.groups) {
			if (group.section !== undefined) grid.createDiv({ cls: "th-group th-grid-group", text: group.section });
			for (const { path, habit, cells } of group.rows) rows.set(path, this.renderRow(grid, path, habit, cells, state));
		}
		return rows;
	}

	/** The weekdays over their dates, standing over the circles' columns while the habits scroll under them. */
	private renderHead(grid: HTMLElement, state: WeekGridState): void {
		const head = grid.createDiv("th-grid-head");
		if (state.above) head.appendChild(state.above);
		const line = head.createDiv("th-grid-line");
		line.createDiv("th-grid-name");
		const days = line.createDiv("th-grid-strip");
		for (const day of state.days) {
			const off = day.future || day.outside;
			const percent = off ? null : donePercent(day);
			const title = dayTitle(day.date, state.today);
			const cell = days.createDiv({ cls: "th-grid-day th-cal-day", attr: { "aria-label": percent === null ? title : `${title}, ${percent}% done` } });
			cell.toggleClass("is-today", day.date.equals(state.today));
			cell.toggleClass("is-off", off);
			cell.createDiv({ cls: "th-grid-weekday", text: WEEKDAY_CAPS[day.date.weekday()] });
			const date = cell.createDiv("th-grid-date");
			if (this.wide && !off) dayRing(date, (percent ?? 0) / 100);
			date.createSpan("th-cal-date").createSpan({ cls: "th-cal-figure", text: String(day.date.day) });
		}
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

	/** A day to answer is a circle to click; a day that isn't one of the habit's is a dot; the rest stay empty. */
	private renderCell(strip: HTMLElement, path: string, cell: WeekCell, state: WeekGridState): void {
		if (cell.kind !== "due") {
			const still = strip.createDiv({ cls: ["th-grid-cell", `is-${cell.kind}`] });
			if (cell.kind === "off") still.createSpan("th-grid-rest");
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
