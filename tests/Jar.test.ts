import { describe, expect, it } from "vitest";
import { DayMark, FULL, TINY, missed } from "../src/domain/DayMark";
import { Habit } from "../src/domain/Habit";
import { WEEKDAYS, Weekday } from "../src/domain/LocalDate";
import { buildJar } from "../src/domain/Jar";
import { d } from "./support/dates";

const today = d("2026-10-09");

const habit = (created: string, days: readonly Weekday[] = WEEKDAYS) =>
	Habit.create({ name: "Read", anchor: "pour coffee", tiny: "open the book", days }, d(created));

function marked(start: Habit, marks: Record<string, DayMark>): Habit {
	return Object.entries(marks).reduce((current, [date, mark]) => current.withMark(d(date), mark, today), start);
}

function doneDays(from: string, count: number, mark: DayMark = TINY): Record<string, DayMark> {
	const marks: Record<string, DayMark> = {};
	for (let index = 0; index < count; index++) marks[d(from).addDays(index).toString()] = mark;
	return marks;
}

const sizes = (pieces: ReturnType<typeof buildJar>) => pieces.map((piece) => piece.size);

describe("buildJar", () => {
	it("turns a few done days into small balls", () => {
		const jar = buildJar(marked(habit("2026-10-01"), doneDays("2026-10-01", 3)), today);
		expect(sizes(jar)).toEqual(["small", "small", "small"]);
		expect(jar.map((piece) => piece.id)).toEqual(["small:2026-10-01", "small:2026-10-02", "small:2026-10-03"]);
	});

	it("merges seven done days into one medium ball named after its first day", () => {
		const jar = buildJar(marked(habit("2026-09-01"), doneDays("2026-09-01", 9)), today);
		expect(jar.map((piece) => piece.id)).toEqual(["medium:2026-09-01", "small:2026-09-08", "small:2026-09-09"]);
	});

	it("merges twenty-eight done days into one big ball", () => {
		const jar = buildJar(marked(habit("2026-09-01"), doneDays("2026-09-01", 37)), today);
		expect(sizes(jar)).toEqual(["big", "medium", "small", "small"]);
		expect(jar[0].id).toBe("big:2026-09-01");
		expect(jar[1].id).toBe("medium:2026-09-29");
	});

	it("merges across missed and empty days", () => {
		const marks = { ...doneDays("2026-09-01", 3), "2026-09-04": missed("ill"), ...doneDays("2026-09-10", 3), ...doneDays("2026-09-20", 2) };
		const jar = buildJar(marked(habit("2026-09-01"), marks), today);
		expect(jar.map((piece) => piece.id)).toEqual(["medium:2026-09-01", "small:2026-09-21"]);
	});

	it("flags today's ball and the full days", () => {
		const marks = { "2026-10-07": FULL, "2026-10-08": TINY, "2026-10-09": FULL };
		const jar = buildJar(marked(habit("2026-10-07"), marks), today);
		expect(jar.map((piece) => [piece.full, piece.today])).toEqual([
			[true, false],
			[false, false],
			[true, true],
		]);
	});

	it("marks a ball formed by today's answer as today's", () => {
		const marks = { ...doneDays("2026-09-20", 3), ...doneDays("2026-10-06", 4) };
		const jar = buildJar(marked(habit("2026-09-20"), marks), today);
		expect(jar).toEqual([{ id: "medium:2026-09-20", size: "medium", full: false, today: true }]);
	});

	it("counts days marked before the habit was created", () => {
		const jar = buildJar(marked(habit("2026-10-05"), { "2026-10-01": TINY }), today);
		expect(sizes(jar)).toEqual(["small"]);
	});

	it("is empty without done days", () => {
		expect(buildJar(habit("2026-10-01"), today)).toEqual([]);
	});

	it("merges by the chosen size", () => {
		const jar = buildJar(marked(habit("2026-09-01"), doneDays("2026-09-01", 13)), today, 5);
		expect(sizes(jar)).toEqual(["medium", "medium", "small", "small", "small"]);
		expect(sizes(buildJar(marked(habit("2026-09-01"), doneDays("2026-09-01", 20)), today, 5))).toEqual(["big"]);
	});
});
