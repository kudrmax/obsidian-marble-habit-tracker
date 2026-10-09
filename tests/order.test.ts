import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { visibleEntries } from "../src/ui/order";
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
