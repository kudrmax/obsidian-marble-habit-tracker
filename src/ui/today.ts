import { HabitEntry } from "../application/ports";
import { DayMark } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";
import { needsRedesign } from "../domain/RedesignRule";
import { visibleEntries } from "./order";

export const FELT_TOO_BIG = "Felt too big";
export const REASONS = ["Forgot", "Anchor didn't happen", "No energy", FELT_TOO_BIG] as const;

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export function closeDayTitle(left: number): string {
	if (left === 0) return "Day closed";
	return `${WORDS[left] ?? left} left to close the day`;
}

export function todayEntries(entries: readonly HabitEntry[], today: LocalDate): HabitEntry[] {
	return visibleEntries(entries).filter(
		(entry) => entry.kind === "broken" || entry.habit.isScheduled(today) || entry.habit.markOn(today) !== undefined,
	);
}

export function celebrationLine(habit: Habit, mark: DayMark): string {
	return habit.text("celebration").current() ?? (mark.kind === "full" ? "Did more" : "Done");
}

export function offersShrink(habit: Habit, mark: DayMark, threshold: number): boolean {
	if (mark.kind !== "missed") return false;
	return mark.reason === FELT_TOO_BIG || needsRedesign(habit, threshold);
}
