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

/** The days as weeks from Monday; the first week is filled back to its Monday with days outside the strip. */
export function calendarWeeks(days: readonly StripDay[]): CalendarDay[][] {
	if (days.length === 0) return [];
	const first = days[0].date;
	const before: CalendarDay[] = [];
	for (let back = WEEKDAYS.indexOf(first.weekday()); back > 0; back--) before.push({ date: first.addDays(-back), due: 0, done: 0, future: false, outside: true });
	const all = [...before, ...days.map((day) => ({ ...day, outside: false }))];
	const weeks: CalendarDay[][] = [];
	for (let start = 0; start < all.length; start += WEEKDAYS.length) weeks.push(all.slice(start, start + WEEKDAYS.length));
	return weeks;
}

/** How much of a day was done, as a whole percent; null for a day with nothing due. */
export function donePercent(day: StripDay): number | null {
	return day.due === 0 ? null : Math.round((day.done / day.due) * 100);
}

/** The month the weeks span, or the first and the last of them, with years when they differ. */
export function monthsOf(weeks: readonly (readonly CalendarDay[])[]): string {
	const first = weeks[0]?.[0]?.date;
	const lastWeek = weeks[weeks.length - 1];
	const last = lastWeek?.[lastWeek.length - 1]?.date;
	if (!first || !last) return "";
	if (first.year !== last.year) return `${MONTHS[first.month - 1]} ${first.year} – ${MONTHS[last.month - 1]} ${last.year}`;
	if (first.month === last.month) return MONTHS[first.month - 1];
	return `${MONTHS[first.month - 1]} – ${MONTHS[last.month - 1]}`;
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
