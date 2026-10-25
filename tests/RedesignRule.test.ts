import { describe, expect, it } from "vitest";
import { DayMark, FULL, OFF_TRIGGER, TINY, missed } from "../src/domain/DayMark";
import { Habit } from "../src/domain/Habit";
import { LocalDate, WEEKDAYS } from "../src/domain/LocalDate";
import { RedesignRule, RedesignSettings } from "../src/domain/RedesignRule";
import { d } from "./support/dates";

const today = d("2026-10-09");
const base = Habit.create({ name: "Зарядка", anchor: "Кружка", tiny: "2", days: WEEKDAYS }, d("2026-09-01"));

const OFF: RedesignSettings = { skipsInARow: 3, lowShare: 0, offTrigger: false };
const rule = (settings: Partial<RedesignSettings> = {}) => new RedesignRule({ ...OFF, ...settings });

const withMarks = (start: Habit, marks: Record<string, DayMark>, on: LocalDate = today) =>
	Object.entries(marks).reduce((habit, [date, mark]) => habit.withMark(d(date), mark, on), start);

/** Every day of the two weeks up to `today` answered by `pick`, given each day's index from the oldest. */
const twoWeeks = (start: Habit, pick: (index: number) => DayMark | undefined) => {
	let habit = start;
	for (let index = 0; index < 14; index++) {
		const mark = pick(index);
		if (mark) habit = habit.withMark(today.addDays(index - 13), mark, today);
	}
	return habit;
};

describe("RedesignRule: skips in a row", () => {
	const struggling = withMarks(base, {
		"2026-10-01": TINY,
		"2026-10-03": missed("проспал"),
		"2026-10-05": missed("уехал"),
		"2026-10-06": missed("проспал"),
	});

	it("counts skips after the last done day, past days left unanswered", () => {
		expect(rule().reasonFor(struggling, today)).toEqual({ kind: "skips", count: 3 });
		expect(rule({ skipsInARow: 4 }).reasonFor(struggling, today)).toBeUndefined();
	});

	it("resets after a done day", () => {
		expect(rule().reasonFor(struggling.withMark(d("2026-10-07"), TINY, today), today)).toBeUndefined();
	});

	it("resets after a day done not at the trigger, which is no skip", () => {
		expect(rule().reasonFor(struggling.withMark(d("2026-10-07"), OFF_TRIGGER, today), today)).toBeUndefined();
	});

	it("counts from the start when nothing was done yet", () => {
		const neverDone = withMarks(base, { "2026-10-01": missed("a"), "2026-10-02": missed("b"), "2026-10-03": missed() });
		expect(rule().reasonFor(neverDone, today)).toEqual({ kind: "skips", count: 3 });
	});

	it("counts only the skips since the recipe last changed", () => {
		const changed = struggling.replaceText("anchor", "Чайник", d("2026-10-06"));
		expect(rule().reasonFor(changed, today)).toBeUndefined();
		expect(rule({ skipsInARow: 1 }).reasonFor(changed, today)).toEqual({ kind: "skips", count: 1 });
	});

	it("starts afresh when the tiny or the full version changes too", () => {
		expect(rule().reasonFor(struggling.replaceText("tiny", "1", d("2026-10-07")), today)).toBeUndefined();
		expect(rule().reasonFor(struggling.replaceText("full", "20", d("2026-10-07")), today)).toBeUndefined();
	});

	it("doesn't start afresh when only the celebration changes", () => {
		expect(rule().reasonFor(struggling.replaceText("celebration", "Да!", d("2026-10-07")), today)).toEqual({ kind: "skips", count: 3 });
	});
});

describe("RedesignRule: share of days done", () => {
	it("names the share when less than the setting was done over two weeks", () => {
		const third = twoWeeks(base, (index) => (index % 3 === 0 ? TINY : missed()));
		expect(rule({ lowShare: 50 }).reasonFor(third, today)).toEqual({ kind: "lowShare", percent: 36 });
		expect(rule({ lowShare: 30 }).reasonFor(third, today)).toBeUndefined();
	});

	it("is off at 0", () => {
		expect(rule({ lowShare: 0 }).reasonFor(twoWeeks(base, () => missed()), today)).toEqual({ kind: "skips", count: 14 });
		expect(rule({ skipsInARow: 99, lowShare: 0 }).reasonFor(twoWeeks(base, () => missed()), today)).toBeUndefined();
	});

	it("counts past days left unanswered as not done", () => {
		const sparse = twoWeeks(base, (index) => (index % 2 === 0 ? FULL : undefined));
		expect(rule({ lowShare: 60 }).reasonFor(sparse, today)).toEqual({ kind: "lowShare", percent: 54 });
	});

	it("leaves out today until it is answered", () => {
		const sparse = twoWeeks(base, (index) => (index % 2 === 0 ? FULL : undefined));
		expect(rule({ lowShare: 60 }).reasonFor(sparse, today)).toEqual({ kind: "lowShare", percent: 54 });
		expect(rule({ lowShare: 60 }).reasonFor(sparse.withMark(today, missed(), today), today)).toEqual({ kind: "lowShare", percent: 50 });
	});

	it("counts a day done not at the trigger as done", () => {
		const anywhere = twoWeeks(base, (index) => (index % 2 === 0 ? OFF_TRIGGER : TINY));
		expect(rule({ lowShare: 50 }).reasonFor(anywhere, today)).toBeUndefined();
	});

	it("waits for a week of days since the recipe changed", () => {
		const changed = twoWeeks(base, () => missed()).replaceText("anchor", "Чайник", today.addDays(-5));
		const skipsOff = { skipsInARow: 99, lowShare: 50 };
		expect(rule(skipsOff).reasonFor(changed, today)).toBeUndefined();
		const later = today.addDays(1);
		expect(rule(skipsOff).reasonFor(changed.withMark(later, missed(), later), later)).toEqual({ kind: "lowShare", percent: 0 });
	});

	it("counts only the habit's own days", () => {
		const weekdays = Habit.create({ name: "Зарядка", tiny: "2", days: ["mon", "wed", "fri"] }, d("2026-09-01"));
		const marked = twoWeeks(weekdays, (index) => (weekdays.isScheduled(today.addDays(index - 13)) ? TINY : undefined));
		expect(rule({ lowShare: 50 }).reasonFor(marked, today)).toBeUndefined();
	});
});

describe("RedesignRule: done away from the trigger", () => {
	const settings = { offTrigger: true };

	it("calls for a change when most days done were not at the trigger", () => {
		const elsewhere = withMarks(base, { "2026-10-09": OFF_TRIGGER, "2026-10-08": OFF_TRIGGER, "2026-10-06": OFF_TRIGGER, "2026-10-05": TINY, "2026-10-04": FULL });
		expect(rule(settings).reasonFor(elsewhere, today)).toEqual({ kind: "offTrigger" });
	});

	it("stays quiet while as many days were done at the trigger", () => {
		const half = withMarks(base, { "2026-10-09": OFF_TRIGGER, "2026-10-08": OFF_TRIGGER, "2026-10-06": OFF_TRIGGER, "2026-10-05": TINY, "2026-10-04": FULL, "2026-10-03": TINY });
		expect(rule(settings).reasonFor(half, today)).toBeUndefined();
	});

	it("needs three such days", () => {
		const two = withMarks(base, { "2026-10-09": OFF_TRIGGER, "2026-10-08": OFF_TRIGGER });
		expect(rule(settings).reasonFor(two, today)).toBeUndefined();
	});

	it("is off when the setting is", () => {
		const elsewhere = withMarks(base, { "2026-10-09": OFF_TRIGGER, "2026-10-08": OFF_TRIGGER, "2026-10-06": OFF_TRIGGER });
		expect(rule().reasonFor(elsewhere, today)).toBeUndefined();
	});
});

describe("RedesignRule: one reason at a time", () => {
	it("names skips in a row before a low share", () => {
		const failing = twoWeeks(base, () => missed());
		expect(rule({ lowShare: 50, offTrigger: true }).reasonFor(failing, today)).toEqual({ kind: "skips", count: 14 });
	});

	it("names a low share before the trigger", () => {
		const elsewhere = withMarks(base, { "2026-10-09": OFF_TRIGGER, "2026-10-08": OFF_TRIGGER, "2026-10-06": OFF_TRIGGER });
		expect(rule({ lowShare: 50, offTrigger: true }).reasonFor(elsewhere, today)).toEqual({ kind: "lowShare", percent: 21 });
	});
});
