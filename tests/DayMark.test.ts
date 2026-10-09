import { describe, expect, it } from "vitest";
import { FULL, TINY, isDone, missed } from "../src/domain/DayMark";

describe("DayMark", () => {
	it("requires a reason for a missed day", () => {
		expect(missed("  проспал ")).toEqual({ kind: "missed", reason: "проспал" });
		expect(() => missed("   ")).toThrow("reason");
	});

	it("treats tiny and full as done", () => {
		expect(isDone(TINY)).toBe(true);
		expect(isDone(FULL)).toBe(true);
		expect(isDone(missed("x"))).toBe(false);
		expect(isDone(undefined)).toBe(false);
	});
});
