export interface HabitSettings {
	folder: string;
	redesignThreshold: number;
	confetti: boolean;
}

export const DEFAULT_SETTINGS: HabitSettings = { folder: "Habits", redesignThreshold: 3, confetti: true };

export function loadSettings(data: unknown): HabitSettings {
	const raw = (typeof data === "object" && data !== null ? data : {}) as Partial<Record<keyof HabitSettings, unknown>>;
	const threshold = raw.redesignThreshold;
	return {
		folder: typeof raw.folder === "string" && raw.folder.trim() ? raw.folder.trim() : DEFAULT_SETTINGS.folder,
		redesignThreshold:
			typeof threshold === "number" && Number.isInteger(threshold) && threshold >= 1 ? threshold : DEFAULT_SETTINGS.redesignThreshold,
		confetti: typeof raw.confetti === "boolean" ? raw.confetti : DEFAULT_SETTINGS.confetti,
	};
}
