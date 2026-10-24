import { HabitEntry } from "../application/ports";
import { DayMark } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate, WEEKDAYS } from "../domain/LocalDate";
import { dayMonth } from "./format";
import { groupBySection, visibleEntries } from "./order";

/** How a habit's day stands in the week: still to come, or one to answer. */
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

export function sameWeek(a: LocalDate, b: LocalDate): boolean {
	return mondayOf(a).equals(mondayOf(b));
}

/** Every day up to today is a circle to answer, whatever the habit's days; the days to come are empty. */
export function weekCell(habit: Habit, date: LocalDate, today: LocalDate): WeekCell {
	if (date.isAfter(today)) return { date, kind: "future" };
	return { date, kind: "due", mark: habit.markOn(date) };
}

/** Every habit that isn't archived, by section as on Today, each with its days from Monday to Sunday of `day`'s week. */
export function weekGroups(entries: readonly HabitEntry[], day: LocalDate, today: LocalDate): WeekGroup[] {
	const monday = mondayOf(day);
	const habits = visibleEntries(entries).flatMap((entry) => (entry.kind === "ok" ? [entry] : []));
	return groupBySection(habits, (entry) => entry.habit.section)
		.filter((group) => group.items.length > 0)
		.map((group) => ({
			section: group.section,
			rows: group.items.map((entry) => ({
				path: entry.path,
				habit: entry.habit,
				cells: WEEKDAYS.map((_, index) => weekCell(entry.habit, monday.addDays(index), today)),
			})),
		}));
}

/** "This week", "Last week", or the week's dates, with the year when it is another year. */
export function weekTitle(day: LocalDate, today: LocalDate): string {
	const monday = mondayOf(day);
	const back = mondayOf(today).daysSince(monday) / WEEKDAYS.length;
	if (back === 0) return "This week";
	if (back === 1) return "Last week";
	const sunday = monday.addDays(WEEKDAYS.length - 1);
	const end = sunday.month === monday.month ? String(sunday.day) : dayMonth(sunday);
	const year = monday.year === today.year ? "" : ` ${monday.year}`;
	return `${dayMonth(monday)} – ${end}${year}`;
}
