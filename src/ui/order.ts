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

export interface Placement {
	readonly path: string;
	readonly section?: string;
}

export interface Group<T> {
	readonly section?: string;
	readonly items: T[];
}

/** Habits with no section come first, then each section where its first habit stands; `items` keep their order. */
export function groupBySection<T>(items: readonly T[], sectionOf: (item: T) => string | undefined): Group<T>[] {
	const top: T[] = [];
	const sections = new Map<string, T[]>();
	for (const item of items) {
		const section = sectionOf(item);
		if (section === undefined) top.push(item);
		else sections.set(section, [...(sections.get(section) ?? []), item]);
	}
	return [{ items: top }, ...[...sections].map(([section, members]) => ({ section, items: members }))];
}

/**
 * The full order after rows were dragged on Today. `before` is every habit in its listed order; `shown` is what's on
 * screen now, in screen order, each with the section it ended up in. Habits not on screen keep their sections and their
 * places among the others; a habit that joined a section goes right after the shown habits it lands among.
 */
export function arrange(before: readonly Placement[], shown: readonly Placement[]): Placement[] {
	const onScreen = new Map(shown.map((item) => [item.path, item]));
	const now = before.map((item) => onScreen.get(item.path) ?? item);
	const oldGroups = groupBySection(before, (item) => item.section);
	const shownSections = unique(shown.flatMap((item) => (item.section === undefined ? [] : [item.section])));
	const sectionOrder = fillSlots(
		oldGroups.flatMap((group) => (group.section === undefined ? [] : [group.section])).filter((section) => now.some((item) => item.section === section)),
		shownSections,
	);
	return [undefined, ...sectionOrder].flatMap((section) => {
		const stayers = before.filter((item) => item.section === section && (onScreen.get(item.path) ?? item).section === section).map((item) => item.path);
		const screen = shown.filter((item) => item.section === section).map((item) => item.path);
		return fillSlots(stayers, screen).map((path) => ({ path, section }));
	});
}

/** `slots` with the members of `next` that it holds put in `next`'s order; the rest of `next` follows the last of them. */
function fillSlots(slots: readonly string[], next: readonly string[]): string[] {
	const queue = [...next];
	const placed = new Set(next);
	const result: string[] = [];
	let after = slots.length ? -1 : 0;
	for (const item of slots) {
		if (placed.has(item)) {
			result.push(queue.shift()!);
			after = result.length;
		} else result.push(item);
	}
	if (after < 0) after = result.length;
	result.splice(after, 0, ...queue);
	return result;
}

function unique(items: readonly string[]): string[] {
	return [...new Set(items)];
}
