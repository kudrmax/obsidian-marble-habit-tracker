import { Habit, Part, RecipeChange } from "../domain/Habit";
import { LocalDate, Weekday } from "../domain/LocalDate";
import { Schedule } from "../domain/Schedule";

const WEEKDAY_SHORT: Record<Weekday, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type LabelSet = Readonly<Record<Part, string>>;

/** The recipe reads as one sentence: "after I … I will … on a good day … and celebrate … every …". */
export const DEFAULT_LABELS: LabelSet = {
	anchor: "after I",
	tiny: "I will",
	full: "on a good day",
	celebration: "and celebrate",
	schedule: "every",
};

/** The only names the parts of a recipe have, as set in settings; sheets, the habit panel, Today and history use these. */
export class RecipeLabels {
	constructor(private readonly set: LabelSet = DEFAULT_LABELS) {}

	of(part: Part): string {
		return this.set[part];
	}

	/** The label at the start of a line, as a field title. */
	title(part: Part): string {
		const label = this.set[part];
		return label.charAt(0).toUpperCase() + label.slice(1);
	}

	/** "after I …", or nothing for a habit with no anchor. */
	anchorLine(habit: Habit): string {
		const anchor = habit.text("anchor").current();
		return anchor ? `${this.set.anchor} ${anchor}` : "";
	}

	describeChange(change: RecipeChange): string {
		const to = change.to instanceof Schedule ? recipeDays(change.to) : change.to;
		return `${this.set[change.part]} → ${to}`;
	}
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


