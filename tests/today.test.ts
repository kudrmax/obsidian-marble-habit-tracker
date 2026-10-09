import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { FULL, TINY, missed } from "../src/domain/DayMark";
import { celebrationLine, closeDayTitle, offersShrink, todayEntries } from "../src/ui/today";
import { d } from "./support/dates";
import { habitNote } from "./support/habits";

const today = d("2026-10-09");
const ok = (name: string, extra = {}): HabitEntry => ({ kind: "ok", path: `Habits/${name}.md`, habit: habitNote(name, extra) });
const names = (entries: HabitEntry[]) => entries.map((entry) => (entry.kind === "ok" ? entry.habit.name : entry.name));

describe("closeDayTitle", () => {
	it("counts what is left in words", () => {
		expect(closeDayTitle(0)).toBe("Day closed");
		expect(closeDayTitle(1)).toBe("One left to close the day");
		expect(closeDayTitle(3)).toBe("Three left to close the day");
		expect(closeDayTitle(14)).toBe("14 left to close the day");
	});
});

describe("todayEntries", () => {
	it("keeps habits planned for today, habits answered today and unreadable notes", () => {
		const weekend = { schedule: [{ value: ["sat", "sun"], since: "2026-10-01" }] };
		const entries: HabitEntry[] = [
			ok("Daily"),
			ok("Weekend", weekend),
			ok("Weekend done", { ...weekend, done_tiny: ["2026-10-09"] }),
			ok("Archived", { archived: true }),
			{ kind: "broken", path: "Habits/Broken.md", name: "Broken", problem: "no schedule" },
		];
		expect(names(todayEntries(entries, today))).toEqual(["Broken", "Daily", "Weekend done"]);
	});
});

describe("celebrationLine", () => {
	it("uses the celebration from the recipe", () => {
		const habit = habitNote("Read", { celebration: [{ value: "Yes!", since: "2026-10-01" }] });
		expect(celebrationLine(habit, TINY)).toBe("Yes!");
	});

	it("falls back to a quiet word", () => {
		expect(celebrationLine(habitNote("Read"), TINY)).toBe("Done");
		expect(celebrationLine(habitNote("Read"), FULL)).toBe("Did more");
	});
});

describe("offersShrink", () => {
	it("offers a tinier recipe when it felt too big", () => {
		expect(offersShrink(habitNote("Read"), missed("Felt too big"), 3)).toBe(true);
		expect(offersShrink(habitNote("Read"), missed("Forgot"), 3)).toBe(false);
	});

	it("offers it after too many misses in a row", () => {
		const habit = habitNote("Read", { missed: [{ date: "2026-10-08", reason: "a" }, { date: "2026-10-07", reason: "b" }, { date: "2026-10-06", reason: "c" }] });
		expect(offersShrink(habit, missed("Forgot"), 3)).toBe(true);
	});

	it("never offers it for done days", () => {
		expect(offersShrink(habitNote("Read"), TINY, 3)).toBe(false);
	});
});
