import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { dayStrip } from "../src/ui/today";
import { bandWeeks, daysTitle, daysUpTo, mondayOf, weekCell, weekGroups } from "../src/ui/week";
import { d } from "./support/dates";
import { habitNote } from "./support/habits";

const thursday = d("2026-10-15");
const ok = (name: string, extra = {}): HabitEntry => ({ kind: "ok", path: `Habits/${name}.md`, habit: habitNote(name, extra) });
const dates = (days: readonly { date: { toString(): string } }[]) => days.map((day) => day.date.toString());

describe("mondayOf", () => {
	it("goes back to the Monday of the day's week, a Monday staying where it is", () => {
		expect(mondayOf(thursday).toString()).toBe("2026-10-12");
		expect(mondayOf(d("2026-10-12")).toString()).toBe("2026-10-12");
		expect(mondayOf(d("2026-10-18")).toString()).toBe("2026-10-12");
	});
});

describe("weekCell", () => {
	const weekdays = ok("Gym", {
		schedule: [{ value: ["mon", "wed", "fri"], since: "2026-10-07" }],
		done_tiny: ["2026-10-12"],
		missed: [{ date: "2026-10-14", reason: "Forgot" }],
		done_full: ["2026-10-13"],
	});
	const habit = weekdays.kind === "ok" ? weekdays.habit : null;
	const cell = (text: string) => weekCell(habit!, d(text), thursday);

	it("answers every day up to today with its mark, if any", () => {
		expect(cell("2026-10-12")).toMatchObject({ kind: "due", mark: { kind: "tiny" } });
		expect(cell("2026-10-13")).toMatchObject({ kind: "due", mark: { kind: "full" } });
		expect(cell("2026-10-14")).toMatchObject({ kind: "due", mark: { kind: "missed", reason: "Forgot" } });
		expect(cell("2026-10-15")).toMatchObject({ kind: "due", mark: undefined });
	});

	it("answers a day that isn't one of the habit's days, and a day before it began, like any other", () => {
		expect(cell("2026-10-15").kind).toBe("due");
		expect(cell("2026-09-30").kind).toBe("due");
	});

	it("leaves the days to come empty", () => {
		expect(cell("2026-10-16")).toEqual({ date: d("2026-10-16"), kind: "future" });
	});
});

describe("weekGroups", () => {
	it("lays every habit out by section, with the five days up to the shown day, oldest first", () => {
		const read = ok("Read", { order: 0, section: "Morning" });
		const floss = ok("Floss", { order: 1 });
		const walk = ok("Walk", { order: 2, section: "Morning" });
		const groups = weekGroups([read, floss, walk], thursday, thursday, 5);
		expect(groups.map((group) => [group.section, group.rows.map((row) => row.habit.name)])).toEqual([
			[undefined, ["Floss"]],
			["Morning", ["Read", "Walk"]],
		]);
		expect(dates(groups[0].rows[0].cells)).toEqual(["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]);
		expect(groups[0].rows[0].cells.every((cell) => cell.kind === "due")).toBe(true);
		expect(groups[0].rows[0].path).toBe("Habits/Floss.md");
	});

	it("drops sections left empty, archived habits and notes that can't be read", () => {
		const groups = weekGroups(
			[ok("Old", { archived: true, section: "Evening" }), ok("Read"), { kind: "broken", path: "Habits/X.md", name: "X", problem: "bad" }],
			thursday,
			thursday,
			5,
		);
		expect(groups.map((group) => [group.section, group.rows.map((row) => row.habit.name)])).toEqual([[undefined, ["Read"]]]);
	});
});

describe("daysUpTo", () => {
	it("gives the calendar's five days up to a day, the ones before the calendar starts outside", () => {
		const strip = dayStrip([ok("Read", { done_tiny: ["2026-10-14"] })], thursday);
		const days = daysUpTo(strip, d("2026-10-03"), thursday, 5);
		expect(dates(days)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"]);
		expect(days.map((day) => day.outside)).toEqual([true, true, true, false, false]);
		expect(daysUpTo(strip, thursday, thursday, 5).find((day) => day.date.equals(d("2026-10-14")))).toMatchObject({ due: 1, done: 1, outside: false });
	});
});

describe("bandWeeks", () => {
	it("lays the month out from the week before its first, this month up to this week", () => {
		const weeks = bandWeeks(dayStrip([ok("Read")], thursday), { year: 2026, month: 10 }, thursday);
		expect(weeks).toHaveLength(4);
		expect(weeks.every((week) => week.length === 7)).toBe(true);
		expect(weeks[0][0].date.toString()).toBe("2026-09-21");
		expect(weeks[1][0].date.toString()).toBe("2026-09-28");
		expect(weeks[3][6].date.toString()).toBe("2026-10-18");
	});

	it("keeps every day's counts, whichever month it is in, the other months' days outside", () => {
		const read = ok("Read", { done_tiny: ["2026-09-27", "2026-10-14"] });
		const weeks = bandWeeks(dayStrip([read], thursday), { year: 2026, month: 10 }, thursday);
		const on = (text: string) => weeks.flat().find((day) => day.date.toString() === text);
		expect(on("2026-09-27")).toMatchObject({ outside: true, done: 1 });
		expect(on("2026-10-14")).toMatchObject({ outside: false, due: 1, done: 1 });
		expect(on("2026-10-17")).toMatchObject({ outside: false, future: true });
	});
});

describe("daysTitle", () => {
	it("dates the five days up to a day, with the year when it is another year", () => {
		expect(daysTitle(d("2026-10-08"), thursday, 5)).toBe("Oct 4 – 8");
		expect(daysTitle(d("2026-10-03"), thursday, 5)).toBe("Sep 29 – Oct 3");
		expect(daysTitle(d("2026-01-02"), d("2027-01-10"), 5)).toBe("Dec 29 – Jan 2 2026");
	});
});
