import { Habit } from "./Habit";

export function missesInARow(habit: Habit): number {
	let count = 0;
	for (const [, mark] of habit.marks()) {
		if (mark.kind !== "missed") break;
		count++;
	}
	return count;
}

export function needsRedesign(habit: Habit, threshold: number): boolean {
	return missesInARow(habit) >= threshold;
}
