import { DayMark } from "../domain/DayMark";
import { LocalDate } from "../domain/LocalDate";
import { MARK_WORDS, dayTitle } from "./today";

/** One answer on Today: a habit's day as it was before and as it is after, to put it back. */
export interface MarkChange {
	readonly path: string;
	readonly name: string;
	readonly day: LocalDate;
	readonly before: DayMark | undefined;
	readonly after: DayMark | undefined;
}

const sameMark = (one: DayMark | undefined, other: DayMark | undefined) =>
	one?.kind === other?.kind && (one?.kind !== "missed" || other?.kind !== "missed" || one.reason === other.reason);

/**
 * The answer to offer to undo once `change` is made, after `last`. A skip's reason only finishes the skip just made,
 * so undo still goes back to the day before the skip. An answer that changed nothing leaves `last` on offer.
 */
export function nextChange(last: MarkChange | null, change: MarkChange): MarkChange | null {
	const finishesSkip = last !== null && last.path === change.path && last.day.equals(change.day) && last.after?.kind === "missed" && change.after?.kind === "missed";
	const next = finishesSkip ? { ...change, before: last.before } : change;
	return sameMark(next.before, next.after) ? last : next;
}

/** What an undo line says: the habit, and what happened to its day, with the day unless it is today. */
export function changeText(change: MarkChange, today: LocalDate): { name: string; what: string } {
	const what = happened(change.before, change.after);
	return { name: change.name, what: change.day.equals(today) ? what : `${what} · ${dayTitle(change.day, today)}` };
}

function happened(before: DayMark | undefined, after: DayMark | undefined): string {
	if (!after) return `${before ? MARK_WORDS[before.kind] : ""} cleared`.trim();
	if (!before) return after.kind === "missed" ? "Skipped" : MARK_WORDS[after.kind];
	return `${MARK_WORDS[before.kind]} → ${MARK_WORDS[after.kind]}`;
}
