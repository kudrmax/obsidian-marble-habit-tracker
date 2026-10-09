import { isDone } from "./DayMark";
import { Habit } from "./Habit";
import { LocalDate } from "./LocalDate";

export const WINDOW_DAYS = 30;
const SHOWN_STREAKS = 5;

export interface Breakdown {
	tiny: number;
	full: number;
	missed: number;
	empty: number;
}

export interface WindowStats {
	readonly done: number;
	readonly scheduled: number;
	readonly percent: number | null;
	readonly breakdown: Breakdown;
}

export interface Streak {
	readonly length: number;
	readonly start: LocalDate;
	readonly end: LocalDate;
}

export interface HabitStats {
	readonly window: WindowStats;
	readonly current?: Streak;
	readonly best: number;
	readonly streaks: readonly Streak[];
	readonly total: number;
}

export function computeStats(habit: Habit, today: LocalDate): HabitStats {
	const { all, current } = collectStreaks(habit, today);
	const byLength = [...all].sort((a, b) => b.length - a.length || b.end.compare(a.end));
	const streaks = byLength.slice(0, SHOWN_STREAKS);
	if (current && !streaks.includes(current)) streaks.push(current);
	return {
		window: windowStats(habit, today),
		current,
		best: byLength[0]?.length ?? 0,
		streaks,
		total: habit.marks().filter(([, mark]) => isDone(mark)).length,
	};
}

function windowStats(habit: Habit, today: LocalDate): WindowStats {
	const breakdown: Breakdown = { tiny: 0, full: 0, missed: 0, empty: 0 };
	for (let offset = WINDOW_DAYS - 1; offset >= 0; offset--) {
		const date = today.addDays(-offset);
		if (!habit.isScheduled(date)) continue;
		const mark = habit.markOn(date);
		if (mark) breakdown[mark.kind]++;
		else if (!date.equals(today)) breakdown.empty++;
	}
	const done = breakdown.tiny + breakdown.full;
	const scheduled = done + breakdown.missed + breakdown.empty;
	return { done, scheduled, percent: scheduled ? Math.round((done * 100) / scheduled) : null, breakdown };
}

function collectStreaks(habit: Habit, today: LocalDate): { all: Streak[]; current?: Streak } {
	const all: Streak[] = [];
	let run: Streak | undefined;
	for (let date = habit.createdOn; !date.isAfter(today); date = date.addDays(1)) {
		if (!habit.isScheduled(date)) continue;
		const mark = habit.markOn(date);
		if (isDone(mark)) {
			run = run ? { ...run, length: run.length + 1, end: date } : { length: 1, start: date, end: date };
			continue;
		}
		if (!mark && date.equals(today)) continue;
		if (run) all.push(run);
		run = undefined;
	}
	if (run) all.push(run);
	return { all, current: run };
}
