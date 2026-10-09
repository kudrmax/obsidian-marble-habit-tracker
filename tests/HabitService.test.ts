import { beforeEach, describe, expect, it } from "vitest";
import { HabitService } from "../src/application/HabitService";
import { FULL, TINY, missed } from "../src/domain/DayMark";
import { DomainError } from "../src/domain/DomainError";
import { WEEKDAYS } from "../src/domain/LocalDate";
import { InMemoryHabitRepository } from "./support/InMemoryHabitRepository";
import { StaleReadRepository } from "./support/StaleReadRepository";
import { d } from "./support/dates";

const today = d("2026-10-09");

describe("HabitService", () => {
	let repository: InMemoryHabitRepository;
	let service: HabitService;
	let path: string;

	beforeEach(async () => {
		repository = new InMemoryHabitRepository();
		service = new HabitService(repository, { today: () => today });
		path = await service.create({ name: "Зарядка", anchor: "Кружка", tiny: "2 приседания", days: WEEKDAYS });
	});

	it("creates habits starting today", () => {
		expect(path).toBe("Habits/Зарядка.md");
		expect(repository.habit(path).createdOn).toEqual(today);
	});

	it("rejects a duplicate name", async () => {
		await expect(service.create({ name: "Зарядка", anchor: "a", tiny: "b", days: WEEKDAYS })).rejects.toThrow(DomainError);
	});

	it("cycles a day and stores the result", async () => {
		expect((await service.cycle(path, today)).markOn(today)).toEqual(TINY);
		expect((await service.cycle(path, today)).markOn(today)).toEqual(FULL);
		expect((await service.cycle(path, today)).markOn(today)).toBeUndefined();
		expect(repository.habit(path).markOn(today)).toBeUndefined();
	});

	it("does not cycle a missed day", async () => {
		await service.setMark(path, today, missed("проспал"));
		await expect(service.cycle(path, today)).rejects.toThrow(DomainError);
	});

	it("sets and clears an explicit mark", async () => {
		await service.setMark(path, d("2026-10-08"), missed("уехал"));
		expect(repository.habit(path).markOn(d("2026-10-08"))).toEqual(missed("уехал"));
		await service.setMark(path, d("2026-10-08"), undefined);
		expect(repository.habit(path).markOn(d("2026-10-08"))).toBeUndefined();
	});

	it("changes recipe parts as of today", async () => {
		service = new HabitService(repository, { today: () => d("2026-10-20") });
		await service.replaceText(path, "anchor", "Поставлю кружку", "размыто");
		await service.replaceSchedule(path, ["sat", "sun"]);
		const habit = repository.habit(path);
		expect(habit.text("anchor").versions[0].since).toEqual(d("2026-10-20"));
		expect(habit.text("anchor").versions[1].replacedBecause).toBe("размыто");
		expect(habit.currentSchedule.weekdays).toEqual(["sat", "sun"]);
		await service.correctText(path, "anchor", "Поставлю кружку в раковину");
		await service.correctSchedule(path, ["sun"]);
		expect(repository.habit(path).text("anchor").versions).toHaveLength(2);
		expect(repository.habit(path).currentSchedule.weekdays).toEqual(["sun"]);
	});

	it("archives", async () => {
		await service.archive(path);
		expect(repository.habit(path).archived).toBe(true);
	});

	it("refuses to change an unknown or broken habit", async () => {
		await expect(service.cycle("Habits/Нет.md", today)).rejects.toThrow("не найдена");
		repository.entries.set("Habits/Битая.md", { kind: "broken", path: "Habits/Битая.md", name: "Битая", problem: "нет свойств" });
		await expect(service.cycle("Habits/Битая.md", today)).rejects.toThrow("нет свойств");
	});

	it("builds each change on the freshly stored habit, not on a stale read", async () => {
		const stale = new StaleReadRepository();
		const fresh = new HabitService(stale, { today: () => today });
		const stalePath = await fresh.create({ name: "Нить", anchor: "Зубы", tiny: "1 зуб", days: WEEKDAYS });
		stale.freeze();
		await fresh.cycle(stalePath, d("2026-10-08"));
		await fresh.cycle(stalePath, today);
		await fresh.cycle(stalePath, today);
		const habit = stale.freshHabit(stalePath);
		expect(habit.markOn(d("2026-10-08"))).toEqual(TINY);
		expect(habit.markOn(today)).toEqual(FULL);
	});
});
