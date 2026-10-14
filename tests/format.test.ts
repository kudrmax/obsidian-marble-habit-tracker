import { describe, expect, it } from "vitest";
import { Schedule } from "../src/domain/Schedule";
import { RecipeLabels, dayMonth, longDate, recipeDays } from "../src/ui/format";
import { d } from "./support/dates";

describe("format", () => {
	it("names the days of a schedule", () => {
		expect(recipeDays(Schedule.everyDay())).toBe("Every day");
		expect(recipeDays(new Schedule(["fri", "mon", "wed"]))).toBe("Mon, Wed, Fri");
	});

	it("formats dates", () => {
		expect(dayMonth(d("2026-10-09"))).toBe("Oct 9");
		expect(longDate(d("2026-10-09"))).toBe("Fri, Oct 9");
	});

	const labels = new RecipeLabels();
	const describeChange = (change: Parameters<RecipeLabels["describeChange"]>[0]) => labels.describeChange(change);

	it("names the parts with the labels from settings", () => {
		const custom = new RecipeLabels({ anchor: "триггер", tiny: "минимум", full: "действие", celebration: "праздник", schedule: "дни" });
		expect(custom.title("tiny")).toBe("Минимум");
		expect(custom.of("anchor")).toBe("триггер");
	});

	it("describes a removed part", () => {
		expect(describeChange({ part: "tiny", date: d("2026-10-01"), from: "read a page", to: "" })).toBe("tiny action → removed");
	});

	it("describes a recipe change by its new value", () => {
		expect(describeChange({ part: "tiny", date: d("2026-10-01"), from: "read a page", to: "open the book" })).toBe("tiny action → open the book");
		expect(describeChange({ part: "full", date: d("2026-10-01"), to: "15 min workout" })).toBe("action → 15 min workout");
		expect(describeChange({ part: "schedule", date: d("2026-10-01"), from: Schedule.everyDay(), to: new Schedule(["sat"]) })).toBe(
			"days → Sat",
		);
	});
});
