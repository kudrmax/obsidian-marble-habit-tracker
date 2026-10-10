import { isDone } from "./DayMark";
import { Habit } from "./Habit";
import { LocalDate } from "./LocalDate";

export type JarSize = "small" | "medium" | "big";

export interface JarPiece {
	readonly id: string;
	readonly size: JarSize;
	readonly full: boolean;
	readonly today: boolean;
}

export const DEFAULT_MERGE_SIZE = 7;
/** How many medium balls merge into a big one. */
export const MEDIUMS_PER_BIG = 4;

interface DoneDay {
	readonly date: LocalDate;
	readonly full: boolean;
}

/** Every `mergeSize` done days of a habit merge into a medium ball and four mediums into a big one, gaps or not. */
export function buildJar(habit: Habit, today: LocalDate, mergeSize = DEFAULT_MERGE_SIZE): JarPiece[] {
	return piecesOf(doneDays(habit, today), today, mergeSize);
}

function doneDays(habit: Habit, today: LocalDate): DoneDay[] {
	return habit
		.marks()
		.filter(([date, mark]) => isDone(mark) && !date.isAfter(today))
		.map(([date, mark]) => ({ date, full: mark.kind === "full" }))
		.reverse();
}

function piecesOf(days: readonly DoneDay[], today: LocalDate, mergeSize: number): JarPiece[] {
	const bigSize = mergeSize * MEDIUMS_PER_BIG;
	const pieces: JarPiece[] = [];
	const block = (from: number, length: number, size: JarSize) => {
		const last = days[from + length - 1];
		pieces.push({ id: `${size}:${days[from].date}`, size, full: false, today: last.date.equals(today) });
	};
	const bigs = Math.floor(days.length / bigSize);
	for (let index = 0; index < bigs; index++) block(index * bigSize, bigSize, "big");
	const rest = days.length - bigs * bigSize;
	const mediums = Math.floor(rest / mergeSize);
	for (let index = 0; index < mediums; index++) block(bigs * bigSize + index * mergeSize, mergeSize, "medium");
	for (const day of days.slice(bigs * bigSize + mediums * mergeSize)) {
		pieces.push({ id: `small:${day.date}`, size: "small", full: day.full, today: day.date.equals(today) });
	}
	return pieces;
}
