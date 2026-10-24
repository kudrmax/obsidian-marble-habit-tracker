import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { dayStrip } from "../src/ui/today";
import { daysTitle, daysUpTo, mondayOf, weekCell, weekGroups } from "../src/ui/week";
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
	it("lays every habit out by section, with the seven days up to the shown day, oldest first", () => {
		const read = ok("Read", { order: 0, section: "Morning" });
		const floss = ok("Floss", { order: 1 });
		const walk = ok("Walk", { order: 2, section: "Morning" });
		const groups = weekGroups([read, floss, walk], thursday, thursday);
		expect(groups.map((group) => [group.section, group.rows.map((row) => row.habit.name)])).toEqual([
			[undefined, ["Floss"]],
			["Morning", ["Read", "Walk"]],
		]);
		expect(dates(groups[0].rows[0].cells)).toEqual(["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]);
		expect(groups[0].rows[0].cells.every((cell) => cell.kind === "due")).toBe(true);
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

describe("daysUpTo", () => {
	it("gives the calendar's seven days up to a day, the ones before the calendar starts outside", () => {
		const strip = dayStrip([ok("Read", { done_tiny: ["2026-10-14"] })], thursday);
		const days = daysUpTo(strip, d("2026-10-03"), thursday);
		expect(dates(days)).toEqual(["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"]);
		expect(days.map((day) => day.outside)).toEqual([true, true, true, true, true, false, false]);
		expect(daysUpTo(strip, thursday, thursday).find((day) => day.date.equals(d("2026-10-14")))).toMatchObject({ due: 1, done: 1, outside: false });
	});
});

describe("daysTitle", () => {
	it("dates the seven days up to a day, with the year when it is another year", () => {
		expect(daysTitle(d("2026-10-08"), thursday)).toBe("Oct 2 – 8");
		expect(daysTitle(d("2026-10-03"), thursday)).toBe("Sep 27 – Oct 3");
		expect(daysTitle(d("2026-01-02"), d("2027-01-10"))).toBe("Dec 27 – Jan 2 2026");
	});
});
