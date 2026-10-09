import { describe, expect, it } from "vitest";
import { DomainError } from "../src/domain/DomainError";
import { Schedule } from "../src/domain/Schedule";
import { d } from "./support/dates";

describe("Schedule", () => {
	it("includes every day when every weekday is set", () => {
		const schedule = Schedule.everyDay();
		expect(schedule.isEveryDay).toBe(true);
		expect(schedule.includes(d("2026-10-05"))).toBe(true);
		expect(schedule.includes(d("2026-10-11"))).toBe(true);
	});

	it("includes only the chosen weekdays", () => {
		const weekend = new Schedule(["sun", "sat"]);
		expect(weekend.isEveryDay).toBe(false);
		expect(weekend.includes(d("2026-10-10"))).toBe(true);
		expect(weekend.includes(d("2026-10-09"))).toBe(false);
	});

	it("lists weekdays from Monday to Sunday", () => {
		expect(new Schedule(["sun", "mon", "wed"]).weekdays).toEqual(["mon", "wed", "sun"]);
	});

	it("needs at least one day", () => {
		expect(() => new Schedule([])).toThrow(DomainError);
	});

	it("compares by weekdays", () => {
		expect(new Schedule(["sat", "sun"]).equals(new Schedule(["sun", "sat"]))).toBe(true);
		expect(new Schedule(["sat"]).equals(Schedule.everyDay())).toBe(false);
	});
});
