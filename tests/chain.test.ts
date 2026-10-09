import { describe, expect, it } from "vitest";
import { cellLook } from "../src/ui/chain";
import { d } from "./support/dates";
import { habitNote } from "./support/habits";

describe("cellLook", () => {
	const habit = habitNote("Зарядка", { done_tiny: ["2026-10-08", "2026-10-05"], done_full: ["2026-10-06"] });

	it("joins neighbouring done days", () => {
		expect(cellLook(habit, d("2026-10-05"))).toMatchObject({ joinLeft: false, joinRight: true });
		expect(cellLook(habit, d("2026-10-06"))).toMatchObject({ joinLeft: true, joinRight: false });
		expect(cellLook(habit, d("2026-10-08"))).toMatchObject({ joinLeft: false, joinRight: false });
	});

	it("reports empty and unscheduled days", () => {
		expect(cellLook(habit, d("2026-10-07"))).toEqual({ mark: undefined, scheduled: true, joinLeft: false, joinRight: false });
		const weekend = habitNote("Фото", { schedule: [{ value: ["sat"], since: "2026-10-01" }] });
		expect(cellLook(weekend, d("2026-10-09")).scheduled).toBe(false);
		expect(cellLook(weekend, d("2026-10-10")).scheduled).toBe(true);
	});
});
