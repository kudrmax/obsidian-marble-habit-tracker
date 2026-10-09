import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings } from "../src/settings";

describe("loadSettings", () => {
	it("uses defaults for missing data", () => {
		expect(loadSettings(null)).toEqual({
			folder: "Habits",
			redesignThreshold: 3,
			material: "grain",
			celebrationLine: true,
			reduceMotion: false,
		});
		expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
	});

	it("keeps valid values", () => {
		expect(
			loadSettings({ folder: " Привычки ", redesignThreshold: 5, material: "halftone", celebrationLine: false, reduceMotion: true }),
		).toEqual({ folder: "Привычки", redesignThreshold: 5, material: "halftone", celebrationLine: false, reduceMotion: true });
	});

	it("replaces invalid values with defaults", () => {
		expect(loadSettings({ folder: "  ", redesignThreshold: 0, material: "clay", celebrationLine: "yes", reduceMotion: 1 })).toEqual(
			DEFAULT_SETTINGS,
		);
		expect(loadSettings({ redesignThreshold: 2.5 }).redesignThreshold).toBe(3);
	});

	it("drops settings that no longer exist", () => {
		expect(loadSettings({ confetti: false })).toEqual(DEFAULT_SETTINGS);
	});
});
