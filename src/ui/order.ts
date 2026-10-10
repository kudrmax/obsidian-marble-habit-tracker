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

/**
 * The full order after a shown habit is moved to position `to` among the shown ones. Habits that aren't shown keep their
 * places; the shown ones swap among the places they had.
 */
export function moveAmongShown(all: readonly string[], shown: readonly string[], moved: string, to: number): string[] {
	const rest = shown.filter((path) => path !== moved);
	const next = [...rest.slice(0, to), moved, ...rest.slice(to)];
	const slots = new Set(shown);
	let index = 0;
	return all.map((path) => (slots.has(path) ? next[index++] : path));
}
