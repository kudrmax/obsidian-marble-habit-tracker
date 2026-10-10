import { DEFAULT_PROPERTY_NAMES, PropertyNames } from "./infrastructure/HabitCodec";
import { JarMaterial, isJarMaterial } from "./ui/jar/JarAssets";

export interface HabitSettings {
	folder: string;
	habitBlock: boolean;
	properties: PropertyNames;
	redesignThreshold: number;
	missReasons: string[];
	shrinkReason: string;
	material: JarMaterial;
	mergeSize: number;
	hideDone: boolean;
	showWins: boolean;
	celebrationLine: boolean;
	reduceMotion: boolean;
	tilt: boolean;
	haptics: boolean;
}

export const DEFAULT_SETTINGS: HabitSettings = {
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
		folder: text(raw.folder, DEFAULT_SETTINGS.folder),
		habitBlock: flag(raw.habitBlock, DEFAULT_SETTINGS.habitBlock),
		properties: loadProperties(raw.properties),
		redesignThreshold: integer(raw.redesignThreshold, 1, Number.MAX_SAFE_INTEGER, DEFAULT_SETTINGS.redesignThreshold),
		missReasons: loadReasons(raw.missReasons),
		shrinkReason: typeof raw.shrinkReason === "string" ? raw.shrinkReason.trim() : DEFAULT_SETTINGS.shrinkReason,
		material: isJarMaterial(raw.material) ? raw.material : DEFAULT_SETTINGS.material,
		mergeSize: integer(raw.mergeSize, MIN_MERGE, MAX_MERGE, DEFAULT_SETTINGS.mergeSize),
		hideDone: flag(raw.hideDone, DEFAULT_SETTINGS.hideDone),
		showWins: flag(raw.showWins, DEFAULT_SETTINGS.showWins),
		celebrationLine: flag(raw.celebrationLine, DEFAULT_SETTINGS.celebrationLine),
		reduceMotion: flag(raw.reduceMotion, DEFAULT_SETTINGS.reduceMotion),
		tilt: flag(raw.tilt, DEFAULT_SETTINGS.tilt),
		haptics: flag(raw.haptics, DEFAULT_SETTINGS.haptics),
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
