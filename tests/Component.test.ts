import { describe, expect, it } from "vitest";
import { Component } from "../src/domain/Component";
import { DomainError } from "../src/domain/DomainError";
import { d } from "./support/dates";

describe("Component", () => {
	const coffee = Component.start("Выпью кофе", d("2026-09-01"));

	it("puts a replacement on top and stores the reason on the retired version", () => {
		const next = coffee.replace("Поставлю кружку", d("2026-09-20"), "  размытый якорь ");
		expect(next.versions).toEqual([
			{ value: "Поставлю кружку", since: d("2026-09-20") },
			{ value: "Выпью кофе", since: d("2026-09-01"), replacedBecause: "размытый якорь" },
		]);
		expect(next.current()).toBe("Поставлю кружку");
		expect(coffee.current()).toBe("Выпью кофе");
	});

	it("does not store a blank reason", () => {
		const next = coffee.replace("Поставлю кружку", d("2026-09-20"), "   ");
		expect(next.versions[1]).toEqual({ value: "Выпью кофе", since: d("2026-09-01") });
	});

	it("overwrites a version replaced on the day it started", () => {
		const next = coffee.replace("Поставлю кружку", d("2026-09-01"), "передумал");
		expect(next.versions).toEqual([{ value: "Поставлю кружку", since: d("2026-09-01") }]);
	});

	it("ignores a replacement with the same value", () => {
		expect(coffee.replace("Выпью кофе", d("2026-09-20"))).toBe(coffee);
	});

	it("refuses to replace a version that starts in the future", () => {
		expect(() => coffee.replace("x", d("2026-08-01"))).toThrow(DomainError);
	});

	it("corrects the current value without adding history", () => {
		const next = coffee.replace("Поставлю кружку", d("2026-09-20"), "размыто").correct("Поставлю кружку в раковину");
		expect(next.versions).toEqual([
			{ value: "Поставлю кружку в раковину", since: d("2026-09-20") },
			{ value: "Выпью кофе", since: d("2026-09-01"), replacedBecause: "размыто" },
		]);
	});

	it("answers which version was active on a date", () => {
		const next = coffee.replace("Поставлю кружку", d("2026-09-20"));
		expect(next.at(d("2026-08-31"))).toBeUndefined();
		expect(next.at(d("2026-09-01"))).toBe("Выпью кофе");
		expect(next.at(d("2026-09-19"))).toBe("Выпью кофе");
		expect(next.at(d("2026-09-20"))).toBe("Поставлю кружку");
	});

	it("starts empty and gets a first version on replace", () => {
		const empty = Component.empty<string>();
		expect(empty.isEmpty).toBe(true);
		expect(empty.current()).toBeUndefined();
		expect(empty.replace("15 минут", d("2026-10-01")).versions).toEqual([{ value: "15 минут", since: d("2026-10-01") }]);
		expect(() => empty.correct("x")).toThrow(DomainError);
	});

	it("rejects versions that are not strictly newest first", () => {
		expect(() =>
			Component.of([
				{ value: "a", since: d("2026-09-01") },
				{ value: "b", since: d("2026-09-01") },
			]),
		).toThrow("same since date");
		expect(() =>
			Component.of([
				{ value: "a", since: d("2026-09-01") },
				{ value: "b", since: d("2026-09-20") },
			]),
		).toThrow(DomainError);
	});

	it("uses the provided equality", () => {
		const sets = Component.start([1, 2], d("2026-09-01"), (a, b) => a.join() === b.join());
		expect(sets.replace([1, 2], d("2026-09-20"))).toBe(sets);
	});
});
