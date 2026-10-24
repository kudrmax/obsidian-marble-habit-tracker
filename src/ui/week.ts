import { HabitEntry } from "../application/ports";
import { DayMark } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate, WEEKDAYS } from "../domain/LocalDate";
import { dayMonth } from "./format";
import { groupBySection, visibleEntries } from "./order";
import { CalendarDay, StripDay } from "./today";

/** How a habit's day stands in the grid: still to come, or one to answer. */
export type WeekCellKind = "future" | "due";

export interface WeekCell {
	readonly date: LocalDate;
	readonly kind: WeekCellKind;
	readonly mark?: DayMark;
}

export interface WeekRow {
	readonly path: string;
	readonly habit: Habit;
	readonly cells: readonly WeekCell[];
}

export interface WeekGroup {
	readonly section?: string;
	readonly rows: readonly WeekRow[];
}

export function mondayOf(day: LocalDate): LocalDate {
	return day.addDays(-WEEKDAYS.indexOf(day.weekday()));
}

/** Every day up to today is a circle to answer, whatever the habit's days; the days to come are empty. */
export function weekCell(habit: Habit, date: LocalDate, today: LocalDate): WeekCell {
	if (date.isAfter(today)) return { date, kind: "future" };
	return { date, kind: "due", mark: habit.markOn(date) };
}

/** Every habit that isn't archived, by section as on Today, each with its `count` days up to `end`, oldest first. */
export function weekGroups(entries: readonly HabitEntry[], end: LocalDate, today: LocalDate, count: number): WeekGroup[] {
	const habits = visibleEntries(entries).flatMap((entry) => (entry.kind === "ok" ? [entry] : []));
	return groupBySection(habits, (entry) => entry.habit.section)
		.filter((group) => group.items.length > 0)
		.map((group) => ({
			section: group.section,
			rows: group.items.map((entry) => ({
				path: entry.path,
				habit: entry.habit,
				cells: gridDates(end, count).map((date) => weekCell(entry.habit, date, today)),
			})),
		}));
}

/** The calendar's `count` days up to `end`, for the dates over the grid's columns; days before the calendar starts are outside. */
export function daysUpTo(days: readonly StripDay[], end: LocalDate, today: LocalDate, count: number): CalendarDay[] {
	const known = new Map(days.map((day) => [day.date.toString(), day]));
	return gridDates(end, count).map((date) => {
		const day = known.get(date.toString());
		return day ? { ...day, outside: false } : { date, due: 0, done: 0, future: date.isAfter(today), outside: true };
	});
}

/** The `count` days up to `end` as dates, with the year when it is another year: "Oct 4 – 8", "Sep 29 – Oct 3". */
export function daysTitle(end: LocalDate, today: LocalDate, count: number): string {
	const start = end.addDays(1 - count);
	const last = start.month === end.month ? String(end.day) : dayMonth(end);
	const year = end.year === today.year ? "" : ` ${end.year}`;
	return `${dayMonth(start)} – ${last}${year}`;
}

function gridDates(end: LocalDate, count: number): LocalDate[] {
	return Array.from({ length: count }, (_, index) => end.addDays(index + 1 - count));
}
