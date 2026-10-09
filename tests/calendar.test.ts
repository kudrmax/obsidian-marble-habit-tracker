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

	it("starts a year back, or earlier if the habit is older", () => {
		expect(calendarStart(habitNote("Зарядка"), d("2026-10-09")).toString()).toBe("2025-10-10");
		const old = habitNote("Зарядка", {
			schedule: [{ value: ["mon"], since: "2024-01-01" }],
			anchor: [{ value: "Кружка", since: "2024-01-01" }],
			tiny: [{ value: "2", since: "2024-01-01" }],
		});
		expect(calendarStart(old, d("2026-10-09")).toString()).toBe("2024-01-01");
	});
});
