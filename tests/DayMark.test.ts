import { describe, expect, it } from "vitest";
import { FULL, TINY, isDone, missed, nextMark } from "../src/domain/DayMark";
import { DomainError } from "../src/domain/DomainError";

describe("DayMark", () => {
	it("cycles empty → tiny → full → empty", () => {
		expect(nextMark(undefined)).toEqual(TINY);
		expect(nextMark(TINY)).toEqual(FULL);
		expect(nextMark(FULL)).toBeUndefined();
	});

	it("does not cycle a missed day", () => {
		expect(() => nextMark(missed("проспал"))).toThrow(DomainError);
	});

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
