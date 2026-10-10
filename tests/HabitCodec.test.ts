import { describe, expect, it } from "vitest";
import { FULL, missed } from "../src/domain/DayMark";
import { DEFAULT_PROPERTY_NAMES, Frontmatter, HabitDecodeError, decodeHabit, encodeHabit } from "../src/infrastructure/HabitCodec";
import { d } from "./support/dates";

const EXAMPLE: Frontmatter = {
	order: 1,
	schedule: [{ value: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], since: "2026-09-01" }],
	anchor: [
		{ value: "Поставлю кружку в раковину", since: "2026-09-20" },
		{ value: "Выпью кофе", since: "2026-09-01", replaced_because: "С кофе забывал — якорь размытый" },
	],
	tiny: [
		{ value: "2 приседания", since: "2026-09-05" },
		{ value: "1 приседание", since: "2026-09-01" },
	],
	full: [{ value: "15 минут зарядки", since: "2026-09-01" }],
	celebration: [{ value: "«Есть!» + кулак", since: "2026-09-01" }],
	done_tiny: ["2026-10-08", "2026-10-06"],
	done_full: ["2026-10-09"],
	missed: [{ date: "2026-10-07", reason: "Пил кофе не дома" }],
};

const example = (patch: Frontmatter = {}): Frontmatter => ({ ...structuredClone(EXAMPLE), ...patch });

describe("decodeHabit", () => {
	it("reads the spec example", () => {
		const habit = decodeHabit("Зарядка", example());
		expect(habit.name).toBe("Зарядка");
		expect(habit.order).toBe(1);
		expect(habit.archived).toBe(false);
		expect(habit.text("anchor").current()).toBe("Поставлю кружку в раковину");
		expect(habit.text("anchor").versions[1].replacedBecause).toBe("С кофе забывал — якорь размытый");
		expect(habit.currentSchedule.isEveryDay).toBe(true);
		expect(habit.markOn(d("2026-10-09"))).toEqual(FULL);
		expect(habit.markOn(d("2026-10-07"))).toEqual(missed("Пил кофе не дома"));
	});

	it("accepts unsorted lists and Date values", () => {
		const habit = decodeHabit(
			"Зарядка",
			example({
				done_tiny: ["2026-10-06", new Date("2026-10-08")],
				tiny: [
					{ value: "1 приседание", since: "2026-09-01" },
					{ value: "2 приседания", since: "2026-09-05" },
				],
			}),
		);
		const frontmatter: Frontmatter = {};
		encodeHabit(habit, frontmatter);
		expect(frontmatter).toEqual(EXAMPLE);
	});

	it("treats the same mark repeated in one list as one mark", () => {
		const habit = decodeHabit(
			"Зарядка",
			example({ done_tiny: ["2026-10-08", "2026-10-08", "2026-10-06"], missed: [{ date: "2026-10-07", reason: "Пил кофе не дома" }, { date: "2026-10-07", reason: "Пил кофе не дома" }] }),
		);
		const frontmatter: Frontmatter = {};
		encodeHabit(habit, frontmatter);
		expect(frontmatter).toEqual(EXAMPLE);
	});

	it("reports two different reasons for one missed day", () => {
		expect(() => decodeHabit("Зарядка", example({ missed: [{ date: "2026-10-07", reason: "a" }, { date: "2026-10-07", reason: "b" }] }))).toThrow(
			"2026-10-07",
		);
	});

	it("reads and writes the habit color", () => {
		const habit = decodeHabit("Зарядка", example({ color: "green" }));
		expect(habit.color).toBe("green");
		const frontmatter: Frontmatter = {};
		encodeHabit(habit, frontmatter);
		expect(frontmatter.color).toBe("green");
		expect(() => decodeHabit("Зарядка", example({ color: "magenta" }))).toThrow("magenta");
	});

	it("reads archived", () => {
		expect(decodeHabit("Зарядка", example({ archived: true })).archived).toBe(true);
	});

	it.each([
		["no properties", undefined, "no habit properties"],
		["no anchor", { anchor: undefined }, "Anchor is missing"],
		["anchor not a list", { anchor: "Кружка" }, "anchor"],
		["bad date", { done_tiny: ["2026-13-01"] }, "done_tiny"],
		["two marks on one day", { done_full: ["2026-10-08"] }, "2026-10-08"],
		["missed without reason", { missed: [{ date: "2026-10-07" }] }, "reason"],
		["unknown weekday", { schedule: [{ value: ["funday"], since: "2026-09-01" }] }, "funday"],
		["empty schedule", { schedule: [{ value: [], since: "2026-09-01" }] }, "at least one day"],
		[
			"two versions on one day",
			{
				tiny: [
					{ value: "a", since: "2026-09-01" },
					{ value: "b", since: "2026-09-01" },
				],
			},
			"same since date",
		],
		["order not a number", { order: "first" }, "order"],
	])("reports %s", (_label, patch, message) => {
		const frontmatter = patch === undefined ? undefined : example(patch as Frontmatter);
		expect(() => decodeHabit("Зарядка", frontmatter)).toThrow(HabitDecodeError);
		expect(() => decodeHabit("Зарядка", frontmatter)).toThrow(message);
	});
});

describe("encodeHabit", () => {
	it("round-trips the spec example", () => {
		const frontmatter: Frontmatter = {};
		encodeHabit(decodeHabit("Зарядка", example()), frontmatter);
		expect(frontmatter).toEqual(EXAMPLE);
	});

	it("keeps unknown keys and drops archived=false", () => {
		const frontmatter: Frontmatter = { tags: ["habit"], ...example(), archived: false };
		encodeHabit(decodeHabit("Зарядка", example()), frontmatter);
		expect(frontmatter).toEqual({ tags: ["habit"], ...EXAMPLE });
	});

	it("removes lists that became empty", () => {
		const habit = decodeHabit("Зарядка", example({ done_tiny: undefined, done_full: undefined, missed: undefined, full: undefined, order: undefined }));
		const frontmatter: Frontmatter = example();
		encodeHabit(habit, frontmatter);
		for (const key of ["done_tiny", "done_full", "missed", "full", "order"]) expect(frontmatter).not.toHaveProperty(key);
	});

	it("writes archived=true", () => {
		const frontmatter: Frontmatter = {};
		encodeHabit(decodeHabit("Зарядка", example()).archive(), frontmatter);
		expect(frontmatter.archived).toBe(true);
	});

	it("reads and writes under custom property names", () => {
		const keys = { ...DEFAULT_PROPERTY_NAMES, doneTiny: "wins", anchor: "after" };
		const habit = decodeHabit("Read", { ...example(), after: example().anchor, anchor: undefined, wins: ["2026-10-01"] }, keys);
		expect(habit.markOn(d("2026-10-01"))).toEqual({ kind: "tiny" });
		const frontmatter: Frontmatter = {};
		encodeHabit(habit, frontmatter, keys);
		expect(frontmatter.wins).toContain("2026-10-01");
		expect(frontmatter.after).toBeDefined();
		expect(frontmatter.anchor).toBeUndefined();
	});
});
