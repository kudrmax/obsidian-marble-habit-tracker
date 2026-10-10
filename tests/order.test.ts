import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { arrange, groupBySection, visibleEntries } from "../src/ui/order";
import { habitNote } from "./support/habits";

const ok = (name: string, extra = {}): HabitEntry => ({ kind: "ok", path: `Habits/${name}.md`, habit: habitNote(name, extra) });

describe("visibleEntries", () => {
	it("sorts by order, then by name, and hides archived habits", () => {
		const entries: HabitEntry[] = [
			ok("Второй", { order: 2 }),
			ok("Б"),
			ok("Первый", { order: 1 }),
			{ kind: "broken", path: "Habits/А.md", name: "А", problem: "нет свойств" },
			ok("Архив", { order: 0, archived: true }),
		];
		expect(visibleEntries(entries).map((entry) => (entry.kind === "ok" ? entry.habit.name : entry.name))).toEqual([
			"Первый",
			"Второй",
			"А",
			"Б",
		]);
	});
});

describe("groupBySection", () => {
	it("puts habits with no section first, then sections where their first habit stands", () => {
		const items = [
			{ path: "a", section: "Evening" },
			{ path: "b" },
			{ path: "c", section: "Morning" },
			{ path: "d", section: "Evening" },
		];
		expect(groupBySection(items, (item) => item.section).map((group) => [group.section, group.items.map((item) => item.path)])).toEqual([
			[undefined, ["b"]],
			["Evening", ["a", "d"]],
			["Morning", ["c"]],
		]);
	});
});

describe("arrange", () => {
	const before = [
		{ path: "free" },
		{ path: "m1", section: "Morning" },
		{ path: "m2", section: "Morning" },
		{ path: "e1", section: "Evening" },
		{ path: "e2", section: "Evening" },
	];
	const paths = (items: { path: string; section?: string }[]) => items.map((item) => `${item.section ?? "-"}:${item.path}`);

	it("keeps everything when nothing moved", () => {
		expect(arrange(before, before)).toEqual(before);
	});

	it("moves a habit into another section", () => {
		const shown = [{ path: "free" }, { path: "m1", section: "Morning" }, { path: "e2", section: "Morning" }, { path: "m2", section: "Morning" }, { path: "e1", section: "Evening" }];
		expect(paths(arrange(before, shown))).toEqual(["-:free", "Morning:m1", "Morning:e2", "Morning:m2", "Evening:e1"]);
	});

	it("moves a whole section up", () => {
		const shown = [{ path: "free" }, { path: "e1", section: "Evening" }, { path: "e2", section: "Evening" }, { path: "m1", section: "Morning" }, { path: "m2", section: "Morning" }];
		expect(paths(arrange(before, shown))).toEqual(["-:free", "Evening:e1", "Evening:e2", "Morning:m1", "Morning:m2"]);
	});

	it("starts a new section at the end", () => {
		const shown = [{ path: "free" }, { path: "m2", section: "Morning" }, { path: "e1", section: "Evening" }, { path: "e2", section: "Evening" }, { path: "m1", section: "Day" }];
		expect(paths(arrange(before, shown))).toEqual(["-:free", "Morning:m2", "Evening:e1", "Evening:e2", "Day:m1"]);
	});

	it("keeps habits that aren't shown in their sections and places", () => {
		const shown = [{ path: "m2", section: "Morning" }, { path: "m1", section: "Morning" }, { path: "e2", section: "Evening" }];
		expect(paths(arrange(before, shown))).toEqual(["-:free", "Morning:m2", "Morning:m1", "Evening:e1", "Evening:e2"]);
	});

	it("drops a section once its last habit leaves it", () => {
		const shown = [{ path: "free" }, { path: "m1", section: "Evening" }, { path: "m2", section: "Evening" }, { path: "e1", section: "Evening" }, { path: "e2", section: "Evening" }];
		expect(paths(arrange(before, shown))).toEqual(["-:free", "Evening:m1", "Evening:m2", "Evening:e1", "Evening:e2"]);
	});

	it("moves a habit out of its section to the top", () => {
		const shown = [{ path: "free" }, { path: "e1" }, { path: "m1", section: "Morning" }, { path: "m2", section: "Morning" }, { path: "e2", section: "Evening" }];
		expect(paths(arrange(before, shown))).toEqual(["-:free", "-:e1", "Morning:m1", "Morning:m2", "Evening:e2"]);
	});
});
