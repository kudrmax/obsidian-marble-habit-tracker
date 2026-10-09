import { describe, expect, it } from "vitest";
import { TINY, missed } from "../src/domain/DayMark";
import { Habit } from "../src/domain/Habit";
import { WEEKDAYS } from "../src/domain/LocalDate";
import { missesInARow, needsRedesign } from "../src/domain/RedesignRule";
import { d } from "./support/dates";

const today = d("2026-10-09");
const base = Habit.create({ name: "Зарядка", anchor: "Кружка", tiny: "2", days: WEEKDAYS }, d("2026-09-01"));

describe("RedesignRule", () => {
	const struggling = base
		.withMark(d("2026-10-01"), TINY, today)
		.withMark(d("2026-10-03"), missed("проспал"), today)
		.withMark(d("2026-10-05"), missed("уехал"), today)
		.withMark(d("2026-10-06"), missed("проспал"), today);

	it("counts misses after the last done day and ignores empty days", () => {
		expect(missesInARow(struggling)).toBe(3);
		expect(needsRedesign(struggling, 3)).toBe(true);
		expect(needsRedesign(struggling, 4)).toBe(false);
	});

	it("resets after a done day", () => {
		expect(missesInARow(struggling.withMark(d("2026-10-07"), TINY, today))).toBe(0);
	});

	it("counts from the start when nothing was done yet", () => {
		const neverDone = base.withMark(d("2026-10-01"), missed("a"), today).withMark(d("2026-10-02"), missed("b"), today);
		expect(missesInARow(neverDone)).toBe(2);
	});
});
