import { describe, expect, it } from "vitest";
import { IN_HAND, TiltSensor, tiltGravity } from "../src/ui/jar/TiltSensor";

const S = 0.45;
const R = Math.PI / 180;
const close = (point: { x: number; y: number }, x: number, y: number) => {
	expect(point.x).toBeCloseTo(x, 3);
	expect(point.y).toBeCloseTo(y, 3);
};

describe("IN_HAND", () => {
	it("pulls straight down as hard as a phone held at a reading angle, gentler than upright", () => {
		expect(IN_HAND.x).toBeCloseTo(0, 5);
		expect(IN_HAND.y).toBeCloseTo(tiltGravity(40, 0, 0).y, 5);
		expect(IN_HAND.y).toBeLessThan(tiltGravity(90, 0, 0).y);
	});
});

describe("tiltGravity", () => {
	it("pulls straight down when the phone stands upright", () => {
		close(tiltGravity(90, 0, 0, S), 0, S);
	});

	it("does not pull when the phone lies flat", () => {
		close(tiltGravity(0, 0, 0, S), 0, 0);
	});

	it("rolls to the side the phone leans to", () => {
		close(tiltGravity(40, 30, 0, S), Math.cos(40 * R) * 0.5 * S, Math.sin(40 * R) * S);
		close(tiltGravity(40, -30, 0, S), -Math.cos(40 * R) * 0.5 * S, Math.sin(40 * R) * S);
	});

	it("rolls sideways when the phone stands upright and leans like a steering wheel", () => {
		close(tiltGravity(60, 90, 0, S), S / 2, Math.sin(60 * R) * S);
	});

	it("does not roll sideways when an upright phone only turns about its own long side", () => {
		close(tiltGravity(90, 30, 0, S), 0, S);
	});

	it("rolls to the lower edge when the phone is held face down above you", () => {
		close(tiltGravity(180, 30, 0, S), -S / 2, 0);
		close(tiltGravity(-180, -30, 0, S), S / 2, 0);
		close(tiltGravity(150, 0, 0, S), 0, S / 2);
	});

	it("does not jump when the phone turns over past face down", () => {
		const before = tiltGravity(179.9, 20, 0, S);
		const after = tiltGravity(-179.9, 20, 0, S);
		expect(Math.hypot(before.x - after.x, before.y - after.y)).toBeLessThan(0.002);
	});

	it("never pulls harder than the ground does", () => {
		for (let beta = -180; beta <= 180; beta += 15) {
			for (let gamma = -90; gamma <= 90; gamma += 15) {
				const pull = tiltGravity(beta, gamma, 0, S);
				expect(Math.hypot(pull.x, pull.y)).toBeLessThanOrEqual(S + 1e-9);
			}
		}
	});

	it("pulls up when the phone is held upside down", () => {
		close(tiltGravity(-90, 0, 0, S), 0, -S);
	});

	it("follows the screen when it is turned to landscape", () => {
		close(tiltGravity(0, 90, 90, S), 0, -S);
		close(tiltGravity(90, 0, 90, S), S, 0);
	});
});

describe("TiltSensor permission", () => {
	it("asks iOS silently once, however often the screen refreshes", async () => {
		let asks = 0;
		const listeners: string[] = [];
		const fakeWindow = {
			DeviceOrientationEvent: { requestPermission: async () => (asks++, "granted" as const) },
			addEventListener: (type: string) => listeners.push(type),
			removeEventListener: () => undefined,
			screen: { orientation: { angle: 0 } },
		};
		const realWindow = (globalThis as { window?: unknown }).window;
		(globalThis as { window?: unknown }).window = fakeWindow;
		try {
			const sensor = new TiltSensor(() => undefined);
			for (let refresh = 0; refresh < 5; refresh++) await sensor.askSilently();
			await sensor.askOnTap();
			expect(asks).toBe(1);
			expect(listeners).toEqual(["deviceorientation"]);
		} finally {
			(globalThis as { window?: unknown }).window = realWindow;
		}
	});

	it("still asks on the first tap on a new device, where the silent ask needs a gesture", async () => {
		let asks = 0;
		const listeners: string[] = [];
		const fakeWindow = {
			DeviceOrientationEvent: {
				requestPermission: async () => {
					asks++;
					if (asks === 1) throw new Error("requires a user gesture");
					return "granted" as const;
				},
			},
			addEventListener: (type: string) => listeners.push(type),
			removeEventListener: () => undefined,
			screen: { orientation: { angle: 0 } },
		};
		const realWindow = (globalThis as { window?: unknown }).window;
		(globalThis as { window?: unknown }).window = fakeWindow;
		try {
			const sensor = new TiltSensor(() => undefined);
			await sensor.askSilently();
			await sensor.askSilently();
			expect(listeners).toEqual([]);
			await sensor.askOnTap();
			expect(asks).toBe(2);
			expect(listeners).toEqual(["deviceorientation"]);
		} finally {
			(globalThis as { window?: unknown }).window = realWindow;
		}
	});
});
