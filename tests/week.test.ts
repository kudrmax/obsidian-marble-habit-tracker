import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { dayStrip } from "../src/ui/today";
import { daysTitle, daysUpTo, mondayOf, weekCell, weekCells } from "../src/ui/week";
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

	it("answers the habit's days with their mark, if any", () => {
		expect(cell("2026-10-09")).toMatchObject({ kind: "due", mark: undefined });
		expect(cell("2026-10-12")).toMatchObject({ kind: "due", mark: { kind: "tiny" } });
		expect(cell("2026-10-14")).toMatchObject({ kind: "due", mark: { kind: "missed", reason: "Forgot" } });
	});

	it("answers a day that isn't one of the habit's days once it is marked, as Today does", () => {
		expect(cell("2026-10-13")).toMatchObject({ kind: "due", mark: { kind: "full" } });
	});

	it("leaves a day that isn't one of the habit's days, and a day before it began, empty", () => {
		expect(cell("2026-10-15")).toEqual({ date: d("2026-10-15"), kind: "off" });
		expect(cell("2026-10-05")).toEqual({ date: d("2026-10-05"), kind: "off" });
	});

	it("leaves the days to come empty", () => {
		expect(cell("2026-10-16")).toEqual({ date: d("2026-10-16"), kind: "future" });
	});
});

describe("weekCells", () => {
	it("gives a habit's five days up to the shown day, oldest first, each one to answer", () => {
		const read = ok("Read", { done_tiny: ["2026-10-13"] });
		const cells = weekCells(read.kind === "ok" ? read.habit : habitNote("Read"), thursday, thursday, 5);
		expect(dates(cells)).toEqual(["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]);
		expect(cells.every((cell) => cell.kind === "due")).toBe(true);
		expect(cells[2]).toMatchObject({ mark: { kind: "tiny" } });
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

describe("daysTitle", () => {
	it("dates the five days up to a day, with the year when it is another year", () => {
		expect(daysTitle(d("2026-10-08"), thursday, 5)).toBe("Oct 4 – 8");
		expect(daysTitle(d("2026-10-03"), thursday, 5)).toBe("Sep 29 – Oct 3");
		expect(daysTitle(d("2026-01-02"), d("2027-01-10"), 5)).toBe("Dec 29 – Jan 2 2026");
	});
});
