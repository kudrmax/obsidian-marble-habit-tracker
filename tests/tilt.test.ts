import { describe, expect, it } from "vitest";
import { tiltGravity } from "../src/ui/jar/TiltSensor";

const S = 0.45;
const close = (point: { x: number; y: number }, x: number, y: number) => {
	expect(point.x).toBeCloseTo(x, 3);
	expect(point.y).toBeCloseTo(y, 3);
};

describe("tiltGravity", () => {
	it("pulls straight down when the phone stands upright", () => {
		close(tiltGravity(90, 0, 0, S), 0, S);
	});

	it("does not pull when the phone lies flat", () => {
		close(tiltGravity(0, 0, 0, S), 0, 0);
	});

	it("rolls to the side the phone leans to", () => {
		close(tiltGravity(90, 30, 0, S), S / 2, S);
		close(tiltGravity(90, -30, 0, S), -S / 2, S);
	});

	it("pulls up when the phone is held upside down", () => {
		close(tiltGravity(-90, 0, 0, S), 0, -S);
	});

	it("follows the screen when it is turned to landscape", () => {
		close(tiltGravity(0, 90, 90, S), 0, -S);
		close(tiltGravity(90, 0, 90, S), S, 0);
	});
});
