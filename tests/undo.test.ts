import { describe, expect, it } from "vitest";
import { DayMark, FULL, OFF_TRIGGER, SKIPPED, TINY, missed } from "../src/domain/DayMark";
import { longDate } from "../src/ui/format";
import { MarkChange, changeText, nextChange } from "../src/ui/undo";
import { d } from "./support/dates";

const today = d("2026-10-25");

function change(before: DayMark | undefined, after: DayMark | undefined, day = today, path = "Habits/Run.md"): MarkChange {
	return { path, name: "Зарядка утром", day, before, after };
}

describe("nextChange", () => {
	it("offers each new answer on its own", () => {
		const first = change(undefined, FULL);
		const second = change(undefined, TINY, today, "Habits/Read.md");
		expect(nextChange(null, first)).toEqual(first);
		expect(nextChange(first, second)).toEqual(second);
	});

	it("treats a skip's reason as the end of the skip, so undo goes back to before the skip", () => {
		const skip = change(TINY, SKIPPED);
		expect(nextChange(skip, change(SKIPPED, missed("Tired")))).toEqual(change(TINY, missed("Tired")));
	});

	it("keeps a reason for another day or habit apart", () => {
		const skip = change(undefined, SKIPPED);
		const elsewhere = change(SKIPPED, missed("Tired"), d("2026-10-24"));
		expect(nextChange(skip, elsewhere)).toEqual(elsewhere);
	});

	it("keeps a clear right after a mark undoable, back to the mark", () => {
		const marked = change(undefined, FULL);
		const cleared = change(FULL, undefined);
		expect(nextChange(marked, cleared)).toEqual(cleared);
	});

	it("keeps what it offered when an answer changed nothing", () => {
		const marked = change(undefined, FULL, today, "Habits/Read.md");
		expect(nextChange(marked, change(missed("Tired"), missed("Tired")))).toEqual(marked);
		expect(nextChange(null, change(FULL, FULL))).toBeNull();
	});
});

describe("changeText", () => {
	it("names the habit and the answer given", () => {
		expect(changeText(change(undefined, FULL), today)).toEqual({ name: "Зарядка утром", what: "Full" });
		expect(changeText(change(undefined, TINY), today).what).toBe("Tiny");
		expect(changeText(change(undefined, OFF_TRIGGER), today).what).toBe("Anytime");
		expect(changeText(change(undefined, missed("Tired")), today).what).toBe("Skipped");
	});

	it("says which answer a clear took away", () => {
		expect(changeText(change(FULL, undefined), today).what).toBe("Full cleared");
		expect(changeText(change(SKIPPED, undefined), today).what).toBe("Skip cleared");
	});

	it("says what an answer replaced", () => {
		expect(changeText(change(TINY, FULL), today).what).toBe("Tiny → Full");
	});

	it("adds the day when it isn't today", () => {
		expect(changeText(change(FULL, undefined, d("2026-10-24")), today).what).toBe("Full cleared · Yesterday");
		expect(changeText(change(undefined, TINY, d("2026-10-20")), today).what).toBe(`Tiny · ${longDate(d("2026-10-20"))}`);
	});
});
