import { describe, expect, it } from "vitest";
import { Schedule } from "../src/domain/Schedule";
import { anchorLine, celebrationText, dayMonth, describeChange, longDate, scheduleLabel } from "../src/ui/format";
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
		expect(anchorLine(habitNote("Workout"))).toBe("After I put my mug in the sink");
	});

	it("builds the celebration text", () => {
		expect(celebrationText(habitNote("Workout", { celebration: [{ value: "Yes!", since: "2026-10-01" }] }), "full")).toEqual({
			title: "Yes!",
			subtitle: "Workout · Full",
		});
		expect(celebrationText(habitNote("Workout"), "tiny")).toEqual({ title: "Workout", subtitle: "Tiny" });
	});

	it("describes recipe changes", () => {
		expect(describeChange({ part: "anchor", date: d("2026-10-01"), from: "pour coffee", to: "put my mug in the sink" })).toBe(
			"Anchor: pour coffee → put my mug in the sink",
		);
		expect(describeChange({ part: "full", date: d("2026-10-01"), to: "15 min workout" })).toBe("Full habit: 15 min workout");
		expect(describeChange({ part: "schedule", date: d("2026-10-01"), from: Schedule.everyDay(), to: new Schedule(["sat"]) })).toBe(
			"Schedule: Every day → Sat",
		);
	});
});
