import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FULL, SKIPPED, TINY } from "../src/domain/DayMark";
import { HOLD_TICK_MS, LastAnswer, LastAnswerTimers, UNDO_MS } from "../src/ui/LastAnswer";
import { MarkChange } from "../src/ui/undo";
import { d } from "./support/dates";

const timers: LastAnswerTimers = {
	setTimeout: (run: () => void, ms: number) => setTimeout(run, ms) as unknown as number,
	clearTimeout: (id: number) => clearTimeout(id),
	now: () => Date.now(),
};

const marked: MarkChange = { path: "Habits/Run.md", name: "Run", day: d("2026-10-25"), before: undefined, after: FULL };

describe("LastAnswer", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("shows the last answer for a while, then lets it go", () => {
		const shown: (MarkChange | null)[] = [];
		const last = new LastAnswer((change) => shown.push(change), timers);
		last.offer(marked);
		expect(shown).toEqual([marked]);
		vi.advanceTimersByTime(UNDO_MS - 1);
		expect(last.current).toEqual(marked);
		vi.advanceTimersByTime(1);
		expect(shown).toEqual([marked, null]);
		expect(last.take()).toBeNull();
	});

	it("gives the answer up once, to be undone", () => {
		const shown: (MarkChange | null)[] = [];
		const last = new LastAnswer((change) => shown.push(change), timers);
		last.offer(marked);
		expect(last.take()).toEqual(marked);
		expect(last.take()).toBeNull();
		expect(shown).toEqual([marked, null]);
	});

	it("starts the time over for a new answer", () => {
		const last = new LastAnswer(() => {}, timers);
		last.offer(marked);
		vi.advanceTimersByTime(UNDO_MS - 1);
		const next = { ...marked, path: "Habits/Read.md", after: TINY };
		last.offer(next);
		vi.advanceTimersByTime(UNDO_MS - 1);
		expect(last.current).toEqual(next);
	});

	it("stops its time while it is held, as while the tray moves, and goes on with the rest once let go", () => {
		let held = false;
		const last = new LastAnswer(() => {}, timers);
		last.holdWhile(() => held);
		last.offer(marked);
		vi.advanceTimersByTime(UNDO_MS / 2);
		held = true;
		vi.advanceTimersByTime(UNDO_MS * 3);
		expect(last.current).toEqual(marked);
		held = false;
		vi.advanceTimersByTime(UNDO_MS / 2 - HOLD_TICK_MS);
		expect(last.current).toEqual(marked);
		vi.advanceTimersByTime(2 * HOLD_TICK_MS);
		expect(last.current).toBeNull();
	});

	it("keeps the skip it shows when the skip's reason comes in", () => {
		const shown: (MarkChange | null)[] = [];
		const last = new LastAnswer((change) => shown.push(change), timers);
		const skip = { ...marked, after: SKIPPED };
		last.offer(skip);
		last.offer({ ...marked, before: SKIPPED, after: { kind: "missed", reason: "Tired" } });
		expect(last.current).toEqual({ ...marked, after: { kind: "missed", reason: "Tired" } });
		expect(shown).toHaveLength(2);
	});

	it("stops its clock when destroyed", () => {
		const shown: (MarkChange | null)[] = [];
		const last = new LastAnswer((change) => shown.push(change), timers);
		last.offer(marked);
		last.destroy();
		vi.advanceTimersByTime(UNDO_MS);
		expect(shown).toEqual([marked]);
	});
});
