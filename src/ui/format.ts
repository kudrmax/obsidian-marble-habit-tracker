import { Habit, Part, RecipeChange } from "../domain/Habit";
import { LocalDate, Weekday } from "../domain/LocalDate";
import { Schedule } from "../domain/Schedule";

const WEEKDAY_SHORT: Record<Weekday, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The only names the parts of a recipe have. The recipe reads as one sentence:
 * "after I … I will … on a good day … and celebrate … every …"; everything else (sheets, history, settings) uses these.
 */
export const RECIPE_LABELS: Record<Part, string> = {
	anchor: "after I",
	tiny: "I will",
	full: "on a good day",
	celebration: "and celebrate",
	schedule: "every",
};

/** The same label at the start of a line, as a field title. */
export function partTitle(part: Part): string {
	const label = RECIPE_LABELS[part];
	return label.charAt(0).toUpperCase() + label.slice(1);
}

export function recipeDays(schedule: Schedule): string {
	return schedule.isEveryDay ? "day" : schedule.weekdays.map(weekdayShort).join(", ");
}

export function weekdayShort(day: Weekday): string {
	return WEEKDAY_SHORT[day];
}

export function monthShort(date: LocalDate): string {
	return MONTH_SHORT[date.month - 1];
}

export function dayMonth(date: LocalDate): string {
	return `${MONTH_SHORT[date.month - 1]} ${date.day}`;
}

export function longDate(date: LocalDate): string {
	return `${weekdayShort(date.weekday())}, ${dayMonth(date)}`;
}

export function anchorLine(habit: Habit): string {
	return `after I ${habit.text("anchor").current() ?? ""}`;
}

export function describeChange(change: RecipeChange): string {
	const to = change.to instanceof Schedule ? recipeDays(change.to) : change.to;
	return `${RECIPE_LABELS[change.part]} → ${to}`;
}
