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

/** How many days the strip under the sheet shows at least, today included. */
const STRIP_DAYS = 14;

/**
 * The days under Today's sheet, oldest first: from the first marked day, or two weeks back if that is later, to the end
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
