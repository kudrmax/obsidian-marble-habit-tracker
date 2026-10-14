import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { TINY, missed } from "../src/domain/DayMark";
import { dayTitle, totalWins, winsLabel, offersShrink, todayEntries } from "../src/ui/today";
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

describe("dayTitle", () => {
	it("names today and yesterday, and dates earlier days", () => {
		const today = d("2026-10-15");
		expect(dayTitle(today, today)).toBe("Today");
		expect(dayTitle(d("2026-10-14"), today)).toBe("Yesterday");
		expect(dayTitle(d("2026-10-12"), today)).toBe("Mon, Oct 12");
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
