import { describe, expect, it } from "vitest";
import { DEFAULT_PROPERTY_NAMES } from "../src/infrastructure/HabitCodec";
import { DEFAULT_SETTINGS, loadSettings, parseReasons } from "../src/settings";

describe("loadSettings", () => {
	it("uses defaults for missing data", () => {
		expect(loadSettings(null)).toEqual({
			folder: "Habits",
			habitBlock: true,
			properties: DEFAULT_PROPERTY_NAMES,
			redesignThreshold: 3,
			missReasons: ["Forgot", "Anchor didn't happen", "No energy", "Felt too big"],
			shrinkReason: "Felt too big",
			material: "grain",
			mergeSize: 7,
			hideDone: true,
			showWins: true,
			celebrationLine: true,
			reduceMotion: false,
			tilt: true,
			haptics: true,
		});
		expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
	});

	it("keeps valid values", () => {
		expect(
			loadSettings({
				folder: " Привычки ",
				habitBlock: false,
				properties: { doneTiny: " done ", missed: "" },
				redesignThreshold: 5,
				missReasons: [" Ill ", "", "Ill", "Travel"],
				shrinkReason: "",
				material: "halftone",
				mergeSize: 5,
				hideDone: false,
				showWins: false,
				celebrationLine: false,
				reduceMotion: true,
				tilt: false,
				haptics: false,
			}),
		).toEqual({
			folder: "Привычки",
			habitBlock: false,
			properties: { ...DEFAULT_PROPERTY_NAMES, doneTiny: "done" },
			redesignThreshold: 5,
			missReasons: ["Ill", "Travel"],
			shrinkReason: "",
			material: "halftone",
			mergeSize: 5,
			hideDone: false,
			showWins: false,
			celebrationLine: false,
			reduceMotion: true,
			tilt: false,
			haptics: false,
		});
	});

	it("replaces invalid values with defaults", () => {
		expect(loadSettings({ folder: "  ", redesignThreshold: 0, material: "clay", celebrationLine: "yes", reduceMotion: 1, tilt: "on", haptics: null, mergeSize: 1, missReasons: "Forgot", hideDone: "no" })).toEqual(
			DEFAULT_SETTINGS,
		);
		expect(loadSettings({ redesignThreshold: 2.5 }).redesignThreshold).toBe(3);
	});

	it("drops settings that no longer exist", () => {
		expect(loadSettings({ confetti: false })).toEqual(DEFAULT_SETTINGS);
	});

	it("reads reasons one per line without blanks or repeats", () => {
		expect(parseReasons(" Forgot \n\nNo energy\nForgot")).toEqual(["Forgot", "No energy"]);
	});
});
