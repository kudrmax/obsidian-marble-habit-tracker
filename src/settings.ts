import { DEFAULT_WIN_RULE, WinRule } from "./domain/DayMark";
import { DEFAULT_MERGE_RULE, MergeRule } from "./domain/Jar";
import { RedesignSettings } from "./domain/RedesignRule";
import { DEFAULT_PROPERTY_NAMES, LEGACY_PROPERTY_NAMES, PropertyNames } from "./infrastructure/HabitCodec";
import { DEFAULT_LABELS, LEGACY_LABELS, LabelSet } from "./ui/format";
import { DEFAULT_MARBLE_SIZES, JarMaterial, MAX_MARBLE, MIN_MARBLE, MarbleSizes, isJarMaterial } from "./ui/jar/JarAssets";

export type HabitSource = "tag" | "folder";

export interface HabitSettings {
	source: HabitSource;
	tag: string;
	/** Where new habits are saved, and in folder mode where habits are found; "/" is the vault root. */
	folder: string;
	habitBlock: boolean;
	properties: PropertyNames;
	/** What the parts of a recipe are called everywhere. */
	labels: LabelSet;
	/** Skips in a row after which Today says a habit needs a change. */
	redesignThreshold: number;
	/** A habit done on less than this percent of its recent days needs a change; 0 turns the rule off. */
	redesignShare: number;
	/** A habit done away from its trigger more often than at it needs a change. */
	redesignOffTrigger: boolean;
	missReasons: string[];
	material: JarMaterial;
	marbleSizes: MarbleSizes;
	/** How fast marbles move, in percent of the speed they were tuned at. */
	speed: number;
	/** How hard marbles fall, in px/s², with the screen upright. */
	gravity: number;
	/** How much of a hit's speed marbles keep as they bounce back, in percent. */
	bounce: number;
	merge: MergeRule;
	/** The hour a new day starts; marks made past midnight but before it count for the day before. */
	dayStartHour: number;
	/** How many days the week view shows, up to the shown day. */
	gridDays: number;
	hideDone: boolean;
	showWins: boolean;
	celebrationLine: boolean;
	reduceMotion: boolean;
	tilt: boolean;
	/** On a computer, the mouse pushes the marbles it passes through. */
	cursorPush: boolean;
	/** Habits may be marked as done without their trigger. */
	notAtTrigger: boolean;
	wins: WinRule;
	haptics: boolean;
}

export const DEFAULT_SETTINGS: HabitSettings = {
	source: "tag",
	tag: "marble-habit",
	folder: "Habits",
	habitBlock: true,
	properties: DEFAULT_PROPERTY_NAMES,
	labels: DEFAULT_LABELS,
	redesignThreshold: 3,
	redesignShare: 50,
	redesignOffTrigger: true,
	missReasons: ["Forgot", "Trigger didn't happen", "No energy", "Felt too big"],
	material: "grain",
	marbleSizes: DEFAULT_MARBLE_SIZES,
	speed: 100,
	gravity: 1000,
	bounce: 20,
	merge: DEFAULT_MERGE_RULE,
	dayStartHour: 5,
	gridDays: 5,
	hideDone: true,
	showWins: true,
	celebrationLine: true,
	reduceMotion: false,
	tilt: true,
	cursorPush: true,
	notAtTrigger: false,
	wins: DEFAULT_WIN_RULE,
	haptics: true,
};

/** How the marbles look and move on Today: tuned together, on the marbles themselves. */
export interface MarbleFeel {
	readonly sizes: MarbleSizes;
	/** Percent of the speed they were tuned at. */
	readonly speed: number;
	/** px/s² with the screen upright. */
	readonly gravity: number;
	/** Percent of a hit's speed kept on the bounce. */
	readonly bounce: number;
}

export function marbleFeel(settings: HabitSettings): MarbleFeel {
	return { sizes: settings.marbleSizes, speed: settings.speed, gravity: settings.gravity, bounce: settings.bounce };
}

/** When Today says a habit needs a change, from the settings. */
export function redesignSettings(settings: HabitSettings): RedesignSettings {
	return { skipsInARow: settings.redesignThreshold, lowShare: settings.redesignShare, offTrigger: settings.redesignOffTrigger };
}

export const MAX_DAY_START = 12;
export const MIN_GRID_DAYS = 3;
export const MAX_GRID_DAYS = 7;
export const MIN_SPEED = 10;
export const MAX_SPEED = 400;
export const MIN_GRAVITY = 100;
export const MAX_GRAVITY = 7000;
export const MIN_BOUNCE = 0;
/** A perfectly elastic marble: it keeps all its speed, and with nothing in the air to slow it, bounces for ever. */
export const MAX_BOUNCE = 100;
/** A share of days, in percent. */
export const MAX_SHARE = 100;
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
		properties: loadProperties(raw.properties, data === null || data === undefined ? DEFAULT_PROPERTY_NAMES : LEGACY_PROPERTY_NAMES),
		labels: loadLabels(raw.labels),
		redesignThreshold: integer(raw.redesignThreshold, 1, Number.MAX_SAFE_INTEGER, DEFAULT_SETTINGS.redesignThreshold),
		redesignShare: integer(raw.redesignShare, 0, MAX_SHARE, DEFAULT_SETTINGS.redesignShare),
		redesignOffTrigger: flag(raw.redesignOffTrigger, DEFAULT_SETTINGS.redesignOffTrigger),
		missReasons: loadReasons(raw.missReasons),
		material: isJarMaterial(raw.material) ? raw.material : DEFAULT_SETTINGS.material,
		marbleSizes: loadMarbleSizes(raw.marbleSizes),
		speed: integer(raw.speed, MIN_SPEED, MAX_SPEED, DEFAULT_SETTINGS.speed),
		gravity: integer(raw.gravity, MIN_GRAVITY, MAX_GRAVITY, DEFAULT_SETTINGS.gravity),
		bounce: integer(raw.bounce, MIN_BOUNCE, MAX_BOUNCE, DEFAULT_SETTINGS.bounce),
		merge: loadMerge(raw.merge, (raw as Record<string, unknown>).mergeSize),
		dayStartHour: integer(raw.dayStartHour, 0, MAX_DAY_START, DEFAULT_SETTINGS.dayStartHour),
		gridDays: integer(raw.gridDays, MIN_GRID_DAYS, MAX_GRID_DAYS, DEFAULT_SETTINGS.gridDays),
		hideDone: flag(raw.hideDone, DEFAULT_SETTINGS.hideDone),
		showWins: flag(raw.showWins, DEFAULT_SETTINGS.showWins),
		celebrationLine: flag(raw.celebrationLine, DEFAULT_SETTINGS.celebrationLine),
		reduceMotion: flag(raw.reduceMotion, DEFAULT_SETTINGS.reduceMotion),
		tilt: flag(raw.tilt, DEFAULT_SETTINGS.tilt),
		cursorPush: flag(raw.cursorPush, DEFAULT_SETTINGS.cursorPush),
		notAtTrigger: flag(raw.notAtTrigger, DEFAULT_SETTINGS.notAtTrigger),
		wins: loadWins(raw.wins),
		haptics: flag(raw.haptics, DEFAULT_SETTINGS.haptics),
	};
}

/** Before 1.8 habits were always found by folder: a saved folder keeps them where they are. */
function loadSource(value: unknown, folder: unknown): HabitSource {
	if (value === "tag" || value === "folder") return value;
	return typeof folder === "string" && folder.trim() ? "folder" : DEFAULT_SETTINGS.source;
}

function loadLabels(value: unknown): LabelSet {
	const raw = (typeof value === "object" && value !== null ? value : {}) as Partial<Record<keyof LabelSet, unknown>>;
	const label = (part: keyof LabelSet) => {
		const text = raw[part];
		if (typeof text !== "string" || !text.trim() || text.trim().toLowerCase() === LEGACY_LABELS[part].toLowerCase()) return DEFAULT_LABELS[part];
		return text.trim();
	};
	return { anchor: label("anchor"), tiny: label("tiny"), full: label("full"), celebration: label("celebration"), schedule: label("schedule") };
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

function loadWins(value: unknown): WinRule {
	const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
	return { offTrigger: typeof raw.offTrigger === "boolean" ? raw.offTrigger : DEFAULT_WIN_RULE.offTrigger };
}

export function parseReasons(text: string): string[] {
	return [...new Set(text.split("\n").map((line) => line.trim()).filter(Boolean))];
}

/** The default reason from before the anchor was called the trigger. */
const LEGACY_ANCHOR_REASON = "Anchor didn't happen";
const TRIGGER_REASON = "Trigger didn't happen";

function loadReasons(value: unknown): string[] {
	if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.missReasons];
	const reasons = parseReasons(
		value
			.filter((item): item is string => typeof item === "string")
			.map((reason) => (reason === LEGACY_ANCHOR_REASON ? TRIGGER_REASON : reason))
			.join("\n"),
	);
	return reasons.length ? reasons : [...DEFAULT_SETTINGS.missReasons];
}

/** A fresh install gets the current names; an older one keeps the names its notes were written with. */
function loadProperties(value: unknown, fallbacks: PropertyNames): PropertyNames {
	const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
	const entries = Object.entries<string>({ ...fallbacks }).map(([key, fallback]): [string, string] => {
		const name = raw[key];
		return [key, typeof name === "string" && name.trim() ? name.trim() : fallback];
	});
	return Object.fromEntries(entries) as unknown as PropertyNames;
}
