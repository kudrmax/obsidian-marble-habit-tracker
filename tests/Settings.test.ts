import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings } from "../src/settings";

describe("loadSettings", () => {
	it("uses defaults for missing data", () => {
		expect(loadSettings(null)).toEqual({ folder: "Habits", redesignThreshold: 3, confetti: true });
		expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
	});

	it("keeps valid values", () => {
		expect(loadSettings({ folder: " Привычки ", redesignThreshold: 5, confetti: false })).toEqual({
			folder: "Привычки",
			redesignThreshold: 5,
			confetti: false,
		});
	});

	it("replaces invalid values with defaults", () => {
		expect(loadSettings({ folder: "  ", redesignThreshold: 0, confetti: "yes" })).toEqual(DEFAULT_SETTINGS);
		expect(loadSettings({ redesignThreshold: 2.5 }).redesignThreshold).toBe(3);
	});
});
