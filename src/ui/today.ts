import { HabitEntry } from "../application/ports";
import { DEFAULT_WIN_RULE, DayMark, WinRule, isWin } from "../domain/DayMark";
import { LocalDate, WEEKDAYS } from "../domain/LocalDate";
import { REDESIGN_WEEKS, RedesignReason } from "../domain/RedesignRule";
import { RecipeLabels, longDate } from "./format";
import { visibleEntries } from "./order";


/** The word for each answer: on its button among the choices, and in the line that offers to undo it. */
export const MARK_WORDS: Record<DayMark["kind"], string> = { full: "Full", tiny: "Tiny", offTrigger: "Anytime", missed: "Skip" };

/** "Today", "Yesterday", or the date of an earlier day. */
export function dayTitle(day: LocalDate, today: LocalDate): string {
	if (day.equals(today)) return "Today";
	if (day.equals(today.addDays(-1))) return "Yesterday";
	return longDate(day);
}

export function closedDayLine(skipped: number): string {
	return skipped === 0 ? "Every habit, done" : `${skipped} skipped honestly · see you tomorrow`;
}

export function totalWins(entries: readonly HabitEntry[], wins: WinRule = DEFAULT_WIN_RULE): number {
	return entries.reduce((sum, entry) => sum + (entry.kind === "ok" ? entry.habit.marks().filter(([, mark]) => isWin(mark, wins)).length : 0), 0);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The small line under the big number: since the month of the very first win, with its year if that was another year. */
export function winsSince(entries: readonly HabitEntry[], today: LocalDate, wins: WinRule = DEFAULT_WIN_RULE): string {
	const first = entries
		.flatMap((entry) => (entry.kind === "ok" ? entry.habit.marks().filter(([, mark]) => isWin(mark, wins)).map(([date]) => date) : []))
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
	/** How many of its habits a past day still waits an answer for. */
	readonly unanswered: number;
	readonly future: boolean;
}

/** A day in Today's calendar; the days before the strip starts are only there to fill its first week. */
export interface CalendarDay extends StripDay {
	readonly outside: boolean;
}

/** A day the calendar knows nothing of, there only to fill a week. */
export function blankDay(date: LocalDate, today: LocalDate, outside: boolean): CalendarDay {
	return { date, due: 0, done: 0, unanswered: 0, future: date.isAfter(today), outside };
}

/** How many days the calendar shows at least, today included. */
const STRIP_DAYS = 14;

/**
 * The days of Today's calendar, oldest first: from the first marked day, or two weeks back if that is later, to the end
 * of this week. Each day says how many habits were due, how many were done, and how many still wait an answer.
 */
export function dayStrip(entries: readonly HabitEntry[], today: LocalDate, wins: WinRule = DEFAULT_WIN_RULE): StripDay[] {
	const habits = visibleEntries(entries).flatMap((entry) => (entry.kind === "ok" ? [entry.habit] : []));
	let start = today.addDays(1 - STRIP_DAYS);
	for (const habit of habits) for (const [date] of habit.marks()) if (date.isBefore(start)) start = date;
	const end = today.addDays(6 - WEEKDAYS.indexOf(today.weekday()));
	const days: StripDay[] = [];
	for (let date = start; !date.isAfter(end); date = date.addDays(1)) {
		const due = habits.filter((habit) => habit.isScheduled(date) || habit.markOn(date) !== undefined);
		days.push({
			date,
			due: due.length,
			done: due.filter((habit) => isWin(habit.markOn(date), wins)).length,
			unanswered: due.filter((habit) => habit.awaitsAnswer(date, today)).length,
			future: date.isAfter(today),
		});
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
		all.push(day && inMonth ? { ...day, outside: false } : blankDay(date, today, true));
	}
	const weeks: CalendarDay[][] = [];
	for (let at = 0; at < all.length; at += WEEKDAYS.length) weeks.push(all.slice(at, at + WEEKDAYS.length));
	return weeks;
}

/**
 * A month as weeks from Monday, as the phone's tray lays it out: from the week of its first day to the week of its
 * last, this month only up to this week, with `before` more weeks ahead of them. Every day keeps its counts whichever
 * month it is in; the other months' days are outside.
 */
export function trayWeeks(days: readonly StripDay[], month: CalendarMonth, today: LocalDate, before = 0): CalendarDay[][] {
	const known = new Map(days.map((day) => [day.date.toString(), day]));
	const weeks = monthWeeks(days, month, today).map((week) => week.map((day) => day.date));
	const earlier = Array.from({ length: before }, (_, index) => weeks[0].map((date) => date.addDays((index - before) * WEEKDAYS.length)));
	return [...earlier, ...weeks].map((week) =>
		week.map((date) => {
			const outside = date.year !== month.year || date.month !== month.month;
			const day = known.get(date.toString());
			return day ? { ...day, outside } : blankDay(date, today, outside);
		}),
	);
}

/**
 * The week from Monday that `day` is in, as the week over a computer's list shows it: the calendar's days keep their
 * counts, and days before the calendar starts are outside.
 */
export function calendarWeek(days: readonly StripDay[], day: LocalDate, today: LocalDate): CalendarDay[] {
	const known = new Map(days.map((strip) => [strip.date.toString(), strip]));
	const start = day.addDays(-WEEKDAYS.indexOf(day.weekday()));
	return WEEKDAYS.map((_, index) => {
		const date = start.addDays(index);
		const strip = known.get(date.toString());
		return strip ? { ...strip, outside: false } : blankDay(date, today, true);
	});
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

/** A calendar day in words: its name, how much of it was done, and how many habits it still waits an answer for. */
export function dayLabel(day: StripDay, today: LocalDate): string {
	const percent = day.future ? null : donePercent(day);
	const parts = [dayTitle(day.date, today)];
	if (percent !== null) parts.push(`${percent}% done`);
	if (day.unanswered > 0) parts.push(`${day.unanswered} to answer`);
	return parts.join(", ");
}

export function todayEntries(entries: readonly HabitEntry[], today: LocalDate): HabitEntry[] {
	return visibleEntries(entries).filter(
		(entry) => entry.kind === "broken" || entry.habit.isScheduled(today) || entry.habit.markOn(today) !== undefined,
	);
}

/** What the orange line under a habit that needs a change says. */
export function redesignLine(reason: RedesignReason, labels: RecipeLabels): string {
	switch (reason.kind) {
		case "skips":
			return `${reason.count} ${reason.count === 1 ? "skip" : "skips"} in a row`;
		case "lowShare":
			return `${reason.percent}% done in ${REDESIGN_WEEKS} weeks`;
		case "offTrigger":
			return `Mostly not at ${labels.of("anchor")}`;
	}
}
