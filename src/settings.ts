import { DEFAULT_MERGE_RULE, MergeRule } from "./domain/Jar";
import { DEFAULT_PROPERTY_NAMES, PropertyNames } from "./infrastructure/HabitCodec";
import { DEFAULT_MARBLE_SIZES, JarMaterial, MAX_MARBLE, MIN_MARBLE, MarbleSizes, isJarMaterial } from "./ui/jar/JarAssets";

export type HabitSource = "tag" | "folder";

export interface HabitSettings {
	source: HabitSource;
	tag: string;
	folder: string;
	habitBlock: boolean;
	properties: PropertyNames;
	redesignThreshold: number;
	missReasons: string[];
	shrinkReason: string;
	material: JarMaterial;
	marbleSizes: MarbleSizes;
	merge: MergeRule;
	hideDone: boolean;
	showWins: boolean;
	celebrationLine: boolean;
	reduceMotion: boolean;
	tilt: boolean;
	haptics: boolean;
}

export const DEFAULT_SETTINGS: HabitSettings = {
	source: "tag",
	tag: "habit",
	folder: "Habits",
	habitBlock: true,
	properties: DEFAULT_PROPERTY_NAMES,
	redesignThreshold: 3,
	missReasons: ["Forgot", "Anchor didn't happen", "No energy", "Felt too big"],
	shrinkReason: "Felt too big",
	material: "grain",
	marbleSizes: DEFAULT_MARBLE_SIZES,
	merge: DEFAULT_MERGE_RULE,
	hideDone: true,
	showWins: true,
	celebrationLine: true,
	reduceMotion: false,
	tilt: true,
	haptics: true,
};

const MIN_MERGE = 2;
const MAX_MERGE = 30;

export function loadSettings(data: unknown): HabitSettings {
	const raw = (typeof data === "object" && data !== null ? data : {}) as Partial<Record<keyof HabitSettings, unknown>>;
	const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
	const integer = (value: unknown, min: number, max: number, fallback: number) =>
		typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
	const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value.trim() : fallback);
	return {
		source: loadSource(raw.source, raw.folder),
		tag: text(raw.tag, DEFAULT_SETTINGS.tag).replace(/^#/, ""),
		folder: text(raw.folder, DEFAULT_SETTINGS.folder),
		habitBlock: flag(raw.habitBlock, DEFAULT_SETTINGS.habitBlock),
		properties: loadProperties(raw.properties),
		redesignThreshold: integer(raw.redesignThreshold, 1, Number.MAX_SAFE_INTEGER, DEFAULT_SETTINGS.redesignThreshold),
		missReasons: loadReasons(raw.missReasons),
		shrinkReason: typeof raw.shrinkReason === "string" ? raw.shrinkReason.trim() : DEFAULT_SETTINGS.shrinkReason,
		material: isJarMaterial(raw.material) ? raw.material : DEFAULT_SETTINGS.material,
		marbleSizes: loadMarbleSizes(raw.marbleSizes),
		merge: loadMerge(raw.merge, (raw as Record<string, unknown>).mergeSize),
		hideDone: flag(raw.hideDone, DEFAULT_SETTINGS.hideDone),
		showWins: flag(raw.showWins, DEFAULT_SETTINGS.showWins),
		celebrationLine: flag(raw.celebrationLine, DEFAULT_SETTINGS.celebrationLine),
		reduceMotion: flag(raw.reduceMotion, DEFAULT_SETTINGS.reduceMotion),
		tilt: flag(raw.tilt, DEFAULT_SETTINGS.tilt),
		haptics: flag(raw.haptics, DEFAULT_SETTINGS.haptics),
	};
}

/** Before 1.8 habits were always found by folder: a saved folder keeps them where they are. */
function loadSource(value: unknown, folder: unknown): HabitSource {
	if (value === "tag" || value === "folder") return value;
	return typeof folder === "string" && folder.trim() ? "folder" : DEFAULT_SETTINGS.source;
}

function loadMarbleSizes(value: unknown): MarbleSizes {
	const raw = (typeof value === "object" && value !== null ? value : {}) as Partial<Record<keyof MarbleSizes, unknown>>;
	const size = (key: keyof MarbleSizes) => {
		const diameter = raw[key];
		return typeof diameter === "number" && Number.isInteger(diameter) && diameter >= MIN_MARBLE && diameter <= MAX_MARBLE ? diameter : DEFAULT_MARBLE_SIZES[key];
	};
	return { small: size("small"), medium: size("medium"), big: size("big") };
}

/** `mergeSize` is how 1.1–1.7 stored the small-to-medium count. */
function loadMerge(value: unknown, legacySmall: unknown): MergeRule {
	const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
	const count = (input: unknown, fallback: number) =>
		typeof input === "number" && Number.isInteger(input) && input >= MIN_MERGE && input <= MAX_MERGE ? input : fallback;
	return {
		smallPerMedium: count(raw.smallPerMedium, count(legacySmall, DEFAULT_MERGE_RULE.smallPerMedium)),
		mediumPerBig: count(raw.mediumPerBig, DEFAULT_MERGE_RULE.mediumPerBig),
	};
}

export function parseReasons(text: string): string[] {
	return [...new Set(text.split("\n").map((line) => line.trim()).filter(Boolean))];
}

function loadReasons(value: unknown): string[] {
	if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.missReasons];
	const reasons = parseReasons(value.filter((item): item is string => typeof item === "string").join("\n"));
	return reasons.length ? reasons : [...DEFAULT_SETTINGS.missReasons];
}

function loadProperties(value: unknown): PropertyNames {
	const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
	const entries = Object.entries(DEFAULT_PROPERTY_NAMES).map(([key, fallback]) => {
		const name = raw[key];
		return [key, typeof name === "string" && name.trim() ? name.trim() : fallback];
	});
	return Object.fromEntries(entries) as unknown as PropertyNames;
}
