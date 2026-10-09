import { Habit, Part, RecipeChange } from "../domain/Habit";
import { LocalDate, Weekday } from "../domain/LocalDate";
import { Schedule } from "../domain/Schedule";
import { Breakdown } from "../domain/Stats";

const WEEKDAY_SHORT: Record<Weekday, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const PART_LABELS: Record<Part, string> = {
	anchor: "Anchor",
	tiny: "Tiny habit",
	full: "Full habit",
	celebration: "Celebration",
	schedule: "Schedule",
};

export const LEVEL_LABELS = { tiny: "Tiny", full: "Full" } as const;

export const BREAKDOWN_LABELS: Record<keyof Breakdown, string> = {
	tiny: "Tiny",
	full: "Full",
	missed: "Didn't happen",
	empty: "Not marked",
};

export function weekdayShort(day: Weekday): string {
	return WEEKDAY_SHORT[day];
}

export function scheduleLabel(schedule: Schedule): string {
	return schedule.isEveryDay ? "Every day" : schedule.weekdays.map(weekdayShort).join(", ");
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
	return `After I ${habit.text("anchor").current() ?? ""}`;
}

export function celebrationText(habit: Habit, kind: "tiny" | "full"): { title: string; subtitle: string } {
	const celebration = habit.text("celebration").current();
	return celebration
		? { title: celebration, subtitle: `${habit.name} · ${LEVEL_LABELS[kind]}` }
		: { title: habit.name, subtitle: LEVEL_LABELS[kind] };
}

export function describeChange(change: RecipeChange): string {
	const show = (value: string | Schedule | undefined) => (value instanceof Schedule ? scheduleLabel(value) : value);
	const from = show(change.from);
	const to = show(change.to);
	return `${PART_LABELS[change.part]}: ${from === undefined ? to : `${from} → ${to}`}`;
}
