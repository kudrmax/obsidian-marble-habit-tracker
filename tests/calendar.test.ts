import { describe, expect, it } from "vitest";
import { calendarStart, calendarWeeks } from "../src/ui/calendar";
import { d } from "./support/dates";
import { habitNote } from "./support/habits";

describe("calendar", () => {
	it("splits days into Monday-first weeks and hides future days", () => {
		const weeks = calendarWeeks(d("2026-10-01"), d("2026-10-09"));
		expect(weeks).toHaveLength(2);
		expect(weeks[0][0]?.toString()).toBe("2026-09-28");
		expect(weeks[1][4]?.toString()).toBe("2026-10-09");
		expect(weeks[1][5]).toBeUndefined();
	});

	it("starts at the beginning of the habit's history", () => {
		expect(calendarStart(habitNote("Workout"), d("2026-10-09")).toString()).toBe("2026-10-01");
		expect(calendarStart(habitNote("Workout", { done_tiny: ["2026-09-20"] }), d("2026-10-09")).toString()).toBe("2026-09-20");
	});
});
