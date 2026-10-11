import { describe, expect, it } from "vitest";
import { FixedStep, STEP_MS } from "../src/ui/jar/FixedStep";

function stepsOver(hz: number, seconds: number): number[] {
	const clock = new FixedStep();
	const frame = 1000 / hz;
	return Array.from({ length: Math.round(hz * seconds) }, (_, index) => clock.next(index * frame));
}

const sum = (steps: number[]) => steps.reduce((total, step) => total + step, 0);

describe("FixedStep", () => {
	it("takes exactly one step per frame on a 120 Hz screen", () => {
		expect(stepsOver(120, 2).every((steps) => steps === 1)).toBe(true);
	});

	it("takes 120 steps a second on 60 Hz and 144 Hz screens too", () => {
		expect(stepsOver(60, 1).slice(1).every((steps) => steps === 2)).toBe(true);
		expect(sum(stepsOver(60, 1))).toBeCloseTo(119, -1);
		expect(sum(stepsOver(144, 1))).toBeCloseTo(120, -1);
	});

	it("runs faster or slower at another rate", () => {
		const at = (rate: number) => {
			const clock = new FixedStep();
			return Array.from({ length: 120 }, (_, index) => clock.next(index * STEP_MS, rate)).reduce((total, steps) => total + steps, 0);
		};
		expect(at(2)).toBeCloseTo(240, -1);
		expect(at(0.5)).toBeCloseTo(60, -1);
		expect(at(1.5)).toBeCloseTo(180, -1);
	});

	it("catches up at most eight steps after a pause", () => {
		const clock = new FixedStep();
		clock.next(0);
		expect(clock.next(5000)).toBe(8);
	});

	it("starts fresh after a reset", () => {
		const clock = new FixedStep();
		clock.next(0);
		clock.reset();
		expect(clock.next(10_000)).toBe(1);
		expect(STEP_MS).toBeCloseTo(8.33, 1);
	});
});
