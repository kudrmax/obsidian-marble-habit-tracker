import { describe, expect, it } from "vitest";
import { Schedule } from "../src/domain/Schedule";
import { anchorLine, dayMonth, describeChange, longDate, scheduleLabel } from "../src/ui/format";
import { d } from "./support/dates";
import { habitNote } from "./support/habits";

describe("format", () => {
	it("labels schedules", () => {
		expect(scheduleLabel(Schedule.everyDay())).toBe("Every day");
		expect(scheduleLabel(new Schedule(["fri", "mon", "wed"]))).toBe("Mon, Wed, Fri");
	});

	it("formats dates", () => {
		expect(dayMonth(d("2026-10-09"))).toBe("Oct 9");
		expect(longDate(d("2026-10-09"))).toBe("Fri, Oct 9");
	});

	it("shows the anchor as the start of the recipe", () => {
		expect(anchorLine(habitNote("Workout"))).toBe("after I put my mug in the sink");
	});

	it("describes a recipe change by its new value", () => {
		expect(describeChange({ part: "tiny", date: d("2026-10-01"), from: "read a page", to: "open the book" })).toBe("Tiny → open the book");
		expect(describeChange({ part: "full", date: d("2026-10-01"), to: "15 min workout" })).toBe("More → 15 min workout");
		expect(describeChange({ part: "schedule", date: d("2026-10-01"), from: Schedule.everyDay(), to: new Schedule(["sat"]) })).toBe(
			"Days → Sat",
		);
	});
});
