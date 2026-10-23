import { DEFAULT_WIN_RULE, WinRule, isWin } from "./DayMark";
import { Habit } from "./Habit";
import { LocalDate } from "./LocalDate";

export const WINDOW_DAYS = 30;
const SHOWN_STREAKS = 5;

export interface Breakdown {
	tiny: number;
	full: number;
	offTrigger: number;
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

export function computeStats(habit: Habit, today: LocalDate, wins: WinRule = DEFAULT_WIN_RULE): HabitStats {
	const { all, current } = collectStreaks(habit, today, wins);
	const byLength = [...all].sort((a, b) => b.length - a.length || b.end.compare(a.end));
	const streaks = byLength.slice(0, SHOWN_STREAKS);
	if (current && !streaks.includes(current)) streaks.push(current);
	return {
		window: windowStats(habit, today, wins),
		current,
		best: byLength[0]?.length ?? 0,
		streaks,
		total: habit.marks().filter(([, mark]) => isWin(mark, wins)).length,
	};
}

function windowStats(habit: Habit, today: LocalDate, wins: WinRule): WindowStats {
	const breakdown: Breakdown = { tiny: 0, full: 0, offTrigger: 0, missed: 0, empty: 0 };
	for (let offset = WINDOW_DAYS - 1; offset >= 0; offset--) {
		const date = today.addDays(-offset);
		if (!habit.isScheduled(date)) continue;
		const mark = habit.markOn(date);
		if (mark) breakdown[mark.kind]++;
		else if (!date.equals(today)) breakdown.empty++;
	}
	const offTriggerWins = wins.offTrigger ? breakdown.offTrigger : 0;
	const done = breakdown.tiny + breakdown.full + offTriggerWins;
	const scheduled = breakdown.tiny + breakdown.full + breakdown.offTrigger + breakdown.missed + breakdown.empty;
	return { done, scheduled, percent: scheduled ? Math.round((done * 100) / scheduled) : null, breakdown };
}

function collectStreaks(habit: Habit, today: LocalDate, wins: WinRule): { all: Streak[]; current?: Streak } {
	const all: Streak[] = [];
	let run: Streak | undefined;
	for (let date = habit.createdOn; !date.isAfter(today); date = date.addDays(1)) {
		if (!habit.isScheduled(date)) continue;
		const mark = habit.markOn(date);
		if (isWin(mark, wins)) {
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
