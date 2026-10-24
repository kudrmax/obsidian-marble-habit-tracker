import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { mondayOf, sameWeek, weekCell, weekGroups, weekTitle } from "../src/ui/week";
import { d } from "./support/dates";
import { habitNote } from "./support/habits";

const thursday = d("2026-10-15");
const ok = (name: string, extra = {}): HabitEntry => ({ kind: "ok", path: `Habits/${name}.md`, habit: habitNote(name, extra) });

describe("mondayOf", () => {
	it("goes back to the Monday of the day's week, a Monday staying where it is", () => {
		expect(mondayOf(thursday).toString()).toBe("2026-10-12");
		expect(mondayOf(d("2026-10-12")).toString()).toBe("2026-10-12");
		expect(mondayOf(d("2026-10-18")).toString()).toBe("2026-10-12");
	});

	it("tells whether two days are in one week", () => {
		expect(sameWeek(d("2026-10-12"), d("2026-10-18"))).toBe(true);
		expect(sameWeek(d("2026-10-11"), d("2026-10-12"))).toBe(false);
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
	it("lays every habit out by section, Monday to Sunday of the day's week", () => {
		const read = ok("Read", { order: 0, section: "Morning" });
		const floss = ok("Floss", { order: 1 });
		const walk = ok("Walk", { order: 2, section: "Morning" });
		const groups = weekGroups([read, floss, walk], d("2026-10-14"), thursday);
		expect(groups.map((group) => [group.section, group.rows.map((row) => row.habit.name)])).toEqual([
			[undefined, ["Floss"]],
			["Morning", ["Read", "Walk"]],
		]);
		expect(groups[0].rows[0].cells.map((cell) => cell.date.toString())).toEqual([
			"2026-10-12",
			"2026-10-13",
			"2026-10-14",
			"2026-10-15",
			"2026-10-16",
			"2026-10-17",
			"2026-10-18",
		]);
		expect(groups[0].rows[0].path).toBe("Habits/Floss.md");
	});

	it("drops sections left empty, archived habits and notes that can't be read", () => {
		const groups = weekGroups(
			[ok("Old", { archived: true, section: "Evening" }), ok("Read"), { kind: "broken", path: "Habits/X.md", name: "X", problem: "bad" }],
			thursday,
			thursday,
		);
		expect(groups.map((group) => [group.section, group.rows.map((row) => row.habit.name)])).toEqual([[undefined, ["Read"]]]);
	});
});

describe("weekTitle", () => {
	it("names this week and the last one, and dates the ones before", () => {
		expect(weekTitle(thursday, thursday)).toBe("This week");
		expect(weekTitle(d("2026-10-05"), thursday)).toBe("Last week");
		expect(weekTitle(d("2026-09-30"), thursday)).toBe("Sep 28 – Oct 4");
		expect(weekTitle(d("2026-09-24"), thursday)).toBe("Sep 21 – 27");
	});

	it("adds the year of a week in another year", () => {
		expect(weekTitle(d("2025-12-30"), thursday)).toBe("Dec 29 – Jan 4 2025");
	});
});
