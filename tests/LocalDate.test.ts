import { describe, expect, it } from "vitest";
import { LocalDate } from "../src/domain/LocalDate";
import { d } from "./support/dates";

describe("LocalDate", () => {
	it("parses and formats ISO dates", () => {
		expect(LocalDate.parse("2026-10-09")?.toString()).toBe("2026-10-09");
		expect(LocalDate.of(2026, 1, 5).toString()).toBe("2026-01-05");
	});

	it("rejects malformed and impossible dates", () => {
		for (const text of ["2026-1-09", "2026-02-30", "09.10.2026", "", "2026-10-09T00:00"]) {
			expect(LocalDate.parse(text)).toBeNull();
		}
	});

	it("adds days across month, year and daylight saving boundaries", () => {
		expect(d("2026-01-31").addDays(1).toString()).toBe("2026-02-01");
		expect(d("2026-12-31").addDays(1).toString()).toBe("2027-01-01");
		expect(d("2026-03-28").addDays(2).toString()).toBe("2026-03-30");
		expect(d("2026-10-24").addDays(2).toString()).toBe("2026-10-26");
		expect(d("2026-03-01").addDays(-1).toString()).toBe("2026-02-28");
	});

	it("knows the weekday", () => {
		expect(d("2026-10-05").weekday()).toBe("mon");
		expect(d("2026-10-09").weekday()).toBe("fri");
		expect(d("2026-10-11").weekday()).toBe("sun");
	});

	it("compares dates", () => {
		expect(d("2026-10-09").isAfter(d("2026-10-08"))).toBe(true);
		expect(d("2026-10-08").isBefore(d("2026-10-09"))).toBe(true);
		expect(d("2026-10-09").equals(d("2026-10-09"))).toBe(true);
		expect(d("2026-10-09").daysSince(d("2026-10-01"))).toBe(8);
		expect(d("2026-10-01").compare(d("2026-10-09"))).toBeLessThan(0);
	});

	it("takes the local calendar day of a Date", () => {
		expect(LocalDate.fromDate(new Date(2026, 9, 9, 23, 59)).toString()).toBe("2026-10-09");
		expect(LocalDate.fromDate(new Date(2026, 9, 9, 0, 1)).toString()).toBe("2026-10-09");
	});
});
