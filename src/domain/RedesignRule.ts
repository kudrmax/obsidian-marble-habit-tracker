import { Habit } from "./Habit";
import { LocalDate } from "./LocalDate";

/** Why a habit's recipe needs a change. */
export type RedesignReason =
	| { readonly kind: "skips"; readonly count: number }
	| { readonly kind: "lowShare"; readonly percent: number }
	| { readonly kind: "offTrigger" };

export interface RedesignSettings {
	/** Skips in a row that call for a change. */
	readonly skipsInARow: number;
	/** A habit done on less than this percent of its days over the last weeks calls for a change; 0 turns it off. */
	readonly lowShare: number;
	/** A habit done away from its trigger more often than at it calls for a change. */
	readonly offTrigger: boolean;
}

/** How far back the share of days done and the days done away from the trigger look. */
export const REDESIGN_WEEKS = 2;
const WINDOW_DAYS = REDESIGN_WEEKS * 7;
/** A share says nothing until this many days count, so a new or just changed habit isn't judged on a day or two. */
const MIN_JUDGED_DAYS = 7;
/** Days done away from the trigger it takes before they can outweigh the days done at it. */
const MIN_OFF_TRIGGER = 3;

/**
 * Tells when a habit isn't working and its recipe needs a change. Only days since the recipe last changed count, so
 * changing it starts the habit afresh.
 */
export class RedesignRule {
	constructor(private readonly settings: RedesignSettings) {}

	/** The strongest reason the habit needs a change — skips in a row, then a low share, then the trigger — or none. */
	reasonFor(habit: Habit, today: LocalDate): RedesignReason | undefined {
		const since = habit.recipeChangedOn;
		const skips = skipsInARow(habit, since);
		if (skips >= this.settings.skipsInARow) return { kind: "skips", count: skips };
		const days = recentDays(habit, since, today);
		const done = days.filter((day) => day.done).length;
		if (this.settings.lowShare > 0 && days.length >= MIN_JUDGED_DAYS && done * 100 < days.length * this.settings.lowShare) {
			return { kind: "lowShare", percent: Math.round((done * 100) / days.length) };
		}
		const offTrigger = days.filter((day) => day.offTrigger).length;
		if (this.settings.offTrigger && offTrigger >= MIN_OFF_TRIGGER && offTrigger > done - offTrigger) return { kind: "offTrigger" };
		return undefined;
	}
}

/** Skips since `since`, newest first, up to the first day answered otherwise; days left unanswered don't break the run. */
function skipsInARow(habit: Habit, since: LocalDate): number {
	let count = 0;
	for (const [date, mark] of habit.marks()) {
		if (mark.kind !== "missed" || date.isBefore(since)) break;
		count++;
	}
	return count;
}

interface RecentDay {
	readonly done: boolean;
	readonly offTrigger: boolean;
}

/** The habit's days in the window since `since`; a past day left unanswered counts as not done, today only once answered. */
function recentDays(habit: Habit, since: LocalDate, today: LocalDate): RecentDay[] {
	const days: RecentDay[] = [];
	for (let offset = WINDOW_DAYS - 1; offset >= 0; offset--) {
		const date = today.addDays(-offset);
		if (date.isBefore(since) || !habit.isScheduled(date)) continue;
		const mark = habit.markOn(date);
		if (!mark && date.equals(today)) continue;
		days.push({ done: mark !== undefined && mark.kind !== "missed", offTrigger: mark?.kind === "offTrigger" });
	}
	return days;
}
