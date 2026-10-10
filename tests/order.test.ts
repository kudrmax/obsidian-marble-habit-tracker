import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { moveAmongShown, visibleEntries } from "../src/ui/order";
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

describe("moveAmongShown", () => {
	const all = ["a", "b", "c", "d", "e"];

	it("moves a habit down among the shown ones", () => {
		expect(moveAmongShown(all, ["a", "b", "c", "d", "e"], "a", 2)).toEqual(["b", "c", "a", "d", "e"]);
	});

	it("moves a habit up to the top", () => {
		expect(moveAmongShown(all, all, "e", 0)).toEqual(["e", "a", "b", "c", "d"]);
	});

	it("keeps habits that aren't shown in their places", () => {
		expect(moveAmongShown(all, ["a", "c", "e"], "e", 0)).toEqual(["e", "b", "a", "d", "c"]);
	});

	it("leaves the order alone when a habit is dropped where it was", () => {
		expect(moveAmongShown(all, ["b", "d"], "d", 1)).toEqual(all);
	});
});
