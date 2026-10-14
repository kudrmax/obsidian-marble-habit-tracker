import { describe, expect, it } from "vitest";
import { DEFAULT_PROPERTY_NAMES, LEGACY_PROPERTY_NAMES } from "../src/infrastructure/HabitCodec";
import { DEFAULT_SETTINGS, loadSettings, parseReasons } from "../src/settings";

describe("loadSettings", () => {
	it("uses defaults for missing data", () => {
		expect(loadSettings(null)).toEqual({
			source: "tag",
			tag: "marble-habit",
			folder: "Habits",
			habitBlock: true,
			properties: DEFAULT_PROPERTY_NAMES,
			labels: { anchor: "trigger", tiny: "tiny action", full: "action", celebration: "celebration", schedule: "days" },
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
			notAtTrigger: false,
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
				notAtTrigger: true,
				haptics: false,
			}),
		).toEqual({
			source: "folder",
			tag: "routine",
			folder: "Привычки",
			habitBlock: false,
			properties: { ...LEGACY_PROPERTY_NAMES, doneTiny: "done" },
			labels: { anchor: "после того как", tiny: "tiny action", full: "action", celebration: "celebration", schedule: "days" },
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
			notAtTrigger: true,
			haptics: false,
		});
	});

	it("gives a fresh install the current property names and keeps the old ones for an earlier install", () => {
		expect(loadSettings(null).properties).toEqual(DEFAULT_PROPERTY_NAMES);
		expect(DEFAULT_PROPERTY_NAMES).toMatchObject({ anchor: "trigger", tiny: "action_tiny", full: "action" });
		expect(loadSettings({ speed: 100 }).properties).toEqual(LEGACY_PROPERTY_NAMES);
		expect(LEGACY_PROPERTY_NAMES).toMatchObject({ anchor: "anchor", tiny: "tiny", full: "full" });
	});

	it("renames labels still equal to the old recipe sentence, keeping ones the user wrote", () => {
		const labels = loadSettings({ labels: { anchor: "After I", tiny: "I will", full: "в хороший день", celebration: "and celebrate", schedule: "every" } }).labels;
		expect(labels).toEqual({ anchor: "trigger", tiny: "tiny action", full: "в хороший день", celebration: "celebration", schedule: "days" });
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
			{ ...DEFAULT_SETTINGS, properties: LEGACY_PROPERTY_NAMES },
		);
		expect(loadSettings({ redesignThreshold: 2.5 }).redesignThreshold).toBe(3);
	});

	it("drops settings that no longer exist", () => {
		expect(loadSettings({ confetti: false })).toEqual({ ...DEFAULT_SETTINGS, properties: LEGACY_PROPERTY_NAMES });
	});

	it("reads reasons one per line without blanks or repeats", () => {
		expect(parseReasons(" Forgot \n\nNo energy\nForgot")).toEqual(["Forgot", "No energy"]);
	});

	it("reads the old merge size as small marbles per medium", () => {
		expect(loadSettings({ mergeSize: 5 }).merge).toEqual({ smallPerMedium: 5, mediumPerBig: 4 });
	});

	it("keeps the vault root as a folder", () => {
		expect(loadSettings({ folder: "/" }).folder).toBe("/");
	});

	it("keeps habits found by folder when the folder was saved before tags existed", () => {
		expect(loadSettings({ folder: "Habits" }).source).toBe("folder");
		expect(loadSettings({}).source).toBe("tag");
	});
});
