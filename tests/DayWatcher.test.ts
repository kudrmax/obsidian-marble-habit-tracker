import { describe, expect, it } from "vitest";
import { LocalDate } from "../src/domain/LocalDate";
import { DayWatcher } from "../src/ui/DayWatcher";
import { d } from "./support/dates";

describe("DayWatcher", () => {
	it("reports only when the calendar day has changed since the last check", () => {
		let today: LocalDate = d("2026-10-09");
		let newDays = 0;
		const watcher = new DayWatcher({ today: () => today }, () => newDays++);
		watcher.check();
		expect(newDays).toBe(0);
		today = d("2026-10-10");
		watcher.check();
		watcher.check();
		expect(newDays).toBe(1);
	});
});
