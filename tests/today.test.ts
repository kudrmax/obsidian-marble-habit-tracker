import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { TINY, missed } from "../src/domain/DayMark";
import { closeDayTitle, closedDayLine, totalWins, winsLabel, offersShrink, todayEntries } from "../src/ui/today";
import { d } from "./support/dates";
import { habitNote } from "./support/habits";

const today = d("2026-10-09");
const ok = (name: string, extra = {}): HabitEntry => ({ kind: "ok", path: `Habits/${name}.md`, habit: habitNote(name, extra) });
const names = (entries: HabitEntry[]) => entries.map((entry) => (entry.kind === "ok" ? entry.habit.name : entry.name));

describe("totalWins", () => {
	it("counts done days of every habit and says it in words", () => {
		const read = ok("Read", { done_tiny: ["2026-10-08", "2026-10-07"], done_full: ["2026-10-09"], missed: [{ date: "2026-10-06", reason: "Forgot" }] });
		const floss = ok("Floss", { done_tiny: ["2026-10-09"] });
		expect(totalWins([read, floss, { kind: "broken", path: "Habits/X.md", name: "X", problem: "bad" }])).toBe(4);
		expect(winsLabel(1)).toBe("1 win");
		expect(winsLabel(214)).toBe("214 wins");
	});
});

describe("closedDayLine", () => {
	it("praises a full day and owns up to skips", () => {
		expect(closedDayLine(0)).toBe("Every habit, done");
		expect(closedDayLine(1)).toBe("1 skipped honestly · see you tomorrow");
	});
});

describe("closeDayTitle", () => {
	it("counts what is left in words", () => {
		expect(closeDayTitle(0, 4)).toBe("Day closed");
		expect(closeDayTitle(1, 4)).toBe("One left to close the day");
		expect(closeDayTitle(3, 4)).toBe("Three left to close the day");
		expect(closeDayTitle(14, 20)).toBe("14 left to close the day");
	});

	it("says there is nothing to close when no habit is due today", () => {
		expect(closeDayTitle(0, 0)).toBe("Nothing for today");
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

describe("offersShrink", () => {
	it("offers a tinier recipe when it felt too big", () => {
		expect(offersShrink(habitNote("Read"), missed("Felt too big"), 3, "Felt too big")).toBe(true);
		expect(offersShrink(habitNote("Read"), missed("Felt too big"), 3, "")).toBe(false);
		expect(offersShrink(habitNote("Read"), missed("Forgot"), 3, "Felt too big")).toBe(false);
	});

	it("offers it after too many misses in a row", () => {
		const habit = habitNote("Read", { missed: [{ date: "2026-10-08", reason: "a" }, { date: "2026-10-07", reason: "b" }, { date: "2026-10-06", reason: "c" }] });
		expect(offersShrink(habit, missed("Forgot"), 3, "Felt too big")).toBe(true);
	});

	it("never offers it for done days", () => {
		expect(offersShrink(habitNote("Read"), TINY, 3, "Felt too big")).toBe(false);
	});
});
