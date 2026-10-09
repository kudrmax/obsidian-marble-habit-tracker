import { HabitEntry } from "../application/ports";

const orderOf = (entry: HabitEntry) => (entry.kind === "ok" ? entry.habit.order : undefined);
const nameOf = (entry: HabitEntry) => (entry.kind === "ok" ? entry.habit.name : entry.name);

export function visibleEntries(entries: readonly HabitEntry[]): HabitEntry[] {
	return entries
		.filter((entry) => entry.kind === "broken" || !entry.habit.archived)
		.sort((a, b) => {
			const left = orderOf(a);
			const right = orderOf(b);
			if (left !== right) {
				if (left === undefined) return 1;
				if (right === undefined) return -1;
				return left - right;
			}
			return nameOf(a).localeCompare(nameOf(b));
		});
}
