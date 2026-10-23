import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { TINY, missed } from "../src/domain/DayMark";
import { calendarMonths, closedDayLine, dayStrip, dayTitle, donePercent, monthTitle, monthWeeks, totalWins, winsLabel, winsSince, offersShrink, todayEntries } from "../src/ui/today";
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

	it("counts days done not at the trigger only when they are wins", () => {
		const read = ok("Read", { done_tiny: ["2026-10-08"], off_trigger: ["2026-10-07"] });
		expect(totalWins([read])).toBe(1);
		expect(totalWins([read], { offTrigger: true })).toBe(2);
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

	it("counts a day done not at the trigger as done only when it is a win", () => {
		const read = ok("Read", { off_trigger: ["2026-10-14"] });
		const floss = ok("Floss", { done_tiny: ["2026-10-14"] });
		const on = (days: ReturnType<typeof dayStrip>) => days.find((day) => day.date.toString() === "2026-10-14");
		expect(on(dayStrip([read, floss], thursday))).toMatchObject({ due: 2, done: 1 });
		expect(on(dayStrip([read, floss], thursday, { offTrigger: true }))).toMatchObject({ due: 2, done: 2 });
	});
});

describe("calendarMonths", () => {
	it("runs from the month of the calendar's first day to this month", () => {
		const today = d("2026-10-15");
		const short = dayStrip([ok("Read")], today);
		expect(calendarMonths(short, today)).toEqual([{ year: 2026, month: 10 }]);
		const long = dayStrip([ok("Read", { done_tiny: ["2026-08-15"] })], today);
		expect(calendarMonths(long, today)).toEqual([{ year: 2026, month: 8 }, { year: 2026, month: 9 }, { year: 2026, month: 10 }]);
		const turn = dayStrip([ok("Read", { done_tiny: ["2025-12-22"] })], d("2026-01-04"));
		expect(calendarMonths(turn, d("2026-01-04"))).toEqual([{ year: 2025, month: 12 }, { year: 2026, month: 1 }]);
	});
});

describe("monthWeeks", () => {
	const today = d("2026-10-15");

	it("lays a month out as weeks from Monday, this month only up to this week", () => {
		const weeks = monthWeeks(dayStrip([ok("Read")], today), { year: 2026, month: 10 }, today);
		expect(weeks).toHaveLength(3);
		expect(weeks.every((week) => week.length === 7)).toBe(true);
		expect(weeks[0][0].date.toString()).toBe("2026-09-28");
		expect(weeks[2][6].date.toString()).toBe("2026-10-18");
	});

	it("keeps the counts of the calendar's days in the month and leaves the rest outside", () => {
		const read = ok("Read", { done_tiny: ["2026-10-15"] });
		const weeks = monthWeeks(dayStrip([read], today), { year: 2026, month: 10 }, today);
		const on = (text: string) => weeks.flat().find((day) => day.date.toString() === text);
		expect(on("2026-09-30")).toMatchObject({ outside: true });
		expect(on("2026-10-01")).toMatchObject({ outside: true });
		expect(on("2026-10-02")).toMatchObject({ outside: false, due: 1 });
		expect(on("2026-10-15")).toMatchObject({ outside: false, due: 1, done: 1, future: false });
		expect(on("2026-10-18")).toMatchObject({ future: true });
	});

	it("shows an earlier month whole, with the neighbouring months' days outside", () => {
		const read = ok("Read", { done_tiny: ["2026-09-20"] });
		const weeks = monthWeeks(dayStrip([read], today), { year: 2026, month: 9 }, today);
		expect(weeks).toHaveLength(5);
		expect(weeks[0][0].date.toString()).toBe("2026-08-31");
		expect(weeks[4][6].date.toString()).toBe("2026-10-04");
		const on = (text: string) => weeks.flat().find((day) => day.date.toString() === text);
		expect(on("2026-09-19")).toMatchObject({ outside: true });
		expect(on("2026-09-20")).toMatchObject({ outside: false, done: 1 });
		expect(on("2026-10-01")).toMatchObject({ outside: true });
	});
});

describe("donePercent", () => {
	it("says how much of a day was done as a whole percent, and nothing for a day with nothing due", () => {
		const day = (due: number, done: number) => ({ date: d("2026-10-15"), due, done, future: false });
		expect(donePercent(day(2, 1))).toBe(50);
		expect(donePercent(day(3, 2))).toBe(67);
		expect(donePercent(day(8, 8))).toBe(100);
		expect(donePercent(day(0, 0))).toBeNull();
	});
});

describe("monthTitle", () => {
	it("names the month, with its year only when it isn't this year", () => {
		expect(monthTitle({ year: 2026, month: 10 }, d("2026-10-15"))).toBe("October");
		expect(monthTitle({ year: 2025, month: 12 }, d("2026-01-04"))).toBe("December 2025");
	});

	it("shortens the name to three letters when asked", () => {
		expect(monthTitle({ year: 2026, month: 9 }, d("2026-10-15"), "short")).toBe("Sep");
		expect(monthTitle({ year: 2025, month: 9 }, d("2026-10-15"), "short")).toBe("Sep 2025");
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
