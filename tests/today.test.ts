import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { TINY, missed } from "../src/domain/DayMark";
import { closedDayLine, dayStrip, dayTitle, totalWins, winsLabel, winsSince, offersShrink, todayEntries } from "../src/ui/today";
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

describe("winsSince", () => {
	it("names the month of the first win, with its year when that was another year", () => {
		const read = ok("Read", { done_tiny: ["2026-05-14", "2026-10-08"], missed: [{ date: "2026-04-01", reason: "Forgot" }] });
		const floss = ok("Floss", { done_full: ["2026-06-02"] });
		expect(winsSince([read, floss], today)).toBe("wins since May");
		expect(winsSince([ok("Old", { done_tiny: ["2025-12-30"] })], today)).toBe("wins since December 2025");
		expect(winsSince([ok("New")], today)).toBe("wins");
	});
});

describe("closedDayLine", () => {
	it("praises a full day and owns up to skips", () => {
		expect(closedDayLine(0)).toBe("Every habit, done");
		expect(closedDayLine(1)).toBe("1 skipped honestly · see you tomorrow");
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

describe("dayStrip", () => {
	const thursday = d("2026-10-15");

	it("runs from two weeks back to the end of this week, oldest first", () => {
		const days = dayStrip([ok("Read")], thursday);
		expect(days[0].date.toString()).toBe("2026-10-02");
		expect(days[days.length - 1].date.toString()).toBe("2026-10-18");
		expect(days.filter((day) => day.future).map((day) => day.date.day)).toEqual([16, 17, 18]);
	});

	it("reaches back to the first mark when that is earlier", () => {
		const days = dayStrip([ok("Read", { done_tiny: ["2026-09-20"] })], thursday);
		expect(days[0].date.toString()).toBe("2026-09-20");
	});

	it("counts the habits due each day and the ones done, skips not counted as done", () => {
		const read = ok("Read", { done_full: ["2026-10-14"], done_tiny: ["2026-10-15"] });
		const floss = ok("Floss", { missed: [{ date: "2026-10-15", reason: "Forgot" }] });
		const weekend = ok("Hike", { schedule: [{ value: ["sat", "sun"], since: "2026-10-01" }] });
		const days = dayStrip([read, floss, weekend], thursday);
		const on = (text: string) => days.find((day) => day.date.toString() === text);
		expect(on("2026-10-15")).toMatchObject({ due: 2, done: 1, future: false });
		expect(on("2026-10-14")).toMatchObject({ due: 2, done: 1 });
		expect(on("2026-10-18")).toMatchObject({ due: 3, done: 0, future: true });
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
