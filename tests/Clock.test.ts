import { describe, expect, it } from "vitest";
import { DayStartClock } from "../src/domain/Clock";

const at = (hour: number, minute = 0) => () => new Date(2026, 9, 11, hour, minute);

describe("DayStartClock", () => {
	it("counts the hours after midnight but before the day starts as the day before", () => {
		expect(String(new DayStartClock(() => 5, at(0, 30)).today())).toBe("2026-10-10");
		expect(String(new DayStartClock(() => 5, at(4, 59)).today())).toBe("2026-10-10");
	});

	it("starts the new day at the start hour", () => {
		expect(String(new DayStartClock(() => 5, at(5)).today())).toBe("2026-10-11");
		expect(String(new DayStartClock(() => 5, at(23, 59)).today())).toBe("2026-10-11");
	});

	it("starts the day at midnight when the start hour is 0", () => {
		expect(String(new DayStartClock(() => 0, at(0)).today())).toBe("2026-10-11");
	});

	it("follows a changed start hour at once", () => {
		let hour = 5;
		const clock = new DayStartClock(() => hour, at(3));
		expect(String(clock.today())).toBe("2026-10-10");
		hour = 2;
		expect(String(clock.today())).toBe("2026-10-11");
	});
});
