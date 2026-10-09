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

export const WEEK_RUN = 7;
export const MONTH_RUN = WEEK_RUN * 4;

interface DoneDay {
	readonly date: LocalDate;
	readonly full: boolean;
}

/** Every 7 done days of a habit merge into a medium ball and every 28 into a big one, gaps or not. */
export function buildJar(habit: Habit, today: LocalDate): JarPiece[] {
	return piecesOf(doneDays(habit, today), today);
}

function doneDays(habit: Habit, today: LocalDate): DoneDay[] {
	return habit
		.marks()
		.filter(([date, mark]) => isDone(mark) && !date.isAfter(today))
		.map(([date, mark]) => ({ date, full: mark.kind === "full" }))
		.reverse();
}

function piecesOf(days: readonly DoneDay[], today: LocalDate): JarPiece[] {
	const pieces: JarPiece[] = [];
	const block = (from: number, length: number, size: JarSize) => {
		const last = days[from + length - 1];
		pieces.push({ id: `${size}:${days[from].date}`, size, full: false, today: last.date.equals(today) });
	};
	const bigs = Math.floor(days.length / MONTH_RUN);
	for (let index = 0; index < bigs; index++) block(index * MONTH_RUN, MONTH_RUN, "big");
	const rest = days.length - bigs * MONTH_RUN;
	const mediums = Math.floor(rest / WEEK_RUN);
	for (let index = 0; index < mediums; index++) block(bigs * MONTH_RUN + index * WEEK_RUN, WEEK_RUN, "medium");
	for (const day of days.slice(bigs * MONTH_RUN + mediums * WEEK_RUN)) {
		pieces.push({ id: `small:${day.date}`, size: "small", full: day.full, today: day.date.equals(today) });
	}
	return pieces;
}
