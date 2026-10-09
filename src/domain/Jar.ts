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

export function buildJar(habit: Habit, today: LocalDate): JarPiece[] {
	return collectRuns(habit, today).flatMap((run) => piecesOf(run, today));
}

function collectRuns(habit: Habit, today: LocalDate): DoneDay[][] {
	const marks = habit.marks();
	if (marks.length === 0) return [];
	const firstMark = marks[marks.length - 1][0];
	const start = firstMark.isBefore(habit.createdOn) ? firstMark : habit.createdOn;
	const runs: DoneDay[][] = [];
	let run: DoneDay[] = [];
	const close = () => {
		if (run.length) runs.push(run);
		run = [];
	};
	for (let date = start; !date.isAfter(today); date = date.addDays(1)) {
		const mark = habit.markOn(date);
		if (isDone(mark)) {
			run.push({ date, full: mark?.kind === "full" });
			continue;
		}
		const unansweredToday = !mark && date.equals(today);
		if (habit.isScheduled(date) && !unansweredToday) close();
	}
	close();
	return runs;
}

function piecesOf(run: readonly DoneDay[], today: LocalDate): JarPiece[] {
	const pieces: JarPiece[] = [];
	const block = (from: number, length: number, size: JarSize) => {
		const last = run[from + length - 1];
		pieces.push({ id: `${size}:${run[from].date}`, size, full: false, today: last.date.equals(today) });
	};
	const bigs = Math.floor(run.length / MONTH_RUN);
	for (let index = 0; index < bigs; index++) block(index * MONTH_RUN, MONTH_RUN, "big");
	const rest = run.length - bigs * MONTH_RUN;
	const mediums = Math.floor(rest / WEEK_RUN);
	for (let index = 0; index < mediums; index++) block(bigs * MONTH_RUN + index * WEEK_RUN, WEEK_RUN, "medium");
	for (const day of run.slice(bigs * MONTH_RUN + mediums * WEEK_RUN)) {
		pieces.push({ id: `small:${day.date}`, size: "small", full: day.full, today: day.date.equals(today) });
	}
	return pieces;
}
