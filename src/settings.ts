import { JarMaterial, isJarMaterial } from "./ui/jar/JarAssets";

export interface HabitSettings {
	folder: string;
	redesignThreshold: number;
	material: JarMaterial;
	celebrationLine: boolean;
	reduceMotion: boolean;
	tilt: boolean;
	bumpText: boolean;
	haptics: boolean;
}

export const DEFAULT_SETTINGS: HabitSettings = {
	folder: "Habits",
	redesignThreshold: 3,
	material: "grain",
	celebrationLine: true,
	reduceMotion: false,
	tilt: true,
	bumpText: true,
	haptics: true,
};

export function loadSettings(data: unknown): HabitSettings {
	const raw = (typeof data === "object" && data !== null ? data : {}) as Partial<Record<keyof HabitSettings, unknown>>;
	const threshold = raw.redesignThreshold;
	const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
	return {
		folder: typeof raw.folder === "string" && raw.folder.trim() ? raw.folder.trim() : DEFAULT_SETTINGS.folder,
		redesignThreshold:
			typeof threshold === "number" && Number.isInteger(threshold) && threshold >= 1 ? threshold : DEFAULT_SETTINGS.redesignThreshold,
		material: isJarMaterial(raw.material) ? raw.material : DEFAULT_SETTINGS.material,
		celebrationLine: flag(raw.celebrationLine, DEFAULT_SETTINGS.celebrationLine),
		reduceMotion: flag(raw.reduceMotion, DEFAULT_SETTINGS.reduceMotion),
		tilt: flag(raw.tilt, DEFAULT_SETTINGS.tilt),
		bumpText: flag(raw.bumpText, DEFAULT_SETTINGS.bumpText),
		haptics: flag(raw.haptics, DEFAULT_SETTINGS.haptics),
	};
}
