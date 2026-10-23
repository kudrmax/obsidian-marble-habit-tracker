import { describe, expect, it } from "vitest";
import { DEFAULT_WIN_RULE, FULL, OFF_TRIGGER, TINY, isWin, missed } from "../src/domain/DayMark";

describe("DayMark", () => {
	it("keeps the reason of a skipped day, when there is one", () => {
		expect(missed("  проспал ")).toEqual({ kind: "missed", reason: "проспал" });
		expect(missed("   ")).toEqual({ kind: "missed" });
		expect(missed()).toEqual({ kind: "missed" });
	});

	it("treats tiny and full as wins", () => {
		expect(isWin(TINY, DEFAULT_WIN_RULE)).toBe(true);
		expect(isWin(FULL, DEFAULT_WIN_RULE)).toBe(true);
		expect(isWin(missed("x"), { offTrigger: true })).toBe(false);
		expect(isWin(undefined, { offTrigger: true })).toBe(false);
	});

	it("treats a day done not at the trigger as a win only when the rule says so", () => {
		expect(DEFAULT_WIN_RULE.offTrigger).toBe(false);
		expect(isWin(OFF_TRIGGER, DEFAULT_WIN_RULE)).toBe(false);
		expect(isWin(OFF_TRIGGER, { offTrigger: true })).toBe(true);
	});
});
