import { describe, expect, it } from "vitest";
import { TiltSensor, tiltGravity } from "../src/ui/jar/TiltSensor";

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
