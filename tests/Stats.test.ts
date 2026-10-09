import { describe, expect, it } from "vitest";
import { DayMark, FULL, TINY, missed } from "../src/domain/DayMark";
import { Habit } from "../src/domain/Habit";
import { LocalDate, WEEKDAYS, Weekday } from "../src/domain/LocalDate";
import { Schedule } from "../src/domain/Schedule";
import { computeStats } from "../src/domain/Stats";
import { d } from "./support/dates";

const habit = (created: string, days: readonly Weekday[] = WEEKDAYS) =>
	Habit.create({ name: "Зарядка", anchor: "Кружка", tiny: "2 приседания", days }, d(created));

const withMarks = (start: Habit, today: LocalDate, marks: Record<string, DayMark>) =>
	Object.entries(marks).reduce((current, [date, mark]) => current.withMark(d(date), mark, today), start);

describe("computeStats window", () => {
	const today = d("2026-10-09");

	it("counts scheduled days in the last 30 days and leaves out an unmarked today", () => {
		const stats = computeStats(
			withMarks(habit("2026-09-01"), today, { "2026-10-08": FULL, "2026-10-07": TINY, "2026-10-06": missed("проспал") }),
			today,
		);
		expect(stats.window).toEqual({
			done: 2,
			scheduled: 29,
			percent: 7,
			breakdown: { tiny: 1, full: 1, missed: 1, empty: 26 },
		});
	});

	it("counts today once it is marked", () => {
		const stats = computeStats(withMarks(habit("2026-09-01"), today, { "2026-10-08": FULL, "2026-10-07": TINY, "2026-10-09": TINY }), today);
		expect(stats.window.scheduled).toBe(30);
		expect(stats.window.done).toBe(3);
		expect(stats.window.percent).toBe(10);
	});

	it("ignores days outside the schedule in the window but counts them in the total", () => {
		const stats = computeStats(
			withMarks(habit("2026-09-01", ["sat"]), today, {
				"2026-10-03": TINY,
				"2026-09-26": missed("уехал"),
				"2026-10-05": FULL,
			}),
			today,
		);
		expect(stats.window).toEqual({ done: 1, scheduled: 4, percent: 25, breakdown: { tiny: 1, full: 0, missed: 1, empty: 2 } });
		expect(stats.total).toBe(2);
	});

	it("does not count days before the habit existed", () => {
		const stats = computeStats(habit("2026-10-05"), today);
		expect(stats.window).toEqual({ done: 0, scheduled: 4, percent: 0, breakdown: { tiny: 0, full: 0, missed: 0, empty: 4 } });
	});

	it("uses the schedule that was active on each past day", () => {
		const changed = habit("2026-09-01").replaceSchedule(new Schedule(["sat"]), d("2026-10-01"));
		expect(computeStats(changed, today).window.scheduled).toBe(22);
	});

	it("has no percent when nothing was scheduled", () => {
		expect(computeStats(habit("2026-10-09"), today).window.percent).toBeNull();
	});
});

describe("computeStats streaks", () => {
	it("finds streaks, keeps the current one alive through an unmarked today", () => {
		const today = d("2026-09-09");
		const stats = computeStats(
			withMarks(habit("2026-09-01"), today, {
				"2026-09-01": TINY,
				"2026-09-02": TINY,
				"2026-09-03": TINY,
				"2026-09-05": FULL,
				"2026-09-06": FULL,
				"2026-09-07": missed("болел"),
				"2026-09-08": TINY,
			}),
			today,
		);
		expect(stats.best).toBe(3);
		expect(stats.current).toEqual({ length: 1, start: d("2026-09-08"), end: d("2026-09-08") });
		expect(stats.streaks.map((streak) => streak.length)).toEqual([3, 2, 1]);
	});

	it("loses the current streak after an empty scheduled day before today", () => {
		const today = d("2026-09-10");
		const stats = computeStats(withMarks(habit("2026-09-01"), today, { "2026-09-08": TINY }), today);
		expect(stats.current).toBeUndefined();
		expect(stats.best).toBe(1);
	});

	it("skips days outside the schedule without breaking or extending a streak", () => {
		const today = d("2026-10-09");
		const weekend = withMarks(habit("2026-09-01", ["sat", "sun"]), today, { "2026-10-03": TINY, "2026-10-04": FULL });
		expect(computeStats(weekend, today).current?.length).toBe(2);
		const withMonday = weekend.withMark(d("2026-10-05"), FULL, today);
		expect(computeStats(withMonday, today).current?.length).toBe(2);
		expect(computeStats(withMonday, today).total).toBe(3);
	});

	it("shows the five longest streaks plus the current one", () => {
		const today = d("2026-09-26");
		let current = habit("2026-09-01");
		let date = d("2026-09-01");
		for (const length of [2, 3, 4, 5, 6]) {
			for (let day = 0; day < length; day++) {
				current = current.withMark(date, TINY, today);
				date = date.addDays(1);
			}
			current = current.withMark(date, missed("x"), today);
			date = date.addDays(1);
		}
		current = current.withMark(date, TINY, today);
		const stats = computeStats(current, today);
		expect(stats.streaks.map((streak) => streak.length)).toEqual([6, 5, 4, 3, 2, 1]);
		expect(stats.streaks[5]).toBe(stats.current);
	});
});
