import { Habit, Part, RecipeChange } from "../domain/Habit";
import { LocalDate, Weekday } from "../domain/LocalDate";
import { Schedule } from "../domain/Schedule";
import { Breakdown } from "../domain/Stats";

const WEEKDAY_SHORT: Record<Weekday, string> = { mon: "пн", tue: "вт", wed: "ср", thu: "чт", fri: "пт", sat: "сб", sun: "вс" };
const MONTH_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTH_LONG = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export const PART_LABELS: Record<Part, string> = {
	anchor: "якорь",
	tiny: "нано",
	full: "полное",
	celebration: "празднование",
	schedule: "расписание",
};

export const LEVEL_LABELS = { tiny: "нано", full: "полное" } as const;

export const BREAKDOWN_LABELS: Record<keyof Breakdown, string> = {
	tiny: "нано",
	full: "полное",
	missed: "не получилось",
	empty: "пусто",
};

export function weekdayShort(day: Weekday): string {
	return WEEKDAY_SHORT[day];
}

export function scheduleLabel(schedule: Schedule): string {
	return schedule.isEveryDay ? "каждый день" : schedule.weekdays.map(weekdayShort).join(", ");
}

export function dayMonth(date: LocalDate): string {
	return `${date.day} ${MONTH_SHORT[date.month - 1]}`;
}

export function longDate(date: LocalDate): string {
	return `${weekdayShort(date.weekday())}, ${date.day} ${MONTH_LONG[date.month - 1]}`;
}

export function recipeLine(habit: Habit): string {
	const full = habit.text("full").current();
	const tiny = `нано: ${habit.text("tiny").current() ?? ""}`;
	return full ? `${tiny} · полное: ${full}` : tiny;
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
