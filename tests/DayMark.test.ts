import { describe, expect, it } from "vitest";
import { FULL, TINY, isDone, missed } from "../src/domain/DayMark";

describe("DayMark", () => {
	it("keeps the reason of a skipped day, when there is one", () => {
		expect(missed("  проспал ")).toEqual({ kind: "missed", reason: "проспал" });
		expect(missed("   ")).toEqual({ kind: "missed" });
		expect(missed()).toEqual({ kind: "missed" });
	});

	it("treats tiny and full as done", () => {
		expect(isDone(TINY)).toBe(true);
		expect(isDone(FULL)).toBe(true);
		expect(isDone(missed("x"))).toBe(false);
		expect(isDone(undefined)).toBe(false);
	});
});
