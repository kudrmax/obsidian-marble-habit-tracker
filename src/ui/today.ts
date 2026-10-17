import { HabitEntry } from "../application/ports";
import { DayMark, isDone } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate, WEEKDAYS } from "../domain/LocalDate";
import { needsRedesign } from "../domain/RedesignRule";
import { longDate } from "./format";
import { visibleEntries } from "./order";


/** "Today", "Yesterday", or the date of an earlier day. */
export function dayTitle(day: LocalDate, today: LocalDate): string {
	if (day.equals(today)) return "Today";
	if (day.equals(today.addDays(-1))) return "Yesterday";
	return longDate(day);
}

export function closedDayLine(skipped: number): string {
	return skipped === 0 ? "Every habit, done" : `${skipped} skipped honestly · see you tomorrow`;
}

export function totalWins(entries: readonly HabitEntry[]): number {
	return entries.reduce((sum, entry) => sum + (entry.kind === "ok" ? entry.habit.marks().filter(([, mark]) => isDone(mark)).length : 0), 0);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The small line under the big number: since the month of the very first win, with its year if that was another year. */
export function winsSince(entries: readonly HabitEntry[], today: LocalDate): string {
	const first = entries
		.flatMap((entry) => (entry.kind === "ok" ? entry.habit.marks().filter(([, mark]) => isDone(mark)).map(([date]) => date) : []))
		.reduce<LocalDate | null>((earliest, date) => (earliest === null || date.isBefore(earliest) ? date : earliest), null);
	if (!first) return "wins";
	const month = MONTHS[first.month - 1];
	return first.year === today.year ? `wins since ${month}` : `wins since ${month} ${first.year}`;
}

export function winsLabel(count: number): string {
	return count === 1 ? "1 win" : `${count} wins`;
}

export interface StripDay {
	readonly date: LocalDate;
	readonly due: number;
	readonly done: number;
	readonly future: boolean;
}

/** A day in Today's calendar; the days before the strip starts are only there to fill its first week. */
export interface CalendarDay extends StripDay {
	readonly outside: boolean;
}

/** How many days the calendar shows at least, today included. */
const STRIP_DAYS = 14;

/**
 * The days of Today's calendar, oldest first: from the first marked day, or two weeks back if that is later, to the end
 * of this week. Each day says how many habits were due and how many were done.
 */
export function dayStrip(entries: readonly HabitEntry[], today: LocalDate): StripDay[] {
	const habits = visibleEntries(entries).flatMap((entry) => (entry.kind === "ok" ? [entry.habit] : []));
	let start = today.addDays(1 - STRIP_DAYS);
	for (const habit of habits) for (const [date] of habit.marks()) if (date.isBefore(start)) start = date;
	const end = today.addDays(6 - WEEKDAYS.indexOf(today.weekday()));
	const days: StripDay[] = [];
	for (let date = start; !date.isAfter(end); date = date.addDays(1)) {
		const due = habits.filter((habit) => habit.isScheduled(date) || habit.markOn(date) !== undefined);
		days.push({ date, due: due.length, done: due.filter((habit) => isDone(habit.markOn(date))).length, future: date.isAfter(today) });
	}
	return days;
}

/** A month of the calendar. */
export interface CalendarMonth {
	readonly year: number;
	readonly month: number;
}

/** The months the calendar can show, oldest first: from the month of its first day to this month. */
export function calendarMonths(days: readonly StripDay[], today: LocalDate): CalendarMonth[] {
	const first = days[0]?.date ?? today;
	const months: CalendarMonth[] = [];
	let year = first.year;
	let month = first.month;
	while (year < today.year || (year === today.year && month <= today.month)) {
		months.push({ year, month });
		year += month === 12 ? 1 : 0;
		month = month === 12 ? 1 : month + 1;
	}
	return months;
}

/**
 * A month as weeks from Monday: from the week of its first day to the week of its last, this month only up to this
 * week. The calendar's days in the month keep their counts; the neighbouring months' days, and the month's days before
 * the calendar starts, are outside.
 */
export function monthWeeks(days: readonly StripDay[], month: CalendarMonth, today: LocalDate): CalendarDay[][] {
	const first = LocalDate.of(month.year, month.month, 1);
	const last = LocalDate.of(month.year, month.month + 1, 0);
	const start = first.addDays(-WEEKDAYS.indexOf(first.weekday()));
	const monthEnd = last.addDays(WEEKDAYS.length - 1 - WEEKDAYS.indexOf(last.weekday()));
	const weekEnd = today.addDays(WEEKDAYS.length - 1 - WEEKDAYS.indexOf(today.weekday()));
	const end = monthEnd.isAfter(weekEnd) ? weekEnd : monthEnd;
	const known = new Map(days.map((day) => [day.date.toString(), day]));
	const all: CalendarDay[] = [];
	for (let date = start; !date.isAfter(end); date = date.addDays(1)) {
		const day = known.get(date.toString());
		const inMonth = date.year === month.year && date.month === month.month;
		all.push(day && inMonth ? { ...day, outside: false } : { date, due: 0, done: 0, future: date.isAfter(today), outside: true });
	}
	const weeks: CalendarDay[][] = [];
	for (let at = 0; at < all.length; at += WEEKDAYS.length) weeks.push(all.slice(at, at + WEEKDAYS.length));
	return weeks;
}

/** How much room a month's name gets: its whole name, or its first three letters. */
export type MonthLength = "long" | "short";

/** A month's name, with its year only when it isn't this year. */
export function monthTitle(month: CalendarMonth, today: LocalDate, length: MonthLength = "long"): string {
	const whole = MONTHS[month.month - 1];
	const name = length === "long" ? whole : whole.slice(0, 3);
	return month.year === today.year ? name : `${name} ${month.year}`;
}

/** How much of a day was done, as a whole percent; null for a day with nothing due. */
export function donePercent(day: StripDay): number | null {
	return day.due === 0 ? null : Math.round((day.done / day.due) * 100);
}

export function todayEntries(entries: readonly HabitEntry[], today: LocalDate): HabitEntry[] {
	return visibleEntries(entries).filter(
		(entry) => entry.kind === "broken" || entry.habit.isScheduled(today) || entry.habit.markOn(today) !== undefined,
	);
}

/** A miss offers to make the habit tinier when its reason is the shrink reason, or after too many misses in a row. */
export function offersShrink(habit: Habit, mark: DayMark, threshold: number, shrinkReason: string): boolean {
	if (mark.kind !== "missed") return false;
	return (shrinkReason !== "" && mark.reason === shrinkReason) || needsRedesign(habit, threshold);
}
