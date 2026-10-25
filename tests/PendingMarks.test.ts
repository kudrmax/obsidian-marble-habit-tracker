import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { SKIPPED, missed } from "../src/domain/DayMark";
import { PendingMarks } from "../src/ui/PendingMarks";
import { d } from "./support/dates";
import { habitNote } from "./support/habits";

const today = d("2026-10-25");
const path = "Habits/Read.md";
const read = (extra = {}): HabitEntry => ({ kind: "ok", path, habit: habitNote("Read", extra) });
const markOn = (entries: readonly HabitEntry[], day = today) => (entries[0]?.kind === "ok" ? entries[0].habit.markOn(day) : undefined);

describe("PendingMarks", () => {
	it("shows a chosen mark before its note has it", () => {
		const pending = new PendingMarks();
		pending.set(path, today, SKIPPED);
		expect(markOn(pending.apply([read()], today))).toEqual(SKIPPED);
	});

	it("shows the latest choice for a day, over what the note said before", () => {
		const pending = new PendingMarks();
		pending.set(path, today, SKIPPED);
		pending.set(path, today, missed("Forgot"));
		expect(markOn(pending.apply([read({ missed: [{ date: "2026-10-25" }] })], today))).toEqual(missed("Forgot"));
	});

	it("shows a cleared day as cleared until the note is", () => {
		const pending = new PendingMarks();
		pending.set(path, today, undefined);
		expect(markOn(pending.apply([read({ missed: [{ date: "2026-10-25" }] })], today))).toBeUndefined();
	});

	it("lets go of a mark once the note says the same, so later changes to the note show", () => {
		const pending = new PendingMarks();
		pending.set(path, today, missed("Forgot"));
		pending.apply([read({ missed: [{ date: "2026-10-25", reason: "Forgot" }] })], today);
		expect(markOn(pending.apply([read()], today))).toBeUndefined();
	});

	it("lets go of a mark the note never takes after a while", () => {
		let now = 0;
		const pending = new PendingMarks(() => now);
		pending.set(path, today, SKIPPED);
		now = 10_000;
		expect(markOn(pending.apply([read()], today))).toBeUndefined();
	});

	it("lets go of a mark whose note could not be written", () => {
		const pending = new PendingMarks();
		pending.set(path, today, SKIPPED);
		pending.drop(path, today);
		expect(markOn(pending.apply([read()], today))).toBeUndefined();
	});

	it("leaves other habits and broken notes as they are", () => {
		const pending = new PendingMarks();
		pending.set("Habits/Other.md", today, SKIPPED);
		const broken: HabitEntry = { kind: "broken", path: "Habits/Bad.md", name: "Bad", problem: "bad" };
		const entries = [read(), broken];
		expect(pending.apply(entries, today)).toEqual(entries);
	});
});
