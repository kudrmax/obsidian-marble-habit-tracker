import { describe, expect, it } from "vitest";
import { FULL, TINY, missed } from "../src/domain/DayMark";
import { DomainError } from "../src/domain/DomainError";
import { Habit } from "../src/domain/Habit";
import { WEEKDAYS } from "../src/domain/LocalDate";
import { Schedule } from "../src/domain/Schedule";
import { d } from "./support/dates";

const created = d("2026-09-01");
const today = d("2026-10-09");
const base = () =>
	Habit.create({ name: " Зарядка ", anchor: " Выпью кофе ", tiny: "1 приседание", celebration: "", days: WEEKDAYS }, created);

describe("Habit", () => {
	it("is created with trimmed values and optional parts left empty", () => {
		const habit = base();
		expect(habit.name).toBe("Зарядка");
		expect(habit.text("anchor").current()).toBe("Выпью кофе");
		expect(habit.text("full").isEmpty).toBe(true);
		expect(habit.text("celebration").isEmpty).toBe(true);
		expect(habit.currentSchedule.isEveryDay).toBe(true);
		expect(habit.createdOn).toEqual(created);
		expect(habit.archived).toBe(false);
		expect(habit.order).toBeUndefined();
	});

	it("requires a name, days and a tiny or a full version", () => {
		const input = { name: "Зарядка", anchor: "Кофе", tiny: "1", days: WEEKDAYS };
		expect(() => Habit.create({ ...input, name: " " }, created)).toThrow(DomainError);
		expect(() => Habit.create({ ...input, name: "a/b" }, created)).toThrow(DomainError);
		expect(() => Habit.create({ ...input, tiny: "", full: " " }, created)).toThrow("action or a tiny action");
		expect(() => Habit.create({ ...input, days: [] }, created)).toThrow(DomainError);
	});

	it("removes a part as of today and keeps its history", () => {
		const habit = Habit.create({ name: "Чтение", anchor: "Кофе", tiny: "1 страница", full: "Глава", days: WEEKDAYS }, created);
		const cleared = habit.clearText("tiny", today);
		expect(cleared.hasTiny).toBe(false);
		expect(cleared.current("full")).toBe("Глава");
		expect(cleared.text("tiny").versions.map((version) => version.value)).toEqual(["", "1 страница"]);
		expect(cleared.changes()[0]).toMatchObject({ part: "tiny", from: "1 страница", to: "" });
		expect(cleared.replaceText("tiny", "2 страницы", d("2026-10-10")).current("tiny")).toBe("2 страницы");
		expect(habit.clearText("anchor", today).current("anchor")).toBeUndefined();
	});

	it("keeps a part removed on the day it was written in the history", () => {
		const habit = Habit.create({ name: "Чтение", tiny: "1 страница", full: "Глава", days: WEEKDAYS }, today);
		const cleared = habit.clearText("full", today);
		expect(cleared.hasFull).toBe(false);
		expect(cleared.changes()).toEqual([expect.objectContaining({ part: "full", from: "Глава", to: "" })]);
	});

	it("keeps a tiny or a full version", () => {
		const habit = Habit.create({ name: "Чтение", tiny: "1 страница", full: "Глава", days: WEEKDAYS }, created);
		expect(() => habit.clearText("tiny", today).clearText("full", today)).toThrow("action or a tiny action");
	});

	it("knows when a habit without an anchor or a tiny version started", () => {
		const habit = Habit.create({ name: "Зал", full: "Тренировка", days: WEEKDAYS }, created);
		expect(habit.createdOn).toEqual(created);
		expect(habit.isScheduled(today)).toBe(true);
	});

	it("can go without an anchor or without a tiny version", () => {
		const full = Habit.create({ name: "Зал", full: "Тренировка", days: WEEKDAYS }, created);
		expect(full.text("anchor").isEmpty).toBe(true);
		expect(full.hasTiny).toBe(false);
		expect(full.hasFull).toBe(true);
		const tiny = Habit.create({ name: "Чтение", tiny: "1 страница", days: WEEKDAYS }, created);
		expect(tiny.hasTiny).toBe(true);
		expect(tiny.hasFull).toBe(false);
	});

	it("sets and clears marks without changing the original", () => {
		const habit = base();
		const marked = habit.withMark(d("2026-10-08"), FULL, today);
		expect(marked.markOn(d("2026-10-08"))).toEqual(FULL);
		expect(habit.markOn(d("2026-10-08"))).toBeUndefined();
		expect(marked.withMark(d("2026-10-08"), undefined, today).markOn(d("2026-10-08"))).toBeUndefined();
	});

	it("refuses to mark a future day", () => {
		expect(() => base().withMark(d("2026-10-10"), TINY, today)).toThrow(DomainError);
	});

	it("lists marks newest first", () => {
		const habit = base()
			.withMark(d("2026-10-01"), TINY, today)
			.withMark(d("2026-10-07"), missed("проспал"), today)
			.withMark(d("2026-10-03"), FULL, today);
		expect(habit.marks().map(([date, mark]) => [date.toString(), mark.kind])).toEqual([
			["2026-10-07", "missed"],
			["2026-10-03", "full"],
			["2026-10-01", "tiny"],
		]);
	});

	it("checks the schedule that was active on each date", () => {
		const habit = base().replaceSchedule(new Schedule(["sat"]), d("2026-10-01"));
		expect(habit.isScheduled(d("2026-08-31"))).toBe(false);
		expect(habit.isScheduled(d("2026-09-30"))).toBe(true);
		expect(habit.isScheduled(d("2026-10-07"))).toBe(false);
		expect(habit.isScheduled(d("2026-10-10"))).toBe(true);
	});

	it("rejects blank replacements", () => {
		expect(() => base().replaceText("anchor", "  ", today)).toThrow(DomainError);
		expect(() => base().correctText("tiny", "")).toThrow(DomainError);
	});

	it("describes recipe changes newest first, without the creation", () => {
		const habit = base()
			.replaceText("anchor", "Поставлю кружку", d("2026-09-20"), "С кофе забывал")
			.replaceText("tiny", "2 приседания", d("2026-09-05"))
			.replaceText("full", "15 минут", d("2026-10-01"))
			.replaceSchedule(new Schedule(["mon", "wed"]), d("2026-10-02"));
		const changes = habit.changes();
		expect(changes.map((change) => [change.date.toString(), change.part])).toEqual([
			["2026-10-02", "schedule"],
			["2026-10-01", "full"],
			["2026-09-20", "anchor"],
			["2026-09-05", "tiny"],
		]);
		expect(changes[1]).toEqual({ part: "full", date: d("2026-10-01"), from: undefined, to: "15 минут", because: undefined });
		expect(changes[2]).toEqual({ part: "anchor", date: d("2026-09-20"), from: "Выпью кофе", to: "Поставлю кружку", because: "С кофе забывал" });
	});

	it("corrects a value without recording a change", () => {
		const habit = base().correctText("anchor", "Выпью утренний кофе");
		expect(habit.text("anchor").current()).toBe("Выпью утренний кофе");
		expect(habit.changes()).toEqual([]);
	});

	it("archives", () => {
		expect(base().archive().archived).toBe(true);
		expect(base().archive().restore().archived).toBe(false);
	});

	it("has an optional color from the theme palette", () => {
		expect(base().color).toBeUndefined();
		const blue = Habit.create({ name: "Floss", anchor: "Brush", tiny: "1 tooth", days: WEEKDAYS, color: "blue" }, created);
		expect(blue.color).toBe("blue");
		expect(blue.withColor("pink").color).toBe("pink");
		expect(blue.withColor(undefined).color).toBeUndefined();
	});
});
