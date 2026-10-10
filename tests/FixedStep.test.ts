import { describe, expect, it } from "vitest";
import { FixedStep, STEP_MS } from "../src/ui/jar/FixedStep";

function stepsOver(hz: number, seconds: number): number[] {
	const clock = new FixedStep();
	const frame = 1000 / hz;
	return Array.from({ length: Math.round(hz * seconds) }, (_, index) => clock.next(index * frame));
}

const sum = (steps: number[]) => steps.reduce((total, step) => total + step, 0);

describe("FixedStep", () => {
	it("takes exactly one step per frame on a 60 Hz screen", () => {
		expect(stepsOver(60, 2).every((steps) => steps === 1)).toBe(true);
	});

	it("takes 60 steps a second on 120 Hz and 144 Hz screens", () => {
		expect(sum(stepsOver(120, 1))).toBeCloseTo(60, -1);
		expect(sum(stepsOver(144, 1))).toBeCloseTo(60, -1);
		expect(Math.max(...stepsOver(120, 1))).toBe(1);
	});

	it("catches up at most four steps after a pause", () => {
		const clock = new FixedStep();
		clock.next(0);
		expect(clock.next(5000)).toBe(4);
	});

	it("starts fresh after a reset", () => {
		const clock = new FixedStep();
		clock.next(0);
		clock.reset();
		expect(clock.next(10_000)).toBe(1);
		expect(STEP_MS).toBeCloseTo(16.67, 1);
	});
});
