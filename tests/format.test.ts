import { describe, expect, it } from "vitest";
import { Schedule } from "../src/domain/Schedule";
import { celebrationText, dayMonth, describeChange, longDate, recipeLine, scheduleLabel } from "../src/ui/format";
import { d } from "./support/dates";
import { habitNote } from "./support/habits";

describe("format", () => {
	it("labels schedules", () => {
		expect(scheduleLabel(Schedule.everyDay())).toBe("каждый день");
		expect(scheduleLabel(new Schedule(["fri", "mon", "wed"]))).toBe("пн, ср, пт");
	});

	it("formats dates in Russian", () => {
		expect(dayMonth(d("2026-10-09"))).toBe("9 окт");
		expect(longDate(d("2026-10-09"))).toBe("пт, 9 октября");
		expect(longDate(d("2026-05-01"))).toBe("пт, 1 мая");
	});

	it("shows the recipe line", () => {
		expect(recipeLine(habitNote("Зарядка"))).toBe("нано: 2 приседания");
		expect(recipeLine(habitNote("Зарядка", { full: [{ value: "15 минут", since: "2026-10-01" }] }))).toBe(
			"нано: 2 приседания · полное: 15 минут",
		);
	});

	it("builds the celebration text", () => {
		expect(celebrationText(habitNote("Зарядка", { celebration: [{ value: "Есть!", since: "2026-10-01" }] }), "full")).toEqual({
			title: "Есть!",
			subtitle: "Зарядка · полное",
		});
		expect(celebrationText(habitNote("Зарядка"), "tiny")).toEqual({ title: "Зарядка", subtitle: "нано" });
	});

	it("describes recipe changes", () => {
		expect(describeChange({ part: "anchor", date: d("2026-10-01"), from: "Кофе", to: "Кружка" })).toBe("якорь: Кофе → Кружка");
		expect(describeChange({ part: "full", date: d("2026-10-01"), to: "15 минут" })).toBe("полное: 15 минут");
		expect(describeChange({ part: "schedule", date: d("2026-10-01"), from: Schedule.everyDay(), to: new Schedule(["sat"]) })).toBe(
			"расписание: каждый день → сб",
		);
	});
});
