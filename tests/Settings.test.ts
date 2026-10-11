import { describe, expect, it } from "vitest";
import { DEFAULT_PROPERTY_NAMES } from "../src/infrastructure/HabitCodec";
import { DEFAULT_SETTINGS, loadSettings, parseReasons } from "../src/settings";

describe("loadSettings", () => {
	it("uses defaults for missing data", () => {
		expect(loadSettings(null)).toEqual({
			source: "tag",
			tag: "marble-habit",
			folder: "Habits",
			habitBlock: true,
			properties: DEFAULT_PROPERTY_NAMES,
			labels: { anchor: "after I", tiny: "I will", full: "on a good day", celebration: "and celebrate", schedule: "every" },
			redesignThreshold: 3,
			missReasons: ["Forgot", "Anchor didn't happen", "No energy", "Felt too big"],
			shrinkReason: "Felt too big",
			material: "grain",
			marbleSizes: { small: 24, medium: 44, big: 68 },
			speed: 100,
			merge: { smallPerMedium: 7, mediumPerBig: 4 },
			dayStartHour: 5,
			hideDone: true,
			showWins: true,
			celebrationLine: true,
			reduceMotion: false,
			tilt: true,
			cursorPush: true,
			haptics: true,
		});
		expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
	});

	it("keeps valid values", () => {
		expect(
			loadSettings({
				source: "folder",
				tag: "#routine",
				folder: " Привычки ",
				habitBlock: false,
				properties: { doneTiny: " done ", missed: "" },
				labels: { anchor: " после того как ", tiny: "" },
				redesignThreshold: 5,
				missReasons: [" Ill ", "", "Ill", "Travel"],
				shrinkReason: "",
				material: "halftone",
				marbleSizes: { small: 20, medium: 48, big: 80 },
				speed: 150,
				merge: { smallPerMedium: 5, mediumPerBig: 3 },
				dayStartHour: 3,
				hideDone: false,
				showWins: false,
				celebrationLine: false,
				reduceMotion: true,
				tilt: false,
				cursorPush: false,
				haptics: false,
			}),
		).toEqual({
			source: "folder",
			tag: "routine",
			folder: "Привычки",
			habitBlock: false,
			properties: { ...DEFAULT_PROPERTY_NAMES, doneTiny: "done" },
			labels: { anchor: "после того как", tiny: "I will", full: "on a good day", celebration: "and celebrate", schedule: "every" },
			redesignThreshold: 5,
			missReasons: ["Ill", "Travel"],
			shrinkReason: "",
			material: "halftone",
			marbleSizes: { small: 20, medium: 48, big: 80 },
			speed: 150,
			merge: { smallPerMedium: 5, mediumPerBig: 3 },
			dayStartHour: 3,
			hideDone: false,
			showWins: false,
			celebrationLine: false,
			reduceMotion: true,
			tilt: false,
			cursorPush: false,
			haptics: false,
		});
	});

	it("replaces a day start hour outside midnight to noon with the default", () => {
		expect(loadSettings({ dayStartHour: 13 }).dayStartHour).toBe(5);
		expect(loadSettings({ dayStartHour: -1 }).dayStartHour).toBe(5);
		expect(loadSettings({ dayStartHour: 0 }).dayStartHour).toBe(0);
	});

	it("replaces a speed outside 50–200% with the default", () => {
		expect(loadSettings({ speed: 300 }).speed).toBe(100);
		expect(loadSettings({ speed: 40 }).speed).toBe(100);
		expect(loadSettings({ speed: 50 }).speed).toBe(50);
	});

	it("replaces marble sizes out of range or not whole with defaults", () => {
		expect(loadSettings({ marbleSizes: { small: 4, medium: 44.5, big: 72 } }).marbleSizes).toEqual({ small: 24, medium: 44, big: 72 });
		expect(loadSettings({ marbleSizes: "big" }).marbleSizes).toEqual({ small: 24, medium: 44, big: 68 });
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

	it("reads the old merge size as small marbles per medium", () => {
		expect(loadSettings({ mergeSize: 5 }).merge).toEqual({ smallPerMedium: 5, mediumPerBig: 4 });
	});

	it("keeps habits found by folder when the folder was saved before tags existed", () => {
		expect(loadSettings({ folder: "Habits" }).source).toBe("folder");
		expect(loadSettings({}).source).toBe("tag");
	});
});
