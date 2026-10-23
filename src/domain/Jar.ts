import { DEFAULT_WIN_RULE, WinRule, isWin } from "./DayMark";
import { Habit } from "./Habit";
import { LocalDate } from "./LocalDate";

export type JarSize = "small" | "medium" | "big";

export interface JarPiece {
	readonly id: string;
	readonly size: JarSize;
	readonly full: boolean;
	readonly today: boolean;
}

/** How many marbles merge into the next size up. */
export interface MergeRule {
	readonly smallPerMedium: number;
	readonly mediumPerBig: number;
}

export const DEFAULT_MERGE_RULE: MergeRule = { smallPerMedium: 7, mediumPerBig: 4 };

interface DoneDay {
	readonly date: LocalDate;
	readonly full: boolean;
}

/** A habit's wins become small marbles that merge by the rule into medium and big ones, gaps or not. */
export function buildJar(habit: Habit, today: LocalDate, rule: MergeRule = DEFAULT_MERGE_RULE, wins: WinRule = DEFAULT_WIN_RULE): JarPiece[] {
	return piecesOf(winDays(habit, today, wins), today, rule);
}

function winDays(habit: Habit, today: LocalDate, wins: WinRule): DoneDay[] {
	return habit
		.marks()
		.filter(([date, mark]) => isWin(mark, wins) && !date.isAfter(today))
		.map(([date, mark]) => ({ date, full: mark.kind === "full" }))
		.reverse();
}

function piecesOf(days: readonly DoneDay[], today: LocalDate, rule: MergeRule): JarPiece[] {
	const mergeSize = rule.smallPerMedium;
	const bigSize = mergeSize * rule.mediumPerBig;
	const pieces: JarPiece[] = [];
	const block = (from: number, length: number, size: JarSize) => {
		const last = days[from + length - 1];
		pieces.push({ id: `${size}:${days[from].date.toString()}`, size, full: false, today: last.date.equals(today) });
	};
	const bigs = Math.floor(days.length / bigSize);
	for (let index = 0; index < bigs; index++) block(index * bigSize, bigSize, "big");
	const rest = days.length - bigs * bigSize;
	const mediums = Math.floor(rest / mergeSize);
	for (let index = 0; index < mediums; index++) block(bigs * bigSize + index * mergeSize, mergeSize, "medium");
	for (const day of days.slice(bigs * bigSize + mediums * mergeSize)) {
		pieces.push({ id: `small:${day.date.toString()}`, size: "small", full: day.full, today: day.date.equals(today) });
	}
	return pieces;
}
