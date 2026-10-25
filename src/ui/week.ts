import { DayMark } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate, WEEKDAYS } from "../domain/LocalDate";
import { dayMonth } from "./format";
import { CalendarDay, CalendarMonth, StripDay } from "./today";

/** How a habit's day stands in the grid: still to come, or one to answer. */
export type WeekCellKind = "future" | "due";

export interface WeekCell {
	readonly date: LocalDate;
	readonly kind: WeekCellKind;
	readonly mark?: DayMark;
}

export function mondayOf(day: LocalDate): LocalDate {
	return day.addDays(-WEEKDAYS.indexOf(day.weekday()));
}

/** Every day up to today is a circle to answer, whatever the habit's days; the days to come are empty. */
export function weekCell(habit: Habit, date: LocalDate, today: LocalDate): WeekCell {
	if (date.isAfter(today)) return { date, kind: "future" };
	return { date, kind: "due", mark: habit.markOn(date) };
}

/** A habit's `count` days up to `end`, oldest first, for its circles on the grid. */
export function weekCells(habit: Habit, end: LocalDate, today: LocalDate, count: number): WeekCell[] {
	return gridDates(end, count).map((date) => weekCell(habit, date, today));
}

/** The calendar's `count` days up to `end`, for the dates over the grid's columns; days before the calendar starts are outside. */
export function daysUpTo(days: readonly StripDay[], end: LocalDate, today: LocalDate, count: number): CalendarDay[] {
	const known = new Map(days.map((day) => [day.date.toString(), day]));
	return gridDates(end, count).map((date) => {
		const day = known.get(date.toString());
		return day ? { ...day, outside: false } : { date, due: 0, done: 0, future: date.isAfter(today), outside: true };
	});
}

/**
 * Where the grid's days end after a step of a day back or on, as the arrows by them take it on a phone and on a
 * computer alike: never past today, nor back before the calendar's first month; null where the step can't go.
 */
export function stepDays(end: LocalDate, step: -1 | 1, today: LocalDate, months: readonly CalendarMonth[]): LocalDate | null {
	const first = months[0];
	const earliest = first ? LocalDate.of(first.year, first.month, 1) : today;
	if (step > 0 ? !end.isBefore(today) : !end.isAfter(earliest)) return null;
	return end.addDays(step);
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
