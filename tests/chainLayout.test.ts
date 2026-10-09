import { describe, expect, it } from "vitest";
import { chainLayout, dayState } from "../src/ui/chainLayout";

describe("dayState", () => {
	it("maps a cell to what the chain draws", () => {
		const base = { scheduled: true, existed: true, joinLeft: false, joinRight: false };
		expect(dayState({ ...base, mark: { kind: "full" } })).toBe("full");
		expect(dayState({ ...base, mark: { kind: "tiny" } })).toBe("tiny");
		expect(dayState({ ...base, mark: { kind: "missed", reason: "x" } })).toBe("missed");
		expect(dayState(base)).toBe("empty");
		expect(dayState({ ...base, scheduled: false })).toBe("off");
		expect(dayState({ ...base, existed: false })).toBe("before");
		expect(dayState({ ...base, existed: false, mark: { kind: "tiny" } })).toBe("tiny");
	});
});

describe("chainLayout", () => {
	it("joins neighbouring done days into runs and marks full days with a spark", () => {
		const layout = chainLayout(["tiny", "full", "empty", "full", "off", "tiny", "tiny"]);
		expect(layout.runs).toEqual([
			{ first: 0, last: 1, beads: [{ index: 0, spark: false }, { index: 1, spark: true }] },
			{ first: 3, last: 3, beads: [{ index: 3, spark: true }] },
			{ first: 5, last: 6, beads: [{ index: 5, spark: false }, { index: 6, spark: false }] },
		]);
	});

	it("draws rings for empty and missed days only", () => {
		expect(chainLayout(["empty", "missed", "off", "before", "tiny"]).rings).toEqual([
			{ index: 0, kind: "empty" },
			{ index: 1, kind: "missed" },
		]);
	});
});
