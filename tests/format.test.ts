import { describe, expect, it } from "vitest";
import { Schedule } from "../src/domain/Schedule";
import { RecipeLabels, dayMonth, longDate, recipeDays } from "../src/ui/format";
import { d } from "./support/dates";
import { habitNote } from "./support/habits";

describe("format", () => {
	it("finishes the recipe sentence after \"every\"", () => {
		expect(recipeDays(Schedule.everyDay())).toBe("day");
		expect(recipeDays(new Schedule(["fri", "mon", "wed"]))).toBe("Mon, Wed, Fri");
	});

	it("formats dates", () => {
		expect(dayMonth(d("2026-10-09"))).toBe("Oct 9");
		expect(longDate(d("2026-10-09"))).toBe("Fri, Oct 9");
	});

	const labels = new RecipeLabels();
	const anchorLine = (habit: ReturnType<typeof habitNote>) => labels.anchorLine(habit);
	const describeChange = (change: Parameters<RecipeLabels["describeChange"]>[0]) => labels.describeChange(change);

	it("shows the anchor as the start of the recipe", () => {
		expect(anchorLine(habitNote("Workout"))).toBe("after I put my mug in the sink");
	});

	it("names the parts with the labels from settings", () => {
		const custom = new RecipeLabels({ anchor: "после того как", tiny: "я", full: "в хороший день", celebration: "и порадуюсь", schedule: "каждый" });
		expect(custom.anchorLine(habitNote("Workout"))).toBe("после того как put my mug in the sink");
		expect(custom.title("tiny")).toBe("Я");
	});

	it("describes a recipe change by its new value", () => {
		expect(describeChange({ part: "tiny", date: d("2026-10-01"), from: "read a page", to: "open the book" })).toBe("I will → open the book");
		expect(describeChange({ part: "full", date: d("2026-10-01"), to: "15 min workout" })).toBe("on a good day → 15 min workout");
		expect(describeChange({ part: "schedule", date: d("2026-10-01"), from: Schedule.everyDay(), to: new Schedule(["sat"]) })).toBe(
			"every → Sat",
		);
	});
});
